#!/usr/bin/env python3
"""Private, dependency-free API for the Lesson Studio prototype.

Run locally with `python3 server.py` (localhost only). For the Arena preview,
set HOST=0.0.0.0 before launching. Do not use the preview server for sensitive data.
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("LESSON_STUDIO_DATA", ROOT / "data")).expanduser().resolve()
DB_PATH = DATA_DIR / "lessons.sqlite3"
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8000"))
MAX_BODY = 512 * 1024
MAX_NOTES = 100_000


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def display_date(value: str) -> str:
    """Format a readable date portably on Windows and Unix."""
    date = datetime.fromisoformat(value).astimezone()
    return f"{date.day} {date.strftime('%b')}"


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("""CREATE TABLE IF NOT EXISTS lessons (
        id TEXT PRIMARY KEY, topic TEXT NOT NULL, program TEXT NOT NULL,
        branch TEXT NOT NULL DEFAULT '', subject TEXT NOT NULL DEFAULT '',
        module TEXT NOT NULL DEFAULT '', source TEXT NOT NULL,
        slides_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )""")
    db.commit()
    return db


@contextmanager
def db_session():
    db = connect()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def clean(value, limit=4000) -> str:
    if not isinstance(value, str):
        return ""
    return value.strip()[:limit]


def split_sections(text: str) -> dict[str, list[str]]:
    sections = {k: [] for k in ("concept", "formula", "example", "trick", "steps", "other")}
    labels = {
        "concept": re.compile(r"^(?:concept|explanation|overview|definition|meaning)\s*:?\s*", re.I),
        "formula": re.compile(r"^(?:formula|equation|key terms?|important terms?)\s*:?\s*", re.I),
        "example": re.compile(r"^(?:worked example|example|application|problem)\s*:?\s*", re.I),
        "trick": re.compile(r"^(?:trick|shortcut|memory trick|mnemonic|tips?)\s*:?\s*", re.I),
        "steps": re.compile(r"^(?:steps?|process|procedure|how it works)\s*:?\s*", re.I),
    }
    active = "other"
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        for name, pattern in labels.items():
            if pattern.match(line):
                active = name
                line = pattern.sub("", line).strip()
                break
        if line:
            sections[active].append(line)
    return sections


def sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", re.sub(r"\s+", " ", text.strip())) if s.strip()]


def summary(parts: list[str], count=3) -> str:
    return " ".join(sentences(" ".join(parts))[:count]).strip()


def create_slides(payload: dict) -> list[dict]:
    topic = clean(payload.get("topic"), 180)
    program = clean(payload.get("program"), 80) or "Other degree program"
    branch = clean(payload.get("branch"), 120)
    subject = clean(payload.get("subject"), 180)
    module = clean(payload.get("module"), 180)
    notes = clean(payload.get("source"), MAX_NOTES)
    parts = split_sections(notes)
    concept_source = parts["concept"] or parts["other"] or parts["steps"]
    concept = summary(concept_source, 3) or notes[:420]
    sentence_list = sentences(notes)
    step_source = parts["steps"] or sentence_list[1:5]
    formula = summary(parts["formula"], 5) or "No formula or key terms were supplied in the source notes."
    example = summary(parts["example"], 5) or "No worked example was supplied in the source notes."
    trick = summary(parts["trick"], 4) or "No shortcut or memory cue was supplied in the source notes."
    recap = summary(parts["concept"] + parts["formula"] + parts["trick"] + parts["other"], 2) or concept
    course_label = program + (f" · {branch}" if branch else "")
    context = "  ·  ".join(x for x in (subject, module) if x) or "A focused concept lesson"
    return [
        {"kind": "intro", "kicker": course_label, "title": topic, "body": context, "steps": []},
        {"kind": "concept", "kicker": "THE CORE IDEA", "title": "Start with the main idea", "body": concept, "steps": []},
        {"kind": "steps", "kicker": "BREAK IT DOWN", "title": "How it works", "body": "Follow the explanation one step at a time.", "steps": step_source[:4]},
        {"kind": "formula", "kicker": "FORMULA & KEY TERMS", "title": "Keep this close", "body": formula, "steps": []},
        {"kind": "example", "kicker": "APPLY THE IDEA", "title": "A worked example", "body": example, "steps": []},
        {"kind": "trick", "kicker": "REMEMBER IT", "title": "Shortcut or memory cue", "body": trick, "steps": []},
        {"kind": "recap", "kicker": "QUICK RECAP", "title": "What to remember", "body": recap, "steps": []},
    ]


def serialize(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"], "topic": row["topic"], "program": row["program"],
        "branch": row["branch"], "subject": row["subject"], "module": row["module"],
        "source": row["source"], "slides": json.loads(row["slides_json"]),
        "createdAt": row["created_at"], "updatedAt": row["updated_at"],
        "date": display_date(row["created_at"]),
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "LessonStudio/0.1"

    def log_message(self, fmt, *args):
        # Avoid logging pasted source text; only request path/status are logged.
        print(f"{self.client_address[0]} - {fmt % args}")

    def send_json(self, status: int, value):
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ValueError("Invalid request length")
        if size < 1 or size > MAX_BODY:
            raise ValueError("Request must be between 1 byte and 512 KB")
        try:
            data = json.loads(self.rfile.read(size))
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise ValueError("Request body must be valid JSON")
        if not isinstance(data, dict):
            raise ValueError("JSON object required")
        return data

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/health":
            self.send_json(200, {"ok": True, "service": "lesson-studio", "storage": "sqlite"})
            return
        if path == "/api/lessons":
            with db_session() as db:
                rows = db.execute("SELECT * FROM lessons ORDER BY created_at DESC").fetchall()
            self.send_json(200, [serialize(row) for row in rows])
            return
        if path.startswith("/api/"):
            self.send_json(404, {"error": "API route not found"})
            return
        assets = {"/": "index.html", "/index.html": "index.html", "/app.js": "app.js"}
        if path not in assets:
            self.send_error(404)
            return
        file_path = ROOT / assets[path]
        if not file_path.is_file():
            self.send_error(404)
            return
        content = file_path.read_bytes()
        content_type = {".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8"}.get(file_path.suffix, "application/octet-stream")
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(content)

    def do_POST(self):
        if urlparse(self.path).path != "/api/lessons":
            self.send_json(404, {"error": "API route not found"})
            return
        try:
            data = self.read_json()
            topic = clean(data.get("topic"), 180)
            raw_source = data.get("source", "")
            if not isinstance(raw_source, str):
                self.send_json(400, {"error": "Source notes must be plain text"})
                return
            if len(raw_source) > MAX_NOTES:
                self.send_json(413, {"error": "Notes are too long (100,000 character limit)"})
                return
            source = clean(raw_source, MAX_NOTES)
            if not topic:
                self.send_json(400, {"error": "Topic is required"})
                return
            if len(source) < 20:
                self.send_json(400, {"error": "Paste at least a few sentences of source notes"})
                return
            lesson_id = uuid.uuid4().hex
            now = utc_now()
            record = {
                "id": lesson_id, "topic": topic,
                "program": clean(data.get("program"), 80) or "Other degree program",
                "branch": clean(data.get("branch"), 120), "subject": clean(data.get("subject"), 180),
                "module": clean(data.get("module"), 180), "source": source,
            }
            slides = create_slides(record)
            with db_session() as db:
                db.execute("INSERT INTO lessons VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (
                    lesson_id, record["topic"], record["program"], record["branch"],
                    record["subject"], record["module"], source,
                    json.dumps(slides, ensure_ascii=False), now, now,
                ))
            self.send_json(201, {**record, "slides": slides, "createdAt": now, "updatedAt": now,
                                 "date": display_date(now)})
        except ValueError as exc:
            self.send_json(400, {"error": str(exc)})
        except Exception as exc:
            print(f"create lesson failed: {type(exc).__name__}")
            self.send_json(500, {"error": "Could not create lesson"})

    def do_PUT(self):
        match = re.fullmatch(r"/api/lessons/([a-f0-9]{32})", urlparse(self.path).path)
        if not match:
            self.send_json(404, {"error": "API route not found"})
            return
        try:
            data = self.read_json()
            lesson_id = match.group(1)
            with db_session() as db:
                row = db.execute("SELECT * FROM lessons WHERE id=?", (lesson_id,)).fetchone()
                if row is None:
                    self.send_json(404, {"error": "Lesson not found"})
                    return
                slides = data.get("slides", json.loads(row["slides_json"]))
                if not isinstance(slides, list) or not 1 <= len(slides) <= 20:
                    self.send_json(400, {"error": "Slides must be a list of 1 to 20 items"})
                    return
                # Accept only the slide fields used by the renderer; cap user-controlled strings.
                safe_slides = []
                for item in slides:
                    if not isinstance(item, dict):
                        raise ValueError("Invalid slide object")
                    safe_slides.append({
                        "kind": clean(item.get("kind"), 30), "kicker": clean(item.get("kicker"), 120),
                        "title": clean(item.get("title"), 300), "body": clean(item.get("body"), 8000),
                        "steps": [clean(step, 2000) for step in item.get("steps", [])[:10]]
                                 if isinstance(item.get("steps", []), list) else [],
                    })
                now = utc_now()
                db.execute("UPDATE lessons SET slides_json=?, updated_at=? WHERE id=?",
                           (json.dumps(safe_slides, ensure_ascii=False), now, lesson_id))
                updated = db.execute("SELECT * FROM lessons WHERE id=?", (lesson_id,)).fetchone()
            self.send_json(200, serialize(updated))
        except ValueError as exc:
            self.send_json(400, {"error": str(exc)})
        except Exception as exc:
            print(f"update lesson failed: {type(exc).__name__}")
            self.send_json(500, {"error": "Could not save lesson"})

    def do_DELETE(self):
        match = re.fullmatch(r"/api/lessons/([a-f0-9]{32})", urlparse(self.path).path)
        if not match:
            self.send_json(404, {"error": "API route not found"})
            return
        with db_session() as db:
            cursor = db.execute("DELETE FROM lessons WHERE id=?", (match.group(1),))
        if cursor.rowcount:
            self.send_json(200, {"deleted": True})
        else:
            self.send_json(404, {"error": "Lesson not found"})


def main():
    connect().close()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Lesson Studio API ready at http://{HOST}:{PORT}")
    print(f"SQLite database: {DB_PATH}")
    server.serve_forever()


if __name__ == "__main__":
    main()

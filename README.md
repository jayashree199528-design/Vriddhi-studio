# Lesson Studio — private academic explainer builder

A local-first, text-first tool for turning prepared college course notes into a consistent lesson slide deck. Intended for private internal testing before considering a public service.

## Run locally

Requirements: Python 3.10+; no third-party Python packages required.

```bash
python3 server.py
```

Open http://127.0.0.1:8000. By default the backend binds to localhost only. SQLite data is stored in `data/lessons.sqlite3` and survives browser restarts. To store it elsewhere, set `LESSON_STUDIO_DATA` to a directory path.

## Current functionality

- Inputs: program, branch/specialization, subject, module, topic, and pasted notes.
- Backend endpoint turns notes into a fixed seven-slide sequence: title, core idea, steps, formula/key terms, worked example, shortcut/memory cue, recap.
- Optional note labels include `CONCEPT:`, `STEPS:`, `FORMULA:`, `WORKED EXAMPLE:`, and `TRICK:`.
- Edit slide titles and text, navigate/auto-play animated slides, and use browser speech synthesis to read the current slide aloud.
- Create and retrieve lessons through a same-origin JSON API; SQLite persists lessons and slide edits.
- The backend does not require AI provider keys, call an external service, or send notes off this machine.

## Important limits

This is a private prototype, not a production-secure multi-user service. There is no login, authorization, remote backup, AI fact-checking, generated audio file, downloadable PowerPoint, or MP4 export. It uses CSS slide transitions and local browser text-to-speech. The parser organizes supplied text; it does not invent missing formulas/examples or validate academic correctness. Review every slide before teaching from it.

Do not expose the server on a public network or use sensitive/student-identifiable content until authentication, authorization, encryption/backup, deletion, and deployment security are implemented. `server.py` defaults to localhost for this reason.

## API

- `GET /api/health` — health check.
- `GET /api/lessons` — list saved lessons.
- `POST /api/lessons` — validate lesson input, create the fixed slide sequence, and save to SQLite.
- `PUT /api/lessons/{32-character-id}` — persist slide text edits.
- `DELETE /api/lessons/{32-character-id}` — delete a lesson.

## GitHub CI and pull requests

A GitHub Actions workflow is included at `.github/workflows/ci.yml`. It runs the Python unit tests and syntax checks for Python and JavaScript on pushes to `main` and pull requests targeting `main`. A PR template is included at `.github/pull_request_template.md`.

Suggested workflow: create a feature branch, make a change, push it, open a pull request into `main`, wait for the `CI / tests` check, review, and merge. In GitHub repository Settings → Rules, protect `main` and require a pull request and the `CI / tests` status check. The check must run once before GitHub will offer it as a required check.

## Firebase hosting plan and deployment blocker

The frontend can be served by Firebase Hosting. This app also has a Python API, so Firebase Hosting alone will not run the API. A future Firebase setup should route `/api/**` from Hosting to a Cloud Run backend. Before deploying the backend, replace local SQLite with Firestore or Cloud SQL and add authentication/authorization. Cloud Run's writable container filesystem is ephemeral; data written there does not survive instance shutdowns.

Do not add a Firebase deployment workflow yet: deploying the current unauthenticated, SQLite-backed API would risk exposing lessons and losing stored data. Firebase Hosting can create temporary PR preview channels after the backend routing and access controls are ready.

Keep service-account JSON files out of Git. Store a narrowly scoped deploy identity as a GitHub Actions secret if using a key; Workload Identity Federation is preferable because it avoids a long-lived JSON key. Never paste the key into chat or application source.

## Next steps after internal testing

1. Confirm the seven slide roles and visual template fit your B.Com/B.Sc/BBA/BA and engineering lessons.
2. Add test cases with real formulas, numbered procedures, and long worked examples; improve preservation and formatting.
3. Add optional server-side narration generation behind a provider adapter; keep API keys in environment/secrets, never in browser code.
4. Add captions, timing controls, and MP4 rendering with a background job only after slide pacing and voice quality are approved.
5. Add sign-in and stronger data controls before inviting any external users.

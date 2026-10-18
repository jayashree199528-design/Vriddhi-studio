# Vriddhi Studio — internal animated-lesson prototype

This standalone prototype is Phase 1 of the internal authoring workflow. It lets approved content staff turn prepared college-course notes into a seven-scene lesson and animated explainer, then share drafts for independent review. It is not yet integrated with the separate Vriddhi Prep Studio catalogue (`vriddhi-engineering`), and it has no B2C/customer publishing module. Gemini may simplify explanations and propose a storyboard; the browser draws animation from safe, built-in vector scenes.

## Run locally

Requirements: Python 3.10+ and internet access for Firebase Web SDK scripts.

```powershell
py server.py
```

Open http://127.0.0.1:8000. The app requires Firebase email/password sign-in and an internal role. New team drafts are stored in the shared `internalLessons` collection; the older `/users/{uid}/lessons` path remains available for private legacy drafts. The local `data/lessons.sqlite3` API remains for backend tests and is not used by the browser lesson workspace.

The shared review queue needs the Firebase callable functions and Firestore rules deployed. Gemini generation additionally needs its server-side secret. Hosting preview-channel deployment alone does not deploy callable functions; without them, the editor can still show older private drafts but cannot create or review shared ones.

## Firebase setup in this project

- Firebase project ID: `vriddhi-studio`.
- Firebase Web config: `firebase-config.js`. This is public client config, not a service-account credential. Firebase Auth and Firestore rules enforce access.
- Email/Password sign-in is enabled. There is no public registration form; create approved accounts through Firebase Authentication.
- Firestore database uses Production mode in `asia-south1`.
- `firestore.rules` gives shared-draft read access only to authenticated users with an admin-created `/allowedUsers/{uid}` role of `author`, `reviewer`, or `owner`. Browser writes to `/internalLessons/{lessonId}` are denied; callable functions perform all draft and workflow writes.
- Older private drafts under `/users/{uid}/lessons/{lessonId}` remain readable and writable only by that signed-in UID after allow-list approval.
- Firebase Functions uses the Node.js 22 runtime in `asia-south1`. Every callable verifies the signed-in user and the role stored in the private allow-list.

### Add an internal team member

1. In Firebase Console → Authentication → Users, create the internal user's email/password account.
2. Copy that user's UID.
3. In Firestore, create `allowedUsers/{uid}` with exactly one of these roles: `author`, `reviewer`, or `owner`.
   - `author`: create/edit owned drafts and submit them for review.
   - `reviewer`: read shared drafts and approve or request changes on another author's submission.
   - `owner`: author and review other people's drafts; self-review is still blocked.
4. Deploy `firestore.rules` before enabling the shared queue.

Never commit a service-account JSON key or provider API key. The Web SDK config is intended to be in the browser; a private key is not. For GitHub deploys, use a narrowly scoped secret or preferably Workload Identity Federation.

## Internal authoring and review

1. An `author` or `owner` enters the course context and prepared source notes, then chooses **Arrange into lesson slides**. `createInternalLesson` stores a shared draft in `/internalLessons/{lessonId}`.
2. The author may check the consent box and choose **Create animated explanation**. The authenticated callable sends the bounded course context and notes to Gemini; consent is required for every generation.
3. Gemini returns plain-language explanations, narration, visual labels and review notes in the fixed sequence: title, core idea, steps, formula/key terms, worked example, memory cue and recap. The author can edit the script and scenes before submitting.
4. The author submits the draft for review. A different `reviewer` or `owner` may approve it internally or request changes with a note. The author cannot approve their own work. All role and status checks are enforced by callable functions, not just by hidden UI controls.
5. Internal approval does **not** publish the lesson to customers. The B2C viewer and integration with the central Prep Studio catalogue are intentionally deferred. Team members can play the animated scenes with browser speech or download a captioned WebM.

The browser renders labels through built-in canvas vector scenes. No model-generated HTML, SVG, CSS, or executable code is run. AI may add general explanatory context or an illustrative example when notes are sparse, but must not invent citations, statistics, precise formulas or unsupported course-specific facts. Review every explanation, formula and example against the source. The WebM currently includes animation and captions; browser speech is preview-only and is not embedded in the downloaded file.

The notes are sent to Google Gemini only when an author checks the consent box and starts generation. Do not include student-identifiable or institution-sensitive information unless the institution has approved that data handling. The backend limits one source to 24,000 characters and caps concurrent instances to help control use.

### Configure the Gemini secret

Install Firebase CLI, authenticate on the machine that will deploy, and set the key through Firebase Secret Manager. The CLI prompts locally for the value; **do not put the key in this repository, a browser file, or chat**.

```powershell
firebase functions:secrets:set GEMINI_API_KEY --project vriddhi-studio
```

The default model is `gemini-2.5-flash`. Provider integration is isolated in `functions/providers/gemini.js` so a different provider can be added later without putting its key in the frontend. Firebase Functions deployment may require the Firebase project to use the Blaze billing plan.

After reviewing and merging the code, deploy the callable workflow, rules and frontend from this folder:

```powershell
firebase deploy --only functions,firestore:rules,hosting --project vriddhi-studio
```

The callables use Firebase's callable CORS handling by default. A Hosting-only deployment does not create the function endpoint; if the browser shows a CORS preflight failure, first verify that the `vriddhi-studio` Functions were deployed in `asia-south1`. No production Hosting, Functions or Firestore Rules deployment is performed as part of this code change.

## Existing lesson and playback behavior

- Program, branch/specialization, subject, module, topic, and pasted notes.
- Fixed seven-scene teaching sequence; the AI storyboard enriches those scenes rather than changing their order.
- Optional source labels: `CONCEPT:`, `STEPS:`, `FORMULA:`, `WORKED EXAMPLE:`, `TRICK:`.
- Continuous browser speech; each scene advances after narration ends, plus a configurable 0/2/4/6-second pause (2 seconds by default). If speech is unavailable, timing is estimated from narration length.
- Pause, resume, stop, manual next/previous, single-scene narration, and speech cleanup when closing or signing out.
- Auto/Female/Male browser voice preference where a matching English voice is available.
- Campus, Notebook, and Midnight slide themes; Gentle rise, Fade, Slide in, and None transitions; reduced-motion preferences are respected.
- Internal-only Firebase email/password authentication and role-gated shared drafts; legacy private drafts remain user-scoped. There is no student/B2C route in this prototype.

## Tests

```powershell
python -m unittest discover -v
python -m py_compile server.py test_server.py
node --check app.js
node test_app.js
npm ci --prefix functions
npm --prefix functions test
npm --prefix functions run check
```

The backend tests mock Gemini responses and do not require a real API key or make external model calls.

## GitHub PR and CI

`.github/workflows/ci.yml` runs Python tests and syntax checks, frontend playback/scene tests, and the Firebase Functions validation tests on pushes to `main` and pull requests targeting `main`. `.github/pull_request_template.md` is included.

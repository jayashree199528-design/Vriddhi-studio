# Lesson Studio — private academic explainer builder

A private, text-first tool for turning prepared college course notes into a consistent animated slide deck. Current target: internal testing with one approved account before considering a public service.

## Run locally

Requirements: Python 3.10+ and internet access (the Firebase Web SDK loads from Google's CDN).

```powershell
py server.py
```

Open http://127.0.0.1:8000. The app requires Firebase email/password sign-in. Lessons are stored in Cloud Firestore under the signed-in user's UID; the local `data/lessons.sqlite3` API is retained for local API tests but is no longer used by the Firebase-connected browser app.

## Firebase setup in this project

- Firebase project ID: `vriddhi-studio`.
- Firebase Web config: `firebase-config.js`. This is public client config; it is not a service-account credential. Firebase Auth and Firestore rules must secure the app.
- Email/Password sign-in is enabled. The app has no public registration form; create approved accounts through Firebase Authentication.
- Firestore database uses Production mode in `asia-south1`.
- `firestore.rules` allows access only when the authenticated UID has an admin-created `/allowedUsers/{uid}` marker. Client access to `/allowedUsers` is denied. Each approved account can access only `/users/{uid}/lessons/{lessonId}`.
- `firebase.json` configures Firebase Hosting and deploys the Firestore rules. `.firebaserc` selects `vriddhi-studio`.

### Approve the first user

1. In Firebase Console → Authentication → Users, create the internal user's email/password account.
2. Copy that user's UID.
3. In Firestore, create collection `allowedUsers`, document ID equal to that UID, and a small field such as `role: "owner"`.
4. Deploy `firestore.rules` before using the app.

Never commit a service-account JSON key. The Web SDK config is intended to be in the browser; a service-account private key is not. For GitHub deploys, use a narrowly scoped secret or preferably Workload Identity Federation.

## Current features and limits

- Program, branch/specialization, subject, module, topic, and pasted notes.
- Fixed seven-slide sequence: title, core idea, steps, formula/key terms, worked example, shortcut/memory cue, and recap.
- Optional source labels: `CONCEPT:`, `STEPS:`, `FORMULA:`, `WORKED EXAMPLE:`, `TRICK:`.
- Edit slide text, animate/navigate through slides, and use browser speech synthesis to read a slide aloud.
- Firebase Authentication email/password sign-in and per-user Firestore lesson storage.
- The note organizer does not call an AI, verify academic facts, create voice files, or export MP4. Review formulas/examples before using the slides.

## GitHub PR and CI

`.github/workflows/ci.yml` runs unit tests and Python/JavaScript syntax checks on pushes to `main` and pull requests targeting `main`. `.github/pull_request_template.md` is included. The `main` branch ruleset should require a pull request and the `CI / tests` check.

## Firebase deployment

After testing local sign-in and Firestore access, install Firebase CLI and deploy from this folder:

```powershell
npm install -g firebase-tools
firebase login
firebase deploy --only hosting,firestore:rules --project vriddhi-studio
```

Hosting serves the static frontend. The current browser app talks directly to Firebase Auth and Firestore with user-scoped rules; it does not expose the Python SQLite API. Do not deploy or use real student records until your institution approves the data handling and retention approach.

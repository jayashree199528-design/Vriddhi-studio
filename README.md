# Vriddhi Lesson Studio — private academic explainer builder

Vriddhi Lesson Studio is a private, text-first workspace for turning prepared college-course notes into a seven-scene lesson and an animated explainer. The lesson structure stays fixed; Gemini can make the wording easier to follow and add a visual storyboard, while the browser draws the animation from safe, built-in vector scenes.

## Run locally

Requirements: Python 3.10+ and internet access for Firebase Web SDK scripts.

```powershell
py server.py
```

Open http://127.0.0.1:8000. The app requires Firebase email/password sign-in. Lessons are stored in Cloud Firestore under the signed-in user's UID. The local `data/lessons.sqlite3` API remains for local backend tests; the browser app does not use it for lesson storage.

The animated-explanation button needs the deployed Firebase callable function and its Gemini secret. The regular notes-to-seven-scenes draft and browser animation preview can be reviewed without calling Gemini.

## Firebase setup in this project

- Firebase project ID: `vriddhi-studio`.
- Firebase Web config: `firebase-config.js`. This is public client config, not a service-account credential. Firebase Auth and Firestore rules enforce access.
- Email/Password sign-in is enabled. There is no public registration form; create approved accounts through Firebase Authentication.
- Firestore database uses Production mode in `asia-south1`.
- `firestore.rules` allows access only when the authenticated UID has an admin-created `/allowedUsers/{uid}` marker. Each approved account can access only `/users/{uid}/lessons/{lessonId}`.
- Firebase Functions uses the Node.js 22 runtime in `asia-south1` and requires a signed-in Firebase user.

### Approve a user

1. In Firebase Console → Authentication → Users, create the internal user's email/password account.
2. Copy that user's UID.
3. In Firestore, create collection `allowedUsers`, document ID equal to that UID, and a small field such as `role: "owner"`.
4. Deploy `firestore.rules` before using the app.

Never commit a service-account JSON key or provider API key. The Web SDK config is intended to be in the browser; a private key is not. For GitHub deploys, use a narrowly scoped secret or preferably Workload Identity Federation.

## Animated explanation creator

1. Enter the topic and your prepared notes, then choose **Arrange into lesson slides**. This saves the normal seven-scene draft to your Firebase account.
2. Check the consent box in the preview and choose **Create animated explanation**. The app sends the lesson context and notes to the authenticated Firebase Function, which calls Gemini.
3. Gemini returns short, plain-language explanations, narration scripts, scene labels, and review notes for the fixed sequence: title, core idea, steps, formula/key terms, worked example, memory cue, and recap.
4. The browser renders those labels with a bespoke canvas-based vector animation for each scene. No model-generated HTML, SVG, CSS, or executable code is run.
5. Use **Play slides** to watch the animated scenes with browser speech, or **Export animated video** to download a captioned WebM.

AI can add general explanatory context or an illustrative example when notes are sparse. It must not invent citations, statistics, precise formulas, or unsupported course-specific facts. AI output can still be wrong: review every explanation, formula, and example before teaching or sharing. The WebM export currently includes animation and captions; browser speech is available in the live preview but is not embedded in the downloaded file yet.

The notes are sent to Google Gemini only when the user checks the consent box and starts generation. Do not include student-identifiable or institution-sensitive information unless the institution has approved that data handling. The backend limits one source to 24,000 characters and caps concurrent instances to help control use.

### Configure the Gemini secret

Install Firebase CLI, authenticate on the machine that will deploy, and set the key through Firebase Secret Manager. The CLI prompts locally for the value; **do not put the key in this repository, a browser file, or chat**.

```powershell
firebase functions:secrets:set GEMINI_API_KEY --project vriddhi-studio
```

The default model is `gemini-2.5-flash`. Provider integration is isolated in `functions/providers/gemini.js` so a different provider can be added later without putting its key in the frontend. Firebase Functions deployment may require the Firebase project to use the Blaze billing plan.

After reviewing and merging the code, deploy the backend and frontend from this folder:

```powershell
firebase deploy --only functions:generateAnimatedLesson,hosting --project vriddhi-studio
```

No production Hosting or Functions deployment is performed as part of this code change.

## Existing lesson and playback behavior

- Program, branch/specialization, subject, module, topic, and pasted notes.
- Fixed seven-scene teaching sequence; the AI storyboard enriches those scenes rather than changing their order.
- Optional source labels: `CONCEPT:`, `STEPS:`, `FORMULA:`, `WORKED EXAMPLE:`, `TRICK:`.
- Continuous browser speech; each scene advances after narration ends, plus a configurable 0/2/4/6-second pause (2 seconds by default). If speech is unavailable, timing is estimated from narration length.
- Pause, resume, stop, manual next/previous, single-scene narration, and speech cleanup when closing or signing out.
- Auto/Female/Male browser voice preference where a matching English voice is available.
- Campus, Notebook, and Midnight slide themes; Gentle rise, Fade, Slide in, and None transitions; reduced-motion preferences are respected.
- User-scoped Firebase email/password authentication and Firestore storage.

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

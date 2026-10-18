const assert = require('node:assert/strict');
const test = require('node:test');
const {
  SCENE_ORDER,
  buildUserPrompt,
  canAuthor,
  canReview,
  getInternalRole,
  isApprovedUser,
  normalizeStoryboard,
  parseJsonObject,
  transitionInternalStatus,
  validateInput,
  validateInternalLesson,
} = require('./logic');
const { createAnimatedStoryboard } = require('./providers/gemini');
const callableExports = require('./index');

const validInput = {
  program: 'B.Sc',
  branch: 'Physics',
  subject: 'Mechanics',
  module: 'Unit 2',
  topic: 'Newton’s second law',
  source: 'Force causes acceleration. The acceleration depends on the net force and the mass of the object.',
};

function makeScene(kind) {
  return {
    kind,
    kicker: `${kind.toUpperCase()} IDEA`,
    title: `A clear ${kind} idea`,
    explanation: `A plain-language explanation of ${kind}.`,
    narration: `Let’s make ${kind} easy to understand.`,
    steps: kind === 'steps' ? ['Notice the force', 'Check the mass', 'Explain the acceleration'] : [],
    visualLabels: ['Force', 'Mass', 'Acceleration'],
    durationSeconds: 6,
    reviewNote: 'Check this explanation against your course material.',
  };
}

function makeStoryboard() {
  return {
    title: validInput.topic,
    subtitle: 'A short animated explanation',
    scenes: SCENE_ORDER.slice().reverse().map(makeScene),
  };
}

function makeSavedSlides() {
  const visualTypes = ['title', 'concept-map', 'flow', 'equation', 'example', 'memory', 'recap'];
  return SCENE_ORDER.map((kind, index) => ({
    kind,
    kicker: `${kind.toUpperCase()} IDEA`,
    title: `A clear ${kind} idea`,
    body: `A concise explanation of ${kind}.`,
    narration: `Let’s explain ${kind} clearly.`,
    steps: kind === 'steps' ? ['Notice the first part', 'Connect the next part'] : [],
    animation: { visualType: visualTypes[index], visualLabels: ['Force', 'Mass', 'Result'], durationSeconds: 6 },
  }));
}

test('loads the Firebase callables without needing provider credentials', () => {
  for (const name of [
    'getInternalWorkspace',
    'createInternalLesson',
    'saveInternalLesson',
    'transitionInternalLesson',
    'generateAnimatedLesson',
  ]) assert.equal(typeof callableExports[name], 'function', `${name} should be exported`);
  assert.deepEqual(callableExports.generateAnimatedLesson.__endpoint.secretEnvironmentVariables, [{ key: 'GEMINI_API_KEY' }], 'Gemini secret must be explicitly bound to its callable');
});

test('validates bounded lesson input and rejects oversized source notes', () => {
  assert.equal(validateInput(validInput).topic, validInput.topic);
  assert.throws(() => validateInput({ ...validInput, source: 'short' }), /few sentences/);
  assert.throws(() => validateInput({ ...validInput, source: 'x'.repeat(24_001) }), /24,000 characters/);
  assert.throws(() => validateInput({ ...validInput, topic: ' ' }), /topic/);
});

test('checks the private Firebase allow-list before using the paid provider', async () => {
  const db = {
    collection(name) {
      assert.equal(name, 'allowedUsers');
      return { doc: uid => ({ get: async () => ({ exists: uid === 'approved-user' }) }) };
    },
  };
  assert.equal(await isApprovedUser(db, 'approved-user'), true);
  assert.equal(await isApprovedUser(db, 'unapproved-user'), false);
  assert.equal(await isApprovedUser(db, null), false);
});

test('reads explicit internal author and reviewer roles from the private allow-list', async () => {
  const db = {
    collection(name) {
      assert.equal(name, 'allowedUsers');
      return { doc: uid => ({
        get: async () => ({
          exists: uid !== 'missing-user',
          data: () => ({ role: uid === 'writer' ? 'author' : uid === 'reviewer' ? 'reviewer' : uid === 'bad-role' ? 'student' : 'owner' }),
        }),
      }) };
    },
  };
  assert.equal(await getInternalRole(db, 'writer'), 'author');
  assert.equal(await getInternalRole(db, 'reviewer'), 'reviewer');
  assert.equal(await getInternalRole(db, 'owner'), 'owner');
  assert.equal(await getInternalRole(db, 'missing-user'), null);
  assert.equal(await getInternalRole(db, 'bad-role'), null);
  assert.equal(canAuthor('author'), true);
  assert.equal(canAuthor('reviewer'), false);
  assert.equal(canReview('reviewer'), true);
  assert.equal(canReview('author'), false);
});

test('enforces the shared draft to review to approval workflow', () => {
  assert.equal(transitionInternalStatus('draft', 'submit_for_review', 'author', 'author-1', 'author-1'), 'in_review');
  assert.equal(transitionInternalStatus('changes_requested', 'submit_for_review', 'author', 'author-1', 'author-1'), 'in_review');
  assert.equal(transitionInternalStatus('in_review', 'approve', 'reviewer', 'reviewer-1', 'author-1'), 'approved');
  assert.equal(transitionInternalStatus('in_review', 'request_changes', 'reviewer', 'reviewer-1', 'author-1'), 'changes_requested');
  assert.throws(() => transitionInternalStatus('draft', 'approve', 'reviewer', 'reviewer-1', 'author-1'), /Only drafts in review/);
  assert.throws(() => transitionInternalStatus('in_review', 'approve', 'author', 'reviewer-1', 'author-1'), /Only an internal reviewer/);
  assert.throws(() => transitionInternalStatus('in_review', 'approve', 'reviewer', 'author-1', 'author-1'), /different internal reviewer/);
});

test('validates shared internal lesson content and rejects unsafe scene sequences', () => {
  const validated = validateInternalLesson({ ...validInput, slides: makeSavedSlides(), animationProvider: 'gemini' });
  assert.equal(validated.slides.length, 7);
  assert.deepEqual(validated.slides.map(slide => slide.kind), SCENE_ORDER);
  assert.equal(validated.slides[3].animation.visualType, 'equation');
  assert.equal(validated.animationProvider, 'gemini');

  const duplicate = makeSavedSlides();
  duplicate[0] = { ...duplicate[0], kind: 'concept' };
  assert.throws(() => validateInternalLesson({ ...validInput, slides: duplicate }), /invalid scene sequence/);
  assert.throws(() => validateInternalLesson({ ...validInput, slides: [] }), /exactly seven scenes/);
});

test('normalizes exactly seven scenes into the fixed teaching order', () => {
  const storyboard = normalizeStoryboard(makeStoryboard(), validInput);
  assert.deepEqual(storyboard.scenes.map(scene => scene.kind), SCENE_ORDER);
  assert.deepEqual(storyboard.scenes.map(scene => scene.visualType), [
    'title', 'concept-map', 'flow', 'equation', 'example', 'memory', 'recap',
  ]);
  assert.equal(storyboard.scenes[2].steps.length, 3);
  assert.equal(storyboard.scenes[0].durationSeconds, 6);
  assert.match(storyboard.reviewNote, /Review every scene/);
});

test('rejects missing, duplicate, and unsupported scenes instead of changing the lesson sequence', () => {
  const missing = makeStoryboard();
  missing.scenes.pop();
  assert.throws(() => normalizeStoryboard(missing, validInput), /incomplete seven-scene/);

  const duplicate = makeStoryboard();
  duplicate.scenes[0] = makeScene('intro');
  assert.throws(() => normalizeStoryboard(duplicate, validInput), /invalid scene sequence/);

  const unsupported = makeStoryboard();
  unsupported.scenes[0] = makeScene('surprise-scene');
  assert.throws(() => normalizeStoryboard(unsupported, validInput), /invalid scene sequence/);
});

test('parses provider JSON while tolerating accidental markdown fences', () => {
  assert.deepEqual(parseJsonObject('```json\n{"scenes":[]}\n```'), { scenes: [] });
  assert.throws(() => parseJsonObject('not JSON'), /storyboard/);
});

test('routes the six authoring source sections to their matching storyboard scenes', () => {
  const prompt = buildUserPrompt(validInput);
  assert.match(prompt, /TOPIC BRIEF frames the opening/);
  assert.match(prompt, /EXPLANATION informs the core concept/);
  assert.match(prompt, /WORKED EXAMPLE informs the example scene/);
  assert.match(prompt, /STEPS informs the process scene/);
});

test('calls Gemini with a server-side key and structured lesson prompt', async () => {
  let observedUrl = '';
  let observedRequest;
  const expected = makeStoryboard();
  const storyboard = await createAnimatedStoryboard(validInput, {
    apiKey: 'test-secret-never-logged',
    model: 'gemini-test-model',
    fetchImpl: async (url, request) => {
      observedUrl = url;
      observedRequest = request;
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(expected) }] } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  assert.match(observedUrl, /gemini-test-model:generateContent$/);
  assert.equal(observedRequest.headers['x-goog-api-key'], 'test-secret-never-logged');
  assert.equal(observedRequest.method, 'POST');
  const body = JSON.parse(observedRequest.body);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.match(body.contents[0].parts[0].text, /Newton’s second law/);
  assert.equal(storyboard.scenes.length, 7);
});

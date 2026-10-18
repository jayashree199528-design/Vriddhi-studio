const assert = require('node:assert/strict');
const test = require('node:test');
const {
  SCENE_ORDER,
  isApprovedUser,
  normalizeStoryboard,
  parseJsonObject,
  validateInput,
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

test('loads the Firebase callable without needing provider credentials', () => {
  assert.equal(typeof callableExports.generateAnimatedLesson, 'function');
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

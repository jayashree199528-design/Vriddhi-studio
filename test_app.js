const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const appSource = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

function createElement() {
  const classes = new Set();
  return {
    textContent: '',
    innerHTML: '',
    value: '',
    disabled: false,
    style: {},
    dataset: {},
    classList: {
      add(...names) { names.forEach(name => classes.add(name)); },
      remove(...names) { names.forEach(name => classes.delete(name)); },
      contains(name) { return classes.has(name); },
      toggle(name, force) {
        const shouldAdd = force === undefined ? !classes.has(name) : Boolean(force);
        if (shouldAdd) classes.add(name);
        else classes.delete(name);
        return shouldAdd;
      },
    },
    setAttribute() {},
    focus() {},
    scrollIntoView() {},
  };
}

function createHarness({
  speech = true,
  storage = new Map(),
  voices = [
    { name: 'Microsoft Neerja Online - English (India)', lang: 'en-IN', localService: true },
    { name: 'Microsoft Ravi Online - English (India)', lang: 'en-IN', localService: true },
  ],
} = {}) {
  let now = 0;
  let timerId = 0;
  const timers = new Map();
  const elements = new Map();
  const localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
  };

  function setTimeoutMock(callback, delay = 0) {
    const id = ++timerId;
    timers.set(id, { at: now + Math.max(0, Number(delay) || 0), callback });
    return id;
  }
  function clearTimeoutMock(id) { timers.delete(id); }
  function advanceTime(milliseconds) {
    const target = now + milliseconds;
    while (true) {
      const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > target) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].callback();
    }
    now = target;
  }

  class FakeDate extends Date {
    static now() { return now; }
  }
  class FakeUtterance {
    constructor(text) {
      this.text = text;
      this.lang = '';
      this.rate = 1;
      this.voice = null;
      this.onend = null;
      this.onerror = null;
    }
  }

  const window = {
    localStorage,
    addEventListener() {},
  };
  let synthesis = null;
  if (speech) {
    synthesis = {
      current: null,
      speaking: false,
      paused: false,
      utterances: [],
      voices,
      getVoices() { return this.voices; },
      speak(utterance) {
        if (this.current) throw new Error('Overlapping speech detected');
        this.current = utterance;
        this.speaking = true;
        this.paused = false;
        this.utterances.push(utterance);
      },
      cancel() {
        const previous = this.current;
        this.current = null;
        this.speaking = false;
        this.paused = false;
        if (previous && previous.onerror) previous.onerror({ error: 'canceled' });
      },
      pause() { this.paused = true; },
      resume() { this.paused = false; },
      finishCurrent() {
        const current = this.current;
        if (!current || this.paused) return false;
        this.current = null;
        this.speaking = false;
        if (current.onend) current.onend();
        return true;
      },
    };
    window.speechSynthesis = synthesis;
    window.SpeechSynthesisUtterance = FakeUtterance;
  }

  const document = {
    body: { style: {} },
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, createElement());
      return elements.get(id);
    },
    querySelectorAll() { return []; },
    querySelector() { return createElement(); },
    addEventListener() {},
  };
  const context = vm.createContext({
    window,
    document,
    Date: FakeDate,
    setTimeout: setTimeoutMock,
    clearTimeout: clearTimeoutMock,
    SpeechSynthesisUtterance: FakeUtterance,
    console,
  });
  vm.runInContext(appSource, context, { filename: 'app.js' });
  vm.runInContext('toast = () => {};', context);

  return {
    context,
    synthesis,
    storage,
    advanceTime,
    getElement: id => document.getElementById(id),
  };
}

function setDeck(harness, slides) {
  const encoded = JSON.stringify(slides);
  vm.runInContext(`deck = ${encoded}; slide = 0; renderDeck();`, harness.context);
}
function read(harness, expression) {
  return vm.runInContext(expression, harness.context);
}

function testContinuousNarrationAndTwoSecondDefault() {
  const app = createHarness();
  const longText = 'This is a deliberately long slide that must remain visible until its narration has actually finished. '.repeat(8);
  setDeck(app, [
    { title: 'Short slide', body: 'A brief point.', steps: [] },
    { title: 'Long slide', body: longText, steps: ['One detail.', 'A second detail.'] },
    { title: 'Final slide', body: 'The lesson is complete.', steps: [] },
  ]);

  assert.equal(read(app, 'transitionPauseMs'), 2000, 'default inter-slide pause should be two seconds');
  vm.runInContext('togglePlay()', app.context);
  assert.match(app.synthesis.current.text, /Short slide/);
  assert.equal(read(app, 'playbackState'), 'playing');

  app.synthesis.finishCurrent();
  app.advanceTime(1999);
  assert.equal(read(app, 'slide'), 0, 'short narration should not be cut off by a fixed timer');
  app.advanceTime(1);
  assert.equal(read(app, 'slide'), 1);
  assert.match(app.synthesis.current.text, /Long slide/);

  app.advanceTime(60000);
  assert.equal(read(app, 'slide'), 1, 'long narration should stay on screen until speech ends');
  app.synthesis.finishCurrent();
  app.advanceTime(2000);
  assert.equal(read(app, 'slide'), 2);
  app.synthesis.finishCurrent();
  assert.equal(read(app, 'playbackState'), 'stopped', 'playback should stop after the final narration');
  assert.equal(app.synthesis.current, null);
}

function testPauseResumeSpeechAndTransition() {
  const app = createHarness();
  setDeck(app, [
    { title: 'First', body: 'First narration.', steps: [] },
    { title: 'Second', body: 'Second narration.', steps: [] },
  ]);
  vm.runInContext('togglePlay()', app.context);
  vm.runInContext('togglePlay()', app.context);
  assert.equal(read(app, 'playbackState'), 'paused');
  assert.equal(app.synthesis.paused, true);
  app.advanceTime(5000);
  assert.equal(read(app, 'slide'), 0);

  vm.runInContext('togglePlay()', app.context);
  assert.equal(read(app, 'playbackState'), 'playing');
  assert.equal(app.synthesis.paused, false);
  app.synthesis.finishCurrent();
  app.advanceTime(500);
  vm.runInContext('togglePlay()', app.context);
  assert.equal(read(app, 'playbackState'), 'paused');
  app.advanceTime(5000);
  assert.equal(read(app, 'slide'), 0, 'transition countdown should remain paused');

  vm.runInContext('togglePlay()', app.context);
  app.advanceTime(1499);
  assert.equal(read(app, 'slide'), 0);
  app.advanceTime(1);
  assert.equal(read(app, 'slide'), 1, 'resume should continue the remaining transition delay');
  assert.match(app.synthesis.current.text, /Second/);
}

function testManualSkipAndStopCancelOldSpeech() {
  const app = createHarness();
  setDeck(app, [
    { title: 'One', body: 'First slide.', steps: [] },
    { title: 'Two', body: 'Second slide.', steps: [] },
    { title: 'Three', body: 'Third slide.', steps: [] },
  ]);
  vm.runInContext('togglePlay()', app.context);
  const firstUtterance = app.synthesis.current;
  vm.runInContext('nextSlide()', app.context);
  assert.equal(read(app, 'slide'), 1);
  assert.match(app.synthesis.current.text, /Two/);
  firstUtterance.onend();
  assert.equal(read(app, 'slide'), 1, 'a stale onend callback must not advance after a manual skip');

  vm.runInContext('prevSlide()', app.context);
  assert.equal(read(app, 'slide'), 0);
  assert.match(app.synthesis.current.text, /One/);
  vm.runInContext('stopPlay()', app.context);
  assert.equal(read(app, 'playbackState'), 'stopped');
  assert.equal(app.synthesis.current, null);
  app.advanceTime(10000);
  assert.equal(read(app, 'slide'), 0, 'stop should cancel pending slide changes');
}

function testVoicePreferenceAndUnavailableGenderFallback() {
  const app = createHarness();
  setDeck(app, [
    { title: 'Voice one', body: 'First voice sample.', steps: [] },
    { title: 'Voice two', body: 'Second voice sample.', steps: [] },
  ]);
  vm.runInContext('setVoicePreference("female"); togglePlay()', app.context);
  assert.match(app.synthesis.current.voice.name, /Neerja/);
  app.synthesis.finishCurrent();
  vm.runInContext('setVoicePreference("male")', app.context);
  app.advanceTime(2000);
  assert.match(app.synthesis.current.voice.name, /Ravi/);
  assert.equal(app.storage.get('vriddhi-voice'), 'male');

  const unavailable = createHarness({ voices: [
    { name: 'Microsoft Neerja Online - English (India)', lang: 'en-IN', localService: true },
  ] });
  setDeck(unavailable, [{ title: 'Fallback', body: 'Default voice fallback.', steps: [] }]);
  vm.runInContext('setVoicePreference("male")', unavailable.context);
  assert.match(unavailable.getElement('voiceStatus').textContent, /No male English voice/);
  vm.runInContext('togglePlay()', unavailable.context);
  assert.equal(unavailable.synthesis.current.voice, null, 'missing gender choice should defer to the browser default');
}

function testTemplateAndTransitionPreferences() {
  const app = createHarness();
  setDeck(app, [{ title: 'Theme test', body: 'Change the visual treatment.', steps: [] }]);
  vm.runInContext('setTemplate("notebook")', app.context);
  assert.equal(app.getElement('stage').dataset.template, 'notebook');
  assert.equal(app.getElement('stage').style.background, '#f5f1e6');
  assert.ok(app.getElement('stageContent').classList.contains('transition-rise'));

  vm.runInContext('setTransitionStyle("fade")', app.context);
  assert.ok(app.getElement('stageContent').classList.contains('transition-fade'));
  vm.runInContext('setTransitionStyle("slide")', app.context);
  assert.ok(app.getElement('stageContent').classList.contains('transition-slide'));
  vm.runInContext('setTransitionStyle("none")', app.context);
  assert.ok(app.getElement('stageContent').classList.contains('transition-none'));
  vm.runInContext('setTemplate("midnight")', app.context);
  assert.equal(app.getElement('stage').dataset.template, 'midnight');
  assert.equal(app.getElement('stage').style.background, '#173046');
  assert.equal(app.storage.get('vriddhi-template'), 'midnight');
  assert.equal(app.storage.get('vriddhi-transition'), 'none');
  assert.match(htmlSource, /prefers-reduced-motion:reduce/);
}

function testOneOffVoiceIsCancelledByManualNavigation() {
  const app = createHarness();
  setDeck(app, [
    { title: 'Voice only', body: 'Read this one slide.', steps: [] },
    { title: 'Next slide', body: 'Manual browsing should not keep speaking.', steps: [] },
  ]);
  vm.runInContext('speakSlide()', app.context);
  const oneOffUtterance = app.synthesis.current;
  assert.ok(oneOffUtterance);
  vm.runInContext('nextSlide()', app.context);
  assert.equal(read(app, 'playbackState'), 'stopped');
  assert.equal(app.synthesis.current, null, 'manual navigation should cancel one-off narration');
  oneOffUtterance.onend();
  assert.equal(read(app, 'playTimerPending'), false, 'a stale one-off speech event must not schedule playback');
}

function testClosingBuilderAndSigningOutCancelSpeech() {
  const app = createHarness();
  setDeck(app, [{ title: 'Close test', body: 'Read this slide.', steps: [] }]);
  vm.runInContext('togglePlay(); closeBuilder()', app.context);
  assert.equal(read(app, 'playbackState'), 'stopped');
  assert.equal(app.synthesis.current, null);

  setDeck(app, [{ title: 'Sign out test', body: 'Read this slide.', steps: [] }]);
  vm.runInContext('auth = { signOut: () => Promise.resolve() }; togglePlay()', app.context);
  return vm.runInContext('signOut()', app.context).then(() => {
    assert.equal(read(app, 'playbackState'), 'stopped');
    assert.equal(app.synthesis.current, null);
  });
}

function testFallbackTimingAndPacingControl() {
  const app = createHarness({ speech: false });
  const longText = 'word '.repeat(145).trim();
  setDeck(app, [
    { title: 'Short', body: 'A small note.', steps: [] },
    { title: 'Long', body: longText, steps: [] },
    { title: 'End', body: 'Done.', steps: [] },
  ]);
  vm.runInContext('togglePlay()', app.context);
  app.advanceTime(3799);
  assert.equal(read(app, 'slide'), 0);
  app.advanceTime(1);
  assert.equal(read(app, 'slide'), 1, 'short fallback narration should include the configured two-second pause');

  const expectedLongDelay = read(app, 'fallbackDelay(getSlideNarrationText(slide))');
  assert.ok(expectedLongDelay > 60000, 'long fallback text should receive a longer estimated duration');
  app.advanceTime(expectedLongDelay - 1);
  assert.equal(read(app, 'slide'), 1);
  app.advanceTime(1);
  assert.equal(read(app, 'slide'), 2);

  vm.runInContext('setTransitionPause(4000)', app.context);
  assert.equal(read(app, 'transitionPauseMs'), 4000);
  assert.equal(app.storage.get('vriddhi-playback-pause'), '4000');
  assert.equal(app.getElement('transitionPause').value, '4000');
}

function testAnimatedExplainerIsConsentGatedAndHasVideoExportControls() {
  assert.match(htmlSource, /id="animationCanvas"/, 'the preview should include a dedicated animation canvas');
  assert.match(htmlSource, /id="aiConsent"/, 'sending notes to Gemini should require explicit consent');
  assert.match(htmlSource, /id="animateButton"/, 'the preview should offer storyboard generation');
  assert.match(htmlSource, /id="exportVideoButton"/, 'the preview should offer a video export control');
  assert.match(htmlSource, /firebase-functions-compat\.js/, 'Firebase callable functions SDK should load before app.js');
  assert.match(appSource, /canvas\.captureStream\(30\)/, 'video export should record animated canvas frames');
}

function testAnimatedStoryboardUsesSevenScenesAndGeneratedNarration() {
  const app = createHarness({ speech: false });
  const baseDeck = [
    { kind: 'intro', kicker: 'INTRO', title: 'Topic', body: 'Original notes.', steps: [] },
    { kind: 'concept', kicker: 'IDEA', title: 'Concept', body: 'Original concept.', steps: [] },
    { kind: 'steps', kicker: 'STEPS', title: 'Process', body: 'Original steps.', steps: ['Step one.'] },
    { kind: 'formula', kicker: 'FORMULA', title: 'Formula', body: 'Original formula.', steps: [] },
    { kind: 'example', kicker: 'EXAMPLE', title: 'Example', body: 'Original example.', steps: [] },
    { kind: 'trick', kicker: 'MEMORY', title: 'Memory cue', body: 'Original cue.', steps: [] },
    { kind: 'recap', kicker: 'RECAP', title: 'Recap', body: 'Original recap.', steps: [] },
  ];
  const kinds = ['intro', 'concept', 'steps', 'formula', 'example', 'trick', 'recap'];
  const storyboard = {
    reviewNote: 'Review every scene.',
    scenes: kinds.slice().reverse().map(kind => ({
      kind,
      kicker: `${kind.toUpperCase()} · STORY`,
      title: `${kind} made simple`,
      explanation: `Plain language for ${kind}.`,
      narration: `Here is the spoken explanation for ${kind}.`,
      steps: kind === 'steps' ? ['Look at the first part.', 'Then connect the next part.'] : [],
      visualLabels: ['First idea', 'Next step', 'Clear result'],
      durationSeconds: 6,
      reviewNote: 'Check this detail.',
    })),
  };
  const merged = read(app, `mergeStoryboard(${JSON.stringify(baseDeck)}, ${JSON.stringify(storyboard)})`);
  assert.equal(merged.length, 7, 'animation should preserve the fixed seven-scene lesson');
  assert.deepEqual(Array.from(merged, scene => scene.kind), kinds, 'scenes should be normalized to the lesson order');
  assert.equal(merged[2].body, 'Plain language for steps.');
  assert.equal(merged[2].animation.visualType, 'flow');
  assert.equal(merged[2].steps.length, 2);

  setDeck(app, merged);
  assert.equal(read(app, 'getSlideNarrationText(2)'), 'Here is the spoken explanation for steps.');
  vm.runInContext('renderSlide(2)', app.context);
  assert.match(app.getElement('stageContent').innerHTML, /Plain language for steps/);
  assert.throws(() => read(app, `mergeStoryboard(${JSON.stringify(baseDeck)}, { scenes: [] })`), /complete seven-scene/);
}

async function main() {
  testContinuousNarrationAndTwoSecondDefault();
  testPauseResumeSpeechAndTransition();
  testManualSkipAndStopCancelOldSpeech();
  testVoicePreferenceAndUnavailableGenderFallback();
  testTemplateAndTransitionPreferences();
  testOneOffVoiceIsCancelledByManualNavigation();
  await testClosingBuilderAndSigningOutCancelSpeech();
  testFallbackTimingAndPacingControl();
  testAnimatedExplainerIsConsentGatedAndHasVideoExportControls();
  testAnimatedStoryboardUsesSevenScenesAndGeneratedNarration();
  console.log('Frontend playback tests passed.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

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

function testInternalSharedReviewQueueIsRoleGated() {
  for (const id of ['workflowState', 'submitReviewButton', 'reviewControls', 'approveLessonButton', 'requestChangesButton']) {
    assert.match(htmlSource, new RegExp(`id="${id}"`), `${id} should exist in the internal workflow UI`);
  }
  for (const id of ['topicBriefNotes', 'explanationNotes', 'formulaNotes', 'exampleNotes', 'trickNotes', 'solveNotes']) {
    assert.match(htmlSource, new RegExp(`id="${id}"`), `${id} should provide a dedicated authoring step`);
  }
  assert.match(htmlSource, /HUMAN REVIEW GATE/, 'the independent approval route should remain visible in the authoring flow');
  assert.match(htmlSource, /Independent reviewer/, 'approval must require a different reviewer');
  assert.match(appSource, /httpsCallable\('createInternalLesson'\)/, 'new content should go through the server-side shared-draft callable');
  assert.match(appSource, /httpsCallable\('transitionInternalLesson'\)/, 'review status changes should go through callable functions');
  assert.match(htmlSource, /No customer-facing publish route is enabled/, 'internal approval must not expose lessons to customers');

  const wizard = createHarness({ speech: false });
  vm.runInContext("currentRole='author';sharedQueueReady=true", wizard.context);
  assert.equal(read(wizard, 'goToAuthoringStep(1)'), false, 'the wizard should require a topic title before advancing');
  wizard.getElement('topic').value = 'Price elasticity';
  assert.equal(read(wizard, 'goToAuthoringStep(1)'), false, 'the first step should require a topic brief');
  wizard.getElement('topicBriefNotes').value = 'A concise introduction to how price changes affect demand.';
  assert.equal(read(wizard, 'goToAuthoringStep(1)'), true);
  assert.equal(read(wizard, 'authoringStep'), 1);
  assert.equal(wizard.getElement('authorStep1').hidden, true);
  assert.equal(wizard.getElement('authorStep2').hidden, false);
  assert.equal(read(wizard, 'goToAuthoringStep(3)'), false, 'the stepper should not let authors skip ahead');
  for (let step = 2; step < 6; step += 1) assert.equal(read(wizard, `goToAuthoringStep(${step})`), true);
  assert.equal(wizard.getElement('createLessonButton').hidden, false, 'the save/build action should appear at the final step');

  const app = createHarness({ speech: false });
  vm.runInContext("currentUser={uid:'author-1'};currentRole='author';currentScope='internal';currentId='lesson-1';lessons=[{id:'lesson-1',_scope:'internal',createdByUid:'author-1',status:'draft'}]", app.context);
  assert.equal(read(app, 'canEditCurrentLesson()'), true, 'an author can edit their own draft');
  assert.equal(read(app, 'canUseSharedQueue()'), false, 'shared authoring waits until the server role and Firestore queue are ready');
  vm.runInContext('sharedQueueReady=true', app.context);
  assert.equal(read(app, 'canUseSharedQueue()'), true, 'authors can create once the shared queue is available');
  vm.runInContext("currentRole='reviewer'", app.context);
  assert.equal(read(app, 'roleCanReview()'), true, 'reviewers receive review permission');
  assert.equal(read(app, 'canEditCurrentLesson()'), false, 'reviewers cannot edit the author’s draft');
  vm.runInContext("currentUser={uid:'author-1'};currentRole='owner'", app.context);
  assert.equal(read(app, 'canEditCurrentLesson()'), true, 'owners can edit drafts');

  vm.runInContext("currentRole=null;currentScope='internal';currentId=null;lessons=[];sharedQueueReady=false;workspaceError='functions/permission-denied';updateWorkflowControls()", app.context);
  assert.match(app.getElement('workflowHint').textContent, /allowedUsers\/\{uid\}/, 'a callable permission-denied response should explain the required role allow-list entry');
}

function testSixSourceFieldsComposeSlidesAndMigrateLegacyNotes() {
  const app = createHarness({ speech: false });
  app.getElement('topicBriefNotes').value = 'A brief describes how price changes affect quantity demanded.';
  app.getElement('explanationNotes').value = 'Explain the central idea clearly.';
  app.getElement('formulaNotes').value = 'Elasticity = percentage change in quantity divided by percentage change in price.';
  app.getElement('exampleNotes').value = 'If quantity falls by 10 percent after price rises by 5 percent, elasticity is 2.';
  app.getElement('trickNotes').value = 'Remember the sign and interpret magnitude.';
  app.getElement('solveNotes').value = 'Identify values, substitute, and check the result.';
  let payload = read(app, 'lessonFormPayload()');
  assert.match(payload.source, /TOPIC BRIEF:/);
  assert.match(payload.source, /EXPLANATION:/);
  assert.match(payload.source, /FORMULA:/);
  assert.match(payload.source, /WORKED EXAMPLE:/);
  assert.match(payload.source, /TRICK:/);
  assert.match(payload.source, /STEPS:/);
  const slides = read(app, `createSlides(${JSON.stringify({...payload, program:'B.Com'})})`);
  assert.match(slides[0].body, /brief describes how price changes/, 'the topic brief should inform the opening slide');
  assert.match(slides[1].body, /central idea/);
  assert.match(slides[3].body, /Elasticity/);
  assert.match(slides[4].body, /quantity falls/);
  assert.match(slides[5].body, /Remember the sign/);
  assert.match(slides[2].steps[0], /Identify values/);

  const legacySource = 'TOPIC BRIEF:\nElasticity describes a demand response.\n\nEXPLANATION:\nDemand changes with price.\n\nFORMULA / KEY TERMS:\nElasticity = percentage change in quantity divided by percentage change in price.\n\nTRICK / SHORTCUT:\nCheck the sign first.\n\nSTEPS:\nIdentify the change.\nSubstitute the values.\n\nWORKED EXAMPLE:\nCompare the result with one.';
  vm.runInContext(`populateSourceFields(${JSON.stringify(legacySource)})`, app.context);
  assert.equal(app.getElement('topicBriefNotes').value, 'Elasticity describes a demand response.');
  assert.equal(app.getElement('explanationNotes').value, 'Demand changes with price.');
  assert.equal(app.getElement('formulaNotes').value, 'Elasticity = percentage change in quantity divided by percentage change in price.');
  assert.equal(app.getElement('exampleNotes').value, 'Compare the result with one.');
  assert.equal(app.getElement('trickNotes').value, 'Check the sign first.');
  assert.equal(app.getElement('solveNotes').value, 'Identify the change.\n\nSubstitute the values.');
  payload = read(app, 'lessonFormPayload()');
  assert.match(payload.source, /WORKED EXAMPLE:\nCompare the result with one\./, 'legacy examples should migrate into the dedicated example step');
}

async function testPrivateDraftAutosavePersistsFormAndSceneEdits() {
  const app = createHarness({ speech: false });
  const updates = [];
  app.context.mockDb = {
    collection(name) {
      assert.equal(name, 'users');
      return { doc(uid) {
        assert.equal(uid, 'author-1');
        return { collection(subcollection) {
          assert.equal(subcollection, 'lessons');
          return { doc(id) {
            return { update: async value => updates.push({ id, value }) };
          } };
        } };
      } };
    },
  };
  app.context.mockFirebase = { firestore: { FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' } } };
  vm.runInContext("db=mockDb;firebase=mockFirebase;currentUser={uid:'author-1'};currentRole=null;currentScope='private';currentId='legacy-1';lessons=[{id:'legacy-1',_scope:'private',status:'private',slides:[]}];deck=[{kind:'intro',title:'Old title',body:'Old body',steps:[]}];", app.context);
  app.getElement('program').value = 'B.Sc';
  app.getElement('topic').value = 'Edited topic';
  app.getElement('topicBriefNotes').value = 'A short brief about this edited lesson topic.';
  app.getElement('explanationNotes').value = 'Updated explanation of the concept.';
  app.getElement('formulaNotes').value = 'Use the elasticity formula carefully.';
  app.getElement('exampleNotes').value = 'A worked calculation with the final answer.';
  app.getElement('trickNotes').value = 'Remember the sign before calculating.';
  app.getElement('solveNotes').value = 'Step 1: identify the values.\nStep 2: substitute and check.';
  vm.runInContext("deck[0].body='Edited scene body';queueSave()", app.context);
  app.advanceTime(1099);
  assert.equal(updates.length, 0, 'the idle autosave should wait until typing pauses');
  app.advanceTime(1);
  await new Promise(resolve => setTimeout(resolve, 0));

  assert.equal(updates.length, 1, 'a debounced edit should save once');
  assert.equal(updates[0].id, 'legacy-1');
  assert.equal(updates[0].value.program, 'B.Sc');
  assert.equal(updates[0].value.topic, 'Edited topic');
  assert.match(updates[0].value.source, /TOPIC BRIEF:\nA short brief about this edited lesson topic\./);
  assert.match(updates[0].value.source, /EXPLANATION:\nUpdated explanation of the concept\./);
  assert.match(updates[0].value.source, /FORMULA:\nUse the elasticity formula carefully\./);
  assert.match(updates[0].value.source, /WORKED EXAMPLE:\nA worked calculation with the final answer\./);
  assert.match(updates[0].value.source, /TRICK:\nRemember the sign before calculating\./);
  assert.match(updates[0].value.source, /STEPS:\nStep 1: identify the values\.\nStep 2: substitute and check\./);
  assert.equal(updates[0].value.slides[0].body, 'Edited scene body');
  assert.equal('id' in updates[0].value, false, 'the legacy document id must not be written as lesson content');
  assert.equal(read(app, 'editorDirty'), false, 'a successful save should clear the dirty flag');
}

async function testClosingAnUneditedReturnedDraftDoesNotResetItsWorkflowState() {
  const app = createHarness({ speech: false });
  const calls = [];
  app.context.functionsClient = {
    httpsCallable(name) {
      return async payload => {
        calls.push({ name, payload });
        return { data: { status: 'draft' } };
      };
    },
  };
  vm.runInContext("currentUser={uid:'author-1'};currentRole='author';sharedQueueReady=true;currentScope='internal';currentId='returned-1';lessons=[{id:'returned-1',_scope:'internal',createdByUid:'author-1',status:'changes_requested',slides:[]}];deck=[];", app.context);
  await vm.runInContext('closeBuilder()', app.context);
  assert.equal(calls.length, 0, 'closing without edits should not issue an unnecessary save');
  assert.equal(read(app, 'lessons[0].status'), 'changes_requested', 'the reviewer-requested state should remain until the author edits');
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
  testInternalSharedReviewQueueIsRoleGated();
  testSixSourceFieldsComposeSlidesAndMigrateLegacyNotes();
  await testPrivateDraftAutosavePersistsFormAndSceneEdits();
  await testClosingAnUneditedReturnedDraftDoesNotResetItsWorkflowState();
  testAnimatedStoryboardUsesSevenScenesAndGeneratedNarration();
  console.log('Frontend playback tests passed.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

const { getApps, initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const {
  canAuthor,
  canReview,
  getInternalRole,
  transitionInternalStatus,
  validateInput,
  validateInternalLesson,
} = require('./logic');
const { createAnimatedStoryboard } = require('./providers/gemini');

if (!getApps().length) initializeApp();
const db = getFirestore();
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const INTERNAL_LESSONS = 'internalLessons';
const CALLABLE_OPTIONS = {
  region: 'asia-south1',
  timeoutSeconds: 120,
  memory: '512MiB',
  maxInstances: 2,
};

function callable(handler, extraOptions = {}) {
  return onCall({ ...CALLABLE_OPTIONS, ...extraOptions }, handler);
}

function requireAuth(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to use the internal lesson workspace.');
  return request.auth;
}

async function requireWorkspaceRole(request) {
  const auth = requireAuth(request);
  let role;
  try {
    role = await getInternalRole(db, auth.uid);
  } catch (error) {
    console.error('Internal workspace role lookup failed:', error.name || 'Error');
    throw new HttpsError('internal', 'Could not verify access to the internal lesson workspace.');
  }
  if (!role) throw new HttpsError('permission-denied', 'This account does not have an internal author or reviewer role.');
  return { auth, role };
}

function lessonId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new HttpsError('invalid-argument', 'A valid internal lesson ID is required.');
  }
  return value;
}

function validatedLesson(value) {
  try {
    return validateInternalLesson(value);
  } catch (error) {
    throw new HttpsError('invalid-argument', error.message);
  }
}

function roleCanEditOwn(role, auth, lesson) {
  return canAuthor(role) && (role === 'owner' || lesson.createdByUid === auth.uid);
}

exports.getInternalWorkspace = callable(async request => {
  const { auth, role } = await requireWorkspaceRole(request);
  return { role, uid: auth.uid, email: auth.token.email || '' };
});

exports.createInternalLesson = callable(async request => {
  const { auth, role } = await requireWorkspaceRole(request);
  if (!canAuthor(role)) throw new HttpsError('permission-denied', 'Only an internal author can create lesson drafts.');

  const content = validatedLesson(request.data);
  const ref = db.collection(INTERNAL_LESSONS).doc();
  await ref.create({
    ...content,
    status: 'draft',
    createdByUid: auth.uid,
    authorEmail: auth.token.email || '',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    submittedAt: null,
    reviewSummary: '',
    reviewedByUid: null,
    reviewedByEmail: '',
    reviewedAt: null,
  });
  return { id: ref.id, status: 'draft' };
});

exports.saveInternalLesson = callable(async request => {
  const { auth, role } = await requireWorkspaceRole(request);
  if (!canAuthor(role)) throw new HttpsError('permission-denied', 'Only an internal author can edit lesson drafts.');

  const id = lessonId(request.data?.id);
  const ref = db.collection(INTERNAL_LESSONS).doc(id);
  let nextStatus = 'draft';
  try {
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new HttpsError('not-found', 'This internal lesson draft no longer exists.');
      const existing = snapshot.data();
      if (!roleCanEditOwn(role, auth, existing)) {
        throw new HttpsError('permission-denied', 'You can only edit your own draft unless you are an owner.');
      }
      if (existing.status !== 'draft' && existing.status !== 'changes_requested') {
        throw new HttpsError('failed-precondition', 'Only a draft or a draft returned for changes can be edited.');
      }
      const content = validatedLesson({ ...existing, ...request.data });
      nextStatus = existing.status === 'changes_requested' ? 'draft' : existing.status;
      transaction.update(ref, {
        ...content,
        status: nextStatus,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('Internal lesson save failed:', error.name || 'Error');
    throw new HttpsError('internal', 'Could not save the internal lesson draft.');
  }
  return { id, status: nextStatus };
});

exports.transitionInternalLesson = callable(async request => {
  const { auth, role } = await requireWorkspaceRole(request);
  const id = lessonId(request.data?.id);
  const action = request.data?.action;
  if (!['submit_for_review', 'approve', 'request_changes'].includes(action)) {
    throw new HttpsError('invalid-argument', 'Choose submit_for_review, approve, or request_changes.');
  }
  if (action === 'submit_for_review' && !canAuthor(role)) {
    throw new HttpsError('permission-denied', 'Only an internal author can submit a draft for review.');
  }
  if (action !== 'submit_for_review' && !canReview(role)) {
    throw new HttpsError('permission-denied', 'Only an internal reviewer can review a draft.');
  }
  const summary = typeof request.data.reviewSummary === 'string' ? request.data.reviewSummary.trim().slice(0, 1_200) : '';
  if (action === 'request_changes' && summary.length < 5) {
    throw new HttpsError('invalid-argument', 'Add a short review note explaining the requested changes.');
  }

  const ref = db.collection(INTERNAL_LESSONS).doc(id);
  let nextStatus = '';
  try {
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new HttpsError('not-found', 'This internal lesson draft no longer exists.');
      const existing = snapshot.data();
      try {
        nextStatus = transitionInternalStatus(existing.status, action, role, auth.uid, existing.createdByUid);
      } catch (error) {
        throw new HttpsError('failed-precondition', error.message);
      }

      const update = { status: nextStatus, updatedAt: FieldValue.serverTimestamp() };
      if (action === 'submit_for_review') {
        update.submittedAt = FieldValue.serverTimestamp();
      } else {
        update.reviewSummary = summary;
        update.reviewedByUid = auth.uid;
        update.reviewedByEmail = auth.token.email || '';
        update.reviewedAt = FieldValue.serverTimestamp();
      }
      transaction.update(ref, update);
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('Internal lesson workflow update failed:', error.name || 'Error');
    throw new HttpsError('internal', 'Could not update the internal lesson review state.');
  }
  return { id, status: nextStatus };
});

exports.generateAnimatedLesson = callable(async request => {
  const { role } = await requireWorkspaceRole(request);
  if (!canAuthor(role)) throw new HttpsError('permission-denied', 'Only an internal author can generate lesson explanations.');

  let input;
  try {
    input = validateInput(request.data);
  } catch (error) {
    throw new HttpsError('invalid-argument', error.message);
  }

  const apiKey = GEMINI_API_KEY.value();
  if (!apiKey) {
    throw new HttpsError(
      'failed-precondition',
      'The Gemini provider is not configured yet. Set the GEMINI_API_KEY Firebase Functions secret and deploy the function.'
    );
  }

  try {
    return await createAnimatedStoryboard(input, { apiKey, model: GEMINI_MODEL });
  } catch (error) {
    if (error.providerCode === 'rate-limit') {
      throw new HttpsError('resource-exhausted', 'Gemini is busy or the provider quota was reached. Please try again shortly.');
    }
    if (error.providerCode === 'network' || error.status >= 500) {
      throw new HttpsError('unavailable', 'The explanation provider is temporarily unavailable. Please try again shortly.');
    }
    console.error('Animated lesson generation failed:', error.name || 'Error', error.status || 'no-status');
    throw new HttpsError('internal', 'Could not create the animated explanation. Check the lesson notes and try again.');
  }
}, { secrets: [GEMINI_API_KEY] });

const { getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { isApprovedUser, validateInput } = require('./logic');
const { createAnimatedStoryboard } = require('./providers/gemini');

if (!getApps().length) initializeApp();
const db = getFirestore();
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

exports.generateAnimatedLesson = onCall({
  region: 'asia-south1',
  timeoutSeconds: 120,
  memory: '512MiB',
  maxInstances: 2,
  secrets: [GEMINI_API_KEY],
}, async request => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in before creating an animated explanation.');
  }

  let approved;
  try {
    approved = await isApprovedUser(db, request.auth.uid);
  } catch (error) {
    console.error('Animated lesson allow-list check failed:', error.name || 'Error');
    throw new HttpsError('internal', 'Could not verify access to the animated explanation service.');
  }
  if (!approved) {
    throw new HttpsError('permission-denied', 'This Firebase account is not approved for the private workspace.');
  }

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
});

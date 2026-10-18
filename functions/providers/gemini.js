const { buildUserPrompt, normalizeStoryboard, parseJsonObject } = require('../logic');

const DEFAULT_MODEL = 'gemini-2.5-flash';

async function createAnimatedStoryboard(input, {
  apiKey,
  model = DEFAULT_MODEL,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!apiKey) throw new Error('Gemini API key is not configured.');
  if (typeof fetchImpl !== 'function') throw new Error('This runtime does not support outbound fetch.');

  const safeModel = /^[a-zA-Z0-9._-]{1,100}$/.test(model) ? model : DEFAULT_MODEL;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(safeModel)}:generateContent`;
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: 'You are an experienced educational explainer and visual storyboard artist. Make accurate ideas easier to understand, and return only the requested structured JSON.',
          }],
        },
        contents: [{ role: 'user', parts: [{ text: buildUserPrompt(input) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.35,
          maxOutputTokens: 6_000,
        },
      }),
      signal: AbortSignal.timeout(100_000),
    });
  } catch (error) {
    const wrapped = new Error('Could not reach the Gemini explanation service.');
    wrapped.cause = error;
    wrapped.providerCode = 'network';
    throw wrapped;
  }

  if (!response.ok) {
    const error = new Error(`Gemini returned HTTP ${response.status}.`);
    error.status = response.status;
    error.providerCode = response.status === 429 ? 'rate-limit' : 'provider';
    throw error;
  }

  const envelope = await response.json();
  const parts = envelope?.candidates?.[0]?.content?.parts;
  const responseText = Array.isArray(parts)
    ? parts.map(part => typeof part.text === 'string' ? part.text : '').join('').trim()
    : '';
  const parsed = parseJsonObject(responseText);
  return normalizeStoryboard(parsed, input);
}

module.exports = { DEFAULT_MODEL, createAnimatedStoryboard };

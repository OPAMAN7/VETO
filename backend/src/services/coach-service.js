'use strict';

const { HttpError } = require('../utils/http-error');
const { getImpulseScore } = require('./analytics-service');

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    analysis: { type: 'STRING' },
    riskFactors: { type: 'ARRAY', items: { type: 'STRING' } },
    questions: { type: 'ARRAY', items: { type: 'STRING' } },
    suggestions: { type: 'ARRAY', items: { type: 'STRING' } },
    recommendation: { type: 'STRING' },
    explanation: { type: 'STRING' }
  },
  required: ['analysis', 'riskFactors', 'questions', 'suggestions', 'recommendation', 'explanation']
};

function validateCoachResult(value) {
  const requiredText = ['analysis', 'recommendation', 'explanation'];
  const requiredLists = ['riskFactors', 'questions', 'suggestions'];
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || requiredText.some((key) => typeof value[key] !== 'string' || value[key].length > 1200)
      || requiredLists.some((key) => !Array.isArray(value[key])
        || value[key].length > 8
        || value[key].some((item) => typeof item !== 'string' || item.length > 500))) {
    throw new HttpError('The purchase coach returned an invalid response. Please try again.', 502, 'INVALID_COACH_RESPONSE');
  }
  return {
    analysis: value.analysis,
    riskFactors: value.riskFactors,
    questions: value.questions,
    suggestions: value.suggestions,
    recommendation: value.recommendation,
    explanation: value.explanation
  };
}

function createCoachService(config, fetchImpl = globalThis.fetch) {
  return {
    async analyze(draft) {
      if (!config.geminiApiKey) {
        throw new HttpError('Purchase Coach is not configured. Set GEMINI_API_KEY in your local .env file.', 503, 'COACH_NOT_CONFIGURED');
      }
      if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
        throw new HttpError('A purchase draft is required.', 400, 'INVALID_COACH_INPUT');
      }

      const price = Number(draft.price);
      const usesPerMonth = Number(draft.usesPerMonth);
      const lifespanMonths = Number(draft.lifespanMonths);
      const useCount = usesPerMonth * lifespanMonths;
      if (typeof draft.name !== 'string' || draft.name.trim().length < 1 || draft.name.length > 200
          || !Number.isFinite(price) || price <= 0
          || (draft.usesPerMonth !== '' && !Number.isFinite(usesPerMonth))
          || (draft.lifespanMonths !== '' && !Number.isFinite(lifespanMonths))) {
        throw new HttpError('Purchase details are incomplete or invalid.', 400, 'INVALID_COACH_INPUT');
      }

      const promptData = {
        name: draft.name.trim(),
        price,
        category: typeof draft.category === 'string' ? draft.category.slice(0, 100) : '',
        trigger: typeof draft.trigger === 'string' ? draft.trigger.slice(0, 100) : '',
        usesPerMonth,
        lifespanMonths,
        costPerUse: useCount > 0 ? Math.round(price / useCount) : null,
        impulseScore: getImpulseScore(draft),
        owned: Array.isArray(draft.owned) ? draft.owned : draft.owned ? [draft.owned] : [],
        access: typeof draft.access === 'string' ? draft.access.slice(0, 100) : '',
        alternative: {
          name: typeof draft.altName === 'string' ? draft.altName.slice(0, 200) : '',
          price: Number.isFinite(Number(draft.altPrice)) ? Number(draft.altPrice) : null
        },
        honestyChecks: Array.isArray(draft.honesty) ? draft.honesty : []
      };
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.geminiModel)}:generateContent`;
      let response;
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': config.geminiApiKey
          },
          body: JSON.stringify({
            contents: [{
              role: 'user',
              parts: [{
                text: `Act as a neutral purchase reflection coach, not a financial adviser or decision-maker. Do not shame the user, invent market facts, or alter any saved decision. Return concise structured JSON in the required schema. Use the user's inputs only.\n\nPurchase data:\n${JSON.stringify(promptData)}`
              }]
            }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: RESPONSE_SCHEMA,
              temperature: 0.3
            }
          }),
          signal: AbortSignal.timeout(15000)
        });
      } catch (error) {
        if (error.name === 'TimeoutError' || error.name === 'AbortError') {
          throw new HttpError('The purchase coach timed out. Please try again.', 504, 'COACH_TIMEOUT');
        }
        throw new HttpError('The purchase coach service could not be reached.', 502, 'COACH_UNAVAILABLE');
      }

      if (response.status === 429) {
        throw new HttpError('The purchase coach quota is temporarily unavailable. Try again later.', 503, 'COACH_QUOTA');
      }
      if (!response.ok) {
        throw new HttpError('The purchase coach could not complete this request. Check the API configuration and try again.', 502, 'COACH_UPSTREAM_ERROR');
      }

      let result;
      try {
        result = await response.json();
        const text = result.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('');
        if (!text) throw new Error('No response content.');
        return validateCoachResult(JSON.parse(text));
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError('The purchase coach returned an unreadable response. Please try again.', 502, 'INVALID_COACH_RESPONSE');
      }
    }
  };
}

module.exports = { createCoachService, validateCoachResult };

'use strict';

const PRICE_SCORE_THRESHOLDS = [
  { minimum: 10000, points: 30 },
  { minimum: 5000, points: 20 },
  { minimum: 2500, points: 10 }
];

function getImpulseScore(draft) {
  const honesty = Array.isArray(draft.honesty)
    ? draft.honesty
    : draft.honesty ? [draft.honesty] : [];
  const owned = Array.isArray(draft.owned)
    ? draft.owned
    : draft.owned ? [draft.owned] : [];
  const categoryAnswers = draft.categoryAnswers && typeof draft.categoryAnswers === 'object'
    ? draft.categoryAnswers
    : {};
  const price = Number(draft.price);
  let score = 0;

  if (draft.trigger === 'impulse') score += 25;
  else if (draft.trigger === 'offer') score += 15;
  score += Math.max(0, 3 - honesty.length) * 10;
  if (owned.some((item) => item !== 'none')) score += 25;
  const threshold = PRICE_SCORE_THRESHOLDS.find((item) => price >= item.minimum);
  if (threshold) score += threshold.points;
  const category = draft.category;

  if (category === 'kitchen') {
    if (categoryAnswers.needLevel === 'novel') score += 15;
    else if (categoryAnswers.needLevel === 'helpful') score += 8;
    if (categoryAnswers.manualAlternative === 'easy') score += 10;
  } else if (category === 'hobby') {
    if (categoryAnswers.commitment === 'idea') score += 20;
    else if (categoryAnswers.commitment === 'starting') score += 10;
    if (categoryAnswers.trial === 'available') score -= 5;
  } else if (category === 'fast-fashion') {
    if (categoryAnswers.wardrobeGap === 'want') score += 15;
    else if (categoryAnswers.wardrobeGap === 'similar') score += 10;
    if (categoryAnswers.saleTrigger === 'high') score += 10;
  } else if (category === 'footwear') {
    if (categoryAnswers.purpose === 'desire') score += 15;
    if (categoryAnswers.fit === 'no') score += 10;
  } else if (category === 'fitness') {
    if (categoryAnswers.goal === 'desire') score += 15;
    if (categoryAnswers.usedBefore === 'no') score += 10;
  } else if (category === 'furniture') {
    if (categoryAnswers.problem === 'style') score += 15;
    if (categoryAnswers.existing === 'easy') score += 10;
  } else if (category === 'electronics') {
    if (categoryAnswers.replacementReason === 'want') score += 15;
    if (categoryAnswers.repairable === 'yes') score += 10;
  } else if (category === 'books') {
    if (categoryAnswers.purpose === 'collection') score += 15;
    if (categoryAnswers.access === 'free' || categoryAnswers.access === 'library') score -= 5;
  } else if (category === 'other') {
    if (categoryAnswers.need === 'desire') score += 15;
    if (categoryAnswers.replacement === 'exists') score += 10;
  }
  return Math.max(0, Math.min(100, score));
}

function buildAnalytics(decisions) {
  const summary = {
    totalDecisions: decisions.length,
    purchases: 0,
    delayed: 0,
    skipped: 0,
    totalSpent: 0,
    estimatedMoneyAvoided: 0,
    averageImpulseScore: null,
    commonTriggers: [],
    frequentCategories: []
  };
  const triggers = new Map();
  const categories = new Map();
  const scores = [];

  for (const decision of decisions) {
    const draft = decision.draft || {};
    const price = Number(draft.price);
    const validPrice = Number.isFinite(price) && price > 0 ? price : 0;

    if (decision.outcome === 'bought') {
      summary.purchases += 1;
      summary.totalSpent += validPrice;
    } else if (decision.outcome === 'delayed') {
      summary.delayed += 1;
    } else if (decision.outcome === 'passed') {
      summary.skipped += 1;
      summary.estimatedMoneyAvoided += validPrice;
    }

    if (typeof draft.trigger === 'string' && draft.trigger) {
      triggers.set(draft.trigger, (triggers.get(draft.trigger) || 0) + 1);
      scores.push(getImpulseScore(draft));
    }
    if (typeof draft.category === 'string' && draft.category) {
      categories.set(draft.category, (categories.get(draft.category) || 0) + 1);
    }
  }

  if (scores.length > 0) {
    summary.averageImpulseScore = Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
  }
  summary.commonTriggers = Array.from(triggers, ([trigger, count]) => ({ trigger, count }))
    .sort((a, b) => b.count - a.count || a.trigger.localeCompare(b.trigger));
  summary.frequentCategories = Array.from(categories, ([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));

  return summary;
}

module.exports = { buildAnalytics, getImpulseScore };

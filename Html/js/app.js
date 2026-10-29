(function () {
  'use strict';

  var DRAFT_KEY = 'vetoDraft';
  var DECISIONS_KEY = 'vetoDecisions';
  var DRAFT_FIELDS = [
    'name',
    'price',
    'category',
    'trigger',
    'usesPerMonth',
    'lifespanMonths',
    'honesty',
    'owned',
    'access',
    'altName',
    'altPrice'
  ];
  var DEFAULT_DRAFT = {
    name: '',
    price: '',
    category: '',
    trigger: '',
    usesPerMonth: '',
    lifespanMonths: '',
    honesty: [],
    owned: [],
    access: '',
    altName: '',
    altPrice: ''
  };
  var HONESTY_CHECK_COUNT = 3;
  var PRICE_SCORE_THRESHOLDS = [
    { minimum: 10000, points: 30 },
    { minimum: 5000, points: 20 },
    { minimum: 2500, points: 10 }
  ];

  function calculateCostPerUse(price, usesPerMonth, lifespanMonths) {
    return Math.round(price / (usesPerMonth * lifespanMonths));
  }

  function calculateImpulseScore(draft) {
    var source = draft && typeof draft === 'object' ? draft : {};
    var score = 0;
    var honesty = Array.isArray(source.honesty)
      ? source.honesty
      : source.honesty ? [source.honesty] : [];
    var owned = Array.isArray(source.owned)
      ? source.owned
      : source.owned ? [source.owned] : [];
    var price = Number(source.price);

    if (source.trigger === 'impulse') {
      score += 25;
    } else if (source.trigger === 'offer') {
      score += 15;
    }

    score += Math.max(0, HONESTY_CHECK_COUNT - honesty.length) * 10;

    if (owned.some(function (item) { return item !== 'none'; })) {
      score += 25;
    }

    PRICE_SCORE_THRESHOLDS.some(function (threshold) {
      if (price >= threshold.minimum) {
        score += threshold.points;
        return true;
      }
      return false;
    });

    return Math.min(100, score);
  }

  function cloneDefaultDraft() {
    return {
      name: DEFAULT_DRAFT.name,
      price: DEFAULT_DRAFT.price,
      category: DEFAULT_DRAFT.category,
      trigger: DEFAULT_DRAFT.trigger,
      usesPerMonth: DEFAULT_DRAFT.usesPerMonth,
      lifespanMonths: DEFAULT_DRAFT.lifespanMonths,
      honesty: [],
      owned: [],
      access: DEFAULT_DRAFT.access,
      altName: DEFAULT_DRAFT.altName,
      altPrice: DEFAULT_DRAFT.altPrice
    };
  }

  function readStorage(key, fallback) {
    try {
      var value = window.localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch (error) {
      console.error('VETO could not read local storage.', error);
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error('VETO could not write local storage.', error);
    }
  }

  function normalizeDraft(draft) {
    var normalized = cloneDefaultDraft();
    var source = draft && typeof draft === 'object' ? draft : {};

    DRAFT_FIELDS.forEach(function (field) {
      if (Object.prototype.hasOwnProperty.call(source, field)) {
        normalized[field] = source[field];
      }
    });

    normalized.honesty = Array.isArray(normalized.honesty)
      ? normalized.honesty
      : normalized.honesty ? [normalized.honesty] : [];
    normalized.owned = Array.isArray(normalized.owned)
      ? normalized.owned
      : normalized.owned ? [normalized.owned] : [];

    return normalized;
  }

  function getDraft() {
    return normalizeDraft(readStorage(DRAFT_KEY, {}));
  }

  function saveDraft(draft) {
    var normalized = normalizeDraft(draft);
    writeStorage(DRAFT_KEY, normalized);
    return normalized;
  }

  function getDecisions() {
    var decisions = readStorage(DECISIONS_KEY, []);
    return Array.isArray(decisions) ? decisions : [];
  }

  function saveDecision(decision) {
    var decisions = getDecisions();
    var savedDecision = decision && typeof decision === 'object'
      ? Object.assign({}, decision)
      : {};

    savedDecision.id = savedDecision.id || Date.now().toString();
    savedDecision.savedAt = savedDecision.savedAt || new Date().toISOString();
    savedDecision.draft = normalizeDraft(savedDecision.draft || getDraft());
    decisions.push(savedDecision);
    writeStorage(DECISIONS_KEY, decisions);
    return savedDecision;
  }

  function formDraft(form) {
    var draft = getDraft();
    var formData = new FormData(form);

    DRAFT_FIELDS.forEach(function (field) {
      var values = formData.getAll(field);
      if (values.length > 1 || field === 'honesty' || field === 'owned') {
        draft[field] = values;
      } else if (values.length === 1) {
        draft[field] = values[0];
      }
    });

    var itemName = formData.get('item');
    if (itemName !== null) {
      draft.name = itemName;
    }

    return saveDraft(draft);
  }

  function restoreForm(form) {
    var draft = getDraft();
    Array.prototype.forEach.call(form.elements, function (control) {
      var field = control.name === 'item' ? 'name' : control.name;
      if (!field || !Object.prototype.hasOwnProperty.call(draft, field)) {
        return;
      }

      var value = draft[field];
      if (control.type === 'checkbox') {
        control.checked = Array.isArray(value) && value.indexOf(control.value) !== -1;
      } else if (control.type === 'radio') {
        control.checked = control.value === value;
      } else if (value !== '') {
        control.value = value;
      }
    });
  }

  function initialize() {
    var stepForm = document.querySelector('[data-step]');
    if (stepForm) {
      restoreForm(stepForm);
      stepForm.addEventListener('submit', function () {
        formDraft(stepForm);
      });
    }

    var decisionForm = document.querySelector('[data-decision]');
    if (decisionForm) {
      decisionForm.addEventListener('submit', function (event) {
        var submitter = event.submitter;
        saveDecision({
          outcome: submitter ? submitter.value : '',
          draft: getDraft()
        });
      });
    }
  }

  window.getDraft = getDraft;
  window.saveDraft = saveDraft;
  window.getDecisions = getDecisions;
  window.saveDecision = saveDecision;
  window.calculateCostPerUse = calculateCostPerUse;
  window.calculateImpulseScore = calculateImpulseScore;
  window.VETO = {
    getDraft: getDraft,
    saveDraft: saveDraft,
    getDecisions: getDecisions,
    saveDecision: saveDecision,
    calculateCostPerUse: calculateCostPerUse,
    calculateImpulseScore: calculateImpulseScore
  };

  document.addEventListener('DOMContentLoaded', initialize);
}());

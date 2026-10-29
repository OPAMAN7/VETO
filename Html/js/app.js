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

  function formatRupees(amount) {
    return '\u20b9' + Math.round(amount).toLocaleString('en-IN');
  }

  function updateSidebarBill(draft) {
    var sidebar = document.querySelector('.wizard__bill');
    if (!sidebar) {
      return;
    }

    var source = normalizeDraft(draft);
    var price = Number(source.price);
    var usesPerMonth = Number(source.usesPerMonth);
    var lifespanMonths = Number(source.lifespanMonths);
    var totalUses = usesPerMonth * lifespanMonths;
    var isPriceValid = isFinite(price) && price > 0;
    var isUsageValid = isFinite(totalUses) && totalUses > 0;
    var score = source.trigger ? calculateImpulseScore(source) : null;
    var priceValue = sidebar.querySelector("[data-field='price']");
    var usesValue = sidebar.querySelector("[data-field='uses']");
    var costPerUseValue = sidebar.querySelector("[data-field='cost-per-use']");
    var impulseValue = sidebar.querySelector("[data-field='impulse']");
    var meterFill = sidebar.querySelector('.meter__fill');

    if (priceValue) {
      priceValue.textContent = formatRupees(isPriceValid ? price : 0);
    }
    if (usesValue) {
      usesValue.textContent = isUsageValid ? totalUses : '\u2014';
    }
    if (costPerUseValue) {
      costPerUseValue.textContent = isPriceValid && isUsageValid
        ? formatRupees(calculateCostPerUse(price, usesPerMonth, lifespanMonths))
        : '\u2014';
    }
    if (impulseValue) {
      impulseValue.textContent = score === null ? 'not scored' : score + ' of 100';
    }
    if (meterFill) {
      meterFill.style.width = (score === null ? 0 : score) + '%';
      var meter = meterFill.parentNode;
      if (meter && meter.setAttribute) {
        meter.setAttribute('aria-label', score === null
          ? 'Impulse score not scored'
          : 'Impulse score ' + score + ' out of 100');
      }
    }
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

  function initStepRouting() {
    var stepPages = [
      'step-2-usage.html',
      'step-3-redundancy.html',
      'step-4-verdict.html'
    ];
    var currentPath = window.location && window.location.pathname
      ? window.location.pathname
      : '';
    var currentPage = currentPath.split('/').pop();
    var draft = getDraft();
    var hasStepOneData = typeof draft.name === 'string' && draft.name.trim() !== ''
      && Number(draft.price) > 0
      && typeof draft.category === 'string' && draft.category !== ''
      && typeof draft.trigger === 'string' && draft.trigger !== '';

    if (stepPages.indexOf(currentPage) !== -1 && !hasStepOneData) {
      window.alert('Complete Step 1 before continuing.');
      window.location.href = 'step-1-item.html';
    }
  }

  function syncNavigationState() {
    var currentPath = window.location && window.location.pathname
      ? window.location.pathname
      : '';
    var currentPage = currentPath.split('/').pop() || 'index.html';
    var navigationLinks = document.querySelectorAll('.site-nav a');
    var stepPages = [
      'step-1-item.html',
      'step-2-usage.html',
      'step-3-redundancy.html',
      'step-4-verdict.html'
    ];
    var stepIndex = stepPages.indexOf(currentPage);
    var progress = document.getElementById('wizard-progress');
    var activeNavigationPage = stepIndex !== -1 ? 'step-1-item.html' : currentPage;

    Array.prototype.forEach.call(navigationLinks, function (link) {
      var linkPage = (link.getAttribute('href') || '').split('/').pop();
      if (linkPage === activeNavigationPage) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });

    if (progress && stepIndex !== -1) {
      progress.max = stepPages.length;
      progress.value = stepIndex + 1;
      progress.textContent = (stepIndex + 1) + ' of ' + stepPages.length + ' steps done';
    }

    var stepForm = document.querySelector('[data-step]');
    if (stepForm) {
      Array.prototype.forEach.call(stepForm.querySelectorAll('a[href]'), function (link) {
        var targetPage = (link.getAttribute('href') || '').split('/').pop();
        if (stepPages.indexOf(targetPage) !== -1 && targetPage !== currentPage) {
          link.addEventListener('click', function () {
            formDraft(stepForm);
          });
        }
      });
    }
  }

  function initialize() {
    syncNavigationState();
    initStepRouting();

    var stepForm = document.querySelector('[data-step]');
    var itemForm = document.querySelector("form[data-step='item']");
    var usageForm = document.querySelector("form[data-step='usage']");
    if (stepForm) {
      restoreForm(stepForm);
      stepForm.addEventListener('input', function () {
        updateSidebarBill(formDraft(stepForm));
      });
      stepForm.addEventListener('change', function () {
        updateSidebarBill(formDraft(stepForm));
      });
    }
    updateSidebarBill(getDraft());

    if (itemForm) {
      itemForm.addEventListener('submit', function (event) {
        var itemName = itemForm.querySelector('#item-name');
        var itemPrice = itemForm.querySelector('#item-price');
        var itemCategory = itemForm.querySelector('#item-category');
        var trigger = itemForm.querySelector('input[name="trigger"]:checked');
        var error = document.getElementById('item-name-error');
        var isValid = itemName && itemName.value.trim() !== ''
          && itemPrice && Number(itemPrice.value) > 0
          && itemCategory && itemCategory.value !== ''
          && trigger;

        if (error) {
          error.hidden = Boolean(isValid);
        }

        if (!isValid) {
          event.preventDefault();
          return;
        }

        formDraft(itemForm);
      });
    } else if (usageForm) {
      var usesPerMonth = usageForm.querySelector('#uses-per-month');
      var lifespanMonths = usageForm.querySelector('#lifespan');
      var continueButton = usageForm.querySelector('button[type="submit"]');
      var error = document.getElementById('usage-values-error');
      var usesPerMonthValue = document.querySelector("[data-field='uses-per-month']");
      var lifespanValue = document.querySelector("[data-field='lifespan']");
      var totalUsesValue = document.querySelector("[data-field='uses']");

      function updateUsageReadouts() {
        var uses = usesPerMonth ? Number(usesPerMonth.value) : 0;
        var lifespan = lifespanMonths ? Number(lifespanMonths.value) : 0;

        if (usesPerMonthValue && usesPerMonth) {
          usesPerMonthValue.textContent = uses + ' a month';
        }
        if (lifespanValue && lifespanMonths) {
          lifespanValue.textContent = lifespan + ' months';
        }
        if (totalUsesValue && usesPerMonth && lifespanMonths) {
          totalUsesValue.textContent = uses * lifespan;
        }
      }

      function updateUsageState() {
        var isValid = usesPerMonth && Number(usesPerMonth.value) > 0
          && lifespanMonths && Number(lifespanMonths.value) > 0;

        if (continueButton) {
          continueButton.disabled = !isValid;
        }
        if (error) {
          error.hidden = Boolean(isValid);
        }

        return isValid;
      }

      updateUsageReadouts();
      updateUsageState();
      [usesPerMonth, lifespanMonths].forEach(function (slider) {
        if (!slider) {
          return;
        }

        slider.addEventListener('input', function () {
          updateUsageState();
          updateUsageReadouts();
        });
      });
      usageForm.addEventListener('change', function () {
        updateUsageState();
      });
      usageForm.addEventListener('submit', function (event) {
        if (!updateUsageState()) {
          event.preventDefault();
          return;
        }

        formDraft(usageForm);
      });
    } else if (stepForm) {
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
  window.updateSidebarBill = updateSidebarBill;
  window.initStepRouting = initStepRouting;
  window.syncNavigationState = syncNavigationState;
  window.VETO = {
    getDraft: getDraft,
    saveDraft: saveDraft,
    getDecisions: getDecisions,
    saveDecision: saveDecision,
    calculateCostPerUse: calculateCostPerUse,
    calculateImpulseScore: calculateImpulseScore,
    updateSidebarBill: updateSidebarBill,
    initStepRouting: initStepRouting,
    syncNavigationState: syncNavigationState
  };

  document.addEventListener('DOMContentLoaded', initialize);
}());

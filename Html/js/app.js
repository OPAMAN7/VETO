(function () {
  'use strict';

  var DRAFT_KEY = 'vetoDraft';
  var DECISIONS_KEY = 'vetoDecisions';
  var COUNTDOWN_KEY = 'vetoVerdictCountdown';
  var COOLING_OFF_MS = 48 * 60 * 60 * 1000;
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

  function getDecisionStatus(outcome) {
    var statuses = {
      bought: { label: 'Bought', className: 'pill--good' },
      delayed: { label: 'Waiting', className: 'pill--wait' },
      passed: { label: 'Skipped', className: 'pill--stop' }
    };

    return statuses[outcome] || { label: 'Unknown', className: '' };
  }

  function renderDecisionRows(tableBody, decisions) {
    tableBody.textContent = '';

    decisions.forEach(function (decision) {
      if (!decision || typeof decision !== 'object') {
        return;
      }

      var draft = normalizeDraft(decision.draft);
      var price = Number(draft.price);
      var uses = Number(draft.usesPerMonth) * Number(draft.lifespanMonths);
      var date = new Date(decision.savedAt);
      var status = getDecisionStatus(decision.outcome);
      var row = document.createElement('tr');
      var itemCell = document.createElement('th');
      var dateCell = document.createElement('td');
      var priceCell = document.createElement('td');
      var costCell = document.createElement('td');
      var scoreCell = document.createElement('td');
      var statusCell = document.createElement('td');
      var time = document.createElement('time');
      var pill = document.createElement('span');

      itemCell.scope = 'row';
      itemCell.textContent = draft.name || 'Unnamed item';
      if (isFinite(date.getTime())) {
        time.dateTime = date.toISOString();
        time.textContent = date.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        });
        dateCell.appendChild(time);
      } else {
        dateCell.textContent = 'Unknown date';
      }
      priceCell.textContent = isFinite(price) && price > 0 ? formatRupees(price) : '\u2014';
      costCell.textContent = isFinite(price) && price > 0 && isFinite(uses) && uses > 0
        ? formatRupees(calculateCostPerUse(price, Number(draft.usesPerMonth), Number(draft.lifespanMonths)))
        : '\u2014';
      scoreCell.textContent = draft.trigger ? String(calculateImpulseScore(draft)) : '\u2014';
      pill.className = 'pill' + (status.className ? ' ' + status.className : '');
      pill.textContent = status.label;
      statusCell.appendChild(pill);

      row.appendChild(itemCell);
      row.appendChild(dateCell);
      row.appendChild(priceCell);
      row.appendChild(costCell);
      row.appendChild(scoreCell);
      row.appendChild(statusCell);
      tableBody.appendChild(row);
    });
  }

  function initHistory() {
    var tableBody = document.querySelector('[data-decision-rows]');
    if (!tableBody) {
      return;
    }

    var outcomeFilter = document.getElementById('filter-outcome');
    var searchFilter = document.getElementById('filter-search');
    var form = tableBody.closest('section').querySelector('form');
    var status = document.getElementById('decision-history-status');
    var decisions = [];

    function applyFilters() {
      var outcome = outcomeFilter ? outcomeFilter.value : 'all';
      var keyword = searchFilter ? searchFilter.value.trim().toLocaleLowerCase() : '';
      var emptyState = tableBody.querySelector('[data-empty-state]');
      var matchingRows = 0;

      if (emptyState) {
        emptyState.remove();
      }

      Array.prototype.forEach.call(tableBody.querySelectorAll('tr'), function (row) {
        var status = row.cells.length > 5
          ? row.cells[5].textContent.trim().toLocaleLowerCase()
          : '';
        var matchesOutcome = outcome === 'all'
          || (outcome === 'passed' && status === 'skipped')
          || (outcome === 'delayed' && status === 'waiting')
          || (outcome === 'bought' && status === 'bought');
        var matchesKeyword = row.textContent.toLocaleLowerCase().indexOf(keyword) !== -1;

        row.hidden = !matchesOutcome || !matchesKeyword;
        if (!row.hidden) {
          matchingRows += 1;
        }
      });

      if (matchingRows === 0) {
        var emptyRow = document.createElement('tr');
        var emptyCell = document.createElement('td');
        emptyCell.colSpan = 6;
        emptyCell.textContent = decisions.length
          ? 'No decisions match these filters.'
          : 'No saved decisions yet.';
        emptyRow.setAttribute('data-empty-state', '');
        emptyRow.appendChild(emptyCell);
        tableBody.appendChild(emptyRow);
      }
    }

    if (outcomeFilter) {
      outcomeFilter.addEventListener('input', applyFilters);
      outcomeFilter.addEventListener('change', applyFilters);
    }
    if (searchFilter) {
      searchFilter.addEventListener('input', applyFilters);
    }
    if (form) {
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        applyFilters();
      });
    }

    migrateLegacyDecisions()
      .then(getDecisions)
      .then(function (storedDecisions) {
        decisions = storedDecisions;
        renderDecisionRows(tableBody, decisions);
        applyFilters();
      })
      .catch(function (error) {
        console.error('VETO could not load decision history.', error);
        if (status) {
          status.hidden = false;
          status.textContent = 'Could not load saved decisions. Make sure the VETO server is running and reload this page.';
        }
      });
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

  function requestJson(path, options) {
    return window.fetch(path, options).then(function (response) {
      return response.json().catch(function () {
        return {};
      }).then(function (result) {
        if (!response.ok) {
          throw new Error(result.error || 'The VETO server returned an error.');
        }
        return result;
      });
    });
  }

  function getDecisions() {
    return requestJson('/api/decisions').then(function (result) {
      return result.decisions;
    });
  }

  function saveDecision(decision) {
    var savedDecision = decision && typeof decision === 'object'
      ? Object.assign({}, decision)
      : {};

    savedDecision.draft = normalizeDraft(savedDecision.draft || getDraft());
    return requestJson('/api/decisions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(savedDecision)
    }).then(function (result) {
      return result.decision;
    });
  }

  function migrateLegacyDecisions() {
    var legacyDecisions = readStorage(DECISIONS_KEY, []);
    if (!Array.isArray(legacyDecisions) || legacyDecisions.length === 0) {
      return Promise.resolve();
    }

    return legacyDecisions.reduce(function (migration, decision) {
      return migration.then(function () {
        return saveDecision(decision);
      });
    }, Promise.resolve()).then(function () {
      window.localStorage.removeItem(DECISIONS_KEY);
    });
  }

  function initVerdictCountdown() {
    var countdown = document.getElementById('verdict-countdown');
    var markAsBought = document.getElementById('mark-as-bought');
    if (!countdown || !markAsBought) {
      return;
    }

    var draftSignature = JSON.stringify(getDraft());
    var countdownState = readStorage(COUNTDOWN_KEY, null);
    var deadline = countdownState && countdownState.draftSignature === draftSignature
      ? Number(countdownState.deadline)
      : 0;

    if (!isFinite(deadline) || deadline <= 0) {
      deadline = Date.now() + COOLING_OFF_MS;
      writeStorage(COUNTDOWN_KEY, {
        draftSignature: draftSignature,
        deadline: deadline
      });
    }

    var lockReason = document.getElementById('lock-reason');

    function updateCountdown() {
      var remaining = Math.max(0, deadline - Date.now());
      var totalSeconds = Math.ceil(remaining / 1000);
      var hours = Math.floor(totalSeconds / 3600);
      var minutes = Math.floor((totalSeconds % 3600) / 60);
      var seconds = totalSeconds % 60;

      countdown.textContent = hours + ' h '
        + (minutes < 10 ? '0' : '') + minutes + ' m '
        + (seconds < 10 ? '0' : '') + seconds + ' s';
      countdown.dateTime = 'PT' + hours + 'H' + minutes + 'M' + seconds + 'S';
      markAsBought.disabled = remaining > 0;
      markAsBought.setAttribute('aria-disabled', String(remaining > 0));

      if (lockReason && remaining === 0) {
        lockReason.textContent = 'The cooling-off period is complete. You can now mark this item as bought.';
      }

      return remaining > 0;
    }

    if (updateCountdown()) {
      var intervalId = window.setInterval(function () {
        if (!updateCountdown()) {
          window.clearInterval(intervalId);
        }
      }, 1000);
    }
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
    initHistory();
    initVerdictCountdown();

    var stepForm = document.querySelector('[data-step]');
    var itemForm = document.querySelector("form[data-step='item']");
    var usageForm = document.querySelector("form[data-step='usage']");
    var redundancyForm = document.querySelector("form[data-step='redundancy']");
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
          var missingFields = [];
          if (!itemName || itemName.value.trim() === '') {
            missingFields.push('item name');
          }
          if (!itemPrice || Number(itemPrice.value) <= 0) {
            missingFields.push('a price greater than zero');
          }
          if (!itemCategory || itemCategory.value === '') {
            missingFields.push('a category');
          }
          if (!trigger) {
            missingFields.push('why you want the item now');
          }
          window.alert('Please complete the required fields: ' + missingFields.join(', ') + '.');
          return;
        }

        formDraft(itemForm);
      });
    } else if (usageForm) {
      var usesPerMonth = usageForm.querySelector('#uses-per-month');
      var lifespanMonths = usageForm.querySelector('#lifespan');
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
          window.alert('Please enter a positive value for uses per month and expected lifespan.');
          return;
        }

        formDraft(usageForm);
      });
    } else if (redundancyForm) {
      redundancyForm.addEventListener('submit', function (event) {
        var owned = redundancyForm.querySelectorAll('input[name="owned"]:checked');
        var access = redundancyForm.querySelector('input[name="access"]:checked');
        var alternativeName = redundancyForm.querySelector('#alt-name');
        var alternativePrice = redundancyForm.querySelector('#alt-price');
        var hasAlternative = alternativeName && alternativeName.value.trim() !== ''
          || alternativePrice && alternativePrice.value !== '';
        var hasCompleteAlternative = alternativeName && alternativeName.value.trim() !== ''
          && alternativePrice && Number(alternativePrice.value) > 0;
        var missingFields = [];

        if (owned.length === 0) {
          missingFields.push('whether you own something that meets this need');
        }
        if (!access) {
          missingFields.push('how else you could get the item');
        }
        if (hasAlternative && !hasCompleteAlternative) {
          missingFields.push('both the alternative name and a positive alternative price');
        }

        if (missingFields.length > 0) {
          event.preventDefault();
          window.alert('Please complete the required fields: ' + missingFields.join(', ') + '.');
          return;
        }

        formDraft(redundancyForm);
      });
    } else if (stepForm) {
      stepForm.addEventListener('submit', function () {
        formDraft(stepForm);
      });
    }

    var decisionForm = document.querySelector('[data-decision]');
    if (decisionForm) {
      decisionForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var submitter = event.submitter;
        var status = document.getElementById('decision-save-status');
        if (status) {
          status.hidden = false;
          status.textContent = 'Saving decision...';
        }

        saveDecision({
          outcome: submitter ? submitter.value : '',
          draft: getDraft()
        }).then(function () {
          window.location.href = 'history.html';
        }).catch(function (error) {
          console.error('VETO could not save decision.', error);
          if (status) {
            status.hidden = false;
            status.textContent = 'Could not save your decision. Make sure the VETO server is running, then try again.';
          }
        });
      });
    }
  }

  window.getDraft = getDraft;
  window.saveDraft = saveDraft;
  window.getDecisions = getDecisions;
  window.saveDecision = saveDecision;
  window.initVerdictCountdown = initVerdictCountdown;
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
    initVerdictCountdown: initVerdictCountdown,
    calculateCostPerUse: calculateCostPerUse,
    calculateImpulseScore: calculateImpulseScore,
    updateSidebarBill: updateSidebarBill,
    initStepRouting: initStepRouting,
    syncNavigationState: syncNavigationState
  };

  document.addEventListener('DOMContentLoaded', initialize);
}());

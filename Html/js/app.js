(function () {
  'use strict';

  var DRAFT_KEY = 'vetoDraft';
  var DECISIONS_KEY = 'vetoDecisions';
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
    'altPrice',
    'categoryAnswers'
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
    altPrice: '',
    categoryAnswers: {}
  };
  var HONESTY_CHECK_COUNT = 3;
  var PRICE_SCORE_THRESHOLDS = [
    { minimum: 10000, points: 30 },
    { minimum: 5000, points: 20 },
    { minimum: 2500, points: 10 }
  ];
  var SHOPPING_SOURCES = {
    electronics: [
      ['Amazon India', 'https://www.amazon.in/s?k='],
      ['Flipkart', 'https://www.flipkart.com/search?q='],
      ['Croma', 'https://www.croma.com/searchB?q=']
    ],
    kitchen: [
      ['Amazon India', 'https://www.amazon.in/s?k='],
      ['Flipkart', 'https://www.flipkart.com/search?q='],
      ['Croma', 'https://www.croma.com/searchB?q=']
    ],
    'fast-fashion': [
      ['Myntra', 'https://www.myntra.com/'],
      ['AJIO', 'https://www.ajio.com/search/?text='],
      ['Amazon India', 'https://www.amazon.in/s?k=']
    ],
    footwear: [
      ['Myntra', 'https://www.myntra.com/'],
      ['AJIO', 'https://www.ajio.com/search/?text='],
      ['Amazon India', 'https://www.amazon.in/s?k=']
    ],
    fitness: [
      ['Decathlon India', 'https://www.decathlon.in/search?query='],
      ['Amazon India', 'https://www.amazon.in/s?k='],
      ['Flipkart', 'https://www.flipkart.com/search?q=']
    ],
    furniture: [
      ['IKEA India', 'https://www.ikea.com/in/en/search/?q='],
      ['Pepperfry', 'https://www.pepperfry.com/site_product/search?q='],
      ['Amazon India', 'https://www.amazon.in/s?k=']
    ],
    hobby: [
      ['Itsy Bitsy', 'https://itsybitsy.in/search?q='],
      ['Amazon India', 'https://www.amazon.in/s?k='],
      ['Flipkart', 'https://www.flipkart.com/search?q=']
    ],
    books: [
      ['Amazon India', 'https://www.amazon.in/s?k='],
      ['Flipkart', 'https://www.flipkart.com/search?q='],
      ['Crossword', 'https://www.crossword.in/search?q=']
    ],
    other: [
      ['Amazon India', 'https://www.amazon.in/s?k='],
      ['Flipkart', 'https://www.flipkart.com/search?q='],
      ['Tata CLiQ', 'https://www.tatacliq.com/search/?searchCategory=all&text=']
    ]
  };
  var CATEGORY_PURCHASE_TIPS = {
    electronics: 'Check warranty length, repairability, seller rating and whether the model is new or refurbished.',
    kitchen: 'Check power use, counter space, cleaning effort and whether the appliance is safe for your cooking routine.',
    'fast-fashion': 'Check the size guide, fabric care, return window and whether it works with clothes you already own.',
    footwear: 'Check fit and return terms, plus whether the shoe suits the surface and activity you named.',
    fitness: 'Check setup space, safe-use guidance, delivery cost and whether a trial or rental is available.',
    furniture: 'Measure the room and delivery path; check assembly, delivery fees and return conditions.',
    hobby: 'Check that the kit includes the tools and materials you need, and compare it with a smaller starter set.',
    books: 'Check the edition, format, delivery cost and whether a library or legal digital copy is available.',
    other: 'Compare the full delivered price, seller reputation, warranty and return policy.'
  };

  function calculateCostPerUse(price, usesPerMonth, lifespanMonths) {
    return Math.round(price / (usesPerMonth * lifespanMonths));
  }

  function getExclusiveOwnedSelection(selectedValues, changedValue, isChecked) {
    var values = Array.isArray(selectedValues)
      ? selectedValues.filter(function (value, index, list) {
        return typeof value === 'string' && value !== '' && list.indexOf(value) === index;
      })
      : [];
    if (changedValue === 'none' && isChecked) return ['none'];
    if (changedValue !== 'none' && isChecked) {
      return values.filter(function (value) { return value !== 'none'; });
    }
    if (values.indexOf('none') !== -1) return ['none'];
    return values.filter(function (value) { return value !== 'none'; });
  }

  function getShoppingLinks(draft) {
    var source = draft && typeof draft === 'object' ? draft : {};
    var query = typeof source.name === 'string' ? source.name.trim() : '';
    if (!query) return [];
    var shops = SHOPPING_SOURCES[source.category] || SHOPPING_SOURCES.other;
    return shops.map(function (shop) {
      return {
        name: shop[0],
        url: shop[1] + encodeURIComponent(query)
      };
    });
  }

  function getPurchaseTip(draft, score, hasDuplicate) {
    var categoryTip = CATEGORY_PURCHASE_TIPS[draft.category] || CATEGORY_PURCHASE_TIPS.other;
    if (hasDuplicate) {
      return 'You marked a route that may already meet this need. Try it first if it is safe and practical; ' +
        categoryTip + ' VETO’s 48-hour pause is optional.';
    }
    if (score >= 75) {
      return 'Your answers show higher purchase risk. Compare the full delivered price and return terms before deciding. ' +
        categoryTip + ' Buying now is still your choice.';
    }
    return categoryTip + ' Compare at least two listings; VETO does not verify live prices or endorse a seller.';
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

    var categoryAnswers = source.categoryAnswers && typeof source.categoryAnswers === 'object'
      ? source.categoryAnswers
      : {};
    if (source.category === 'kitchen') {
      if (categoryAnswers.needLevel === 'novel') score += 15;
      else if (categoryAnswers.needLevel === 'helpful') score += 8;
      if (categoryAnswers.manualAlternative === 'easy') score += 10;
    } else if (source.category === 'hobby') {
      if (categoryAnswers.commitment === 'idea') score += 20;
      else if (categoryAnswers.commitment === 'starting') score += 10;
      if (categoryAnswers.trial === 'available') score -= 5;
    } else if (source.category === 'fast-fashion') {
      if (categoryAnswers.wardrobeGap === 'want') score += 15;
      else if (categoryAnswers.wardrobeGap === 'similar') score += 10;
      if (categoryAnswers.saleTrigger === 'high') score += 10;
    } else if (source.category === 'footwear') {
      if (categoryAnswers.purpose === 'desire') score += 15;
      if (categoryAnswers.fit === 'no') score += 10;
    } else if (source.category === 'fitness') {
      if (categoryAnswers.goal === 'desire') score += 15;
      if (categoryAnswers.usedBefore === 'no') score += 10;
    } else if (source.category === 'furniture') {
      if (categoryAnswers.problem === 'style') score += 15;
      if (categoryAnswers.existing === 'easy') score += 10;
    } else if (source.category === 'electronics') {
      if (categoryAnswers.replacementReason === 'want') score += 15;
      if (categoryAnswers.repairable === 'yes') score += 10;
    } else if (source.category === 'books') {
      if (categoryAnswers.purpose === 'collection') score += 15;
      if (categoryAnswers.access === 'free' || categoryAnswers.access === 'library') score -= 5;
    } else if (source.category === 'other') {
      if (categoryAnswers.need === 'desire') score += 15;
      if (categoryAnswers.replacement === 'exists') score += 10;
    }

    return Math.max(0, Math.min(100, score));
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
    var ownedValue = sidebar.querySelector("[data-field='owned']");
    var alternativeValue = sidebar.querySelector("[data-field='alternative']");
    var factorsValue = sidebar.querySelector("[data-field='factors']");
    var verdictPreview = sidebar.querySelector("[data-verdict-preview]");

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
    if (ownedValue) {
      var ownedItems = Array.isArray(source.owned) ? source.owned : [];
      ownedValue.textContent = ownedItems.filter(function (item) { return item !== 'none'; }).join(', ') || 'none';
    }
    if (alternativeValue) {
      alternativeValue.textContent = source.altName
        ? source.altName + (Number(source.altPrice) > 0 ? ', ' + formatRupees(Number(source.altPrice)) : '')
        : 'not set';
    }
    if (factorsValue) {
      var answered = [source.trigger, isUsageValid, source.honesty.length > 0, Array.isArray(source.owned) && source.owned.length > 0, source.access].filter(Boolean).length;
      factorsValue.textContent = answered + ' of 5';
    }
    if (verdictPreview) {
      verdictPreview.textContent = score === null
        ? 'Verdict pending'
        : score >= 90 ? 'Skip recommended' : score >= 75 ? '48-hour wait' : 'Consider buying';
    }
    var redundancyStatus = sidebar.querySelector("[data-redundancy-status]");
    if (redundancyStatus) {
      var ownedItems = Array.isArray(source.owned) ? source.owned : [];
      redundancyStatus.textContent = ownedItems.length === 0
        ? 'Redundancy pending'
        : ownedItems.indexOf('none') !== -1
          ? 'No duplicate selected'
          : 'Alternative route selected';
      redundancyStatus.className = ownedItems.length === 0
        ? 'pill pill--wait'
        : ownedItems.indexOf('none') !== -1
          ? 'pill pill--good'
          : 'pill pill--stop';
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
      altPrice: DEFAULT_DRAFT.altPrice,
      categoryAnswers: {}
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
    normalized.categoryAnswers = normalized.categoryAnswers
      && typeof normalized.categoryAnswers === 'object'
      && !Array.isArray(normalized.categoryAnswers)
      ? normalized.categoryAnswers
      : {};

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

  function initHistoryAnalytics() {
      var values = document.querySelectorAll('[data-analytics]');
      if (values.length === 0) return;

      requestJson('/api/analytics/summary').then(function (summary) {
        values.forEach(function (element) {
          var key = element.getAttribute('data-analytics');
          if (key === 'estimatedMoneyAvoided') {
            element.textContent = formatRupees(summary.estimatedMoneyAvoided || 0);
          } else if (key === 'averageImpulseScore') {
            element.textContent = summary.averageImpulseScore === null
              ? '-'
              : summary.averageImpulseScore + '/100';
          } else {
            element.textContent = String(summary[key] || 0);
          }
        });
      }).catch(function (error) {
        console.error('VETO could not load analytics.', error);
      });
      Promise.all([requestJson('/api/decisions'), requestJson('/api/analytics/summary')])
        .then(function (responses) {
          var decisions = responses[0].decisions || [];
          var summary = responses[1];
          var summaryText = document.querySelector('[data-history-summary]');
          if (summaryText) {
            summaryText.textContent = decisions.length === 0
              ? 'No purchase checks are saved yet.'
              : summary.totalDecisions + ' saved checks: ' + summary.purchases + ' purchased, '
                + summary.delayed + ' waiting, and ' + summary.skipped + ' skipped.';
          }
          var auditCallout = document.querySelector('[data-audit-callout]');
          if (auditCallout) {
            var thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
            var audits = decisions.filter(function (decision) {
              var saved = Date.parse(decision.savedAt);
              return (decision.outcome === 'bought' || decision.outcome === 'delayed')
                && isFinite(saved) && saved <= thirtyDaysAgo;
            });
            if (audits.length > 0) {
              auditCallout.querySelector('.callout__title').textContent =
                audits.length + (audits.length === 1 ? ' usage audit is due' : ' usage audits are due');
              auditCallout.querySelector('p:nth-of-type(2)').textContent =
                audits.map(function (decision) {
                  return decision.draft.name || 'Unnamed item';
                }).join(', ') + ' has reached the 30-day follow-up period.';
            }
          }
        }).catch(function (error) {
          console.error('VETO could not load history details.', error);
        });
    }

  function initAlternatives() {
      var form = document.querySelector('[action="alternatives.html"][method="get"]');
      var results = document.querySelector('[data-product-results]');
      var status = document.querySelector('[data-product-status]');
      if (!form || !results) return;

      var searchInput = document.getElementById('alt-search');
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        var query = searchInput ? searchInput.value.trim() : '';
        if (!query) {
          if (status) status.textContent = 'Enter a product name to search live listings.';
          return;
        }
        if (status) status.textContent = 'Searching eBay listings...';
        results.textContent = '';

        requestJson('/api/products/search?q=' + encodeURIComponent(query)).then(function (data) {
          if (!Array.isArray(data.products) || data.products.length === 0) {
            if (status) status.textContent = 'No verified listings were returned.';
            return;
          }
          if (status) status.textContent = data.products.length + ' live listings returned.';
          data.products.forEach(function (product) {
            var item = document.createElement('li');
            var title = document.createElement('h3');
            var description = document.createElement('p');
            var link = document.createElement('a');

            item.className = 'card';
            title.className = 'sub-title';
            title.textContent = product.title;
            description.className = 'muted mt-3';
            description.textContent = [
              product.price ? product.price.value + ' ' + product.price.currency : 'Price not provided',
              product.condition || 'Condition not provided',
              product.seller ? 'Seller: ' + product.seller : ''
            ].filter(Boolean).join(' · ');
            link.className = 'text-link';
            link.href = product.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = 'View listing';
            item.appendChild(title);
            item.appendChild(description);
            if (product.imageUrl) {
              var image = document.createElement('img');
              image.src = product.imageUrl;
              image.alt = '';
              image.loading = 'lazy';
              image.className = 'mt-3';
              item.appendChild(image);
            }
            item.appendChild(link);
            link.className += ' mt-3';
            results.appendChild(item);
          });
        }).catch(function (error) {
          if (status) status.textContent = error.message;
        });
      });
    }

  function initPurchaseCoach() {
      var coach = document.querySelector('[data-coach]');
      var button = document.querySelector('[data-coach-button]');
      var status = document.querySelector('[data-coach-status]');
      var result = document.querySelector('[data-coach-result]');
      if (!coach || !button) return;

      button.addEventListener('click', function () {
        button.disabled = true;
        if (status) status.textContent = 'Analyzing this purchase...';
        if (result) result.hidden = true;
        requestJson('/api/coach/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(getDraft())
        }).then(function (data) {
          if (status) status.textContent = 'Adviser response received.';
          if (!result) return;
          result.hidden = false;
          result.textContent = '';
          var fields = [
            ['Analysis', data.analysis],
            ['Risk factors', data.riskFactors.join('; ')],
            ['Questions', data.questions.join('; ')],
            ['Suggestions', data.suggestions.join('; ')],
            ['Recommendation', data.recommendation],
            ['Explanation', data.explanation]
          ];
          fields.forEach(function (field) {
            var paragraph = document.createElement('p');
            var strong = document.createElement('strong');
            strong.textContent = field[0] + ': ';
            paragraph.appendChild(strong);
            paragraph.appendChild(document.createTextNode(field[1]));
            paragraph.className = 'mt-3';
            result.appendChild(paragraph);
          });
        }).catch(function (error) {
          if (status) status.textContent = error.message;
        }).finally(function () {
          button.disabled = false;
        });
      });
    }

  function scheduleDecisionReminders(savedDecision) {
      if (!savedDecision || !savedDecision.id) return Promise.resolve();
      var name = savedDecision.draft.name || 'your purchase';
      var reminders = [];
      if (savedDecision.outcome === 'delayed') {
        reminders.push({
          decisionId: savedDecision.id,
          type: 'cooling-off',
          dueAt: new Date(Date.now() + COOLING_OFF_MS).toISOString(),
          message: 'Your optional 48-hour pause for ' + name + ' is over. Recheck the need and budget before deciding.'
        });
      }
      if (savedDecision.outcome === 'bought') {
        reminders.push({
          decisionId: savedDecision.id,
          type: 'usage-audit',
          dueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          message: 'How often have you used ' + name + '? Record the real number to improve your VETO estimates.'
        });
      }

      return reminders.reduce(function (chain, reminder) {
        return chain.then(function () {
          return requestJson('/api/reminders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reminder)
          });
        });
      }, Promise.resolve());
    }

  function initReminderSupport() {
      var button = document.getElementById('enable-reminders');
      var status = document.getElementById('reminder-status');
      if (!button) return;
      if (!('serviceWorker' in navigator) || !('Notification' in window) || !('PushManager' in window)) {
        button.disabled = true;
        if (status) status.textContent = 'This browser does not support Web Push reminders. Try a current browser on HTTPS or localhost.';
        return;
      }
      var registrationError = null;
      var registrationPromise = navigator.serviceWorker.register('/sw.js').catch(function (error) {
        console.error('VETO could not register the reminder service worker.', error);
        registrationError = error;
        if (status) status.textContent = 'Could not set up browser reminders: ' + error.message;
        return null;
      });
      function urlBase64ToUint8Array(base64String) {
        var padding = '='.repeat((4 - base64String.length % 4) % 4);
        var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        var raw = window.atob(base64);
        var output = new Uint8Array(raw.length);
        for (var index = 0; index < raw.length; index += 1) {
          output[index] = raw.charCodeAt(index);
        }
        return output;
      }
      button.addEventListener('click', function () {
        button.disabled = true;
        if (status) status.textContent = 'Checking Web Push configuration...';
        requestJson('/api/push/public-key').then(function (data) {
          if (window.Notification.permission === 'denied') {
            throw new Error('Notifications are blocked in browser settings. Allow them for VETO, then try again.');
          }
          var permissionPromise = window.Notification.permission === 'granted'
            ? Promise.resolve('granted')
            : window.Notification.requestPermission();
          return permissionPromise.then(function (permission) {
            if (permission !== 'granted') {
              throw new Error('Browser notification permission was not granted.');
            }
            return registrationPromise;
          }).then(function (registration) {
            if (!registration) {
              throw new Error('Browser reminder setup failed: ' + (registrationError ? registrationError.message : 'service worker unavailable.'));
            }
            return registration.pushManager.getSubscription().then(function (existingSubscription) {
              return existingSubscription || registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(data.publicKey)
              });
            });
          }).then(function (subscription) {
            return requestJson('/api/push/subscribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(subscription.toJSON())
            });
          });
        }).then(function () {
          button.textContent = 'Browser reminders enabled';
          if (status) status.textContent = 'This browser is subscribed. VETO will send relevant reminders after you save a wait or purchase; keep the VETO server running.';
        }).catch(function (error) {
          button.disabled = false;
          if (status) status.textContent = error.message;
        });
      });
    }

  function initVerdictSummary() {
      if (!document.querySelector('[data-verdict-title]')) return;
      var draft = getDraft();
      var title = document.querySelector('main .page-title');
      var lead = title ? title.nextElementSibling : null;
      var name = draft.name || 'Your purchase';
      var price = Number(draft.price);
      var usesPerMonth = Number(draft.usesPerMonth);
      var lifespanMonths = Number(draft.lifespanMonths);
      var totalUses = usesPerMonth * lifespanMonths;
      var score = calculateImpulseScore(draft);
      var decision = score >= 90 ? 'skip it' : score >= 75 ? 'wait 48 hours' : 'consider buying';
      var titleElement = document.querySelector('[data-verdict-title]');
      var summaryElement = document.querySelector('[data-verdict-summary]');
      if (titleElement) titleElement.textContent = name + ': ' + decision;
      if (summaryElement) {
        lead.textContent = totalUses > 0
          ? name + ' has an estimated cost per use of ' + formatRupees(calculateCostPerUse(price, usesPerMonth, lifespanMonths)) + ' and an impulse score of ' + score + ' out of 100.'
          : name + ' has an impulse score of ' + score + ' out of 100.';
        summaryElement.textContent = lead.textContent;
      }
      if (title) title.textContent = name + ': ' + decision;
      if (lead && !summaryElement) lead.textContent =
        name + ' has an impulse score of ' + score + ' out of 100.';

      var duplicateText = document.querySelector('[data-verdict-duplicate-text]');
      var ownedItems = Array.isArray(draft.owned) ? draft.owned : [];
      var hasDuplicate = ownedItems.some(function (item) { return item !== 'none'; });
      if (duplicateText) {
        duplicateText.textContent = hasDuplicate
          ? 'A similar item was selected as already owned: ' + ownedItems.filter(function (item) { return item !== 'none'; }).join(', ') + '.'
          : 'No duplicate was selected.';
      }

      var costText = document.querySelector('[data-verdict-cost-text]');
      if (costText) {
        costText.textContent = totalUses > 0
          ? formatRupees(calculateCostPerUse(price, usesPerMonth, lifespanMonths)) + ' per use across ' + totalUses + ' estimated uses.'
          : 'Complete item and usage details to calculate cost per use.';
      }

      var alternativeText = document.querySelector('[data-verdict-alternative-text]');
      if (alternativeText) {
        alternativeText.textContent = draft.altName && Number(draft.altPrice) > 0
          ? draft.altName + ' is listed at ' + formatRupees(Number(draft.altPrice)) + '.'
          : 'No alternative name and positive price were entered.';
      }

      var shoppingLinks = document.querySelector('[data-shopping-links]');
      var shoppingGuidance = document.querySelector('[data-shopping-guidance]');
      var shoppingItem = document.querySelector('[data-shopping-item]');
      if (shoppingItem) shoppingItem.textContent = draft.name || 'this item';
      if (shoppingLinks) {
        shoppingLinks.textContent = '';
        getShoppingLinks(draft).forEach(function (shop) {
          var link = document.createElement('a');
          link.className = 'btn btn--secondary';
          link.href = shop.url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = 'Search ' + shop.name;
          shoppingLinks.appendChild(link);
        });
      }
      if (shoppingGuidance) {
        shoppingGuidance.textContent = getPurchaseTip(draft, score, hasDuplicate);
      }

      var scoreCaption = document.querySelector('[data-score-caption]');
      var scoreRows = document.querySelector('[data-score-breakdown]');
      if (scoreCaption) scoreCaption.textContent = 'How the impulse score of ' + score + ' was reached';
      if (scoreRows) {
        scoreRows.textContent = '';
        [
          ['Purchase trigger', draft.trigger || 'not set', draft.trigger === 'impulse' ? '25 of 25' : draft.trigger === 'offer' ? '15 of 15' : '0 of 25'],
          ['Duplicate already owned', hasDuplicate ? ownedItems.filter(function (item) { return item !== 'none'; }).join(', ') : 'none', hasDuplicate ? '25 of 25' : '0 of 25'],
          ['Honesty checks completed', draft.honesty.length + ' of 3', Math.max(0, 3 - draft.honesty.length) * 10 + ' points for unanswered checks'],
          ['Price threshold', formatRupees(price), price >= 10000 ? '30 of 30' : price >= 5000 ? '20 of 30' : price >= 2500 ? '10 of 30' : '0 of 30']
        ].forEach(function (rowValues) {
          var row = document.createElement('tr');
          rowValues.forEach(function (value, index) {
            var cell = document.createElement(index === 0 ? 'th' : 'td');
            if (index === 0) cell.scope = 'row';
            cell.textContent = value;
            row.appendChild(cell);
          });
          scoreRows.appendChild(row);
        });
      }

      var usageLabel = document.querySelector('[data-field="usage-label"]');
      var comparisonSummary = document.querySelector('[data-comparison-summary]');
      var comparisonCost = document.querySelector('[data-comparison-cost]');
      var comparisonPrice = document.querySelector('[data-comparison-price]');
      var comparisonUses = document.querySelector('[data-comparison-uses]');
      var comparisonAltCost = document.querySelector('[data-comparison-alt-cost]');
      var comparisonAltPrice = document.querySelector('[data-comparison-alt-price]');
      var comparisonAltUses = document.querySelector('[data-comparison-alt-uses]');
      var comparisonAltName = document.querySelector('[data-comparison-alt-name]');
      var comparisonOwned = document.querySelector('[data-comparison-owned]');

      if (usageLabel) usageLabel.textContent =
        usesPerMonth > 0 && lifespanMonths > 0
          ? usesPerMonth + ' uses a month for ' + lifespanMonths + ' months'
          : 'Usage not set';
      if (comparisonSummary) {
        comparisonSummary.textContent = totalUses > 0
          ? 'Calculated from ' + totalUses + ' estimated uses over ' + lifespanMonths + ' months.'
          : 'Complete the usage step to calculate this comparison.';
      }
      if (comparisonCost) comparisonCost.textContent = totalUses > 0
        ? formatRupees(calculateCostPerUse(price, usesPerMonth, lifespanMonths))
        : '-';
      if (comparisonPrice) comparisonPrice.textContent = price > 0 ? formatRupees(price) : '-';
      if (comparisonUses) comparisonUses.textContent = totalUses > 0 ? String(totalUses) : '-';
      if (comparisonAltPrice) comparisonAltPrice.textContent =
        draft.altName && Number(draft.altPrice) > 0 ? formatRupees(Number(draft.altPrice)) : '-';
      if (comparisonAltUses) comparisonAltUses.textContent = totalUses > 0 ? String(totalUses) : '-';
      if (comparisonAltName) comparisonAltName.textContent = draft.altName || 'No alternative entered';
      if (comparisonAltCost) comparisonAltCost.textContent =
        draft.altName && Number(draft.altPrice) > 0 && totalUses > 0
          ? formatRupees(Math.round(Number(draft.altPrice) / totalUses))
          : '-';
      if (comparisonOwned) comparisonOwned.textContent =
        hasDuplicate ? ownedItems.filter(function (item) { return item !== 'none'; }).join(', ') : 'None selected';
    }

  function formDraft(form) {
    var draft = getDraft();
    var formData = new FormData(form);
    var categoryAnswers = Object.assign({}, draft.categoryAnswers || {});

    Array.prototype.forEach.call(form.elements, function (control) {
      if (!control.name || control.name.indexOf('categoryAnswer.') !== 0) return;
      var name = control.name.split('.')[1];
      if (control.type === 'checkbox') {
        if (!Array.isArray(categoryAnswers[name])) categoryAnswers[name] = [];
        if (control.checked && categoryAnswers[name].indexOf(control.value) === -1) {
          categoryAnswers[name].push(control.value);
        } else if (!control.checked) {
          categoryAnswers[name] = categoryAnswers[name].filter(function (value) {
            return value !== control.value;
          });
        }
      } else if (control.type === 'radio' && control.checked) {
        categoryAnswers[name] = control.value;
      }
    });
    draft.categoryAnswers = categoryAnswers;

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
    initHistoryAnalytics();
    initAlternatives();
    initPurchaseCoach();
    initReminderSupport();
    initVerdictSummary();

    var stepForm = document.querySelector('[data-step]');
    var itemForm = document.querySelector("form[data-step='item']");
    var usageForm = document.querySelector("form[data-step='usage']");
    var redundancyForm = document.querySelector("form[data-step='redundancy']");
    if (stepForm) {
      restoreForm(stepForm);
      if (redundancyForm) {
        var ownedContainer = redundancyForm.querySelector('[data-redundancy-options]');
        if (ownedContainer) {
          function syncOwnedChoices(changedInput) {
            var inputs = ownedContainer.querySelectorAll('input[name="owned"]');
            var checkedValues = Array.prototype.map.call(inputs, function (input) {
              return input.checked ? input.value : null;
            }).filter(Boolean);
            var selected = getExclusiveOwnedSelection(
              checkedValues,
              changedInput ? changedInput.value : null,
              changedInput ? changedInput.checked : false
            );
            var hasNone = selected.indexOf('none') !== -1;
            var hasAlternatives = selected.length > 0 && !hasNone;

            Array.prototype.forEach.call(inputs, function (input) {
              input.checked = selected.indexOf(input.value) !== -1;
              input.disabled = input.value === 'none' ? hasAlternatives : hasNone;
              var label = input.closest('label');
              if (label) label.classList.toggle('choice--disabled', input.disabled);
            });
          }

          syncOwnedChoices(null);
          formDraft(redundancyForm);
          ownedContainer.addEventListener('change', function (event) {
            if (!event.target || event.target.name !== 'owned') return;
            syncOwnedChoices(event.target);
            formDraft(redundancyForm);
          });
        }
      }
      stepForm.addEventListener('input', function () {
        updateSidebarBill(formDraft(stepForm));
      });
      stepForm.addEventListener('change', function () {
        updateSidebarBill(formDraft(stepForm));
      });
    }
    updateSidebarBill(getDraft());

    function initCategorySurvey() {
      var container = document.querySelector('[data-category-survey-fields]');
      if (!container || !window.getVetoCategorySurvey) return;
      var draft = getDraft();
      var survey = window.getVetoCategorySurvey(draft.category);

      var title = document.querySelector('[data-category-survey-title]');
      var heading = document.querySelector('h1.page-title');
      var lead = heading ? heading.nextElementSibling : null;
      if (title) title.textContent = survey.name === 'other'
        ? 'Other purchase check'
        : survey.name.charAt(0).toUpperCase() + survey.name.slice(1).replace('-', ' ') + ' check';
      if (lead) lead.textContent = 'Answer questions designed for ' +
        (survey.name === 'other' ? 'this purchase category' : survey.name.replace('-', ' ')) +
        ', using real habits instead of a generic estimate.';

      var usageSlider = document.getElementById('uses-per-month');
      var lifespanSlider = document.getElementById('lifespan');
      var usageLabel = document.querySelector('label[for="uses-per-month"]');
      var lifespanLabel = document.querySelector('label[for="lifespan"]');
      if (usageSlider) {
        usageSlider.max = survey.usageMax;
        if (!draft.usesPerMonth) usageSlider.value = survey.usageDefault;
        else usageSlider.value = draft.usesPerMonth;
      }
      if (lifespanSlider) {
        lifespanSlider.max = survey.lifespanMax;
        if (!draft.lifespanMonths) lifespanSlider.value = survey.lifespanDefault;
        else lifespanSlider.value = draft.lifespanMonths;
      }
      if (usageLabel) usageLabel.textContent = survey.usageLabel;
      if (lifespanLabel) lifespanLabel.textContent = survey.lifespanLabel;

      container.textContent = '';
      survey.questions.forEach(function (question) {
        var fieldset = document.createElement('fieldset');
        fieldset.className = 'fieldset';
        var legend = document.createElement('legend');
        legend.className = 'legend';
        legend.textContent = question.label;
        fieldset.appendChild(legend);
        var choiceList = document.createElement('div');
        choiceList.className = 'choice-list mt-4';
        question.options.forEach(function (option) {
          var label = document.createElement('label');
          var input = document.createElement('input');
          var text = document.createElement('span');
          label.className = 'choice';
          input.type = question.type;
          input.name = 'categoryAnswer.' + question.name;
          input.value = option[0];
          if (draft.categoryAnswers && Array.isArray(draft.categoryAnswers[question.name])) {
            input.checked = draft.categoryAnswers[question.name].indexOf(option[0]) !== -1;
          } else if (draft.categoryAnswers && draft.categoryAnswers[question.name] === option[0]) {
            input.checked = true;
          }
          text.className = 'choice__text';
          var title = document.createElement('span');
          title.className = 'choice__title';
          title.textContent = option[1];
          text.appendChild(title);
          label.appendChild(input);
          label.appendChild(text);
          choiceList.appendChild(label);
        });
        fieldset.appendChild(choiceList);
        container.appendChild(fieldset);
      });

      if (usageSlider) usageSlider.value = draft.usesPerMonth || survey.usageDefault;
      if (lifespanSlider) lifespanSlider.value = draft.lifespanMonths || survey.lifespanDefault;
      var usageReadout = document.querySelector("[data-field='uses-per-month']");
      var lifespanReadout = document.querySelector("[data-field='lifespan']");
      if (usageReadout && usageSlider) usageReadout.textContent = usageSlider.value + ' a month';
      if (lifespanReadout && lifespanSlider) lifespanReadout.textContent = lifespanSlider.value + ' months';
      saveDraft(normalizeDraft(Object.assign({}, draft, {
        usesPerMonth: usageSlider ? usageSlider.value : draft.usesPerMonth,
        lifespanMonths: lifespanSlider ? lifespanSlider.value : draft.lifespanMonths
      })));
    }

    function initCategoryRedundancy() {
      var container = document.querySelector('[data-redundancy-options]');
      if (!container || !window.getVetoCategorySurvey) return;
      var draft = getDraft();
      var survey = window.getVetoCategorySurvey(draft.category);
      var title = document.querySelector('[data-redundancy-title]');
      var hint = document.querySelector('[data-redundancy-hint]');
      if (title) title.textContent = survey.redundancyTitle;
      if (hint) hint.textContent = 'Select every useful route, or choose “Nothing here covers the need.” These choices cannot be combined.';

      container.textContent = '';
      survey.redundancyOptions.forEach(function (option) {
        var label = document.createElement('label');
        var input = document.createElement('input');
        var text = document.createElement('span');
        label.className = 'choice';
        input.type = 'checkbox';
        input.name = 'owned';
        input.value = option[0];
        if (Array.isArray(draft.owned) && draft.owned.indexOf(option[0]) !== -1) input.checked = true;
        text.className = 'choice__text';
        var titleSpan = document.createElement('span');
        titleSpan.className = 'choice__title';
        titleSpan.textContent = option[1];
        text.appendChild(titleSpan);
        label.appendChild(input);
        label.appendChild(text);
        container.appendChild(label);
      });

      var noneLabel = document.createElement('label');
      var noneInput = document.createElement('input');
      var noneText = document.createElement('span');
      noneLabel.className = 'choice';
      noneInput.type = 'checkbox';
      noneInput.name = 'owned';
      noneInput.value = 'none';
      if (Array.isArray(draft.owned) && draft.owned.indexOf('none') !== -1) noneInput.checked = true;
      noneText.className = 'choice__text';
      var noneTitle = document.createElement('span');
      noneTitle.className = 'choice__title';
      noneTitle.textContent = 'Nothing here covers the need';
      noneText.appendChild(noneTitle);
      noneLabel.appendChild(noneInput);
      noneLabel.appendChild(noneText);
      container.appendChild(noneLabel);
    }

    initCategorySurvey();
    initCategoryRedundancy();

    function initHomeSummary() {
      var summary = document.querySelector('[data-home-summary]');
      if (!summary) return;
      getDecisions().then(function (decisions) {
        if (!Array.isArray(decisions) || decisions.length === 0) {
          var status = document.querySelector('[data-home-status]');
          if (status) status.textContent = 'Start a check';
          return;
        }
        var decision = decisions[0];
        var draft = normalizeDraft(decision.draft);
        var price = Number(draft.price);
        var uses = Number(draft.usesPerMonth) * Number(draft.lifespanMonths);
        var name = document.querySelector('[data-home-name]');
        var homePrice = document.querySelector('[data-home-price]');
        var usage = document.querySelector('[data-home-usage]');
        var lifespan = document.querySelector('[data-home-lifespan]');
        var total = document.querySelector('[data-home-total]');
        var cost = document.querySelector('[data-home-cost]');
        var status = document.querySelector('[data-home-status]');
        if (name) name.textContent = draft.name || 'Unnamed item';
        if (homePrice) homePrice.textContent = price > 0 ? formatRupees(price) : '-';
        if (usage) usage.textContent = Number(draft.usesPerMonth) > 0 ? draft.usesPerMonth + ' a month' : '-';
        if (lifespan) lifespan.textContent = Number(draft.lifespanMonths) > 0 ? draft.lifespanMonths + ' months' : '-';
        if (total) total.textContent = uses > 0 ? String(uses) : '-';
        if (cost) cost.textContent = price > 0 && uses > 0
          ? formatRupees(calculateCostPerUse(price, Number(draft.usesPerMonth), Number(draft.lifespanMonths)))
          : '-';
        if (status) status.textContent = getDecisionStatus(decision.outcome).label;
      }).catch(function (error) {
        console.error('VETO could not load the latest saved check.', error);
      });
    }

    initHomeSummary();

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
        }).then(function (savedDecision) {
          return scheduleDecisionReminders(savedDecision).catch(function (error) {
            console.error('VETO could not schedule every reminder.', error);
          }).then(function () {
            window.location.href = 'history.html';
          });
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
    getExclusiveOwnedSelection: getExclusiveOwnedSelection,
    getShoppingLinks: getShoppingLinks,
    calculateCostPerUse: calculateCostPerUse,
    calculateImpulseScore: calculateImpulseScore,
    updateSidebarBill: updateSidebarBill,
    initStepRouting: initStepRouting,
    syncNavigationState: syncNavigationState
  };

  document.addEventListener('DOMContentLoaded', initialize);
}());

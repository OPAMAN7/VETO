(function (root) {
  'use strict';

  var CATEGORY_SURVEYS = {
    electronics: {
      name: 'electronics',
      usageLabel: 'Uses per month',
      lifespanLabel: 'Expected useful life',
      usageDefault: 12,
      lifespanDefault: 36,
      usageMax: 100,
      lifespanMax: 96,
      questions: [
        { name: 'replacementReason', label: 'Why is a replacement needed?', type: 'radio', options: [
          ['broken', 'It is broken or unsafe'],
          ['worn', 'It is worn down'],
          ['upgrade', 'The new function matters'],
          ['want', 'I mostly want the newer model']
        ] },
        { name: 'repairable', label: 'Could the current device be repaired or reset?', type: 'radio', options: [
          ['yes', 'Yes'],
          ['no', 'No'],
          ['unknown', 'I have not checked']
        ] },
        { name: 'useCase', label: 'How well does the main use fit your real routine?', type: 'radio', options: [
          ['daily', 'Daily or nearly every day'],
          ['weekly', 'Several times a week'],
          ['rare', 'Occasional']
        ] },
        { name: 'honesty', label: 'Today, I can honestly say...', type: 'checkbox', options: [
          ['need', 'I have a specific need'],
          ['budget', 'It fits the budget'],
          ['backup', 'I know what happens to my existing device']
        ] }
      ],
      redundancyTitle: 'Could repair, reuse or borrow cover the need?',
      redundancyOptions: [
        ['repair', 'Repair or reset what I have'],
        ['borrow', 'Borrow a suitable device'],
        ['hand-me-down', 'Use an older device I already own'],
        ['refurbished', 'Consider a refurbished replacement']
      ]
    },
    kitchen: {
      name: 'kitchen',
      usageLabel: 'Meals or uses per month',
      lifespanLabel: 'Expected useful life',
      usageDefault: 20,
      lifespanDefault: 24,
      usageMax: 180,
      lifespanMax: 120,
      questions: [
        { name: 'needLevel', label: 'How important is this appliance to a routine you already follow?', type: 'radio', options: [
          ['essential', 'Essential for healthy or safe daily cooking'],
          ['helpful', 'Helpful, but existing tools can manage'],
          ['novel', 'Mostly for a new habit or desire']
        ] },
        { name: 'mealFrequency', label: 'How often would it support a real meal or task?', type: 'radio', options: [
          ['daily', 'Daily'],
          ['weekly', 'Several times a week'],
          ['rare', 'A few times a month']
        ] },
        { name: 'manualAlternative', label: 'Can a manual method or an existing tool do the same job?', type: 'radio', options: [
          ['easy', 'Yes, easily'],
          ['possible', 'Possibly, with extra effort'],
          ['no', 'No practical substitute']
        ] },
        { name: 'honesty', label: 'Today, I can honestly say...', type: 'checkbox', options: [
          ['counterSpace', 'I have suitable counter or storage space'],
          ['cleaning', 'I will clean and maintain it'],
          ['recipePlan', 'I know exactly what I will make or do with it']
        ] }
      ],
      redundancyTitle: 'Which kitchen route already meets the need?',
      redundancyOptions: [
        ['manual', 'Manual method or existing pan/tool'],
        ['other-appliance', 'Another appliance I own'],
        ['borrow', 'Borrow from someone'],
        ['shared-kitchen', 'Use a shared or public kitchen']
      ]
    },
    'fast-fashion': {
      name: 'fast-fashion',
      usageLabel: 'Expected wears per month',
      lifespanLabel: 'Months before it leaves rotation',
      usageDefault: 4,
      lifespanDefault: 18,
      usageMax: 30,
      lifespanMax: 48,
      questions: [
        { name: 'wardrobeGap', label: 'Does this fill a real gap in your wardrobe?', type: 'radio', options: [
          ['gap', 'Yes, I have no suitable substitute'],
          ['similar', 'I have several similar items'],
          ['want', 'I only want something new']
        ] },
        { name: 'outfitCount', label: 'How many outfits could it realistically complete?', type: 'radio', options: [
          ['many', 'Three or more'],
          ['few', 'One or two'],
          ['unclear', 'I am not sure']
        ] },
        { name: 'saleTrigger', label: 'How much is this decision being driven by the sale or trend?', type: 'radio', options: [
          ['low', 'Little or no pressure'],
          ['medium', 'The offer helped'],
          ['high', 'The sale or trend is the main reason']
        ] },
        { name: 'honesty', label: 'Today, I can honestly say...', type: 'checkbox', options: [
          ['fits', 'It is likely to fit comfortably'],
          ['care', 'I can care for it'],
          ['budget', 'It fits this month’s budget']
        ] }
      ],
      redundancyTitle: 'Could something already owned cover the outfit?',
      redundancyOptions: [
        ['closet', 'Wear an existing item'],
        ['swap', 'Swap or borrow clothing'],
        ['secondhand', 'Choose a secondhand item'],
        ['alter', 'Alter or repair existing clothing']
      ]
    },
    footwear: {
      name: 'footwear',
      usageLabel: 'Expected wears per month',
      lifespanLabel: 'Months of useful wear',
      usageDefault: 12,
      lifespanDefault: 18,
      usageMax: 60,
      lifespanMax: 48,
      questions: [
        { name: 'purpose', label: 'What purpose would this footwear serve?', type: 'radio', options: [
          ['health', 'Health, comfort or a medical need'],
          ['activity', 'A regular sport or work activity'],
          ['replace', 'Replace a worn pair'],
          ['desire', 'Style or desire']
        ] },
        { name: 'oldPair', label: 'Can the old or existing pair still meet the need safely?', type: 'radio', options: [
          ['yes', 'Yes'],
          ['repairable', 'It could be repaired'],
          ['no', 'No, it is unsafe or unusable']
        ] },
        { name: 'fit', label: 'Have you confirmed fit and comfort for the likely use?', type: 'radio', options: [
          ['confirmed', 'Yes'],
          ['partly', 'Mostly, but not fully'],
          ['no', 'No']
        ] },
        { name: 'honesty', label: 'Today, I can honestly say...', type: 'checkbox', options: [
          ['plannedUse', 'I know when I will wear it'],
          ['matchesActivity', 'It matches an activity I already do'],
          ['budget', 'It fits this month’s budget']
        ] }
      ],
      redundancyTitle: 'Which existing footwear option could cover the need?',
      redundancyOptions: [
        ['repair', 'Repair or resole existing footwear'],
        ['existing', 'Use a pair I already own'],
        ['borrow', 'Borrow for the specific event'],
        ['secondhand', 'Choose a lower-cost secondhand pair']
      ]
    },
    fitness: {
      name: 'fitness',
      usageLabel: 'Training sessions per month',
      lifespanLabel: 'Months of useful training',
      usageDefault: 12,
      lifespanDefault: 36,
      usageMax: 100,
      lifespanMax: 120,
      questions: [
        { name: 'goal', label: 'What real goal would this support?', type: 'radio', options: [
          ['routine', 'An established training routine'],
          ['health', 'A defined health or rehabilitation goal'],
          ['new', 'A new goal I have not started'],
          ['desire', 'General desire or appearance']
        ] },
        { name: 'usedBefore', label: 'Have you used this kind of equipment consistently before?', type: 'radio', options: [
          ['yes', 'Yes'],
          ['sometimes', 'Sometimes'],
          ['no', 'No']
        ] },
        { name: 'space', label: 'Is the required space, setup and maintenance ready?', type: 'radio', options: [
          ['ready', 'Yes'],
          ['mostly', 'Mostly'],
          ['no', 'No']
        ] },
        { name: 'honesty', label: 'Today, I can honestly say...', type: 'checkbox', options: [
          ['schedule', 'It fits my weekly schedule'],
          ['guidance', 'I know how to use it safely'],
          ['budget', 'It fits this month’s budget']
        ] }
      ],
      redundancyTitle: 'Could a lower-barrier fitness route meet the goal?',
      redundancyOptions: [
        ['bodyweight', 'Use bodyweight or free training'],
        ['gym', 'Use a gym or community facility'],
        ['borrow', 'Borrow or rent equipment'],
        ['existing', 'Use equipment I already own']
      ]
    },
    furniture: {
      name: 'furniture',
      usageLabel: 'Uses or days per month',
      lifespanLabel: 'Expected useful life',
      usageDefault: 30,
      lifespanDefault: 60,
      usageMax: 31,
      lifespanMax: 240,
      questions: [
        { name: 'problem', label: 'What problem does this furniture solve?', type: 'radio', options: [
          ['comfort', 'A clear comfort or health problem'],
          ['space', 'A clear storage or space problem'],
          ['replace', 'Replace unsafe or unusable furniture'],
          ['style', 'Mainly style or preference']
        ] },
        { name: 'fit', label: 'Have you measured the space and delivery route?', type: 'radio', options: [
          ['confirmed', 'Yes'],
          ['partial', 'Mostly'],
          ['no', 'No']
        ] },
        { name: 'existing', label: 'Can existing furniture be moved, repaired or adapted?', type: 'radio', options: [
          ['easy', 'Yes'],
          ['possible', 'Possibly'],
          ['no', 'No']
        ] },
        { name: 'honesty', label: 'Today, I can honestly say...', type: 'checkbox', options: [
          ['use', 'I have a clear place and need for it'],
          ['assembly', 'Assembly and maintenance are manageable'],
          ['budget', 'It fits this month’s budget']
        ] }
      ],
      redundancyTitle: 'Could existing furniture or a lower-cost route solve the problem?',
      redundancyOptions: [
        ['move', 'Move or rearrange existing furniture'],
        ['repair', 'Repair or repurpose existing furniture'],
        ['secondhand', 'Use a secondhand item'],
        ['borrow', 'Borrow temporarily']
      ]
    },
    hobby: {
      name: 'hobby',
      usageLabel: 'Sessions per month',
      lifespanLabel: 'Months the hobby will stay active',
      usageDefault: 4,
      lifespanDefault: 24,
      usageMax: 60,
      lifespanMax: 120,
      questions: [
        { name: 'commitment', label: 'How established is this hobby?', type: 'radio', options: [
          ['active', 'I actively practice it'],
          ['starting', 'I am actively learning'],
          ['idea', 'It is mostly an idea or inspiration']
        ] },
        { name: 'priorUse', label: 'Have similar tools or materials been used before?', type: 'radio', options: [
          ['regular', 'Regularly'],
          ['once', 'A few times'],
          ['never', 'Never']
        ] },
        { name: 'trial', label: 'Is there a cheaper way to test the hobby first?', type: 'radio', options: [
          ['available', 'Yes'],
          ['maybe', 'Possibly'],
          ['no', 'No practical trial']
        ] },
        { name: 'honesty', label: 'Today, I can honestly say...', type: 'checkbox', options: [
          ['time', 'I have protected time for it'],
          ['storage', 'I have storage and setup space'],
          ['budget', 'It fits outside essential spending']
        ] }
      ],
      redundancyTitle: 'Can the hobby be tested or supported without this purchase?',
      redundancyOptions: [
        ['borrow', 'Borrow or rent the tool'],
        ['club', 'Use a club or maker space'],
        ['existing', 'Use materials or tools I already own'],
        ['trial', 'Take a low-cost trial or class']
      ]
    },
    books: {
      name: 'books',
      usageLabel: 'Times used or read per month',
      lifespanLabel: 'Months of useful reference',
      usageDefault: 4,
      lifespanDefault: 36,
      usageMax: 60,
      lifespanMax: 120,
      questions: [
        { name: 'purpose', label: 'Why do you need this book or media now?', type: 'radio', options: [
          ['course', 'Required course or work reference'],
          ['learning', 'An active learning goal'],
          ['entertainment', 'Entertainment'],
          ['collection', 'Collection or identity']
        ] },
        { name: 'access', label: 'Is a lower-cost or free copy available?', type: 'radio', options: [
          ['free', 'Library or free source'],
          ['rental', 'Rental or loan'],
          ['digital', 'A suitable digital copy'],
          ['none', 'No suitable access']
        ] },
        { name: 'finish', label: 'Have you completed similar books or media recently?', type: 'radio', options: [
          ['yes', 'Yes'],
          ['some', 'Some'],
          ['no', 'No']
        ] },
        { name: 'honesty', label: 'Today, I can honestly say...', type: 'checkbox', options: [
          ['scheduled', 'I have time to use it'],
          ['needed', 'It is needed for a defined goal'],
          ['budget', 'It fits this month’s budget']
        ] }
      ],
      redundancyTitle: 'Could you access this learning or entertainment without buying?',
      redundancyOptions: [
        ['library', 'Library or university resource'],
        ['loan', 'Borrow it'],
        ['digital', 'Use a legal digital version'],
        ['existing', 'Use media I already own']
      ]
    },
    other: {
      name: 'other',
      usageLabel: 'Uses per month',
      lifespanLabel: 'Expected useful life',
      usageDefault: 4,
      lifespanDefault: 24,
      usageMax: 60,
      lifespanMax: 120,
      questions: [
        { name: 'need', label: 'What need does this satisfy?', type: 'radio', options: [
          ['essential', 'An essential need'],
          ['regular', 'A regular practical need'],
          ['occasional', 'An occasional need'],
          ['desire', 'A desire or impulse']
        ] },
        { name: 'replacement', label: 'Could an existing item or a less costly option meet it?', type: 'radio', options: [
          ['exists', 'Yes'],
          ['possible', 'Possibly'],
          ['no', 'No']
        ] },
        { name: 'timing', label: 'Would waiting a month meaningfully change the need?', type: 'radio', options: [
          ['no', 'No'],
          ['uncertain', 'I am not sure'],
          ['yes', 'Yes']
        ] },
        { name: 'honesty', label: 'Today, I can honestly say...', type: 'checkbox', options: [
          ['planned', 'I have a specific use'],
          ['space', 'I have a place for it'],
          ['budget', 'It fits this month’s budget']
        ] }
      ],
      redundancyTitle: 'Could an existing or alternative option cover this need?',
      redundancyOptions: [
        ['existing', 'Use something I already own'],
        ['borrow', 'Borrow it'],
        ['rent', 'Rent or subscribe'],
        ['secondhand', 'Use a lower-cost secondhand option']
      ]
    }
  };

  root.VETO_CATEGORY_SURVEYS = CATEGORY_SURVEYS;
  root.getVetoCategorySurvey = function (category) {
    return CATEGORY_SURVEYS[category] || CATEGORY_SURVEYS.other;
  };
})(window);

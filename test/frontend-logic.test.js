'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadFrontendLogic() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'Html', 'js', 'app.js'), 'utf8');
  const window = {
    localStorage: {
      getItem() { return null; },
      setItem() {},
      removeItem() {}
    }
  };
  const document = { addEventListener() {} };
  vm.runInNewContext(source, { window, document, console });
  return window.VETO;
}

test('redundancy selection keeps none exclusive and allows multiple useful routes', () => {
  const logic = loadFrontendLogic();

  assert.deepEqual(
    Array.from(logic.getExclusiveOwnedSelection(['none', 'repair', 'borrow'], null, false)),
    ['none']
  );
  assert.deepEqual(
    Array.from(logic.getExclusiveOwnedSelection(['none', 'repair'], 'repair', true)),
    ['repair']
  );
  assert.deepEqual(
    Array.from(logic.getExclusiveOwnedSelection(['repair', 'borrow', 'none'], 'none', true)),
    ['none']
  );
  assert.deepEqual(
    Array.from(logic.getExclusiveOwnedSelection(['repair'], 'borrow', false)),
    ['repair']
  );
  assert.deepEqual(
    Array.from(logic.getExclusiveOwnedSelection(['repair', 'borrow'], null, false)),
    ['repair', 'borrow']
  );
});

test('shopping links use category-specific stores and safely encode the item query', () => {
  const logic = loadFrontendLogic();
  const links = Array.from(
    logic.getShoppingLinks({ name: 'Wireless headphones & charger', category: 'electronics' }),
    (link) => ({ name: link.name, url: link.url })
  );

  assert.equal(links.length, 3);
  assert.equal(links[0].name, 'Amazon India');
  assert.equal(links[2].name, 'Croma');
  assert.ok(links.every((link) => link.url.endsWith('Wireless%20headphones%20%26%20charger')));
  assert.equal(logic.getShoppingLinks({ name: '', category: 'electronics' }).length, 0);

  const furnitureLinks = Array.from(
    logic.getShoppingLinks({ name: 'desk', category: 'furniture' }),
    (link) => ({ name: link.name, url: link.url })
  );
  assert.equal(furnitureLinks[0].name, 'IKEA India');
  assert.ok(furnitureLinks[0].url.endsWith('desk'));
});

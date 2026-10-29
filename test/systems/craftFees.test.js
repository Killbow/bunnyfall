// BUNNYFALL CRAFT FEES: a shop station asks a tenth of what is made, at least 1 gold, never more than its old fee;
// a home station asks nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { valueFee, pricedStation, FEE_SHARE } from '../../src/systems/craftFees.js';

test('craft fees: a tenth of the value, at least 1, capped at the station fee', () => {
  assert.equal(FEE_SHARE, 0.1);
  assert.equal(valueFee(300, 50), 30);
  assert.equal(valueFee(5000, 50), 50, 'capped at the old flat fee');
  assert.equal(valueFee(3, 50), 1, 'never under 1 gold at a shop');
  assert.equal(valueFee(0, 50), 1, 'an unpriced piece still pays the minimum');
  assert.equal(valueFee(NaN, 25), 1);
});

test('craft fees: a home station (fee 0) stays free, whatever the value', () => {
  assert.equal(valueFee(5000, 0), 0);
  assert.equal(valueFee(5000, undefined), 0);
});

test('craft fees: pricedStation copies the station with the priced fee, and passes "no station" through', () => {
  const shop = { kind: 'shop', fee: 50, who: 'carpenter' };
  assert.deepEqual(pricedStation(shop, 200), { kind: 'shop', fee: 20, who: 'carpenter' });
  assert.equal(shop.fee, 50, 'the station itself is not changed');
  assert.deepEqual(pricedStation({ kind: 'home', fee: 0 }, 200), { kind: 'home', fee: 0 });
  assert.equal(pricedStation(null, 200), null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidCommerceSegment, VALID_COMMERCE_SEGMENTS } from '../controllers/store.controller.js';

test('valid commerce segments are accepted', () => {
  assert.equal(isValidCommerceSegment('retailer'), true);
  assert.equal(isValidCommerceSegment('logistics'), true);
  assert.deepEqual(VALID_COMMERCE_SEGMENTS.includes('manufacturer'), true);
});

test('invalid commerce segments are rejected', () => {
  assert.equal(isValidCommerceSegment('unknown'), false);
  assert.equal(isValidCommerceSegment(''), false);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isSignatureLine } = require('../core/signature-line');

test('detects a run of underscores as a blank signature rule', () => {
  assert.equal(isSignatureLine('By: ______________________'), true);
  assert.equal(isSignatureLine('_________________'), true);
});

test('detects standalone "By:" / "Signature:" style labels', () => {
  assert.equal(isSignatureLine('By:'), true);
  assert.equal(isSignatureLine('Signature'), true);
  assert.equal(isSignatureLine('  Authorized Signatory:  '), true);
});

test('does not misfire on ordinary prose', () => {
  assert.equal(isSignatureLine('This Agreement is governed by the laws of Delaware.'), false);
  assert.equal(isSignatureLine('By signing below, the parties agree to the foregoing terms.'), false);
});

test('empty or whitespace-only text is not a signature line', () => {
  assert.equal(isSignatureLine(''), false);
  assert.equal(isSignatureLine('   '), false);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { median, wordCount, runLint } = require('../core/lint');

test('median: odd and even length arrays', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), 0);
});

test('wordCount: counts whitespace-delimited words', () => {
  assert.equal(wordCount('The quick brown fox'), 4);
  assert.equal(wordCount('   '), 0);
  assert.equal(wordCount(''), 0);
});

test('runLint: flags a destructive rule matching an over-broad share of clauses', () => {
  const paragraphs = Array.from({ length: 10 }, (_, i) => ({ index: i, text: `Clause ${i} mentions confidential information here.` }));
  const rules = [{ id: 'r1', label: 'Overbroad', matchType: 'keyword', pattern: 'confidential', matchWhen: 'present', action: 'strike', enabled: true }];
  const findings = [];
  const warnings = runLint(paragraphs, rules, findings);
  assert.ok(warnings.some(w => w.type === 'broad-pattern'));
});

test('runLint: flags a very short keyword pattern paired with a destructive action', () => {
  const paragraphs = [{ index: 0, text: 'Some clause text that is reasonably long for a test.' }];
  const rules = [{ id: 'r1', label: 'Too short', matchType: 'keyword', pattern: 'ab', matchWhen: 'present', action: 'strike', enabled: true }];
  const warnings = runLint(paragraphs, rules, []);
  assert.ok(warnings.some(w => w.type === 'short-pattern'));
});

test('runLint: flags a struck clause unusually long relative to the document median', () => {
  const shortPara = 'Short clause here with a handful of words only.';
  const longPara = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
  const paragraphs = [
    { index: 0, text: shortPara },
    { index: 1, text: shortPara },
    { index: 2, text: longPara }
  ];
  const rule = { id: 'r1', label: 'Strikes clause 2', matchType: 'keyword', pattern: 'word0', matchWhen: 'present', action: 'strike', enabled: true };
  const findings = [{ rule, paragraphIndex: 2, snippet: longPara.slice(0, 140) }];
  const warnings = runLint(paragraphs, [rule], findings);
  assert.ok(warnings.some(w => w.type === 'long-clause'));
});

test('runLint: flags a suggested replacement whose length differs drastically from the original', () => {
  const original = 'This clause has a moderate number of words in it for testing purposes today.';
  const paragraphs = [{ index: 0, text: original }];
  const rule = {
    id: 'r1', label: 'Suggest replacement', matchType: 'keyword', pattern: 'clause', matchWhen: 'present',
    action: 'suggest', suggestedText: 'Short.', enabled: true
  };
  const findings = [{ rule, paragraphIndex: 0, snippet: original.slice(0, 140) }];
  const warnings = runLint(paragraphs, [rule], findings);
  assert.ok(warnings.some(w => w.type === 'length-mismatch'));
});

test('runLint: a well-scoped rule set produces no warnings', () => {
  const paragraphs = [
    { index: 0, text: 'This Agreement shall be governed by the laws of Delaware.' },
    { index: 1, text: 'Confidential Information includes trade secrets and business plans.' }
  ];
  const rules = [{ id: 'r1', label: 'Governing law', matchType: 'keyword', pattern: 'governed by the laws', matchWhen: 'present', action: 'flag', enabled: true }];
  const findings = [{ rule: rules[0], paragraphIndex: 0, snippet: 'x' }];
  assert.deepEqual(runLint(paragraphs, rules, findings), []);
});

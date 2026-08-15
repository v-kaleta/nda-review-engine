const { test } = require('node:test');
const assert = require('node:assert/strict');
const { testRule, testAbsentAgainstFullText, runRules, findingsByParagraph } = require('../core/rules-engine');

test('testRule: keyword match is case-insensitive', () => {
  const rule = { matchType: 'keyword', pattern: 'Indemnify', matchWhen: 'present' };
  assert.equal(testRule('The Buyer shall indemnify the Seller.', rule), true);
  assert.equal(testRule('No such clause here.', rule), false);
});

test('testRule: regex match', () => {
  const rule = { matchType: 'regex', pattern: 'perpetual|indefinitely', matchWhen: 'present' };
  assert.equal(testRule('This obligation survives perpetually.', rule), true);
  assert.equal(testRule('This obligation survives for three years.', rule), false);
});

test('testRule: matchWhen "absent" inverts the hit', () => {
  const rule = { matchType: 'keyword', pattern: 'residual', matchWhen: 'absent' };
  // "absent" rules are evaluated per-paragraph as the inverse of a hit —
  // a paragraph containing the word should NOT count as a per-paragraph finding
  assert.equal(testRule('See the residual information clause.', rule), false);
  assert.equal(testRule('No such clause in this paragraph.', rule), true);
});

test('testRule: invalid regex fails closed (no throw, no match)', () => {
  const rule = { matchType: 'regex', pattern: '(unclosed', matchWhen: 'present' };
  assert.doesNotThrow(() => testRule('some text', rule));
  assert.equal(testRule('some text', rule), false);
});

test('testAbsentAgainstFullText: checks the whole document, not one paragraph', () => {
  const rule = { matchType: 'keyword', pattern: 'injunctive relief', matchWhen: 'absent' };
  const fullText = 'Paragraph one.\nParagraph two mentions injunctive relief.\nParagraph three.';
  assert.equal(testAbsentAgainstFullText(fullText, rule), true);
});

test('runRules: "present" rules produce one finding per matching paragraph', () => {
  const paragraphs = [
    { index: 0, text: 'The term of this Agreement is perpetual.' },
    { index: 1, text: 'Governing law is Delaware.' },
    { index: 2, text: 'This survives perpetually as well.' }
  ];
  const rules = [{ id: 'r1', label: 'Perpetual term', matchType: 'keyword', pattern: 'perpetual', matchWhen: 'present', severity: 'critical', action: 'flag', enabled: true }];
  const findings = runRules(paragraphs, rules);
  assert.equal(findings.length, 2);
  assert.deepEqual(findings.map(f => f.paragraphIndex), [0, 2]);
});

test('runRules: "absent" rules produce exactly one document-level finding when missing', () => {
  const paragraphs = [
    { index: 0, text: 'Confidential Information means any and all information.' },
    { index: 1, text: 'Governing law is Delaware.' }
  ];
  const rules = [{ id: 'r5', label: 'Missing residual clause', matchType: 'keyword', pattern: 'residual', matchWhen: 'absent', severity: 'critical', action: 'flag', enabled: true }];
  const findings = runRules(paragraphs, rules);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].paragraphIndex, null);
});

test('runRules: "absent" rule produces no finding when the term IS present anywhere', () => {
  const paragraphs = [
    { index: 0, text: 'A residual-information carve-out applies.' },
    { index: 1, text: 'Governing law is Delaware.' }
  ];
  const rules = [{ id: 'r5', label: 'Missing residual clause', matchType: 'keyword', pattern: 'residual', matchWhen: 'absent', severity: 'critical', action: 'flag', enabled: true }];
  assert.equal(runRules(paragraphs, rules).length, 0);
});

test('runRules: disabled rules are skipped entirely', () => {
  const paragraphs = [{ index: 0, text: 'This is perpetual.' }];
  const rules = [{ id: 'r1', label: 'x', matchType: 'keyword', pattern: 'perpetual', matchWhen: 'present', severity: 'critical', action: 'flag', enabled: false }];
  assert.equal(runRules(paragraphs, rules).length, 0);
});

test('findingsByParagraph: groups by paragraph index, drops document-level (null) findings', () => {
  const findings = [
    { rule: { id: 'r1' }, paragraphIndex: 0 },
    { rule: { id: 'r2' }, paragraphIndex: 0 },
    { rule: { id: 'r3' }, paragraphIndex: 2 },
    { rule: { id: 'r4' }, paragraphIndex: null }
  ];
  const grouped = findingsByParagraph(findings);
  assert.equal(grouped[0].length, 2);
  assert.equal(grouped[2].length, 1);
  assert.equal(grouped[1], undefined);
});

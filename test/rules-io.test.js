const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseCSV, rulesFromCSVRows, rulesFromJSON } = require('../core/rules-io');

test('parseCSV: basic rows and header', () => {
  const rows = parseCSV('label,pattern\nFoo,bar\nBaz,qux\n');
  assert.deepEqual(rows, [['label', 'pattern'], ['Foo', 'bar'], ['Baz', 'qux']]);
});

test('parseCSV: handles quoted fields containing commas and escaped quotes', () => {
  const rows = parseCSV('label,pattern\n"Has, a comma","Has ""quotes"" inside"\n');
  assert.deepEqual(rows[1], ['Has, a comma', 'Has "quotes" inside']);
});

test('rulesFromCSVRows: builds rules and defaults missing optional columns', () => {
  const rows = [
    ['label', 'pattern', 'severity'],
    ['Arbitration required', 'arbitration', 'warning']
  ];
  const { rules, skipped } = rulesFromCSVRows(rows);
  assert.equal(skipped, 0);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].label, 'Arbitration required');
  assert.equal(rules[0].matchType, 'keyword'); // defaulted
  assert.equal(rules[0].matchWhen, 'present'); // defaulted
  assert.equal(rules[0].severity, 'warning');
  assert.equal(rules[0].enabled, true); // defaulted
});

test('rulesFromCSVRows: skips rows missing a label or pattern', () => {
  const rows = [
    ['label', 'pattern'],
    ['', 'no label here'],
    ['No pattern here', '']
  ];
  const { rules, skipped } = rulesFromCSVRows(rows);
  assert.equal(rules.length, 0);
  assert.equal(skipped, 2);
});

test('rulesFromCSVRows: invalid enum values fall back to safe defaults', () => {
  const rows = [
    ['label', 'pattern', 'matchType', 'severity', 'action'],
    ['Weird row', 'x', 'nonsense', 'nonsense', 'nonsense']
  ];
  const { rules } = rulesFromCSVRows(rows);
  assert.equal(rules[0].matchType, 'keyword');
  assert.equal(rules[0].severity, 'warning');
  assert.equal(rules[0].action, 'flag');
});

test('rulesFromJSON: parses a valid array', () => {
  const json = JSON.stringify([
    { label: 'Test rule', pattern: 'foo', severity: 'critical', action: 'strike' }
  ]);
  const { rules, skipped } = rulesFromJSON(json);
  assert.equal(skipped, 0);
  assert.equal(rules[0].label, 'Test rule');
  assert.equal(rules[0].severity, 'critical');
});

test('rulesFromJSON: throws on a non-array payload', () => {
  assert.throws(() => rulesFromJSON('{"not":"an array"}'), /Expected a JSON array/);
});

test('rulesFromJSON: skips entries missing label or pattern, keeps valid ones', () => {
  const json = JSON.stringify([
    { label: '', pattern: 'x' },
    { label: 'Valid', pattern: 'y' }
  ]);
  const { rules, skipped } = rulesFromJSON(json);
  assert.equal(skipped, 1);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].label, 'Valid');
});

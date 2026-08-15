const { test } = require('node:test');
const assert = require('node:assert/strict');
const { matchFieldLine, fillFieldLine, fillNearbyFields } = require('../core/signature-fields');

test('matchFieldLine: detects combined "Name/Title/Date:" label', () => {
  assert.equal(matchFieldLine('Name/Title/Date:'), 'combined');
  assert.equal(matchFieldLine('  name / title / date  '), 'combined');
});

test('matchFieldLine: detects separate Name:/Title:/Date: labels', () => {
  assert.equal(matchFieldLine('Name:'), 'name');
  assert.equal(matchFieldLine('Printed Name:'), 'name');
  assert.equal(matchFieldLine('Title:'), 'title');
  assert.equal(matchFieldLine('Date:'), 'date');
});

test('matchFieldLine: does not misfire on ordinary prose', () => {
  assert.equal(matchFieldLine('This Agreement shall be governed by the laws of Delaware.'), null);
  assert.equal(matchFieldLine('The Company name is confidential.'), null);
});

test('fillFieldLine: combined label joins provided fields with " / ", omitting blanks', () => {
  assert.equal(fillFieldLine('combined', { name: 'Vivian', title: 'Associate', dateVal: 'August 15, 2026' }),
    'Name/Title/Date: Vivian / Associate / August 15, 2026');
  assert.equal(fillFieldLine('combined', { name: 'Vivian', title: '', dateVal: 'August 15, 2026' }),
    'Name/Title/Date: Vivian / August 15, 2026');
});

test('fillFieldLine: individual labels fill their own value only', () => {
  assert.equal(fillFieldLine('name', { name: 'Vivian' }), 'Name: Vivian');
  assert.equal(fillFieldLine('title', { title: 'Associate' }), 'Title: Associate');
  assert.equal(fillFieldLine('date', { dateVal: 'August 15, 2026' }), 'Date: August 15, 2026');
});

test('fillNearbyFields: fills a combined label found shortly after the signature line', () => {
  const paragraphs = [
    'By: ______________________________',
    'Name/Title/Date:',
    'TARGET HOLDINGS, INC.'
  ];
  const result = fillNearbyFields(paragraphs, 0, { name: 'Vivian', title: 'Associate', dateVal: 'August 15, 2026' });
  assert.equal(result.anyFilled, true);
  assert.equal(result.paragraphs[1], 'Name/Title/Date: Vivian / Associate / August 15, 2026');
  assert.equal(result.paragraphs[0], paragraphs[0]); // signature line itself untouched
  assert.equal(result.paragraphs[2], paragraphs[2]); // unrelated paragraph untouched
});

test('fillNearbyFields: fills three separate Name:/Title:/Date: lines', () => {
  const paragraphs = [
    'By: ______________________________',
    'Name:',
    'Title:',
    'Date:'
  ];
  const result = fillNearbyFields(paragraphs, 0, { name: 'Vivian', title: 'Associate', dateVal: 'August 15, 2026' });
  assert.equal(result.anyFilled, true);
  assert.equal(result.paragraphs[1], 'Name: Vivian');
  assert.equal(result.paragraphs[2], 'Title: Associate');
  assert.equal(result.paragraphs[3], 'Date: August 15, 2026');
});

test('fillNearbyFields: does not fill a second signature block far outside the lookahead window', () => {
  const paragraphs = ['By: ___'].concat(Array(10).fill('unrelated filler text')).concat(['Name:']);
  const result = fillNearbyFields(paragraphs, 0, { name: 'Vivian', title: '', dateVal: '' }, 5);
  assert.equal(result.anyFilled, false);
  assert.equal(result.paragraphs[result.paragraphs.length - 1], 'Name:'); // untouched
});

test('fillNearbyFields: no matching label nearby leaves everything unchanged', () => {
  const paragraphs = ['By: ___', 'Some unrelated clause text.'];
  const result = fillNearbyFields(paragraphs, 0, { name: 'Vivian', title: '', dateVal: '' });
  assert.equal(result.anyFilled, false);
  assert.deepEqual(result.paragraphs, paragraphs);
});

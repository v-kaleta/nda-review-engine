const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const { extractParagraphs } = require('../core/docx-parser');
const { buildRedlinedXml, computeFinalText } = require('../core/redline-builder');

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const SAMPLE_DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${WORD_NS}">
  <w:body>
    <w:p><w:r><w:t>Non-Disclosure Agreement</w:t></w:r></w:p>
    <w:p><w:r><w:t>This obligation is perpetual in nature.</w:t></w:r></w:p>
    <w:p><w:r><w:t>Confidential Information means any and all information.</w:t></w:r></w:p>
    <w:p><w:r><w:t>Governing law is Delaware.</w:t></w:r></w:p>
  </w:body>
</w:document>`;

function freshDoc() {
  const xmlDoc = new DOMParser().parseFromString(SAMPLE_DOCUMENT_XML, 'application/xml');
  const paragraphs = extractParagraphs(xmlDoc);
  return { xmlDoc, paragraphs };
}

test('buildRedlinedXml: a "strike" finding wraps the run in a real w:del with delText', () => {
  const { xmlDoc, paragraphs } = freshDoc();
  const rule = { label: 'Perpetual term', action: 'strike' };
  const findings = [{ rule, paragraphIndex: 1, snippet: paragraphs[1].text.slice(0, 140) }];

  buildRedlinedXml(xmlDoc, paragraphs, findings, 'Test Author');
  const serialized = new XMLSerializer().serializeToString(xmlDoc);

  assert.match(serialized, /<w:del /);
  assert.match(serialized, /w:author="Test Author"/);
  assert.match(serialized, /<w:delText[^>]*>This obligation is perpetual in nature\.<\/w:delText>/);
  // the original, non-deleted <w:t> for that run should no longer be present as a live run
  assert.doesNotMatch(serialized.split('<w:del')[1], /<w:t xml:space="preserve">This obligation/);
});

test('buildRedlinedXml: a "suggest" finding inserts a new paragraph AND strikes the original', () => {
  const { xmlDoc, paragraphs } = freshDoc();
  const rule = { label: 'Perpetual term', action: 'suggest', suggestedText: 'This obligation survives for three (3) years.' };
  const findings = [{ rule, paragraphIndex: 1, snippet: 'x' }];

  buildRedlinedXml(xmlDoc, paragraphs, findings, 'Test Author');
  const serialized = new XMLSerializer().serializeToString(xmlDoc);

  assert.match(serialized, /<w:ins /);
  assert.match(serialized, /This obligation survives for three \(3\) years\./);
  assert.match(serialized, /<w:del /); // original still struck
});

test('buildRedlinedXml: a "flag" finding highlights the run but does not delete or insert anything', () => {
  const { xmlDoc, paragraphs } = freshDoc();
  const rule = { label: 'Broad definition', action: 'flag' };
  const findings = [{ rule, paragraphIndex: 2, snippet: 'x' }];

  buildRedlinedXml(xmlDoc, paragraphs, findings, 'Test Author');
  const serialized = new XMLSerializer().serializeToString(xmlDoc);

  assert.match(serialized, /<w:highlight w:val="yellow"/);
  assert.doesNotMatch(serialized, /<w:del /);
  assert.doesNotMatch(serialized, /<w:ins /);
});

test('buildRedlinedXml: an untouched paragraph is left completely unmodified', () => {
  const { xmlDoc, paragraphs } = freshDoc();
  const findings = []; // no findings at all
  buildRedlinedXml(xmlDoc, paragraphs, findings, 'Test Author');
  const serialized = new XMLSerializer().serializeToString(xmlDoc);
  assert.match(serialized, /<w:t[^>]*>Governing law is Delaware\.<\/w:t>/);
});

test('computeFinalText: a struck clause with no suggested replacement is dropped entirely', () => {
  const { paragraphs } = freshDoc();
  const rule = { label: 'x', action: 'strike' };
  const findings = [{ rule, paragraphIndex: 2, snippet: 'x' }];
  const final = computeFinalText(paragraphs, findings);
  // the struck paragraph contributes nothing, so the array is one shorter
  assert.equal(final.length, paragraphs.length - 1);
  assert.ok(!final.includes(paragraphs[2].text));
});

test('computeFinalText: a "suggest" finding replaces the paragraph text with the suggested wording', () => {
  const { paragraphs } = freshDoc();
  const rule = { label: 'x', action: 'suggest', suggestedText: 'Replacement wording.' };
  const findings = [{ rule, paragraphIndex: 1, snippet: 'x' }];
  const final = computeFinalText(paragraphs, findings);
  assert.equal(final[1], 'Replacement wording.');
  assert.equal(final[0], paragraphs[0].text); // untouched paragraphs pass through unchanged
});

test('computeFinalText: a "flag"-only paragraph passes through unchanged', () => {
  const { paragraphs } = freshDoc();
  const rule = { label: 'x', action: 'flag' };
  const findings = [{ rule, paragraphIndex: 2, snippet: 'x' }];
  const final = computeFinalText(paragraphs, findings);
  assert.equal(final[2], paragraphs[2].text);
});

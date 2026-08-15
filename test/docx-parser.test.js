const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DOMParser } = require('@xmldom/xmldom');
const { extractParagraphs, paragraphText } = require('../core/docx-parser');

const SAMPLE_DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:t>Non-Disclosure Agreement</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>This obligation is </w:t></w:r>
      <w:r><w:t>perpetual</w:t></w:r>
      <w:r><w:t> in nature.</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Governing law is Delaware.</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;

function parseSample() {
  return new DOMParser().parseFromString(SAMPLE_DOCUMENT_XML, 'application/xml');
}

test('extractParagraphs: finds every w:p in document order with a stable index', () => {
  const xmlDoc = parseSample();
  const paragraphs = extractParagraphs(xmlDoc);
  assert.equal(paragraphs.length, 3);
  assert.deepEqual(paragraphs.map(p => p.index), [0, 1, 2]);
});

test('extractParagraphs: concatenates multiple runs (w:r/w:t) within one paragraph', () => {
  const xmlDoc = parseSample();
  const paragraphs = extractParagraphs(xmlDoc);
  assert.equal(paragraphs[1].text, 'This obligation is perpetual in nature.');
});

test('paragraphText: returns empty string for a paragraph with no text runs', () => {
  const xmlDoc = new DOMParser().parseFromString(
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p/></w:body></w:document>`,
    'application/xml'
  );
  const paragraphs = extractParagraphs(xmlDoc);
  assert.equal(paragraphs[0].text, '');
});

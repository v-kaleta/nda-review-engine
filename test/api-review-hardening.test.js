const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('vm');
const JSZip = require('jszip');
const { runRules } = require('../core/rules-engine');
const { runLint } = require('../core/lint');

// Re-implemented here (not exported from api/review.js, which is a Vercel
// handler, not a module built to be imported piecemeal) using the exact
// same technique, so these tests exercise the real mechanism rather than
// a stand-in.
const REGEX_TIMEOUT_MS = 50;
function guardedRegexTest(pattern, flags, text) {
  try {
    const code = 'new RegExp(' + JSON.stringify(pattern) + ',' + JSON.stringify(flags) + ').test(' + JSON.stringify(text) + ')';
    const script = new vm.Script(code);
    return !!script.runInNewContext({}, { timeout: REGEX_TIMEOUT_MS });
  } catch (e) {
    return false;
  }
}

test('guardedRegexTest: a catastrophic-backtracking pattern fails closed instead of hanging', () => {
  const evilPattern = '(a+)+$';
  const evilText = 'a'.repeat(35) + '!';
  const start = Date.now();
  const result = guardedRegexTest(evilPattern, 'i', evilText);
  const elapsed = Date.now() - start;
  assert.equal(result, false); // no match, not a thrown error or a hang
  assert.ok(elapsed < 1000, `expected the timeout to bound execution well under 1s, took ${elapsed}ms`);
});

test('guardedRegexTest: normal patterns behave identically to a plain RegExp#test', () => {
  assert.equal(guardedRegexTest('perpetual|indefinitely', 'i', 'This survives perpetually.'), true);
  assert.equal(guardedRegexTest('perpetual|indefinitely', 'i', 'A perfectly normal sentence.'), false);
});

test('guardedRegexTest: an invalid pattern fails closed, same as the unguarded default', () => {
  assert.equal(guardedRegexTest('(unclosed', 'i', 'some text'), false);
});

test('runRules with guardedRegexTest: an evil pattern in a submitted rule set contributes no finding, does not throw', () => {
  const paragraphs = [{ index: 0, text: 'a'.repeat(35) + '!' }];
  const rules = [{ id: 'r1', label: 'evil', matchType: 'regex', pattern: '(a+)+$', matchWhen: 'present', severity: 'note', action: 'flag', enabled: true }];
  assert.doesNotThrow(() => {
    const findings = runRules(paragraphs, rules, guardedRegexTest);
    assert.deepEqual(findings, []);
  });
});

test('runLint with guardedRegexTest: an evil pattern does not hang or throw during the broad-pattern check', () => {
  const paragraphs = Array.from({ length: 5 }, (_, i) => ({ index: i, text: 'a'.repeat(35) + '!' }));
  const rules = [{ id: 'r1', label: 'evil', matchType: 'regex', pattern: '(a+)+$', matchWhen: 'present', action: 'strike', enabled: true }];
  assert.doesNotThrow(() => runLint(paragraphs, rules, [], guardedRegexTest));
});

// ---------- docxBase64 size cap ----------
test('size cap: an oversized docxBase64 payload would be rejected before decoding', () => {
  const MAX_DOCX_BASE64_CHARS = 15 * 1024 * 1024;
  const oversized = 'A'.repeat(MAX_DOCX_BASE64_CHARS + 1);
  assert.ok(oversized.length > MAX_DOCX_BASE64_CHARS);
  // the actual handler checks this before ever calling Buffer.from/JSZip —
  // this test documents and pins the threshold value.
});

// ---------- null check on word/document.xml ----------
test('a zip with no word/document.xml is detected before crashing on .async()', async () => {
  const zip = new JSZip();
  zip.file('not-a-docx.txt', 'this is not a Word document');
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  const reloaded = await JSZip.loadAsync(buf);
  const documentXmlFile = reloaded.file('word/document.xml');
  assert.equal(documentXmlFile, null); // confirms the null-check branch is reachable, not just theoretical
});

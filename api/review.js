// Vercel Serverless Function — POST /api/review
// Runs the same rule-matching, lint, and OOXML tracked-changes redlining
// engine as the browser version, server-side, by requiring the actual
// shared modules in ../core — not a hand-copied duplicate. Requires a
// valid API key (see api/generate-key.js) in the Authorization header.

const JSZip = require('jszip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const crypto = require('crypto');
const vm = require('vm');

const { extractParagraphs } = require('../core/docx-parser');
const { runRules } = require('../core/rules-engine');
const { buildRedlinedXml } = require('../core/redline-builder');
const { runLint } = require('../core/lint');

// ---------- guarded regex execution (server only) ----------
// The rules array is caller-supplied and gets matched against a caller-
// supplied document, so unlike the browser (where a slow pattern only
// hangs the user's own tab), a pattern like (a+)+$ run here would hang
// this shared function until Vercel kills it — a real DoS/cost vector.
// vm.Script's `timeout` option enforces a hard wall-clock limit on
// synchronous script execution and forcibly aborts it if exceeded, which
// is what lets us bound a single RegExp#test call in plain Node with no
// extra dependency. A timeout or an invalid pattern both fail closed —
// treated as "no match" rather than a thrown error or a hang.
const REGEX_TIMEOUT_MS = 50;

function guardedRegexTest(pattern, flags, text) {
  try {
    const code = 'new RegExp(' + JSON.stringify(pattern) + ',' + JSON.stringify(flags) + ').test(' + JSON.stringify(text) + ')';
    const script = new vm.Script(code);
    return !!script.runInNewContext({}, { timeout: REGEX_TIMEOUT_MS });
  } catch (e) {
    return false; // invalid pattern OR timed out — either way, no match
  }
}

// ---------- API key validation (HMAC-signed, no database required) ----------
function validateKey(key, secret) {
  if (!key || !key.startsWith('ndarev_')) return false;
  const body = key.slice('ndarev_'.length);
  const parts = body.split('.');
  if (parts.length !== 3) return false;
  const [randomId, issuedAt, signature] = parts;
  const expected = crypto.createHmac('sha256', secret).update(randomId + '.' + issuedAt).digest('hex').slice(0, 32);
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch (e) {
    return false; // length mismatch etc.
  }
}

// ---------- light per-key rate limit (mild deterrent, not a hard guarantee — see README) ----------
const hits = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
function rateLimited(key) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter(t => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > MAX_PER_WINDOW;
}

// ---------- request size cap ----------
// A real NDA is a few hundred KB at most. 15MB of base64 (~11MB decoded)
// is already generous headroom; beyond that this is either a mistake or
// an attempt at memory exhaustion via an oversized upload or a zip bomb,
// and we reject it before JSZip ever touches it.
const MAX_DOCX_BASE64_CHARS = 15 * 1024 * 1024;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers['authorization'] || '';
  const key = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const secret = process.env.API_SIGNING_SECRET;
  if (!secret) return res.status(500).json({ error: 'Server is missing API_SIGNING_SECRET' });
  if (!validateKey(key, secret)) return res.status(401).json({ error: 'Invalid or missing API key' });
  if (rateLimited(key)) return res.status(429).json({ error: 'Rate limit exceeded — max 20 requests/minute per key' });

  const { docxBase64, rules } = req.body || {};
  if (!docxBase64 || !Array.isArray(rules)) {
    return res.status(400).json({ error: 'Request body must include docxBase64 (string) and rules (array)' });
  }
  if (docxBase64.length > MAX_DOCX_BASE64_CHARS) {
    return res.status(413).json({ error: 'docxBase64 exceeds the maximum accepted size' });
  }

  try {
    const buf = Buffer.from(docxBase64, 'base64');
    const zip = await JSZip.loadAsync(buf);
    const documentXmlFile = zip.file('word/document.xml');
    if (!documentXmlFile) {
      return res.status(400).json({ error: 'This does not appear to be a valid .docx file (no word/document.xml found)' });
    }
    const xmlStr = await documentXmlFile.async('string');
    const xmlDoc = new DOMParser().parseFromString(xmlStr, 'application/xml');
    const paragraphs = extractParagraphs(xmlDoc);

    const findings = runRules(paragraphs, rules, guardedRegexTest);
    const lintWarnings = runLint(paragraphs, rules, findings, guardedRegexTest);

    buildRedlinedXml(xmlDoc, paragraphs, findings, 'NDA Review API');
    const newXmlStr = new XMLSerializer().serializeToString(xmlDoc);
    zip.file('word/document.xml', newXmlStr);
    const outBuf = await zip.generateAsync({ type: 'nodebuffer' });

    res.status(200).json({
      findings: findings.map(f => ({
        rule: f.rule.label, severity: f.rule.severity, action: f.rule.action,
        paragraphIndex: f.paragraphIndex, snippet: f.snippet
      })),
      lintWarnings,
      redlinedDocxBase64: outBuf.toString('base64')
    });
  } catch (err) {
    // Log the real error server-side for debugging, but never forward
    // err.message to the caller — it can leak internal paths, library
    // versions, or other implementation details.
    console.error('api/review error:', err);
    res.status(500).json({ error: 'Could not process this document. Confirm it is a valid .docx file.' });
  }
};

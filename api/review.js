// Vercel Serverless Function — POST /api/review
// Runs the same rule-matching, lint, and OOXML tracked-changes redlining
// engine as the browser version, server-side, by requiring the actual
// shared modules in ../core — not a hand-copied duplicate. Requires a
// valid API key (see api/generate-key.js) in the Authorization header.

const JSZip = require('jszip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const crypto = require('crypto');

const { extractParagraphs } = require('../core/docx-parser');
const { runRules } = require('../core/rules-engine');
const { buildRedlinedXml } = require('../core/redline-builder');
const { runLint } = require('../core/lint');

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

  try {
    const buf = Buffer.from(docxBase64, 'base64');
    const zip = await JSZip.loadAsync(buf);
    const xmlStr = await zip.file('word/document.xml').async('string');
    const xmlDoc = new DOMParser().parseFromString(xmlStr, 'application/xml');
    const paragraphs = extractParagraphs(xmlDoc);

    const findings = runRules(paragraphs, rules);
    const lintWarnings = runLint(paragraphs, rules, findings);

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
    res.status(500).json({ error: err.message || 'Unknown server error' });
  }
};

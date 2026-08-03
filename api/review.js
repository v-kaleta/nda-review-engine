// Vercel Serverless Function — POST /api/review
// Runs the same rule-matching, lint, and OOXML tracked-changes redlining
// engine as the browser version, server-side. Requires a valid API key
// (see api/generate-key.js) in the Authorization header.

const JSZip = require('jszip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const crypto = require('crypto');

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

// ---------- shared engine (ported from the browser build, unchanged logic) ----------
function getElementsByLocalName(root, name) {
  const out = [];
  const all = root.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) { if (all[i].localName === name) out.push(all[i]); }
  return out;
}
function paragraphText(pEl) {
  return getElementsByLocalName(pEl, 't').map(t => t.textContent).join('');
}
function extractParagraphs(xmlDoc) {
  const body = getElementsByLocalName(xmlDoc, 'body')[0];
  const ps = getElementsByLocalName(body, 'p');
  return ps.map((p, i) => ({ index: i, el: p, text: paragraphText(p) }));
}
function testRule(text, rule) {
  let hit;
  if (rule.matchType === 'regex') {
    try { hit = new RegExp(rule.pattern, 'i').test(text); } catch (e) { hit = false; }
  } else {
    hit = text.toLowerCase().indexOf(String(rule.pattern).toLowerCase()) !== -1;
  }
  return rule.matchWhen === 'absent' ? !hit : hit;
}
function testAbsentAgainstFullText(fullText, rule) {
  if (rule.matchType === 'regex') {
    try { return new RegExp(rule.pattern, 'i').test(fullText); } catch (e) { return false; }
  }
  return fullText.toLowerCase().indexOf(String(rule.pattern).toLowerCase()) !== -1;
}
function runRules(paragraphs, rules) {
  const findings = [];
  const fullText = paragraphs.map(p => p.text).join('\n');
  rules.filter(r => r.enabled).forEach(rule => {
    if (rule.matchWhen === 'absent') {
      const present = testAbsentAgainstFullText(fullText, rule);
      if (!present) findings.push({ rule, paragraphIndex: null, snippet: null });
    } else {
      paragraphs.forEach(p => {
        if (testRule(p.text, rule)) findings.push({ rule, paragraphIndex: p.index, snippet: p.text.slice(0, 140) });
      });
    }
  });
  return findings;
}
function findingsByParagraph(findings) {
  const map = {};
  findings.forEach(f => {
    if (f.paragraphIndex === null) return;
    if (!map[f.paragraphIndex]) map[f.paragraphIndex] = [];
    map[f.paragraphIndex].push(f);
  });
  return map;
}
function markRunsDeleted(pEl, xmlDoc, author, dateStr) {
  const runs = getElementsByLocalName(pEl, 'r');
  runs.forEach(r => {
    getElementsByLocalName(r, 't').forEach(t => {
      const delText = xmlDoc.createElementNS(WORD_NS, 'w:delText');
      delText.setAttribute('xml:space', 'preserve');
      delText.textContent = t.textContent;
      t.parentNode.replaceChild(delText, t);
    });
    const del = xmlDoc.createElementNS(WORD_NS, 'w:del');
    del.setAttribute('w:id', String(Math.floor(Math.random() * 1000000)));
    del.setAttribute('w:author', author);
    del.setAttribute('w:date', dateStr);
    r.parentNode.insertBefore(del, r);
    del.appendChild(r);
  });
}
function buildInsertedParagraph(xmlDoc, origPEl, text, author, dateStr) {
  const p = xmlDoc.createElementNS(WORD_NS, 'w:p');
  const origPPr = getElementsByLocalName(origPEl, 'pPr')[0];
  if (origPPr) p.appendChild(origPPr.cloneNode(true));
  const ins = xmlDoc.createElementNS(WORD_NS, 'w:ins');
  ins.setAttribute('w:id', String(Math.floor(Math.random() * 1000000)));
  ins.setAttribute('w:author', author);
  ins.setAttribute('w:date', dateStr);
  const r = xmlDoc.createElementNS(WORD_NS, 'w:r');
  const t = xmlDoc.createElementNS(WORD_NS, 'w:t');
  t.setAttribute('xml:space', 'preserve');
  t.textContent = text;
  r.appendChild(t);
  ins.appendChild(r);
  p.appendChild(ins);
  return p;
}
function highlightRuns(pEl, xmlDoc) {
  getElementsByLocalName(pEl, 'r').forEach(r => {
    let rPr = getElementsByLocalName(r, 'rPr')[0];
    if (!rPr) { rPr = xmlDoc.createElementNS(WORD_NS, 'w:rPr'); r.insertBefore(rPr, r.firstChild); }
    const hl = xmlDoc.createElementNS(WORD_NS, 'w:highlight');
    hl.setAttribute('w:val', 'yellow');
    rPr.appendChild(hl);
  });
}
function buildRedlinedXml(xmlDoc, paragraphs, findings, author) {
  const dateStr = new Date().toISOString();
  const byPara = findingsByParagraph(findings);
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    const p = paragraphs[i];
    const pFindings = byPara[p.index];
    if (!pFindings || !pFindings.length) continue;
    const editFindings = pFindings.filter(f => f.rule.action === 'strike' || f.rule.action === 'suggest');
    const flagOnly = pFindings.filter(f => f.rule.action === 'flag');
    if (editFindings.length) {
      const withSuggestion = editFindings.filter(f => f.rule.action === 'suggest' && f.rule.suggestedText)[0];
      if (withSuggestion) {
        const newP = buildInsertedParagraph(xmlDoc, p.el, withSuggestion.rule.suggestedText, author, dateStr);
        p.el.parentNode.insertBefore(newP, p.el.nextSibling);
      }
      markRunsDeleted(p.el, xmlDoc, author, dateStr);
    } else if (flagOnly.length) {
      highlightRuns(p.el, xmlDoc);
    }
  }
}

// ---------- lint (over-broad edit detection, unchanged logic) ----------
function median(nums) {
  const s = nums.slice().sort((a, b) => a - b);
  const n = s.length;
  if (!n) return 0;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
function wordCount(s) { return (s.trim().match(/\S+/g) || []).length; }
function runLint(paragraphs, rules, findings) {
  const warnings = [];
  const lengths = paragraphs.map(p => wordCount(p.text)).filter(n => n > 0);
  const medianLen = median(lengths) || 1;
  const editRules = rules.filter(r => r.enabled && (r.action === 'strike' || r.action === 'suggest'));

  editRules.forEach(rule => {
    if (rule.matchWhen === 'absent') return;
    const matchCount = paragraphs.filter(p => testRule(p.text, rule)).length;
    const frac = matchCount / paragraphs.length;
    if (frac > 0.25 && matchCount > 1) {
      warnings.push({ type: 'broad-pattern', message: `Pattern "${rule.pattern}" (rule "${rule.label}") matched ${matchCount} of ${paragraphs.length} clauses (${Math.round(frac * 100)}%) with a destructive action (${rule.action}). Likely over-broad.` });
    }
  });
  editRules.forEach(rule => {
    if (rule.matchType === 'keyword' && rule.pattern && rule.pattern.trim().length < 4) {
      warnings.push({ type: 'short-pattern', message: `Pattern "${rule.pattern}" (rule "${rule.label}") is very short for a destructive action (${rule.action}).` });
    }
  });
  findings.forEach(f => {
    if (f.paragraphIndex === null || (f.rule.action !== 'strike' && f.rule.action !== 'suggest')) return;
    const p = paragraphs[f.paragraphIndex];
    const wc = wordCount(p.text);
    if (wc > medianLen * 2.5 && wc > 20) {
      warnings.push({ type: 'long-clause', message: `Rule "${f.rule.label}" strikes clause ${f.paragraphIndex} (${wc} words, vs. a ${Math.round(medianLen)}-word median).` });
    }
  });
  findings.forEach(f => {
    if (f.paragraphIndex === null || f.rule.action !== 'suggest' || !f.rule.suggestedText) return;
    const p = paragraphs[f.paragraphIndex];
    const origWc = wordCount(p.text) || 1;
    const sugWc = wordCount(f.rule.suggestedText);
    const ratio = sugWc / origWc;
    if (ratio < 0.3 || ratio > 3.0) {
      warnings.push({ type: 'length-mismatch', message: `Suggested replacement for clause ${f.paragraphIndex} is ${sugWc} words vs. the original's ${origWc} (${ratio.toFixed(1)}x).` });
    }
  });
  return warnings;
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

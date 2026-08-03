/**
 * NDA Review API — Node.js client
 *
 * Zero dependencies (uses Node's built-in fetch, Node 18+). Drop this file
 * into your own project and import it, or copy the two methods into your
 * existing HTTP client setup.
 *
 * Usage:
 *   const { NdaReviewClient } = require('./nda-review-client');
 *   const client = new NdaReviewClient({ baseUrl: 'https://your-deployment.vercel.app' });
 *
 *   const { key } = await client.generateKey();
 *   // store `key` somewhere safe — it's shown once, same as any API key
 *
 *   const result = await client.review({
 *     docxPath: './some-nda.docx',
 *     apiKey: key,
 *     rules: [
 *       { label: 'Perpetual term', matchType: 'regex', pattern: 'perpetual|indefinitely',
 *         matchWhen: 'present', severity: 'critical', action: 'flag', enabled: true }
 *     ]
 *   });
 *   console.log(result.findings, result.lintWarnings);
 *   fs.writeFileSync('redlined.docx', Buffer.from(result.redlinedDocxBase64, 'base64'));
 */

const fs = require('fs');

class NdaReviewClient {
  /**
   * @param {Object} opts
   * @param {string} opts.baseUrl - e.g. 'https://your-deployment.vercel.app' (no trailing slash)
   */
  constructor(opts) {
    if (!opts || !opts.baseUrl) throw new Error('NdaReviewClient requires { baseUrl }');
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
  }

  /**
   * Generate a new API key. No authentication required for this call.
   * @returns {Promise<{ key: string, issuedAt: number }>}
   */
  async generateKey() {
    const resp = await fetch(this.baseUrl + '/api/generate-key', { method: 'POST' });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || ('Request failed with status ' + resp.status));
    return data;
  }

  /**
   * Run a review. Accepts either a local file path (docxPath) or an
   * already-base64-encoded document (docxBase64) — provide one or the other.
   * @param {Object} opts
   * @param {string} opts.apiKey
   * @param {Array<Object>} opts.rules
   * @param {string} [opts.docxPath] - path to a local .docx file
   * @param {string} [opts.docxBase64] - base64-encoded .docx content
   * @returns {Promise<{ findings: Array, lintWarnings: Array, redlinedDocxBase64: string }>}
   */
  async review(opts) {
    if (!opts || !opts.apiKey) throw new Error('review() requires { apiKey }');
    if (!Array.isArray(opts.rules)) throw new Error('review() requires { rules: [...] }');
    if (!opts.docxPath && !opts.docxBase64) throw new Error('review() requires either { docxPath } or { docxBase64 }');

    const docxBase64 = opts.docxBase64 || fs.readFileSync(opts.docxPath).toString('base64');

    const resp = await fetch(this.baseUrl + '/api/review', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + opts.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ docxBase64, rules: opts.rules })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || ('Request failed with status ' + resp.status));
    return data;
  }

  /**
   * Convenience: run a review and write the redlined .docx straight to disk.
   * @param {Object} opts - same as review(), plus:
   * @param {string} opts.outputPath - where to write the redlined .docx
   */
  async reviewAndSave(opts) {
    const result = await this.review(opts);
    fs.writeFileSync(opts.outputPath, Buffer.from(result.redlinedDocxBase64, 'base64'));
    return result;
  }
}

module.exports = { NdaReviewClient };

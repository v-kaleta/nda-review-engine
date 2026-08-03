// Vercel Serverless Function — POST /api/generate-key
// Issues a self-verifying API key: randomId + issuedAt + HMAC-SHA256 signature.
// No database required — /api/review validates keys by recomputing the
// signature with the same secret, so there's nothing to look up or store.
// Tradeoff: keys can't be individually revoked without maintaining a
// denylist. Fine for a demo; a production version would want persistent
// storage (e.g. Vercel KV) to support revocation and per-key usage tracking.

const crypto = require('crypto');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.API_SIGNING_SECRET;
  if (!secret) return res.status(500).json({ error: 'Server is missing API_SIGNING_SECRET' });

  const randomId = crypto.randomBytes(12).toString('hex');
  const issuedAt = Date.now().toString();
  const signature = crypto.createHmac('sha256', secret).update(randomId + '.' + issuedAt).digest('hex').slice(0, 32);
  const key = `ndarev_${randomId}.${issuedAt}.${signature}`;

  res.status(200).json({ key, issuedAt: Number(issuedAt) });
};

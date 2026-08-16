# NDA Review API

A real serverless API — POST a `.docx` and a rules array, get back findings, lint
warnings, and a genuinely redlined `.docx` with real Word tracked changes. This is
the same engine that runs in the browser tool, ported to run server-side.

## Setup

1. **Generate a signing secret.** This is what makes API keys self-verifying without
   a database — anyone can generate a key, and the server validates it by recomputing
   its signature with this secret. Anything long and random works:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. In your Vercel project settings, add an environment variable:
   - Key: `API_SIGNING_SECRET`
   - Value: the string from step 1
3. Deploy. `api/generate-key.js` and `api/review.js` will be picked up automatically
   as serverless functions, same as the site's existing `api/parse-query.js`-style
   setup on the other projects.

## Endpoints

**`POST /api/generate-key`** — no auth required. Returns `{ key, issuedAt }`.
Keys look like `ndarev_<randomId>.<issuedAt>.<signature>` and are shown once —
there's nothing to "look up" server-side to show it again later.

**`POST /api/review`** — requires `Authorization: Bearer <key>`. Body:
```json
{ "docxBase64": "...", "rules": [ { "label": "...", "matchType": "keyword|regex", "pattern": "...", "matchWhen": "present|absent", "severity": "critical|warning|note", "action": "flag|strike|suggest", "suggestedText": "...", "enabled": true } ] }
```
Returns `{ findings, lintWarnings, redlinedDocxBase64 }`.

## Honest limitations

- **No revocation.** Keys are stateless HMAC-signed tokens, not looked up in a
  database — there's nothing to delete to revoke one early. A production version
  handling real customer data would want persistent storage (Vercel KV, a real DB)
  so keys can be individually revoked and usage tracked per key.
- **Rate limiting is a soft deterrent, not a guarantee** — same caveat as the other
  projects' serverless functions: the in-memory limiter doesn't share state across
  regions or cold starts. Don't rely on it as your only abuse protection.
- **No key expiry enforced.** `issuedAt` is embedded in the key but nothing currently
  rejects old keys — that'd be a straightforward addition if needed (reject if
  `Date.now() - issuedAt > maxAge`).

## Server-side hardening on `/api/review`

Unlike the browser tool, this endpoint runs caller-supplied regex patterns against
caller-supplied documents on shared infrastructure, which is a meaningfully different
threat model. A few protections specific to that:

- **Regex execution is wall-clock bounded.** A pattern like `(a+)+$` triggers
  catastrophic backtracking and can hang synchronous JS regex matching
  indefinitely. Every regex test on this endpoint runs inside `vm.Script` with a
  50ms `timeout`, which forcibly aborts execution if exceeded — Node's built-in
  mechanism for this, no extra dependency. A timeout (or an invalid pattern) both
  fail closed as "no match," never as a thrown error or a hang. The browser tool
  doesn't need this — a slow pattern there only affects the user's own tab.
- **`docxBase64` has a size cap** (15MB of base64, ~11MB decoded) enforced before
  the payload is ever decoded or handed to JSZip, as a guard against memory
  exhaustion from an oversized upload or a zip bomb.
- **A missing `word/document.xml` is checked explicitly** and returns a clean 400
  instead of throwing when a non-`.docx` (or corrupted) zip is uploaded.
- **Error responses never include `err.message`.** The real error is logged
  server-side via `console.error` for debugging; the client only ever sees a fixed,
  generic message, so internal paths, library versions, or other implementation
  details can't leak through an error response.

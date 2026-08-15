# NDA Review Engine

A customizable, clause-level NDA review tool. Upload a .docx non-disclosure agreement, define
the rules your firm reviews against, and get back a genuine Word tracked-changes redline plus
a clean, signed execution copy — entirely in the browser, no backend, no document ever leaves
your machine.

**Live:** [nda-review-engine.vercel.app](#) (update once deployed)

## Why this exists

This generalizes an NDA-redlining engine originally built during a private equity internship,
where it cut per-NDA review time from ~30 minutes to ~2 minutes for a codified, firm-specific
clause rules matrix. That original rules matrix is proprietary and stays with that firm — this
version ships with a 14-rule generic starter set grounded in documented PE NDA redline practice
(confidential information scope, non-solicits, standstills, financing-source carve-outs,
indemnification, termination, and more) so **any** firm can start from a realistic baseline and
customize from there.

## How it works

1. **Upload** — a .docx is read client-side with JSZip; `word/document.xml` is parsed directly
   as OOXML.
2. **Rules** — fully editable: keyword or regex pattern, match-if-present or match-if-absent
   (for clauses that *should* be there, like a residuals carve-out), severity, and an action
   (flag / strike / strike-and-suggest-replacement). Rules persist in the browser via
   localStorage. Rather than typing rules in one at a time, a firm can upload its own
   requirements as a CSV (a downloadable template shows the expected columns) or a previously
   exported JSON file — either replacing the current rule set or adding to it.
3. **Review** — every enabled rule runs against every clause (paragraph). Findings are grouped
   by severity with the rule's guidance text attached.
4. **Lint** — a separate automated pass checks the *redline itself*, not just what the rules
   matched, for signs of an over-broad edit: a pattern destructively matching an unusually large
   share of clauses, a very short pattern paired with a destructive action, a struck clause
   that's unusually long relative to the rest of the document, or a suggested replacement whose
   length differs drastically from the original. This catches rules that are technically working
   but poorly scoped, before they ever touch the document.
5. **Redline** — matched clauses are rewritten as real OOXML tracked changes: `<w:del>` with
   `<w:delText>` for struck clauses, `<w:ins>` for suggested replacement language, and
   `<w:highlight>` for flag-only findings. The output is a genuine `.docx` that opens in Word
   with visible tracked changes — not an image or a converted preview.
6. **Sign & finalize** — either draw a signature on the canvas pad, or upload a signature image
   (PNG/JPG) instead. The generated PDF looks for the document's own signature line (a run of
   underscores, or a standalone "By:"/"Signature:" label) and places the signature to hover
   directly above it, with name/title/date captioned just below — matching how the document was
   actually meant to be signed, rather than always appending a generic signature block at the
   end. If no such line is found, it falls back to an appended "Executed as of..." block.

## All Contracts

A second tab tracks every NDA that's gone through the tool, persisted locally in the browser:
each contract shows a status pill (Review \u2192 Sign \u2192 Completed) that updates automatically as
you upload, review, and generate documents. An Insights panel aggregates findings by severity
across every contract in the list as a donut chart, so a firm can see at a glance how much
critical-vs-routine risk has come through recently. Nothing here is synced anywhere \u2014 it's
local browser storage, same as the rule set.

## Developer API

A third tab exposes the same review engine as a real backend API — see `api/README.md` for
full setup and endpoint documentation. In short: `POST /api/generate-key` issues a
self-verifying API key (no database required), and `POST /api/review` accepts a base64-encoded
`.docx` and a rules array, runs the identical rule-matching/lint/redlining logic server-side,
and returns findings plus a genuinely redlined `.docx`. Requires deploying with an
`API_SIGNING_SECRET` environment variable set.

Note the word "identical" above is literal, not aspirational: `api/review.js` and the browser
client both `require`/load the exact same files in `core/` (see Architecture below) — using
`@xmldom/xmldom` in place of the browser's native `DOMParser`/`XMLSerializer`, which is a
drop-in-compatible implementation of the same DOM interfaces this code touches. There is no
second copy of the engine to drift out of sync.

### Client SDKs

For firms integrating this into their own systems rather than working from the browser tool,
see `sdk/` — a Node.js client, a Python client, an OpenAPI spec (for generating a client in any
other language), and a Postman collection, all tested against a live instance of the API.

## Scope and limitations

- Redlining operates at clause (paragraph) granularity, not word-level surgical edits.
- The paragraph mark itself isn't marked deleted on full-clause strikes, so accepting a
  deletion in Word leaves an empty paragraph rather than perfectly merging — a minor cosmetic
  simplification.
- The final PDF is a clean re-typeset rendering of the accepted text, not a pixel-for-pixel
  conversion of the original .docx's formatting.
- This is a starting point for attorney review, not a substitute for one.

## Stack

Vanilla HTML/CSS/JS, no framework or build step. [JSZip](https://stuk.github.io/jszip/) for
reading/writing the .docx package, [jsPDF](https://github.com/parallax/jsPDF) for the execution
copy.

## Architecture

The review/redline/lint engine lives in `core/` as small, dependency-free, single-purpose
modules — no bundler, no framework, still just `<script>` tags in the browser. Each file uses
a tiny UMD wrapper so the *same file* works two ways with zero build step either side:

- In the browser, `index.html` loads them as plain scripts (`<script src="core/...">`) and
  each one attaches its exports to a shared `window.NDA` namespace.
- In Node, `api/review.js` and the test suite `require('../core/...')` them directly as
  CommonJS modules.

| Module | Responsibility |
|---|---|
| `core/docx-parser.js` | Extracts paragraphs from a parsed `word/document.xml` |
| `core/rules-engine.js` | Runs a rule set against paragraphs, produces findings |
| `core/redline-builder.js` | Rewrites findings as real OOXML tracked changes (`w:del`/`w:ins`/`w:highlight`) |
| `core/lint.js` | Second pass that flags over-broad edits in the redline itself |
| `core/rules-io.js` | Parses/validates a firm's rules from CSV or JSON |
| `core/default-rules.js` | The 14-rule generic starter set |
| `core/signature-line.js` | Detects an existing signature line for PDF placement |
| `core/text-utils.js` | `escapeHtml` / `fmtDate` |

`js/app.js` is everything else: DOM rendering, event listeners, `localStorage`-backed state
(rule set + contracts list), file upload, the signature pad, and PDF/document generation. It's
UI orchestration only — it calls into `core/` for every actual decision the engine makes, and
has no server-side equivalent (the API doesn't need a signature pad).

### Tests

```
npm install
npm test
```

Runs on Node's built-in test runner (`node --test`, no dependency added beyond
`@xmldom/xmldom`, which the API already needs). Coverage is on the deterministic `core/`
engine — rule matching, OOXML redline structure, the lint heuristics, and CSV/JSON rule
import/validation — since that's the part correctness actually matters for. UI wiring in
`js/app.js` isn't unit-tested; it's thin enough to be covered by manually exercising the app.

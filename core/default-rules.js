// core/default-rules.js
// The 14-rule generic starter set grounded in documented PE NDA redline
// practice. Browser-only (the API takes rules from the request body), but
// lives in core/ so it's testable and has a single source of truth.
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = mod;
  } else {
    root.NDA = root.NDA || {};
    root.NDA.DefaultRules = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  var DEFAULT_RULES = [
    { id: 'r1', label: 'Perpetual / indefinite confidentiality term', matchType: 'regex', pattern: 'perpetual|indefinitely|no expiration', matchWhen: 'present', severity: 'critical', action: 'suggest',
      suggestedText: 'The obligations of confidentiality set forth herein shall survive for a period of three (3) years from the date of disclosure, except that obligations with respect to trade secrets shall survive for so long as such information remains a trade secret under applicable law.',
      guidance: 'Unbounded confidentiality terms are difficult to enforce and often rejected by counterparties. Suggested language bounds the term while preserving trade-secret protection.', enabled: true },
    { id: 'r2', label: 'Overly broad "Confidential Information" definition', matchType: 'keyword', pattern: 'any and all information', matchWhen: 'present', severity: 'warning', action: 'flag',
      guidance: 'Consider narrowing to information that is marked confidential or would reasonably be understood as confidential given its nature.', enabled: true },
    { id: 'r3', label: 'Broad indemnification language', matchType: 'keyword', pattern: 'indemnif', matchWhen: 'present', severity: 'warning', action: 'flag',
      guidance: 'Indemnification clauses are uncommon in U.S. NDAs and generally viewed as off-market \u2014 sellers can already sue for breach of contract or seek injunctive relief. Confirm scope is mutual and capped, or push to remove entirely.', enabled: true },
    { id: 'r4', label: 'Non-solicit period exceeds 24 months', matchType: 'regex', pattern: '(2[5-9]|[3-9]\\d)\\s*\\)?\\s*months', matchWhen: 'present', severity: 'warning', action: 'flag',
      guidance: 'Non-solicit periods beyond 24 months may be viewed as overly restrictive. Market practice for PE buyers typically runs 6\u201318 months. Confirm scope excludes candidates sourced via recruiters or who self-initiate contact, and that it doesn\u2019t bind portfolio companies uninvolved in this transaction.', enabled: true },
    { id: 'r5', label: 'Missing residual-information clause', matchType: 'keyword', pattern: 'residual', matchWhen: 'absent', severity: 'critical', action: 'flag',
      guidance: 'No carve-out found for information retained in employees\u2019 unaided memory. Consider adding a residuals clause.', enabled: true },
    { id: 'r6', label: 'Missing injunctive relief clause', matchType: 'keyword', pattern: 'injunctive relief', matchWhen: 'absent', severity: 'warning', action: 'flag',
      guidance: 'No language confirming injunctive relief is available for breach. Monetary damages alone may be an inadequate remedy for disclosure.', enabled: true },
    { id: 'r7', label: 'Governing law jurisdiction', matchType: 'keyword', pattern: 'governed by the laws', matchWhen: 'present', severity: 'note', action: 'suggest',
      suggestedText: 'This Agreement shall be governed by the laws of the State of [YOUR FIRM\u2019S PREFERRED STATE], without regard to its conflict of laws principles.',
      guidance: 'Replace the bracketed jurisdiction with your firm\u2019s standard governing-law preference.', enabled: true },
    { id: 'r8', label: 'Missing return/destruction of information clause', matchType: 'keyword', pattern: 'return or destroy', matchWhen: 'absent', severity: 'warning', action: 'flag',
      guidance: 'No clause found requiring return or destruction of Confidential Information upon request or termination. If present elsewhere, confirm it includes an exception allowing retention per standard compliance/recordkeeping policies, with use of retained information limited to legal, compliance, or IT purposes.', enabled: true },
    { id: 'r9', label: 'One-way disclosure language in a mutual agreement', matchType: 'keyword', pattern: 'unilaterally', matchWhen: 'present', severity: 'note', action: 'flag',
      guidance: 'Confirm this language matches the intended deal structure (mutual vs. one-way).', enabled: true },
    { id: 'r10', label: 'Non-compete / restrictive covenant present', matchType: 'keyword', pattern: 'non-compete', matchWhen: 'present', severity: 'warning', action: 'flag',
      guidance: 'Review duration and geographic scope against firm standard.', enabled: true },
    { id: 'r11', label: 'Missing financing-sources carve-out in Representatives definition', matchType: 'regex', pattern: 'financing sources?|debt (and|or) equity financing', matchWhen: 'absent', severity: 'critical', action: 'flag',
      guidance: 'No language found permitting disclosure to debt or equity financing sources. Without this carve-out, the buyer may be unable to share diligence materials with lenders or co-investors needed to actually finance the deal \u2014 a common and important addition to the Representatives definition for PE buyers.', enabled: true },
    { id: 'r12', label: 'Standstill clause present', matchType: 'keyword', pattern: 'standstill', matchWhen: 'present', severity: 'note', action: 'flag',
      guidance: 'Relevant mainly for public targets. Market practice for PE buyers is typically 6\u201318 months \u2014 confirm duration, that it doesn\u2019t bind Representatives, and that it includes a fallaway or exception for de minimis transactions.', enabled: true },
    { id: 'r13', label: 'No-contact clause scope', matchType: 'keyword', pattern: 'shall not contact', matchWhen: 'present', severity: 'note', action: 'flag',
      guidance: 'Confirm the restricted-party list (employees, customers, suppliers, lenders) isn\u2019t broader than necessary, and that there\u2019s a carve-out for ordinary-course contact unrelated to the transaction and for \u201cno-names\u201d diligence through expert networks.', enabled: true },
    { id: 'r14', label: 'Joinder requirement for financing sources', matchType: 'keyword', pattern: 'joinder', matchWhen: 'present', severity: 'note', action: 'flag',
      guidance: 'Confirms whether financing sources must separately sign onto the NDA\u2019s terms. Adds an administrative step \u2014 track whether this is required or left to the buyer\u2019s discretion.', enabled: true }
  ];

  return DEFAULT_RULES;
});

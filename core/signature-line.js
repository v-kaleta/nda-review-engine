// core/signature-line.js
// Detects whether a line of document text is a blank signature line (a run
// of underscores, or a standalone "By:"/"Signature:" label), so the
// execution-copy PDF can place the signature image directly above it.
// Browser-only, but pure and lives in core/ so it's unit-testable.
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = mod;
  } else {
    root.NDA = root.NDA || {};
    root.NDA.SignatureLine = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function isSignatureLine(text) {
    var t = text.trim();
    if (!t) return false;
    if (/_{3,}/.test(t)) return true; // a blank/underscore signature rule, e.g. "By: ______________"
    if (/^(by|signature|signed|authorized signatory)\s*:?\s*$/i.test(t)) return true;
    return false;
  }

  return { isSignatureLine: isSignatureLine };
});

// core/text-utils.js
// Small, pure text-formatting helpers used across the rendering code.
// Framework-free and DOM-free, so they're trivially unit-testable.
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = mod;
  } else {
    root.NDA = root.NDA || {};
    root.NDA.TextUtils = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtDate(ts) {
    return new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  return { escapeHtml: escapeHtml, fmtDate: fmtDate };
});

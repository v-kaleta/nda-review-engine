// core/signature-fields.js
// Detects a "Name:", "Title:", "Date:", or combined "Name/Title/Date:"
// label line near a signature block, and fills the associate's info
// directly after the colon — instead of appending a separate floating
// caption line, which duplicates information the document already has
// a dedicated place for. Browser-only, pure, lives in core/ for testing.
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = mod;
  } else {
    root.NDA = root.NDA || {};
    root.NDA.SignatureFields = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {

  function matchFieldLine(text) {
    var t = text.trim();
    if (!t) return null;
    if (/^name\s*\/\s*title\s*\/\s*date\s*:?\s*$/i.test(t)) return 'combined';
    if (/^(print(ed)?\s+)?name\s*:?\s*$/i.test(t)) return 'name';
    if (/^title\s*:?\s*$/i.test(t)) return 'title';
    if (/^date\s*:?\s*$/i.test(t)) return 'date';
    return null;
  }

  function fillFieldLine(type, fields) {
    var name = (fields.name || '').trim();
    var title = (fields.title || '').trim();
    var dateVal = (fields.dateVal || '').trim();
    if (type === 'combined') {
      var parts = [name, title, dateVal].filter(function (p) { return p; });
      return 'Name/Title/Date: ' + parts.join(' / ');
    }
    if (type === 'name') return 'Name: ' + name;
    if (type === 'title') return 'Title: ' + title;
    if (type === 'date') return 'Date: ' + dateVal;
    return null;
  }

  // Scans a small window of paragraphs after a signature line for
  // fillable label lines, and returns a copy of `paragraphs` with any
  // matches filled in. `anyFilled` tells the caller whether to skip the
  // fallback floating caption.
  function fillNearbyFields(paragraphs, startIndex, fields, lookahead) {
    var out = paragraphs.slice();
    var anyFilled = false;
    var end = Math.min(paragraphs.length, startIndex + 1 + (lookahead || 5));
    for (var i = startIndex + 1; i < end; i++) {
      var type = matchFieldLine(out[i]);
      if (type) {
        var filled = fillFieldLine(type, fields);
        if (filled) { out[i] = filled; anyFilled = true; }
      }
    }
    return { paragraphs: out, anyFilled: anyFilled };
  }

  return {
    matchFieldLine: matchFieldLine,
    fillFieldLine: fillFieldLine,
    fillNearbyFields: fillNearbyFields
  };
});

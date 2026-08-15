// core/docx-parser.js
// Reads paragraphs out of a parsed word/document.xml OOXML DOM.
// Shared, unchanged logic between the browser client and the Node API —
// see README "Shared core" for why this file exists.
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = mod; // Node / CommonJS (api/review.js, tests)
  } else {
    root.NDA = root.NDA || {};
    root.NDA.DocxParser = mod; // plain <script> tag in the browser
  }
})(typeof self !== 'undefined' ? self : this, function () {
  var WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

  function getElementsByLocalName(root, name) {
    var out = [];
    var all = root.getElementsByTagName('*');
    for (var i = 0; i < all.length; i++) {
      if (all[i].localName === name) out.push(all[i]);
    }
    return out;
  }

  function paragraphText(pEl) {
    return getElementsByLocalName(pEl, 't')
      .map(function (t) { return t.textContent; })
      .join('');
  }

  function extractParagraphs(xmlDoc) {
    var body = getElementsByLocalName(xmlDoc, 'body')[0];
    var ps = getElementsByLocalName(body, 'p');
    return ps.map(function (p, i) {
      return { index: i, el: p, text: paragraphText(p) };
    });
  }

  return {
    WORD_NS: WORD_NS,
    getElementsByLocalName: getElementsByLocalName,
    paragraphText: paragraphText,
    extractParagraphs: extractParagraphs
  };
});

// core/redline-builder.js
// Rewrites matched paragraphs as real OOXML tracked changes (w:del / w:ins /
// w:highlight), and computes the plain-text "final" version of the document
// for the execution-copy PDF. Shared, unchanged logic between the browser
// client and the Node API.
(function (root, factory) {
  var deps = (typeof module === 'object' && module.exports)
    ? { docxParser: require('./docx-parser'), rulesEngine: require('./rules-engine') }
    : { docxParser: root.NDA.DocxParser, rulesEngine: root.NDA.RulesEngine };
  var mod = factory(deps.docxParser, deps.rulesEngine);
  if (typeof module === 'object' && module.exports) {
    module.exports = mod;
  } else {
    root.NDA = root.NDA || {};
    root.NDA.RedlineBuilder = mod;
  }
})(typeof self !== 'undefined' ? self : this, function (docxParser, rulesEngine) {
  var WORD_NS = docxParser.WORD_NS;
  var getElementsByLocalName = docxParser.getElementsByLocalName;
  var findingsByParagraph = rulesEngine.findingsByParagraph;

  function markRunsDeleted(pEl, xmlDoc, author, dateStr) {
    var runs = getElementsByLocalName(pEl, 'r');
    runs.forEach(function (r) {
      var ts = getElementsByLocalName(r, 't');
      ts.forEach(function (t) {
        var delText = xmlDoc.createElementNS(WORD_NS, 'w:delText');
        delText.setAttribute('xml:space', 'preserve');
        delText.textContent = t.textContent;
        t.parentNode.replaceChild(delText, t);
      });
      var del = xmlDoc.createElementNS(WORD_NS, 'w:del');
      del.setAttribute('w:id', String(Math.floor(Math.random() * 1000000)));
      del.setAttribute('w:author', author);
      del.setAttribute('w:date', dateStr);
      r.parentNode.insertBefore(del, r);
      del.appendChild(r);
    });
  }

  function buildInsertedParagraph(xmlDoc, origPEl, text, author, dateStr) {
    var p = xmlDoc.createElementNS(WORD_NS, 'w:p');
    var origPPr = getElementsByLocalName(origPEl, 'pPr')[0];
    if (origPPr) p.appendChild(origPPr.cloneNode(true));
    var ins = xmlDoc.createElementNS(WORD_NS, 'w:ins');
    ins.setAttribute('w:id', String(Math.floor(Math.random() * 1000000)));
    ins.setAttribute('w:author', author);
    ins.setAttribute('w:date', dateStr);
    var r = xmlDoc.createElementNS(WORD_NS, 'w:r');
    var t = xmlDoc.createElementNS(WORD_NS, 'w:t');
    t.setAttribute('xml:space', 'preserve');
    t.textContent = text;
    r.appendChild(t);
    ins.appendChild(r);
    p.appendChild(ins);
    return p;
  }

  function highlightRuns(pEl, xmlDoc) {
    var runs = getElementsByLocalName(pEl, 'r');
    runs.forEach(function (r) {
      var rPr = getElementsByLocalName(r, 'rPr')[0];
      if (!rPr) { rPr = xmlDoc.createElementNS(WORD_NS, 'w:rPr'); r.insertBefore(rPr, r.firstChild); }
      var hl = xmlDoc.createElementNS(WORD_NS, 'w:highlight');
      hl.setAttribute('w:val', 'yellow');
      rPr.appendChild(hl);
    });
  }

  function buildRedlinedXml(xmlDoc, paragraphs, findings, author) {
    var dateStr = new Date().toISOString();
    var byPara = findingsByParagraph(findings);
    for (var i = paragraphs.length - 1; i >= 0; i--) {
      var p = paragraphs[i];
      var pFindings = byPara[p.index];
      if (!pFindings || !pFindings.length) continue;
      var editFindings = pFindings.filter(function (f) { return f.rule.action === 'strike' || f.rule.action === 'suggest'; });
      var flagOnly = pFindings.filter(function (f) { return f.rule.action === 'flag'; });
      if (editFindings.length) {
        var withSuggestion = editFindings.filter(function (f) { return f.rule.action === 'suggest' && f.rule.suggestedText; })[0];
        if (withSuggestion) {
          var newP = buildInsertedParagraph(xmlDoc, p.el, withSuggestion.rule.suggestedText, author, dateStr);
          p.el.parentNode.insertBefore(newP, p.el.nextSibling);
        }
        markRunsDeleted(p.el, xmlDoc, author, dateStr);
      } else if (flagOnly.length) {
        highlightRuns(p.el, xmlDoc);
      }
    }
  }

  function computeFinalText(paragraphs, findings) {
    var byPara = findingsByParagraph(findings);
    var out = [];
    paragraphs.forEach(function (p) {
      var pFindings = byPara[p.index];
      if (pFindings && pFindings.length) {
        var editFindings = pFindings.filter(function (f) { return f.rule.action === 'strike' || f.rule.action === 'suggest'; });
        if (editFindings.length) {
          var withSuggestion = editFindings.filter(function (f) { return f.rule.action === 'suggest' && f.rule.suggestedText; })[0];
          if (withSuggestion) out.push(withSuggestion.rule.suggestedText);
          return;
        }
      }
      out.push(p.text);
    });
    return out;
  }

  return {
    markRunsDeleted: markRunsDeleted,
    buildInsertedParagraph: buildInsertedParagraph,
    highlightRuns: highlightRuns,
    buildRedlinedXml: buildRedlinedXml,
    computeFinalText: computeFinalText
  };
});

// core/rules-engine.js
// Runs the user's rule set against extracted paragraphs and produces findings.
// Shared, unchanged logic between the browser client and the Node API.
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = mod;
  } else {
    root.NDA = root.NDA || {};
    root.NDA.RulesEngine = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {

  function testRule(text, rule) {
    var hit;
    if (rule.matchType === 'regex') {
      try { hit = new RegExp(rule.pattern, 'i').test(text); } catch (e) { hit = false; }
    } else {
      hit = text.toLowerCase().indexOf(String(rule.pattern).toLowerCase()) !== -1;
    }
    return rule.matchWhen === 'absent' ? !hit : hit;
  }

  function testAbsentAgainstFullText(fullText, rule) {
    if (rule.matchType === 'regex') {
      try { return new RegExp(rule.pattern, 'i').test(fullText); } catch (e) { return false; }
    }
    return fullText.toLowerCase().indexOf(String(rule.pattern).toLowerCase()) !== -1;
  }

  function runRules(paragraphs, rules) {
    var findings = [];
    var fullText = paragraphs.map(function (p) { return p.text; }).join('\n');
    rules.filter(function (r) { return r.enabled; }).forEach(function (rule) {
      if (rule.matchWhen === 'absent') {
        var present = testAbsentAgainstFullText(fullText, rule);
        if (!present) findings.push({ rule: rule, paragraphIndex: null, snippet: null });
      } else {
        paragraphs.forEach(function (p) {
          if (testRule(p.text, rule)) {
            findings.push({ rule: rule, paragraphIndex: p.index, snippet: p.text.slice(0, 140) });
          }
        });
      }
    });
    return findings;
  }

  function findingsByParagraph(findings) {
    var map = {};
    findings.forEach(function (f) {
      if (f.paragraphIndex === null) return;
      if (!map[f.paragraphIndex]) map[f.paragraphIndex] = [];
      map[f.paragraphIndex].push(f);
    });
    return map;
  }

  return {
    testRule: testRule,
    testAbsentAgainstFullText: testAbsentAgainstFullText,
    runRules: runRules,
    findingsByParagraph: findingsByParagraph
  };
});

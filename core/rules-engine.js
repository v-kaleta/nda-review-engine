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

  // Default regex tester: a plain synchronous RegExp#test. Callers running
  // untrusted patterns against untrusted text on shared infrastructure (the
  // Node API, not the browser — see api/review.js) should pass a guarded
  // implementation instead, since a pattern like (a+)+$ can hang this line
  // indefinitely via catastrophic backtracking. The browser client omits
  // this argument and gets the fast synchronous default, unchanged.
  function defaultRegexTest(pattern, flags, text) {
    try { return new RegExp(pattern, flags).test(text); } catch (e) { return false; }
  }

  function testRule(text, rule, regexTest) {
    regexTest = regexTest || defaultRegexTest;
    var hit;
    if (rule.matchType === 'regex') {
      hit = regexTest(rule.pattern, 'i', text);
    } else {
      hit = text.toLowerCase().indexOf(String(rule.pattern).toLowerCase()) !== -1;
    }
    return rule.matchWhen === 'absent' ? !hit : hit;
  }

  function testAbsentAgainstFullText(fullText, rule, regexTest) {
    regexTest = regexTest || defaultRegexTest;
    if (rule.matchType === 'regex') {
      return regexTest(rule.pattern, 'i', fullText);
    }
    return fullText.toLowerCase().indexOf(String(rule.pattern).toLowerCase()) !== -1;
  }

  function runRules(paragraphs, rules, regexTest) {
    var findings = [];
    var fullText = paragraphs.map(function (p) { return p.text; }).join('\n');
    rules.filter(function (r) { return r.enabled; }).forEach(function (rule) {
      if (rule.matchWhen === 'absent') {
        var present = testAbsentAgainstFullText(fullText, rule, regexTest);
        if (!present) findings.push({ rule: rule, paragraphIndex: null, snippet: null });
      } else {
        paragraphs.forEach(function (p) {
          if (testRule(p.text, rule, regexTest)) {
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

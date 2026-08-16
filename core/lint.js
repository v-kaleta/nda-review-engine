// core/lint.js
// A second automated pass over the redline itself (not just what the rules
// matched) that flags signs of an over-broad edit. Shared, unchanged logic
// between the browser client and the Node API.
(function (root, factory) {
  var rulesEngine = (typeof module === 'object' && module.exports)
    ? require('./rules-engine')
    : root.NDA.RulesEngine;
  var mod = factory(rulesEngine);
  if (typeof module === 'object' && module.exports) {
    module.exports = mod;
  } else {
    root.NDA = root.NDA || {};
    root.NDA.Lint = mod;
  }
})(typeof self !== 'undefined' ? self : this, function (rulesEngine) {
  var testRule = rulesEngine.testRule;

  function median(nums) {
    var s = nums.slice().sort(function (a, b) { return a - b; });
    var n = s.length;
    if (!n) return 0;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  }

  function wordCount(s) {
    return (s.trim().match(/\S+/g) || []).length;
  }

  function runLint(paragraphs, rules, findings, regexTest) {
    var warnings = [];
    var lengths = paragraphs.map(function (p) { return wordCount(p.text); }).filter(function (n) { return n > 0; });
    var medianLen = median(lengths) || 1;
    var editRules = rules.filter(function (r) { return r.enabled && (r.action === 'strike' || r.action === 'suggest'); });

    editRules.forEach(function (rule) {
      if (rule.matchWhen === 'absent') return;
      var matchCount = paragraphs.filter(function (p) { return testRule(p.text, rule, regexTest); }).length;
      var frac = matchCount / paragraphs.length;
      if (frac > 0.25 && matchCount > 1) {
        warnings.push({
          type: 'broad-pattern', rule: rule,
          message: 'Pattern "' + rule.pattern + '" (rule "' + rule.label + '") matched ' + matchCount + ' of ' + paragraphs.length +
            ' clauses (' + Math.round(frac * 100) + '%) with a destructive action (' + rule.action + '). Likely over-broad \u2014 consider narrowing the pattern or switching the action to "flag only".'
        });
      }
    });

    editRules.forEach(function (rule) {
      if (rule.matchType === 'keyword' && rule.pattern && rule.pattern.trim().length < 4) {
        warnings.push({
          type: 'short-pattern', rule: rule,
          message: 'Pattern "' + rule.pattern + '" (rule "' + rule.label + '") is very short for a destructive action (' + rule.action + '). Short patterns tend to match unintended text.'
        });
      }
    });

    findings.forEach(function (f) {
      if (f.paragraphIndex === null || (f.rule.action !== 'strike' && f.rule.action !== 'suggest')) return;
      var p = paragraphs[f.paragraphIndex];
      var wc = wordCount(p.text);
      if (wc > medianLen * 2.5 && wc > 20) {
        warnings.push({
          type: 'long-clause', rule: f.rule, paragraphIndex: f.paragraphIndex,
          message: 'Rule "' + f.rule.label + '" strikes clause ' + f.paragraphIndex + ' (' + wc + ' words, vs. a ' + Math.round(medianLen) + '-word median across the document). Verify the whole clause should be affected, not just the matched phrase.'
        });
      }
    });

    findings.forEach(function (f) {
      if (f.paragraphIndex === null || f.rule.action !== 'suggest' || !f.rule.suggestedText) return;
      var p = paragraphs[f.paragraphIndex];
      var origWc = wordCount(p.text) || 1;
      var sugWc = wordCount(f.rule.suggestedText);
      var ratio = sugWc / origWc;
      if (ratio < 0.3 || ratio > 3.0) {
        warnings.push({
          type: 'length-mismatch', rule: f.rule, paragraphIndex: f.paragraphIndex,
          message: 'Suggested replacement for clause ' + f.paragraphIndex + ' is ' + sugWc + ' words vs. the original\u2019s ' + origWc + ' (' + ratio.toFixed(1) + 'x). Large length mismatches can signal a scope mismatch \u2014 review before accepting.'
        });
      }
    });

    return warnings;
  }

  return { median: median, wordCount: wordCount, runLint: runLint };
});

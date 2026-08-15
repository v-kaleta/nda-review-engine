// core/rules-io.js
// Parses a firm's rule set from an uploaded CSV or JSON file, validating and
// defaulting each field. Browser-only, but lives in core/ so the parsing
// and validation logic is unit-testable in isolation from the DOM.
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = mod;
  } else {
    root.NDA = root.NDA || {};
    root.NDA.RulesIO = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  var VALID_MATCH_TYPE = ['keyword', 'regex'];
  var VALID_MATCH_WHEN = ['present', 'absent'];
  var VALID_SEVERITY = ['critical', 'warning', 'note'];
  var VALID_ACTION = ['flag', 'strike', 'suggest'];

  function parseCSV(text) {
    var rows = []; var row = []; var field = ''; var inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; } }
        else field += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n' || c === '\r') {
          if (c === '\r' && text[i + 1] === '\n') i++;
          row.push(field); field = ''; rows.push(row); row = [];
        } else field += c;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return !(r.length === 1 && r[0].trim() === ''); });
  }

  function rulesFromCSVRows(rows) {
    if (!rows.length) return { rules: [], skipped: 0 };
    var header = rows[0].map(function (h) { return h.trim().toLowerCase(); });
    var idx = {}; header.forEach(function (h, i) { idx[h] = i; });
    var rules = []; var skipped = 0;
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r];
      var label = (row[idx['label']] || '').trim();
      var pattern = (row[idx['pattern']] || '').trim();
      if (!label || !pattern) { skipped++; continue; }
      var matchType = (row[idx['matchtype']] || 'keyword').trim().toLowerCase();
      if (VALID_MATCH_TYPE.indexOf(matchType) === -1) matchType = 'keyword';
      var matchWhen = (row[idx['matchwhen']] || 'present').trim().toLowerCase();
      if (VALID_MATCH_WHEN.indexOf(matchWhen) === -1) matchWhen = 'present';
      var severity = (row[idx['severity']] || 'warning').trim().toLowerCase();
      if (VALID_SEVERITY.indexOf(severity) === -1) severity = 'warning';
      var action = (row[idx['action']] || 'flag').trim().toLowerCase();
      if (VALID_ACTION.indexOf(action) === -1) action = 'flag';
      var suggestedText = (row[idx['suggestedtext']] || '').trim();
      var guidance = (row[idx['guidance']] || '').trim();
      var enabledRaw = (row[idx['enabled']] || 'true').trim().toLowerCase();
      var enabled = enabledRaw !== 'false' && enabledRaw !== '0' && enabledRaw !== 'no';
      rules.push({
        id: 'imp' + Date.now() + '_' + r, label: label, matchType: matchType, pattern: pattern, matchWhen: matchWhen,
        severity: severity, action: action, suggestedText: suggestedText, guidance: guidance, enabled: enabled
      });
    }
    return { rules: rules, skipped: skipped };
  }

  function rulesFromJSON(text) {
    var data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error('Expected a JSON array of rules.');
    var rules = []; var skipped = 0;
    data.forEach(function (item, i) {
      var label = (item.label || '').toString().trim();
      var pattern = (item.pattern || '').toString().trim();
      if (!label || !pattern) { skipped++; return; }
      var matchType = VALID_MATCH_TYPE.indexOf(item.matchType) !== -1 ? item.matchType : 'keyword';
      var matchWhen = VALID_MATCH_WHEN.indexOf(item.matchWhen) !== -1 ? item.matchWhen : 'present';
      var severity = VALID_SEVERITY.indexOf(item.severity) !== -1 ? item.severity : 'warning';
      var action = VALID_ACTION.indexOf(item.action) !== -1 ? item.action : 'flag';
      rules.push({
        id: item.id || ('imp' + Date.now() + '_' + i), label: label, matchType: matchType, pattern: pattern,
        matchWhen: matchWhen, severity: severity, action: action,
        suggestedText: (item.suggestedText || '').toString(), guidance: (item.guidance || '').toString(),
        enabled: item.enabled !== false
      });
    });
    return { rules: rules, skipped: skipped };
  }

  return {
    VALID_MATCH_TYPE: VALID_MATCH_TYPE,
    VALID_MATCH_WHEN: VALID_MATCH_WHEN,
    VALID_SEVERITY: VALID_SEVERITY,
    VALID_ACTION: VALID_ACTION,
    parseCSV: parseCSV,
    rulesFromCSVRows: rulesFromCSVRows,
    rulesFromJSON: rulesFromJSON
  };
});

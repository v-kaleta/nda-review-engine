// js/app.js
// All DOM/UI wiring for the browser client: rendering, event listeners,
// localStorage-backed state (rules + contracts list), file upload, the
// signature pad, and document generation. The actual review/redline/lint
// engine lives in core/ and is shared with the Node API — see README.
(function () {
  var DocxParser = NDA.DocxParser;
  var RulesEngine = NDA.RulesEngine;
  var RedlineBuilder = NDA.RedlineBuilder;
  var Lint = NDA.Lint;
  var RulesIO = NDA.RulesIO;
  var TextUtils = NDA.TextUtils;
  var SignatureLine = NDA.SignatureLine;
  var SignatureFields = NDA.SignatureFields;
  var DEFAULT_RULES = NDA.DefaultRules;

  var escapeHtml = TextUtils.escapeHtml;
  var fmtDate = TextUtils.fmtDate;

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  // ---------- rule set store ----------
  var RULES_KEY = 'nda-bot-rules-v1';
  function loadRules() {
    try {
      var saved = localStorage.getItem(RULES_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return JSON.parse(JSON.stringify(DEFAULT_RULES));
  }
  function saveRules() {
    try { localStorage.setItem(RULES_KEY, JSON.stringify(RULES)); } catch (e) {}
  }
  var RULES = loadRules();

  // ---------- contracts dashboard store ----------
  var CONTRACTS_KEY = 'nda-bot-contracts-v1';
  function loadContracts() {
    try {
      var saved = localStorage.getItem(CONTRACTS_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  }
  function saveContracts() { try { localStorage.setItem(CONTRACTS_KEY, JSON.stringify(CONTRACTS)); } catch (e) {} }
  var CONTRACTS = loadContracts();
  var currentContractId = null;

  var STATUS_META = {
    review: { label: 'Review', icon: '\u25c9' },
    sign: { label: 'Sign', icon: '\u270d' },
    completed: { label: 'Completed', icon: '\u2713' }
  };

  function renderContractsList() {
    var el = document.getElementById('contractsList');
    if (!CONTRACTS.length) {
      el.innerHTML = '<div class="dash-empty">No contracts yet. Upload an NDA in the Review Console to get started.</div>';
      return;
    }
    var sorted = CONTRACTS.slice().sort(function (a, b) { return b.updatedAt - a.updatedAt; });
    el.innerHTML = sorted.map(function (c) {
      var meta = STATUS_META[c.status] || STATUS_META.review;
      return '<div class="contract-row" data-id="' + c.id + '">' +
        '<div><div class="contract-name">' + escapeHtml(c.filename) + '</div><div class="contract-date">Updated ' + fmtDate(c.updatedAt) + '</div></div>' +
        '<span class="status-pill ' + c.status + '">' + meta.icon + ' ' + meta.label + '</span>' +
        '<button class="contract-del" data-id="' + c.id + '" title="Remove from list">\u00d7</button>' +
        '</div>';
    }).join('');
  }

  document.getElementById('contractsList').addEventListener('click', function (e) {
    if (e.target.classList.contains('contract-del')) {
      var id = e.target.getAttribute('data-id');
      CONTRACTS = CONTRACTS.filter(function (c) { return c.id !== id; });
      saveContracts();
      renderContractsList();
      renderInsightsDonut();
    }
  });

  function upsertContract(patch) {
    if (!currentContractId) return;
    var existing = CONTRACTS.filter(function (c) { return c.id === currentContractId; })[0];
    if (existing) {
      Object.assign(existing, patch, { updatedAt: Date.now() });
    } else {
      CONTRACTS.push(Object.assign({ id: currentContractId, updatedAt: Date.now() }, patch));
    }
    saveContracts();
    renderContractsList();
    renderInsightsDonut();
  }

  function renderInsightsDonut() {
    var totals = { critical: 0, warning: 0, note: 0 };
    CONTRACTS.forEach(function (c) {
      if (!c.counts) return;
      totals.critical += c.counts.critical || 0;
      totals.warning += c.counts.warning || 0;
      totals.note += c.counts.note || 0;
    });
    var total = totals.critical + totals.warning + totals.note;
    var wrap = document.getElementById('insightsDonutWrap');
    if (!total) {
      wrap.innerHTML = '<div class="dash-empty">Run a review on at least one contract to see findings here.</div>';
      return;
    }
    var segs = [
      { key: 'critical', color: getComputedStyle(document.documentElement).getPropertyValue('--red').trim(), v: totals.critical, label: 'Critical' },
      { key: 'warning', color: getComputedStyle(document.documentElement).getPropertyValue('--amber').trim(), v: totals.warning, label: 'Warning' },
      { key: 'note', color: getComputedStyle(document.documentElement).getPropertyValue('--navy').trim(), v: totals.note, label: 'Note' }
    ];
    var acc = 0;
    var stops = segs.map(function (s) {
      var start = acc / total * 360;
      acc += s.v;
      var end = acc / total * 360;
      return s.color + ' ' + start.toFixed(1) + 'deg ' + end.toFixed(1) + 'deg';
    }).join(', ');
    wrap.innerHTML =
      '<div class="donut" style="background: conic-gradient(' + stops + ');">' +
      '<div class="donut-center"><span class="n">' + total + '</span><span class="l">Findings</span></div>' +
      '</div>' +
      '<div class="donut-legend">' + segs.map(function (s) {
        return '<div class="donut-legend-row"><span class="donut-dot" style="background:' + s.color + '"></span>' + s.label + '<span class="lv">' + s.v + '</span></div>';
      }).join('') + '</div>';
  }

  renderContractsList();
  renderInsightsDonut();

  // ---------- tab switching ----------
  var reviewTabBtn = document.getElementById('reviewTabBtn');
  var contractsTabBtn = document.getElementById('contractsTabBtn');
  var apiTabBtn = document.getElementById('apiTabBtn');
  var reviewTabContent = document.getElementById('reviewTabContent');
  var contractsTabContent = document.getElementById('contractsTabContent');
  var apiTabContent = document.getElementById('apiTabContent');
  function showTab(name) {
    reviewTabBtn.classList.toggle('active', name === 'review');
    contractsTabBtn.classList.toggle('active', name === 'contracts');
    apiTabBtn.classList.toggle('active', name === 'api');
    reviewTabContent.classList.toggle('active', name === 'review');
    contractsTabContent.classList.toggle('active', name === 'contracts');
    apiTabContent.classList.toggle('active', name === 'api');
  }
  reviewTabBtn.addEventListener('click', function () { showTab('review'); });
  contractsTabBtn.addEventListener('click', function () { showTab('contracts'); renderContractsList(); renderInsightsDonut(); });
  apiTabBtn.addEventListener('click', function () { showTab('api'); });

  document.getElementById('newContractBtn').addEventListener('click', function () {
    showTab('review');
    document.getElementById('fbClear').click();
  });

  // ---------- developer api ----------
  document.getElementById('curlExample').textContent =
    'curl -X POST https://your-deployment.vercel.app/api/review \\\n' +
    '  -H "Authorization: Bearer ndarev_yourkeyhere" \\\n' +
    '  -H "Content-Type: application/json" \\\n' +
    '  -d \'{\n' +
    '    "docxBase64": "<base64-encoded .docx file>",\n' +
    '    "rules": [\n' +
    '      { "label": "Perpetual term", "matchType": "regex",\n' +
    '        "pattern": "perpetual|indefinitely", "matchWhen": "present",\n' +
    '        "severity": "critical", "action": "flag", "enabled": true }\n' +
    '    ]\n' +
    '  }\'\n\n' +
    '# Response:\n' +
    '# {\n' +
    '#   "findings": [ { "rule", "severity", "action", "paragraphIndex", "snippet" } ],\n' +
    '#   "lintWarnings": [ { "type", "message" } ],\n' +
    '#   "redlinedDocxBase64": "<base64-encoded .docx with real tracked changes>"\n' +
    '# }';

  document.getElementById('genKeyBtn').addEventListener('click', async function () {
    var btn = this;
    var status = document.getElementById('apiKeyStatus');
    btn.disabled = true;
    status.textContent = 'Generating\u2026';
    try {
      var resp = await fetch('/api/generate-key', { method: 'POST' });
      var data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Request failed');
      document.getElementById('keyValue').textContent = data.key;
      document.getElementById('keyDisplay').classList.add('show');
      status.textContent = '';
    } catch (err) {
      status.textContent = 'Could not generate a key: ' + err.message + ' \u2014 this endpoint only works once deployed with API_SIGNING_SECRET configured.';
    }
    btn.disabled = false;
  });

  document.getElementById('keyCopyBtn').addEventListener('click', function () {
    var val = document.getElementById('keyValue').textContent;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(val).then(function () {
        var btn = document.getElementById('keyCopyBtn');
        var orig = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(function () { btn.textContent = orig; }, 1500);
      });
    }
  });

  var uploadedFile = null;
  var parsedXmlDoc = null;
  var parsedZip = null;
  var parsedParagraphs = null;
  var currentFindings = null;

  // ---------- rule editor UI ----------
  var rulesListEl = document.getElementById('rulesList');
  var expandedRules = {};
  var SEV_LABEL = { critical: 'Critical', warning: 'Warning', note: 'Note' };
  var ACT_LABEL2 = { flag: 'Flag', strike: 'Strike', suggest: 'Suggest' };

  function renderRules() {
    rulesListEl.innerHTML = RULES.map(function (rule, i) {
      var isOpen = !!expandedRules[rule.id];
      return '' +
        '<div class="rule-card" data-idx="' + i + '">' +
        '<div class="rule-top">' +
        '<input type="checkbox" class="rule-enabled" ' + (rule.enabled ? 'checked' : '') + ' />' +
        '<span class="rule-summary-label">' + escapeHtml(rule.label) + '</span>' +
        '<span class="rule-summary-badge sev-' + rule.severity + '">' + SEV_LABEL[rule.severity] + '</span>' +
        '<span class="rule-summary-badge act-' + rule.action + '">' + ACT_LABEL2[rule.action] + '</span>' +
        '<button class="rule-expand-btn" title="Edit rule">' + (isOpen ? '\u2212' : 'Edit') + '</button>' +
        '<button class="rule-del-btn">Delete</button>' +
        '</div>' +
        '<div class="rule-body" style="display:' + (isOpen ? 'block' : 'none') + ';">' +
        '<div class="rule-field" style="margin-bottom:10px;"><label>What do you call this rule?</label><input type="text" class="rule-label-input" value="' + escapeHtml(rule.label) + '" /></div>' +
        '<div class="rule-grid">' +
        '<div class="rule-field"><label>How to search</label><select class="rule-matchType">' +
        '<option value="keyword" ' + (rule.matchType === 'keyword' ? 'selected' : '') + '>Simple text match</option>' +
        '<option value="regex" ' + (rule.matchType === 'regex' ? 'selected' : '') + '>Advanced pattern (regex)</option>' +
        '</select></div>' +
        '<div class="rule-field"><label>Word or phrase to look for</label><input type="text" class="rule-pattern" placeholder="e.g. indemnify" value="' + escapeHtml(rule.pattern) + '" /></div>' +
        '<div class="rule-field"><label>Trigger this rule when that text is\u2026</label><select class="rule-matchWhen">' +
        '<option value="present" ' + (rule.matchWhen === 'present' ? 'selected' : '') + '>Found in the document</option>' +
        '<option value="absent" ' + (rule.matchWhen === 'absent' ? 'selected' : '') + '>Missing from the document</option>' +
        '</select></div>' +
        '<div class="rule-field"><label>How serious is this?</label><select class="rule-severity">' +
        '<option value="critical" ' + (rule.severity === 'critical' ? 'selected' : '') + '>Critical \u2014 needs attention</option>' +
        '<option value="warning" ' + (rule.severity === 'warning' ? 'selected' : '') + '>Warning \u2014 worth reviewing</option>' +
        '<option value="note" ' + (rule.severity === 'note' ? 'selected' : '') + '>Just a note</option>' +
        '</select></div>' +
        '</div>' +
        '<div class="rule-grid" style="grid-template-columns:1fr;">' +
        '<div class="rule-field"><label>What should happen when this is found?</label><select class="rule-action">' +
        '<option value="flag" ' + (rule.action === 'flag' ? 'selected' : '') + '>Just highlight it \u2014 don\u2019t change the document</option>' +
        '<option value="strike" ' + (rule.action === 'strike' ? 'selected' : '') + '>Delete this clause</option>' +
        '<option value="suggest" ' + (rule.action === 'suggest' ? 'selected' : '') + '>Delete it and replace with my own wording</option>' +
        '</select></div>' +
        '</div>' +
        '<div class="rule-suggest" style="display:' + (rule.action === 'suggest' ? 'block' : 'none') + ';">' +
        '<label>Replacement wording to insert instead</label>' +
        '<textarea class="rule-suggestedText">' + escapeHtml(rule.suggestedText || '') + '</textarea>' +
        '</div>' +
        '<div class="rule-guidance">' +
        '<label>Note to show whoever reviews this finding (optional)</label>' +
        '<textarea class="rule-guidanceText">' + escapeHtml(rule.guidance || '') + '</textarea>' +
        '</div>' +
        '</div>' +
        '</div>';
    }).join('');
  }
  renderRules();

  rulesListEl.addEventListener('click', function (e) {
    if (e.target.classList.contains('rule-expand-btn')) {
      var card = e.target.closest('.rule-card');
      var idx = parseInt(card.getAttribute('data-idx'), 10);
      var id = RULES[idx].id;
      expandedRules[id] = !expandedRules[id];
      renderRules();
    }
  });

  rulesListEl.addEventListener('input', function (e) {
    var card = e.target.closest('.rule-card');
    if (!card) return;
    var idx = parseInt(card.getAttribute('data-idx'), 10);
    var rule = RULES[idx];
    if (e.target.classList.contains('rule-label-input')) rule.label = e.target.value;
    if (e.target.classList.contains('rule-pattern')) rule.pattern = e.target.value;
    if (e.target.classList.contains('rule-suggestedText')) rule.suggestedText = e.target.value;
    if (e.target.classList.contains('rule-guidanceText')) rule.guidance = e.target.value;
    saveRules();
  });
  rulesListEl.addEventListener('change', function (e) {
    var card = e.target.closest('.rule-card');
    if (!card) return;
    var idx = parseInt(card.getAttribute('data-idx'), 10);
    var rule = RULES[idx];
    if (e.target.classList.contains('rule-enabled')) rule.enabled = e.target.checked;
    if (e.target.classList.contains('rule-matchType')) rule.matchType = e.target.value;
    if (e.target.classList.contains('rule-matchWhen')) rule.matchWhen = e.target.value;
    if (e.target.classList.contains('rule-severity')) rule.severity = e.target.value;
    if (e.target.classList.contains('rule-action')) {
      rule.action = e.target.value;
      renderRules();
    }
    saveRules();
  });
  rulesListEl.addEventListener('click', function (e) {
    if (e.target.classList.contains('rule-del-btn')) {
      var card = e.target.closest('.rule-card');
      var idx = parseInt(card.getAttribute('data-idx'), 10);
      RULES.splice(idx, 1);
      saveRules();
      renderRules();
    }
  });
  document.getElementById('addRuleBtn').addEventListener('click', function () {
    var newId = 'r' + Date.now();
    RULES.push({ id: newId, label: 'New rule', matchType: 'keyword', pattern: '', matchWhen: 'present', severity: 'note', action: 'flag', suggestedText: '', guidance: '', enabled: true });
    expandedRules[newId] = true;
    saveRules();
    renderRules();
  });
  document.getElementById('resetRulesBtn').addEventListener('click', function () {
    RULES = JSON.parse(JSON.stringify(DEFAULT_RULES));
    saveRules();
    renderRules();
  });

  // ---------- import / export requirements ----------
  var importStatus = document.getElementById('importStatus');
  var rulesFileInput = document.getElementById('rulesFileInput');

  document.getElementById('uploadRulesBtn').addEventListener('click', function () { rulesFileInput.click(); });

  rulesFileInput.addEventListener('change', async function () {
    if (!rulesFileInput.files.length) return;
    var file = rulesFileInput.files[0];
    var text = await file.text();
    var result;
    try {
      if (/\.json$/i.test(file.name)) result = RulesIO.rulesFromJSON(text);
      else result = RulesIO.rulesFromCSVRows(RulesIO.parseCSV(text));
    } catch (err) {
      importStatus.textContent = 'Could not read this file: ' + err.message;
      importStatus.className = 'import-status err';
      rulesFileInput.value = '';
      return;
    }
    if (!result.rules.length) {
      importStatus.textContent = 'No valid rules found in this file (each row needs at least a label and a pattern).';
      importStatus.className = 'import-status err';
      rulesFileInput.value = '';
      return;
    }
    var replace = window.confirm(
      'Found ' + result.rules.length + ' rule(s)' + (result.skipped ? (', skipped ' + result.skipped + ' incomplete row(s)') : '') +
      '.\n\nOK = replace all existing rules with these.\nCancel = add these to your existing rules instead.'
    );
    RULES = replace ? result.rules : RULES.concat(result.rules);
    saveRules();
    renderRules();
    importStatus.textContent = 'Imported ' + result.rules.length + ' rule(s)' + (result.skipped ? (', skipped ' + result.skipped + ' incomplete row(s)') : '') + '.';
    importStatus.className = 'import-status ok';
    rulesFileInput.value = '';
  });

  document.getElementById('exportRulesBtn').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(RULES, null, 2)], { type: 'application/json' });
    downloadBlob(blob, 'nda-review-rules.json');
  });

  document.getElementById('downloadTemplateBtn').addEventListener('click', function () {
    var headers = ['label', 'pattern', 'matchType', 'matchWhen', 'severity', 'action', 'suggestedText', 'guidance', 'enabled'];
    var sampleRows = [
      ['Arbitration clause required', 'arbitration', 'keyword', 'absent', 'warning', 'flag', '', 'Confirm the agreement requires arbitration rather than litigation.', 'true'],
      ['Liability cap missing', 'liability cap', 'keyword', 'absent', 'critical', 'flag', '', 'No cap on liability found \u2014 confirm this is intentional.', 'true'],
      ['Governing law jurisdiction', 'governed by the laws', 'keyword', 'present', 'note', 'suggest', 'This Agreement shall be governed by the laws of the State of [YOUR STATE].', 'Replace with firm-preferred jurisdiction.', 'true']
    ];
    function csvField(v) {
      v = String(v);
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }
    var lines = [headers.join(',')].concat(sampleRows.map(function (r) { return r.map(csvField).join(','); }));
    var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    downloadBlob(blob, 'nda-rules-template.csv');
  });

  // ---------- upload ----------
  var dropzone = document.getElementById('dropzone');
  var fileInput = document.getElementById('fileInput');
  var fileBadge = document.getElementById('fileBadge');
  var runReviewBtn = document.getElementById('runReviewBtn');
  var reviewStatus = document.getElementById('reviewStatus');

  dropzone.addEventListener('click', function () { fileInput.click(); });
  dropzone.addEventListener('dragover', function (e) { e.preventDefault(); dropzone.classList.add('drag'); });
  dropzone.addEventListener('dragleave', function () { dropzone.classList.remove('drag'); });
  dropzone.addEventListener('drop', function (e) {
    e.preventDefault(); dropzone.classList.remove('drag');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', function () {
    if (fileInput.files.length) handleFile(fileInput.files[0]);
  });
  document.getElementById('fbClear').addEventListener('click', function (e) {
    e.stopPropagation();
    uploadedFile = null; parsedXmlDoc = null; parsedZip = null; parsedParagraphs = null;
    currentContractId = null;
    fileBadge.style.display = 'none';
    dropzone.style.display = 'block';
    runReviewBtn.disabled = true;
    reviewStatus.textContent = '';
    document.getElementById('findingsSection').style.display = 'none';
    document.getElementById('generateBtn').disabled = true;
  });

  async function handleFile(file) {
    if (!/\.docx$/i.test(file.name)) {
      reviewStatus.textContent = 'Please upload a .docx file.';
      return;
    }
    uploadedFile = file;
    reviewStatus.textContent = 'Parsing document\u2026';
    try {
      var buf = await file.arrayBuffer();
      parsedZip = await JSZip.loadAsync(buf);
      var xmlStr = await parsedZip.file('word/document.xml').async('string');
      var parser = new DOMParser();
      parsedXmlDoc = parser.parseFromString(xmlStr, 'application/xml');
      parsedParagraphs = DocxParser.extractParagraphs(parsedXmlDoc);

      document.getElementById('fbName').textContent = file.name;
      document.getElementById('fbMeta').textContent = parsedParagraphs.length + ' paragraphs \u00b7 ' + Math.round(file.size / 1024) + ' KB';
      fileBadge.style.display = 'flex';
      dropzone.style.display = 'none';
      runReviewBtn.disabled = false;
      reviewStatus.textContent = '';
      document.getElementById('findingsSection').style.display = 'none';
      document.getElementById('generateBtn').disabled = true;
      currentFindings = null;

      currentContractId = 'c' + Date.now();
      upsertContract({ filename: file.name, status: 'review', counts: null });
    } catch (err) {
      reviewStatus.textContent = 'Could not parse this file: ' + err.message;
    }
  }

  // ---------- run review ----------
  var SEVERITY_LABEL = { critical: 'Critical', warning: 'Warning', note: 'Note' };
  var ACTION_LABEL = { flag: 'Flagged', strike: 'Struck', suggest: 'Suggested edit' };

  runReviewBtn.addEventListener('click', function () {
    if (!parsedParagraphs) return;
    currentFindings = RulesEngine.runRules(parsedParagraphs, RULES);
    renderFindings(currentFindings);
    renderLint(Lint.runLint(parsedParagraphs, RULES, currentFindings));
    document.getElementById('generateBtn').disabled = false;
    reviewStatus.textContent = '';

    var counts = { critical: 0, warning: 0, note: 0 };
    currentFindings.forEach(function (f) { counts[f.rule.severity]++; });
    upsertContract({ status: 'sign', counts: counts });
  });

  function renderLint(warnings) {
    var el = document.getElementById('lintList');
    if (!warnings.length) {
      el.innerHTML = '<div class="lint-clean">No over-broad edits detected in the current rule set.</div>';
      return;
    }
    el.innerHTML = '<div class="lint-list">' + warnings.map(function (w) {
      return '<div class="lint-row"><b>' + w.type.replace('-', ' ') + ':</b> ' + escapeHtml(w.message) + '</div>';
    }).join('') + '</div>';
  }

  function renderFindings(findings) {
    var section = document.getElementById('findingsSection');
    section.style.display = 'block';
    var counts = { critical: 0, warning: 0, note: 0 };
    findings.forEach(function (f) { counts[f.rule.severity]++; });
    document.getElementById('findingsSummary').innerHTML =
      '<div class="fs-stat critical"><div class="n">' + counts.critical + '</div><div class="l">Critical</div></div>' +
      '<div class="fs-stat warning"><div class="n">' + counts.warning + '</div><div class="l">Warning</div></div>' +
      '<div class="fs-stat note"><div class="n">' + counts.note + '</div><div class="l">Note</div></div>';

    if (!findings.length) {
      document.getElementById('findingsList').innerHTML = '<div class="status-note ok" style="margin-left:0;">No findings \u2014 document passed every enabled rule.</div>';
      return;
    }
    document.getElementById('findingsList').innerHTML = findings.map(function (f) {
      return '<div class="finding-row ' + f.rule.severity + '">' +
        '<div class="finding-top">' +
        '<span class="finding-label">' + escapeHtml(f.rule.label) + '</span>' +
        '<span class="finding-badge">' + SEVERITY_LABEL[f.rule.severity] + '</span>' +
        '<span class="finding-badge">' + ACTION_LABEL[f.rule.action] + '</span>' +
        '</div>' +
        (f.snippet ? '<div class="finding-snippet">\u201c' + escapeHtml(f.snippet) + '\u2026\u201d</div>' : '<div class="finding-snippet">Not found anywhere in the document.</div>') +
        (f.rule.guidance ? '<div class="finding-guidance">' + escapeHtml(f.rule.guidance) + '</div>' : '') +
        '</div>';
    }).join('');
  }

  // ---------- signature pad ----------
  var sigCanvas = document.getElementById('sigPad');
  var sigCtx = sigCanvas.getContext('2d');
  function resizeSigCanvas() {
    var rect = sigCanvas.getBoundingClientRect();
    sigCanvas.width = rect.width * 2;
    sigCanvas.height = rect.height * 2;
    sigCtx.scale(2, 2);
    sigCtx.strokeStyle = '#111';
    sigCtx.lineWidth = 2;
    sigCtx.lineCap = 'round';
  }
  window.addEventListener('load', resizeSigCanvas);
  window.addEventListener('resize', resizeSigCanvas);
  var drawing = false, lastX, lastY, sigHasContent = false;
  function pos(e) {
    var rect = sigCanvas.getBoundingClientRect();
    var cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    var cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    return { x: cx, y: cy };
  }
  function startDraw(e) { e.preventDefault(); drawing = true; var p = pos(e); lastX = p.x; lastY = p.y; }
  function moveDraw(e) {
    if (!drawing) return;
    e.preventDefault();
    var p = pos(e);
    sigCtx.beginPath(); sigCtx.moveTo(lastX, lastY); sigCtx.lineTo(p.x, p.y); sigCtx.stroke();
    lastX = p.x; lastY = p.y; sigHasContent = true;
  }
  function endDraw() { drawing = false; }
  sigCanvas.addEventListener('mousedown', startDraw);
  sigCanvas.addEventListener('mousemove', moveDraw);
  window.addEventListener('mouseup', endDraw);
  sigCanvas.addEventListener('touchstart', startDraw);
  sigCanvas.addEventListener('touchmove', moveDraw);
  sigCanvas.addEventListener('touchend', endDraw);
  document.getElementById('sigClearBtn').addEventListener('click', function () {
    sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
    sigHasContent = false;
  });

  // ---------- signature image upload (alternative to drawing) ----------
  var uploadedSigDataUrl = null;
  var sigUploadBtn = document.getElementById('sigUploadBtn');
  var sigFileInput = document.getElementById('sigFileInput');
  var sigDrawWrap = document.getElementById('sigDrawWrap');
  var sigPreviewWrap = document.getElementById('sigPreviewWrap');
  var sigPreviewImg = document.getElementById('sigPreviewImg');

  sigUploadBtn.addEventListener('click', function () { sigFileInput.click(); });

  sigFileInput.addEventListener('change', function () {
    if (!sigFileInput.files.length) return;
    var file = sigFileInput.files[0];
    var reader = new FileReader();
    reader.onload = function () {
      uploadedSigDataUrl = reader.result;
      sigPreviewImg.src = uploadedSigDataUrl;
      sigPreviewWrap.style.display = 'block';
      sigDrawWrap.style.display = 'none';
      sigUploadBtn.style.display = 'none';
      document.querySelector('.sig-or').style.display = 'none';
      sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
      sigHasContent = false;
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('sigPreviewClearBtn').addEventListener('click', function () {
    uploadedSigDataUrl = null;
    sigFileInput.value = '';
    sigPreviewWrap.style.display = 'none';
    sigDrawWrap.style.display = 'block';
    sigUploadBtn.style.display = 'block';
    document.querySelector('.sig-or').style.display = 'flex';
  });

  var today = new Date();
  document.getElementById('assocDate').value = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // ---------- generate documents ----------
  document.getElementById('generateBtn').addEventListener('click', async function () {
    var genStatus = document.getElementById('generateStatus');
    if (!parsedParagraphs || !currentFindings) { genStatus.textContent = 'Run the review first.'; return; }
    var name = document.getElementById('assocName').value.trim() || 'Associate';
    var title = document.getElementById('assocTitle').value.trim();
    var dateVal = document.getElementById('assocDate').value.trim();
    genStatus.textContent = 'Generating documents\u2026';

    try {
      // ---- redlined docx ----
      RedlineBuilder.buildRedlinedXml(parsedXmlDoc, parsedParagraphs, currentFindings, 'NDA Review Bot');
      var serializer = new XMLSerializer();
      var newXmlStr = serializer.serializeToString(parsedXmlDoc);
      parsedZip.file('word/document.xml', newXmlStr);
      var docxBlob = await parsedZip.generateAsync({ type: 'blob' });
      downloadBlob(docxBlob, (uploadedFile.name.replace(/\.docx$/i, '')) + '_REDLINED.docx');

      // ---- final signed PDF ----
      var finalParas = RedlineBuilder.computeFinalText(parsedParagraphs, currentFindings);
      var { jsPDF } = window.jspdf;
      var doc = new jsPDF({ unit: 'pt', format: 'letter' });
      var marginL = 60, marginR = 60, pageW = 612, pageH = 792;
      var maxW = pageW - marginL - marginR;
      var y = 72;

      var hasSignature = !!(uploadedSigDataUrl || sigHasContent);
      var sigDataUrl = uploadedSigDataUrl || (sigHasContent ? sigCanvas.toDataURL('image/png') : null);
      var sigFmt = sigDataUrl && /^data:image\/jpeg/.test(sigDataUrl) ? 'JPEG' : 'PNG';
      var SIG_W = 160, SIG_H = 48, SIG_GAP = 4; // image sits SIG_GAP above the detected signature line
      var signaturePlaced = false;
      var fieldsFilledNearby = false;

      // If the document has its own "Name:"/"Title:"/"Date:" (or combined
      // "Name/Title/Date:") label line near the signature line, fill it in
      // directly rather than appending a separate floating caption below —
      // avoids leaving that label sitting there unfilled and duplicated.
      if (hasSignature) {
        var sigLineIndex = -1;
        for (var s = 1; s < finalParas.length; s++) {
          if (SignatureLine.isSignatureLine(finalParas[s])) { sigLineIndex = s; break; }
        }
        if (sigLineIndex !== -1) {
          var filled = SignatureFields.fillNearbyFields(finalParas, sigLineIndex, { name: name, title: title, dateVal: dateVal });
          finalParas = filled.paragraphs;
          fieldsFilledNearby = filled.anyFilled;
        }
      }

      doc.setFont('times', 'bold'); doc.setFontSize(15);
      var title0 = finalParas[0] || 'Non-Disclosure Agreement';
      doc.text(title0, marginL, y); y += 26;

      doc.setFont('times', 'normal'); doc.setFontSize(11);
      for (var i = 1; i < finalParas.length; i++) {
        var paraText = finalParas[i];
        var placingHere = false;

        if (hasSignature && !signaturePlaced && SignatureLine.isSignatureLine(paraText)) {
          if (y > pageH - (SIG_H + SIG_GAP + 90)) { doc.addPage(); y = 72; }
          y += SIG_H + SIG_GAP;
          doc.addImage(sigDataUrl, sigFmt, marginL, y - SIG_H - SIG_GAP, SIG_W, SIG_H);
          signaturePlaced = true;
          placingHere = true;
        }

        var lines = doc.splitTextToSize(paraText, maxW);
        for (var j = 0; j < lines.length; j++) {
          if (y > pageH - 90) { doc.addPage(); y = 72; }
          doc.text(lines[j], marginL, y);
          y += 15;
        }
        y += 8;

        if (placingHere && !fieldsFilledNearby) {
          doc.setFont('times', 'italic'); doc.setFontSize(9.5);
          doc.text(name + (title ? ' \u2014 ' + title : '') + ' \u2014 ' + dateVal, marginL, y);
          doc.setFont('times', 'normal'); doc.setFontSize(11);
          y += 16;
        }
      }

      if (hasSignature && !signaturePlaced) {
        // no existing signature line found in the document — fall back to an appended block
        if (y > pageH - 220) { doc.addPage(); y = 72; }
        y += 20;
        doc.setFont('times', 'italic'); doc.setFontSize(10.5);
        doc.text('Executed as of the date below.', marginL, y);
        y += 30;
        doc.addImage(sigDataUrl, sigFmt, marginL, y, SIG_W, 55);
        y += 65;
        doc.setFont('times', 'normal'); doc.setFontSize(10.5);
        doc.text('Associate: ' + name, marginL, y); y += 15;
        if (title) { doc.text('Title: ' + title, marginL, y); y += 15; }
        doc.text('Date: ' + dateVal, marginL, y);
      }

      var pdfBlob = doc.output('blob');
      downloadBlob(pdfBlob, (uploadedFile.name.replace(/\.docx$/i, '')) + '_EXECUTION_COPY.pdf');

      genStatus.textContent = 'Both documents downloaded.';
      genStatus.classList.add('ok');
      upsertContract({ status: 'completed' });
    } catch (err) {
      genStatus.textContent = 'Error generating documents: ' + err.message;
    }
  });
})();

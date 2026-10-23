// TikTok-Video-Cutter
const Video = (() => {
  const st = { file: null, info: null, words: [], silences: [], result: null, inserts: [], subStyle: 'apologea' };
  const player = () => $('#videoPlayer');

  function opts() {
    return { maxPause: +$('#maxPause').value };
  }
  function segments() {
    return CutLogic.buildSegments(st.words, { duration: st.info.duration, maxPause: opts().maxPause, silences: st.silences });
  }

  async function loadFile(file) {
    if (!/\.(mp4|mov|m4v|mkv|webm|avi)$/i.test(file)) { toast('Bitte eine Videodatei wählen (mp4, mov …).', true); return; }
    Object.assign(st, { file, info: null, words: [], silences: [], result: null });
    const p = player();
    p.src = await api.fileUrl(file);
    p.classList.remove('hidden');
    $('#videoDrop').classList.add('has-video');
    $('#videoTabs').classList.remove('hidden');
    setTab('orig');
    $('.tab[data-src=result]').disabled = true;
    $('#showResult').disabled = true;
    $('#renderVideo').disabled = true;
    $('#aiSlips').disabled = true;
    $('#addInsert').disabled = false;
    $('#transcriptPanel').classList.add('hidden');
    $('#videoStats').classList.add('hidden');
    try {
      st.info = await api.probeVideo(file);
      if (!App.settings.groqKey) {
        toast('Für das automatische Schneiden brauchst du den kostenlosen Groq-Schlüssel. Trag ihn unter „Einstellungen“ ein und wähl das Video danach nochmal.', true);
        return;
      }
      progress(0.02, 'Analyse startet …');
      const r = await api.analyzeVideo({ file, language: App.settings.language });
      st.info = r.info; st.words = r.words; st.silences = r.silences;
      if (!st.words.length) { progress(null); toast('Im Video wurde keine Sprache erkannt.', true); return; }
      if ($('#autoSlips').checked) CutLogic.autoMark(st.words);
      progress(null);
      renderTranscript();
      $('#renderVideo').disabled = false;
      $('#aiSlips').disabled = false;
    } catch (e) { progress(null); toast(errMsg(e), true); }
  }

  function progress(v, text) {
    const box = $('#videoProgress');
    if (v === null) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    $('i', box).style.width = `${Math.round(v * 100)}%`;
    $('span', box).textContent = text || '';
  }

  function renderTranscript() {
    const box = $('#transcript'); box.innerHTML = '';
    const maxPause = opts().maxPause;
    st.words.forEach((w, i) => {
      if (i > 0) {
        const gap = w.start - st.words[i - 1].end;
        if (gap > maxPause) box.append(el('span', { class: 'pause cut', text: `${gap.toFixed(1)}s` }), ' ');
      }
      box.append(el('span', {
        class: 'w' + (w.remove ? ' cut' : ''), 'data-i': i, text: w.word,
        onclick: () => { w.remove = !w.remove; w.reason = 'manual'; renderTranscript(); },
        ondblclick: () => { setTab('orig'); player().currentTime = w.start; player().play(); },
      }), ' ');
    });
    $('#transcriptPanel').classList.remove('hidden');
    renderStats();
  }

  function renderStats() {
    if (!st.info) return;
    const segs = segments();
    const total = segs.reduce((a, [s, e]) => a + e - s, 0);
    const removed = st.words.filter((w) => w.remove).length;
    const s = $('#videoStats'); s.innerHTML = '';
    s.append(
      el('div', {}, el('small', { text: 'Original' }), fmtTime(st.info.duration)),
      el('div', {}, el('small', { text: 'Neu' }), fmtTime(total)),
      el('div', {}, el('small', { text: 'Gespart' }), `${Math.max(0, Math.round(st.info.duration - total))} s`),
      el('div', {}, el('small', { text: 'Schnitte' }), String(Math.max(0, segs.length - 1))),
      el('div', {}, el('small', { text: 'Versprecher raus' }), String(removed)),
    );
    s.classList.remove('hidden');
  }

  async function aiSlips() {
    const btn = $('#aiSlips'); btn.disabled = true;
    progress(0.3, 'KI sucht Versprecher …');
    try {
      const batch = 500;
      let count = 0;
      for (let off = 0; off < st.words.length; off += batch) {
        const part = st.words.slice(off, off + batch).map((w, k) => `${off + k}:${w.word}`).join(' ');
        const txt = await api.chat({ json: true, temperature: 0.1, maxTokens: 1500, messages: [
          { role: 'system', content: 'Du schneidest gesprochene Videos. Du bekommst nummerierte Wörter eines Transkripts. Finde Versprecher, abgebrochene Sätze und Neuanfänge, doppelte Satzanfänge, Füllwörter (äh, ähm, also am Satzanfang ohne Bedeutung) und verworfene Formulierungen. Behalte jeweils die LETZTE, vollständige Fassung. Entferne nichts, was inhaltlich wichtig ist. Antworte nur mit JSON: {"remove":[Nummern]}' },
          { role: 'user', content: part }] });
        const r = parseJsonLoose(txt);
        for (const i of r.remove || []) { const w = st.words[+i]; if (w && !w.remove) { w.remove = true; w.reason = 'ai'; count++; } }
      }
      renderTranscript();
      toast(count ? `KI hat ${count} Wörter als Versprecher markiert (rot). Klick ein Wort an, um es zu behalten.` : 'Die KI hat keine weiteren Versprecher gefunden.');
    } catch (e) { toast(errMsg(e), true); }
    progress(null);
    btn.disabled = false;
  }

  async function render() {
    if (!st.info || !st.words.length) return;
    const segs = segments();
    if (!segs.length) { toast('Es bleibt nichts übrig – bitte weniger rausschneiden.', true); return; }
    const total = segs.reduce((a, [s, e]) => a + e - s, 0);
    const format = $('#vFormat').value;
    const overlays = [];
    const ovInputs = [];
    if ($('#watermark').checked) { overlays.push({ kind: 'watermark' }); ovInputs.push({ asset: 'logo-watermark.png', duration: total + 1 }); }
    for (const ins of st.inserts) {
      const start = Math.max(0, Math.min(total - 0.2, +ins.start || 0));
      const dur = Math.max(0.3, Math.min(total - start, +ins.duration || 2));
      overlays.push({ kind: 'insert', start, duration: dur, mode: ins.mode });
      ovInputs.push({ path: ins.path, duration: dur });
    }
    const subsOn = $('#subsOn').checked;
    const f = CutLogic.buildFilter(st.info, segs, {
      format, jumpZoom: $('#jumpZoom').checked, colorPop: $('#colorPop').checked, audioNorm: $('#audioNorm').checked,
      subtitles: subsOn || !!$('#hookText').value.trim(), overlays,
    });
    const ass = CutLogic.buildAss(subsOn ? st.words : [], segs, {
      width: f.width, height: f.height, style: st.subStyle, perChunk: +$('#subWords').value, upper: $('#subUpper').checked,
      pos: $('#subPos').value, sizePct: +$('#subSize').value, hook: $('#hookText').value,
    });
    const btn = $('#renderVideo'); btn.disabled = true;
    progress(0.01, 'Video wird geschnitten …');
    try {
      const name = st.file.split(/[\\/]/).pop().replace(/\.[^.]+$/, '') + ' – TikTok';
      st.result = await api.renderVideo({ file: st.file, info: st.info, segments: segs, ass, filter: f.filter, overlays: ovInputs, outName: name });
      progress(null);
      $('.tab[data-src=result]').disabled = false;
      $('#showResult').disabled = false;
      setTab('result');
      player().play();
      toast('Fertig! Das Video liegt im Ordner „Videos“.');
    } catch (e) { progress(null); toast(errMsg(e), true); }
    btn.disabled = false;
  }

  async function setTab(which) {
    $$('#videoTabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.src === which));
    const p = player();
    const target = which === 'result' && st.result ? await api.fileUrl(st.result) : st.file ? await api.fileUrl(st.file) : '';
    if (target && p.src !== target) p.src = target;
  }

  function renderInserts() {
    const box = $('#insertList'); box.innerHTML = '';
    st.inserts.forEach((ins, i) => {
      box.append(el('div', { class: 'insert' },
        el('img', { src: ins.thumb }),
        el('label', {}, 'ab Sek.', el('input', { type: 'text', value: ins.start, oninput: (e) => { ins.start = parseFloat(e.target.value.replace(',', '.')) || 0; } })),
        el('label', {}, 'Dauer', el('input', { type: 'text', value: ins.duration, oninput: (e) => { ins.duration = parseFloat(e.target.value.replace(',', '.')) || 2; } })),
        el('button', { text: '✕', title: 'entfernen', onclick: () => { st.inserts.splice(i, 1); renderInserts(); } })));
      const modeSel = el('select', { onchange: (e) => { ins.mode = e.target.value; } }, el('option', { value: 'card', text: 'als Karte oben' }), el('option', { value: 'full', text: 'Vollbild' }));
      modeSel.value = ins.mode;
      box.append(modeSel);
    });
  }

  window.addEventListener('DOMContentLoaded', () => {
    const chips = $('#subStyleChips');
    Object.entries(CutLogic.STYLES).forEach(([k, s]) => chips.append(el('button', { class: 'chip' + (k === st.subStyle ? ' on' : ''), text: s.label, onclick: (e) => { st.subStyle = k; $$('.chip', chips).forEach((c) => c.classList.remove('on')); e.target.classList.add('on'); } })));
    const pv = () => { $('#pauseVal').textContent = `${(+$('#maxPause').value).toFixed(2).replace('.', ',')} s`; };
    $('#maxPause').addEventListener('input', () => { pv(); if (st.words.length) renderTranscript(); }); pv();
    const sv = () => { $('#subSizeVal').textContent = `${$('#subSize').value} %`; };
    $('#subSize').addEventListener('input', sv); sv();
    $('#autoSlips').addEventListener('change', (e) => {
      if (!st.words.length) return;
      if (e.target.checked) CutLogic.autoMark(st.words);
      else st.words.forEach((w) => { if (w.reason === 'auto') { w.remove = false; w.reason = null; } });
      renderTranscript();
    });
    $('#chooseVideo').addEventListener('click', async () => {
      const f = await api.openFile({ filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi'] }] });
      if (f) loadFile(f);
    });
    const drop = $('#videoDrop');
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) loadFile(api.pathForFile(f)); });
    $('#aiSlips').addEventListener('click', aiSlips);
    $('#renderVideo').addEventListener('click', render);
    $('#showResult').addEventListener('click', () => st.result && api.showItem(st.result));
    $$('#videoTabs .tab').forEach((t) => t.addEventListener('click', () => !t.disabled && setTab(t.dataset.src)));
    $('#addInsert').addEventListener('click', async () => {
      const files = await api.openFile({ multi: true, filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
      if (!files) return;
      for (const f of files) st.inserts.push({ path: f, thumb: await api.readDataUrl(f), start: Math.round((player().currentTime || 0) * 10) / 10, duration: 2, mode: 'card' });
      renderInserts();
    });
    api.onVideoStatus((s) => { if (!$('#videoProgress').classList.contains('hidden') || s.progress < 1) progress(s.progress, s.step); });
    player().addEventListener('timeupdate', () => {
      if (!st.words.length || $('.tab.active')?.dataset.src !== 'orig') return;
      const t = player().currentTime;
      $$('.w.playing').forEach((x) => x.classList.remove('playing'));
      const i = st.words.findIndex((w) => t >= w.start && t <= w.end + 0.05);
      if (i >= 0) $(`.w[data-i="${i}"]`)?.classList.add('playing');
    });
  });
  return { st, loadFile };
})();

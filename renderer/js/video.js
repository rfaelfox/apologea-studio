// TikTok-Video-Cutter
const Video = (() => {
  const st = { file: null, info: null, words: [], silences: [], env: null, result: null, inserts: [], subStyle: 'apologea' };
  const PHOTO_STYLE = 'Photorealistic candid photograph, shot on a 35mm full-frame camera, natural light, realistic textures, subtle film grain, shallow depth of field, true-to-life colors, no text, no letters, no logos, no watermark, not an illustration, not CGI, not 3D render.';
  const outFps = () => Math.min(60, Math.max(24, Math.round(st.info?.fps || 30)));
  const player = () => $('#videoPlayer');

  function opts() {
    return { maxPause: +$('#maxPause').value };
  }
  function segments() {
    return CutLogic.buildSegments(st.words, { duration: st.info.duration, maxPause: opts().maxPause, silences: st.silences, env: st.env, fps: outFps() });
  }

  async function loadFile(file) {
    if (!/\.(mp4|mov|m4v|mkv|webm|avi)$/i.test(file)) { toast('Bitte eine Videodatei wählen (mp4, mov …).', true); return; }
    Object.assign(st, { file, info: null, words: [], silences: [], env: null, result: null, inserts: [] });
    renderInserts();
    $('#brollList').innerHTML = '';
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
    $('#stockSearch').disabled = false;
    $('#capcutExport').disabled = true;
    $('#transcriptPanel').classList.add('hidden');
    $('#videoStats').classList.add('hidden');
    try {
      st.info = await api.probeVideo(file);
      updateQualityHint();
      if (st.info.hdr) toast('HDR-Video (HLG) erkannt – die Farben werden beim Export automatisch richtig umgerechnet.');
      if (!App.settings.groqKey) {
        toast('Für das automatische Schneiden brauchst du den kostenlosen Groq-Schlüssel. Trag ihn unter „Einstellungen“ ein und wähl das Video danach nochmal.', true);
        return;
      }
      progress(0.02, 'Analyse startet …');
      const r = await api.analyzeVideo({ file, language: App.settings.language });
      st.info = r.info; st.words = r.words; st.silences = r.silences; st.env = r.env;
      if (!st.words.length) { progress(null); toast('Im Video wurde keine Sprache erkannt.', true); return; }
      if ($('#autoSlips').checked) CutLogic.autoMark(st.words);
      progress(null);
      renderTranscript();
      $('#renderVideo').disabled = false;
      $('#aiSlips').disabled = false;
      $('#brollSuggest').disabled = false;
      $('#capcutExport').disabled = false;
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

  // Gemeinsame Vorbereitung für „Video erstellen“ und „In CapCut bearbeiten“
  function buildJob({ forCapcut = false } = {}) {
    const segs = segments();
    if (!segs.length) { toast('Es bleibt nichts übrig – bitte weniger rausschneiden.', true); return null; }
    const map = CutLogic.timeMapper(segs);
    const total = map.total;
    const overlays = [], ovInputs = [];
    if (!forCapcut && $('#watermark').checked) { overlays.push({ kind: 'watermark' }); ovInputs.push({ asset: 'logo-watermark.png', duration: total + 1, loop: true }); }
    // Bilder hängen an einer Stelle im Original und werden auf die Zeit im fertigen Video umgerechnet
    const placed = st.inserts.map((ins) => {
      const start = Math.max(0, Math.min(total - 0.3, map(+ins.srcStart || 0)));
      const duration = Math.max(0.5, Math.min(total - start, +ins.duration || 2.5));
      return { ins, start, duration };
    }).sort((x, y) => x.start - y.start);
    if (!forCapcut) for (const { ins, start, duration } of placed) {
      overlays.push({ kind: 'insert', start, duration, mode: ins.mode, iw: ins.iw, ih: ins.ih, ai: !!ins.ai });
      ovInputs.push(ins.path ? { path: ins.path } : { dataUrl: ins.dataUrl });
    }
    const subsOn = $('#subsOn').checked;
    const hook = forCapcut ? '' : $('#hookText').value;
    const f = CutLogic.buildFilter(st.info, segs, {
      format: $('#vFormat').value, quality: $('#vQuality').value, jumpZoom: $('#jumpZoom').checked, colorPop: $('#colorPop').checked,
      audioNorm: $('#audioNorm').checked, denoise: $('#denoise').checked, kenBurns: $('#kenBurns').checked,
      subtitles: !forCapcut && (subsOn || !!hook.trim()), overlays,
    });
    const ass = forCapcut ? '' : CutLogic.buildAss(subsOn ? st.words : [], segs, {
      width: f.width, height: f.height, style: st.subStyle, perChunk: +$('#subWords').value, upper: $('#subUpper').checked,
      pos: $('#subPos').value, sizePct: +$('#subSize').value, hook,
    });
    const base = st.file.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
    return { segs, placed, f, ass, ovInputs, base, total };
  }

  async function render() {
    if (!st.info || !st.words.length) return;
    const job = buildJob();
    if (!job) return;
    const btn = $('#renderVideo'); btn.disabled = true;
    progress(0.01, 'Video wird geschnitten …');
    try {
      st.result = await api.renderVideo({ file: st.file, info: st.info, segments: job.segs, ass: job.ass, filter: job.f.filter, overlays: job.ovInputs, outName: job.base + ' – TikTok', quality: $('#vQuality').value });
      progress(null);
      $('.tab[data-src=result]').disabled = false;
      $('#showResult').disabled = false;
      setTab('result');
      player().play();
      toast('Fertig! Das Video liegt im Ordner „Videos“.');
    } catch (e) { progress(null); toast(errMsg(e), true); }
    btn.disabled = false;
  }

  // Sauber geschnittenes Video ohne eingebrannte Schrift + Untertitel (SRT) + Bilder in einen Ordner, dann CapCut öffnen
  async function capcutExport() {
    if (!st.info || !st.words.length) return;
    const job = buildJob({ forCapcut: true });
    if (!job) return;
    const btn = $('#capcutExport'); btn.disabled = true;
    progress(0.01, 'Paket für CapCut wird erstellt …');
    try {
      const folder = job.base + ' – CapCut';
      const video = await api.renderVideo({ file: st.file, info: st.info, segments: job.segs, ass: '', filter: job.f.filter, overlays: [], outName: job.base + ' – geschnitten', quality: $('#vQuality').value, subdir: folder });
      const srt = CutLogic.buildSrt(st.words, job.segs, { perChunk: +$('#subWords').value, upper: $('#subUpper').checked });
      const images = job.placed.map(({ ins, start, duration }, i) => ({ name: `Bild ${String(i + 1).padStart(2, '0')} – ab ${start.toFixed(1).replace('.', ',')} s`, path: ins.path, dataUrl: ins.dataUrl, start, duration }));
      const r = await api.capcutFinish({ video, srt, images });
      progress(null);
      toast(r.launched
        ? 'Paket ist fertig und CapCut startet. Dort: Video und Bilder aus dem geöffneten Ordner reinziehen, Untertitel über „Text → Untertitel importieren“ laden.'
        : 'Paket ist fertig (Ordner ist offen). CapCut habe ich nicht gefunden – öffne es selbst und zieh die Dateien hinein.');
    } catch (e) { progress(null); toast(errMsg(e), true); }
    btn.disabled = false;
  }

  function updateQualityHint() {
    const info = st.info;
    const q = $('#vQuality').value;
    let t = q === 'max' ? 'Beste Qualität. Braucht auf deinem PC deutlich länger.' : 'TikTok zeigt höchstens 1080p. So bleibt das Bild am schärfsten und der Export geht schneller.';
    if (info) {
      const [w, h] = CutLogic.outputSize(info, $('#vFormat').value, q);
      t = `Dein Video: ${info.width}×${info.height}, ${Math.round(info.fps)} Bilder/s → Export: ${w}×${h}, ${outFps()} Bilder/s. ` + t;
    }
    $('#qualityHint').textContent = t;
  }

  // ---------- Bilder einblenden ----------
  async function addInsert(data) {
    let iw = data.iw, ih = data.ih;
    if (!iw || !ih) { try { const im = await loadImage(data.thumb); iw = im.naturalWidth; ih = im.naturalHeight; } catch { iw = 1; ih = 1; } }
    const srcStart = data.srcStart ?? Math.round((player().currentTime || 0) * 10) / 10;
    st.inserts.push({ duration: 2.5, mode: 'full', ...data, srcStart, iw, ih });
    st.inserts.sort((a, b) => a.srcStart - b.srcStart);
    renderInserts();
  }

  function renderInserts() {
    const box = $('#insertList'); box.innerHTML = '';
    st.inserts.forEach((ins, i) => {
      box.append(el('div', { class: 'insert' },
        el('img', { src: ins.thumb, title: ins.credit || '' }),
        el('label', {}, 'ab Sek.', el('input', { type: 'text', value: String(ins.srcStart).replace('.', ','), title: 'Zeit im Original-Video', oninput: (e) => { ins.srcStart = parseFloat(e.target.value.replace(',', '.')) || 0; } })),
        el('label', {}, 'Dauer', el('input', { type: 'text', value: String(ins.duration).replace('.', ','), oninput: (e) => { ins.duration = parseFloat(e.target.value.replace(',', '.')) || 2.5; } })),
        el('button', { text: '▶', title: 'Stelle im Original abspielen', onclick: () => { setTab('orig'); player().currentTime = ins.srcStart; player().play(); } }),
        el('button', { text: '✕', title: 'entfernen', onclick: () => { st.inserts.splice(i, 1); renderInserts(); } })));
      const modeSel = el('select', { onchange: (e) => { ins.mode = e.target.value; } }, el('option', { value: 'full', text: 'Vollbild' }), el('option', { value: 'card', text: 'als Karte oben (Gold-Rahmen)' }));
      modeSel.value = ins.mode;
      box.append(modeSel);
    });
  }

  // KI liest den Text und schlägt Stellen + Bilder vor
  async function brollSuggest() {
    const btn = $('#brollSuggest'); btn.disabled = true;
    progress(0.3, 'KI sucht passende Stellen für Bilder …');
    try {
      const kept = st.words.map((w, i) => ({ w, i })).filter((x) => !x.w.remove);
      const text = kept.map((x) => `${x.i}:${x.w.word}`).join(' ').slice(0, 24000);
      const total = segments().reduce((a, [s, e]) => a + e - s, 0);
      const count = Math.max(2, Math.min(8, Math.round(total / 9)));
      const txt = await api.chat({ json: true, temperature: 0.6, maxTokens: 2500, messages: [
        { role: 'system', content: `Du bist Cutter für hochwertige TikTok-Videos der Modemarke ${App.settings.brand || 'Apologea'} (${App.settings.brandDescription || ''}). Du bekommst nummerierte Wörter eines gesprochenen Videos. Wähle ${count} Stellen, an denen ein eingeblendetes Bild (B-Roll) das Gesagte stark unterstreicht: konkrete Dinge, Orte, Gefühle, Beispiele. Nicht im ersten Satz (Hook), nicht zu dicht hintereinander. Antworte nur mit JSON: {"items":[{"word":Nummer des Wortes, bei dem das Bild startet,"seconds":2 bis 3.5,"why":"kurz auf Deutsch, was gezeigt wird","search":"2-4 englische Suchbegriffe für ein Stockfoto","prompt":"englische Beschreibung eines realistischen Fotos dieser Szene, hochkant, cinematic, passend zur Marke"}]}` },
        { role: 'user', content: text }] });
      const items = (parseJsonLoose(txt).items || []).filter((x) => st.words[+x.word]);
      renderBroll(items);
      if (!items.length) toast('Die KI hat keine passenden Stellen gefunden.', true);
    } catch (e) { toast(errMsg(e), true); }
    progress(null);
    btn.disabled = false;
  }

  function renderBroll(items) {
    const box = $('#brollList'); box.innerHTML = '';
    if (items.length) box.append(el('div', { class: 'lbl', text: 'Vorschläge der KI' }));
    for (const it of items) {
      const w = st.words[+it.word];
      const quote = st.words.slice(+it.word, +it.word + 8).map((x) => x.word).join(' ');
      const at = { srcStart: Math.round(w.start * 10) / 10, duration: Math.max(1.5, Math.min(4, +it.seconds || 2.5)) };
      const card = el('div', { class: 'broll' },
        el('q', { text: quote + ' …' }),
        el('small', { text: `${fmtTime(w.start)} · ${it.why || ''}` }),
        el('div', { class: 'btn-row' },
          el('button', { class: 'btn ghost small', text: 'Foto suchen', onclick: () => openStock({ query: it.search || '', at, prompt: it.prompt }) }),
          el('button', { class: 'btn ghost small', text: '✦ KI-Foto', onclick: async (e) => { e.target.disabled = true; await aiPhoto(it.prompt || it.search, at); e.target.disabled = false; } }),
          el('button', { class: 'btn ghost small', text: '▶', title: 'Stelle abspielen', onclick: () => { setTab('orig'); player().currentTime = w.start; player().play(); } }),
          el('button', { class: 'btn ghost small', text: '✕', onclick: () => card.remove() })));
      box.append(card);
    }
  }

  async function aiPhoto(prompt, at) {
    if (!prompt) { toast('Bitte zuerst beschreiben, was auf dem Foto sein soll.', true); return; }
    progress(0.4, 'KI erstellt ein realistisches Foto …');
    try {
      const dataUrl = await api.generateImage({ prompt: `${prompt}. ${PHOTO_STYLE}`, width: 768, height: 1344, photo: true });
      const im = await loadImage(dataUrl);
      // Hochkant-Bilder (z. B. OpenAI) als Vollbild, quadratische (Cloudflare) als Karte, damit nichts unscharf hochgezogen wird
      const mode = im.naturalHeight > im.naturalWidth * 1.3 ? 'full' : 'card';
      await addInsert({ dataUrl, thumb: dataUrl, ai: true, mode, iw: im.naturalWidth, ih: im.naturalHeight, ...(at || {}) });
      toast(mode === 'card' ? 'KI-Foto ist eingefügt – als Karte mit Gold-Rahmen, so bleibt es scharf.' : 'KI-Foto ist eingefügt.');
    } catch (e) { toast(errMsg(e), true); }
    progress(null);
  }

  // ---------- Fotosuche (Pexels) ----------
  let stockCtx = null;
  function openStock(ctx = {}) {
    stockCtx = ctx;
    $('#stQuery').value = ctx.query || '';
    $('#stGrid').innerHTML = '';
    $('#stockModal').classList.remove('hidden');
    if (!App.settings.pexelsKey) { $('#stInfo').textContent = 'Für die Fotosuche brauchst du den kostenlosen Pexels-Schlüssel (Einstellungen, 1 Minute). „✦ KI-Foto erstellen“ geht auch ohne.'; return; }
    $('#stInfo').textContent = 'Fotos von Pexels: kostenlos und auch für Werbung erlaubt. Klick ein Foto an, um es einzublenden.';
    if (ctx.query) stockSearch();
    else $('#stQuery').focus();
  }
  async function stockSearch() {
    const q = $('#stQuery').value.trim();
    if (!q) return;
    const grid = $('#stGrid'); grid.innerHTML = '';
    $('#stInfo').textContent = 'Suche läuft …';
    try {
      const photos = await api.stockSearch({ query: q, orientation: $('#stOrient').value });
      $('#stInfo').textContent = photos.length ? 'Klick ein Foto an, um es einzublenden.' : 'Nichts gefunden. Probier andere (englische) Begriffe.';
      for (const p of photos) {
        const fig = el('figure', { title: p.alt, onclick: async () => {
          fig.style.opacity = '0.5';
          try {
            const file = await api.stockFetch(p);
            await addInsert({ path: file, thumb: p.thumb, iw: p.width, ih: p.height, credit: `Foto: ${p.photographer} / Pexels`, mode: p.height >= p.width ? 'full' : 'card', ...(stockCtx?.at || {}) });
            $('#stockModal').classList.add('hidden');
            toast('Foto ist eingefügt.');
          } catch (e) { fig.style.opacity = '1'; toast(errMsg(e), true); }
        } }, el('img', { src: p.thumb, loading: 'lazy' }), el('figcaption', { text: p.photographer }));
        grid.append(fig);
      }
    } catch (e) { $('#stInfo').textContent = ''; toast(errMsg(e), true); }
  }

  async function setTab(which) {
    $$('#videoTabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.src === which));
    const p = player();
    const target = which === 'result' && st.result ? await api.fileUrl(st.result) : st.file ? await api.fileUrl(st.file) : '';
    if (target && p.src !== target) p.src = target;
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
      for (const f of files) await addInsert({ path: f, thumb: await api.readDataUrl(f) });
    });
    $('#brollSuggest').addEventListener('click', brollSuggest);
    $('#stockSearch').addEventListener('click', () => openStock({}));
    $('#stGo').addEventListener('click', stockSearch);
    $('#stQuery').addEventListener('keydown', (e) => { if (e.key === 'Enter') stockSearch(); });
    $('#stOrient').addEventListener('change', stockSearch);
    $('#stClose').addEventListener('click', () => $('#stockModal').classList.add('hidden'));
    $('#stAi').addEventListener('click', async () => {
      const prompt = stockCtx?.prompt || $('#stQuery').value.trim();
      $('#stockModal').classList.add('hidden');
      await aiPhoto(prompt, stockCtx?.at);
    });
    $('#capcutExport').addEventListener('click', capcutExport);
    $('#vQuality').addEventListener('change', updateQualityHint);
    $('#vFormat').addEventListener('change', updateQualityHint);
    updateQualityHint();
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

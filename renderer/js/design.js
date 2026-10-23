// Design-Studio: Idee → Konzept → Motive → Pieces
const Design = (() => {
  const GARMENT_KEYS = ['tee', 'oversize', 'hoodie', 'longsleeve', 'tote'];
  const STYLE_OPTS = ['Ikonen & Heilige', 'Mosaik', 'Verschlungene Kreuze', 'Kirchenfenster', 'Kalligrafie', 'Dunkle Romantik', 'Minimalistisch', 'Gotik', 'Engel & Flügel', 'Ornamente', 'Futuristisch-sakral', 'Vintage-Druck'];
  const CREATIVITY = [
    { label: 'Tragbar', temp: 0.6, text: 'Bleib gut tragbar und verkaufsstark, klare Motive.' },
    { label: 'Mutig', temp: 0.85, text: 'Sei mutig und eigenständig, aber noch alltagstauglich.' },
    { label: 'Visionär', temp: 1.0, text: 'Sei sehr kreativ, überraschend und poetisch – denke wie ein visionärer Creative Director.' },
    { label: 'Radikal', temp: 1.15, text: 'Sei radikal avantgardistisch, unerwartet, kunstvoll – brich Konventionen, ohne die Marke zu verlieren.' },
  ];
  const IMG_SUFFIX = ', isolated apparel graphic for screen printing, centered composition, plain solid pure white background, no t-shirt, no mockup, no garment, no person wearing it, crisp clean edges, highly detailed, masterpiece';

  const state = { concept: null, motifs: [], pieces: [], dir: null };
  const imgCache = new Map(); // motif index -> HTMLImageElement
  let editing = -1;

  // ---------- Vision-Bereich ----------
  function initVision() {
    const gChips = $('#garmentChips');
    GARMENT_KEYS.forEach((k, i) => gChips.append(el('button', { class: 'chip' + (i < 3 ? ' on' : ''), 'data-k': k, text: Mockups.GARMENTS[k].name, onclick: (e) => e.target.classList.toggle('on') })));
    const sChips = $('#styleChips');
    STYLE_OPTS.forEach((s) => sChips.append(el('button', { class: 'chip', text: s, onclick: (e) => e.target.classList.toggle('on') })));
    const cr = $('#creativity'), mc = $('#motifCount');
    const upd = () => { $('#creativityVal').textContent = CREATIVITY[cr.value].label; $('#motifCountVal').textContent = mc.value; };
    cr.addEventListener('input', upd); mc.addEventListener('input', upd); upd();
    $('#createConcept').addEventListener('click', createConcept);
    $('#idea').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.ctrlKey) createConcept(); });
    $('#saveProject').addEventListener('click', saveProject);
    $('#newProject').addEventListener('click', () => {
      if (state.concept && !confirm('Neues Projekt beginnen? Nicht gespeicherte Änderungen gehen verloren.')) return;
      Object.assign(state, { concept: null, motifs: [], pieces: [], dir: null });
      imgCache.clear();
      $('#idea').value = '';
      $('#conceptArea').classList.add('hidden');
      $('#saveProject').disabled = true;
    });
    $('#addMotif').addEventListener('click', addOwnMotif);
    $('#addPiece').addEventListener('click', () => {
      state.pieces.push(newPiece({ garment: 'tee', name: 'Neues Piece', motifIndex: state.motifs.length ? 0 : -1 }));
      renderPieces();
      openPiece(state.pieces.length - 1);
    });
  }

  function setStatus(t) { $('#designStatus').textContent = t || ''; }

  async function createConcept() {
    const idea = $('#idea').value.trim();
    if (!idea) { toast('Schreib zuerst deine Idee in das Feld.'); $('#idea').focus(); return; }
    const garments = $$('#garmentChips .chip.on').map((c) => c.dataset.k);
    if (!garments.length) { toast('Wähl mindestens ein Kleidungsstück.'); return; }
    const styles = $$('#styleChips .chip.on').map((c) => c.textContent);
    const cr = CREATIVITY[$('#creativity').value];
    const count = +$('#motifCount').value;
    const s = App.settings;
    const btn = $('#createConcept');
    btn.disabled = true; btn.classList.add('busy');
    setStatus('Der Creative Director denkt nach …');
    try {
      const sys = `Du bist der Creative Director der Modemarke "${s.brand}". Markenstil: ${s.brandDescription}
Du entwickelst aus einer Idee ein komplettes, sehr kreatives Kollektionskonzept. ${cr.text}
Antworte NUR mit JSON in genau diesem Format:
{
 "collectionName": "kurzer, starker Name",
 "tagline": "ein Satz, poetisch",
 "story": "3-4 Sätze auf Deutsch: Geschichte und Bedeutung der Kollektion",
 "mood": ["4-6 Stimmungswörter"],
 "palette": [{"name": "Farbname", "hex": "#RRGGBB"}],
 "typography": "1-2 Sätze zu Schrift, Details, Stickerei, Etiketten, Veredelung",
 "slogan": "kurzer Schriftzug (max. 4 Wörter) für ein Typo-Motiv, gern Latein/Griechisch/Kirchenslawisch in lateinischen Buchstaben",
 "motifs": [{"title": "Titel", "description": "1 Satz auf Deutsch", "prompt": "detailed ENGLISH image prompt describing only the graphic artwork: subject, composition, art style, line work, colors; NO text or letters in the image"}],
 "pieces": [{"garment": "einer von: ${garments.join(', ')}", "name": "Name des Pieces", "color": "#RRGGBB Stofffarbe", "motifIndex": 0, "placement": "chest|left|full|back", "ink": "original|gold|white|black", "description": "1 Satz: Material, Schnitt, Veredelung"}]
}
Regeln: genau ${count} Motive. Für jedes gewählte Kleidungsstück mindestens ein Piece (insgesamt ${Math.max(garments.length, Math.min(count + 1, 6))} Pieces). Palette 4-5 Farben. Die Bild-Prompts sollen einzigartige, druckbare Grafiken beschreiben (keine Fotos von Kleidung). Nutze "ink":"gold" für edle Goldfolien-Drucke, wenn es passt.`;
      const user = `Idee: ${idea}${styles.length ? `\nStilrichtung: ${styles.join(', ')}` : ''}\nKleidungsstücke: ${garments.map((g) => Mockups.GARMENTS[g].name).join(', ')}`;
      const txt = await api.chat({ messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], json: true, temperature: cr.temp, maxTokens: 3500 });
      const c = parseJsonLoose(txt);
      state.concept = c;
      state.dir = null;
      imgCache.clear();
      state.motifs = (c.motifs || []).slice(0, count).map((m, i) => ({ title: m.title, description: m.description, prompt: m.prompt, seed: Math.floor(Math.random() * 1e9), status: 'idle' }));
      // Lokales Typo-Motiv aus dem Slogan (garantiert sauber lesbare Schrift)
      if (c.slogan) state.motifs.push({ title: 'Schriftzug', description: `„${c.slogan}“ in Markenschrift`, typo: c.slogan, status: 'idle' });
      state.pieces = (c.pieces || []).map((p) => newPiece({
        garment: GARMENT_KEYS.includes(p.garment) ? p.garment : garments[0], name: p.name, color: /^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : '#0b0b0c',
        motifIndex: Math.min(Math.max(0, +p.motifIndex || 0), state.motifs.length - 1), placement: Mockups.PLACEMENTS[p.placement] ? p.placement : 'chest',
        ink: ['original', 'gold', 'white', 'black'].includes(p.ink) ? p.ink : 'original', description: p.description,
      }));
      for (const g of garments) if (!state.pieces.some((p) => p.garment === g)) state.pieces.push(newPiece({ garment: g, name: Mockups.GARMENTS[g].name, motifIndex: 0 }));
      renderConcept();
      $('#conceptArea').classList.remove('hidden');
      $('#saveProject').disabled = false;
      setStatus('');
      $('#conceptArea').scrollIntoView({ behavior: 'smooth' });
      generateAllMotifs();
    } catch (e) {
      setStatus('');
      toast(errMsg(e), true);
    } finally { btn.disabled = false; btn.classList.remove('busy'); }
  }

  function newPiece(p) {
    return { name: 'Piece', garment: 'tee', color: '#0b0b0c', motifIndex: 0, placement: 'chest', ink: 'original', scale: 1, dx: 0, dy: 0, removeBg: true, tol: 48, description: '', ...p };
  }

  // ---------- Konzept anzeigen ----------
  function renderConcept() {
    const c = state.concept;
    $('#cName').textContent = c.collectionName || 'Ohne Titel';
    $('#cTagline').textContent = c.tagline || '';
    $('#cStory').textContent = c.story || '';
    $('#cTypo').textContent = c.typography || '';
    const pal = $('#cPalette'); pal.innerHTML = '';
    (c.palette || []).forEach((p) => pal.append(el('div', { class: 'swatch' }, el('i', { style: `background:${p.hex}` }), p.name)));
    const mood = $('#cMood'); mood.innerHTML = '';
    (c.mood || []).forEach((m) => mood.append(el('span', { text: m })));
    renderMotifs();
    renderPieces();
  }
  ['cName', 'cTagline', 'cStory'].forEach((id) => document.addEventListener('input', (e) => {
    if (e.target.id !== id || !state.concept) return;
    const key = { cName: 'collectionName', cTagline: 'tagline', cStory: 'story' }[id];
    state.concept[key] = e.target.textContent;
  }));

  // ---------- Motive ----------
  function renderMotifs() {
    const grid = $('#motifGrid'); grid.innerHTML = '';
    state.motifs.forEach((m, i) => {
      const frame = el('div', { class: 'frame' + (m.status === 'loading' ? ' loading' : '') });
      if (m.dataUrl) frame.append(el('img', { src: m.dataUrl }));
      else if (m.status === 'loading') frame.append(el('div', { class: 'wait' }, el('b', { text: '☩' }), m.queueText || 'wird gemalt …'));
      else if (m.status === 'error') frame.append(el('div', { class: 'wait' }, el('span', { class: 'err', text: m.error || 'Fehler' })));
      else frame.append(el('div', { class: 'wait' }, el('b', { text: '✦' }), 'wartet …'));
      grid.append(el('div', { class: 'motif' }, frame,
        el('h4', { text: m.title || `Motiv ${i + 1}` }),
        el('p', { text: m.description || '' }),
        el('div', { class: 'acts' },
          m.typo ? null : el('button', { class: 'btn ghost small', text: '↻ Variante', disabled: m.status === 'loading' ? 'disabled' : null, onclick: () => { m.seed = Math.floor(Math.random() * 1e9); generateMotif(i); } }),
          !m.typo && App.settings.openaiKey && App.settings.imageProvider !== 'openai' ? el('button', { class: 'btn ghost small', text: '✦ Premium', title: 'Mit OpenAI in höchster Qualität neu malen (kostet ein paar Cent)', disabled: m.status === 'loading' ? 'disabled' : null, onclick: () => generateMotif(i, false, 'openai') }) : null,
          el('button', { class: 'btn ghost small', text: '✎ Ändern', onclick: () => editMotif(i) }),
          m.typo ? null : el('button', { class: 'btn ghost small', text: '☩ ChatGPT', title: 'Kopiert die Bildbeschreibung und öffnet ChatGPT (nutzt dein ChatGPT-Abo)', onclick: () => openInChatGPT(m) }),
          el('button', { class: 'btn ghost small', text: '⇪ Einsetzen', title: 'Eigenes oder in ChatGPT gemaltes Bild für dieses Motiv einsetzen', onclick: () => replaceMotifImage(i) }),
          el('button', { class: 'btn ghost small', text: '✕', title: 'Motiv entfernen', onclick: () => removeMotif(i) }))));
    });
  }

  async function generateAllMotifs() {
    const todo = state.motifs.map((m, i) => i).filter((i) => !state.motifs[i].dataUrl);
    todo.forEach((i, k) => { state.motifs[i].status = 'loading'; state.motifs[i].queueText = k === 0 ? 'wird gemalt …' : `in der Warteschlange (${k}) …`; });
    renderMotifs();
    await Promise.all(todo.map((i) => generateMotif(i, true)));
    setStatus('');
  }

  async function generateMotif(i, quiet, provider) {
    const m = state.motifs[i];
    m.status = 'loading';
    if (!quiet) m.queueText = 'wird gemalt …';
    renderMotifs();
    try {
      if (m.typo) m.dataUrl = await renderTypo(m.typo);
      else m.dataUrl = await api.generateImage({ prompt: m.prompt + IMG_SUFFIX, seed: m.seed, width: 1024, height: 1024, provider });
      m.premium = provider === 'openai';
      imgCache.delete(i);
      m.status = 'done';
      // nächste in der Warteschlange aktualisieren
      state.motifs.filter((x) => x.status === 'loading').forEach((x, k) => { x.queueText = k === 0 ? 'wird gemalt …' : `in der Warteschlange (${k}) …`; });
    } catch (e) {
      m.status = 'error'; m.error = errMsg(e);
    }
    renderMotifs();
    renderPieces();
  }

  async function renderTypo(text) {
    await fontsReady;
    const c = document.createElement('canvas'); c.width = c.height = 1024;
    const x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 1024, 1024);
    x.fillStyle = '#111'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const words = String(text).toUpperCase().split(/\s+/);
    const lines = [];
    let line = '';
    x.font = '700 120px Cinzel';
    for (const w of words) { const t = line ? line + ' ' + w : w; if (x.measureText(t).width > 860 && line) { lines.push(line); line = w; } else line = t; }
    lines.push(line);
    const size = Math.min(150, Math.floor(860 / Math.max(...lines.map((l) => x.measureText(l).width)) * 120));
    x.font = `700 ${size}px Cinzel`;
    const lh = size * 1.25, top = 512 - (lines.length - 1) * lh / 2;
    lines.forEach((l, k) => x.fillText(l, 512, top + k * lh));
    const cross = await loadImage('../assets/logo-cross.png');
    const cs = 150;
    const cy = top - lh / 2 - cs / 2 - 30;
    // Kreuz einfärben (dunkel), damit es wie die Schrift gedruckt wird
    const cc = document.createElement('canvas'); cc.width = cc.height = cs;
    const cx = cc.getContext('2d'); cx.drawImage(cross, 0, 0, cs, cs); cx.globalCompositeOperation = 'source-in'; cx.fillStyle = '#111'; cx.fillRect(0, 0, cs, cs);
    x.drawImage(cc, 512 - cs / 2, cy);
    x.font = `400 ${Math.round(size * 0.3)}px Cinzel`;
    x.fillText('✦  ' + (App.settings.brand || 'APOLOGEA').toUpperCase() + '  ✦', 512, top + (lines.length - 1) * lh + lh * 0.9);
    return c.toDataURL('image/png');
  }

  function removeMotif(i) {
    state.motifs.splice(i, 1);
    imgCache.clear();
    state.pieces.forEach((p) => { if (p.motifIndex === i) p.motifIndex = -1; else if (p.motifIndex > i) p.motifIndex--; });
    renderMotifs(); renderPieces();
  }

  async function addOwnMotif() {
    const f = await api.openFile({ filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
    if (!f) return;
    const dataUrl = await api.readDataUrl(f);
    state.motifs.push({ title: 'Eigenes Motiv', description: f.split(/[\\/]/).pop(), dataUrl, status: 'done', own: true });
    renderMotifs(); renderPieces();
  }

  async function openInChatGPT(m) {
    const text = `Create an image: ${m.prompt}\n\nRequirements: square 1:1 format, transparent background (PNG), an isolated graphic artwork for screen printing on clothing, centered, crisp clean edges, highly detailed. Do NOT show a t-shirt, mockup or person. No text or letters in the image.`;
    await api.copyText(text);
    api.openExternal('https://chatgpt.com/');
    toast('Beschreibung kopiert ✦ In ChatGPT mit Strg+V einfügen, Bild herunterladen und hier mit „Einsetzen“ zurückholen.');
  }

  async function replaceMotifImage(i) {
    const f = await api.openFile({ filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
    if (!f) return;
    const m = state.motifs[i];
    m.dataUrl = await api.readDataUrl(f);
    m.status = 'done';
    m.typo = null;
    imgCache.delete(i);
    renderMotifs(); renderPieces();
    toast('Bild eingesetzt – alle Pieces mit diesem Motiv sind aktualisiert.');
  }

  function editMotif(i) {
    const m = state.motifs[i];
    $('#prTitle').value = m.title || '';
    $('#prText').value = m.typo || m.prompt || '';
    $('#promptModal').classList.remove('hidden');
    $('#prApply').onclick = async () => {
      m.title = $('#prTitle').value.trim() || m.title;
      const txt = $('#prText').value.trim();
      $('#promptModal').classList.add('hidden');
      if (m.typo || m.own) { if (txt) { m.typo = txt; m.own = false; } }
      else if (txt && txt !== m.prompt) {
        try {
          const out = await api.chat({ messages: [
            { role: 'system', content: 'You turn a clothing-graphic idea (any language) into one detailed English image-generation prompt describing only the artwork (subject, composition, art style, line work, colors), no text in the image. Reply with the prompt only.' },
            { role: 'user', content: txt }], temperature: 0.7, maxTokens: 300 });
          m.prompt = out.trim().replace(/^"|"$/g, '') || txt;
        } catch { m.prompt = txt; }
        m.seed = Math.floor(Math.random() * 1e9);
      }
      generateMotif(i);
    };
  }
  $('#prClose')?.addEventListener('click', () => $('#promptModal').classList.add('hidden'));

  async function motifImage(i) {
    const m = state.motifs[i];
    if (!m || !m.dataUrl) return null;
    let img = imgCache.get(i);
    if (!img || img.src !== m.dataUrl) { img = await loadImage(m.dataUrl); imgCache.set(i, img); }
    return img;
  }
  async function preparedMotif(p) {
    const img = await motifImage(p.motifIndex);
    return img ? Mockups.prepareMotif(img, { removeBg: p.removeBg, tol: p.tol, ink: p.ink }) : null;
  }

  // ---------- Pieces ----------
  let pieceRender = 0;
  async function renderPieces() {
    const token = ++pieceRender;
    const grid = $('#pieceGrid'); grid.innerHTML = '';
    const jobs = state.pieces.map((p, i) => {
      const cv = el('canvas', { width: 600, height: 600 });
      const placeTxt = Mockups.PLACEMENTS[p.placement] || '';
      grid.append(el('div', { class: 'piece', onclick: () => openPiece(i) }, cv,
        el('div', { class: 'meta' }, el('b', { text: p.name }), el('div', { text: `${Mockups.GARMENTS[p.garment].name} · ${placeTxt}` }), p.description ? el('div', { text: p.description }) : null)));
      return [cv, p];
    });
    for (const [cv, p] of jobs) {
      const m = await preparedMotif(p);
      if (token !== pieceRender) return;
      Mockups.render(cv, p, m);
    }
  }

  function openPiece(i) {
    editing = i;
    const p = state.pieces[i];
    $('#pmTitle').textContent = p.name;
    const gs = $('#pmGarment'); gs.innerHTML = '';
    GARMENT_KEYS.forEach((k) => gs.append(el('option', { value: k, text: Mockups.GARMENTS[k].name })));
    const ps = $('#pmPlacement'); ps.innerHTML = '';
    Object.entries(Mockups.PLACEMENTS).forEach(([k, v]) => ps.append(el('option', { value: k, text: v })));
    syncControls();
    $('#pieceModal').classList.remove('hidden');
    drawEditor();
  }

  function syncControls() {
    const p = state.pieces[editing];
    $('#pmGarment').value = p.garment;
    $('#pmPlacement').value = p.placement;
    $('#pmScale').value = p.scale;
    $('#pmRemoveBg').checked = p.removeBg;
    $('#pmTol').value = p.tol;
    $('#pmColorPick').value = p.color;
    $$('#pmView button').forEach((b) => b.classList.toggle('active', (b.dataset.v === 'back') === (p.placement === 'back')));
    $$('#pmInk button').forEach((b) => b.classList.toggle('active', b.dataset.v === p.ink));
    const cols = $('#pmColors'); cols.innerHTML = '';
    const palette = [...new Set([...(state.concept?.palette || []).map((c) => c.hex), ...Mockups.FABRIC_COLORS])];
    palette.forEach((c) => cols.append(el('button', { style: `background:${c}`, class: c.toLowerCase() === p.color.toLowerCase() ? 'active' : '', title: c, onclick: () => { p.color = c; syncControls(); drawEditor(); } })));
    const ms = $('#pmMotifs'); ms.innerHTML = '';
    ms.append(el('div', { class: 'none' + (p.motifIndex < 0 ? ' active' : ''), text: 'ohne', onclick: () => { p.motifIndex = -1; syncControls(); drawEditor(); } }));
    state.motifs.forEach((m, k) => { if (m.dataUrl) ms.append(el('img', { src: m.dataUrl, class: k === p.motifIndex ? 'active' : '', title: m.title, onclick: () => { p.motifIndex = k; syncControls(); drawEditor(); } })); });
  }

  let drawPending = false;
  function drawEditor() {
    if (drawPending) return;
    drawPending = true;
    requestAnimationFrame(async () => {
      drawPending = false;
      const p = state.pieces[editing];
      if (p) Mockups.render($('#pmCanvas'), p, await preparedMotif(p));
    });
  }

  function initEditor() {
    const p = () => state.pieces[editing];
    const bind = (id, ev, fn) => $(id).addEventListener(ev, (e) => { fn(e); drawEditor(); });
    bind('#pmGarment', 'change', (e) => { p().garment = e.target.value; });
    bind('#pmPlacement', 'change', (e) => { p().placement = e.target.value; p().dx = p().dy = 0; syncControls(); });
    bind('#pmScale', 'input', (e) => { p().scale = +e.target.value; });
    bind('#pmRemoveBg', 'change', (e) => { p().removeBg = e.target.checked; });
    bind('#pmTol', 'change', (e) => { p().tol = +e.target.value; });
    bind('#pmColorPick', 'input', (e) => { p().color = e.target.value; });
    $$('#pmView button').forEach((b) => b.addEventListener('click', () => {
      const pc = p();
      if (b.dataset.v === 'back') pc.placement = 'back'; else if (pc.placement === 'back') pc.placement = 'chest';
      pc.dx = pc.dy = 0; syncControls(); drawEditor();
    }));
    $$('#pmInk button').forEach((b) => b.addEventListener('click', () => { p().ink = b.dataset.v; syncControls(); drawEditor(); }));
    $('#pmReset').addEventListener('click', () => { Object.assign(p(), { dx: 0, dy: 0, scale: 1 }); syncControls(); drawEditor(); });
    $('#pmDelete').addEventListener('click', () => {
      if (!confirm('Dieses Piece löschen?')) return;
      state.pieces.splice(editing, 1); closeEditor();
    });
    $('#pmClose').addEventListener('click', closeEditor);
    $('#pieceModal').addEventListener('mousedown', (e) => { if (e.target.id === 'pieceModal') closeEditor(); });
    $('#pmTitle').addEventListener('input', (e) => { p().name = e.target.textContent; });
    $('#pmExport').addEventListener('click', async () => {
      const pc = p();
      const cv = el('canvas', { width: 2000, height: 2000 });
      Mockups.render(cv, pc, await preparedMotif(pc));
      const dir = await api.saveProject(projectPayload([{ name: pc.name, dataUrl: cv.toDataURL('image/png') }], true));
      state.dir = dir;
      toast('Gespeichert in: ' + dir);
      api.openPath(dir + '/Mockups');
    });
    // Ziehen & Zoomen
    const cv = $('#pmCanvas');
    let drag = null;
    const toUnits = (e) => { const r = cv.getBoundingClientRect(); const s = Math.min(r.width, r.height); return [(e.clientX - r.left) / s * 1000, (e.clientY - r.top) / s * 1000]; };
    cv.addEventListener('mousedown', (e) => { const [x, y] = toUnits(e); drag = { x, y, dx: p().dx, dy: p().dy }; cv.style.cursor = 'grabbing'; });
    window.addEventListener('mousemove', (e) => { if (!drag) return; const [x, y] = toUnits(e); p().dx = drag.dx + x - drag.x; p().dy = drag.dy + y - drag.y; drawEditor(); });
    window.addEventListener('mouseup', () => { drag = null; cv.style.cursor = 'grab'; });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); const pc = p(); pc.scale = Math.max(0.3, Math.min(1.8, pc.scale * (e.deltaY < 0 ? 1.05 : 0.95))); $('#pmScale').value = pc.scale; drawEditor(); }, { passive: false });
  }
  function closeEditor() { $('#pieceModal').classList.add('hidden'); editing = -1; renderPieces(); }

  // ---------- Speichern / Laden ----------
  function projectPayload(mockups, keepDir) {
    return {
      name: state.concept?.collectionName || 'Kollektion',
      concept: { ...state.concept, pieces: state.pieces },
      motifs: state.motifs.map((m) => ({ title: m.title, description: m.description, prompt: m.prompt, typo: m.typo, seed: m.seed, dataUrl: m.dataUrl })),
      mockups,
      existingDir: keepDir ? state.dir : state.dir,
    };
  }
  async function saveProject() {
    if (!state.concept) return;
    const btn = $('#saveProject'); btn.disabled = true;
    try {
      const mockups = [];
      for (const p of state.pieces) {
        const cv = el('canvas', { width: 1600, height: 1600 });
        Mockups.render(cv, p, await preparedMotif(p));
        mockups.push({ name: p.name, dataUrl: cv.toDataURL('image/png') });
      }
      state.dir = await api.saveProject(projectPayload(mockups));
      toast('Kollektion gespeichert ✦');
      api.openPath(state.dir);
    } catch (e) { toast(errMsg(e), true); }
    finally { btn.disabled = false; }
  }
  function loadProject(proj) {
    state.concept = proj.concept;
    state.pieces = (proj.concept.pieces || []).map((p) => newPiece(p));
    state.motifs = (proj.motifs || []).map((m) => ({ ...m, status: m.dataUrl ? 'done' : 'idle' }));
    state.dir = proj.dir;
    imgCache.clear();
    renderConcept();
    $('#conceptArea').classList.remove('hidden');
    $('#saveProject').disabled = false;
  }

  window.addEventListener('DOMContentLoaded', () => { initVision(); initEditor(); });
  return { loadProject, state, renderTypo, refresh: renderMotifs };
})();

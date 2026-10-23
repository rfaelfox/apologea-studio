// Navigation, Einstellungen, Archiv
const imgReady = (s) => ({ cloudflare: s.cfAccountId && s.cfToken, openai: s.openaiKey, huggingface: s.hfToken, pollinations: s.pollinationsKey })[s.imageProvider || 'cloudflare'];
const App = {
  settings: {},
  async refreshSettings() {
    this.settings = await api.getSettings();
    const s = this.settings;
    $('#keyStatus').innerHTML = '';
    $('#keyStatus').append(
      el('div', {}, el('span', { class: 'dot' + (s.groqKey ? ' on' : '') }), s.groqKey ? 'Text-KI & Sprache bereit' : 'Groq-Schlüssel fehlt'),
      el('div', {}, el('span', { class: 'dot' + (imgReady(s) ? ' on' : '') }), imgReady(s) ? 'Bild-KI bereit' : 'Bild-KI-Schlüssel fehlt'),
    );
    return s;
  },
  show(view) {
    $('.main').scrollTop = 0;
    $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
    if (view === 'archive') this.loadArchive();
    if (view === 'settings') this.fillSettings();
  },
  fillSettings() {
    const s = this.settings;
    for (const k of ['groqKey', 'cfAccountId', 'cfToken', 'openaiKey', 'openaiModel', 'openaiQuality', 'pexelsKey', 'pollinationsKey', 'hfToken', 'brand', 'brandDescription', 'imageProvider', 'language']) $('#' + k).value = s[k] ?? '';
    $('#outputDirLabel').textContent = s.resolvedOutputDir;
  },
  async saveSettings() {
    const data = {};
    for (const k of ['groqKey', 'cfAccountId', 'cfToken', 'openaiKey', 'openaiModel', 'openaiQuality', 'pexelsKey', 'pollinationsKey', 'hfToken', 'brand', 'brandDescription', 'imageProvider', 'language']) data[k] = $('#' + k).value.trim();
    await api.setSettings(data);
    await this.refreshSettings();
    toast('Gespeichert ✦');
    if (Design.state.motifs.length) Design.refresh();
  },
  async loadArchive() {
    const grid = $('#archiveGrid');
    grid.innerHTML = '';
    const list = await api.listProjects();
    if (!list.length) { grid.append(el('div', { class: 'empty', text: 'Noch keine Kollektion gespeichert. Erschaffe im Design-Studio deine erste.' })); return; }
    for (const p of list) {
      grid.append(el('div', { class: 'arch', onclick: async () => { const proj = await api.loadProject(p.dir); Design.loadProject(proj); App.show('design'); } },
        p.thumb ? el('img', { src: p.thumb }) : el('div', { class: 'noimg' }),
        el('div', { class: 'meta' }, el('b', { text: p.name }), el('div', { text: new Date(p.savedAt).toLocaleString('de-DE') }))));
    }
  },
};

window.addEventListener('DOMContentLoaded', async () => {
  $$('.nav-item').forEach((b) => b.addEventListener('click', () => App.show(b.dataset.view)));
  $$('[data-link]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); api.openExternal(a.dataset.link); }));
  $('#saveSettings').addEventListener('click', () => App.saveSettings());
  $('#pickOutput').addEventListener('click', async () => {
    const dir = await api.pickFolder();
    if (dir) { await api.setSettings({ outputDir: dir }); await App.refreshSettings(); App.fillSettings(); }
  });
  $('#openOutput').addEventListener('click', () => api.openPath(App.settings.resolvedOutputDir));
  const s = await App.refreshSettings();
  if (!s.groqKey || !imgReady(s)) { App.show('settings'); setTimeout(() => toast('Willkommen! Trag hier einmalig deine kostenlosen Schlüssel ein und klick auf „Speichern“.'), 600); }
});

// ---------- Updates ----------
window.addEventListener('DOMContentLoaded', async () => {
  const btn = $('#updateBtn'), msg = $('#updateMsg');
  $('#appVersion').textContent = 'Version ' + (await api.appVersion());
  let state = 'idle', manual = false;
  const setBtn = (text, cls, disabled = false) => { btn.textContent = text; btn.className = 'btn small ' + cls; btn.disabled = disabled; };
  btn.addEventListener('click', () => {
    if (state === 'available') { api.downloadUpdate(); setBtn('Wird geladen …', 'ghost', true); }
    else if (state === 'ready') api.installUpdate();
    else api.checkUpdate();
  });
  api.onUpdateStatus((u) => {
    if (u.state === 'checking') { state = 'checking'; manual = !!u.manual; setBtn('Suche …', 'ghost', true); msg.textContent = ''; }
    else if (u.state === 'none') { state = 'idle'; setBtn('Nach Updates suchen', 'ghost'); msg.textContent = ''; if (manual) toast('Du hast die neueste Version ✦'); }
    else if (u.state === 'available') { state = 'available'; msg.textContent = `Neue Version ${u.version} ist da.`; setBtn('Update laden', 'gold'); }
    else if (u.state === 'progress') { msg.textContent = `Update wird geladen … ${u.percent} %`; }
    else if (u.state === 'ready') { state = 'ready'; msg.textContent = `Version ${u.version} ist bereit.`; setBtn('Jetzt installieren', 'gold'); }
    else if (u.state === 'error') { state = 'idle'; setBtn('Nach Updates suchen', 'ghost'); msg.textContent = ''; console.warn('Update', u.message); if (manual) toast('Update-Prüfung gerade nicht möglich. Später nochmal versuchen.', true); }
  });
});

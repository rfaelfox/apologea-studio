// Apologea Studio – Hauptprozess (Fenster, Dateien, KI-Dienste, FFmpeg)
const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

const ASSETS = path.join(__dirname, 'assets');
let win;

// ---------- Einstellungen ----------
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const DEFAULT_SETTINGS = {
  groqKey: '',
  pollinationsKey: '',
  hfToken: '',
  cfAccountId: '',
  cfToken: '',
  imageProvider: 'cloudflare',
  openaiKey: '',
  openaiModel: 'gpt-image-2.5-sunburst',
  openaiQuality: 'high',
  pexelsKey: '',
  unsplashKey: '',
  pixabayKey: '',
  imageModel: 'black-forest-labs/flux.1-schnell',
  textModel: 'llama-3.3-70b-versatile',
  brand: 'Apologea',
  brandDescription: 'Sakrale, düstere Luxus-Streetwear. Byzantinische und orthodoxe Ästhetik: Ikonen, Mosaike, verschlungene Kreuze, Gold auf Schwarz.',
  language: 'de',
  outputDir: '',
};
function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}
function saveSettings(s) {
  const merged = { ...loadSettings(), ...s };
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(merged, null, 2));
  return merged;
}
function outputDir() {
  const s = loadSettings();
  const dir = s.outputDir || path.join(app.getPath('documents'), 'Apologea Studio');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ---------- Fenster ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 700,
    backgroundColor: '#070605',
    title: 'Apologea Studio',
    icon: nativeImage.createFromPath(path.join(ASSETS, 'icon.png')),
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}
app.whenReady().then(() => {
  createWindow();
  if (app.isPackaged) setTimeout(() => checkForUpdates(false), 4000);
});

// ---------- Updates (von GitHub-Releases) ----------
let autoUpdater = null;
function updater() {
  if (autoUpdater) return autoUpdater;
  autoUpdater = require('electron-updater').autoUpdater;
  autoUpdater.setFeedURL({ provider: 'github', owner: 'rfaelfox', repo: 'apologea-studio', releaseType: 'release' });
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', (i) => send('update:status', { state: 'available', version: i.version }));
  autoUpdater.on('update-not-available', () => send('update:status', { state: 'none', version: app.getVersion() }));
  autoUpdater.on('download-progress', (p) => send('update:status', { state: 'progress', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (i) => send('update:status', { state: 'ready', version: i.version }));
  autoUpdater.on('error', (e) => send('update:status', { state: 'error', message: String(e?.message || e).split('\n')[0].slice(0, 200) }));
  return autoUpdater;
}
async function checkForUpdates(manual) {
  if (!app.isPackaged) { if (manual) send('update:status', { state: 'none', version: app.getVersion() }); return; }
  send('update:status', { state: 'checking', manual });
  try { await updater().checkForUpdates(); } catch (e) { send('update:status', { state: 'error', message: String(e?.message || e).slice(0, 200) }); }
}
ipcMain.handle('update:check', () => checkForUpdates(true));
ipcMain.handle('update:download', () => updater().downloadUpdate());
ipcMain.handle('update:install', () => updater().quitAndInstall(true, true));
ipcMain.handle('app:version', () => app.getVersion());
app.on('window-all-closed', () => app.quit());

// ---------- Hilfsfunktionen ----------
async function fetchWithTimeout(url, opts = {}, ms = 120000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}
async function errorText(res) {
  const body = await res.text().catch(() => '');
  let msg = body;
  try { const j = JSON.parse(body); msg = j.error?.message || j.error || j.message || body; } catch {}
  return `${res.status} ${typeof msg === 'string' ? msg.slice(0, 300) : JSON.stringify(msg).slice(0, 300)}`;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function safeName(s) { return String(s || 'Projekt').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim().slice(0, 60) || 'Projekt'; }
function dataUrlToBuffer(d) { return Buffer.from(d.split(',')[1], 'base64'); }

// ---------- Text-KI ----------
async function chat({ messages, json = false, temperature = 0.9, maxTokens = 3000 }) {
  const s = loadSettings();
  const body = { messages, temperature, max_tokens: maxTokens };
  if (json) body.response_format = { type: 'json_object' };
  const headers = { 'Content-Type': 'application/json' };
  let url, provider;
  if (s.groqKey) {
    provider = 'Groq';
    url = 'https://api.groq.com/openai/v1/chat/completions';
    headers.Authorization = `Bearer ${s.groqKey}`;
    body.model = s.textModel || DEFAULT_SETTINGS.textModel;
  } else if (s.cfAccountId && s.cfToken) {
    provider = 'Cloudflare';
    url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(s.cfAccountId)}/ai/v1/chat/completions`;
    headers.Authorization = `Bearer ${s.cfToken}`;
    body.model = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
    delete body.response_format;
  } else if (s.pollinationsKey) {
    provider = 'Pollinations';
    url = 'https://gen.pollinations.ai/v1/chat/completions';
    headers.Authorization = `Bearer ${s.pollinationsKey}`;
    body.model = 'openai';
  } else {
    throw new Error('Für die Text-KI fehlt ein Schlüssel. Bitte unter „Einstellungen“ den kostenlosen Groq-Schlüssel eintragen.');
  }
  const res = await fetchWithTimeout(url, { method: 'POST', headers, body: JSON.stringify(body) }, 120000);
  if (!res.ok) throw new Error(`${provider}-Fehler: ` + (await errorText(res)));
  const data = await res.json();
  return data.choices?.[0]?.message?.content || data.result?.response || '';
}
ipcMain.handle('ai:chat', async (_e, args) => chat(args));

// ---------- Bild-KI ----------
let lastImageCall = 0;
let imageChain = Promise.resolve();
function queueImage(fn) {
  const run = imageChain.then(fn, fn);
  imageChain = run.catch(() => {});
  return run;
}
async function generateImage({ prompt, seed, width = 1024, height = 1024, provider: wanted, photo = false }) {
  const s = loadSettings();
  seed = seed ?? Math.floor(Math.random() * 1e9);
  const provider = wanted || s.imageProvider || 'cloudflare';
  if (provider === 'openai') {
    if (!s.openaiKey) throw new Error('Für OpenAI fehlt der API-Schlüssel (Einstellungen).');
    // OpenAI liefert echte Transparenz, daher keinen weißen Hintergrund verlangen
    const p = prompt.replace('plain solid pure white background', 'transparent background, no backdrop');
    const res = await fetchWithTimeout('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.openaiKey}`, 'Content-Type': 'application/json' },
      // photo = Foto zum Einblenden im Video (hochkant, mit Hintergrund)
      body: JSON.stringify(photo
        ? { model: s.openaiModel || DEFAULT_SETTINGS.openaiModel, prompt, size: '1024x1536', quality: s.openaiQuality || 'high', background: 'opaque', output_format: 'jpeg', n: 1 }
        : { model: s.openaiModel || DEFAULT_SETTINGS.openaiModel, prompt: p, size: '1024x1024', quality: s.openaiQuality || 'high', background: 'transparent', output_format: 'png', n: 1 }),
    }, 300000);
    if (!res.ok) {
      const t = await errorText(res);
      if (/billing|quota|insufficient/i.test(t)) throw new Error('OpenAI: Kein Guthaben auf platform.openai.com. Bitte dort unter „Billing“ Guthaben aufladen.');
      throw new Error('OpenAI: ' + t);
    }
    const data = await res.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error('OpenAI lieferte kein Bild');
    return { buf: Buffer.from(b64, 'base64'), type: photo ? 'image/jpeg' : 'image/png' };
  }
  if (provider === 'cloudflare') {
    if (!s.cfAccountId || !s.cfToken) throw new Error('Für die Bild-KI fehlen Cloudflare-Konto-ID und Token (Einstellungen).');
    const res = await fetchWithTimeout(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(s.cfAccountId)}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.cfToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt.slice(0, 2000), steps: 8 }), // Cloudflare erlaubt nur prompt + steps
    }, 180000);
    if (!res.ok) {
      const t = await errorText(res);
      if (res.status === 429 || /neurons|limit/i.test(t)) throw new Error('Das kostenlose Tageskontingent der Bild-KI ist aufgebraucht (ca. 200 Bilder pro Tag). Morgen geht es weiter.');
      throw new Error('Cloudflare: ' + t);
    }
    const data = await res.json();
    const b64 = data.result?.image || data.image;
    if (!b64) throw new Error('Cloudflare lieferte kein Bild');
    return { buf: Buffer.from(b64, 'base64'), type: 'image/jpeg' };
  }
  if (provider === 'huggingface') {
    if (!s.hfToken) throw new Error('Für Hugging Face fehlt der Token (Einstellungen).');
    const res = await fetchWithTimeout('https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell', {
      method: 'POST',
      headers: { Authorization: `Bearer ${s.hfToken}`, 'Content-Type': 'application/json', Accept: 'image/png' },
      body: JSON.stringify({ inputs: prompt, parameters: { width, height, seed } }),
    }, 180000);
    if (!res.ok) throw new Error('Hugging Face: ' + (await errorText(res)));
    return { buf: Buffer.from(await res.arrayBuffer()), type: res.headers.get('content-type') || 'image/png' };
  }
  // Pollinations (braucht inzwischen einen Schlüssel von enter.pollinations.ai)
  if (!s.pollinationsKey) throw new Error('Für Pollinations fehlt der Schlüssel (Einstellungen).');
  const wait = lastImageCall + 1500 - Date.now();
  if (wait > 0) await sleep(wait);
  lastImageCall = Date.now();
  const params = new URLSearchParams({ model: s.imageModel || DEFAULT_SETTINGS.imageModel, width, height, seed: String(seed % 2147483647), key: s.pollinationsKey });
  const res = await fetchWithTimeout(`https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?${params}`, {}, 180000);
  if (!res.ok) throw new Error('Pollinations: ' + (await errorText(res)));
  const type = res.headers.get('content-type') || 'image/jpeg';
  if (!type.startsWith('image/')) throw new Error('Pollinations lieferte kein Bild');
  return { buf: Buffer.from(await res.arrayBuffer()), type };
}
ipcMain.handle('img:generate', (_e, args) => queueImage(async () => {
  const { buf, type } = await generateImage(args);
  return `data:${type};base64,${buf.toString('base64')}`;
}));

// ---------- Stockfotos (kostenlos, auch für Werbung erlaubt) ----------
// Unsplash liefert die größten Bilder, Pixabay klappt ohne Freischaltung, Pexels nur mit altem Schlüssel
function stockSource(s) {
  if (s.unsplashKey) return 'unsplash';
  if (s.pexelsKey) return 'pexels';
  if (s.pixabayKey) return 'pixabay';
  return null;
}
// Wikimedia Commons: alte Ikonen und Gemälde, nur gemeinfreie Dateien (kein Schlüssel nötig)
const WIKI_UA = 'ApologeaStudio/1.3 (https://github.com/rfaelfox/apologea-studio)';
async function searchCommons(query) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrsearch: `${query} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '40',
    prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '500', iiextmetadatafilter: 'LicenseShortName|Artist|ObjectName',
  });
  const res = await fetchWithTimeout(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: { 'User-Agent': WIKI_UA } }, 30000);
  if (!res.ok) throw new Error('Wikimedia: ' + (await errorText(res)));
  const data = await res.json();
  const strip = (h) => String(h || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  return Object.values(data.query?.pages || {})
    .sort((a, b) => (a.index || 0) - (b.index || 0))
    .map((p) => ({ p, ii: p.imageinfo?.[0] }))
    .filter(({ ii }) => ii && /image\/(jpeg|png)/.test(ii.mime) && ii.width >= 900 && ii.height >= 900)
    // nur wirklich freie Bilder: gemeinfrei oder CC0
    .filter(({ ii }) => /public domain|^pd\b|^pd-|cc0/i.test(ii.extmetadata?.LicenseShortName?.value || ''))
    .map(({ p, ii }) => {
      const name = p.title.replace(/^File:/, '');
      const big = ii.width > 3840 ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=3840` : ii.url;
      const k = Math.min(1, 3840 / ii.width);
      return {
        source: 'commons', id: p.pageid, width: Math.round(ii.width * k), height: Math.round(ii.height * k),
        alt: strip(ii.extmetadata?.ObjectName?.value) || name.replace(/\.[^.]+$/, ''),
        photographer: strip(ii.extmetadata?.Artist?.value).slice(0, 60) || 'gemeinfrei',
        thumb: ii.thumburl || ii.url, download: big, fallback: ii.url,
      };
    });
}
ipcMain.handle('stock:search', async (_e, { query, orientation = 'portrait', page = 1, source }) => {
  const s = loadSettings();
  if (source === 'commons') return searchCommons(query);
  const src = stockSource(s);
  if (!src) throw new Error('Für die Fotosuche fehlt ein kostenloser Unsplash- oder Pixabay-Schlüssel (Einstellungen).');
  if (src === 'unsplash') {
    const params = new URLSearchParams({ query, per_page: '20', page: String(page), content_filter: 'high' });
    if (orientation) params.set('orientation', orientation);
    const res = await fetchWithTimeout(`https://api.unsplash.com/search/photos?${params}`, { headers: { Authorization: `Client-ID ${s.unsplashKey}`, 'Accept-Version': 'v1' } }, 30000);
    if (!res.ok) throw new Error('Unsplash: ' + (await errorText(res)));
    const data = await res.json();
    return (data.results || []).map((p) => ({
      source: 'unsplash', id: p.id, width: p.width, height: p.height, alt: p.alt_description || p.description || '', photographer: p.user?.name || '',
      thumb: p.urls?.small, download: `${p.urls?.raw}&fm=jpg&q=88&${p.height >= p.width ? 'w=2400' : 'h=3400'}`, track: p.links?.download_location,
    }));
  }
  if (src === 'pexels') {
    const params = new URLSearchParams({ query, per_page: '20', page: String(page) });
    if (orientation) params.set('orientation', orientation);
    const res = await fetchWithTimeout(`https://api.pexels.com/v1/search?${params}`, { headers: { Authorization: s.pexelsKey } }, 30000);
    if (!res.ok) throw new Error('Pexels: ' + (await errorText(res)));
    const data = await res.json();
    return (data.photos || []).map((p) => ({
      source: 'pexels', id: p.id, width: p.width, height: p.height, alt: p.alt || '', photographer: p.photographer || '',
      thumb: p.src?.medium || p.src?.small, download: `${p.src?.original}?auto=compress&cs=tinysrgb&${p.height >= p.width ? 'w=2400' : 'h=3400'}`,
    }));
  }
  const params = new URLSearchParams({ key: s.pixabayKey, q: query.slice(0, 100), image_type: 'photo', per_page: '20', page: String(page), safesearch: 'true' });
  params.set('orientation', orientation === 'portrait' ? 'vertical' : orientation === 'landscape' ? 'horizontal' : 'all');
  const res = await fetchWithTimeout(`https://pixabay.com/api/?${params}`, {}, 30000);
  if (!res.ok) throw new Error('Pixabay: ' + (await errorText(res)));
  const data = await res.json();
  return (data.hits || []).map((p) => {
    // Pixabay gibt höchstens 1280 px heraus – die echte Bildgröße passend herunterrechnen
    const k = Math.min(1, 1280 / Math.max(p.imageWidth || 1280, p.imageHeight || 1280));
    return {
      source: 'pixabay', id: p.id, width: Math.round((p.imageWidth || 1280) * k), height: Math.round((p.imageHeight || 1280) * k), alt: p.tags || '', photographer: p.user || '',
      thumb: p.webformatURL, download: p.largeImageURL,
    };
  });
});
ipcMain.handle('stock:fetch', async (_e, photo) => {
  const dir = path.join(app.getPath('userData'), 'media');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${safeName(photo.source || 'foto')}-${safeName(String(photo.id))}.jpg`);
  if (!fs.existsSync(file)) {
    let res = await fetchWithTimeout(photo.download, { headers: { 'User-Agent': WIKI_UA } }, 120000).catch(() => null);
    // Falls die verkleinerte Fassung nicht klappt: Originaldatei laden
    if ((!res || !res.ok || !/^image\//.test(res.headers.get('content-type') || '')) && photo.fallback) res = await fetchWithTimeout(photo.fallback, { headers: { 'User-Agent': WIKI_UA } }, 300000);
    if (!res || !res.ok) throw new Error('Foto konnte nicht geladen werden: ' + (res ? res.status : 'keine Verbindung'));
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    // Unsplash verlangt, dass Downloads gemeldet werden
    if (photo.source === 'unsplash' && photo.track) {
      const s = loadSettings();
      fetchWithTimeout(photo.track, { headers: { Authorization: `Client-ID ${s.unsplashKey}` } }, 15000).catch(() => {});
    }
  }
  return file;
});

// ---------- Dateien & Projekte ----------
ipcMain.handle('settings:get', () => ({ ...loadSettings(), resolvedOutputDir: outputDir() }));
ipcMain.handle('settings:set', (_e, s) => saveSettings(s));
ipcMain.handle('app:openExternal', (_e, url) => shell.openExternal(url));
ipcMain.handle('app:copy', (_e, text) => clipboard.writeText(String(text)));
ipcMain.handle('app:openPath', (_e, p) => shell.openPath(p));
ipcMain.handle('app:showItem', (_e, p) => shell.showItemInFolder(p));
ipcMain.handle('app:font', (_e, file) => new Uint8Array(fs.readFileSync(path.join(ASSETS, 'fonts', path.basename(file)))));
ipcMain.handle('app:assetPath', (_e, name) => path.join(ASSETS, name));

ipcMain.handle('dialog:open', async (_e, { filters, multi } = {}) => {
  const r = await dialog.showOpenDialog(win, { properties: multi ? ['openFile', 'multiSelections'] : ['openFile'], filters });
  return r.canceled ? null : (multi ? r.filePaths : r.filePaths[0]);
});
ipcMain.handle('dialog:folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('file:readDataUrl', (_e, p) => {
  const ext = path.extname(p).toLowerCase().replace('.', '');
  const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }[ext] || 'application/octet-stream';
  return `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
});

ipcMain.handle('project:save', (_e, { name, concept, motifs, mockups, existingDir }) => {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const dir = existingDir || path.join(outputDir(), 'Designs', `${stamp} ${safeName(name)}`);
  fs.mkdirSync(path.join(dir, 'Motive'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'Mockups'), { recursive: true });
  const motifMeta = (motifs || []).map((m, i) => {
    const file = `Motiv ${i + 1} - ${safeName(m.title)}.png`;
    if (m.dataUrl) fs.writeFileSync(path.join(dir, 'Motive', file), dataUrlToBuffer(m.dataUrl));
    return { ...m, dataUrl: undefined, file: m.dataUrl ? file : null };
  });
  (mockups || []).forEach((mk, i) => {
    fs.writeFileSync(path.join(dir, 'Mockups', `${String(i + 1).padStart(2, '0')} ${safeName(mk.name)}.png`), dataUrlToBuffer(mk.dataUrl));
  });
  fs.writeFileSync(path.join(dir, 'projekt.json'), JSON.stringify({ name, concept, motifs: motifMeta, savedAt: new Date().toISOString() }, null, 2));
  return dir;
});
ipcMain.handle('project:list', () => {
  const base = path.join(outputDir(), 'Designs');
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base).map((d) => {
    const dir = path.join(base, d);
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, 'projekt.json'), 'utf8'));
      const thumbDir = path.join(dir, 'Mockups');
      const thumbs = fs.existsSync(thumbDir) ? fs.readdirSync(thumbDir).filter((f) => f.endsWith('.png')).slice(0, 1) : [];
      const thumb = thumbs[0] ? `data:image/png;base64,${fs.readFileSync(path.join(thumbDir, thumbs[0])).toString('base64')}` : null;
      return { dir, name: j.name, savedAt: j.savedAt, thumb };
    } catch { return null; }
  }).filter(Boolean).sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
});
ipcMain.handle('project:load', (_e, dir) => {
  const j = JSON.parse(fs.readFileSync(path.join(dir, 'projekt.json'), 'utf8'));
  j.motifs = (j.motifs || []).map((m) => ({
    ...m,
    dataUrl: m.file && fs.existsSync(path.join(dir, 'Motive', m.file)) ? `data:image/png;base64,${fs.readFileSync(path.join(dir, 'Motive', m.file)).toString('base64')}` : null,
  }));
  j.dir = dir;
  return j;
});

// ---------- FFmpeg ----------
function ffmpegPath() {
  let p = require('ffmpeg-static');
  return p.replace('app.asar', 'app.asar.unpacked');
}
function runFfmpeg(args, { cwd, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath(), ['-hide_banner', ...args], { cwd, windowsHide: true });
    let err = '';
    proc.stderr.on('data', (d) => {
      const s = d.toString();
      err += s;
      if (err.length > 400000) err = err.slice(-200000);
      const m = s.match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (m && onProgress) onProgress(+m[1] * 3600 + +m[2] * 60 + +m[3]);
    });
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve(err) : reject(new Error('FFmpeg-Fehler:\n' + err.split('\n').slice(-12).join('\n')))));
  });
}
async function probe(file) {
  const out = await runFfmpeg(['-i', file, '-f', 'null', '-t', '0.01', '-']).catch((e) => e.message);
  const dur = out.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
  // Erste echte Videospur (eingebettete Vorschaubilder = "attached pic" überspringen)
  const vLine = out.split('\n').find((l) => /Stream #\d+:\d+.*?: Video: /.test(l) && !/attached pic/.test(l)) || '';
  const vid = vLine.match(/, (\d{2,5})x(\d{2,5})/);
  const fps = vLine.match(/(\d+(?:\.\d+)?) fps/);
  const rot = out.match(/rotate\s*:\s*(-?\d+)|rotation of (-?\d+(?:\.\d+)?)/);
  let width = vid ? +vid[1] : 1080, height = vid ? +vid[2] : 1920;
  const r = rot ? Math.abs(Math.round(+(rot[1] ?? rot[2]))) : 0;
  if (r === 90 || r === 270) [width, height] = [height, width];
  return {
    duration: dur ? +dur[1] * 3600 + +dur[2] * 60 + +dur[3] : 0,
    width, height, fps: fps ? +fps[1] : 30,
    hasAudio: /Stream #\d+:\d+.*?: Audio:/.test(out),
    hdr: /arib-std-b67/.test(vLine) ? 'hlg' : /smpte2084/.test(vLine) ? 'pq' : null,
  };
}
ipcMain.handle('video:probe', (_e, file) => probe(file));

// Lautstärke (RMS) in 10-ms-Schritten aus 8-kHz-16-Bit-Mono
function envelope(buf) {
  const n = Math.floor(buf.length / 2), step = 80, out = [];
  for (let i = 0; i + step <= n; i += step) {
    let sum = 0;
    for (let k = 0; k < step; k++) { const v = buf.readInt16LE((i + k) * 2) / 32768; sum += v * v; }
    out.push(Math.round(Math.sqrt(sum / step) * 10000) / 10000);
  }
  return out;
}
function workDir() {
  const d = path.join(os.tmpdir(), 'apologea-studio', String(Date.now()));
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function send(channel, payload) { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); }

ipcMain.handle('video:analyze', async (_e, { file, silenceDb = -35, language }) => {
  const s = loadSettings();
  if (!s.groqKey) throw new Error('Für die Spracherkennung brauchst du einen kostenlosen Groq-Schlüssel (Einstellungen).');
  const info = await probe(file);
  const dir = workDir();
  const audio = path.join(dir, 'audio.mp3');
  send('video:status', { step: 'Ton wird vorbereitet …', progress: 0.05 });
  const raw = path.join(dir, 'env.raw');
  // Zweite Ausgabe: roher Ton (8 kHz) für die Lautstärke-Hüllkurve, mit der die Schnitte in leise Stellen gelegt werden
  const log = await runFfmpeg(['-y', '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-af', `silencedetect=noise=${silenceDb}dB:d=0.25`, '-b:a', '32k', audio,
    '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', raw], {
    onProgress: (t) => info.duration && send('video:status', { step: 'Ton wird vorbereitet …', progress: 0.05 + 0.25 * Math.min(1, t / info.duration) }),
  });
  const silences = [];
  let open = null;
  for (const line of log.split('\n')) {
    const a = line.match(/silence_start: (-?\d+(?:\.\d+)?)/);
    const b = line.match(/silence_end: (\d+(?:\.\d+)?)/);
    if (a) open = Math.max(0, +a[1]);
    if (b && open !== null) { silences.push([open, +b[1]]); open = null; }
  }
  if (open !== null) silences.push([open, info.duration]);
  const env = envelope(fs.readFileSync(raw));
  const size = fs.statSync(audio).size;
  if (size > 24 * 1024 * 1024) throw new Error('Das Video ist zu lang für die kostenlose Spracherkennung (max. ca. 90 Minuten).');
  send('video:status', { step: 'KI hört zu und schreibt mit …', progress: 0.4 });
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(audio)], { type: 'audio/mpeg' }), 'audio.mp3');
  form.append('model', 'whisper-large-v3-turbo');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  form.append('timestamp_granularities[]', 'segment');
  if (language || s.language) form.append('language', language || s.language);
  form.append('prompt', 'Äh, ähm, also, ja. Ein lockeres TikTok-Video.');
  const res = await fetchWithTimeout('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${s.groqKey}` }, body: form,
  }, 300000);
  if (!res.ok) throw new Error('Spracherkennung fehlgeschlagen: ' + (await errorText(res)));
  const data = await res.json();
  fs.rmSync(dir, { recursive: true, force: true });
  send('video:status', { step: 'Fertig analysiert', progress: 1 });
  return { info, silences, env, words: (data.words || []).map((w) => ({ word: String(w.word).trim(), start: w.start, end: w.end })), text: data.text };
});

ipcMain.handle('video:render', async (_e, job) => {
  const { file, info, segments, ass, filter, overlays = [], outName, quality = 'hd', subdir } = job;
  const dir = workDir();
  fs.mkdirSync(path.join(dir, 'fonts'));
  for (const f of fs.readdirSync(path.join(ASSETS, 'fonts'))) fs.copyFileSync(path.join(ASSETS, 'fonts', f), path.join(dir, 'fonts', f));
  if (ass) fs.writeFileSync(path.join(dir, 'subs.ass'), ass, 'utf8');
  fs.writeFileSync(path.join(dir, 'filter.txt'), filter, 'utf8');
  const outDir = subdir ? path.join(outputDir(), 'Videos', safeName(subdir)) : path.join(outputDir(), 'Videos');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${safeName(outName)}.mp4`);
  const args = ['-y', '-i', file];
  for (const o of overlays) {
    let src = o.path;
    // FFmpeg kann nicht in app.asar hineinschauen, deshalb das Logo erst in den Arbeitsordner kopieren
    if (o.asset) { src = path.join(dir, path.basename(o.asset)); fs.copyFileSync(path.join(ASSETS, o.asset), src); }
    if (o.dataUrl) { src = path.join(dir, `ov${args.length}.png`); fs.writeFileSync(src, dataUrlToBuffer(o.dataUrl)); }
    // Das Wasserzeichen läuft als Endlosbild mit, eingeblendete Bilder kommen als Einzelbild (Bewegung macht der Filter)
    if (o.loop) args.push('-loop', '1', '-t', String(o.duration));
    args.push('-i', src);
  }
  args.push('-filter_complex_script', 'filter.txt', '-map', '[vout]');
  if (info.hasAudio) args.push('-map', '[aout]', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000');
  args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', quality === 'max' ? '18' : '17', '-profile:v', 'high',
    '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-movflags', '+faststart', out);
  const total = segments.reduce((a, s) => a + (s[1] - s[0]), 0);
  await runFfmpeg(args, { cwd: dir, onProgress: (t) => send('video:status', { step: 'Video wird geschnitten …', progress: Math.min(0.99, t / total) }) });
  fs.rmSync(dir, { recursive: true, force: true });
  send('video:status', { step: 'Fertig!', progress: 1 });
  return out;
});
// CapCut-Paket fertigstellen: Untertitel + Bilder neben das Video legen, Ordner öffnen, CapCut starten
ipcMain.handle('capcut:finish', async (_e, { video, srt, images = [] }) => {
  const dir = path.dirname(video);
  fs.writeFileSync(path.join(dir, 'Untertitel.srt'), srt, 'utf8');
  const lines = ['Bilder zum Einblenden (Zeit im geschnittenen Video):', ''];
  for (const im of images) {
    const name = safeName(im.name);
    let dest;
    if (im.path) { dest = path.join(dir, name + path.extname(im.path)); fs.copyFileSync(im.path, dest); }
    else if (im.dataUrl) { dest = path.join(dir, name + (im.dataUrl.startsWith('data:image/png') ? '.png' : '.jpg')); fs.writeFileSync(dest, dataUrlToBuffer(im.dataUrl)); }
    if (dest) lines.push(`${path.basename(dest)}: ab ${im.start.toFixed(1)} s für ${im.duration.toFixed(1)} s`);
  }
  lines.push('', 'So gehts in CapCut:', '1. Neues Projekt, das Video und die Bilder hineinziehen.', '2. Video auf die Zeitleiste, Bilder als Ebene darüber an die genannten Zeiten.', '3. Text > Untertitel importieren (Lokale Untertitel) > Untertitel.srt wählen.');
  fs.writeFileSync(path.join(dir, 'Anleitung.txt'), lines.join('\r\n'), 'utf8');
  shell.showItemInFolder(video);
  const local = process.env.LOCALAPPDATA || '';
  const candidates = [
    path.join(local, 'CapCut', 'Apps', 'CapCut.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'CapCut', 'CapCut.exe'),
    path.join(local, 'Programs', 'CapCut', 'CapCut.exe'),
  ];
  const exe = candidates.find((p) => p && fs.existsSync(p));
  if (exe) { require('child_process').spawn(exe, [], { detached: true, stdio: 'ignore' }).unref(); return { launched: true, dir }; }
  return { launched: false, dir };
});
ipcMain.handle('video:fileUrl', (_e, p) => require('url').pathToFileURL(p).href);

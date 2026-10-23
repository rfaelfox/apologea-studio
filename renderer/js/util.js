// Kleine Helfer für alle Bereiche
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'text') n.textContent = v;
    else if (v !== undefined && v !== null && v !== false) n.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) n.append(c.nodeType ? c : document.createTextNode(c));
  return n;
}

let toastTimer;
function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('err', isError);
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), isError ? 9000 : 3500);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Bild konnte nicht geladen werden'));
    img.src = src;
  });
}

// KI-Antworten enthalten manchmal Text um das JSON herum
function parseJsonLoose(text) {
  try { return JSON.parse(text); } catch {}
  const m = String(text).match(/\{[\s\S]*\}/);
  if (m) return JSON.parse(m[0]);
  throw new Error('Die KI hat keine lesbare Antwort geliefert. Bitte nochmal versuchen.');
}

function fmtTime(sec) {
  sec = Math.max(0, sec || 0);
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function errMsg(e) {
  return String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

// Schriften direkt aus den Programmdateien laden (zuverlässiger als @font-face-URLs)
const FONTS = [
  ['Cinzel', 'Cinzel-Regular.ttf', '400'], ['Cinzel', 'Cinzel-Bold.ttf', '600 900'],
  ['Cinzel Decorative', 'CinzelDecorative-Bold.ttf', '400 900'],
  ['Cormorant', 'Cormorant-Regular.ttf', '300 500'], ['Cormorant', 'Cormorant-Bold.ttf', '600 900'],
  ['Montserrat', 'Montserrat-Regular.ttf', '100 500'], ['Montserrat', 'Montserrat-Bold.ttf', '600 900'],
  ['Anton', 'Anton-Regular.ttf', '400'],
];
const fontsReady = Promise.all(FONTS.map(async ([family, file, weight]) => {
  try {
    const face = new FontFace(family, await api.fontData(file), { weight });
    await face.load();
    document.fonts.add(face);
  } catch (e) { console.error('Schrift', file, e); }
}));

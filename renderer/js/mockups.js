// Kleidungs-Mockups: Formen, Schattierung, Motiv-Druck – alles im Canvas (1000×1000)
const Mockups = (() => {
  const P = (d) => new Path2D(d);

  // ---------- Formen ----------
  const teeBody = (neck) => `M350 120 ${neck} L795 170 C835 184 862 206 880 240 L962 410 L838 470 L790 380 L792 905 C792 925 780 935 760 935 L240 935 C220 935 208 925 208 905 L210 380 L162 470 L38 410 L120 240 C138 206 165 184 205 170 Z`;
  const longBody = (neck) => `M350 120 ${neck} L795 170 C840 186 868 214 884 262 L985 860 L898 884 L828 520 L790 400 L792 905 C792 925 780 935 760 935 L240 935 C220 935 208 925 208 905 L210 400 L172 520 L102 884 L15 860 L116 262 C132 214 160 186 205 170 Z`;
  const overBody = (neck) => `M362 108 ${neck.replace(/650 120/g, '638 108').replace(/350 120/g, '362 108')} L812 190 C860 210 890 240 905 285 L978 470 L858 535 L812 430 L822 935 C822 955 810 965 790 965 L210 965 C190 965 178 955 178 935 L188 430 L142 535 L22 470 L95 285 C110 240 140 210 188 190 Z`;
  const NECK_FRONT = 'C392 190 608 190 650 120';
  const NECK_BACK = 'C400 146 600 146 650 120';
  const hoodieBody = 'M345 175 L180 235 C120 260 95 300 82 380 L40 850 L150 875 L208 470 L210 915 C210 935 222 945 242 945 L758 945 C778 945 790 935 790 915 L792 470 L850 875 L960 850 L918 380 C905 300 880 260 820 235 L655 175 C600 200 400 200 345 175 Z';

  const GARMENTS = {
    tee: {
      name: 'T-Shirt',
      front: { body: teeBody(NECK_FRONT), inner: 'M350 120 C400 150 600 150 650 120 C608 190 392 190 350 120 Z', rib: 'M352 124 C394 192 606 192 648 124',
        seams: ['M205 170 C214 260 212 320 210 380', 'M795 170 C786 260 788 320 790 380', 'M44 398 L158 455', 'M956 398 L842 455', 'M210 905 L790 905'],
        folds: ['M300 600 C330 700 320 800 290 900', 'M690 560 C660 680 680 790 720 900', 'M420 820 C480 860 560 860 620 830'] },
      back: { body: teeBody(NECK_BACK), rib: 'M352 123 C400 150 600 150 648 123',
        seams: ['M205 170 C214 260 212 320 210 380', 'M795 170 C786 260 788 320 790 380', 'M44 398 L158 455', 'M956 398 L842 455', 'M210 905 L790 905'],
        folds: ['M300 600 C330 700 320 800 290 900', 'M690 560 C660 680 680 790 720 900'] },
      place: { chest: [500, 380, 300], left: [622, 292, 105], full: [500, 530, 440], back: [500, 410, 470] },
    },
    oversize: {
      name: 'Oversize-Tee',
      front: { body: overBody(NECK_FRONT), inner: 'M362 108 C410 140 590 140 638 108 C598 182 402 182 362 108 Z', rib: 'M364 112 C404 184 596 184 636 112',
        seams: ['M188 190 C196 300 192 370 188 430', 'M812 190 C804 300 808 370 812 430', 'M28 458 L138 520', 'M972 458 L862 520', 'M180 935 L820 935'],
        folds: ['M290 620 C320 730 310 830 280 940', 'M710 600 C680 720 700 820 740 940', 'M400 860 C480 900 560 900 640 865'] },
      back: { body: overBody(NECK_BACK), rib: 'M364 111 C410 138 590 138 636 111',
        seams: ['M188 190 C196 300 192 370 188 430', 'M812 190 C804 300 808 370 812 430', 'M28 458 L138 520', 'M972 458 L862 520', 'M180 935 L820 935'],
        folds: ['M290 620 C320 730 310 830 280 940', 'M710 600 C680 720 700 820 740 940'] },
      place: { chest: [500, 390, 320], left: [632, 300, 110], full: [500, 560, 480], back: [500, 430, 500] },
    },
    longsleeve: {
      name: 'Longsleeve',
      front: { body: longBody(NECK_FRONT), inner: 'M350 120 C400 150 600 150 650 120 C608 190 392 190 350 120 Z', rib: 'M352 124 C394 192 606 192 648 124',
        seams: ['M205 170 C214 260 212 330 210 400', 'M795 170 C786 260 788 330 790 400', 'M24 822 L110 800', 'M976 822 L890 800', 'M210 905 L790 905'],
        folds: ['M300 600 C330 700 320 800 290 900', 'M690 560 C660 680 680 790 720 900', 'M80 600 C100 640 120 650 150 640', 'M920 600 C900 640 880 650 850 640'] },
      back: { body: longBody(NECK_BACK), rib: 'M352 123 C400 150 600 150 648 123',
        seams: ['M205 170 C214 260 212 330 210 400', 'M795 170 C786 260 788 330 790 400', 'M24 822 L110 800', 'M976 822 L890 800', 'M210 905 L790 905'],
        folds: ['M300 600 C330 700 320 800 290 900', 'M690 560 C660 680 680 790 720 900'] },
      place: { chest: [500, 380, 300], left: [622, 292, 105], full: [500, 530, 440], back: [500, 410, 470] },
    },
    hoodie: {
      name: 'Hoodie',
      front: { body: hoodieBody,
        hood: 'M345 175 C320 70 400 25 500 25 C600 25 680 70 655 175 C640 240 580 275 500 278 C420 275 360 240 345 175 Z',
        hoodInner: 'M392 168 C405 108 452 92 500 92 C548 92 595 108 608 168 C592 222 552 246 500 248 C448 246 408 222 392 168 Z',
        strings: ['M468 246 C466 300 460 360 456 420', 'M532 246 C534 300 540 350 545 410'],
        ribs: ['M210 888 L790 888', 'M44 812 L150 836', 'M956 812 L850 836'],
        pocket: 'M318 640 L682 640 L742 862 L258 862 Z',
        seams: ['M180 235 C200 330 206 400 208 470', 'M820 235 C800 330 794 400 792 470', 'M318 640 L258 862', 'M682 640 L742 862'],
        folds: ['M300 560 C320 600 300 630 280 640', 'M700 560 C680 600 700 630 720 640', 'M90 500 C110 560 130 600 160 620', 'M910 500 C890 560 870 600 840 620'] },
      back: { body: hoodieBody,
        hoodBack: 'M345 175 C330 80 410 30 500 30 C590 30 670 80 655 175 C640 285 585 350 500 362 C415 350 360 285 345 175 Z',
        ribs: ['M210 888 L790 888', 'M44 812 L150 836', 'M956 812 L850 836'],
        seams: ['M180 235 C200 330 206 400 208 470', 'M820 235 C800 330 794 400 792 470', 'M500 32 L500 360'],
        folds: ['M300 620 C320 700 300 800 280 880', 'M700 620 C680 700 700 800 720 880'] },
      place: { chest: [500, 500, 250], left: [626, 352, 96], full: [500, 485, 330], back: [500, 600, 420] },
    },
    tote: {
      name: 'Tote-Bag',
      front: { body: 'M215 330 L785 330 L808 935 C808 945 800 950 790 950 L210 950 C200 950 192 945 192 935 Z',
        handles: ['M345 334 C345 120 655 120 655 334'],
        seams: ['M220 362 L780 362'], folds: ['M330 500 C350 650 340 800 320 930', 'M680 520 C660 680 670 800 690 930'] },
      back: null,
      place: { chest: [500, 640, 400], left: [500, 640, 260], full: [500, 640, 470], back: [500, 640, 400] },
    },
  };

  const PLACEMENTS = { chest: 'Brust mittig', left: 'Brust links (klein)', full: 'Großer Frontprint', back: 'Rücken (groß)' };
  const FABRIC_COLORS = ['#0b0b0c', '#1c1a1e', '#2b2620', '#3d3a36', '#4a1e1e', '#1d2a22', '#1b2233', '#5c4a32', '#8b7d6b', '#c8bca6', '#e9e2d3', '#f6f4ef'];

  // ---------- Farb-Helfer ----------
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
  }
  function shade(hex, amt) {
    const [r, g, b] = hexToRgb(hex);
    const f = (c) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt))));
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }
  function luminance(hex) { const [r, g, b] = hexToRgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }

  // ---------- Stoffstruktur ----------
  let noisePattern = null;
  function noise(ctx) {
    if (noisePattern) return noisePattern;
    const c = document.createElement('canvas');
    c.width = c.height = 220;
    const x = c.getContext('2d');
    const d = x.createImageData(220, 220);
    for (let i = 0; i < d.data.length; i += 4) {
      const v = 128 + (Math.random() - 0.5) * 90;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255;
    }
    x.putImageData(d, 0, 0);
    noisePattern = ctx.createPattern(c, 'repeat');
    return noisePattern;
  }

  // ---------- Motiv vorbereiten (Hintergrund weg, Druckfarbe) ----------
  const motifCache = new Map();
  function prepareMotif(img, { removeBg = true, tol = 48, ink = 'original' } = {}) {
    const key = `${img.src.length}:${img.src.slice(-40)}:${removeBg}:${tol}:${ink}`;
    if (motifCache.has(key)) return motifCache.get(key);
    const max = 900;
    const sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * sc), h = Math.round(img.naturalHeight * sc);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, w, h);
    const id = x.getImageData(0, 0, w, h);
    const d = id.data;
    // Hintergrundfarbe = Mittel der Randpixel
    let br = 0, bg = 0, bb = 0, n = 0, ba = 0;
    const sample = (i) => { br += d[i]; bg += d[i + 1]; bb += d[i + 2]; ba += d[i + 3]; n++; };
    for (let xx = 0; xx < w; xx += 4) { sample(xx * 4); sample(((h - 1) * w + xx) * 4); }
    for (let yy = 0; yy < h; yy += 4) { sample(yy * w * 4); sample((yy * w + w - 1) * 4); }
    br /= n; bg /= n; bb /= n; ba /= n;
    const transparent = ba < 40; // Bild hat schon echten transparenten Hintergrund (z. B. OpenAI)
    const bgLum = (0.299 * br + 0.587 * bg + 0.114 * bb) / 255;

    if (ink !== 'original') {
      // Einfarbiger Siebdruck: Deckkraft = Abstand zur Hintergrundhelligkeit
      for (let i = 0; i < d.length; i += 4) {
        const L = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
        let a;
        if (transparent) {
          // Freigestellte Motive: Weiß druckt helle, Schwarz dunkle Bereiche, Gold die ganze Form
          a = ink === 'gold' ? 1 : Math.max(0, Math.min(1, ((ink === 'white' ? L : 1 - L) - 0.12) * 1.5));
        } else {
          a = Math.abs(L - bgLum) / Math.max(0.35, Math.max(bgLum, 1 - bgLum));
          a = Math.max(0, Math.min(1, (a - 0.08) * 1.6));
        }
        d[i + 3] = Math.round(a * (d[i + 3] / 255) * 255);
        const v = Math.round(255 * (0.55 + 0.45 * (transparent || bgLum > 0.5 ? 1 - L : L)));
        d[i] = d[i + 1] = d[i + 2] = v;
      }
      x.putImageData(id, 0, 0);
      const out = document.createElement('canvas');
      out.width = w; out.height = h;
      const o = out.getContext('2d');
      if (ink === 'gold') {
        const g = o.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, '#f7e5a6'); g.addColorStop(0.3, '#c9a55c'); g.addColorStop(0.5, '#7f5e24');
        g.addColorStop(0.7, '#e9cf86'); g.addColorStop(1, '#a37d36');
        o.fillStyle = g;
      } else o.fillStyle = ink === 'white' ? '#f4f1ea' : '#0c0b0b';
      o.fillRect(0, 0, w, h);
      o.globalCompositeOperation = 'destination-in';
      o.drawImage(c, 0, 0);
      if (ink === 'gold') { o.globalCompositeOperation = 'soft-light'; o.globalAlpha = 0.6; o.drawImage(c, 0, 0); o.globalCompositeOperation = 'destination-in'; o.globalAlpha = 1; o.drawImage(c, 0, 0); }
      motifCache.set(key, out);
      return out;
    }

    if (removeBg && !transparent) {
      // Flutfüllung vom Rand aus: nur zusammenhängender Hintergrund wird entfernt
      const t2 = tol * tol, soft = (tol * 1.6) ** 2;
      const seen = new Uint8Array(w * h);
      const stack = [];
      const dist = (p) => { const i = p * 4; const dr = d[i] - br, dg = d[i + 1] - bg, db = d[i + 2] - bb; return dr * dr + dg * dg + db * db; };
      const push = (p) => { if (!seen[p]) { seen[p] = 1; stack.push(p); } };
      for (let xx = 0; xx < w; xx++) { push(xx); push((h - 1) * w + xx); }
      for (let yy = 0; yy < h; yy++) { push(yy * w); push(yy * w + w - 1); }
      while (stack.length) {
        const p = stack.pop();
        const ds = dist(p);
        if (ds > soft) continue;
        d[p * 4 + 3] = ds <= t2 ? 0 : Math.round(255 * (ds - t2) / (soft - t2));
        if (ds > t2) continue;
        const px = p % w, py = (p / w) | 0;
        if (px > 0) push(p - 1);
        if (px < w - 1) push(p + 1);
        if (py > 0) push(p - w);
        if (py < h - 1) push(p + w);
      }
      x.putImageData(id, 0, 0);
    }
    motifCache.set(key, c);
    return c;
  }

  // ---------- Zeichnen ----------
  function getDef(piece) {
    const g = GARMENTS[piece.garment] || GARMENTS.tee;
    const view = piece.placement === 'back' && g.back ? 'back' : 'front';
    return { g, view, def: g[view] || g.front };
  }

  function render(canvas, piece, motifImg) {
    const ctx = canvas.getContext('2d');
    const S = canvas.width / 1000;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Studio-Hintergrund
    const bgG = ctx.createRadialGradient(canvas.width / 2, canvas.height * 0.42, 50, canvas.width / 2, canvas.height / 2, canvas.width * 0.75);
    bgG.addColorStop(0, '#2b2218'); bgG.addColorStop(0.55, '#120e0a'); bgG.addColorStop(1, '#050403');
    ctx.fillStyle = bgG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(S, 0, 0, S, 0, 0);

    const { g, view, def } = getDef(piece);
    const color = piece.color || '#0b0b0c';
    const lum = luminance(color);
    const body = P(def.body);
    const parts = [body];

    // Henkel (Tasche) hinter dem Körper
    if (def.handles) {
      ctx.save(); ctx.lineCap = 'round';
      for (const h of def.handles) {
        ctx.strokeStyle = shade(color, -0.25); ctx.lineWidth = 40; ctx.stroke(P(h));
        ctx.strokeStyle = color; ctx.lineWidth = 32; ctx.stroke(P(h));
      }
      ctx.restore();
    }
    // Schatten + Körper
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = 50 * S; ctx.shadowOffsetY = 24 * S;
    ctx.fillStyle = color; ctx.fill(body);
    ctx.restore();
    ctx.fillStyle = color; ctx.fill(body);
    if (def.inner) { ctx.fillStyle = shade(color, lum < 0.25 ? -0.5 : -0.3); ctx.fill(P(def.inner)); }

    // Motiv
    if (motifImg) {
      const pos = g.place[piece.placement] || g.place.chest;
      const scale = piece.scale || 1;
      const mw = pos[2] * scale;
      const mh = mw * (motifImg.height / motifImg.width);
      const cx = pos[0] + (piece.dx || 0), cy = pos[1] + (piece.dy || 0);
      ctx.save();
      ctx.clip(body);
      ctx.globalAlpha = 0.97;
      if (piece.ink === 'original' && lum > 0.75 && !piece.removeBg) ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(motifImg, cx - mw / 2, cy - mh / 2, mw, mh);
      ctx.restore();
    }

    // Kapuze hinten bzw. vorne (über dem Motiv)
    if (def.hoodBack) { const hb = P(def.hoodBack); ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 24 * S; ctx.shadowOffsetY = 10 * S; ctx.fillStyle = shade(color, lum < 0.3 ? 0.05 : -0.04); ctx.fill(hb); ctx.restore(); parts.push(hb); }

    if (def.hood) {
      const hood = P(def.hood);
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 26 * S; ctx.shadowOffsetY = 12 * S;
      ctx.fillStyle = shade(color, lum < 0.3 ? 0.04 : -0.02); ctx.fill(hood); ctx.restore();
      ctx.fillStyle = shade(color, lum < 0.25 ? -0.55 : -0.35); ctx.fill(P(def.hoodInner));
      parts.push(hood);
    }

    // Stoff: Struktur + Licht + Falten (nur auf dem Kleidungsstück)
    const all = new Path2D();
    for (const p of parts) all.addPath(p);
    ctx.save();
    ctx.clip(all);
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = lum < 0.2 ? 0.16 : 0.1;
    ctx.fillStyle = noise(ctx);
    ctx.fillRect(0, 0, 1000, 1000);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    const side = ctx.createLinearGradient(30, 0, 970, 0);
    side.addColorStop(0, 'rgba(0,0,0,0.38)'); side.addColorStop(0.22, 'rgba(0,0,0,0)'); side.addColorStop(0.78, 'rgba(0,0,0,0)'); side.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = side; ctx.fillRect(0, 0, 1000, 1000);
    const vert = ctx.createLinearGradient(0, 100, 0, 960);
    vert.addColorStop(0, 'rgba(255,255,255,0.05)'); vert.addColorStop(0.6, 'rgba(0,0,0,0)'); vert.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = vert; ctx.fillRect(0, 0, 1000, 1000);
    const hi = ctx.createRadialGradient(470, 330, 10, 470, 330, 420);
    hi.addColorStop(0, lum < 0.3 ? 'rgba(255,240,210,0.10)' : 'rgba(255,255,255,0.14)'); hi.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = hi; ctx.fillRect(0, 0, 1000, 1000);
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';
    for (const f of def.folds || []) {
      ctx.filter = `blur(${10 * S}px)`;
      ctx.strokeStyle = `rgba(0,0,0,${lum < 0.35 ? 0.28 : 0.1})`; ctx.lineWidth = 26; ctx.stroke(P(f));
      ctx.save(); ctx.translate(-14, -6);
      ctx.strokeStyle = lum < 0.3 ? 'rgba(255,240,215,0.05)' : 'rgba(255,255,255,0.12)'; ctx.lineWidth = 16; ctx.stroke(P(f));
      ctx.restore();
      ctx.filter = 'none';
    }
    ctx.restore();

    // Nähte, Bündchen, Tasche, Kordeln
    const seamCol = lum < 0.3 ? 'rgba(255,245,225,0.10)' : 'rgba(0,0,0,0.22)';
    const stitch = lum < 0.3 ? 'rgba(255,245,225,0.14)' : 'rgba(0,0,0,0.18)';
    ctx.save(); ctx.clip(all); ctx.lineCap = 'round';
    for (const s of def.seams || []) { ctx.strokeStyle = seamCol; ctx.lineWidth = 3; ctx.stroke(P(s)); }
    ctx.setLineDash([7, 6]);
    for (const s of def.ribs || []) { ctx.strokeStyle = stitch; ctx.lineWidth = 2.5; ctx.stroke(P(s)); }
    ctx.setLineDash([]);
    if (def.pocket) {
      const pk = P(def.pocket);
      ctx.strokeStyle = seamCol; ctx.lineWidth = 3.5; ctx.stroke(pk);
      ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fill(pk);
    }
    ctx.restore();
    if (def.rib) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = shade(color, lum < 0.3 ? 0.08 : -0.12); ctx.lineWidth = 16; ctx.stroke(P(def.rib));
      ctx.strokeStyle = stitch; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
      ctx.save(); ctx.translate(0, 10); ctx.stroke(P(def.rib)); ctx.restore(); ctx.setLineDash([]);
    }
    if (def.strings) {
      ctx.lineCap = 'round';
      for (const s of def.strings) {
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 10; ctx.save(); ctx.translate(3, 4); ctx.stroke(P(s)); ctx.restore();
        ctx.strokeStyle = lum < 0.3 ? '#cdbb92' : shade(color, -0.3); ctx.lineWidth = 7; ctx.stroke(P(s));
      }
      ctx.fillStyle = '#b8964f';
      ctx.fillRect(449, 410, 14, 30); ctx.fillRect(538, 400, 14, 30);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function hitBox(piece, motifImg) {
    const { g } = getDef(piece);
    const pos = g.place[piece.placement] || g.place.chest;
    const mw = pos[2] * (piece.scale || 1);
    const mh = motifImg ? mw * (motifImg.height / motifImg.width) : mw;
    return { x: pos[0] + (piece.dx || 0) - mw / 2, y: pos[1] + (piece.dy || 0) - mh / 2, w: mw, h: mh };
  }

  return { GARMENTS, PLACEMENTS, FABRIC_COLORS, render, prepareMotif, hitBox, luminance };
})();

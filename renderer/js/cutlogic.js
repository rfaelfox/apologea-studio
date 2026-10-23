// Schnitt-Logik für den Video-Cutter (ohne Oberfläche, damit sie testbar bleibt)
const CutLogic = (() => {
  const FILLERS = new Set(['äh', 'ähm', 'ähh', 'öhm', 'öh', 'hm', 'hmm', 'mhm', 'ehm', 'em', 'eh', 'uh', 'um', 'uhm', 'erm', 'ah']);
  const norm = (w) => String(w).toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

  // Füllwörter, doppelte Wörter und Neuanfänge markieren (die frühere Fassung fliegt raus)
  function autoMark(words) {
    for (const w of words) if (w.reason === 'auto') { w.remove = false; w.reason = null; }
    const n = words.map((w) => norm(w.word));
    for (let i = 0; i < words.length; i++) {
      if (FILLERS.has(n[i])) { mark(words[i]); continue; }
    }
    // Wiederholte Wortgruppen (1–4 Wörter) direkt hintereinander: die erste Fassung entfernen
    for (let size = 4; size >= 1; size--) {
      for (let i = 0; i + 2 * size <= words.length; i++) {
        let same = true;
        for (let k = 0; k < size; k++) if (!n[i + k] || n[i + k] !== n[i + size + k]) { same = false; break; }
        if (!same) continue;
        if (words[i + size].start - words[i + size - 1].end > 2.5) continue; // weit auseinander = gewollt
        for (let k = 0; k < size; k++) mark(words[i + k]);
      }
    }
    // Abgebrochene Wörter wie "Kollek- Kollektion"
    for (let i = 0; i + 1 < words.length; i++) {
      const a = String(words[i].word);
      if (/[-–]$/.test(a) && n[i + 1].startsWith(n[i]) && n[i].length >= 2) mark(words[i]);
    }
    return words;
    function mark(w) { if (!w.remove) { w.remove = true; w.reason = 'auto'; } }
  }

  // Behaltene Bereiche aus Wörtern + Stille berechnen
  function buildSegments(words, { duration, maxPause = 0.35, padBefore = 0.08, padAfter = 0.15, silences = [], env = null, fps = 0 }) {
    const segs = [];
    let cur = null;
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w.remove) { if (cur) { segs.push(cur); cur = null; } continue; }
      const s = Math.max(0, w.start - padBefore), e = Math.min(duration || Infinity, w.end + padAfter);
      if (cur && w.start - words[i - 1].end <= maxPause && !words[i - 1].remove) cur[1] = Math.max(cur[1], e);
      else { if (cur) segs.push(cur); cur = [s, e]; }
    }
    if (cur) segs.push(cur);
    // Lange Stillen innerhalb der Bereiche zusätzlich herausschneiden
    let out = segs;
    for (const [a, b] of silences) {
      if (b - a <= maxPause + padBefore + padAfter) continue;
      const ca = a + padAfter, cb = b - padBefore;
      const next = [];
      for (const [s, e] of out) {
        if (cb <= s || ca >= e) { next.push([s, e]); continue; }
        if (ca > s) next.push([s, ca]);
        if (cb < e) next.push([cb, e]);
      }
      out = next;
    }
    // Überlappungen zusammenführen, Mini-Schnipsel entfernen
    out.sort((x, y) => x[0] - y[0]);
    const merged = [];
    for (const s of out) {
      const last = merged[merged.length - 1];
      if (last && s[0] <= last[1] + 0.02) last[1] = Math.max(last[1], s[1]);
      else merged.push([...s]);
    }
    // Polster und Verschieben dürfen nie in ein rausgeschnittenes Wort ragen
    const removed = words.filter((w) => w.remove);
    const clampOut = (list) => list.map(([s, e]) => {
      const mid = (s + e) / 2;
      for (const r of removed) {
        if (r.start >= e || r.end <= s) continue;
        if (r.end <= mid) s = Math.max(s, r.end); else e = Math.min(e, r.start);
      }
      return [s, e];
    });
    let res = clampOut(merged).filter(([s, e]) => e - s >= 0.12);
    if (env && env.length) res = clampOut(snapToQuiet(res, env, duration));
    // Auf das Bildraster legen, damit Bild und Ton auch nach vielen Schnitten synchron bleiben
    if (fps > 0) res = res.map(([s, e]) => [Math.round(s * fps) / fps, Math.round(e * fps) / fps]).filter(([s, e]) => e > s);
    return res.map(([s, e]) => [round(s), round(e)]);
  }

  // Schnittpunkte nur nach außen in die leiseste Stelle schieben (Hüllkurve mit 100 Werten pro Sekunde),
  // so wird nie in ein Wort hineingeschnitten und es knackt nicht
  function snapToQuiet(segs, env, duration) {
    const at = (t) => env[Math.max(0, Math.min(env.length - 1, Math.round(t * 100)))];
    const quietest = (from, to, prefer) => {
      let best = prefer, bestV = at(prefer) * 0.9; // leichte Vorliebe für den ursprünglichen Punkt
      for (let t = from; t <= to + 1e-9; t += 0.01) { const v = at(t); if (v < bestV) { bestV = v; best = t; } }
      return best;
    };
    const out = segs.map((x) => [...x]);
    for (let i = 0; i < out.length; i++) {
      const prevEnd = i > 0 ? out[i - 1][1] : 0;
      const nextStart = i + 1 < out.length ? out[i + 1][0] : (duration || out[i][1] + 0.1);
      out[i][0] = quietest(Math.max(prevEnd, out[i][0] - 0.1), out[i][0], out[i][0]);
      out[i][1] = quietest(out[i][1], Math.min(nextStart, out[i][1] + 0.1), out[i][1]);
    }
    return out;
  }
  const round = (x) => Math.round(x * 1000) / 1000;

  // Zeit im Original -> Zeit im geschnittenen Video
  function timeMapper(segs) {
    const offs = [];
    let acc = 0;
    for (const [s, e] of segs) { offs.push(acc); acc += e - s; }
    const fn = (t) => {
      for (let i = 0; i < segs.length; i++) {
        const [s, e] = segs[i];
        if (t < s) return offs[i];
        if (t <= e) return offs[i] + (t - s);
      }
      return acc;
    };
    fn.total = acc;
    return fn;
  }

  // ---------- Untertitel (ASS) ----------
  const STYLES = {
    apologea: { label: 'Apologea Gold', font: 'Cinzel', bold: 1, size: 92, primary: '#F4E7C6', hi: '#D9B45A', outline: '#000000', outlineW: 6, shadow: 3, box: false },
    tiktok: { label: 'TikTok Klassik', font: 'Anton', bold: 0, size: 104, primary: '#FFFFFF', hi: '#FFE14D', outline: '#000000', outlineW: 7, shadow: 2, box: false },
    clean: { label: 'Clean Box', font: 'Montserrat', bold: 1, size: 70, primary: '#FFFFFF', hi: '#E8C36A', outline: '#0B0907', outlineW: 14, shadow: 0, box: true },
  };
  const assColor = (hex, alpha = 0) => {
    const h = hex.replace('#', '');
    return `&H${alpha.toString(16).padStart(2, '0').toUpperCase()}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase();
  };
  const assTime = (t) => {
    t = Math.max(0, t);
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60), cs = Math.floor((t * 100) % 100);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  };
  const clean = (w) => String(w).replace(/[{}\\]/g, '').replace(/[.,;:]+$/, '').trim();

  // Wörter in Untertitel-Häppchen teilen: max. perChunk Wörter, Satzzeichen beenden ein Häppchen
  function captionChunks(words, map, perChunk, upper) {
    const kept = words.filter((w) => !w.remove && clean(w.word)).map((w) => ({ text: clean(upper ? w.word.toUpperCase() : w.word), s: map(w.start), e: map(w.end), raw: w.word }));
    const chunks = [];
    let cur = [];
    kept.forEach((w, i) => {
      if (cur.length && (cur.length >= perChunk || w.s - cur[cur.length - 1].e > 0.6)) { chunks.push(cur); cur = []; }
      cur.push(w);
      if (/[.!?,;:]$/.test(String(w.raw).trim()) || i === kept.length - 1) { chunks.push(cur); cur = []; }
    });
    if (cur.length) chunks.push(cur);
    return chunks;
  }

  // Untertitel als SRT-Datei (z. B. für CapCut: dort werden sie zu bearbeitbaren Textebenen)
  function buildSrt(words, segs, { perChunk = 3, upper = true } = {}) {
    const map = timeMapper(segs);
    const chunks = captionChunks(words, map, perChunk, upper);
    const ts = (t) => {
      const ms = Math.max(0, Math.round(t * 1000));
      const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
    };
    return chunks.map((ch, i) => {
      const next = chunks[i + 1];
      const end = Math.min(ch[ch.length - 1].e + 0.35, next ? next[0].s : Infinity);
      return `${i + 1}\n${ts(ch[0].s)} --> ${ts(end)}\n${ch.map((w) => w.text).join(' ')}\n`;
    }).join('\n');
  }

  function buildAss(words, segs, { width, height, style = 'apologea', perChunk = 3, upper = true, pos = 'mid', sizePct = 100, hook = '' }) {
    const st = STYLES[style] || STYLES.apologea;
    const map = timeMapper(segs);
    const scale = Math.min(width, height) / 1080;
    const size = Math.round(st.size * scale * sizePct / 100);
    const align = pos === 'high' ? 8 : pos === 'low' ? 2 : 5;
    const marginV = Math.round((pos === 'mid' ? 0 : pos === 'low' ? 360 : 260) * height / 1920);
    const out = [];
    out.push('[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${width}`, `PlayResY: ${height}`, 'WrapStyle: 0', 'ScaledBorderAndShadow: yes', '',
      '[V4+ Styles]',
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
      `Style: Cap,${st.font},${size},${assColor(st.primary)},${assColor(st.hi)},${assColor(st.outline)},${assColor('#000000', 0x60)},${st.bold ? -1 : 0},0,0,0,100,100,${st.font === 'Cinzel' ? 2 : 1},0,${st.box ? 3 : 1},${Math.round(st.outlineW * scale)},${Math.round(st.shadow * scale)},${align},${Math.round(80 * scale)},${Math.round(80 * scale)},${marginV},1`,
      `Style: Hook,${STYLES.apologea.font},${Math.round(84 * scale)},${assColor('#F4E7C6')},${assColor('#D9B45A')},${assColor('#000000')},${assColor('#000000', 0x40)},-1,0,0,0,100,100,2,0,3,${Math.round(18 * scale)},0,8,${Math.round(90 * scale)},${Math.round(90 * scale)},${Math.round(220 * height / 1920)},1`,
      '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text');
    if (hook && hook.trim()) {
      out.push(`Dialogue: 1,${assTime(0)},${assTime(Math.min(3, map.total))},Hook,,0,0,0,,{\\fad(150,250)\\3c${assColor('#0B0907')}}${clean(upper ? hook.toUpperCase() : hook)}`);
    }
    const chunks = captionChunks(words, map, perChunk, upper);
    const hi = assColor(st.hi), base = assColor(st.primary);
    chunks.forEach((ch, ci) => {
      const next = chunks[ci + 1];
      const chunkEnd = Math.min(ch[ch.length - 1].e + 0.35, next ? next[0].s : Infinity);
      ch.forEach((w, k) => {
        const s = k === 0 ? ch[0].s : w.s;
        const e = k + 1 < ch.length ? ch[k + 1].s : chunkEnd;
        if (e - s < 0.02) return;
        const pop = k === 0 ? '{\\fscx86\\fscy86\\t(0,90,\\fscx100\\fscy100)}' : '';
        const text = ch.map((x, j) => (j === k ? `{\\c${hi}\\fscx108\\fscy108}${x.text}{\\c${base}\\fscx100\\fscy100}` : x.text)).join(' ');
        out.push(`Dialogue: 0,${assTime(s)},${assTime(e)},Cap,,0,0,0,,${pop}${text}`);
      });
    });
    return out.join('\n') + '\n';
  }

  // ---------- FFmpeg-Filter ----------
  const even = (x) => Math.max(2, Math.round(x / 2) * 2);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  // Ausgabegröße: "hd" = TikTok 1080×1920, "max" = so viel Auflösung wie das Original hergibt (höchstens 4K)
  function outputSize(info, format = 'fill', quality = 'hd') {
    const w = info.width, h = info.height;
    if (format === 'orig') {
      const k = quality === 'max' ? Math.min(1, 3840 / Math.max(w, h)) : Math.min(1, 1080 / Math.min(w, h));
      return [even(w * k), even(h * k)];
    }
    if (quality !== 'max') return [1080, 1920];
    const H = even(clamp(format === 'fill' ? Math.min(h, (w * 16) / 9) : Math.max(h, (w * 16) / 9), 1920, 3840));
    return [even((H * 9) / 16), H];
  }

  // overlays: [{kind:'watermark'} | {kind:'insert', start, duration, mode:'full'|'card', iw, ih, ai}]
  // in derselben Reihenfolge wie die Bild-Eingaben (ab Eingang 1). Bilder kommen als Einzelbild und werden hier animiert.
  function buildFilter(info, segs, {
    format = 'fill', quality = 'hd', jumpZoom = true, colorPop = true, audioNorm = true, denoise = true,
    kenBurns = true, subtitles = true, overlays = [],
  }) {
    const fps = Math.min(60, Math.max(24, Math.round(info.fps || 30)));
    const [W, H] = outputSize(info, format, quality);
    const SC = ':flags=lanczos';
    const N = segs.length;
    const L = [];
    // Größe des Bildes innerhalb von 9:16 beim unscharfen Rand
    let fgW = W, fgH = H;
    if (format === 'blur') {
      if (info.width / info.height > W / H) fgH = even((W * info.height) / info.width);
      else fgW = even((H * info.width) / info.height);
    }
    const fit = format === 'fill' ? `scale=${W}:${H}:force_original_aspect_ratio=increase${SC},crop=${W}:${H}`
      : format === 'blur' ? `scale=${fgW}:${fgH}${SC}` : `scale=${W}:${H}${SC}`;

    const vIn = Array.from({ length: N }, (_, i) => `vs${i}`), aIn = Array.from({ length: N }, (_, i) => `as${i}`);
    L.push(N > 1 ? `[0:V:0]split=${N}${vIn.map((x) => `[${x}]`).join('')}` : `[0:V:0]null[vs0]`); // V = ohne eingebettete Vorschaubilder
    if (info.hasAudio) L.push(N > 1 ? `[0:a:0]asplit=${N}${aIn.map((x) => `[${x}]`).join('')}` : `[0:a:0]anull[as0]`);
    segs.forEach(([s, e], i) => {
      const zoom = jumpZoom && i % 2 === 1 ? 'crop=w=trunc(iw/1.12/2)*2:h=trunc(ih/1.12/2)*2,' : '';
      L.push(`[vs${i}]trim=start=${s}:end=${e},setpts=PTS-STARTPTS,${zoom}${fit},setsar=1,fps=${fps}[v${i}]`);
      if (info.hasAudio) {
        const len = Math.max(0.05, e - s);
        L.push(`[as${i}]atrim=start=${s}:end=${e},asetpts=PTS-STARTPTS,afade=t=in:d=0.015,afade=t=out:st=${Math.max(0, len - 0.025).toFixed(3)}:d=0.025[a${i}]`);
      }
    });
    const pairs = segs.map((_, i) => (info.hasAudio ? `[v${i}][a${i}]` : `[v${i}]`)).join('');
    L.push(`${pairs}concat=n=${N}:v=1:a=${info.hasAudio ? 1 : 0}${info.hasAudio ? '[cv][ca]' : '[cv]'}`);

    let last = 'cv';
    // HDR (HLG/PQ) in normale Farben umrechnen, sonst wirkt das Video blass
    if (info.hdr) {
      const tin = info.hdr === 'pq' ? 'smpte2084' : 'arib-std-b67';
      L.push(`[${last}]zscale=tin=${tin}:min=bt2020nc:pin=bt2020:rin=tv:t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=mobius:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p[sdr]`);
      last = 'sdr';
    }
    if (format === 'blur') {
      const bw = even(W / 4), bh = even(H / 4);
      L.push(`[${last}]split[bga][fga]`);
      L.push(`[bga]scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh},boxblur=10:2,scale=${W}:${H},eq=brightness=-0.08,setsar=1[bg]`);
      L.push(`[bg][fga]overlay=(W-w)/2:(H-h)/2,setsar=1[fmt]`);
      last = 'fmt';
    }
    if (colorPop) { L.push(`[${last}]eq=contrast=1.06:saturation=1.18,unsharp=5:5:0.35[pop]`); last = 'pop'; }

    let insertNo = 0;
    overlays.forEach((o, i) => {
      const inp = `${i + 1}:v`;
      const tag = `ov${i}`, outTag = `b${i}`;
      if (o.kind === 'watermark') {
        const ww = Math.round(W * 0.22);
        L.push(`[${inp}]scale=${ww}:-1${SC},format=rgba,colorchannelmixer=aa=0.9[${tag}]`);
        L.push(`[${last}][${tag}]overlay=W-w-${Math.round(W * 0.05)}:${Math.round(H * 0.04)}:shortest=1[${outTag}]`);
        last = outTag;
        return;
      }
      const st = o.start.toFixed(3), en = (o.start + o.duration).toFixed(3);
      const D = Math.max(2, Math.round(o.duration * fps));
      // Zielgröße: Vollbild oder Karte (Seitenverhältnis des Bildes bleibt)
      let tw = W, th = H;
      if (o.mode !== 'full') {
        const bw = W * 0.78, bh = H * 0.36, ar = (o.iw || 1) / (o.ih || 1);
        if (ar > bw / bh) { tw = even(bw); th = even(bw / ar); } else { th = even(bh); tw = even(bh * ar); }
      }
      // Ken-Burns: abwechselnd langsam hinein- und herauszoomen. Das Bild wird vorher größer gerechnet, damit es nicht ruckelt.
      const k = tw * th > 4e6 ? 1.5 : 2;
      const sw = even(tw * k), sh = even(th * k);
      const z = kenBurns ? (insertNo % 2 === 0 ? `1+0.08*on/${D}` : `1.08-0.08*on/${D}`) : '1';
      insertNo++;
      let chain = `[${inp}]scale=${sw}:${sh}:force_original_aspect_ratio=increase${SC},crop=${sw}:${sh},setsar=1,`
        + `zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${D}:s=${tw}x${th}:fps=${fps}`;
      if (o.ai) chain += ',noise=alls=6:allf=t'; // feines Filmkorn: KI-Bilder passen besser zum echten Video
      if (o.mode !== 'full') {
        const b = Math.max(2, Math.round(W * 0.004));
        chain += `,pad=${tw + 2 * b}:${th + 2 * b}:${b}:${b}:color=0xD9B45A`;
      }
      const fo = Math.max(0, o.duration - 0.2).toFixed(3);
      chain += `,format=rgba,fade=t=in:st=0:d=0.2:alpha=1,fade=t=out:st=${fo}:d=0.2:alpha=1,setpts=PTS-STARTPTS+${st}/TB[${tag}]`;
      L.push(chain);
      const y = o.mode === 'full' ? '0' : `${Math.round(H * 0.1)}`; // Karte endet über den Untertiteln in der Mitte
      L.push(`[${last}][${tag}]overlay=(W-w)/2:${y}:enable='between(t,${st},${en})':eof_action=pass[${outTag}]`);
      last = outTag;
    });
    L.push(subtitles ? `[${last}]subtitles=subs.ass:fontsdir=fonts,format=yuv420p[vout]` : `[${last}]format=yuv420p[vout]`);
    if (info.hasAudio) {
      const total = segs.reduce((x, [s, e]) => x + e - s, 0);
      const a = ['aresample=48000'];
      // afftdn verzögert den Ton um 25 ms – das wird direkt wieder abgeschnitten, damit die Lippen synchron bleiben
      if (denoise) a.push('highpass=f=70', 'afftdn=nr=10:nf=-40:tn=1', 'atrim=start=0.025', 'asetpts=PTS-STARTPTS');
      if (audioNorm) a.push('loudnorm=I=-14:TP=-1.5:LRA=11', 'aresample=48000');
      a.push('apad', `atrim=end=${total.toFixed(3)}`);
      L.push(`[ca]${a.join(',')}[aout]`);
    }
    return { filter: L.join(';\n'), width: W, height: H, fps };
  }

  return { autoMark, buildSegments, timeMapper, buildAss, buildSrt, buildFilter, outputSize, STYLES, FILLERS };
})();
if (typeof module !== 'undefined') module.exports = CutLogic;

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
  function buildSegments(words, { duration, maxPause = 0.35, padBefore = 0.08, padAfter = 0.12, silences = [] }) {
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
    return merged.filter(([s, e]) => e - s >= 0.12).map(([s, e]) => [round(s), round(e)]);
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
    const kept = words.filter((w) => !w.remove && clean(w.word)).map((w) => ({ text: clean(upper ? w.word.toUpperCase() : w.word), s: map(w.start), e: map(w.end), raw: w.word }));
    // In Häppchen teilen: max. perChunk Wörter, Satzzeichen beenden ein Häppchen
    const chunks = [];
    let cur = [];
    kept.forEach((w, i) => {
      if (cur.length && (cur.length >= perChunk || w.s - cur[cur.length - 1].e > 0.6)) { chunks.push(cur); cur = []; }
      cur.push(w);
      if (/[.!?,;:]$/.test(String(w.raw).trim()) || i === kept.length - 1) { chunks.push(cur); cur = []; }
    });
    if (cur.length) chunks.push(cur);
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
  // overlays: [{kind:'watermark'} | {kind:'insert', start, duration, mode:'full'|'card'}] in derselben Reihenfolge wie die Bild-Eingaben (ab Eingang 1)
  function buildFilter(info, segs, { format = 'fill', jumpZoom = true, colorPop = true, audioNorm = true, subtitles = true, overlays = [] }) {
    const W0 = Math.round(info.width / 2) * 2, H0 = Math.round(info.height / 2) * 2;
    const fps = Math.min(60, Math.max(24, Math.round(info.fps || 30)));
    const N = segs.length;
    const L = [];
    const vIn = Array.from({ length: N }, (_, i) => `vs${i}`), aIn = Array.from({ length: N }, (_, i) => `as${i}`);
    L.push(N > 1 ? `[0:v]split=${N}${vIn.map((x) => `[${x}]`).join('')}` : `[0:v]null[vs0]`);
    if (info.hasAudio) L.push(N > 1 ? `[0:a]asplit=${N}${aIn.map((x) => `[${x}]`).join('')}` : `[0:a]anull[as0]`);
    segs.forEach(([s, e], i) => {
      const zoom = jumpZoom && i % 2 === 1 ? 'crop=w=trunc(iw/1.12/2)*2:h=trunc(ih/1.12/2)*2,' : '';
      L.push(`[vs${i}]trim=start=${s}:end=${e},setpts=PTS-STARTPTS,${zoom}scale=${W0}:${H0},setsar=1,fps=${fps}[v${i}]`);
      if (info.hasAudio) {
        const len = Math.max(0.05, e - s);
        L.push(`[as${i}]atrim=start=${s}:end=${e},asetpts=PTS-STARTPTS,afade=t=in:d=0.012,afade=t=out:st=${(len - 0.02).toFixed(3)}:d=0.02[a${i}]`);
      }
    });
    const pairs = segs.map((_, i) => (info.hasAudio ? `[v${i}][a${i}]` : `[v${i}]`)).join('');
    L.push(`${pairs}concat=n=${N}:v=1:a=${info.hasAudio ? 1 : 0}${info.hasAudio ? '[cv][ca]' : '[cv]'}`);

    let W = W0, H = H0;
    let chain = '[cv]';
    if (format === 'fill') { W = 1080; H = 1920; L.push(`${chain}scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[fmt]`); }
    else if (format === 'blur') {
      W = 1080; H = 1920;
      L.push(`${chain}split[bga][fga]`);
      L.push(`[bga]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24:2,eq=brightness=-0.08[bg]`);
      L.push(`[fga]scale=1080:1920:force_original_aspect_ratio=decrease,setsar=1[fg]`);
      L.push(`[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[fmt]`);
    } else L.push(`${chain}null[fmt]`);
    let last = 'fmt';
    if (colorPop) { L.push(`[${last}]eq=contrast=1.06:saturation=1.18,unsharp=5:5:0.4[pop]`); last = 'pop'; }

    overlays.forEach((o, i) => {
      const inp = `${i + 1}:v`;
      const tag = `ov${i}`, outTag = `b${i}`;
      if (o.kind === 'watermark') {
        const ww = Math.round(W * 0.22);
        L.push(`[${inp}]scale=${ww}:-1,format=rgba,colorchannelmixer=aa=0.9[${tag}]`);
        L.push(`[${last}][${tag}]overlay=W-w-${Math.round(W * 0.05)}:${Math.round(H * 0.04)}:shortest=1[${outTag}]`);
      } else {
        const st = o.start.toFixed(3), en = (o.start + o.duration).toFixed(3);
        if (o.mode === 'full') L.push(`[${inp}]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},format=rgba,fade=t=in:st=0:d=0.15:alpha=1,setpts=PTS-STARTPTS+${st}/TB[${tag}]`);
        else L.push(`[${inp}]scale=${Math.round(W * 0.78)}:${Math.round(H * 0.42)}:force_original_aspect_ratio=decrease,format=rgba,fade=t=in:st=0:d=0.15:alpha=1,setpts=PTS-STARTPTS+${st}/TB[${tag}]`);
        const y = o.mode === 'full' ? '0' : `${Math.round(H * 0.14)}`;
        L.push(`[${last}][${tag}]overlay=(W-w)/2:${y}:enable='between(t,${st},${en})':eof_action=pass[${outTag}]`);
      }
      last = outTag;
    });
    L.push(subtitles ? `[${last}]subtitles=subs.ass:fontsdir=fonts[vout]` : `[${last}]null[vout]`);
    if (info.hasAudio) L.push(audioNorm ? `[ca]dynaudnorm=f=200:g=15:p=0.9[aout]` : `[ca]anull[aout]`);
    return { filter: L.join(';\n'), width: W, height: H };
  }

  return { autoMark, buildSegments, timeMapper, buildAss, buildFilter, STYLES, FILLERS };
})();
if (typeof module !== 'undefined') module.exports = CutLogic;

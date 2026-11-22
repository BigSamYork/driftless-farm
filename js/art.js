// Canvas artwork for the farm scene and threshing day.
const Art = (() => {
  const W = 960, H = 540;
  const pr = (i) => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
  const PAL = {
    spring: { sky: ['#8ccbf0', '#eaf6fb'], far: '#8db98a', mid: '#6fa564', near: '#7fb064', trees: ['#78b553', '#8cc463', '#6aa64a'], ground: '#86b55e', pasture: '#8fc265' },
    summer: { sky: ['#4fa5e3', '#d4edf9'], far: '#6c9f6a', mid: '#4f8a49', near: '#5e9a48', trees: ['#3f7f36', '#4c8d3a', '#356f2e'], ground: '#6aa04a', pasture: '#74ad4f' },
    fall:   { sky: ['#e9a96c', '#fbe6c8'], far: '#a98a5f', mid: '#9a7a45', near: '#a99350', trees: ['#c8532b', '#e0a030', '#b8462a', '#d98d2b', '#8f6a2a'], ground: '#b19a55', pasture: '#a7a256' },
    winter: { sky: ['#8fa3b8', '#e3e9ef'], far: '#cfd8e0', mid: '#e1e7ec', near: '#eef2f5', trees: ['#6b5d52', '#7a6a5d'], ground: '#f2f5f7', pasture: '#eef2f5' },
  };
  const seasonOf = (s) => (s ? ({ spring: 'spring', summer: 'summer', fall: 'fall', winter: 'winter' }[s.phase] || 'spring') : 'summer');

  // ---------- light, materials, and atmosphere ----------
  // One sun for every scene: it stands upper right (the disc at x=780), so lit faces look right and up and shade falls left and low.
  const canPaint = typeof document !== 'undefined';
  const colorCache = new Map();
  function rgbOf(c) {
    if (typeof c !== 'string') return null;
    if (c.startsWith('rgb')) { const v = c.match(/[\d.]+/g); return v && v.length >= 3 ? v.slice(0, 3).map(Number) : null; }
    if (c[0] !== '#') return null;
    let h = c.slice(1);
    if (h.length === 3) h = h.replace(/./g, '$&$&');
    const n = parseInt(h.slice(0, 6), 16);
    return Number.isFinite(n) ? [n >> 16 & 255, n >> 8 & 255, n & 255] : null;
  }
  function mix(a, b, f) {
    const key = `${a}|${b}|${f}`;
    let v = colorCache.get(key);
    if (v === undefined) {
      const A = rgbOf(a), B = rgbOf(b);
      v = A && B ? `rgb(${A.map((x, i) => Math.round(x + (B[i] - x) * f)).join(',')})` : a;
      if (colorCache.size > 5000) colorCache.clear();
      colorCache.set(key, v);
    }
    return v;
  }
  const tone = (c, k) => mix(c, k > 0 ? '#fff6e2' : '#120e0b', Math.abs(k));
  const rgba = (c, a) => { const v = rgbOf(c) || [128, 128, 128]; return `rgba(${v[0]},${v[1]},${v[2]},${a})`; };
  const lum = (c) => { const v = rgbOf(c); return v ? .3 * v[0] + .59 * v[1] + .11 * v[2] : 128; };
  function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  // Painted once, reused every frame.
  const plates = new Map();
  function cached(key, w, h, paint) {
    let c = plates.get(key);
    if (!c) { c = makeCanvas(w, h); paint(c.getContext('2d')); plates.set(key, c); }
    return c;
  }
  // Repeating tiles are painted with wrap-around so their seams cannot show.
  function wrapped(g, w, h, x, y, reach, draw) {
    for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
      const px = x + dx, py = y + dy;
      if (px > -reach && px < w + reach && py > -reach && py < h + reach) draw(px, py);
    }
  }
  const grain = () => cached('grain', 128, 128, g => {
    const img = g.createImageData(128, 128);
    for (let i = 0; i < 128 * 128; i++) {
      const v = pr(i * 1.731 + 11), o = i * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = v > .5 ? 255 : 0;
      img.data[o + 3] = Math.abs(v - .5) * 140;
    }
    g.putImageData(img, 0, 0);
  });
  // Broad, soft light-and-dark patches: the uneven color of real ground, crops, and rock.
  const mottle = () => cached('mottle', 256, 128, g => {
    for (let i = 0; i < 70; i++) {
      const x = pr(i * 4.3 + 2) * 256, y = pr(i * 6.1 + 9) * 128, r = 10 + pr(i + 30) * 26, light = pr(i + 50) > .5, a = .05 + pr(i + 60) * .07;
      wrapped(g, 256, 128, x, y, r, (px, py) => {
        const gr = g.createRadialGradient(px, py, 0, px, py, r);
        gr.addColorStop(0, light ? `rgba(255,246,214,${a})` : `rgba(24,18,6,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(px, py, r * 1.6, r, 0, 0, 7); g.fill();
      });
    }
  });
  const patterns = new WeakMap();
  function patternFor(ctx, key, tile) {
    let m = patterns.get(ctx);
    if (!m) patterns.set(ctx, m = new Map());
    let p = m.get(key);
    if (!p) m.set(key, p = ctx.createPattern(tile(), 'repeat'));
    return p;
  }
  // Small objects (trees, clouds) are painted once at twice their size and stamped.
  const sprites = new Map(), SPRITE_RES = 2;
  function sprite(key, w, h, ox, oy, paint) {
    let s = sprites.get(key);
    if (!s) {
      const c = makeCanvas(w * SPRITE_RES, h * SPRITE_RES), g = c.getContext('2d');
      g.scale(SPRITE_RES, SPRITE_RES); g.translate(ox, oy); paint(g);
      s = { c, w: c.width / SPRITE_RES, h: c.height / SPRITE_RES, ox, oy };
      sprites.set(key, s);
    }
    return s;
  }
  const stamp = (ctx, s, x, y, k = 1) => ctx.drawImage(s.c, x - s.ox * k, y - s.oy * k, s.w * k, s.h * k);
  function contactShadow(ctx, x, y, rx, ry = rx * .16, strength = .42) {
    if (!(rx > 0)) return;
    ctx.save(); ctx.translate(x - rx * .12, y); ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, `rgba(26,19,12,${strength})`); g.addColorStop(.55, `rgba(26,19,12,${strength * .45})`); g.addColorStop(1, 'rgba(26,19,12,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, 7); ctx.fill();
    ctx.restore();
  }
  // Draws one object off-screen, lights it as a whole, then sets it into the scene over a soft contact shadow.
  // The box is the object's reach in the caller's coordinates. Nested objects (a driver on a tractor) are lit with their parent.
  let litCanvas = null, scratch = null, litDepth = 0;
  function lit(ctx, x0, y0, x1, y1, draw, shadow = null) {
    if (litDepth > 0 || !canPaint) { draw(ctx); return; }
    const m = ctx.getTransform(), cw = ctx.canvas.width, ch = ctx.canvas.height;
    let ax = Infinity, ay = Infinity, bx = -Infinity, by = -Infinity;
    for (const [px, py] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
      const dx = m.a * px + m.c * py + m.e, dy = m.b * px + m.d * py + m.f;
      ax = Math.min(ax, dx); ay = Math.min(ay, dy); bx = Math.max(bx, dx); by = Math.max(by, dy);
    }
    // Small figures (livestock, people) already carry their own shading; drawing them directly keeps big herds cheap.
    if ((bx - ax) * (by - ay) < 4600) { if (shadow) contactShadow(ctx, ...shadow); litDepth++; try { draw(ctx); } finally { litDepth--; } return; }
    const left = Math.max(0, Math.floor(ax) - 2), top = Math.max(0, Math.floor(ay) - 2);
    const w = Math.min(cw, Math.ceil(bx) + 2) - left, h = Math.min(ch, Math.ceil(by) + 2) - top;
    litDepth++;
    try {
      if (w <= 0 || h <= 0) {
        // Off-screen: still run the drawing so callers get their return values, but discard the pixels.
        if (!scratch) scratch = makeCanvas(1, 1).getContext('2d');
        scratch.save(); draw(scratch); scratch.restore();
        return;
      }
      if (!litCanvas) litCanvas = makeCanvas(w, h);
      if (litCanvas.width < w || litCanvas.height < h) { litCanvas.width = Math.max(litCanvas.width, w); litCanvas.height = Math.max(litCanvas.height, h); }
      const g = litCanvas.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, w, h);
      g.save(); g.setTransform(m.a, m.b, m.c, m.d, m.e - left, m.f - top);
      try { draw(g); } finally { g.restore(); }
      g.globalCompositeOperation = 'source-atop';
      const v = g.createLinearGradient(0, 0, 0, h);
      v.addColorStop(0, 'rgba(255,238,202,.24)'); v.addColorStop(.4, 'rgba(255,238,202,0)');
      v.addColorStop(.7, 'rgba(34,28,44,.08)'); v.addColorStop(1, 'rgba(26,17,10,.4)');
      g.fillStyle = v; g.fillRect(0, 0, w, h);
      const s = g.createLinearGradient(0, 0, w, 0);
      s.addColorStop(0, 'rgba(30,36,62,.2)'); s.addColorStop(.55, 'rgba(0,0,0,0)'); s.addColorStop(1, 'rgba(255,230,176,.18)');
      g.fillStyle = s; g.fillRect(0, 0, w, h);
      g.globalAlpha = .22; g.fillStyle = patternFor(g, 'grain', grain); g.fillRect(0, 0, w, h);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      if (shadow) contactShadow(ctx, ...shadow);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(litCanvas, 0, 0, w, h, left, top, w, h); ctx.restore();
    } finally { litDepth--; }
  }

  // A static object (a building) drawn once with the same lighting as lit(), then reused every frame.
  // key must capture everything that changes its appearance.
  function litStatic(ctx, key, x0, y0, x1, y1, draw, shadow = null) {
    if (!canPaint) { draw(ctx); return; }
    const w = x1 - x0, h = y1 - y0, res = 2;
    let c = plates.get('static|' + key);
    if (!c) {
      c = makeCanvas(w * res, h * res);
      const g = c.getContext('2d');
      g.setTransform(res, 0, 0, res, -x0 * res, -y0 * res);
      litDepth++;
      try { draw(g); } finally { litDepth--; }
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-atop';
      const v = g.createLinearGradient(0, 0, 0, c.height);
      v.addColorStop(0, 'rgba(255,238,202,.24)'); v.addColorStop(.4, 'rgba(255,238,202,0)');
      v.addColorStop(.7, 'rgba(34,28,44,.08)'); v.addColorStop(1, 'rgba(26,17,10,.4)');
      g.fillStyle = v; g.fillRect(0, 0, c.width, c.height);
      const s = g.createLinearGradient(0, 0, c.width, 0);
      s.addColorStop(0, 'rgba(30,36,62,.2)'); s.addColorStop(.55, 'rgba(0,0,0,0)'); s.addColorStop(1, 'rgba(255,230,176,.18)');
      g.fillStyle = s; g.fillRect(0, 0, c.width, c.height);
      g.globalAlpha = .22; g.fillStyle = patternFor(g, 'grain', grain); g.fillRect(0, 0, c.width, c.height);
      plates.set('static|' + key, c);
    }
    if (shadow) contactShadow(ctx, ...shadow);
    ctx.drawImage(c, x0, y0, w, h);
  }
  // ---------- sky ----------
  const SKY = {
    spring: { stops: ['#4f8fcb', '#86b9df', '#cde2ee', '#eee8d4'], sun: '#fff8de', glow: '#fff1cf', cloud: ['#ffffff', '#b8c6d6'] },
    summer: { stops: ['#3a7cc0', '#73acd9', '#c0d9e8', '#f0e3c6'], sun: '#fff6d4', glow: '#ffeec4', cloud: ['#fffcf3', '#aab8c9'] },
    fall:   { stops: ['#5f84b1', '#b5a596', '#ebbd8b', '#f7deb4'], sun: '#ffe7b0', glow: '#ffd59a', cloud: ['#fff0dc', '#a99087'] },
    winter: { stops: ['#71889f', '#9eb0c2', '#d0d9e2', '#ebe7df'], sun: '#fffaf0', glow: '#fff6e6', cloud: ['#f6f8fa', '#9fabb8'] },
    overcast: { stops: ['#7e8a96', '#99a4ae', '#c3c9cd', '#dcdcd6'], sun: '#f2f0ea', glow: '#e6e4de', cloud: ['#eceeee', '#8f99a3'] },
  };
  function skyPlate(season, w, h, horizon, sunX, sunY) {
    return cached(`sky|${season}|${w}|${h}|${horizon}|${sunX}|${sunY}`, w, h, g => {
      const S = SKY[season] || SKY.summer, gr = g.createLinearGradient(0, 0, 0, horizon);
      gr.addColorStop(0, S.stops[0]); gr.addColorStop(.42, S.stops[1]); gr.addColorStop(.82, S.stops[2]); gr.addColorStop(1, S.stops[3]);
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const bloom = g.createRadialGradient(sunX, sunY, 0, sunX, sunY, w * .55);
      bloom.addColorStop(0, rgba(S.glow, .6)); bloom.addColorStop(.12, rgba(S.glow, .28)); bloom.addColorStop(.45, rgba(S.glow, .08)); bloom.addColorStop(1, rgba(S.glow, 0));
      g.fillStyle = bloom; g.fillRect(0, 0, w, h);
      // thin high cirrus, brushed across the upper sky
      g.lineCap = 'round';
      for (let k = 0; k < 14; k++) {
        const x = pr(k * 7 + 3) * w, y = 18 + pr(k * 5 + 1) * horizon * .32, len = 60 + pr(k + 40) * 140;
        g.strokeStyle = `rgba(255,255,255,${.06 + pr(k + 8) * .1})`; g.lineWidth = 1 + pr(k + 2) * 3;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + len * .5, y - 6 - pr(k) * 6, x + len, y + 2); g.stroke();
      }
      const disc = g.createRadialGradient(sunX, sunY, 0, sunX, sunY, 34);
      disc.addColorStop(0, S.sun); disc.addColorStop(.72, S.sun); disc.addColorStop(1, rgba(S.glow, 0));
      g.fillStyle = disc; g.beginPath(); g.arc(sunX, sunY, 34, 0, 7); g.fill();
    });
  }
  // Cumulus: a shaded mass, then sunlit puffs set up and to the right of it, with a flat, softened base.
  function cloud(season, v) {
    const C = (SKY[season] || SKY.summer).cloud;
    return sprite(`cloud|${season}|${v}`, 240, 110, 120, 80, g => {
      const n = 8 + v * 2, puffs = [];
      for (let k = 0; k < n; k++) {
        const u = k / (n - 1) - .5, dome = 1 - (2 * u) ** 2;
        puffs.push([u * 160 + (pr(v * 31 + k) - .5) * 22, -14 - dome * 30 * (.7 + pr(v * 7 + k) * .5) + pr(v * 13 + k) * 8, 14 + dome * 20 + pr(v * 5 + k) * 7]);
      }
      g.save(); g.beginPath(); g.rect(-120, -80, 240, 84); g.clip();
      for (const [x, y, r] of puffs) {
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, rgba(C[1], .95)); gr.addColorStop(.8, rgba(C[1], .8)); gr.addColorStop(1, rgba(C[1], 0));
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      }
      for (const [x, y, r] of puffs) {
        const cx = x + r * .16, cy = y - r * .24, rr = r * .86, gr = g.createRadialGradient(cx + rr * .3, cy - rr * .35, 0, cx, cy, rr);
        gr.addColorStop(0, rgba(C[0], 1)); gr.addColorStop(.55, rgba(C[0], .82)); gr.addColorStop(1, rgba(C[0], 0));
        g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, rr, 0, 7); g.fill();
      }
      g.restore();
      g.globalCompositeOperation = 'destination-out';
      const f = g.createLinearGradient(0, -14, 0, 4);
      f.addColorStop(0, 'rgba(0,0,0,0)'); f.addColorStop(1, 'rgba(0,0,0,.75)');
      g.fillStyle = f; g.fillRect(-120, -14, 240, 20);
    });
  }
  // o: w/h (canvas size), horizon, sunX/sunY, overcast
  function sky(ctx, season, t, o = {}) {
    const w = o.w || W, h = o.h || H, key = o.overcast ? 'overcast' : season;
    const ps = paintedSky(key, w, h);
    if (ps) ctx.drawImage(ps, 0, 0, w, h);
    else ctx.drawImage(skyPlate(key, w, h, o.horizon || 310, o.sunX ?? Math.round(w * .8125), o.sunY ?? 70), 0, 0, w, h);
    // over a painted sky, only a couple of faint clouds drift across to keep it alive
    const n = ps ? Math.min(2, o.clouds ?? 6) : o.clouds ?? 6;
    ctx.save();
    if (ps) ctx.globalAlpha *= .5;
    for (let i = 0; i < n; i++) {
      const k = (ps ? .45 : .55) + pr(i + 20) * .55, span = w + 300;
      const x = (((pr(i) * w + t * (6 + i * 2)) % span) + span) % span - 150, y = 34 + pr(i + 9) * 92 * (o.cloudBand || 1);
      stamp(ctx, cloud(key, i % 4), x, y, k);
    }
    ctx.restore();
  }

  // ---------- painted plates mixed into Classic ----------
  // The selected painted sky and distant-bluff images load in the background. Until they arrive, or if a file is
  // missing, the procedural sky above is used and no bluffs are drawn, so no scene ever waits for or fails on an image.
  const painted = {};
  if (canPaint && typeof ASSETS !== 'undefined') {
    for (const key of ['p_sky', 'p_sky_winter', 'p_far_hills', 'p_far_hills_spring', 'p_far_hills_winter', 'p_oats']) {
      ASSETS.load(key).then(img => { painted[key] = img; }).catch(e => console.warn('Classic scenery keeps its procedural fallback:', e.message));
    }
  }
  function paintedSky(key, w, h) {
    const src = key === 'winter' || key === 'overcast' ? painted.p_sky_winter : painted.p_sky;
    if (!src) return null;
    return cached(`psky|${key}|${w}|${h}`, w, h, g => {
      const k = Math.max(w / src.naturalWidth, h / src.naturalHeight);
      g.drawImage(src, (w - src.naturalWidth * k) / 2, 0, src.naturalWidth * k, src.naturalHeight * k);
      if (key === 'fall') {
        // the summer painting, turned toward a warm October afternoon
        g.globalCompositeOperation = 'multiply'; g.globalAlpha = .45; g.fillStyle = '#f4bf86'; g.fillRect(0, 0, w, h);
        const gr = g.createLinearGradient(0, h * .2, 0, h * .62);
        gr.addColorStop(0, 'rgba(255,196,128,0)'); gr.addColorStop(1, 'rgba(255,196,128,.4)');
        g.globalCompositeOperation = 'screen'; g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(0, 0, w, h);
      } else if (key === 'overcast') {
        g.globalCompositeOperation = 'saturation'; g.globalAlpha = .6; g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
        g.globalCompositeOperation = 'multiply'; g.globalAlpha = .3; g.fillStyle = '#b8b8b2'; g.fillRect(0, 0, w, h);
      } else if (key === 'spring') {
        g.globalCompositeOperation = 'screen'; g.globalAlpha = .14; g.fillStyle = '#d6ecff'; g.fillRect(0, 0, w, h);
      }
    });
  }
  const BLUFF_HAZE = { spring: '#dde7ea', summer: '#e4e5dc', fall: '#efcfa8', winter: '#e6eaee' };
  // Distant painted bluffs behind a town's own ridges, their crest near crestY. Scrolls (seamlessly) only for summer.
  function distantBluffs(ctx, season, crestY, offset = 0, width = W) {
    const key = season === 'winter' ? 'p_far_hills_winter' : season === 'spring' ? 'p_far_hills_spring' : 'p_far_hills', src = painted[key];
    if (!src) return;
    const th = Math.round(src.naturalHeight * 960 / src.naturalWidth);
    const tile = cached(`bluffs|${season}`, 960, th, g => {
      g.drawImage(src, 0, 0, 960, th);
      if (season === 'fall') {
        g.globalCompositeOperation = 'hue'; g.globalAlpha = .55; g.fillStyle = '#c8782c'; g.fillRect(0, 0, 960, th);
        g.globalCompositeOperation = 'multiply'; g.globalAlpha = .25; g.fillStyle = '#f2d2a2'; g.fillRect(0, 0, 960, th);
        g.globalCompositeOperation = 'destination-in'; g.globalAlpha = 1; g.drawImage(src, 0, 0, 960, th);
      }
      // aerial perspective: the far hills take on the color of the air
      g.globalCompositeOperation = 'source-atop'; g.globalAlpha = .3; g.fillStyle = BLUFF_HAZE[season] || BLUFF_HAZE.summer; g.fillRect(0, 0, 960, th);
    });
    // the painted land begins about 225 px down the scaled plate
    const y = Math.round(crestY - 225), shift = season === 'summer' ? ((offset % 960) + 960) % 960 : 0;
    for (let x = -shift; x < width; x += 960) ctx.drawImage(tile, x, y);
  }

  // ---------- painted standing oats ----------
  // The native 1010x768 oat painting, cropped to its measured plant bounds and repeated along each row.
  const OATS = Object.freeze({ width: 1010, cropTop: 116, cropBottom: 679, headTop: 118, base: 675 });
  // Rows from back to front; swath rows are clipped behind the binder's diagonal cut line. Classic adds two farther
  // rows ("deep") because its field begins higher on the screen than the painted ground does.
  const OAT_ROWS = Object.freeze([
    { base: 392, height: 52, stagger: .25, wind: 2.3, swath: false },
    { base: 419, height: 70, stagger: .5, wind: 1.1, swath: false },
    { base: 446, height: 80, stagger: .75, wind: .5, swath: true },
    { base: 472, height: 90, stagger: 0, wind: 0, swath: true },
  ]);
  const OAT_ROWS_DEEP = Object.freeze([
    { base: 344, height: 30, stagger: .6, wind: 3.1, swath: false },
    { base: 366, height: 40, stagger: .1, wind: 2.7, swath: false },
    ...OAT_ROWS,
  ]);
  // The oat painting is used only when oats are the main small grain; wheat keeps drawn stalks.
  const oatsLead = (pl) => {
    const c = pl.crops, oats = c.oats || 0;
    return oats > 0 && oats >= (c.wheat || 0);
  };
  const oatTiles = new WeakMap();
  function oatTile(src) {
    let tile = oatTiles.get(src);
    if (!tile) {
      tile = makeCanvas(OATS.width, OATS.cropBottom - OATS.cropTop); tile.dataset.paintedSource = 'p_oats';
      tile.getContext('2d').drawImage(src, 0, OATS.cropTop, OATS.width, tile.height, 0, 0, OATS.width, tile.height);
      oatTiles.set(src, tile);
    }
    return tile;
  }
  // Draws rows of painted oats scrolling with the stubble. Returns false if the painting has not loaded, so the
  // caller can draw Classic stalks instead. cut = [x0, y0, x1, y1], the binder's cutting edge.
  function standingOats(ctx, { distance, t, fx1, cut, deep = false }, src = painted.p_oats) {
    if (!src) return false;
    const tile = oatTile(src), [x0, y0, x1, y1] = cut;
    const cutX = (base) => x0 + (y0 - base) * (x1 - x0) / (y0 - y1);
    for (const row of deep ? OAT_ROWS_DEEP : OAT_ROWS) {
      const scale = row.height / (OATS.base - OATS.headTop), width = OATS.width * scale;
      const top = row.base - (OATS.base - OATS.cropTop) * scale, height = tile.height * scale;
      const shear = Math.sin(t * 1.35 + row.wind) * .018, phase = (((distance + width * row.stagger) % width) + width) % width;
      ctx.save();
      try {
        if (row.swath) { const left = Math.max(0, cutX(row.base)); ctx.beginPath(); ctx.rect(left, 0, fx1 - left, H); ctx.clip(); }
        ctx.transform(1, 0, shear, 1, -shear * row.base, 0);
        // Stems stay fixed to the ground: the row scrolls exactly with the stubble.
        for (let x = -phase - width; x < fx1 + width; x += width) ctx.drawImage(tile, x, top, width, height);
      } finally { ctx.restore(); }
    }
    return true;
  }

  // ---------- hills: forest texture, a tree-line crest, and aerial perspective ----------
  const canopyTile = (snow) => cached(`canopy|${snow}`, 160, 80, g => {
    for (let i = 0; i < (snow ? 300 : 460); i++) {
      const x = pr(i * 3.1 + 1) * 160, y = pr(i * 5.7 + 2) * 80;
      if (snow) {
        const a = .14 + pr(i + 3) * .26, dx = (pr(i + 4) - .5) * 2, len = 2 + pr(i + 5) * 4;
        wrapped(g, 160, 80, x, y, 8, (px, py) => { g.strokeStyle = `rgba(78,66,60,${a})`; g.lineWidth = .7; g.beginPath(); g.moveTo(px, py); g.lineTo(px + dx, py - len); g.stroke(); });
      } else {
        const light = pr(i + 7) > .62, r = 1.4 + pr(i + 9) * 3, a = light ? .07 + pr(i + 8) * .1 : .1 + pr(i + 8) * .16;
        wrapped(g, 160, 80, x, y, 6, (px, py) => {
          g.fillStyle = light ? `rgba(255,248,210,${a})` : `rgba(8,20,8,${a})`;
          g.beginPath(); g.arc(px + (light ? r * .3 : 0), py - (light ? r * .3 : 0), r, 0, 7); g.fill();
        });
      }
    }
  });
  const ridgeY = (x, y0, amp, freq, ph, flat = 3) => y0 - amp * (.55 + .45 * Math.tanh(flat * Math.sin(x * freq + ph))) - 6 * Math.sin(x * freq * 3.7 + ph * 2);
  // Fills the hill under yAt(worldX) from 0 to width, scrolled by offset, with a forest or snow texture.
  function hill(ctx, yAt, color, offset = 0, width = W, bottom = H, top = 0, deep = 120) {
    const snow = lum(color) > 205, crest = [];
    ctx.beginPath(); ctx.moveTo(0, bottom);
    for (let x = 0; x <= width + 5; x += 5) { const y = yAt(x + offset); crest.push([x, y]); ctx.lineTo(x, y); }
    ctx.lineTo(width, bottom); ctx.closePath();
    const g = ctx.createLinearGradient(0, top, 0, top + deep);
    g.addColorStop(0, tone(color, snow ? .3 : .1)); g.addColorStop(.45, color); g.addColorStop(1, tone(color, snow ? -.1 : -.22));
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip();
    const shift = ((offset % 160) + 160) % 160;
    ctx.translate(-shift, Math.round(top)); ctx.fillStyle = patternFor(ctx, 'canopy' + snow, () => canopyTile(snow));
    // texture only the band that shows above the fields and ground in front of it
    ctx.fillRect(0, -20, width + 320, deep + 160);
    ctx.restore();
    // a soft tree line breaking the crest
    if (snow) {
      ctx.strokeStyle = 'rgba(92,80,72,.42)'; ctx.lineWidth = .8; ctx.beginPath();
      for (const [x, y] of crest) { const s = Math.round((x + offset) / 5); if (pr(s) > .45) { ctx.moveTo(x, y + 1); ctx.lineTo(x + (pr(s + 1) - .5) * 2, y - 2 - pr(s + 2) * 4); } }
      ctx.stroke();
    } else {
      ctx.fillStyle = tone(color, .05); ctx.beginPath();
      for (const [x, y] of crest) { const s = Math.round((x + offset) / 5), r = 1.6 + pr(s) * 2.6; ctx.moveTo(x + r, y + 1.5); ctx.arc(x, y + 1.5, r, 0, Math.PI * 2); }
      ctx.fill();
    }
  }
  function ridge(ctx, y0, amp, freq, ph, color, flat = 3, offset = 0, width = W) {
    const paint = (c) => hill(c, (x) => ridgeY(x, y0, amp, freq, ph, flat), color, offset, width, H, y0 - amp - 10);
    // A ridge that is not scrolling never changes, so it is painted once.
    if (offset === 0 && canPaint) ctx.drawImage(cached(`ridge|${y0}|${amp}|${freq}|${ph}|${color}|${flat}|${width}`, width, H, paint), 0, 0);
    else paint(ctx);
  }

  // ---------- trees ----------
  // A foliage mass: a shaded underlayer, then sunlit clusters up and to the right, then a few bright leaf dabs.
  function foliage(g, cx, cy, rx, ry, color, seed, n = 9) {
    const dark = tone(color, -.34), light = tone(color, .24);
    const pts = [];
    for (let k = 0; k < n; k++) {
      const a = pr(seed + k * 1.3) * Math.PI * 2, d = Math.sqrt(pr(seed + k * 2.1 + 5));
      pts.push([cx + Math.cos(a) * rx * .62 * d, cy + Math.sin(a) * ry * .62 * d, Math.min(rx, ry) * (.42 + pr(seed + k + 9) * .22)]);
    }
    g.fillStyle = dark;
    for (const [x, y, r] of pts) { g.beginPath(); g.arc(x, y + r * .15, r * 1.08, 0, 7); g.fill(); }
    for (const [x, y, r] of pts) {
      const gr = g.createRadialGradient(x + r * .4, y - r * .45, r * .05, x, y, r);
      gr.addColorStop(0, light); gr.addColorStop(.55, color); gr.addColorStop(1, rgba(rgbOf(color) ? color : '#556b2f', 0));
      g.fillStyle = gr; g.beginPath(); g.arc(x + r * .1, y - r * .12, r * .9, 0, 7); g.fill();
    }
    g.fillStyle = rgba(light, .55);
    for (let k = 0; k < n * 2; k++) {
      const a = -Math.PI * .5 + (pr(seed + k * 3.7) - .2) * 1.8, d = pr(seed + k * 1.9) * .8;
      g.beginPath(); g.arc(cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, Math.min(rx, ry) * .07 + .3, 0, 7); g.fill();
    }
  }
  function bareBranches(g, x, y, len, ang, width, depth, seed) {
    const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
    g.strokeStyle = '#4f433b'; g.lineWidth = width; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey); g.stroke();
    if (depth <= 0) return;
    const spread = .42 + pr(seed) * .25;
    bareBranches(g, ex, ey, len * (.68 + pr(seed + 1) * .12), ang - spread, width * .66, depth - 1, seed * 1.7 + 3);
    bareBranches(g, ex, ey, len * (.64 + pr(seed + 2) * .14), ang + spread * .9, width * .62, depth - 1, seed * 1.3 + 7);
    if (depth > 1 && width > .8) { g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = width * .45; g.beginPath(); g.moveTo(x + 1, y - width * .4); g.lineTo(ex + 1, ey - width * .4); g.stroke(); }
  }
  function trunk(g, r, top, bottom, w = .12) {
    g.fillStyle = '#3f3024'; g.beginPath(); g.moveTo(-r * w, bottom); g.lineTo(-r * w * .45, top); g.lineTo(r * w * .45, top); g.lineTo(r * w, bottom); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,230,190,.18)'; g.fillRect(0, top, r * w * .55, bottom - top);
  }
  function tree(ctx, x, y, r, color, season, i) {
    const rr = Math.max(2, Math.round(r * 2) / 2), v = (i || 0) % 5, winter = season === 'winter';
    stamp(ctx, sprite(`tree|${winter ? '' : color}|${winter}|${rr}|${v}`, rr * 2.8, rr * 2.6, rr * 1.4, rr * 1.55, g => {
      g.fillStyle = 'rgba(20,16,10,.18)'; g.beginPath(); g.ellipse(-rr * .25, rr * .9, rr * .75, rr * .14, 0, 0, 7); g.fill();
      trunk(g, rr, -rr * .3, rr * .9);
      if (winter) {
        bareBranches(g, 0, rr * .1, rr * .55, -Math.PI / 2, Math.max(.8, rr * .14), 3, v + 1);
        g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.ellipse(-rr * .2, rr * .92, rr * .7, rr * .1, 0, 0, 7); g.fill();
      } else foliage(g, 0, -rr * .35, rr * 1.05, rr * .98, color, v * 17 + rr, 8);
    }), x, y);
  }

  // ---------- ground and water ----------
  const turfTile = (snow) => cached(`turf|${snow}`, 96, 48, g => {
    for (let i = 0; i < (snow ? 90 : 520); i++) {
      const x = pr(i * 2.3 + 4) * 96, y = pr(i * 3.9 + 6) * 48;
      if (snow) {
        const sparkle = pr(i + 3) > .55;
        wrapped(g, 96, 48, x, y, 16, (px, py) => {
          if (sparkle) { g.fillStyle = `rgba(255,255,255,${.5 + pr(i) * .5})`; g.fillRect(px, py, 1, 1); }
          else { g.fillStyle = 'rgba(110,132,165,.08)'; g.beginPath(); g.ellipse(px, py, 8 + pr(i + 1) * 8, 1.6 + pr(i + 2) * 1.5, 0, 0, 7); g.fill(); }
        });
      } else {
        const light = pr(i + 3) > .6, len = 2 + pr(i + 5) * 4, lean = (pr(i + 6) - .45) * 2.4;
        wrapped(g, 96, 48, x, y, 6, (px, py) => {
          g.strokeStyle = light ? `rgba(255,248,200,${.12 + pr(i) * .14})` : `rgba(18,28,8,${.14 + pr(i) * .16})`;
          g.lineWidth = .8; g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px + lean * .3, py - len * .6, px + lean, py - len); g.stroke();
        });
      }
    }
  });
  // Fills the current path as sunlit ground: lighter in the distance, darker underfoot, with turf or snow texture.
  // dx scrolls the ground texture left by that many pixels, so a field can move with a camera following the crew
  // (768 is a whole number of both tiles: 3 mottle tiles and 8 turf tiles).
  function groundFill(ctx, color, y0, y1, dx = 0) {
    const snow = lum(color) > 205, g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, tone(color, snow ? .1 : .1)); g.addColorStop(1, tone(color, snow ? -.08 : -.2));
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip();
    const ox = dx ? ((dx % 768) + 768) % 768 : 0;
    ctx.translate(-ox, Math.round(y0)); if (snow) ctx.globalAlpha = .2;
    ctx.fillStyle = patternFor(ctx, 'mottle', mottle); ctx.fillRect(-10, -10, W + ox + 20, y1 - y0 + 20);
    ctx.globalAlpha = snow ? .55 : 1;
    ctx.fillStyle = patternFor(ctx, 'turf' + snow, () => turfTile(snow)); ctx.fillRect(-10, -10, W + ox + 20, y1 - y0 + 20);
    ctx.restore();
  }
  function meadow(ctx, x, y, w, h, color, dx = 0) { ctx.beginPath(); ctx.rect(x, y, w, h); groundFill(ctx, color, y, y + h, dx); }
  // Fills the current path as water reflecting the sky, with drifting glints, or as snow-dusted ice.
  function waterFill(ctx, season, y0, y1, t = 0) {
    const ice = season === 'winter', g = ctx.createLinearGradient(0, y0, 0, y1);
    if (ice) { g.addColorStop(0, '#eef3f6'); g.addColorStop(1, '#c4d4df'); }
    else if (season === 'fall') { g.addColorStop(0, '#c9c3b2'); g.addColorStop(.35, '#7d8f9c'); g.addColorStop(1, '#3d5468'); }
    else { g.addColorStop(0, '#b5cfdf'); g.addColorStop(.35, '#6f9cc0'); g.addColorStop(1, '#2f5878'); }
    ctx.fillStyle = g; ctx.fill();
    // the bank's dark edge where water meets land
    ctx.strokeStyle = ice ? 'rgba(120,135,150,.35)' : 'rgba(34,42,30,.32)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.save(); ctx.clip();
    ctx.lineCap = 'round';
    for (let k = 0; k < 34; k++) {
      const x = ((pr(k) * W + (ice ? 0 : t * 7 * (.4 + pr(k + 1)))) % (W + 40)) - 20, y = y0 + 2 + pr(k + 3) * (y1 - y0 - 2);
      const len = 5 + pr(k + 4) * 14, a = ice ? .5 : .22 + .25 * Math.max(0, Math.sin(t * 1.7 + k));
      ctx.strokeStyle = ice ? `rgba(255,255,255,${a})` : `rgba(255,250,232,${a})`; ctx.lineWidth = ice ? 1.2 : 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- painterly finish ----------
  const GRADE = { spring: '#e6e1bc', summer: '#f0d6a2', fall: '#f1bb80', winter: '#c0ccdc' };
  // Applied once over a finished scene: muted saturation, a warm or cool grade, a vignette, and fine canvas grain.
  function finish(ctx, season = 'summer', w = ctx.canvas.width, h = ctx.canvas.height, x0 = 0) {
    if (!canPaint) return;
    const veil = cached(`veil|${w}|${h}`, w, h, g => {
      const v = g.createRadialGradient(w * .56, h * .42, Math.min(w, h) * .32, w * .56, h * .42, Math.hypot(w, h) * .62);
      v.addColorStop(0, 'rgba(32,22,12,0)'); v.addColorStop(1, 'rgba(32,22,12,.4)');
      g.fillStyle = v; g.fillRect(0, 0, w, h);
    });
    ctx.save();
    try {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'saturation'; ctx.globalAlpha = .2; ctx.fillStyle = '#808080'; ctx.fillRect(x0, 0, w, h);
      ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = .5; ctx.fillStyle = GRADE[season] || GRADE.summer; ctx.fillRect(x0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.drawImage(veil, x0, 0, w, h);
      ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = .14; ctx.fillStyle = patternFor(ctx, 'grain', grain); ctx.fillRect(x0, 0, w, h);
    } finally { ctx.restore(); }
  }

  function fieldColor(crop, season) {
    const c = DATA.crops[crop];
    if (season === 'winter') return '#f4f7f9';
    if (season === 'spring') return crop === 'hay' || crop === 'clover' || crop === 'alfalfa' ? '#8fbf5c' : '#7d5a3a';
    if (season === 'fall') return c.small ? '#dcc27a' : crop === 'corn' ? '#b89c58' : crop === 'clover' ? '#7a5466' : crop === 'tobacco' ? '#86913d' : '#a7b265';
    return c.small ? (crop === 'oats' ? '#b9c768' : '#d6c165') : c.color;
  }

  // Light falling across a field patch (the current path): brighter on the far edge, soil grain throughout.
  function fieldShade(ctx, y0, y1) {
    const snow = lum(ctx.fillStyle) > 205;
    ctx.save(); ctx.clip();
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, 'rgba(255,246,220,.16)'); g.addColorStop(1, 'rgba(32,22,10,.18)');
    ctx.fillStyle = g; ctx.fillRect(0, y0 - 14, W, y1 - y0 + 28);
    if (snow) ctx.globalAlpha = .25;
    ctx.fillStyle = patternFor(ctx, 'mottle', mottle); ctx.fillRect(0, y0 - 14, W, y1 - y0 + 28);
    ctx.globalAlpha = snow ? .06 : .18; ctx.fillStyle = patternFor(ctx, 'grain', grain); ctx.fillRect(0, y0 - 14, W, y1 - y0 + 28);
    ctx.restore();
  }

  // Field patches on the hillside; contour strips curve with the slope
  function fields(ctx, s, season, t, wide = false) {
    const crops = [];
    const plan = s ? (s.season && s.season.acres) || s.plan.crops : { wheat: 12, oats: 24, corn: 16, clover: 18, alfalfa: 0 };
    for (const c of DATA.cropOrder) if ((plan[c] || 0) > 0) crops.push([c, plan[c]]);
    if (!crops.length) crops.push(['clover', 1]);
    const total = crops.reduce((a, b) => a + b[1], 0);
    const x0 = 30, x1 = wide ? 930 : 620, yTop = 285, yBot = 455;
    const contour = s && s.buildings.contour;
    ctx.save();
    if (contour) {
      let y = yTop, i = 0;
      const bands = [];
      for (const [c, a] of crops) bands.push([c, Math.max(10, (yBot - yTop) * a / total)]);
      for (const [c, h] of bands) {
        ctx.fillStyle = fieldColor(c, season);
        ctx.beginPath();
        for (let x = x0; x <= x1; x += 8) ctx.lineTo(x, y + 10 * Math.sin(x / 70 + i));
        for (let x = x1; x >= x0; x -= 8) ctx.lineTo(x, y + h + 10 * Math.sin(x / 70 + i + 1));
        ctx.closePath(); ctx.fill(); fieldShade(ctx, y - 10, y + h + 10);
        ctx.strokeStyle = 'rgba(60,40,20,.25)'; ctx.stroke();
        texture(ctx, c, season, x0, y, x1 - x0, h, i, t);
        y += h; i++;
      }
    } else {
      const cols = Math.min(4, crops.length), rows = Math.ceil(crops.length / cols);
      let idx = 0;
      for (let r = 0; r < rows; r++) {
        const rowCrops = crops.slice(idx, idx + cols); idx += cols;
        const rowTot = rowCrops.reduce((a, b) => a + b[1], 0);
        const ya = yTop + (yBot - yTop) * r / rows, yb = yTop + (yBot - yTop) * (r + 1) / rows;
        let xa = x0 + (rows - r) * 12;
        const width = x1 - x0 - (rows - r) * 12;
        for (const [c, a] of rowCrops) {
          const w = width * a / rowTot;
          ctx.fillStyle = fieldColor(c, season);
          ctx.beginPath(); ctx.moveTo(xa + 6, ya); ctx.lineTo(xa + w + 6, ya); ctx.lineTo(xa + w - 4, yb); ctx.lineTo(xa - 4, yb); ctx.closePath(); ctx.fill(); fieldShade(ctx, ya, yb);
          ctx.strokeStyle = 'rgba(70,50,25,.35)'; ctx.lineWidth = 2; ctx.stroke();
          texture(ctx, c, season, xa, ya, w, yb - ya, r * 7 + idx, t);
          xa += w;
        }
      }
    }
    // fence line
    ctx.strokeStyle = '#6b5135'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x0 - 10, yBot + 6); ctx.lineTo(x1 + 20, yBot + 6); ctx.stroke();
    for (let x = x0 - 10; x < x1 + 20; x += 22) { ctx.fillStyle = '#6b5135'; ctx.fillRect(x, yBot, 3, 12); }
    ctx.restore();
  }
  // Crop surfaces as repeating tiles of marks over the field color: drilled grain, corn rows, hay, furrows, stubble, and snow.
  const cropTile = (kind) => cached(`crop|${kind}`, 64, 24, g => {
    const marks = (n, reach, f) => { for (let i = 0; i < n; i++) { const x = pr(i * 2.71 + kind.length * 13) * 64, y = pr(i * 3.37 + 7) * 24; wrapped(g, 64, 24, x, y, reach, (px, py) => f(px, py, i)); } };
    g.lineCap = 'round';
    if (kind === 'grain') {
      for (let y = 2; y < 24; y += 4) { g.fillStyle = 'rgba(40,30,8,.16)'; g.fillRect(0, y + 2, 64, 1); }
      marks(260, 4, (x, y, i) => { g.strokeStyle = i % 3 ? 'rgba(255,244,190,.32)' : 'rgba(60,44,10,.3)'; g.lineWidth = .7; g.beginPath(); g.moveTo(x, y + 2); g.lineTo(x + .5, y - 1.5); g.stroke(); });
    } else if (kind === 'corn') {
      for (let y = 3; y < 24; y += 6) {
        g.fillStyle = 'rgba(30,22,10,.28)'; g.fillRect(0, y + 2.5, 64, 1.4);
        for (let x = (y % 12) / 2; x < 64; x += 4) {
          g.strokeStyle = 'rgba(14,40,10,.55)'; g.lineWidth = .9;
          g.beginPath(); g.moveTo(x, y + 2.5); g.lineTo(x - 1.8, y - 1); g.moveTo(x, y + 2.5); g.lineTo(x + 1.9, y - .6); g.moveTo(x, y + 2.5); g.lineTo(x + .2, y - 2.2); g.stroke();
          g.strokeStyle = 'rgba(220,240,160,.35)'; g.lineWidth = .5; g.beginPath(); g.moveTo(x + .3, y + 1); g.lineTo(x + 1.6, y - .4); g.stroke();
        }
      }
    } else if (kind === 'hay') {
      marks(300, 5, (x, y, i) => { g.strokeStyle = i % 3 ? 'rgba(16,36,8,.2)' : 'rgba(250,250,200,.22)'; g.lineWidth = .7; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + .6, y - 1.6, x + 1.4, y - 2.8); g.stroke(); });
    } else if (kind === 'plowed') {
      for (let y = 0; y < 24; y += 3) {
        g.fillStyle = 'rgba(255,226,180,.14)'; g.fillRect(0, y, 64, 1);
        g.fillStyle = 'rgba(30,16,6,.3)'; g.fillRect(0, y + 1.6, 64, 1.2);
      }
      marks(90, 3, (x, y, i) => { g.fillStyle = i % 2 ? 'rgba(40,24,10,.4)' : 'rgba(210,170,120,.3)'; g.beginPath(); g.ellipse(x, y, .9 + pr(i) * .8, .6, 0, 0, 7); g.fill(); });
    } else if (kind === 'stubble') {
      for (let y = 2; y < 24; y += 4) { g.fillStyle = 'rgba(60,40,12,.18)'; g.fillRect(0, y + 2, 64, 1); }
      marks(220, 3, (x, y, i) => { g.strokeStyle = i % 4 ? 'rgba(255,236,170,.35)' : 'rgba(70,50,16,.35)'; g.lineWidth = .6; g.beginPath(); g.moveTo(x, y + 1.5); g.lineTo(x + .2, y - .6); g.stroke(); });
    } else if (kind === 'snow') {
      for (let y = 1; y < 24; y += 4) { g.fillStyle = 'rgba(120,134,160,.12)'; g.fillRect(0, y + 1.6, 64, 1.2); g.fillStyle = 'rgba(110,90,70,.12)'; for (let x = 0; x < 64; x += 5) if (pr(x + y * 7) > .7) g.fillRect(x, y + 1.6, 2, .8); }
      marks(40, 2, (x, y) => { g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(x, y, 1, 1); });
    } else if (kind === 'tobacco') {
      for (let y = 3; y < 24; y += 6) for (let x = (y % 12) / 2; x < 64; x += 6) {
        for (const [a, d] of [[-.5, -1], [.5, 1]]) {
          g.fillStyle = 'rgba(38,66,14,.65)'; g.beginPath(); g.ellipse(x + d * 1.6, y, 2.6, 1.3, a, 0, 7); g.fill();
          g.fillStyle = 'rgba(200,220,120,.35)'; g.beginPath(); g.ellipse(x + d * 1.8, y - .4, 1.4, .6, a, 0, 7); g.fill();
        }
      }
    }
  });
  const isHay = (crop) => crop === 'hay' || crop === 'clover' || crop === 'alfalfa';
  function cropKind(crop, season) {
    const c = DATA.crops[crop];
    if (season === 'winter') return 'snow';
    if (season === 'spring') return isHay(crop) ? 'hay' : 'plowed';
    if (season === 'fall') return isHay(crop) ? 'hay' : c.small || crop === 'corn' ? 'stubble' : crop === 'tobacco' ? 'stubble' : 'hay';
    return c.small ? 'grain' : crop === 'corn' ? 'corn' : crop === 'tobacco' ? 'tobacco' : 'hay';
  }
  // A shock of bundles standing in the stubble (or a corn shock), lit from the right.
  function shock(ctx, sx, sy, tall) {
    const hgt = tall ? 15 : 10, wid = tall ? 6 : 7;
    ctx.fillStyle = 'rgba(40,28,10,.3)'; ctx.beginPath(); ctx.ellipse(sx - 3, sy + 2, wid * 1.2, 1.6, 0, 0, 7); ctx.fill();
    const g = ctx.createLinearGradient(sx - wid, 0, sx + wid, 0);
    g.addColorStop(0, tall ? '#7d6634' : '#a07e34'); g.addColorStop(.6, tall ? '#b39a5c' : '#d4b05a'); g.addColorStop(1, tall ? '#cdb578' : '#ead08a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(sx - wid, sy + 2); ctx.quadraticCurveTo(sx - wid * .5, sy - hgt * .5, sx, sy - hgt); ctx.quadraticCurveTo(sx + wid * .5, sy - hgt * .5, sx + wid, sy + 2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(70,50,16,.45)'; ctx.lineWidth = .6; ctx.beginPath();
    for (let k = -2; k <= 2; k++) { ctx.moveTo(sx + k * wid * .3, sy + 2); ctx.lineTo(sx + k * .4, sy - hgt + 2); }
    ctx.stroke();
    if (!tall) { ctx.fillStyle = '#c9a03a'; ctx.beginPath(); ctx.moveTo(sx - 4, sy - hgt + 3); ctx.lineTo(sx, sy - hgt - 2); ctx.lineTo(sx + 4, sy - hgt + 3); ctx.closePath(); ctx.fill(); }
  }
  function texture(ctx, crop, season, x, y, w, h, seed, t) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const c = DATA.crops[crop], kind = cropKind(crop, season);
    ctx.save(); ctx.translate(Math.round(x + seed * 7), Math.round(y)); ctx.fillStyle = patternFor(ctx, 'crop' + kind, () => cropTile(kind)); ctx.fillRect(-64, -24, w + 128, h + 48); ctx.restore();
    if (season === 'summer' && c.small) {
      // wind running across ripening grain
      const wx = x + ((t * 26 + seed * 90) % (w + 120)) - 60, g = ctx.createLinearGradient(wx - 50, 0, wx + 50, 0);
      g.addColorStop(0, 'rgba(255,248,210,0)'); g.addColorStop(.5, 'rgba(255,248,210,.22)'); g.addColorStop(1, 'rgba(255,248,210,0)');
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    }
    if (season === 'fall' && (c.small || crop === 'corn')) {
      const n = Math.max(2, Math.floor(w * h / 900)), tall = crop === 'corn';
      for (let i = 0; i < n; i++) shock(ctx, x + 8 + pr(seed * 13 + i) * (w - 16), y + 8 + pr(seed * 7 + i) * (h - 12), tall);
    }
    if (season === 'summer' && crop === 'clover') {
      ctx.fillStyle = 'rgba(214,96,150,.85)';
      for (let i = 0; i < w * h / 90; i++) { ctx.beginPath(); ctx.arc(x + pr(seed + i) * w, y + pr(seed * 3 + i) * h, .9 + pr(i) * .6, 0, 7); ctx.fill(); }
    }
    if (season === 'summer' && crop === 'alfalfa') {
      ctx.fillStyle = 'rgba(150,120,200,.6)';
      for (let i = 0; i < w * h / 160; i++) ctx.fillRect(x + pr(seed * 2 + i) * w, y + pr(seed * 5 + i) * h, 1.2, 1.2);
    }
    ctx.restore();
  }
  // ---------- building materials ----------
  // Vertical board siding: each board a slightly different shade, dark seams, rain streaks, and grime near the ground.
  function boards(ctx, x0, y0, x1, y1, color, step = 4, seed = 0) {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, tone(color, -.14)); g.addColorStop(.7, color); g.addColorStop(1, tone(color, .08));
    ctx.fillStyle = g; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    for (let x = x0, k = 0; x < x1; x += step, k++) {
      const v = pr(seed + k * 1.7) - .5;
      ctx.fillStyle = v > 0 ? `rgba(255,236,210,${v * .18})` : `rgba(20,8,4,${-v * .24})`;
      ctx.fillRect(x, y0, step, y1 - y0);
      ctx.fillStyle = 'rgba(28,10,6,.3)'; ctx.fillRect(x + step - .7, y0, .7, y1 - y0);
      if (pr(seed + k * 3.1) > .55) {
        const sy = y0 + pr(seed + k * 5.3) * (y1 - y0) * .5, sg = ctx.createLinearGradient(0, sy, 0, y1);
        sg.addColorStop(0, 'rgba(30,18,12,0)'); sg.addColorStop(.4, 'rgba(30,18,12,.16)'); sg.addColorStop(1, 'rgba(30,18,12,.04)');
        ctx.fillStyle = sg; ctx.fillRect(x + step * .3, sy, step * .4, y1 - sy);
      }
    }
    const gb = ctx.createLinearGradient(0, y1 - (y1 - y0) * .35, 0, y1);
    gb.addColorStop(0, 'rgba(46,32,20,0)'); gb.addColorStop(1, 'rgba(46,32,20,.3)');
    ctx.fillStyle = gb; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  // Lapped clapboard siding with a shadow line under every board.
  function clapboard(ctx, x0, y0, x1, y1, color, step = 3) {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, tone(color, -.1)); g.addColorStop(1, tone(color, .05));
    ctx.fillStyle = g; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    for (let y = y0 + step; y < y1; y += step) {
      ctx.fillStyle = 'rgba(70,62,50,.28)'; ctx.fillRect(x0, y - .8, x1 - x0, .8);
      ctx.fillStyle = 'rgba(255,255,250,.35)'; ctx.fillRect(x0, y, x1 - x0, .5);
    }
    ctx.fillStyle = tone(color, .08); ctx.fillRect(x0, y0, 2, y1 - y0); ctx.fillRect(x1 - 2, y0, 2, y1 - y0);
  }
  // Courses of wood shingles inside the current path (rule 'evenodd' for a roof band between two outlines).
  function shingles(ctx, color, y0, y1, seed = 0, rule = 'nonzero', x0 = 0, x1 = W) {
    ctx.save(); ctx.clip(rule);
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, tone(color, .14)); g.addColorStop(1, tone(color, -.16));
    ctx.fillStyle = g; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    for (let y = y0, r = 0; y < y1; y += 3, r++) {
      for (let x = x0 - (r % 2) * 2.5, k = 0; x < x1; x += 5, k++) {
        const v = pr(seed + r * 31 + k * 1.37) - .5;
        ctx.fillStyle = v > 0 ? `rgba(255,240,220,${v * .2})` : `rgba(0,0,0,${-v * .28})`; ctx.fillRect(x, y, 4.6, 3);
      }
      ctx.fillStyle = 'rgba(0,0,0,.26)'; ctx.fillRect(x0, y + 2.4, x1 - x0, .6);
    }
    ctx.restore();
  }
  // Rounded fieldstones set in mortar.
  function stones(ctx, x0, y0, x1, y1, seed = 0) {
    ctx.fillStyle = '#6f685e'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    const rows = Math.max(1, Math.round((y1 - y0) / 5)), rh = (y1 - y0) / rows;
    for (let r = 0; r < rows; r++) {
      let x = x0 - pr(seed + r) * 4;
      for (let k = 0; x < x1; k++) {
        const w = 5 + pr(seed + r * 17 + k) * 6, cx = x + w / 2, cy = y0 + rh * (r + .5), v = pr(seed + r * 7 + k * 3);
        const base = ['#a59d8e', '#b5ab97', '#958d80', '#a39a8a', '#bdb3a2'][Math.floor(v * 5)];
        const gr = ctx.createRadialGradient(cx + w * .2, cy - rh * .25, 0, cx, cy, w * .6);
        gr.addColorStop(0, tone(base, .2)); gr.addColorStop(1, tone(base, -.2));
        ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(cx, cy, w * .46, rh * .44, 0, 0, 7); ctx.fill();
        x += w;
      }
    }
  }
  // A sash window: white frame, glass reflecting the sky (or lamp-lit), muntins, and a sill shadow.
  function pane(ctx, x, y, w, h, glow = false) {
    ctx.fillStyle = 'rgba(30,20,14,.25)'; ctx.fillRect(x - 1, y + h + 1.5, w + 3, 1.5);
    ctx.fillStyle = '#f2ede2'; ctx.fillRect(x - 1.3, y - 1.3, w + 2.6, h + 2.6);
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    if (glow) { g.addColorStop(0, '#ffe7a3'); g.addColorStop(1, '#e09a3c'); }
    else { g.addColorStop(0, '#a8c2d4'); g.addColorStop(.42, '#4a6274'); g.addColorStop(1, '#1e2a34'); }
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    if (!glow) { ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.beginPath(); ctx.moveTo(x, y + h * .6); ctx.lineTo(x + w * .45, y); ctx.lineTo(x + w * .65, y); ctx.lineTo(x, y + h * .95); ctx.fill(); }
    ctx.fillStyle = '#f2ede2'; ctx.fillRect(x + w / 2 - .5, y, 1, h); ctx.fillRect(x, y + h / 2 - .5, w, 1);
    ctx.fillStyle = '#e7e0d1'; ctx.fillRect(x - 2.2, y + h + .8, w + 4.4, 1.4);
  }

  function barn(ctx, x, y, s) {
    const b = s ? s.buildings : {}, key = `barn|${x}|${y}|${s ? s.startYear : 1900}|${!!b.lightning_rods}|${Math.min(3, b.barn_addition || 0)}`;
    litStatic(ctx, key, x - 12, y - 66, x + 196, y + 86, c => barnFlat(c, x, y, s), [x + 85, y + 84, 105, 9]);
  }
  function barnFlat(ctx, x, y, s) {
    const red = '#9c2b25', roof = '#4a4347';
    const outer = [[x - 8, y + 22], [x + 18, y - 12], [x + 75, y - 30], [x + 132, y - 12], [x + 158, y + 22]];
    const inner = [[x + 4, y + 22], [x + 24, y - 6], [x + 75, y - 22], [x + 126, y - 6], [x + 146, y + 22]];
    const poly = (pts) => { ctx.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]); ctx.closePath(); };
    if (s && s.buildings.barn_addition) {
      const aw = 40 + 10 * Math.min(3, s.buildings.barn_addition);
      stones(ctx, x + 150, y + 70, x + 150 + aw, y + 84, 41);
      boards(ctx, x + 150, y + 36, x + 150 + aw, y + 71, tone(red, -.06), 4, 31);
      ctx.beginPath(); ctx.moveTo(x + 146, y + 27); ctx.lineTo(x + 153 + aw, y + 32); ctx.lineTo(x + 153 + aw, y + 39); ctx.lineTo(x + 146, y + 36); ctx.closePath();
      shingles(ctx, roof, y + 27, y + 39, 5, 'nonzero', x + 140, x + 160 + aw);
      ctx.fillStyle = 'rgba(25,10,8,.35)'; ctx.fillRect(x + 150, y + 38, aw, 3);
      for (let k = 0; k < Math.floor(aw / 22); k++) pane(ctx, x + 160 + k * 22, y + 47, 8, 7);
    }
    stones(ctx, x, y + 70, x + 150, y + 84, 7);
    // the gable face of vertical boards, shaded under the roof
    ctx.save();
    ctx.beginPath(); ctx.moveTo(x, y + 72); ctx.lineTo(x, y + 22); for (const p of inner) ctx.lineTo(p[0], p[1]); ctx.lineTo(x + 150, y + 22); ctx.lineTo(x + 150, y + 72); ctx.closePath(); ctx.clip();
    boards(ctx, x - 2, y - 24, x + 152, y + 72, red, 4, 3);
    ctx.strokeStyle = 'rgba(26,8,6,.4)'; ctx.lineWidth = 9; ctx.beginPath(); for (const [i, p] of inner.entries()) (i ? ctx.lineTo(p[0], p[1] + 2) : ctx.moveTo(p[0], p[1] + 2)); ctx.stroke();
    ctx.restore();
    // the gambrel roof seen edge-on, with shingle courses and white trim
    ctx.beginPath(); poly(outer); poly(inner.slice().reverse());
    shingles(ctx, roof, y - 30, y + 23, 11, 'evenodd', x - 10, x + 160);
    ctx.strokeStyle = '#efe9dc'; ctx.lineWidth = 1.6; ctx.beginPath(); for (const [i, p] of inner.entries()) (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();
    ctx.fillStyle = '#efe9dc'; ctx.fillRect(x, y + 22, 2.5, 49); ctx.fillRect(x + 147.5, y + 22, 2.5, 49);
    // a louvered cupola on the ridge
    boards(ctx, x + 68, y - 42, x + 82, y - 28, red, 3.5, 19);
    ctx.fillStyle = 'rgba(20,10,8,.55)'; for (let k = 0; k < 4; k++) ctx.fillRect(x + 70, y - 40 + k * 3, 10, 1.2);
    ctx.beginPath(); ctx.moveTo(x + 64, y - 41); ctx.lineTo(x + 75, y - 50); ctx.lineTo(x + 86, y - 41); ctx.closePath();
    shingles(ctx, roof, y - 50, y - 40, 23, 'nonzero', x + 62, x + 88);
    // the big hinged doors, the hay door, and windows
    boards(ctx, x + 55, y + 30, x + 95, y + 72, tone(red, -.05), 5, 47);
    ctx.strokeStyle = '#efe9dc'; ctx.lineWidth = 2;
    ctx.strokeRect(x + 55, y + 30, 40, 42);
    ctx.beginPath(); ctx.moveTo(x + 55, y + 30); ctx.lineTo(x + 95, y + 72); ctx.moveTo(x + 95, y + 30); ctx.lineTo(x + 55, y + 72); ctx.moveTo(x + 75, y + 30); ctx.lineTo(x + 75, y + 72); ctx.stroke();
    ctx.fillStyle = '#3a3836'; ctx.fillRect(x + 52, y + 27, 46, 2);
    boards(ctx, x + 64, y - 4, x + 86, y + 14, tone(red, -.08), 3.6, 53);
    ctx.strokeRect(x + 64, y - 4, 22, 18);
    ctx.fillStyle = '#3a3836'; ctx.fillRect(x + 73, y - 9, 4, 4);
    for (const wx of [x + 15, x + 120]) pane(ctx, wx, y + 38, 14, 10);
    ctx.fillStyle = 'rgba(243,230,196,.9)'; ctx.font = 'bold 9px Georgia'; ctx.textAlign = 'center';
    ctx.fillText(s ? `${s.startYear}` : '1900', x + 75, y + 24);
    if (s && s.buildings.lightning_rods) {
      ctx.strokeStyle = '#2e2e2e'; ctx.lineWidth = 1;
      for (const lx of [x + 40, x + 75, x + 110]) { const ly = lx === x + 75 ? y - 50 : y - 22; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx, ly - 12); ctx.stroke(); ctx.fillStyle = '#6fc3df'; ctx.beginPath(); ctx.arc(lx, ly - 6, 2.5, 0, 7); ctx.fill(); }
    }
  }
  function house(ctx, x, y, season, t) {
    litStatic(ctx, `house|${x}|${y}|${season}`, x - 10, y - 36, x + 92, y + 57, c => houseFlat(c, x, y, season), [x + 42, y + 55, 54, 7]);
    if (season === 'winter' || season === 'fall') smoke(ctx, x + 60, y - 32, t, 'rgba(200,200,205,');
  }
  function houseFlat(ctx, x, y, season) {
    const winter = season === 'winter';
    stones(ctx, x - 1, y + 50, x + 81, y + 56, 13);
    clapboard(ctx, x, y, x + 80, y + 51, '#ece6d6');
    // brick chimney behind the roof
    ctx.fillStyle = '#7b4a35'; ctx.fillRect(x + 56, y - 30, 8, 18);
    for (let r = 0; r < 6; r++) { ctx.fillStyle = 'rgba(40,20,14,.35)'; ctx.fillRect(x + 56, y - 30 + r * 3, 8, .6); ctx.fillRect(x + 56 + (r % 2 ? 2 : 5), y - 30 + r * 3, .6, 3); }
    ctx.fillStyle = '#5e5a55'; ctx.fillRect(x + 55, y - 32, 10, 2.5);
    ctx.beginPath(); ctx.moveTo(x - 6, y + 2); ctx.lineTo(x + 40, y - 30); ctx.lineTo(x + 86, y + 2); ctx.closePath();
    shingles(ctx, '#4d5058', y - 30, y + 2, 17, 'nonzero', x - 8, x + 88);
    ctx.strokeStyle = '#f4efe4'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 6, y + 2); ctx.lineTo(x + 40, y - 30); ctx.lineTo(x + 86, y + 2); ctx.stroke();
    ctx.fillStyle = 'rgba(30,24,18,.3)'; ctx.fillRect(x, y + 2, 80, 3);
    pane(ctx, x + 10, y + 12, 12, 14); pane(ctx, x + 58, y + 12, 12, 14);
    pane(ctx, x + 34, y - 10, 12, 10, winter);
    // porch roof, its shadow, posts, and the front door
    ctx.fillStyle = 'rgba(30,24,18,.32)'; ctx.fillRect(x, y + 32, 80, 7);
    const door = ctx.createLinearGradient(x + 34, 0, x + 46, 0);
    door.addColorStop(0, '#3e2819'); door.addColorStop(1, '#6a4630');
    ctx.fillStyle = door; ctx.fillRect(x + 34, y + 32, 12, 19);
    ctx.strokeStyle = 'rgba(20,10,4,.5)'; ctx.lineWidth = .7; ctx.strokeRect(x + 35.5, y + 34, 9, 6); ctx.strokeRect(x + 35.5, y + 42, 9, 7);
    ctx.fillStyle = '#d9b45a'; ctx.beginPath(); ctx.arc(x + 43.5, y + 43, .9, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 7, y + 32); ctx.lineTo(x + 87, y + 32); ctx.lineTo(x + 85, y + 27); ctx.lineTo(x - 5, y + 27); ctx.closePath();
    shingles(ctx, '#5a5c62', y + 27, y + 32, 29, 'nonzero', x - 8, x + 88);
    ctx.fillStyle = '#f2ede2'; ctx.fillRect(x - 7, y + 31, 94, 1.6);
    for (let k = 0; k < 5; k++) {
      const px = x - 4 + k * 22;
      ctx.fillStyle = '#f4efe4'; ctx.fillRect(px - .9, y + 32, 1.8, 19);
      ctx.fillStyle = 'rgba(30,24,18,.25)'; ctx.fillRect(px - 2.6, y + 33, 1.6, 18);
    }
    if (winter) {
      ctx.fillStyle = '#fbfdff'; ctx.beginPath(); ctx.moveTo(x - 6, y + 2); ctx.lineTo(x + 40, y - 30); ctx.lineTo(x + 86, y + 2); ctx.lineTo(x + 80, y + 2); ctx.lineTo(x + 40, y - 24); ctx.lineTo(x, y + 2); ctx.fill();
      ctx.fillRect(x - 6, y + 25.5, 92, 2);
    }
  }
  function smoke(ctx, x, y, t, rgba, big = 1) {
    for (let k = 0; k < 6; k++) {
      const ph = (((t * .6 + k / 6) % 1) + 1) % 1;
      ctx.fillStyle = rgba + (0.55 * (1 - ph)) + ')';
      ctx.beginPath(); ctx.arc(x + ph * 30 * big + Math.sin(ph * 6 + k) * 4, y - ph * 50 * big, (4 + ph * 10) * big, 0, 7); ctx.fill();
    }
  }
  function silo(ctx, x, y) { litStatic(ctx, `silo|${x}|${y}`, x - 3, y - 18, x + 33, y + 101, c => siloFlat(c, x, y), [x + 14, y + 100, 22, 5]); }
  function siloFlat(ctx, x, y) {
    // concrete stave cylinder: rounded with light from the right, stave joints, steel hoops, and a hip-dome roof
    const g = ctx.createLinearGradient(x, 0, x + 30, 0);
    g.addColorStop(0, '#7f786b'); g.addColorStop(.3, '#bdb5a3'); g.addColorStop(.72, '#ddd5c3'); g.addColorStop(1, '#a29a88');
    ctx.fillStyle = g; ctx.fillRect(x, y, 30, 100);
    ctx.strokeStyle = 'rgba(60,52,42,.2)'; ctx.lineWidth = .6;
    for (let k = 1; k < 12; k++) { const sx = x + 15 - 15 * Math.cos(k * Math.PI / 12); ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx, y + 100); ctx.stroke(); }
    for (let k = 6; k < 100; k += 7) {
      ctx.strokeStyle = 'rgba(40,36,34,.5)'; ctx.lineWidth = .9;
      ctx.beginPath(); ctx.ellipse(x + 15, y + k, 15, 1.6, 0, 0, Math.PI); ctx.stroke();
    }
    for (let k = 0; k < 5; k++) {
      const sx = x + 4 + pr(k + 71) * 22, sg = ctx.createLinearGradient(0, y, 0, y + 100);
      sg.addColorStop(0, 'rgba(60,50,40,.18)'); sg.addColorStop(1, 'rgba(60,50,40,0)');
      ctx.fillStyle = sg; ctx.fillRect(sx, y, 1.5, 70 + pr(k) * 30);
    }
    // the feed chute down the left side
    ctx.fillStyle = '#8b2a24'; ctx.fillRect(x + 2, y + 2, 5, 98);
    ctx.fillStyle = 'rgba(20,10,8,.4)'; for (let k = 8; k < 98; k += 6) ctx.fillRect(x + 2, y + k, 5, .8);
    const d = ctx.createRadialGradient(x + 20, y - 9, 1, x + 15, y, 17);
    d.addColorStop(0, '#b0463a'); d.addColorStop(1, '#5a1915');
    ctx.fillStyle = d; ctx.beginPath(); ctx.arc(x + 15, y, 15, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(30,10,8,.4)'; ctx.lineWidth = .6;
    for (let k = 1; k < 6; k++) { const a = Math.PI + k * Math.PI / 6; ctx.beginPath(); ctx.moveTo(x + 15, y - 15); ctx.quadraticCurveTo(x + 15 + Math.cos(a) * 9, y - 9, x + 15 + Math.cos(a) * 15, y + Math.sin(a) * 2); ctx.stroke(); }
    ctx.fillStyle = '#5a1915'; ctx.fillRect(x + 13.5, y - 17, 3, 3);
  }
  function cheeseHouse(ctx, x, y) { litStatic(ctx, `cheese|${x}|${y}`, x - 6, y - 18, x + 56, y + 34, c => cheeseHouseFlat(c, x, y), [x + 25, y + 32, 34, 5]); }
  function cheeseHouseFlat(ctx, x, y) {
    stones(ctx, x - 1, y + 29, x + 51, y + 33, 61);
    clapboard(ctx, x, y, x + 50, y + 30, '#f4efe2', 2.6);
    ctx.beginPath(); ctx.moveTo(x - 4, y + 2); ctx.lineTo(x + 25, y - 16); ctx.lineTo(x + 54, y + 2); ctx.closePath();
    shingles(ctx, '#2f5378', y - 16, y + 2, 37, 'nonzero', x - 6, x + 56);
    ctx.fillStyle = 'rgba(30,24,18,.3)'; ctx.fillRect(x, y + 2, 50, 2);
    ctx.fillStyle = '#2f4f74'; ctx.font = 'bold 6.5px Georgia'; ctx.textAlign = 'center'; ctx.fillText('OSTEHUS', x + 25, y + 10);
    pane(ctx, x + 7, y + 16, 10, 8);
    const door = ctx.createLinearGradient(x + 30, 0, x + 40, 0);
    door.addColorStop(0, '#5c3a20'); door.addColorStop(1, '#8b5a2b');
    ctx.fillStyle = door; ctx.fillRect(x + 30, y + 15, 10, 15);
    ctx.fillStyle = '#d9b45a'; ctx.beginPath(); ctx.arc(x + 38, y + 23, .8, 0, 7); ctx.fill();
  }
  function tobaccoShed(ctx, x, y) { litStatic(ctx, `tobacco|${x}|${y}`, x - 6, y - 18, x + 116, y + 41, c => tobaccoShedFlat(c, x, y), [x + 55, y + 40, 64, 7]); }
  function tobaccoShedFlat(ctx, x, y) {
    // weathered gray boards; every third board swings open to air the hanging leaf
    boards(ctx, x, y, x + 110, y + 40, '#6d6358', 4.4, 83);
    for (let k = 2; k < 25; k += 3) { const bx = x + k * 4.4; ctx.fillStyle = 'rgba(14,10,6,.75)'; ctx.fillRect(bx, y + 3, 1.8, 35); ctx.fillStyle = 'rgba(150,120,60,.35)'; ctx.fillRect(bx + .4, y + 6, 1, 28); }
    ctx.beginPath(); ctx.moveTo(x - 4, y + 2); ctx.lineTo(x + 55, y - 16); ctx.lineTo(x + 114, y + 2); ctx.closePath();
    shingles(ctx, '#3f3a36', y - 16, y + 2, 43, 'nonzero', x - 6, x + 116);
    ctx.fillStyle = 'rgba(20,14,10,.35)'; ctx.fillRect(x, y + 2, 110, 2.5);
  }
  function windmill(ctx, x, y, t) { lit(ctx, x - 20, y - 20, x + 34, y + 92, c => windmillFlat(c, x, y, t), [x, y + 90, 14, 2.5]); }
  function windmillFlat(ctx, x, y, t) {
    // galvanized lattice tower: four legs, cross bracing, a platform, and the wheel with its vane
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#7b8086'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(x - 12, y + 90); ctx.lineTo(x - 1, y + 4); ctx.moveTo(x + 12, y + 90); ctx.lineTo(x + 1, y + 4); ctx.stroke();
    ctx.strokeStyle = '#a9aeb3'; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(x - 5, y + 90); ctx.lineTo(x - .5, y + 4); ctx.moveTo(x + 5, y + 90); ctx.lineTo(x + .5, y + 4); ctx.stroke();
    ctx.strokeStyle = 'rgba(110,116,122,.85)'; ctx.lineWidth = .6; ctx.beginPath();
    for (let k = 4; k < 90; k += 14) {
      const a = k, b = Math.min(90, k + 14), wa = 1 + a * 11 / 90, wb = 1 + b * 11 / 90;
      ctx.moveTo(x - wa, y + a); ctx.lineTo(x + wb, y + b); ctx.moveTo(x + wa, y + a); ctx.lineTo(x - wb, y + b);
      ctx.moveTo(x - wa, y + a); ctx.lineTo(x + wa, y + a);
    }
    ctx.stroke();
    ctx.fillStyle = '#6d7277'; ctx.fillRect(x - 4, y + 3, 8, 2);
    // the vane and gearbox
    ctx.fillStyle = '#9aa0a6'; ctx.fillRect(x, y - 1.5, 20, 3);
    ctx.fillStyle = '#c8ccd0'; ctx.beginPath(); ctx.moveTo(x + 18, y - 8); ctx.lineTo(x + 30, y - 6); ctx.lineTo(x + 30, y + 6); ctx.lineTo(x + 18, y + 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(40,40,40,.25)'; ctx.fillRect(x + 18, y + 2, 12, 5);
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * 2);
    for (let k = 0; k < 18; k++) {
      ctx.rotate(Math.PI / 9);
      const bg = ctx.createLinearGradient(3, 0, 17, 0); bg.addColorStop(0, '#8c9196'); bg.addColorStop(1, '#d6dadd');
      ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(3, -1); ctx.lineTo(17, -2.6); ctx.lineTo(17, 1.6); ctx.lineTo(3, 1); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = '#5d6267'; ctx.lineWidth = .8; ctx.beginPath(); ctx.arc(0, 0, 10, 0, 7); ctx.arc(0, 0, 16.5, 0, 7); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#3d4246'; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 7); ctx.fill();
    ctx.lineCap = 'butt';
  }
  function poles(ctx) {
    ctx.strokeStyle = '#5a4535'; ctx.lineWidth = 3;
    const pts = [[560, 360], [650, 330], [740, 312], [880, 300]];
    for (const [px, py] of pts) { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - 50); ctx.stroke(); ctx.fillStyle = '#5a4535'; ctx.fillRect(px - 9, py - 48, 18, 3); }
    ctx.strokeStyle = '#333'; ctx.lineWidth = .8;
    for (let k = 0; k < pts.length - 1; k++) { ctx.beginPath(); ctx.moveTo(pts[k][0] - 8, pts[k][1] - 47); ctx.quadraticCurveTo((pts[k][0] + pts[k + 1][0]) / 2, (pts[k][1] + pts[k + 1][1]) / 2 - 38, pts[k + 1][0] - 8, pts[k + 1][1] - 47); ctx.stroke(); }
  }

  function cow(ctx, x, y, dir, t, i, breed, walking = 0) { lit(ctx, x - 32, y - 16, x + 32, y + 16, c => cowFlat(c, x, y, dir, t, i, breed, walking), [x, y + 14, 20, 3.2]); }
  function cowFlat(ctx, x, y, dir, t, i, breed, walking = 0) {
    ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
    const bob = Math.sin(t * 2 + i) * 1.5, coat = breed ? '#b8763a' : '#f3f0e8', mark = breed ? '#f3f0e8' : '#1c1b1a';
    const leg = (lx, ph, far) => {
      const step = Math.sin(t * 3 + i + ph) * 3 * walking, foot = 13 - Math.max(0, step) * .35;
      ctx.fillStyle = far ? (breed ? tone(coat, -.35) : '#3a3734') : (breed ? tone(coat, -.08) : '#e6e1d6');
      ctx.beginPath(); ctx.moveTo(lx - 2.3, 2); ctx.lineTo(lx + 2.1, 2); ctx.lineTo(lx + step + 1.1, foot - .6); ctx.lineTo(lx + step - 1.2, foot - .6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2a2420'; ctx.fillRect(lx + step - 1.5, foot - 1, 3, 2);
    };
    leg(-5, Math.PI, true); leg(11, Math.PI, true);
    // tail with its switch: it hangs still, swishing now and then
    const sw = swishAt(t, i * 13 + 5), sway = Math.sin(t * .9 + i) * .5 + sw.swing * sw.amp * 6, lift = sw.amp * 4;
    ctx.strokeStyle = breed ? tone(coat, -.2) : '#cfc9bd'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-15.5, -6); ctx.quadraticCurveTo(-19 - lift + sway * .5, 2 - lift * .5, -17.5 - lift + sway, 9 - lift); ctx.stroke();
    ctx.fillStyle = '#2a2420'; ctx.beginPath(); ctx.ellipse(-17.5 - lift + sway, 10 - lift, 1.3, 2.4, .2 + sway * .08, 0, 7); ctx.fill();
    // barrel: high hip bones, a level back, round belly
    const body = () => {
      ctx.beginPath(); ctx.moveTo(-16, -3); ctx.quadraticCurveTo(-16.5, -9.5, -11, -9.2); ctx.lineTo(-9, -10); ctx.quadraticCurveTo(-1, -8, 8, -9);
      ctx.quadraticCurveTo(14.5, -10, 16, -5); ctx.quadraticCurveTo(17.5, 1, 14, 5); ctx.quadraticCurveTo(4, 10.5, -6, 8.4); ctx.quadraticCurveTo(-15, 7.5, -16, -3); ctx.closePath();
    };
    const g = ctx.createLinearGradient(0, -10, 0, 9);
    g.addColorStop(0, tone(coat, .1)); g.addColorStop(.6, coat); g.addColorStop(1, tone(coat, -.18));
    body(); ctx.fillStyle = g; ctx.fill();
    ctx.save(); body(); ctx.clip();
    ctx.fillStyle = mark;
    for (let k = 0; k < 4; k++) {
      const px = -12 + pr(i * 9 + k) * 26, py = -8 + pr(i * 5 + k + 3) * 13, rx = 3 + pr(i + k * 7) * 4.5;
      ctx.beginPath(); ctx.ellipse(px, py, rx, rx * (.6 + pr(i + k) * .4), pr(i * 3 + k) * 3, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(px + rx * .6, py + rx * .3, rx * .55, rx * .45, 0, 0, 7); ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(-17, 4, 35, 6);
    ctx.restore();
    ctx.strokeStyle = 'rgba(40,30,20,.25)'; ctx.lineWidth = .6; ctx.beginPath(); ctx.moveTo(-11, -9); ctx.quadraticCurveTo(-9, -4, -11, 2); ctx.stroke();
    // udder, then the near legs
    ctx.fillStyle = '#eab3ac'; ctx.beginPath(); ctx.ellipse(-6, 8.6, 3.6, 2.3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#d99a92'; for (const tx of [-8, -6.5, -5, -3.5]) ctx.fillRect(tx, 10.2, .8, 1.4);
    leg(-10, 0, false); leg(6, 0, false);
    // neck, head, ears, and horns
    const hy = 2 + bob;
    ctx.fillStyle = breed ? coat : '#ece8de';
    ctx.beginPath(); ctx.moveTo(12, -8.4); ctx.quadraticCurveTo(17, -6, 18, hy - 3); ctx.lineTo(19, hy + 3); ctx.quadraticCurveTo(15, 4, 12, 5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = mark;
    ctx.beginPath(); ctx.moveTo(16.5, hy - 4.5); ctx.quadraticCurveTo(21, hy - 5, 24.5, hy + 3); ctx.quadraticCurveTo(24.5, hy + 6.5, 21.5, hy + 6.5); ctx.quadraticCurveTo(17, hy + 4, 16, hy); ctx.closePath(); ctx.fill();
    ctx.fillStyle = breed ? '#f3f0e8' : '#f0ebe0'; ctx.beginPath(); ctx.moveTo(19.5, hy - 4.2); ctx.lineTo(21, hy - 4); ctx.lineTo(23, hy + 2); ctx.lineTo(21.5, hy + 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d9a59c'; ctx.beginPath(); ctx.ellipse(23, hy + 5, 2.4, 1.9, .3, 0, 7); ctx.fill();
    ctx.fillStyle = '#2a2420'; ctx.beginPath(); ctx.arc(23.6, hy + 5, .45, 0, 7); ctx.fill();
    ctx.fillStyle = mark; ctx.beginPath(); ctx.ellipse(15.5, hy - 4.2, 2.6, 1.2, -.5, 0, 7); ctx.fill();
    ctx.strokeStyle = '#e9dcc0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(17.5, hy - 4.6); ctx.quadraticCurveTo(17, hy - 7, 15.5, hy - 7.5); ctx.stroke();
    const shut = blinkAt(t, i * 13 + 5);
    ctx.fillStyle = '#100c0a'; ctx.beginPath(); ctx.ellipse(19.4, hy - 1.4, .75, Math.max(.15, .75 * (1 - shut)), 0, 0, 7); ctx.fill();
    ctx.restore();
  }
  function horse(ctx, x, y, dir, t, i, walking = true, grazing = 0, harness = false) { lit(ctx, x - 36, y - 30, x + 36, y + 20, c => horseFlat(c, x, y, dir, t, i, walking, grazing, harness)); }
  // A draft horse, 35 units long with its feet at y + 17: bays have black points, chestnuts are solid, some have white
  // socks; feathering at the fetlocks, a full mane and tail, and (in a hitch) collar, hames, back pad, and traces.
  function horseFlat(ctx, x, y, dir, t, i, walking = true, grazing = 0, harness = false) {
    ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
    ctx.fillStyle = 'rgba(42,31,20,.2)'; ctx.beginPath(); ctx.ellipse(1, 17, 24, 2.6, 0, 0, 7); ctx.fill();
    const bay = i % 2 === 0, coat = bay ? '#91603a' : '#6c4124', mane = bay ? '#1a120c' : '#3a2214';
    const leg = (j, lx, far) => {
      const phase = t * 5 + i * 1.7 + [0, Math.PI, Math.PI, 0][j];
      const step = Math.sin(phase) * 4 * walking, lift = Math.max(0, Math.cos(phase)) * 3 * walking;
      const kx = lx + step * .5, fx = lx + step, fy = 17 - lift, c = far ? tone(coat, -.32) : tone(coat, -.06);
      const sock = j % 3 !== 0, lower = bay ? (far ? '#1c140e' : '#2a1d14') : c;
      ctx.lineCap = 'round'; ctx.strokeStyle = c;
      ctx.lineWidth = 3.8; ctx.beginPath(); ctx.moveTo(lx, 2); ctx.lineTo(kx, 10); ctx.stroke();
      ctx.strokeStyle = lower; ctx.lineWidth = 2.1; ctx.beginPath(); ctx.moveTo(kx, 10); ctx.lineTo(fx, fy - 1.2); ctx.stroke();
      ctx.fillStyle = sock ? '#e9e2d4' : lower; ctx.fillRect(fx - 1.3, fy - 3.4, 2.6, 2.2);
      // feathering: long hair falling over the hoof
      ctx.strokeStyle = sock ? 'rgba(240,234,222,.9)' : rgba(tone(lower, .15), .9); ctx.lineWidth = .5; ctx.beginPath();
      for (const d of [-1.4, -.5, .5, 1.4]) { ctx.moveTo(fx + d * .6, fy - 3.4); ctx.quadraticCurveTo(fx + d * 1.1 - .6, fy - 1.6, fx + d * 1.3 - .4, fy - .2); }
      ctx.stroke();
      ctx.fillStyle = '#1d1712'; ctx.fillRect(fx - 1.6, fy - 1.3, 3.4, 1.6);
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(fx, fy - 1.2, 1.2, .5);
      ctx.lineCap = 'butt';
    };
    leg(1, -5, true); leg(2, 7, true);
    // a full, swinging tail, with a sheen along it
    const sw = Math.sin(t * 1.8 + i) * 2;
    ctx.strokeStyle = mane; ctx.lineCap = 'round';
    for (const [w, d] of [[3.4, 0], [1.8, -1.6], [1.5, 1.5], [1, -2.6]]) { ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(-16, -4); ctx.quadraticCurveTo(-23 + d, 2, -21 + sw + d, 12 + Math.abs(d) * .4); ctx.stroke(); }
    ctx.strokeStyle = rgba(tone(mane, .45), .5); ctx.lineWidth = .5; ctx.beginPath(); ctx.moveTo(-16.6, -3.4); ctx.quadraticCurveTo(-22.4, 2, -20.6 + sw, 11); ctx.stroke();
    ctx.lineCap = 'butt';
    // body: round rump, the dip behind the withers, deep chest
    const body = () => {
      ctx.beginPath(); ctx.moveTo(-17, -1); ctx.quadraticCurveTo(-17, -8.6, -9, -8.2); ctx.quadraticCurveTo(0, -6.4, 7, -7.6);
      ctx.quadraticCurveTo(15, -9, 17.5, -2); ctx.quadraticCurveTo(18.5, 5.5, 12, 7.2); ctx.quadraticCurveTo(0, 9, -9, 7.2); ctx.quadraticCurveTo(-17.5, 6, -17, -1); ctx.closePath();
    };
    const g = ctx.createLinearGradient(0, -9, 0, 8);
    g.addColorStop(0, tone(coat, .16)); g.addColorStop(.55, coat); g.addColorStop(1, tone(coat, -.25));
    body(); ctx.fillStyle = g; ctx.fill();
    ctx.save(); body(); ctx.clip();
    // the hip and shoulder catching the light, and the shadow under the belly
    for (const [hx, hy, r] of [[-10, -3, 8], [10, -2, 7]]) {
      const hg = ctx.createRadialGradient(hx + 2, hy - 2, .5, hx, hy, r);
      hg.addColorStop(0, 'rgba(255,236,200,.22)'); hg.addColorStop(1, 'rgba(255,236,200,0)');
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(hx, hy, r, 0, 7); ctx.fill();
    }
    const bl = ctx.createLinearGradient(0, 3, 0, 9); bl.addColorStop(0, 'rgba(20,12,6,0)'); bl.addColorStop(1, 'rgba(20,12,6,.35)');
    ctx.fillStyle = bl; ctx.fillRect(-18, 3, 37, 6);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,230,190,.18)'; ctx.lineWidth = .7; ctx.beginPath(); ctx.moveTo(-14, -5); ctx.quadraticCurveTo(-10, -1, -12, 4); ctx.moveTo(9, -5); ctx.quadraticCurveTo(13, 0, 11, 5); ctx.stroke();
    ctx.strokeStyle = 'rgba(30,18,10,.25)'; ctx.lineWidth = .6; ctx.beginPath(); ctx.moveTo(-3, 6); ctx.quadraticCurveTo(2, 3, 6, 6.6); ctx.stroke();
    // neck and head, raised or down to graze
    const headX = 20 + grazing * 6, headY = -16 + Math.sin(t * 2 + i) + grazing * 29;
    const ng = ctx.createLinearGradient(9, -8, headX, headY);
    ng.addColorStop(0, coat); ng.addColorStop(1, tone(coat, .08));
    ctx.fillStyle = ng;
    // The neck joins the head where the head really is: as the head turns down to graze, its forehead swings forward and
    // its jaw back, so the crest meets the top of the head and the throat meets the jaw, and the neck keeps its depth.
    const hr = .55 + grazing * .9, hc = Math.cos(hr), hs = Math.sin(hr);
    const onHead = (lx, ly) => [headX + lx * hc - ly * hs, headY + 2 + lx * hs + ly * hc];
    const crestE = onHead(-3, -2.6), throatE = onHead(-3, 2.6);
    const crestC = [12 + grazing * 12, -10 + grazing], throatC = [15 + grazing * 3, grazing * 8];
    ctx.beginPath(); ctx.moveTo(8, -7); ctx.quadraticCurveTo(crestC[0], crestC[1], crestE[0], crestE[1]); ctx.lineTo(throatE[0], throatE[1]);
    ctx.quadraticCurveTo(throatC[0], throatC[1], 16.5, 3); ctx.lineTo(12, 5); ctx.closePath(); ctx.fill();
    if (grazing > .3) {
      // the shaded underside of the lowered neck
      ctx.strokeStyle = rgba(tone(coat, -.35), .5 * grazing); ctx.lineWidth = 1.4; ctx.beginPath();
      ctx.moveTo(throatE[0], throatE[1]); ctx.quadraticCurveTo(throatC[0], throatC[1], 16.5, 3); ctx.stroke();
    }
    ctx.save(); ctx.translate(headX, headY + 2); ctx.rotate(.55 + grazing * .9);
    // the far ear, the head with its broad cheek, the blaze, eye, nostril, and the near ear
    ctx.fillStyle = tone(coat, -.3); ctx.beginPath(); ctx.moveTo(-1.6, -2.6); ctx.lineTo(-.6, -6.6); ctx.lineTo(.6, -2.8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = tone(coat, .04); ctx.beginPath(); ctx.moveTo(-3.5, -3); ctx.quadraticCurveTo(4, -3.4, 8.5, -.8); ctx.quadraticCurveTo(9.4, 2.2, 7, 2.6); ctx.quadraticCurveTo(1, 3.2, -3.5, 3); ctx.closePath(); ctx.fill();
    const cg = ctx.createRadialGradient(-.6, .6, .3, -.4, .8, 3.2); cg.addColorStop(0, 'rgba(255,236,200,.22)'); cg.addColorStop(1, 'rgba(0,0,0,.12)');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.ellipse(-.4, .8, 3, 2.4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#2b1e15'; ctx.beginPath(); ctx.ellipse(7.6, 1, 1.5, 1.4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#120c08'; ctx.beginPath(); ctx.ellipse(8.2, .2, .6, .4, .4, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(20,12,8,.5)'; ctx.lineWidth = .4; ctx.beginPath(); ctx.moveTo(6.4, 2.4); ctx.quadraticCurveTo(7.6, 2.8, 8.6, 2.2); ctx.stroke();
    ctx.fillStyle = '#efe7d8'; ctx.beginPath(); ctx.moveTo(-1, -3); ctx.lineTo(5, -2.6); ctx.lineTo(4.5, -1.7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#120c08'; ctx.beginPath(); ctx.arc(.8, -1.2, .75, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(1.05, -1.45, .25, 0, 7); ctx.fill();
    ctx.fillStyle = tone(coat, -.15); ctx.beginPath(); ctx.moveTo(-3, -2.6); ctx.lineTo(-2.4, -6.4); ctx.lineTo(-1, -2.8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(20,10,6,.35)'; ctx.beginPath(); ctx.moveTo(-2.6, -3); ctx.lineTo(-2.3, -5.4); ctx.lineTo(-1.6, -3); ctx.closePath(); ctx.fill();
    // the forelock
    ctx.strokeStyle = mane; ctx.lineWidth = .6; ctx.beginPath(); for (const d of [0, .7, 1.4]) { ctx.moveTo(-1.6 + d, -2.8); ctx.quadraticCurveTo(-.4 + d, -1.6, .2 + d, -.2); } ctx.stroke();
    if (harness) {
      // the bridle and blinders
      ctx.strokeStyle = '#1e140c'; ctx.lineWidth = .7; ctx.beginPath(); ctx.moveTo(-2.4, -2.6); ctx.lineTo(6.6, 2.6); ctx.moveTo(-2.6, 1.6); ctx.lineTo(-2.6, -2.6); ctx.moveTo(5.6, -1.6); ctx.lineTo(6, 2.6); ctx.stroke();
      ctx.fillStyle = '#1e140c'; ctx.beginPath(); ctx.ellipse(.4, -1.6, 1.6, 1.1, .2, 0, 7); ctx.fill();
      ctx.fillStyle = '#c9a24a'; ctx.beginPath(); ctx.arc(-2.6, -.4, .45, 0, 7); ctx.fill();
    }
    ctx.restore();
    // the mane along the crest of the neck, following its curve
    ctx.strokeStyle = mane; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(8, -7.6); ctx.quadraticCurveTo(crestC[0], crestC[1] - .5, crestE[0] - .5, crestE[1] - .5); ctx.stroke();
    ctx.lineWidth = .8; ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const u = k / 7, a = (1 - u) * (1 - u), b2 = 2 * u * (1 - u), c2 = u * u;
      const mx = a * 8 + b2 * crestC[0] + c2 * (crestE[0] - .5), my = a * -7.6 + b2 * (crestC[1] - .5) + c2 * (crestE[1] - .5);
      // hair falls toward the ground: down the side when the head is up, forward along the neck when it is lowered
      ctx.moveTo(mx, my); ctx.lineTo(mx - 1.5 + grazing * 2.2 - (k % 2) * .6, my + 2.6 - grazing * .6 + (k % 3) * .4);
    }
    ctx.stroke(); ctx.lineCap = 'butt';
    if (harness) {
      // collar and hames at the base of the neck, the back pad and belly band, and the traces running back
      ctx.strokeStyle = '#1e140c'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-2, -7); ctx.lineTo(-2, 7.4); ctx.moveTo(-17, -2); ctx.lineTo(-6, -4); ctx.stroke();
      ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(12, -2); ctx.lineTo(-24, -1); ctx.stroke();
      ctx.fillStyle = '#2a1c12'; ctx.fillRect(-5, -9, 6, 3);
      const cl = ctx.createLinearGradient(10, -10, 16, 6); cl.addColorStop(0, '#4a3020'); cl.addColorStop(1, '#22160e');
      ctx.fillStyle = cl; ctx.beginPath(); ctx.ellipse(13.6, -3, 3.2, 7.4, -.35, 0, 7); ctx.fill();
      ctx.strokeStyle = '#c9a24a'; ctx.lineWidth = .9; ctx.beginPath(); ctx.ellipse(13.6, -3, 3.6, 7.8, -.35, Math.PI * .55, Math.PI * 1.45); ctx.stroke();
      ctx.fillStyle = '#c9a24a'; ctx.beginPath(); ctx.arc(10.4, -10.4, .8, 0, 7); ctx.fill();
    }
    leg(0, -10, false); leg(3, 12, false);
    ctx.restore();
  }
  function person(ctx, x, y, color = '#3b5998', hat = '#4a3a2a') { lit(ctx, x - 8, y - 16, x + 8, y + 18, c => personFlat(c, x, y, color, hat), [x, y + 17, 6, 1.4]); }
  // A farmhand seen from the front, about 31 units tall (feet at y + 17, hands at x -/+ 5, y + 6.6), drawn to match the
  // walking figures: work boots, denim bib overalls with straps and brass buckles over a work shirt, a face with eyes,
  // ears, and hair, and a hat; a light hat color makes a woven straw hat, a dark one a creased felt hat.
  function personFlat(ctx, x, y, color = '#3b5998', hat = '#4a3a2a') {
    const skin = '#e5bc97', denim = '#34507a', seed = [...color].reduce((a, ch) => a + ch.charCodeAt(0), 0);
    const straw = lum(hat) > 150;
    ctx.fillStyle = 'rgba(30,25,25,.16)'; ctx.beginPath(); ctx.ellipse(x, y + 17, 6, 1.5, 0, 0, 7); ctx.fill();
    // overall legs, the near one lit, with cuffs over the boots
    ctx.fillStyle = tone(denim, -.12);
    ctx.beginPath(); ctx.moveTo(x - 3.6, y + 7.6); ctx.lineTo(x - .2, y + 7.6); ctx.lineTo(x - .6, y + 15.6); ctx.lineTo(x - 3.3, y + 15.6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = tone(denim, .08);
    ctx.beginPath(); ctx.moveTo(x + .2, y + 7.6); ctx.lineTo(x + 3.6, y + 7.6); ctx.lineTo(x + 3.3, y + 15.6); ctx.lineTo(x + .6, y + 15.6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = tone(denim, .22); ctx.fillRect(x - 3.4, y + 14.6, 2.9, .7); ctx.fillRect(x + .5, y + 14.6, 2.9, .7);
    ctx.fillStyle = '#2e2018'; ctx.beginPath(); ctx.ellipse(x - 1.9, y + 16.2, 2, 1.1, 0, 0, 7); ctx.ellipse(x + 2, y + 16.2, 2.1, 1.1, 0, 0, 7); ctx.fill();
    // the work shirt and its sleeves
    const g = ctx.createLinearGradient(x - 4.5, 0, x + 4.5, 0);
    g.addColorStop(0, tone(color, -.25)); g.addColorStop(.6, color); g.addColorStop(1, tone(color, .15));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x - 3.6, y + 8); ctx.lineTo(x - 4.2, y - 1.5); ctx.quadraticCurveTo(x - 4.3, y - 4, x - 2, y - 4.2);
    ctx.lineTo(x + 2, y - 4.2); ctx.quadraticCurveTo(x + 4.3, y - 4, x + 4.2, y - 1.5); ctx.lineTo(x + 3.6, y + 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = tone(color, -.15);
    ctx.beginPath(); ctx.moveTo(x - 4.3, y - 2.5); ctx.lineTo(x - 5.6, y + 5.5); ctx.lineTo(x - 4.3, y + 6); ctx.lineTo(x - 3.3, y - 1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = tone(color, -.02);
    ctx.beginPath(); ctx.moveTo(x + 4.3, y - 2.5); ctx.lineTo(x + 5.6, y + 5.5); ctx.lineTo(x + 4.3, y + 6); ctx.lineTo(x + 3.3, y - 1); ctx.closePath(); ctx.fill();
    // the open collar
    ctx.fillStyle = tone(color, -.3); ctx.beginPath(); ctx.moveTo(x - 1.6, y - 4.2); ctx.lineTo(x, y - 2.6); ctx.lineTo(x + 1.6, y - 4.2); ctx.closePath(); ctx.fill();
    // the bib and the overall front, the straps over the shoulders, brass buckles, and the bib pocket
    const dg = ctx.createLinearGradient(x - 4, 0, x + 4, 0); dg.addColorStop(0, tone(denim, -.25)); dg.addColorStop(.6, denim); dg.addColorStop(1, tone(denim, .14));
    ctx.fillStyle = dg; ctx.beginPath(); ctx.moveTo(x - 2.4, y - .4); ctx.lineTo(x + 2.4, y - .4); ctx.lineTo(x + 2.5, y + 3); ctx.lineTo(x + 3.7, y + 3.4);
    ctx.lineTo(x + 3.7, y + 8.4); ctx.lineTo(x - 3.7, y + 8.4); ctx.lineTo(x - 3.7, y + 3.4); ctx.lineTo(x - 2.5, y + 3); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = dg; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 2, y - .2); ctx.lineTo(x - 2.8, y - 4); ctx.moveTo(x + 2, y - .2); ctx.lineTo(x + 2.8, y - 4); ctx.stroke();
    ctx.fillStyle = '#d4a63a'; for (const bx of [-1.9, 1.9]) { ctx.beginPath(); ctx.arc(x + bx, y + .1, .45, 0, 7); ctx.fill(); }
    ctx.strokeStyle = 'rgba(232,190,110,.55)'; ctx.lineWidth = .3; ctx.strokeRect(x - 1.3, y + .8, 2.6, 1.8);
    ctx.strokeStyle = 'rgba(16,26,44,.5)'; ctx.lineWidth = .35; ctx.beginPath(); ctx.moveTo(x, y + 4.4); ctx.lineTo(x, y + 8.4); ctx.stroke();
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(x - 5, y + 6.6, .95, 0, 7); ctx.arc(x + 5, y + 6.6, .95, 0, 7); ctx.fill();
    // neck, ears, the shaded face with its eyes, nose, and mouth (and for some men a mustache), and the hair
    ctx.fillStyle = tone(skin, -.14); ctx.fillRect(x - 1, y - 5.2, 2, 1.4);
    ctx.fillStyle = tone(skin, -.1); ctx.beginPath(); ctx.ellipse(x - 2.9, y - 7, .7, 1, 0, 0, 7); ctx.ellipse(x + 2.9, y - 7, .7, 1, 0, 0, 7); ctx.fill();
    const f = ctx.createRadialGradient(x + .9, y - 8, .3, x, y - 7, 3.6);
    f.addColorStop(0, tone(skin, .12)); f.addColorStop(.75, skin); f.addColorStop(1, tone(skin, -.18));
    ctx.fillStyle = f; ctx.beginPath(); ctx.ellipse(x, y - 7.2, 2.8, 3.3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#6e4a32'; ctx.beginPath(); ctx.ellipse(x - 2.4, y - 8.6, .8, 1.3, .3, 0, 7); ctx.ellipse(x + 2.4, y - 8.6, .8, 1.3, -.3, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(248,244,236,.85)'; ctx.fillRect(x - 1.6, y - 8, 1.1, .8); ctx.fillRect(x + .5, y - 8, 1.1, .8);
    ctx.fillStyle = '#30251f'; ctx.fillRect(x - 1.2, y - 8, .6, .8); ctx.fillRect(x + .8, y - 8, .6, .8);
    ctx.fillStyle = 'rgba(40,28,20,.6)'; ctx.fillRect(x - 1.7, y - 8.8, 1.3, .3); ctx.fillRect(x + .4, y - 8.8, 1.3, .3);
    ctx.fillStyle = tone(skin, -.2); ctx.beginPath(); ctx.moveTo(x, y - 7.6); ctx.lineTo(x + .5, y - 6.2); ctx.lineTo(x - .3, y - 6.2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(200,110,90,.2)'; ctx.beginPath(); ctx.arc(x - 1.6, y - 6.2, .7, 0, 7); ctx.arc(x + 1.6, y - 6.2, .7, 0, 7); ctx.fill();
    if (seed % 2) { ctx.fillStyle = '#5a4030'; ctx.beginPath(); ctx.ellipse(x, y - 5.4, 1.4, .45, 0, 0, 7); ctx.fill(); }
    else { ctx.strokeStyle = 'rgba(120,60,50,.6)'; ctx.lineWidth = .35; ctx.beginPath(); ctx.moveTo(x - .7, y - 5.1); ctx.lineTo(x + .7, y - 5.1); ctx.stroke(); }
    // the hat: the brim's shadow on the brow, then a straw hat or a felt one
    ctx.fillStyle = 'rgba(40,24,16,.28)'; ctx.beginPath(); ctx.ellipse(x, y - 9.4, 3, .7, 0, 0, 7); ctx.fill();
    const hg = ctx.createLinearGradient(x - 3.4, 0, x + 3.4, 0); hg.addColorStop(0, tone(hat, -.28)); hg.addColorStop(.55, hat); hg.addColorStop(1, tone(hat, .2));
    if (straw) {
      ctx.fillStyle = tone(hat, -.22); ctx.beginPath(); ctx.ellipse(x, y - 9.7, 6.8, 1.6, 0, 0, 7); ctx.fill();
      ctx.fillStyle = tone(hat, .05); ctx.beginPath(); ctx.ellipse(x, y - 10, 6.6, 1.3, 0, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = rgba(tone(hat, -.35), .6); ctx.lineWidth = .3; ctx.beginPath();
      for (let k = 0; k < 2; k++) ctx.ellipse(x, y - 10, 4 + k * 1.4, .6 + k * .3, 0, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
      ctx.fillStyle = hg; ctx.beginPath(); ctx.moveTo(x - 3, y - 10.2); ctx.quadraticCurveTo(x - 3.1, y - 13.4, x, y - 13.4); ctx.quadraticCurveTo(x + 3.1, y - 13.4, x + 3, y - 10.2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#5a3a22'; ctx.fillRect(x - 3, y - 11.4, 6, 1);
      ctx.strokeStyle = rgba(tone(hat, -.4), .5); ctx.lineWidth = .3; ctx.beginPath();
      for (let wx = -2.2; wx < 2.6; wx += 1.1) { ctx.moveTo(x + wx, y - 13.1); ctx.lineTo(x + wx + .2, y - 11.5); }
      ctx.stroke();
    } else {
      ctx.fillStyle = tone(hat, -.15); ctx.beginPath(); ctx.ellipse(x, y - 9.8, 5.4, 1.25, 0, 0, 7); ctx.fill();
      ctx.fillStyle = hg; ctx.beginPath(); ctx.moveTo(x - 3.1, y - 10); ctx.quadraticCurveTo(x - 3.2, y - 14, x - .8, y - 14);
      ctx.quadraticCurveTo(x, y - 13.2, x + .8, y - 14); ctx.quadraticCurveTo(x + 3.2, y - 14, x + 3.1, y - 10); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(20,14,10,.5)'; ctx.fillRect(x - 3.1, y - 11.4, 6.2, 1);
    }
    ctx.fillStyle = 'rgba(255,240,215,.18)'; ctx.fillRect(x + .5, y - 13.4, 2, 2.4);
  }
  // o.reach = [x, y] (in the figure's units, facing +x): the near arm reaches for that point, bending at the elbow.
  // o.glove colors the hands as work gloves.
  function pedestrian(ctx, x, y, sc, t, kind, color, hat, dir = 1, walking = 1, o = {}) { const r = o.reach ? 16 : 12; lit(ctx, x - r * sc, y - 38 * sc, x + r * sc, y + 3 * sc, c => pedestrianFlat(c, x, y, sc, t, kind, color, hat, dir, walking, o)); }
  function pedestrianFlat(ctx, x, y, sc, t, kind, color, hat, dir = 1, walking = 1, o = {}) {
    ctx.save(); ctx.translate(x, y); ctx.scale(sc * dir, sc);
    if (kind === 'child') ctx.scale(.68, .68);
    const gait = t * 4.5, swing = Math.sin(gait) * 3.5 * walking, bob = (1 - Math.cos(gait * 2)) * .3 * walking;
    ctx.fillStyle = 'rgba(30,25,25,.16)'; ctx.beginPath(); ctx.ellipse(0, 0, 7, 2, 0, 0, 7); ctx.fill();
    // legs in two parts: each thigh swings from the hip, and the knee bends as that leg swings forward
    // (the far leg, half a stride behind, is drawn a shade darker)
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [hx, ph, col] of [[2, gait + Math.PI, o.overalls ? '#2c4569' : '#1f2830'], [-2, gait, o.overalls ? '#34507a' : '#28333c']]) {
      const th = Math.sin(ph) * .42 * walking, bend = (Math.max(0, Math.cos(ph)) * .95 + .08) * walking;
      const kx = hx + Math.sin(th) * 5, ky = -11 + Math.cos(th) * 5;
      const fx = kx + Math.sin(th - bend) * 5, fy = ky + Math.cos(th - bend) * 5;
      ctx.strokeStyle = col; ctx.lineWidth = 2.3; ctx.beginPath(); ctx.moveTo(hx, -11); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
      // the shoe, toe forward, tipping with the foot
      ctx.strokeStyle = '#1b1614'; ctx.lineWidth = 1.7; ctx.beginPath(); ctx.moveTo(fx - .5, fy); ctx.lineTo(fx + 1.6 * Math.cos(th - bend), fy - 1.6 * Math.sin(th - bend) * .6); ctx.stroke();
    }
    ctx.lineJoin = 'miter';
    ctx.translate(0, -bob);
    const woman = kind === 'woman', skin = '#e5bc97', seed = [...color].reduce((a, ch) => a + ch.charCodeAt(0), 0) + (woman ? 7 : 0);
    // arms with elbows: each swings against the leg on its side, the forearm bending forward as it comes ahead
    const arm = (sx, th, col) => {
      const fa = th + .22 + Math.max(0, th) * .7;
      const ex = sx + Math.sin(th) * 4.8, ey = -22.4 + Math.cos(th) * 4.8, hx = ex + Math.sin(fa) * 4.4, hy = ey + Math.cos(fa) * 4.4;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = col; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(sx, -22.4); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.strokeStyle = rgba(tone(col, -.4), .5); ctx.lineWidth = .5; ctx.beginPath(); ctx.moveTo(hx - Math.sin(fa) * 1.1 - .9, hy - Math.cos(fa) * 1.1); ctx.lineTo(hx - Math.sin(fa) * 1.1 + .9, hy - Math.cos(fa) * 1.1); ctx.stroke();
      ctx.fillStyle = o.glove || skin; ctx.beginPath(); ctx.arc(hx + Math.sin(fa) * .5, hy + Math.cos(fa) * .5, o.glove ? 1.2 : .95, 0, 7); ctx.fill();
      ctx.lineJoin = 'miter';
      return [hx, hy];
    };
    // the near arm reaching for a point: upper arm and forearm meet at an elbow that bends down and back
    const reachArm = (sx, [tx, ty], col) => {
      const L1 = 4.8, L2 = 4.4, dx = tx - sx, dy = ty + 22.4, d = Math.max(1, Math.min(L1 + L2 - .05, Math.hypot(dx, dy)));
      const base = Math.atan2(dy, dx), bend = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
      const a = base + bend, ex = sx + Math.cos(a) * L1, ey = -22.4 + Math.sin(a) * L1;
      const hx = ex + (tx - ex) * Math.min(1, L2 / Math.max(.01, Math.hypot(tx - ex, ty - ey))), hy = ey + (ty - ey) * Math.min(1, L2 / Math.max(.01, Math.hypot(tx - ex, ty - ey)));
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = col; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(sx, -22.4); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
      // a crease at the elbow and the shirt cuff at the wrist
      ctx.strokeStyle = rgba(tone(col, -.45), .6); ctx.lineWidth = .4; ctx.beginPath(); ctx.arc(ex, ey, .9, a + 2, a + 3.6); ctx.stroke();
      const fa = Math.atan2(hy - ey, hx - ex);
      ctx.strokeStyle = '#efe9da'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(hx - Math.cos(fa) * 1.4, hy - Math.sin(fa) * 1.4); ctx.lineTo(hx - Math.cos(fa) * .9, hy - Math.sin(fa) * .9); ctx.stroke();
      ctx.fillStyle = o.glove || skin; ctx.beginPath(); ctx.arc(hx, hy, o.glove ? 1.25 : 1, 0, 7); ctx.fill();
      ctx.lineJoin = 'miter';
      return [hx, hy];
    };
    const armTh = Math.sin(gait) * .38 * walking;
    arm(-3.4, -armTh, tone(color, -.3));
    const g = ctx.createLinearGradient(-5, 0, 5, 0);
    g.addColorStop(0, tone(color, -.3)); g.addColorStop(.6, color); g.addColorStop(1, tone(color, .16));
    if (woman) {
      // a long skirt that sways a little with the stride, a fitted bodice, belt, white collar, and brooch
      const sway = swing * .14;
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-3.6, -17.2); ctx.lineTo(3.6, -17.2);
      ctx.quadraticCurveTo(6.2, -10, 6.9 + sway, -2.6); ctx.quadraticCurveTo(0, -1.6, -6.7 + sway, -2.6); ctx.quadraticCurveTo(-5.9, -10, -3.6, -17.2); ctx.fill();
      ctx.strokeStyle = rgba(tone(color, -.45), .45); ctx.lineWidth = .45; ctx.beginPath();
      for (const fx of [-2.2, .4, 2.8]) { ctx.moveTo(fx * .6, -16.6); ctx.quadraticCurveTo(fx * .9 + sway * .5, -10, fx * 1.6 + sway, -2.4); }
      ctx.stroke();
      ctx.fillStyle = tone(color, .3); ctx.fillRect(-6.4 + sway, -3.6, 13.1, .6);
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-3.6, -16.8); ctx.lineTo(-4, -22.2); ctx.quadraticCurveTo(-3.8, -24.2, -1.6, -24.4); ctx.lineTo(1.8, -24.4); ctx.quadraticCurveTo(4, -24.2, 4, -22.2); ctx.lineTo(3.6, -16.8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = tone(color, -.45); ctx.fillRect(-3.7, -17.6, 7.4, 1.1);
      ctx.fillStyle = '#f3eee2'; ctx.beginPath(); ctx.ellipse(.4, -24, 2.3, .85, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#d8b24a'; ctx.beginPath(); ctx.arc(.9, -22.6, .5, 0, 7); ctx.fill();
    } else if (o.overalls) {
      // a work shirt with its collar open, and denim bib overalls: the bib, shoulder straps with brass buckles,
      // a bib pocket with a pencil, side buttons, and a carpenter's pocket on the leg
      const hem = -9.6, denim = '#34507a';
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-4.2, -12); ctx.lineTo(-4.4, -21.8); ctx.quadraticCurveTo(-4.3, -24.2, -2, -24.4);
      ctx.lineTo(2, -24.4); ctx.quadraticCurveTo(4.3, -24.2, 4.4, -21.8); ctx.lineTo(4.5, -12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = tone(color, -.25); ctx.beginPath(); ctx.moveTo(-1.6, -24.4); ctx.lineTo(.4, -22.6); ctx.lineTo(-.4, -24.4); ctx.closePath(); ctx.moveTo(2.6, -24.4); ctx.lineTo(.6, -22.6); ctx.lineTo(1.4, -24.4); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(tone(color, -.45), .45); ctx.lineWidth = .35; ctx.beginPath();
      for (const cx of [-3.4, -1.6, 2.4, 3.8]) { ctx.moveTo(cx, -23.6); ctx.lineTo(cx, -12.4); }
      for (const cy of [-21, -18, -15]) { ctx.moveTo(-4.3, cy); ctx.lineTo(4.4, cy); }
      ctx.stroke();
      const dg = ctx.createLinearGradient(-5, 0, 5, 0); dg.addColorStop(0, tone(denim, -.3)); dg.addColorStop(.6, denim); dg.addColorStop(1, tone(denim, .14));
      ctx.fillStyle = dg; ctx.beginPath(); ctx.moveTo(-4.4, hem); ctx.lineTo(-4.5, -15.2); ctx.lineTo(-2.6, -15.4); ctx.lineTo(-2.6, -21.2); ctx.lineTo(3, -21.2); ctx.lineTo(3, -15.4);
      ctx.lineTo(4.7, -15.2); ctx.lineTo(4.8, hem); ctx.quadraticCurveTo(0, hem + .8, -4.4, hem); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = dg; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-2.2, -20.8); ctx.lineTo(-3, -24.2); ctx.moveTo(2.6, -20.8); ctx.lineTo(3.4, -24.2); ctx.stroke();
      ctx.strokeStyle = 'rgba(232,190,110,.6)'; ctx.lineWidth = .3; ctx.setLineDash([.6, .5]); ctx.beginPath();
      ctx.moveTo(-2.3, -20.6); ctx.lineTo(2.7, -20.6); ctx.lineTo(2.7, -15.6); ctx.moveTo(-2.3, -20.6); ctx.lineTo(-2.3, -15.6);
      ctx.moveTo(-1.6, -19.6); ctx.lineTo(2, -19.6); ctx.lineTo(2, -17); ctx.lineTo(-1.6, -17); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#d4a63a'; for (const [bx, by] of [[-2, -20.6], [2.4, -20.6], [-4, -14.2], [4.3, -14.2]]) { ctx.beginPath(); ctx.arc(bx, by, .5, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#e8c24a'; ctx.fillRect(1, -21.4, .4, 2.4);
      ctx.strokeStyle = 'rgba(16,26,44,.5)'; ctx.lineWidth = .4; ctx.beginPath(); ctx.moveTo(.2, -15.2); ctx.lineTo(.2, hem + .4); ctx.moveTo(-4.4, -15.2); ctx.lineTo(4.7, -15.2); ctx.stroke();
    } else {
      // a sack coat over a white shirt and tie, the lapels, buttons, and a pocket flap
      const hem = kind === 'child' ? -11.4 : -9.6;
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-4.3, hem); ctx.lineTo(-4.4, -21.8); ctx.quadraticCurveTo(-4.3, -24.2, -2, -24.4);
      ctx.lineTo(2, -24.4); ctx.quadraticCurveTo(4.3, -24.2, 4.4, -21.8); ctx.lineTo(4.7, hem); ctx.quadraticCurveTo(0, hem + .7, -4.3, hem); ctx.fill();
      ctx.fillStyle = '#f1ece0'; ctx.beginPath(); ctx.moveTo(-.9, -24.4); ctx.lineTo(2.3, -24.4); ctx.lineTo(.8, -19.4); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = kind === 'child' ? '#3a3a3a' : ['#7a2a2a', '#2a3a5a', '#3a3a3a'][seed % 3]; ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(.7, -23.8); ctx.lineTo(.8, -20.2); ctx.stroke();
      ctx.strokeStyle = rgba(tone(color, -.5), .7); ctx.lineWidth = .4; ctx.beginPath();
      ctx.moveTo(-.9, -24.4); ctx.lineTo(.5, -19.6); ctx.lineTo(.6, hem + .3); ctx.moveTo(2.3, -24.4); ctx.lineTo(1, -19.4);
      ctx.moveTo(-3.4, -14.6); ctx.lineTo(-1.2, -14.6); ctx.stroke();
      ctx.fillStyle = tone(color, -.55); for (const by of [-17.6, -14.8]) { ctx.beginPath(); ctx.arc(1.5, by, .38, 0, 7); ctx.fill(); }
    }
    const hand = o.reach ? reachArm(3.6, o.reach, tone(color, -.08)) : arm(3.6, armTh, tone(color, -.08));
    if (woman) {
      ctx.strokeStyle = '#3d3346'; ctx.lineWidth = .8; ctx.beginPath(); ctx.arc(hand[0] + .8, hand[1] + 1.4, 2, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = '#51435a'; ctx.fillRect(hand[0] - 2.2, hand[1] + 1.4, 6, 5);
      ctx.fillStyle = '#c9a85a'; ctx.fillRect(hand[0] - 2.2, hand[1] + 1.4, 6, .6);
    }
    // the head: neck, a shaded face in profile with ear, nose, and mouth, the hair, and (for some men) a mustache
    ctx.fillStyle = tone(skin, -.14); ctx.fillRect(-1.1, -25.6, 2.4, 1.8);
    const fg = ctx.createRadialGradient(1.6, -29.4, .4, 0, -28, 4.6);
    fg.addColorStop(0, tone(skin, .12)); fg.addColorStop(.75, skin); fg.addColorStop(1, tone(skin, -.2));
    ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(0, -28, 4, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(3.7, -29.2); ctx.lineTo(5, -27.5); ctx.lineTo(3.8, -26.9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = woman ? '#8a5a3a' : '#6e4a32';
    ctx.beginPath(); ctx.arc(-1, -29, 4, Math.PI * .9, Math.PI * 1.75); ctx.lineTo(-1, -29); ctx.fill();
    if (woman) { ctx.beginPath(); ctx.arc(-3.6, -27.6, 1.7, 0, 7); ctx.fill(); }
    ctx.fillStyle = tone(skin, -.18); ctx.beginPath(); ctx.ellipse(-1.4, -27.6, .9, 1.3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(200,110,90,.22)'; ctx.beginPath(); ctx.arc(2.2, -26.8, 1.1, 0, 7); ctx.fill();
    if (!woman && kind !== 'child' && seed % 2) { ctx.fillStyle = '#5a4030'; ctx.beginPath(); ctx.ellipse(3.3, -26, 1.4, .55, 0, 0, 7); ctx.fill(); }
    else { ctx.strokeStyle = 'rgba(120,60,50,.6)'; ctx.lineWidth = .4; ctx.beginPath(); ctx.moveTo(2.6, -25.6); ctx.lineTo(3.6, -25.7); ctx.stroke(); }
    pedestrianHat(ctx, o.straw ? 'straw' : kind, hat);
    // the eye, which blinks now and then (each person on their own rhythm, keyed to their coat color)
    const lid = 1 - blinkAt(t, seed);
    ctx.fillStyle = 'rgba(248,244,236,.85)'; ctx.fillRect(1.3, -29 + (1 - lid) * .5, 1, Math.max(.2, lid * 1.1));
    ctx.fillStyle = '#30251f'; ctx.fillRect(2, -29 + (1 - lid) * .5, 1.1, Math.max(.2, lid * 1.1));
    ctx.fillStyle = 'rgba(40,28,20,.6)'; ctx.fillRect(1.7, -30.3, 1.8, .35);
    ctx.restore();
  }

  // Hats, in the pedestrian's units (head centered at 0,-28, facing +x): a creased felt hat with a grosgrain band for
  // men, a wide-brimmed straw or felt hat with a ribbon, a flower, and a feather for women, and a cloth cap for children.
  function pedestrianHat(ctx, kind, hat) {
    const crown = (x0, x1, yb, yt, dent) => {
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, tone(hat, -.28)); g.addColorStop(.55, hat); g.addColorStop(1, tone(hat, .2));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x0, yb); ctx.bezierCurveTo(x0 - .2, yt + 1.6, x0 + .6, yt, (x0 + x1) / 2 - 1, yt + (dent ? .2 : 0));
      if (dent) ctx.quadraticCurveTo((x0 + x1) / 2, yt + 1.1, (x0 + x1) / 2 + 1, yt + .1);
      ctx.bezierCurveTo(x1 - .6, yt, x1 + .2, yt + 1.6, x1, yb); ctx.closePath(); ctx.fill();
    };
    const brim = (rx, ry, y, tilt) => {
      ctx.fillStyle = tone(hat, -.22); ctx.beginPath(); ctx.ellipse(.4, y + .35, rx, ry, tilt, 0, 7); ctx.fill();
      ctx.fillStyle = tone(hat, .06); ctx.beginPath(); ctx.ellipse(.4, y, rx, ry * .8, tilt, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = rgba(tone(hat, .35), .6); ctx.lineWidth = .35; ctx.beginPath(); ctx.ellipse(.4, y, rx - .2, ry * .75, tilt, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
    };
    // the brim's shadow on the brow
    ctx.fillStyle = 'rgba(40,24,16,.28)'; ctx.beginPath(); ctx.ellipse(.3, -30.3, 3.9, .9, 0, 0, 7); ctx.fill();
    if (kind === 'straw') {
      // a farmer's woven straw hat: a broad, slightly drooping brim, a low flat crown, a dark band, and the weave
      brim(8.4, 1.8, -31.4, 0);
      ctx.strokeStyle = rgba(tone(hat, -.35), .6); ctx.lineWidth = .3; ctx.beginPath();
      for (let k = 0; k < 3; k++) ctx.ellipse(.4, -31.4, 3.8 + k * 1.6, .5 + k * .45, 0, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
      crown(-3.6, 3.8, -31.7, -35.4, false);
      ctx.fillStyle = '#5a3a22'; ctx.fillRect(-3.6, -33.1, 7.4, 1.2);
      ctx.strokeStyle = rgba(tone(hat, -.4), .55); ctx.lineWidth = .3; ctx.beginPath();
      for (const wy of [-34.6, -33.8]) { ctx.moveTo(-3.3, wy); ctx.lineTo(3.5, wy); }
      for (let wx = -2.8; wx < 3.6; wx += 1.3) { ctx.moveTo(wx, -35.2); ctx.lineTo(wx + .3, -33.2); }
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,248,214,.3)'; ctx.fillRect(1, -35.2, 2.4, .5);
      return;
    }
    if (kind === 'woman') {
      brim(7.6, 1.7, -31.6, -.06);
      crown(-3.3, 3.4, -31.9, -35.4, false);
      ctx.fillStyle = '#e5b6c4'; ctx.fillRect(-3.3, -33.3, 6.7, 1.3);
      ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(-3.3, -33.3, 6.7, .4);
      // a feather sweeping back, and a silk flower with two leaves at the front of the band
      ctx.strokeStyle = '#f4efe2'; ctx.lineWidth = .9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-1.5, -34.2); ctx.quadraticCurveTo(-5.5, -38.4, -8.6, -35.4); ctx.stroke();
      ctx.strokeStyle = 'rgba(200,190,170,.8)'; ctx.lineWidth = .3; ctx.beginPath();
      for (let k = 0; k < 5; k++) { const u = .2 + k * .16, px = -1.5 - u * 6.5, py = -34.2 - Math.sin(u * Math.PI) * 3; ctx.moveTo(px, py); ctx.lineTo(px - .6, py + 1); } ctx.stroke();
      ctx.fillStyle = '#5f7f4a'; ctx.beginPath(); ctx.ellipse(4.6, -33.2, 1.3, .6, -.5, 0, 7); ctx.ellipse(2.4, -32.4, 1.2, .55, .4, 0, 7); ctx.fill();
      ctx.fillStyle = '#b8435c'; for (const [dx, dy] of [[0, -.7], [.7, 0], [0, .7], [-.7, 0]]) { ctx.beginPath(); ctx.arc(3.5 + dx, -33 + dy, .75, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#f2d27a'; ctx.beginPath(); ctx.arc(3.5, -33, .45, 0, 7); ctx.fill();
      ctx.lineCap = 'butt';
    } else if (kind === 'child') {
      crown(-4.2, 4, -31.4, -35, false);
      ctx.strokeStyle = rgba(tone(hat, -.4), .6); ctx.lineWidth = .35; ctx.beginPath(); ctx.moveTo(-.2, -34.9); ctx.lineTo(-.6, -31.6); ctx.moveTo(2.4, -34.4); ctx.lineTo(3, -31.6); ctx.stroke();
      ctx.fillStyle = tone(hat, -.3); ctx.beginPath(); ctx.moveTo(2.4, -31.6); ctx.quadraticCurveTo(6.6, -32, 7.4, -30.8); ctx.quadraticCurveTo(5, -30.4, 2.4, -30.9); ctx.closePath(); ctx.fill();
      ctx.fillStyle = tone(hat, .25); ctx.beginPath(); ctx.arc(-.1, -35, .6, 0, 7); ctx.fill();
    } else {
      brim(6.4, 1.3, -31.5, 0);
      crown(-3.7, 3.8, -31.8, -36.4, true);
      // the pinched front of the crown and its centre crease
      ctx.strokeStyle = rgba(tone(hat, -.45), .7); ctx.lineWidth = .4; ctx.beginPath(); ctx.moveTo(-.1, -36); ctx.quadraticCurveTo(.3, -35, .1, -34.2); ctx.moveTo(2.4, -35.6); ctx.quadraticCurveTo(2.2, -34.6, 2.6, -33.8); ctx.stroke();
      ctx.fillStyle = rgba(tone(hat, .4), .35); ctx.beginPath(); ctx.ellipse(2.2, -35.2, .8, .5, 0, 0, 7); ctx.fill();
      // grosgrain band with a small bow on the left side
      ctx.fillStyle = tone(hat, -.5); ctx.fillRect(-3.7, -33.4, 7.5, 1.3);
      ctx.fillStyle = 'rgba(255,250,235,.18)'; ctx.fillRect(-3.7, -33.4, 7.5, .35);
      ctx.fillStyle = tone(hat, -.58); ctx.beginPath(); ctx.ellipse(-3.3, -32.8, .9, .6, .4, 0, 7); ctx.fill();
    }
  }
  // Nels at the sawmill's feed lever (feet at x, y, facing the mill to the right). pull 0-1 swings the lever from
  // neutral back toward him to full feed forward; his hand stays on the grip and his arm bends at the elbow to follow.
  function sawyer(ctx, x, y, sc, t, pull) {
    const P0 = [x + 11 * sc, y - 7.4 * sc], len = 14 * sc, a = -.25 + pull * .36;
    const tip = [P0[0] + Math.sin(a) * len, P0[1] - Math.cos(a) * len], grip = [P0[0] + Math.sin(a) * (len - 1.4 * sc), P0[1] - Math.cos(a) * (len - 1.4 * sc)];
    // the iron stand and the notched quadrant plate behind the lever, then the lever bar and its worn wooden grip
    ctx.fillStyle = '#3a3a3a'; ctx.fillRect(P0[0] - 1.2 * sc, P0[1], 2.4 * sc, 7.4 * sc);
    ctx.fillStyle = '#4e4e4e'; ctx.beginPath(); ctx.moveTo(P0[0], P0[1]); ctx.arc(P0[0], P0[1], 5.2 * sc, -Math.PI / 2 - .42, -Math.PI / 2 + .42); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(200,200,200,.25)'; ctx.beginPath(); ctx.moveTo(P0[0], P0[1]); ctx.arc(P0[0], P0[1], 5.2 * sc, -Math.PI / 2 - .42, -Math.PI / 2 - .3); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = .35 * sc; ctx.beginPath();
    for (let k = -3; k <= 3; k++) { const q = -Math.PI / 2 + k * .12; ctx.moveTo(P0[0] + Math.cos(q) * 4.4 * sc, P0[1] + Math.sin(q) * 4.4 * sc); ctx.lineTo(P0[0] + Math.cos(q) * 5.2 * sc, P0[1] + Math.sin(q) * 5.2 * sc); }
    ctx.stroke();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 1.1 * sc; ctx.beginPath(); ctx.moveTo(P0[0], P0[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
    ctx.strokeStyle = 'rgba(190,190,190,.45)'; ctx.lineWidth = .3 * sc; ctx.beginPath(); ctx.moveTo(P0[0] + .3 * sc, P0[1]); ctx.lineTo(tip[0] + .3 * sc, tip[1]); ctx.stroke();
    const gb = [P0[0] + Math.sin(a) * (len - 3.2 * sc), P0[1] - Math.cos(a) * (len - 3.2 * sc)];
    ctx.strokeStyle = '#8a6a45'; ctx.lineWidth = 1.6 * sc; ctx.beginPath(); ctx.moveTo(gb[0], gb[1]); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = '#5a5a5a'; ctx.beginPath(); ctx.arc(P0[0], P0[1], 1 * sc, 0, 7); ctx.fill();
    // Nels in a faded work shirt, bib overalls, a straw hat, and leather gloves, leaning a little into the pull
    pedestrian(ctx, x, y, sc, t, 'man', '#a5493c', '#d9c07a', 1, 0, { reach: [(grip[0] - x) / sc, (grip[1] - y) / sc], glove: '#8a5a32', overalls: true, straw: true });
  }
  function patrol(t, left, right, speed, pause = 2) {

    const duration = (right - left) / speed, phase = cycleAt(t, 2 * (duration + pause));
    const forward = phase < duration + pause, elapsed = forward ? phase : phase - duration - pause;
    const u = Math.min(1, elapsed / duration), progress = smoothStep(u);
    return { x: forward ? left + (right - left) * progress : right - (right - left) * progress,
      dir: forward ? 1 : -1, walking: Math.min(1, 6 * u * (1 - u)) };
  }
  // Pasture animals on the Fields view wander on their own: each grazes a while, then ambles off in either direction.
  // They advance only while the view is drawn (time spent on other tabs or in a mini-game does not make them jump),
  // and one that walks off the canvas stays gone until the next season puts the herd back in the pasture.
  const herd = { key: null, t: null, rng: 1, cows: [], horses: [] };
  const herdRandom = () => { herd.rng = (herd.rng * 16807) % 2147483647; return (herd.rng - 1) / 2147483646; };
  function grazer(x, y, speed) {
    return { x, y, speed, dir: herdRandom() < .5 ? -1 : 1, walk: 0, walking: false, timer: 2 + herdRandom() * 8, gone: false };
  }
  function herdAt(s, t, nCows, nHorses) {
    const key = s ? `${s.seed}|${s.startYear}|${s.year}|${s.phase}|${s.locId}` : 'preview';
    if (herd.key !== key) {
      herd.key = key; herd.t = t; herd.rng = 1 + Math.floor(pr(key.length + (s ? s.year : 0)) * 2147483600); herd.cows = []; herd.horses = [];
    }
    while (herd.cows.length < nCows) { const i = herd.cows.length; herd.cows.push(grazer(650 + pr(i + 4) * 270, 478 + pr(i + 11) * 50, 4 + pr(i) * 4)); }
    while (herd.horses.length < nHorses) { const i = herd.horses.length; herd.horses.push(grazer(462 + i * 42 + pr(i + 30) * 18, 472 + (i % 2) * 6, 1.8)); }
    // a long gap (another tab, a closed window, a paused page) counts as one ordinary frame
    const dt = Math.max(0, Math.min(.1, t - herd.t));
    herd.t = t;
    for (const a of [...herd.cows, ...herd.horses]) {
      if (a.gone || dt === 0) continue;
      a.timer -= dt;
      if (a.timer <= 0) {
        a.walking = !a.walking && herdRandom() < .6;
        if (a.walking && herdRandom() < .5) a.dir = -a.dir;
        a.timer = a.walking ? 3 + herdRandom() * 6 : 4 + herdRandom() * 9;
      }
      a.walk += ((a.walking ? 1 : 0) - a.walk) * Math.min(1, dt * 2);
      a.x += a.dir * a.speed * a.walk * dt;
      if (a.x < -60 || a.x > W + 60) a.gone = true;
    }
    return { cows: herd.cows.slice(0, nCows), horses: herd.horses.slice(0, nHorses) };
  }
  // A copy of the pasture animals' state, for tests.
  const pasture = () => ({ key: herd.key, animals: [...herd.cows, ...herd.horses].map(a => ({ x: a.x, dir: a.dir, gone: a.gone })) });

  // mode: 'drive' (rolling), 'belt' (parked, engine turning a belt), 'idle'. Returns the belt-pulley point.
  // Ground-shadow half-widths by machine type, in machine units.
  const MACHINE_SHADOW = { power: 34, thresher: 52, huller: 52, binder: 46, baler: 48, engine: 20, sawmill: 62, woodtool: 24 };
  function machine(ctx, id, x, y, sc, t, mode = 'idle', year) {
    const m = DATA.machines.find(q => q.id === id);
    const rx = !m ? 0 : m.kind === 'steam' ? 40 : MACHINE_SHADOW[m.type] || 30;
    let P = { x, y };
    lit(ctx, x - 104 * sc, y - 140 * sc, x + 124 * sc, y + 6 * sc, c => { P = machineFlat(c, id, x, y, sc, t, mode, year); }, rx ? [x, y + sc, rx * sc, 5 * sc] : null);
    return P;
  }
  function machineFlat(ctx, id, x, y, sc, t, mode = 'idle', year) {
    const m = DATA.machines.find(q => q.id === id);
    if (!m) return { x, y };
    if (mode === true) mode = 'drive';
    if (mode === false) mode = 'idle';
    const run = mode !== 'idle';
    let P = { x: 0, y: -20 };
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
    if (m.kind === 'steam') {
      const ang = mode === 'drive' ? t * 3 : 0;
      // canopy, boiler barrel with smokebox and rivets, the stack, steam dome, and the flywheel
      ctx.fillStyle = '#5c1a14'; ctx.fillRect(-36, -58, 26, 3);
      ctx.strokeStyle = '#4a4a4a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-34, -56); ctx.lineTo(-34, -36); ctx.moveTo(-12, -56); ctx.lineTo(-12, -36); ctx.stroke();
      const boiler = ctx.createLinearGradient(0, -38, 0, -20);
      boiler.addColorStop(0, '#5a5a5a'); boiler.addColorStop(.22, '#8a8a8a'); boiler.addColorStop(.35, '#3a3a3a'); boiler.addColorStop(1, '#121212');
      ctx.fillStyle = boiler; ctx.beginPath(); ctx.moveTo(-30, -38); ctx.lineTo(18, -38); ctx.quadraticCurveTo(24, -29, 18, -20); ctx.lineTo(-30, -20); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(8, -38, 1.2, 18);
      ctx.fillStyle = 'rgba(220,220,220,.5)'; for (let x = -26; x < 8; x += 4) ctx.fillRect(x, -36.6, .8, .8);
      ctx.fillStyle = '#c9a227'; ctx.fillRect(-12, -36, 30, 1.4); ctx.fillRect(-28, -23, 36, 1);
      const stack = ctx.createLinearGradient(18, 0, 25, 0); stack.addColorStop(0, '#111'); stack.addColorStop(.6, '#4a4a4a'); stack.addColorStop(1, '#1a1a1a');
      ctx.fillStyle = stack; ctx.fillRect(18, -54, 7, 16); ctx.fillRect(17, -56, 9, 2.5);
      const dome = ctx.createRadialGradient(-17, -42, .5, -16, -39, 5); dome.addColorStop(0, '#e6c45a'); dome.addColorStop(1, '#7a5a10');
      ctx.fillStyle = dome; ctx.beginPath(); ctx.ellipse(-16, -38, 4, 4.5, 0, Math.PI, 0); ctx.fill();
      wheel(ctx, -22, -16, 16, '#a3262a', ang, true);
      wheel(ctx, 16, -10, 10, '#a3262a', ang * 1.6, true);
      spokes(ctx, -4, -44, 8, '#333', run ? -t * 9 : 0);
      if (run) smoke(ctx, 22, -56, t, 'rgba(60,60,60,', 1.3);
      if (mode === 'drive') person(ctx, -33, -55, '#a5493c', '#d9c07a');
      P = { x: -4, y: -44, r: 8 };
    } else if (m.type === 'power') {
      P = tractor(ctx, m, t, mode, year);
    } else if (m.type === 'thresher' || m.type === 'huller') {
      separator(ctx, 0, 0, m.body, t, run, m.brand, m.type === 'huller');
      P = { x: -34, y: -28, r: 6 };
    } else if (m.type === 'binder') {
      ctx.translate(-26, 0); grainBinder(ctx, t, mode === 'drive', BINDER_COLORS[m.brand], mode !== 'drive');
    } else if (m.type === 'baler') {
      P = balerArt(ctx, m, t, mode === 'drive', run);
    } else if (m.type === 'engine') {
      P = hitMiss(ctx, m, t, run);
    } else if (m.type === 'sawmill') {
      P = sawmill(ctx, m, t, run);
    } else if (m.id === 'chainsaw') {
      P = chainsaw(ctx, m, t, run);
    } else if (m.type === 'woodtool') {
      P = buzzSaw(ctx, m, t, run);
    }
    ctx.restore();
    return { x: x + P.x * sc, y: y + P.y * sc, r: (P.r || 4) * sc };
  }

  // ---------- hay baler: a pull-type pickup baler in side view, towed to the right ----------
  // Pickup and feed auger at the front, the bale chamber with its knotters and plunger flywheel, the chute at the back,
  // the twine balls or wire coils it ties with, and an auxiliary engine on engine-driven models. Returns the hitch point.
  const BALER_TRIM = { 'New Holland': '#e8c33a', 'John Deere': '#f2c200', McCormick: '#ece6d6', Case: '#2e2e2e', 'Massey-Harris': '#e8c33a' };
  function balerArt(ctx, m, t, drive, run) {
    const body = m.body || '#b5262a', trim = BALER_TRIM[m.brand] || '#ece6d6', spin = run ? t * 9 : 0;
    ctx.strokeStyle = tone(body, -.4); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(2, -14); ctx.lineTo(48, -9); ctx.stroke();
    ctx.fillStyle = '#2a2a2a'; ctx.beginPath(); ctx.arc(48, -9, 2.2, 0, 7); ctx.fill();
    if (!m.engine) { ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-2, -38); ctx.quadraticCurveTo(24, -30, 48, -14); ctx.stroke(); }
    // the chute and a finished bale sliding out of the chamber
    ctx.strokeStyle = '#4d4d4d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-66, -16); ctx.lineTo(-96, -4); ctx.moveTo(-66, -12); ctx.lineTo(-94, -1); ctx.stroke();
    ctx.lineWidth = 1; for (let k = 0; k < 4; k++) { const x = -70 - k * 7; ctx.beginPath(); ctx.moveTo(x, -15 + k * 2.8 + 1.4); ctx.lineTo(x, -11 + k * 2.8 + 1.4); ctx.stroke(); }
    const slide = run ? (t * .5) % 1 : .4;
    ctx.save(); ctx.translate(-66 - slide * 14, 0); baleSide(ctx, -14, -33, 14, 17, m.tie); ctx.restore();
    // the bale chamber: a long box of sheet steel with panel seams and a trim stripe
    const g = ctx.createLinearGradient(0, -37, 0, -14);
    g.addColorStop(0, tone(body, .28)); g.addColorStop(.45, body); g.addColorStop(1, tone(body, -.32));
    ctx.fillStyle = g; ctx.fillRect(-66, -36, 70, 22);
    ctx.fillStyle = 'rgba(0,0,0,.28)'; for (const x of [-50, -32, -14]) ctx.fillRect(x, -36, 1.2, 22);
    ctx.fillStyle = trim; ctx.fillRect(-66, -38, 70, 2.2);
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(-66, -35, 70, 2);
    // knotters and needles on top, and the tie supply behind them
    ctx.fillStyle = '#4a4a4a'; ctx.fillRect(-42, -45, 18, 8);
    ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-38, -45); ctx.lineTo(-34, -50); ctx.moveTo(-28, -45); ctx.lineTo(-24, -50); ctx.stroke();
    ctx.fillStyle = tone(body, -.2); ctx.fillRect(-62, -48, 16, 11);
    for (let k = 0; k < 2; k++) {
      const cx = -58 + k * 8, cy = -43;
      if (m.tie === 'wire') { ctx.strokeStyle = '#a7adb3'; ctx.lineWidth = 1.2; for (const r of [1.5, 2.6, 3.4]) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke(); } }
      else { ctx.fillStyle = '#d9c38a'; ctx.beginPath(); ctx.arc(cx, cy, 3.4, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(120,90,40,.6)'; ctx.lineWidth = .6; ctx.beginPath(); ctx.arc(cx, cy, 2.2, 0, 7); ctx.stroke(); }
    }
    // the pickup and feed auger at the front, its tines turning when it runs
    ctx.fillStyle = tone(body, -.12); ctx.beginPath(); ctx.moveTo(2, -28); ctx.lineTo(30, -17); ctx.lineTo(33, -5); ctx.lineTo(4, -7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = trim; ctx.fillRect(3, -31, 22, 4);
    ctx.save(); ctx.translate(20, -5); ctx.rotate(spin * 1.4);
    ctx.strokeStyle = '#7d7d7d'; ctx.lineWidth = 1.1;
    for (let k = 0; k < 8; k++) { ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(9, 1.5); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = '#3a3a3a'; ctx.beginPath(); ctx.arc(20, -5, 4, 0, 7); ctx.fill();
    if (m.engine) {
      const eg = ctx.createLinearGradient(8, 0, 32, 0); eg.addColorStop(0, tone(body, -.25)); eg.addColorStop(1, tone(body, .15));
      ctx.fillStyle = eg; ctx.fillRect(6, -52, 24, 20);
      ctx.fillStyle = '#2b2b2b'; for (let k = 0; k < 4; k++) ctx.fillRect(25, -49 + k * 4, 4, 2);
      ctx.fillStyle = '#222'; ctx.fillRect(12, -58, 2.5, 7);
      if (run) smoke(ctx, 13, -60, t, 'rgba(70,70,70,', .45);
    }
    // the plunger flywheel
    spokes(ctx, -4, -40, 9, '#3b3b3b', -spin * 1.6);
    wheel(ctx, -18, -10, 10, trim, drive ? t * 7 : 0, false);
    return { x: 48, y: -9, r: 3 };
  }
  // A small square bale in side view at (x, y) of width w and height h, with its two ties.
  function baleSide(ctx, x, y, w, h, tie = 'twine') {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#b8bf78'); g.addColorStop(1, '#848c4a');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(70,80,30,.5)'; ctx.lineWidth = .6; ctx.beginPath();
    for (let k = 1; k < 4; k++) { ctx.moveTo(x + 1, y + k * h / 4); ctx.lineTo(x + w - 1, y + k * h / 4 + .8); }
    ctx.stroke();
    ctx.fillStyle = tie === 'wire' ? '#8d949a' : '#c9a35c';
    ctx.fillRect(x + w * .28, y, .9, h); ctx.fillRect(x + w * .68, y, .9, h);
  }

  // ---------- wood machinery ----------
  function blade(ctx, x, y, r, ang) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    const n = Math.max(12, Math.round(r * 1.6));
    ctx.fillStyle = '#c9ccd0'; ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2, b = (i + .5) / n * Math.PI * 2;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.lineTo(Math.cos(b) * r * .86, Math.sin(b) * r * .86);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.arc(0, 0, r * .55, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, r * .7, -.6, .4); ctx.stroke();
    ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(0, 0, Math.max(1.2, r * .12), 0, 7); ctx.fill();
    ctx.restore();
  }
  function flywheel(ctx, x, y, r, ang, color) {
    ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke();
    ctx.rotate(ang); ctx.lineWidth = 1.6;
    for (let k = 0; k < 6; k++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r, 0); ctx.stroke(); }
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(0, 0, 2, 0, 7); ctx.fill();
    ctx.restore();
  }
  function hitMiss(ctx, m, t, run) {
    const ang = run ? -t * 6 : 0;
    ctx.fillStyle = '#5a4332'; ctx.fillRect(-20, -4, 40, 4);
    flywheel(ctx, -6, -16, 12, ang + .3, '#5e1518');
    ctx.fillStyle = m.body; ctx.fillRect(-10, -18, 18, 14); ctx.fillRect(6, -15, 12, 8);
    ctx.fillStyle = '#7d1c20'; ctx.fillRect(4, -24, 14, 7);
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(4, -24, 14, 2);
    ctx.fillStyle = '#333'; ctx.fillRect(17, -13, 3, 4);
    flywheel(ctx, -11, -16, 12, ang, m.body);
    // the "hit": a puff every few turns
    if (run && Math.floor(t * 2) % 3 === 0) smoke(ctx, 18, -26, t, 'rgba(90,90,90,', .35);
    return { x: -11, y: -16, r: 12 };
  }
  function sawmill(ctx, m, t, run) {
    const big = m.perDay > 2, cx = run ? Math.sin(t * .7) * 16 : 0;
    ctx.fillStyle = '#5a4332'; ctx.fillRect(-62, -8, 124, 5);
    for (let x = -58; x < 62; x += 14) ctx.fillRect(x, -3, 4, 3);
    ctx.fillStyle = m.body; ctx.fillRect(-8 + cx, -14, 62, 6);
    ctx.fillStyle = '#7a5230'; ctx.fillRect(-4 + cx, -27, 56, 13);
    ctx.strokeStyle = 'rgba(60,35,15,.6)'; ctx.lineWidth = 1;
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(-2 + cx, -24 + k * 3); ctx.lineTo(50 + cx, -24 + k * 3 + (k % 2)); ctx.stroke(); }
    ctx.fillStyle = '#d9b380'; ctx.beginPath(); ctx.ellipse(52 + cx, -20.5, 3, 6.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#3d2d22'; for (const k of [4, 24, 44]) ctx.fillRect(k + cx, -30, 3, 16);
    ctx.fillStyle = '#e3c58a'; ctx.beginPath(); ctx.ellipse(-50, -3, 13, 7, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#4a4a4a'; ctx.fillRect(-32, -16, 16, 10);
    blade(ctx, -22, -21, big ? 18 : 14, run ? -t * 16 : 0);
    if (run) {
      for (let k = 0; k < 10; k++) {
        const ph = (t * 2 + k / 10) % 1;
        ctx.fillStyle = `rgba(230,200,140,${.8 * (1 - ph)})`;
        ctx.fillRect(-30 - ph * 22 + Math.sin(k) * 3, -12 - ph * 6 + Math.cos(k * 2) * 3, 2, 2);
      }
    }
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(-40, -14, 5, 0, 7); ctx.fill();
    ctx.strokeStyle = '#4a4a4a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-40, -14); ctx.lineTo(-22, -21); ctx.stroke();
    return { x: -40, y: -14, r: 5 };
  }
  function buzzSaw(ctx, m, t, run) {
    ctx.strokeStyle = '#5a4332'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(-10, -18); ctx.moveTo(14, 0); ctx.lineTo(8, -18); ctx.stroke();
    ctx.fillStyle = m.body; ctx.fillRect(-16, -21, 28, 4);
    ctx.fillStyle = '#8a7350'; ctx.fillRect(2, -27, 18, 3);
    blade(ctx, -2, -25, 11, run ? -t * 14 : 0);
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(-14, -19, 4, 0, 7); ctx.fill();
    return { x: -14, y: -19, r: 4 };
  }
  function chainsaw(ctx, m, t, run) {
    ctx.fillStyle = m.body; ctx.fillRect(-17, -12, 15, 10);
    ctx.fillStyle = '#333'; ctx.fillRect(-15, -9, 6, 4);
    ctx.strokeStyle = '#222'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(-10, -12, 5, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = '#b8bcc0'; ctx.fillRect(-2, -9, 20, 4); ctx.beginPath(); ctx.arc(18, -7, 2, 0, 7); ctx.fill();
    ctx.strokeStyle = '#444'; ctx.lineWidth = 1; ctx.setLineDash([2, 1.5]); ctx.lineDashOffset = run ? -t * 40 : 0;
    ctx.strokeRect(-2, -9.5, 21, 5); ctx.setLineDash([]);
    if (run) smoke(ctx, -16, -12, t, 'rgba(120,120,120,', .25);
    return { x: -9, y: -7 };
  }
  function woodpile(ctx, x, y, cords, season) {
    if (cords < .5) return;
    const len = Math.min(64, 10 + cords * 3), rows = Math.min(4, 1 + Math.floor(cords / 6));
    ctx.lineWidth = .8;
    for (let r = 0; r < rows; r++) {
      for (let cx = x + (r % 2) * 2.5; cx <= x + len; cx += 5) {
        ctx.fillStyle = '#c89a62'; ctx.beginPath(); ctx.arc(cx, y - 3 - r * 5, 2.6, 0, 7); ctx.fill();
        ctx.strokeStyle = '#7a5530'; ctx.stroke();
      }
    }
    if (season === 'winter') { ctx.fillStyle = '#fff'; ctx.fillRect(x - 3, y - 8 - (rows - 1) * 5, len + 6, 3); }
  }
  function lumberPile(ctx, x, y, mbf, season) {
    if (mbf < .3) return;
    const layers = Math.min(9, Math.ceil(mbf / 2));
    ctx.fillStyle = '#5a4332'; ctx.fillRect(x + 2, y - 3, 4, 3); ctx.fillRect(x + 44, y - 3, 4, 3);
    for (let k = 0; k < layers; k++) {
      const ly = y - 6 - k * 4;
      ctx.fillStyle = k % 2 ? '#d8b77e' : '#cfa96c'; ctx.fillRect(x, ly, 50, 3);
      ctx.fillStyle = '#7a5a35'; for (const sx of [3, 23, 43]) ctx.fillRect(x + sx, ly + 3, 3, 1);
    }
    if (season === 'winter') { ctx.fillStyle = '#fff'; ctx.fillRect(x - 1, y - 8 - (layers - 1) * 4, 52, 2); }
  }
  function logDeck(ctx, x, y, n) {
    for (let k = 0; k < n; k++) {
      const r = k < 4 ? 0 : k < 7 ? 1 : 2, i = r === 0 ? k : r === 1 ? k - 4 : k - 7;
      const cx = x + i * 11 + r * 5.5, cy = y - 5 - r * 9;
      ctx.fillStyle = '#6b4a2a'; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, 7); ctx.fill();
      ctx.fillStyle = '#d9b380'; ctx.beginPath(); ctx.arc(cx, cy, 3.6, 0, 7); ctx.fill();
    }
  }
  // ---------- plows ----------
  const plowLength = (n, mounted) => (mounted ? 4 : 12) + 10 + 7 * n;
  // A gang plow pulled to the right from the drawbar at (hx, hy); its bottoms bite into the ground at gy
  function plow(ctx, hx, hy, gy, n, t, color, mounted) {
    const fx = hx - (mounted ? 4 : 12), bx = hx - plowLength(n, mounted);
    ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(fx, gy - 8); ctx.stroke();
    ctx.fillStyle = color; ctx.fillRect(bx, gy - 10, fx - bx, 2.5);
    for (let i = 0; i < n; i++) {
      const x = fx - 8 - i * 7;
      ctx.fillStyle = color; ctx.fillRect(x - 1, gy - 8, 1.8, 6);
      ctx.fillStyle = '#6d7880';
      ctx.beginPath(); ctx.moveTo(x + 4, gy + 2); ctx.quadraticCurveTo(x - 2, gy + 2, x - 5, gy - 4); ctx.lineTo(x - 2, gy - 4); ctx.lineTo(x + 1, gy - 1); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(220,228,232,.8)'; ctx.lineWidth = .7; ctx.beginPath(); ctx.moveTo(x + 3, gy + 1.4); ctx.quadraticCurveTo(x - 1.5, gy + 1, x - 4, gy - 3); ctx.stroke();
      // the slice of sod curling off the moldboard
      const curl = Math.sin(t * 9 + i * 1.7) * .3;
      ctx.fillStyle = '#4e3119'; ctx.beginPath(); ctx.arc(x - 6, gy - 2, 2.8, -Math.PI / 2 + curl, Math.PI / 2 + curl); ctx.fill();
    }
    if (!mounted) {
      ctx.strokeStyle = color; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(fx - 3, gy - 10); ctx.lineTo(fx - 8, gy - 19); ctx.stroke();
      wheel(ctx, fx, gy - 4.5, 4.5, '#3d3d3d', t * 5.5, true);
      wheel(ctx, bx + 2, gy - 3.5, 3.5, '#3d3d3d', t * 7, true);
    }
    for (let k = 0; k < 8; k++) {
      const ph = (t * 2.2 + k / 8) % 1, x = fx - 12 - (k % n) * 7 - ph * 10;
      ctx.fillStyle = `rgba(78,49,25,${.8 * (1 - ph)})`; ctx.fillRect(x, gy - 4 - Math.sin(ph * Math.PI) * 6, 1.6, 1.6);
    }
  }
  // Turned furrows behind the plow, from the headland at x0 to the plow at x1
  function furrows(ctx, x0, x1, gy, w) {
    if (x1 <= x0) return;
    ctx.fillStyle = 'rgba(80,50,25,.6)'; ctx.fillRect(x0, gy - 2, x1 - x0, w);
    ctx.strokeStyle = 'rgba(50,30,14,.55)'; ctx.lineWidth = .8;
    for (let y = gy - 1; y < gy - 2 + w; y += 2.2) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); }
  }
  // A one-bottom walking plow behind the team; the plowman holds the handles
  function walkingPlow(ctx, hx, hy, gy, t) {
    const x = hx - 12;
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(x + 3, gy - 7); ctx.stroke();
    ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 4, gy - 8); ctx.lineTo(x - 1, gy - 2); ctx.stroke();
    ctx.fillStyle = '#6d7880';
    ctx.beginPath(); ctx.moveTo(x + 4, gy + 2); ctx.quadraticCurveTo(x - 2, gy + 2, x - 5, gy - 4); ctx.lineTo(x - 2, gy - 4); ctx.lineTo(x + 1, gy - 1); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x - 2, gy - 3); ctx.lineTo(x - 11, gy - 13); ctx.moveTo(x, gy - 4); ctx.lineTo(x - 9, gy - 14); ctx.stroke();
    const curl = Math.sin(t * 7) * .3;
    ctx.fillStyle = '#4e3119'; ctx.beginPath(); ctx.arc(x - 6, gy - 2, 2.8, -Math.PI / 2 + curl, Math.PI / 2 + curl); ctx.fill();
  }

  // ---------- homestead scenery: each town has its own look ----------
  function pine(ctx, x, y, r, season) {
    const rr = Math.max(2, Math.round(r * 2) / 2), v = Math.abs(Math.round(x)) % 4, winter = season === 'winter';
    stamp(ctx, sprite(`pine|${winter}|${rr}|${v}`, rr * 2.2, rr * 3, rr * 1.1, rr * 2.6, g => {
      g.fillStyle = 'rgba(20,16,10,.18)'; g.beginPath(); g.ellipse(-rr * .3, rr * .32, rr * .7, rr * .12, 0, 0, 7); g.fill();
      trunk(g, rr, -rr * .6, rr * .34, .1);
      // drooping boughs in tiers, shaded on the left, sunlit on the right
      const tiers = 6;
      for (let k = 0; k < tiers; k++) {
        const u = k / (tiers - 1), yy = rr * .1 - u * rr * 2.05, w = rr * (.95 - u * .72) * (.92 + pr(v * 9 + k) * .16);
        const gr = g.createLinearGradient(-w, 0, w, 0);
        gr.addColorStop(0, '#1d3a24'); gr.addColorStop(.55, '#2c5636'); gr.addColorStop(1, '#4b7a4c');
        g.fillStyle = gr; g.beginPath(); g.moveTo(-w, yy + rr * .12);
        g.quadraticCurveTo(-w * .4, yy - rr * .22, 0, yy - rr * .62); g.quadraticCurveTo(w * .4, yy - rr * .22, w, yy + rr * .12);
        g.quadraticCurveTo(0, yy - rr * .02, -w, yy + rr * .12); g.fill();
        if (winter) {
          g.fillStyle = 'rgba(250,252,255,.92)'; g.beginPath(); g.moveTo(-w * .85, yy + rr * .02);
          g.quadraticCurveTo(-w * .35, yy - rr * .26, 0, yy - rr * .58); g.quadraticCurveTo(w * .35, yy - rr * .26, w * .85, yy + rr * .02);
          g.quadraticCurveTo(0, yy - rr * .2, -w * .85, yy + rr * .02); g.fill();
        }
      }
    }), x, y);
  }
  function oak(ctx, x, y, r, color, season) {
    const rr = Math.max(3, Math.round(r)), v = Math.abs(Math.round(x)) % 3, winter = season === 'winter';
    stamp(ctx, sprite(`oak|${winter ? '' : color}|${winter}|${rr}|${v}`, rr * 4, rr * 3, rr * 2, rr * 1.9, g => {
      g.fillStyle = 'rgba(20,16,10,.2)'; g.beginPath(); g.ellipse(-rr * .4, rr * .8, rr * 1.5, rr * .2, 0, 0, 7); g.fill();
      trunk(g, rr, -rr * .4, rr * .8, .16);
      if (winter) {
        for (const [a, l] of [[-2.2, .9], [-1.75, 1.05], [-1.3, .95], [-.9, .9]]) bareBranches(g, 0, -rr * .3, rr * l * .7, a, Math.max(.9, rr * .11), 3, v * 5 + a * 3);
        return;
      }
      foliage(g, -rr * .5, -rr * .85, rr * .95, rr * .55, color, v * 11 + 3, 7);
      foliage(g, rr * .1, -rr * .7, rr * 1.45, rr * .72, color, v * 13 + 7, 11);
    }), x, y);
  }
  function church(ctx, x, y) {
    ctx.fillStyle = '#f4f1e8'; ctx.fillRect(x - 9, y - 9, 18, 9); ctx.fillRect(x + 6, y - 20, 5, 20);
    ctx.fillStyle = '#5a5f66';
    ctx.beginPath(); ctx.moveTo(x - 10, y - 9); ctx.lineTo(x, y - 15); ctx.lineTo(x + 7, y - 11); ctx.lineTo(x + 7, y - 9); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 5, y - 20); ctx.lineTo(x + 8.5, y - 33); ctx.lineTo(x + 12, y - 20); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6a8fb3'; ctx.fillRect(x - 6, y - 7, 2, 3); ctx.fillRect(x - 1, y - 7, 2, 3);
  }
  function farShed(ctx, x, y) {
    ctx.fillStyle = '#4e463f'; ctx.fillRect(x, y - 7, 30, 7);
    ctx.fillStyle = '#3a332d'; ctx.beginPath(); ctx.moveTo(x - 2, y - 7); ctx.lineTo(x + 15, y - 12); ctx.lineTo(x + 32, y - 7); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#2d2722'; ctx.lineWidth = .6; for (let k = 3; k < 30; k += 4) { ctx.beginPath(); ctx.moveTo(x + k, y - 7); ctx.lineTo(x + k, y); ctx.stroke(); }
  }
  function skiJump(ctx, x, yAt, season) {
    const top = yAt(x) - 44, end = x + 36, endY = yAt(end) - 4;
    const rampY = (px) => top + (endY - top) * Math.pow((px - x) / (end - x), .8);
    if (season === 'winter') {
      ctx.fillStyle = '#fbfcfd'; ctx.beginPath(); ctx.moveTo(end, endY); ctx.quadraticCurveTo(end + 30, endY + 6, end + 60, yAt(end + 60) + 6); ctx.lineTo(end, yAt(end) + 6); ctx.fill();
    }
    ctx.strokeStyle = '#7a6040'; ctx.lineWidth = 1;
    for (let px = x; px <= end; px += 6) { ctx.beginPath(); ctx.moveTo(px, rampY(px)); ctx.lineTo(px, yAt(px) + 2); ctx.stroke(); }
    ctx.lineWidth = 2.2; ctx.strokeStyle = season === 'winter' ? '#f4f6f8' : '#9a7a50';
    ctx.beginPath(); for (let px = x; px <= end; px += 2) ctx.lineTo(px, rampY(px)); ctx.stroke();
    ctx.fillStyle = '#7a6040'; ctx.fillRect(x - 3, top - 5, 6, 5);
  }
  function neighborSlope(ctx, yAt, season, year) {
    const cols = { spring: ['#8fbf5c', '#7d5a3a'], summer: ['#7fae4e', '#d2bf63'], fall: ['#a7b265', '#dcc27a'], winter: ['#f4f7f9', '#e3e8ec'] }[season];
    const x0 = 515, x1 = 795;
    ctx.save();
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 5) ctx.lineTo(x, yAt(x) + 5);
    for (let x = x1; x >= x0; x -= 5) ctx.lineTo(x, yAt(x) + 70);
    ctx.closePath(); ctx.clip();
    if (year >= 1934) {
      for (let b = 0; b < 7; b++) {
        ctx.fillStyle = cols[b % 2]; ctx.beginPath();
        for (let x = x0; x <= x1; x += 5) ctx.lineTo(x, yAt(x) + 5 + b * 10 + 3 * Math.sin(x / 40 + b));
        for (let x = x1; x >= x0; x -= 5) ctx.lineTo(x, yAt(x) + 15 + b * 10 + 3 * Math.sin(x / 40 + b + 1));
        ctx.closePath(); ctx.fill();
      }
    } else {
      for (let x = x0; x < x1; x += 14) { ctx.fillStyle = cols[(x / 14 | 0) % 2]; ctx.fillRect(x, 100, 14, 250); }
      if (season !== 'winter') {
        ctx.strokeStyle = '#7a5530'; ctx.lineWidth = 2; ctx.beginPath();
        for (let k = 0; k <= 12; k++) { const x = 650 + Math.sin(k * 1.7) * 6, y = yAt(650) + 6 + k * 5; ctx.lineTo(x, y); }
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  function distantWater(ctx, wy, wh, season, t) {
    const g = ctx.createLinearGradient(0, wy, 0, wy + wh);
    if (season === 'winter') { g.addColorStop(0, '#e4ecf1'); g.addColorStop(1, '#cddbe5'); }
    else { g.addColorStop(0, season === 'fall' ? '#93b2c6' : '#79a8cf'); g.addColorStop(1, '#4f7fae'); }
    ctx.fillStyle = g; ctx.fillRect(0, wy, W, wh);
    ctx.strokeStyle = season === 'winter' ? 'rgba(255,255,255,.8)' : 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
    for (let k = 0; k < 14; k++) {
      const x = (pr(k + 70) * W + t * 5) % W, y = wy + 3 + pr(k + 71) * (wh - 5);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 14 + pr(k) * 16, y); ctx.stroke();
    }
  }
  function brewery(ctx, x, y, t) {
    ctx.fillStyle = '#b9a58a'; ctx.fillRect(x - 40, y - 8, 14, 8); ctx.fillRect(x + 46, y - 7, 12, 7);
    ctx.fillStyle = '#9a4a32'; ctx.fillRect(x, y - 16, 38, 16);
    ctx.fillStyle = '#7a3524'; ctx.fillRect(x + 20, y - 25, 18, 9);
    ctx.fillStyle = '#4a4f57'; ctx.fillRect(x - 1, y - 18, 22, 2); ctx.fillRect(x + 19, y - 27, 20, 2);
    ctx.fillStyle = '#f2d48a'; for (let k = 0; k < 5; k++) ctx.fillRect(x + 3 + k * 7, y - 11, 3, 4);
    ctx.fillStyle = '#8a3c28'; ctx.fillRect(x + 6, y - 42, 4, 26);
    smoke(ctx, x + 8, y - 44, t, 'rgba(150,150,150,', .5);
  }
  function floatingLogs(ctx, wy, wh, t) {
    for (let i = 0; i < 22; i++) {
      const x = ((pr(i + 30) * W + t * (5 + pr(i) * 3)) % (W + 40)) - 20, y = wy + 4 + pr(i + 31) * (wh - 8);
      ctx.fillStyle = '#6b4a2a'; ctx.fillRect(x, y, 12, 3); ctx.fillStyle = '#c9a06a'; ctx.fillRect(x + 11, y, 1.5, 3);
    }
  }
  function island(ctx, x, by, season, p) {
    ctx.fillStyle = p.mid;
    ctx.beginPath(); ctx.moveTo(x - 64, by); ctx.quadraticCurveTo(x - 44, by - 48, x, by - 52); ctx.quadraticCurveTo(x + 42, by - 50, x + 70, by); ctx.closePath(); ctx.fill();
    ctx.fillStyle = season === 'winter' ? '#d9dde0' : '#a59f92';
    ctx.beginPath(); ctx.moveTo(x - 14, by - 47); ctx.lineTo(x + 10, by - 50); ctx.lineTo(x + 16, by - 30); ctx.lineTo(x - 8, by - 26); ctx.closePath(); ctx.fill();
    for (let i = 0; i < 9; i++) {
      const tx = x - 50 + i * 13, ty = by - 6 - Math.max(0, 40 - Math.abs(tx - x) * .8) * .8;
      if (Math.abs(tx - x) > 12) tree(ctx, tx, ty, 5 + pr(i + 90) * 3, p.trees[i % p.trees.length], season, i);
    }
    ctx.fillStyle = 'rgba(40,70,100,.18)'; ctx.fillRect(x - 64, by, 134, 4);
  }
  function steamboat(ctx, x, y, t, modern) {
    if (!modern) {
      ctx.fillStyle = '#f4f1e8'; ctx.fillRect(x, y - 5, 46, 5); ctx.fillRect(x + 6, y - 10, 32, 5); ctx.fillRect(x + 16, y - 14, 9, 4);
      ctx.fillStyle = '#3a3a3a'; ctx.fillRect(x, y - 1, 46, 1.5);
      ctx.fillStyle = '#2b2b2b'; ctx.fillRect(x + 30, y - 23, 2.5, 13); ctx.fillRect(x + 34, y - 23, 2.5, 13);
      smoke(ctx, x + 32, y - 25, t, 'rgba(70,70,70,', .45);
      spokes(ctx, x - 4, y - 4, 5, '#a3262a', t * 4);
    } else {
      ctx.fillStyle = '#3d3a36'; for (let k = 0; k < 3; k++) ctx.fillRect(x + 24 + k * 27, y - 4, 26, 4);
      ctx.fillStyle = '#b9a07a'; for (let k = 0; k < 3; k++) ctx.fillRect(x + 27 + k * 27, y - 6, 20, 2);
      ctx.fillStyle = '#f4f1e8'; ctx.fillRect(x, y - 6, 22, 6); ctx.fillRect(x + 4, y - 12, 13, 6);
      ctx.fillStyle = '#2b2b2b'; ctx.fillRect(x + 6, y - 16, 2, 4); ctx.fillRect(x + 10, y - 16, 2, 4);
      smoke(ctx, x + 8, y - 17, t, 'rgba(120,120,120,', .3);
    }
  }
  function lockDam(ctx, x, wy, wh) {
    ctx.strokeStyle = '#9a9c9e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, wy + wh - 6); ctx.lineTo(x + 70, wy + 1); ctx.stroke();
    ctx.fillStyle = '#8d8f91';
    for (let k = 0; k <= 8; k++) { const f = k / 8; ctx.fillRect(x + f * 70, wy + wh - 6 - f * (wh - 7), 3.5 - f * 1.5, 6 - f * 2.5); }
    ctx.fillStyle = '#b3b5b7'; ctx.fillRect(x - 64, wy + wh - 7, 64, 3); ctx.fillRect(x - 64, wy + wh - 2, 64, 2);
    ctx.fillStyle = '#7d7f81'; ctx.fillRect(x - 40, wy + wh - 14, 8, 7);
  }
  // Sugar Loaf above Winona: the pinnacle was left when the bluff's limestone cap was quarried away in the 1880s (quarry closed 1887)
  function sugarLoaf(ctx, x, y, season) {
    const w = season === 'winter';
    ctx.fillStyle = w ? '#dfe3e6' : '#b7ad98';
    ctx.beginPath(); ctx.moveTo(x - 13, y + 2); ctx.lineTo(x - 10, y - 30); ctx.lineTo(x - 6, y - 41); ctx.lineTo(x + 5, y - 42); ctx.lineTo(x + 9, y - 30); ctx.lineTo(x + 12, y + 2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(80,70,60,.45)'; ctx.lineWidth = 1;
    for (let k = 0; k < 5; k++) { const yy = y - 34 + k * 8; ctx.beginPath(); ctx.moveTo(x - 10, yy); ctx.lineTo(x + 9, yy + 1); ctx.stroke(); }
    if (w) { ctx.fillStyle = '#fff'; ctx.fillRect(x - 6, y - 43, 11, 2); }
  }
  // Winona on the river flats: houses, two steeples, the Bay State flour mill, and from 1911 the Watkins dome
  function riverTown(ctx, b, year, season) {
    const snow = season === 'winter';
    for (let i = 0; i < 20; i++) {
      const x = 300 + i * 17 + pr(i + 140) * 5, h = 8 + pr(i + 141) * 9, w = 12 + pr(i + 142) * 4;
      ctx.fillStyle = ['#c9b9a0', '#b8735a', '#d8cbb0', '#9c6b52'][i % 4]; ctx.fillRect(x, b - h, w, h);
      ctx.fillStyle = snow ? '#eef1f3' : '#6e4a3c';
      ctx.beginPath(); ctx.moveTo(x - 1, b - h); ctx.lineTo(x + w / 2, b - h - 5); ctx.lineTo(x + w + 1, b - h); ctx.fill();
    }
    for (const sx of [352, 522]) {
      ctx.fillStyle = '#e8e2d4'; ctx.fillRect(sx, b - 30, 7, 30);
      ctx.fillStyle = snow ? '#f4f6f7' : '#5a5f66';
      ctx.beginPath(); ctx.moveTo(sx - 1, b - 30); ctx.lineTo(sx + 3.5, b - 46); ctx.lineTo(sx + 8, b - 30); ctx.fill();
    }
    if (year >= 1911) {
      ctx.fillStyle = '#d8d0bc'; ctx.fillRect(432, b - 22, 34, 22);
      ctx.fillStyle = '#5f9b88'; ctx.beginPath(); ctx.arc(449, b - 22, 10, Math.PI, 0); ctx.fill();
      ctx.fillRect(447, b - 37, 4, 6);
    }
    ctx.fillStyle = '#9a5b42'; ctx.fillRect(606, b - 34, 30, 34);
    ctx.fillStyle = '#d9d4c8'; ctx.fillRect(638, b - 46, 16, 46);
    ctx.fillStyle = '#5a4a3a'; for (let k = 0; k < 4; k++) ctx.fillRect(609 + k * 7, b - 26, 3, 5);
  }
  // The high bridge to Wisconsin (1892); the 1942 bridge that replaced it had a taller truss
  function highBridge(ctx, wy, wh, year) {
    const x0 = 690, deck = wy + 3, a = 800, z = 930, top = year >= 1942 ? 20 : 13;
    ctx.fillStyle = '#8f8a80';
    for (let x = x0 + 30; x < W; x += 46) ctx.fillRect(x, deck, 4, wh - 3);
    ctx.strokeStyle = '#3e3e3e'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x0, deck + 8); ctx.lineTo(x0 + 40, deck); ctx.lineTo(W, deck);
    const chord = (x) => deck - top * 4 * ((x - a) / (z - a)) * (1 - (x - a) / (z - a));
    ctx.moveTo(a, deck);
    for (let x = a; x <= z; x += 5) ctx.lineTo(x, chord(x));
    for (let k = 1; k < 10; k++) {
      const x = a + (z - a) * k / 10, d = k < 5 ? -13 : 13;
      ctx.moveTo(x, deck); ctx.lineTo(x, chord(x));
      ctx.moveTo(x, deck); ctx.lineTo(x + d, chord(x + d));
    }
    ctx.stroke();
  }
  function train(ctx, y, t, year) {
    ctx.fillStyle = '#5a4a3a'; ctx.fillRect(0, y, W, 1.5);
    const x0 = ((t * 32) % (W + 520)) - 380;
    for (let k = 0; k < 6; k++) {
      const cx = x0 + k * 30;
      ctx.fillStyle = ['#7a3524', '#5a4a3a', '#6b2f22'][k % 3]; ctx.fillRect(cx, y - 10, 27, 9);
      ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(cx + 5, y - 1, 2, 0, 7); ctx.arc(cx + 22, y - 1, 2, 0, 7); ctx.fill();
    }
    const lx = x0 + 180;
    if (year < 1950) {
      ctx.fillStyle = '#1e1e1e'; ctx.fillRect(lx, y - 14, 9, 13); ctx.fillRect(lx + 9, y - 10, 20, 8); ctx.fillRect(lx + 23, y - 16, 3, 6);
      ctx.beginPath(); ctx.moveTo(lx + 29, y - 3); ctx.lineTo(lx + 33, y - 1); ctx.lineTo(lx + 29, y - 1); ctx.fill();
      ctx.fillStyle = '#a3262a'; ctx.beginPath(); ctx.arc(lx + 8, y - 3, 3.5, 0, 7); ctx.arc(lx + 17, y - 3, 3.5, 0, 7); ctx.fill();
      smoke(ctx, lx + 24, y - 18, t, 'rgba(60,60,60,', .55);
    } else {
      ctx.fillStyle = '#8a1f1f'; ctx.fillRect(lx, y - 12, 30, 11);
      ctx.fillStyle = '#e8c33a'; ctx.fillRect(lx, y - 7, 30, 2);
      ctx.fillStyle = '#9fc3dc'; ctx.fillRect(lx + 24, y - 11, 4, 3);
      ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(lx + 6, y - 1, 2, 0, 7); ctx.arc(lx + 24, y - 1, 2, 0, 7); ctx.fill();
    }
  }
  // Fills the current path as weathered rock: lit from the right, with cracks and grain.
  function rockFill(ctx, color, x0, x1, seed = 0) {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, tone(color, -.22)); g.addColorStop(.6, color); g.addColorStop(1, tone(color, .14));
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = patternFor(ctx, 'mottle', mottle); ctx.fillRect(x0 - 10, 120, x1 - x0 + 20, 240);
    ctx.globalAlpha = .35; ctx.fillStyle = patternFor(ctx, 'grain', grain); ctx.fillRect(x0 - 10, 120, x1 - x0 + 20, 240);
    ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(40,32,26,.22)'; ctx.lineWidth = 1;
    for (let k = 0; k < 14; k++) {
      const x = x0 + pr(seed + k) * (x1 - x0), y = 140 + pr(seed + k + 20) * 170;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (pr(seed + k + 3) - .5) * 6, y + 8 + pr(seed + k + 4) * 16); ctx.stroke();
    }
    ctx.restore();
  }
  function bluff(ctx, kind, season) {
    if (kind === 'none') return;
    const w = season === 'winter';
    if (kind === 'tall') {
      ctx.beginPath(); ctx.moveTo(0, 150); ctx.lineTo(55, 142); ctx.lineTo(100, 176); ctx.lineTo(150, 268); ctx.lineTo(170, 310); ctx.lineTo(0, 330);
      rockFill(ctx, w ? '#e6ebef' : season === 'fall' ? '#b89a5a' : '#a9a26a', 0, 170, 3);
      ctx.beginPath(); ctx.moveTo(8, 150); ctx.lineTo(55, 144); ctx.lineTo(82, 164); ctx.lineTo(72, 202); ctx.lineTo(18, 210); ctx.closePath();
      rockFill(ctx, w ? '#d9dde0' : '#a59f92', 8, 82, 9);
      ctx.strokeStyle = 'rgba(90,80,70,.4)'; ctx.lineWidth = 1;
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(12, 162 + k * 12); ctx.lineTo(74 - k * 2, 158 + k * 12); ctx.stroke(); }
      return;
    }
    const lime = kind === 'limestone';
    ctx.beginPath();
    if (lime) { ctx.moveTo(0, 200); ctx.lineTo(70, 196); ctx.lineTo(90, 230); ctx.lineTo(120, 300); ctx.lineTo(0, 320); }
    else { ctx.moveTo(0, 208); ctx.quadraticCurveTo(60, 190, 92, 224); ctx.lineTo(116, 298); ctx.lineTo(0, 318); }
    ctx.closePath();
    rockFill(ctx, w ? (lime ? '#d9dde0' : '#e8e1d6') : lime ? '#a59f92' : '#c4a274', 0, 120, lime ? 5 : 7);
    if (lime) {
      // Driftless dolomite: stacked ledges, each with a sunlit lip, a shadowed undercut, and vertical joints;
      // red cedars cling to the ledges (snow lies on them in winter)
      ctx.save(); ctx.clip();
      const edge = (y) => (y < 230 ? 70 + (y - 196) * (20 / 34) : 90 + (y - 230) * (30 / 70));
      for (let k = 0; k < 7; k++) {
        const y = 204 + k * 15 + pr(k + 40) * 4, x1 = edge(y) + 2 + pr(k + 41) * 4;
        const sh = ctx.createLinearGradient(0, y, 0, y + 6); sh.addColorStop(0, 'rgba(40,32,26,.38)'); sh.addColorStop(1, 'rgba(40,32,26,0)');
        ctx.fillStyle = sh; ctx.fillRect(0, y, x1, 6);
        ctx.fillStyle = w ? 'rgba(255,255,255,.9)' : 'rgba(255,246,222,.32)'; ctx.fillRect(0, y - 1.6, x1, w ? 2.2 : 1.4);
        ctx.strokeStyle = 'rgba(40,32,26,.28)'; ctx.lineWidth = .8; ctx.beginPath();
        for (let j = 0; j < 4; j++) { const jx = pr(k * 7 + j + 60) * x1; ctx.moveTo(jx, y + 1); ctx.lineTo(jx + (pr(k + j + 61) - .5) * 3, y + 13); }
        ctx.stroke();
      }
      // the sunlit right face of the bluff, and the shade at its foot
      const lit = ctx.createLinearGradient(60, 0, 120, 0); lit.addColorStop(0, 'rgba(255,246,222,0)'); lit.addColorStop(1, 'rgba(255,246,222,.22)');
      ctx.fillStyle = lit; ctx.fillRect(60, 190, 64, 130);
      const foot = ctx.createLinearGradient(0, 270, 0, 320); foot.addColorStop(0, 'rgba(30,24,18,0)'); foot.addColorStop(1, 'rgba(30,24,18,.3)');
      ctx.fillStyle = foot; ctx.fillRect(0, 270, 124, 52);
      ctx.restore();
      if (!w) for (const [cx, cy, r] of [[18, 205, 5], [52, 220, 4], [30, 250, 5.5], [74, 236, 3.6], [12, 282, 4.4]]) {
        const fill = season === 'fall' ? '#3e5a32' : '#2f5a35';
        ctx.fillStyle = 'rgba(20,16,10,.25)'; ctx.beginPath(); ctx.ellipse(cx - 1, cy + 1, r * .9, r * .3, 0, 0, 7); ctx.fill();
        ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(cx - r * .7, cy); ctx.quadraticCurveTo(cx - r * .5, cy - r * 1.4, cx, cy - r * 2.2); ctx.quadraticCurveTo(cx + r * .5, cy - r * 1.4, cx + r * .7, cy); ctx.closePath(); ctx.fill();
        ctx.fillStyle = tone(fill, .2); ctx.beginPath(); ctx.moveTo(cx, cy - r * 2.2); ctx.quadraticCurveTo(cx + r * .5, cy - r * 1.4, cx + r * .7, cy); ctx.lineTo(cx + r * .1, cy); ctx.closePath(); ctx.fill();
      }
      return;
    }
    ctx.strokeStyle = 'rgba(120,80,40,.35)'; ctx.lineWidth = 1;
    for (let k = 0; k < 6; k++) {
      ctx.beginPath();
      ctx.moveTo(0, 214 + k * 14); ctx.quadraticCurveTo(40, 210 + k * 14, 84 + k * 5, 216 + k * 14);
      ctx.stroke();
    }
  }
  function creek(ctx, season, t = 0) {
    ctx.beginPath(); ctx.moveTo(0, 500);
    ctx.bezierCurveTo(120, 488, 220, 516, 330, 506); ctx.bezierCurveTo(430, 498, 500, 520, 560, 540);
    ctx.lineTo(528, 540); ctx.bezierCurveTo(470, 528, 410, 514, 330, 520); ctx.bezierCurveTo(210, 530, 110, 504, 0, 516);
    ctx.closePath();
    waterFill(ctx, season, 490, 530, t);
  }
  function millpond(ctx, season, t) {
    const ice = season === 'winter';
    ctx.beginPath(); ctx.ellipse(250, 514, 190, 30, 0, 0, 7);
    waterFill(ctx, season, 484, 544, t);
    ctx.fillStyle = '#8a7a62'; ctx.fillRect(54, 492, 10, 40);
    if (!ice) {
      ctx.strokeStyle = 'rgba(255,255,255,.75)';
      for (let k = 0; k < 4; k++) { const ph = (t * 1.5 + k / 4) % 1; ctx.beginPath(); ctx.moveTo(52, 494 + k * 3); ctx.lineTo(46 - ph * 4, 506 + ph * 26); ctx.stroke(); }
    }
    ctx.fillStyle = '#ece4cf'; ctx.fillRect(0, 448, 40, 48);
    ctx.fillStyle = '#5a5f66'; ctx.beginPath(); ctx.moveTo(-4, 450); ctx.lineTo(20, 430); ctx.lineTo(44, 450); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6a8fb3'; ctx.fillRect(6, 460, 7, 8); ctx.fillRect(24, 460, 7, 8); ctx.fillRect(15, 476, 7, 8);
    spokes(ctx, 46, 482, 13, '#6b4a2a', ice ? 0 : t * 1.5);
    if (ice) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-4, 450); ctx.lineTo(20, 430); ctx.lineTo(44, 450); ctx.lineTo(38, 450); ctx.lineTo(20, 436); ctx.lineTo(2, 450); ctx.fill(); }
  }
  function marsh(ctx, season) {
    const pts = [[20, 488], [52, 484], [90, 480], [140, 478], [190, 486], [236, 494], [284, 496], [332, 492], [376, 490]];
    const stem = season === 'winter' ? '#b8a27a' : season === 'fall' ? '#a8914f' : '#5f8a3a';
    for (const [x, y] of pts) {
      for (let k = 0; k < 4; k++) {
        const sx = x + k * 4 - 6, h = 12 + (k % 2) * 5;
        ctx.strokeStyle = stem; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(sx, y); ctx.lineTo(sx + 1, y - h); ctx.stroke();
        if (k % 2 === 0) { ctx.fillStyle = '#5a3a22'; ctx.fillRect(sx - .5, y - h - 1, 3, 6); }
      }
    }
  }
  function fisherman(ctx, t) {
    person(ctx, 290, 480, '#556b2f', '#6b5a3a');
    const tipX = 324, tipY = 460 + Math.sin(t * 1.3) * 1.5;
    ctx.strokeStyle = '#5a4332'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(294, 478); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.strokeStyle = 'rgba(40,40,40,.6)'; ctx.lineWidth = .6; ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.lineTo(tipX + 4, 510); ctx.stroke();
  }

  function lookOf(m, year) {
    const L = m.look || {}, y = year || m.from, feat = L.feat || [];
    const red = L.redFrom && y >= L.redFrom;
    const body = red ? L.red : m.body;
    return {
      st: L.st || 'standard', label: L.label || m.brand.toUpperCase(),
      body, wheel: red ? L.red : m.wheel, sheet: L.sheet || body,
      trim: L.trim || (m.brand === 'John Deere' ? '#f2c200' : m.brand === 'Allis-Chalmers' ? '#1f1f1f' : '#f4efe0'),
      steel: !Sim.rubberTires(m, y),
      styled: L.styledFrom ? y >= L.styledFrom : !!L.styled,
      flywheel: L.flywheelTo ? y < L.flywheelTo : false,
      has: (f) => feat.includes(f),
    };
  }
  function decal(ctx, text, x, y, size, color) {
    ctx.fillStyle = color; ctx.font = `bold ${Math.max(2, size).toFixed(1)}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // on a machine drawn mirrored (facing left), the lettering still reads left to right
    const m = ctx.getTransform();
    if (m.a * m.d - m.b * m.c < 0) { ctx.save(); ctx.translate(x, y); ctx.scale(-1, 1); ctx.fillText(text, 0, 0); ctx.restore(); }
    else ctx.fillText(text, x, y);
    ctx.textBaseline = 'alphabetic';
  }
  // Fit a decal between the rear tire and the radiator
  function hoodLabel(ctx, text, x0, x1, y, k, color) {
    decal(ctx, text, (x0 + x1) / 2, y, Math.min(3 * k, (x1 - x0) / (text.length * .62)), color);
  }
  function puffs(ctx, x, y, t, k, rate, under) {
    for (let i = 0; i < 3; i++) {
      const p = (t * rate + i / 3) % 1;
      ctx.fillStyle = `rgba(60,60,60,${.5 * (1 - p)})`;
      ctx.beginPath(); ctx.arc(x - p * 10 * k, y + (under ? p * 2 * k : -p * 16 * k), (1.5 + p * 4) * k * .8, 0, 7); ctx.fill();
    }
  }
  // Painted sheet metal between y0 and y1: a bright crown where the hood rounds over, a crisp highlight, and a darker, dusty belly.
  function metal(ctx, color, y0, y1) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, tone(color, .3)); g.addColorStop(.16, tone(color, .42)); g.addColorStop(.24, tone(color, .1));
    g.addColorStop(.55, color); g.addColorStop(1, tone(color, -.3));
    return g;
  }  function fender(ctx, cx, cy, r, w, color, a0 = Math.PI * 1.02, a1 = Math.PI * 1.98) {
    const g = ctx.createRadialGradient(cx + r * .3, cy - r * .6, r * .2, cx, cy, r + w);
    g.addColorStop(0, tone(color, .35)); g.addColorStop(.7, color); g.addColorStop(1, tone(color, -.25));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r + w, a0, a1); ctx.arc(cx, cy, r, a1, a0, true); ctx.closePath(); ctx.fill();
  }
  let seatRider = false;
  function seatAndWheel(ctx, sx, sy, wx, wy, k, colX, colY) {
    if (seatRider) {
      ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 2.2 * k; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sx, sy - .5 * k); ctx.lineTo(sx + 5 * k, sy - .5 * k); ctx.lineTo(sx + 6 * k, sy + 5 * k); ctx.stroke();
      ctx.fillStyle = '#3b5998'; ctx.fillRect(sx - 2 * k, sy - 9 * k, 4.5 * k, 9 * k);
      ctx.strokeStyle = '#3b5998'; ctx.lineWidth = 1.6 * k; ctx.beginPath(); ctx.moveTo(sx + 1.5 * k, sy - 7.5 * k); ctx.lineTo(wx, wy); ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.fillStyle = '#e8c3a0'; ctx.beginPath(); ctx.arc(sx + .5 * k, sy - 11.5 * k, 2.4 * k, 0, 7); ctx.fill();
      ctx.fillStyle = '#4a3a2a'; ctx.fillRect(sx - 2.6 * k, sy - 13.8 * k, 6.2 * k, 1.2 * k); ctx.fillRect(sx - 1.4 * k, sy - 16 * k, 3.8 * k, 2.4 * k);
    }
    ctx.fillStyle = '#2b2b2b';
    ctx.fillRect(sx - 3 * k, sy, 6 * k, 1.5 * k);
    ctx.fillRect(sx - 3.2 * k, sy - 3 * k, 1.2 * k, 3 * k);
    ctx.strokeStyle = '#222'; ctx.lineWidth = .9 * k;
    ctx.beginPath(); ctx.moveTo(colX, colY); ctx.lineTo(wx, wy); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(wx, wy, 3 * k, 1 * k, -.35, 0, 7); ctx.stroke();
  }
  function grille(ctx, L, x, y, w, h, k, dir) {
    const white = L.has('whiteGrille');
    ctx.fillStyle = white ? '#f4f4f0' : '#2a2a2a'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = white ? '#9a9a9a' : 'rgba(255,255,255,.18)';
    if (dir === 'h') for (let yy = y + 1 * k; yy < y + h; yy += 1.4 * k) ctx.fillRect(x, yy, w, .5 * k);
    else for (let xx = x + .8 * k; xx < x + w; xx += 1.2 * k) ctx.fillRect(xx, y, .5 * k, h);
    if (L.has('lights')) { ctx.fillStyle = '#fff6c0'; ctx.beginPath(); ctx.arc(x + w / 2, y + 1.6 * k, 1.1 * k, 0, 7); ctx.fill(); }
  }

  // Side view facing right, ground at y=0; each style draws a recognizable silhouette of its era
  function tractor(ctx, m, t, mode, year) {
    const L = lookOf(m, year);
    const k = (.72 + m.hp / 85) * (L.st === 'utility' ? .92 : L.st === 'frame' ? 1.08 : 1);
    const run = mode !== 'idle';
    const rate = m.brand === 'John Deere' ? 4.5 : 3;
    ctx.save();
    if (run) ctx.translate(0, Math.sin(t * 45) * .3 * k);
    const draw = { frame: frameTractor, unit: unitTractor, rowcrop: rowcropTractor, utility: utilityTractor }[L.st] || standardTractor;
    seatRider = mode === 'drive';
    const P = draw(ctx, m, L, k, t, run, mode === 'drive' ? t * 18 : 0, rate);
    seatRider = false;
    if (mode === 'belt' && !P.fly) spokes(ctx, P.x, P.y, 3.2 * k, '#2b2b2b', -t * 14);
    ctx.restore();
    return { ...P, r: P.r || 3.2 * k };
  }
  function frameTractor(ctx, m, L, k, t, run, roll, rate) {
    const rr = 16 * k, fr = 9 * k, rx = -16 * k, fx = 22 * k, top = -rr - 10 * k;
    if (L.has('canopy')) {
      const roofY = L.has('tower') ? -rr - 34 * k : -rr - 24 * k;
      ctx.fillStyle = '#3b3b3b';
      ctx.fillRect(rx - 7 * k, roofY - 2 * k, fx - rx + 14 * k, 2.5 * k);
      ctx.fillRect(rx - 6 * k, roofY, 1.3 * k, -roofY - rr + 2 * k);
      ctx.fillRect(fx + 4 * k, roofY, 1.3 * k, -roofY - fr);
    }
    ctx.fillStyle = '#2b2b2b'; ctx.fillRect(rx - 8 * k, -rr + 1 * k, fx - rx + 14 * k, 3 * k);
    ctx.fillStyle = metal(ctx, L.body, -rr - 14 * k, -rr + 4 * k); ctx.fillRect(-4 * k, top, 18 * k, 10 * k);
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    for (let i = 0; i < (L.has('single') ? 1 : 2); i++) ctx.fillRect(i * 7 * k, top + 2 * k, 5 * k, 6 * k);
    if (L.has('tower')) {
      const h = rr + 32 * k - fr - 2 * k;
      ctx.fillStyle = metal(ctx, L.body, -rr - 14 * k, -rr + 4 * k); ctx.fillRect(fx - 4 * k, -rr - 32 * k, 10 * k, h);
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      for (let y = -rr - 30 * k; y < -fr - 3 * k; y += 2 * k) ctx.fillRect(fx - 4 * k, y, 10 * k, .6 * k);
      decal(ctx, L.label, 5 * k, top + 5 * k, 2.6 * k, '#f2c200');
    } else if (L.has('tank')) {
      ctx.fillStyle = metal(ctx, L.body, -rr - 14 * k, -rr + 4 * k); ctx.fillRect(fx - 18 * k, top - 9 * k, 22 * k, 8 * k);
      ctx.beginPath(); ctx.ellipse(fx + 4 * k, top - 5 * k, 2 * k, 4 * k, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(fx - 18 * k, top - 2.5 * k, 22 * k, 1.5 * k);
      decal(ctx, L.label, fx - 7 * k, top - 5.5 * k, 3.4 * k, '#f4efe0');
    } else if (L.has('single')) {
      ctx.fillStyle = metal(ctx, L.body, -rr - 14 * k, -rr + 4 * k); ctx.fillRect(1 * k, top - 8 * k, 8 * k, 8 * k);
      ctx.fillStyle = '#2b2b2b'; ctx.fillRect(.5 * k, top - 8.5 * k, 9 * k, 1.2 * k);
      decal(ctx, L.label, 5 * k, top + 5 * k, 2.8 * k, '#f4efe0');
    } else {
      ctx.fillStyle = metal(ctx, L.body, -rr - 14 * k, -rr + 4 * k); ctx.fillRect(fx - 2 * k, -rr - 14 * k, 6 * k, rr + 14 * k - fr - 2 * k);
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      for (let y = -rr - 12 * k; y < -fr - 3 * k; y += 1.6 * k) ctx.fillRect(fx - 1.5 * k, y, 5 * k, .6 * k);
      ctx.fillStyle = metal(ctx, L.body, -rr - 14 * k, -rr + 4 * k); ctx.fillRect(-6 * k, top - 5 * k, 17 * k, 4.5 * k);
      decal(ctx, L.label, 5 * k, top + 5 * k, 2.5 * k, '#f2c200');
    }
    ctx.strokeStyle = '#222'; ctx.lineWidth = .8 * k; ctx.setLineDash([1.5 * k, 1 * k]);
    ctx.beginPath(); ctx.moveTo(rx - 3 * k, -rr - 6 * k); ctx.lineTo(fx, -fr); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#222'; ctx.fillRect(9 * k, top - 10 * k, 1.8 * k, 10 * k);
    if (run) puffs(ctx, 10 * k, top - 11 * k, t, k, rate * .7);
    seatAndWheel(ctx, rx - 7 * k, -rr - 6 * k, rx - 1 * k, -rr - 12 * k, k, rx - 2 * k, -rr - 3 * k);
    wheel(ctx, rx, -rr, rr, L.wheel, roll / rr, true);
    wheel(ctx, fx, -fr, fr, L.wheel, roll / fr, true);
    const P = { x: 6 * k, y: -rr - 3 * k, fly: true, r: 6 * k };
    spokes(ctx, P.x, P.y, 6 * k, '#2b2b2b', run ? -t * 10 : 0);
    return P;
  }
  function unitTractor(ctx, m, L, k, t, run, roll, rate) {
    const rr = 13 * k, fr = 8.5 * k, rx = -12 * k, fx = 20 * k;
    ctx.fillStyle = metal(ctx, L.body, -rr - 14 * k, -rr + 4 * k);
    ctx.fillRect(rx - 3 * k, -rr - 4 * k, 12 * k, 8 * k);
    ctx.fillRect(rx + 6 * k, -rr - 7 * k, fx - rx - 6 * k, 10 * k);
    ctx.fillRect(fx - 1 * k, -rr - 11 * k, 6 * k, rr + 11 * k - fr - 1 * k);
    ctx.beginPath(); ctx.arc(fx + 2 * k, -rr - 11 * k, 3 * k, Math.PI, 0); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    for (let y = -rr - 9 * k; y < -fr - 2 * k; y += 1.6 * k) ctx.fillRect(fx, y, 4 * k, .6 * k);
    ctx.fillStyle = metal(ctx, L.body, -rr - 14 * k, -rr + 4 * k); ctx.fillRect(fx - 9 * k, -rr - 13 * k, 3.5 * k, 6 * k);
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(rx + 6 * k, -rr - 7 * k, fx - rx - 6 * k, 1.2 * k);
    decal(ctx, L.label, (rx + fx) / 2 + 5 * k, -rr - 2.5 * k, 2.8 * k, '#f4efe0');
    ctx.fillStyle = '#222'; ctx.fillRect(fx - 5 * k, -rr - 12 * k, 1.5 * k, 5 * k);
    if (run) puffs(ctx, fx - 4 * k, -rr - 13 * k, t, k, rate);
    ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 1.2 * k;
    ctx.beginPath(); ctx.moveTo(rx + 2 * k, -rr - 3 * k); ctx.quadraticCurveTo(rx - 6 * k, -rr - 4 * k, rx - 6 * k, -rr - 9 * k); ctx.stroke();
    seatAndWheel(ctx, rx - 6 * k, -rr - 10 * k, rx + 2 * k, -rr - 14 * k, k, rx + 8 * k, -rr - 7 * k);
    wheel(ctx, rx, -rr, rr, L.wheel, roll / rr, true);
    wheel(ctx, fx, -fr, fr, L.wheel, roll / fr, true);
    return { x: rx + 10 * k, y: -rr - 2 * k };
  }
  function standardTractor(ctx, m, L, k, t, run, roll, rate) {
    const rr = 15 * k, fr = 9.5 * k, rx = -14 * k, fx = 25 * k, top = -rr - 9 * k, bot = -rr + 2 * k;
    ctx.fillStyle = '#2b2b2b'; ctx.fillRect(rx, -rr - 1 * k, fx - rx, 4 * k);
    ctx.fillStyle = metal(ctx, L.body, -rr - 14 * k, -rr + 4 * k);
    if (L.styled) {
      ctx.beginPath(); ctx.moveTo(rx + 3 * k, bot); ctx.lineTo(rx + 3 * k, top); ctx.lineTo(fx, top);
      ctx.quadraticCurveTo(fx + 7 * k, top, fx + 7 * k, top + 6 * k); ctx.lineTo(fx + 7 * k, -fr - 1 * k); ctx.lineTo(fx - 2 * k, -fr - 1 * k); ctx.lineTo(fx - 2 * k, bot); ctx.closePath(); ctx.fill();
      grille(ctx, L, fx + 2.5 * k, top + 3 * k, 4 * k, -fr - 2 * k - (top + 3 * k), k, m.brand === 'John Deere' ? 'h' : 'v');
    } else {
      ctx.fillRect(rx + 3 * k, top, fx - rx - 1 * k, bot - top);
      ctx.fillRect(fx + 1 * k, top - 2 * k, 6 * k, -fr - 1 * k - (top - 2 * k));
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      for (let x = fx + 2 * k; x < fx + 6.5 * k; x += 1.4 * k) ctx.fillRect(x, top, .6 * k, -fr - 3 * k - top);
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(rx + 5 * k, bot, fx - rx - 6 * k, 3 * k);
    }
    ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(rx + 3 * k, top, fx - rx - 1 * k, 1 * k);
    hoodLabel(ctx, L.label, rx + rr + 1 * k, fx, (top + bot) / 2, k, L.trim);
    ctx.fillStyle = '#222'; ctx.fillRect(fx - 7 * k, top - 8 * k, 1.8 * k, 8 * k); ctx.fillRect(fx - 12 * k, top - 5 * k, 1.6 * k, 5 * k);
    if (run) puffs(ctx, fx - 6 * k, top - 9 * k, t, k, rate);
    seatAndWheel(ctx, rx - 5 * k, -rr - 9 * k, rx + 1 * k, top - 5 * k, k, rx + 6 * k, top);
    wheel(ctx, rx, -rr, rr, L.wheel, roll / rr, L.steel);
    wheel(ctx, fx, -fr, fr, L.wheel, roll / fr, L.steel);
    if (L.has('fenders')) fender(ctx, rx, -rr, rr + .5 * k, 2.5 * k, L.body);
    if (L.flywheel) { spokes(ctx, 3 * k, bot + 1 * k, 5.5 * k, L.body, run ? -t * 10 : 0); return { x: 3 * k, y: bot + 1 * k, fly: true, r: 5.5 * k }; }
    return { x: rx + 8 * k, y: -rr - 2 * k };
  }
  function rowcropTractor(ctx, m, L, k, t, run, roll, rate) {
    const rr = 17 * k, fr = 6.5 * k, rx = -12 * k, fx = 25 * k, top = -rr - 7 * k, bot = -rr + 3 * k;
    const jd = m.brand === 'John Deere';
    ctx.fillStyle = '#2b2b2b';
    ctx.fillRect(rx, bot - 1 * k, fx - rx, 3 * k);
    ctx.fillRect(fx - 1.5 * k, bot, 3 * k, -fr - bot);
    ctx.fillStyle = metal(ctx, L.body, -rr - 14 * k, -rr + 4 * k);
    if (L.styled) {
      ctx.beginPath(); ctx.moveTo(rx + 2 * k, bot + 1 * k); ctx.lineTo(rx + 2 * k, top); ctx.lineTo(fx - 1 * k, top);
      ctx.quadraticCurveTo(fx + 6 * k, top, fx + 6 * k, top + 5 * k); ctx.lineTo(fx + 5 * k, bot + 2 * k); ctx.lineTo(rx + 8 * k, bot + 2 * k); ctx.closePath(); ctx.fill();
      grille(ctx, L, fx + 1.5 * k, top + 3 * k, 4 * k, bot - top - 1 * k, k, jd ? 'h' : 'v');
      if (L.has('panels')) { ctx.fillStyle = '#f2c200'; ctx.fillRect(rx + 3 * k, top + 3 * k, fx - rx - 4 * k, bot - top - 2 * k); }
      if (L.has('stripe')) { ctx.fillStyle = '#f2c200'; ctx.fillRect(rx + 3 * k, top + 1.6 * k, fx - rx - 4 * k, .8 * k); }
      if (L.has('whiteGrille')) { ctx.fillStyle = '#f4f4f0'; ctx.fillRect(rx + 3 * k, bot - .5 * k, fx - rx - 2 * k, 1.2 * k); }
    } else {
      ctx.fillRect(rx + 3 * k, top, fx - rx - 2 * k, bot - top - 2 * k);
      ctx.fillRect(fx + 1 * k, top - 1 * k, 5 * k, bot - top + 1 * k);
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      for (let x = fx + 2 * k; x < fx + 5.5 * k; x += 1.3 * k) ctx.fillRect(x, top + 1 * k, .6 * k, bot - top - 2 * k);
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(rx + 5 * k, bot - 2 * k, fx - rx - 6 * k, 2 * k);
    }
    hoodLabel(ctx, L.label, rx + rr + 1 * k, fx, (top + bot) / 2, k, L.has('panels') ? '#367c2b' : L.trim);
    ctx.fillStyle = '#222'; ctx.fillRect(fx - 5 * k, top - 8 * k, 1.8 * k, 8 * k);
    if (jd) ctx.fillRect(fx - 10 * k, top - 6 * k, 1.6 * k, 6 * k);
    if (run) puffs(ctx, fx - 4 * k, top - 9 * k, t, k, rate);
    const col = { x: rx + 2 * k, y: top - 6 * k };
    seatAndWheel(ctx, rx - 5 * k, -2 * rr + 2 * k, col.x, col.y, k, rx + 8 * k, top);
    wheel(ctx, rx, -rr, rr, L.wheel, roll / rr, L.steel);
    wheel(ctx, fx - 1 * k, -fr, fr, L.wheel, roll / fr, L.steel);
    wheel(ctx, fx + 1 * k, -fr, fr, L.wheel, roll / fr, L.steel);
    if (L.has('flatFenders')) {
      const fy = -2 * rr - 3 * k;
      ctx.fillStyle = metal(ctx, L.body, -rr - 14 * k, -rr + 4 * k);
      ctx.fillRect(rx - rr - 1 * k, fy, 2 * rr + 2 * k, 2.5 * k);
      ctx.fillRect(rx - rr - 1 * k, fy, 2 * k, rr - 2 * k);
      ctx.fillRect(rx + rr - 1 * k, fy, 2 * k, rr - 2 * k);
      if (L.has('lights')) { ctx.fillStyle = '#fff6c0'; ctx.beginPath(); ctx.arc(rx + rr, fy - 1 * k, 1.3 * k, 0, 7); ctx.fill(); }
    }
    if (L.has('steeringRod') && !L.styled) {
      ctx.strokeStyle = '#222'; ctx.lineWidth = .8 * k;
      ctx.beginPath(); ctx.moveTo(col.x + 2 * k, col.y + 2 * k); ctx.lineTo(fx, top - 1.5 * k); ctx.lineTo(fx, bot); ctx.stroke();
    }
    if (L.flywheel) { spokes(ctx, 4 * k, bot + 2 * k, 5 * k, L.body, run ? -t * 10 : 0); return { x: 4 * k, y: bot + 2 * k, fly: true, r: 5 * k }; }
    return { x: rx + 10 * k, y: -rr + 1 * k };
  }
  function utilityTractor(ctx, m, L, k, t, run, roll, rate) {
    const rr = 13 * k, fr = 8 * k, rx = -12 * k, fx = 20 * k, top = -rr - 9 * k;
    ctx.fillStyle = metal(ctx, L.body, -rr - 14 * k, -rr + 4 * k);
    ctx.fillRect(rx - 3 * k, -rr - 4 * k, 13 * k, 8 * k);
    ctx.fillRect(rx + 8 * k, -rr - 2 * k, fx - rx - 8 * k, 6 * k);
    ctx.fillRect(fx - 2 * k, -rr + 2 * k, 3 * k, rr - fr - 2 * k);
    ctx.fillStyle = metal(ctx, L.sheet, -rr - 14 * k, -rr + 4 * k);
    ctx.beginPath(); ctx.moveTo(rx + 6 * k, -rr - 1 * k); ctx.lineTo(rx + 6 * k, top); ctx.lineTo(fx - 2 * k, top);
    ctx.quadraticCurveTo(fx + 5 * k, top, fx + 5 * k, top + 6 * k); ctx.lineTo(fx + 5 * k, -rr + 1 * k); ctx.lineTo(fx - 3 * k, -rr + 1 * k); ctx.lineTo(fx - 3 * k, -rr - 1 * k); ctx.closePath(); ctx.fill();
    grille(ctx, L, fx + 1.5 * k, top + 4 * k, 3.5 * k, -rr + .5 * k - (top + 4 * k), k, 'v');
    ctx.fillStyle = L.has('badge') ? '#d4a017' : '#1d3a7a';
    ctx.beginPath(); ctx.ellipse(fx + 3.3 * k, top + 2.4 * k, 1.6 * k, 1.1 * k, 0, 0, 7); ctx.fill();
    decal(ctx, L.label, (rx + fx) / 2 + 3 * k, top + 4 * k, 3 * k, L.has('twoTone') ? '#b8202a' : '#e8e8e8');
    if (run) puffs(ctx, fx - 6 * k, -fr - 1 * k, t, k, rate, true);
    seatAndWheel(ctx, rx - 3 * k, -rr - 11 * k, rx + 3 * k, top - 4 * k, k, rx + 7 * k, top);
    wheel(ctx, rx, -rr, rr, L.wheel, roll / rr, L.steel);
    wheel(ctx, fx, -fr, fr, L.wheel, roll / fr, L.steel);
    fender(ctx, rx, -rr, rr + 1 * k, 3 * k, L.sheet, Math.PI * 1.0, Math.PI * 1.9);
    return { x: rx + 6 * k, y: -rr - 1 * k };
  }
  function spokes(ctx, x, y, r, color, ang) {
    ctx.save(); ctx.translate(x, y);
    const g = ctx.createRadialGradient(r * .3, -r * .35, r * .05, 0, 0, r);
    g.addColorStop(0, tone(color, .3)); g.addColorStop(1, tone(color, -.1));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.arc(0, 0, r * .75, 0, 7); ctx.fill();
    ctx.rotate(ang); ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(.8, r * .14);
    for (let i = 0; i < 6; i++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r * .8, 0); ctx.stroke(); }
    ctx.restore();
  }
  // ang = rotation in radians; 0 keeps the wheel still
  function wheel(ctx, x, y, r, color, ang, steel) {
    ctx.save(); ctx.translate(x, y);
    if (steel) {
      // a cast steel wheel: rolled rim, flat spokes, and angled cleats
      const rim = ctx.createRadialGradient(r * .3, -r * .4, r * .2, 0, 0, r);
      rim.addColorStop(0, tone(color, .25)); rim.addColorStop(.85, color); rim.addColorStop(1, tone(color, -.35));
      ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(12,8,6,.55)'; ctx.beginPath(); ctx.arc(0, 0, r * .82, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,240,220,.25)'; ctx.lineWidth = Math.max(.5, r * .04); ctx.beginPath(); ctx.arc(0, 0, r * .9, -Math.PI * .9, -Math.PI * .05); ctx.stroke();
      ctx.rotate(ang);
      ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, r * .09);
      for (let i = 0; i < 10; i++) { ctx.rotate(Math.PI / 5); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r * .84, 0); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(255,240,220,.22)'; ctx.lineWidth = Math.max(.4, r * .03);
      for (let i = 0; i < 10; i++) { ctx.rotate(Math.PI / 5); ctx.beginPath(); ctx.moveTo(r * .2, -r * .03); ctx.lineTo(r * .82, -r * .03); ctx.stroke(); }
      for (let i = 0; i < 16; i++) {
        ctx.rotate(Math.PI / 8);
        ctx.fillStyle = '#2a2724'; ctx.beginPath(); ctx.moveTo(r * .93, -r * .1); ctx.lineTo(r * 1.1, -r * .04); ctx.lineTo(r * 1.1, r * .12); ctx.lineTo(r * .93, r * .08); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(200,190,170,.25)'; ctx.fillRect(r * 1.04, -r * .04, r * .05, r * .14);
      }
    } else {
      // a pneumatic tractor tire: lugged tread, a rounded sidewall, and a painted rim
      const side = ctx.createRadialGradient(-r * .2, -r * .25, r * .5, 0, 0, r);
      side.addColorStop(0, '#3a3a3a'); side.addColorStop(.7, '#222'); side.addColorStop(1, '#0e0e0e');
      ctx.fillStyle = side; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = Math.max(.6, r * .06); ctx.beginPath(); ctx.arc(0, 0, r * .74, -Math.PI * .95, -Math.PI * .1); ctx.stroke();
      ctx.rotate(ang);
      for (let i = 0; i < 18; i++) {
        ctx.rotate(Math.PI / 9);
        ctx.fillStyle = '#2c2c2c'; ctx.beginPath(); ctx.moveTo(r * .8, -r * .08); ctx.lineTo(r * 1.02, -r * .02); ctx.lineTo(r * 1.02, r * .1); ctx.lineTo(r * .8, r * .05); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fillRect(r * .84, -r * .06, r * .16, r * .03);
      }
      const rg = ctx.createRadialGradient(r * .15, -r * .2, r * .05, 0, 0, r * .56);
      rg.addColorStop(0, tone(color, .3)); rg.addColorStop(.8, color); rg.addColorStop(1, tone(color, -.35));
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(0, 0, r * .56, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(0, 0, r * .3, 0, 7); ctx.fill();
      ctx.fillStyle = '#ddd';
      for (let i = 0; i < 6; i++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.arc(r * .42, 0, r * .04 + .3, 0, 7); ctx.fill(); }
    }
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(0, 0, Math.max(1, r * .12), 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.beginPath(); ctx.arc(-r * .03, -r * .04, Math.max(.4, r * .05), 0, 7); ctx.fill();
    ctx.restore();
  }
  function separator(ctx, x, y, body, t, running, brand, huller) { lit(ctx, x - 68, y - 92, x + 118, y + 3, c => separatorFlat(c, x, y, body, t, running, brand, huller), [x - 2, y + 2, 50, 5]); }
  function separatorFlat(ctx, x, y, body, t, running, brand, huller) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = metal(ctx, body, -34, -8); ctx.fillRect(-40, -34, 80, 26);
    ctx.fillStyle = 'rgba(0,0,0,.18)'; for (const sx of [-20, 0, 20]) ctx.fillRect(sx, -34, .8, 26);
    ctx.fillStyle = 'rgba(255,240,210,.5)'; for (let sx = -38; sx < 40; sx += 6) ctx.fillRect(sx, -32.5, .7, .7);
    ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.fillRect(-40, -34, 80, 5);
    ctx.fillStyle = '#5a4a3a'; ctx.beginPath(); ctx.moveTo(-40, -22); ctx.lineTo(-62, -14); ctx.lineTo(-62, -10); ctx.lineTo(-40, -16); ctx.fill();
    ctx.strokeStyle = '#555'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(38, -16); ctx.lineTo(70, -62); ctx.stroke();
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(10, -34); ctx.lineTo(16, -50); ctx.lineTo(28, -50); ctx.stroke();
    wheel(ctx, -26, -6, 8, '#7a1e18', 0, true);
    wheel(ctx, 26, -6, 8, '#7a1e18', 0, true);
    // main drive pulley on the cylinder shaft; a small pulley beside it belts the blower fan low at the back
    spokes(ctx, -34, -28, 6, '#333', running ? -t * 10 : 0);
    ctx.fillStyle = body; ctx.beginPath(); ctx.arc(37, -14, 7.5, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.arc(37, -14, 7.5, 0, 7); ctx.fill();
    spokes(ctx, 37, -14, 4, '#3a3a3a', running ? -t * 22 : 0);
    ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(-34, -28, 3, 0, 7); ctx.fill();
    belt(ctx, -34, -28, 37, -14, t, { r1: 3, r2: 4, width: 1.2, dash: [3, 2], speed: running ? 40 : 0 });
    ctx.fillStyle = '#f2e3b8'; ctx.font = 'bold 6px Georgia'; ctx.textAlign = 'center';
    ctx.fillText(huller ? 'CLOVER HULLER' : brand === 'Case' ? 'J.I. CASE T.M. CO.' : 'McCORMICK-DEERING', 0, -17.5);
    if (running) {
      for (let k = 0; k < 14; k++) {
        const ph = (t * 1.5 + k / 14) % 1;
        ctx.fillStyle = huller ? `rgba(120,70,60,${.7 * (1 - ph)})` : `rgba(230,200,110,${.8 * (1 - ph)})`;
        ctx.fillRect(70 + ph * 40 + Math.sin(k) * 6, -62 + ph * 20 + Math.cos(k * 3) * 8, 3, 2);
      }
    }
    ctx.restore();
  }
  // A separator (or huller) seen end-on from the feeder, for a narrow stall in the machine shed (ground at y, about
  // 46 wide and 64 tall at sc 1): the self-feeder trough toward us, the steel wheels edge-on at the sides, the drive
  // pulley on the cylinder shaft at the left, the grain elevator and bagger at the right, and the wind stacker behind.
  function separatorFront(ctx, cx, y, body, brand, huller, sc = 1) {
    lit(ctx, cx - 30 * sc, y - 66 * sc, cx + 30 * sc, y + 2 * sc, c => {
      c.save(); c.translate(cx, y); c.scale(sc, sc);
      // the wind stacker, rising and swinging back behind the body, with its hood
      const pg = c.createLinearGradient(-4, 0, 4, 0); pg.addColorStop(0, '#3e3e3e'); pg.addColorStop(.55, '#7a7a7a'); pg.addColorStop(1, '#3a3a3a');
      c.fillStyle = pg; c.beginPath(); c.moveTo(-3.6, -36); c.lineTo(-2.6, -58); c.lineTo(2.6, -58); c.lineTo(3.6, -36); c.closePath(); c.fill();
      c.fillStyle = '#4a4a4a'; c.beginPath(); c.ellipse(0, -59, 4.6, 2.4, 0, 0, 7); c.fill();
      c.fillStyle = '#1c1c1c'; c.beginPath(); c.ellipse(0, -59.4, 3, 1.3, 0, 0, 7); c.fill();
      c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = .4; c.beginPath(); for (const py of [-42, -48, -54]) { c.moveTo(-3.3, py); c.lineTo(3.3, py); } c.stroke();
      // the body: sheet-steel sides seen end-on, a rounded top, and rivet lines
      const bg = c.createLinearGradient(-15, 0, 15, 0); bg.addColorStop(0, tone(body, -.32)); bg.addColorStop(.6, tone(body, .1)); bg.addColorStop(1, tone(body, -.22));
      c.fillStyle = bg; c.beginPath(); c.moveTo(-15, -8); c.lineTo(-15, -34); c.quadraticCurveTo(-15, -39, 0, -39.5); c.quadraticCurveTo(15, -39, 15, -34); c.lineTo(15, -8); c.closePath(); c.fill();
      c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(-15, -12, 30, 4);
      c.fillStyle = 'rgba(255,240,210,.45)'; for (let px = -13; px < 14; px += 4) { c.fillRect(px, -37, .6, .6); c.fillRect(px, -10.6, .6, .6); }
      c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(6, -37, 2.4, 27);
      // the maker's name across the front panel
      c.fillStyle = '#f2e3b8'; c.font = 'bold 3px Georgia'; c.textAlign = 'center';
      if (huller) c.fillText('CLOVER HULLER', 0, -33);
      else if (brand === 'Case') { c.fillText('J.I. CASE', 0, -34.2); c.font = 'bold 2.4px Georgia'; c.fillText('T.M. CO.', 0, -31.4); }
      else { c.font = 'bold 2.6px Georgia'; c.fillText('McCORMICK-', 0, -34.4); c.fillText('DEERING', 0, -31.4); }
      // the grain elevator up the right side and the bagger spout
      c.fillStyle = tone(body, -.4); c.fillRect(15, -44, 4, 34);
      c.fillStyle = tone(body, -.15); c.fillRect(15.6, -44, 1.2, 34);
      c.fillStyle = '#5a5a5a'; c.beginPath(); c.moveTo(19, -24); c.lineTo(24, -21); c.lineTo(23, -19); c.lineTo(19, -21.4); c.closePath(); c.fill();
      // the main drive pulley on the cylinder shaft at the left, seen edge-on, and the shaft bearing
      c.fillStyle = '#2a2a2a'; c.beginPath(); c.ellipse(-17.5, -28, 1.8, 6.5, 0, 0, 7); c.fill();
      c.fillStyle = 'rgba(200,200,200,.35)'; c.fillRect(-18, -34, .6, 12);
      c.fillStyle = '#555'; c.fillRect(-16, -29, 1.5, 2);
      // the self-feeder reaching toward us: side boards, the dark throat, the conveyor slats, and its folding legs
      c.strokeStyle = '#4a3a2a'; c.lineWidth = 1; c.beginPath(); c.moveTo(-8, -14); c.lineTo(-9, -1); c.moveTo(8, -14); c.lineTo(9, -1); c.stroke();
      c.fillStyle = '#6b5640'; c.beginPath(); c.moveTo(-11, -14); c.lineTo(-9, -27); c.lineTo(9, -27); c.lineTo(11, -14); c.closePath(); c.fill();
      c.fillStyle = '#1e1712'; c.beginPath(); c.moveTo(-8.4, -16); c.lineTo(-7, -25.5); c.lineTo(7, -25.5); c.lineTo(8.4, -16); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(190,160,110,.55)'; c.lineWidth = .6; c.beginPath();
      for (let k = 0; k < 5; k++) { const yy = -17.5 - k * 1.8, hw = 8 - k * .28; c.moveTo(-hw, yy); c.lineTo(hw, yy); }
      c.stroke();
      // the band-cutter knives glinting in the throat
      c.strokeStyle = 'rgba(220,220,225,.7)'; c.lineWidth = .4; c.beginPath(); for (const kx of [-4, 0, 4]) { c.moveTo(kx - 1.2, -24); c.lineTo(kx + 1.2, -22); } c.stroke();
      c.fillStyle = tone(body, -.1); c.fillRect(-11.5, -14.8, 23, 1.6);
      // the front axle and steel wheels, edge-on at the corners, with their cleats
      c.fillStyle = '#3a3030'; c.fillRect(-18, -9, 36, 2.2);
      for (const sd of [-1, 1]) {
        const wx = sd * 19.5, wg = c.createLinearGradient(wx - 3, 0, wx + 3, 0);
        wg.addColorStop(0, '#4a1410'); wg.addColorStop(.5, '#8a2a22'); wg.addColorStop(1, '#3a0e0c');
        c.fillStyle = wg; c.beginPath(); c.ellipse(wx, -8, 3.2, 8, 0, 0, 7); c.fill();
        c.strokeStyle = 'rgba(40,20,16,.8)'; c.lineWidth = .5; c.beginPath(); for (let k = -6; k <= 6; k += 2) { c.moveTo(wx - 3, -8 + k); c.lineTo(wx + 3, -8 + k); } c.stroke();
        c.fillStyle = '#2a2a2a'; c.beginPath(); c.arc(wx - sd * 3, -8, 1.3, 0, 7); c.fill();
      }
      c.restore();
    }, [cx, y, 26 * sc, 3 * sc]);
  }
  // An endless belt looped around two pulleys. It always runs counterclockwise on screen (top strand toward the left),
  // the same way the belt pulleys spin. o: r1/r2 pulley radii, width, dash, speed (px/s), or phase (px) to set the travel directly.
  function belt(ctx, x1, y1, x2, y2, t, o = {}) {
    const r1 = o.r1 || 4, r2 = o.r2 || 4, dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len, an = Math.atan2(ny, nx);
    ctx.strokeStyle = o.color || '#4b3a2a'; ctx.lineWidth = o.width || 2;
    ctx.setLineDash(o.dash || [6, 4]);
    ctx.lineDashOffset = -(o.phase !== undefined ? o.phase : t * (o.speed !== undefined ? o.speed : 60));
    ctx.beginPath();
    ctx.moveTo(x1 + nx * r1, y1 + ny * r1);
    ctx.lineTo(x2 + nx * r2, y2 + ny * r2);
    ctx.arc(x2, y2, r2, an, an - Math.PI, true);
    ctx.lineTo(x1 - nx * r1, y1 - ny * r1);
    ctx.arc(x1, y1, r1, an + Math.PI, an, true);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  function strawStack(ctx, x, y, size, season) {
    if (size <= 0) return;
    ctx.fillStyle = season === 'winter' ? '#f0f0ea' : '#e2c46a';
    ctx.beginPath(); ctx.ellipse(x, y, 20 + size * 30, 10 + size * 26, 0, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = 'rgba(140,110,40,.5)';
    for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.arc(x, y, 10 + k * size * 5, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
  }

  function river(ctx, season, t = 0) {
    ctx.beginPath(); ctx.moveTo(0, 492);
    ctx.bezierCurveTo(150, 470, 260, 520, 420, 500); ctx.bezierCurveTo(520, 488, 560, 520, 600, 540);
    ctx.lineTo(0, 540); ctx.closePath();
    waterFill(ctx, season, 478, 540, t);
  }

  function particles(ctx, season, t, s) {
    if (season === 'winter') {
      ctx.fillStyle = '#fff'; ctx.beginPath();
      for (let i = 0; i < 120; i++) { const x = (pr(i) * W + Math.sin(t + i) * 20) % W, y = (pr(i + 50) * H + t * (20 + pr(i) * 30)) % H, r = 1.5 + pr(i + 3); ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
      ctx.fill();
    } else if (season === 'fall') {
      const cols = PAL.fall.trees;
      for (let i = 0; i < 25; i++) { const x = (pr(i) * W + t * 25) % W, y = (pr(i + 9) * 300 + t * 30 + Math.sin(t * 2 + i) * 10) % 400 + 100; ctx.fillStyle = cols[i % cols.length]; ctx.fillRect(x, y, 4, 3); }
      if (s && s.flags.wet) {
        ctx.strokeStyle = 'rgba(180,200,230,.6)';
        ctx.beginPath();
        for (let i = 0; i < 90; i++) { const x = (pr(i) * W + t * 40) % W, y = (pr(i + 40) * H + t * 400) % H; ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 10); }
        ctx.stroke();
      }
    } else if (season === 'summer') {
      ctx.strokeStyle = '#333'; ctx.lineWidth = 1.2;
      for (let i = 0; i < 4; i++) { const x = (pr(i) * W + t * 40) % W, y = 80 + pr(i + 2) * 60 + Math.sin(t * 3 + i) * 6; const f = Math.sin(t * 10 + i) * 3; ctx.beginPath(); ctx.moveTo(x - 6, y - f); ctx.lineTo(x, y); ctx.lineTo(x + 6, y - f); ctx.stroke(); }
    }
  }

  // ---------- the machine yard: shown while the Machinery tab is open ----------
  const YARD_ORDER = ['power', 'thresher', 'huller', 'binder', 'baler', 'sawmill', 'engine', 'woodtool'];
  function yardSize(m, year) {
    if (m.type === 'power') {
      if (m.kind === 'steam') return [66, 60];
      const L = lookOf(m, year), k = (.72 + m.hp / 85) * (L.st === 'utility' ? .92 : L.st === 'frame' ? 1.08 : 1);
      return [64 * k, (L.st === 'frame' ? 56 : 46) * k];
    }
    return { thresher: [134, 64], huller: [134, 64], binder: [140, 80], baler: [150, 56], sawmill: [128, 32], engine: [44, 30], woodtool: m.id === 'chainsaw' ? [40, 14] : [42, 30] }[m.type] || [60, 40];
  }
  // Relative sizes in the yard: tractors and separators stand big, the binder and the little engine sit smaller
  const YARD_SCALE = { power: 1.4, thresher: 1.35, huller: 1.35, binder: .6, engine: .65 };
  const shortName = (n) => n.replace('J.I. Case', 'Case').replace('McCormick-Deering', 'McCormick').replace(' Steam Traction Engine', ' steam engine').replace(/\s*\(.*?\)/g, '').replace(/ \(belt.*$/, '').replace(/, \d+ HP$/, '').replace(' Steel ', ' ');
  // Lay machines out left to right at one scale, shrinking the row to fit (and, under a roof, to stay below maxH);
  // labelled slots are at least wide enough for a name board. Returns the slot edges.
  function yardRow(ctx, items, x0, x1, groundY, maxSc, t, label, labelsOnly, maxH) {
    if (!items.length) return [];
    const total = items.reduce((a, it) => a + it.w + (it.gap ?? 22), 0);
    const tallest = Math.max(...items.map(it => it.h));
    const sc = Math.min(maxSc, (x1 - x0) / total, maxH ? maxH / tallest : Infinity);
    const top = groundY - tallest * sc;
    const widths = items.map(it => Math.max((it.w + (it.gap ?? 22)) * sc, 150));
    const fit = Math.min(1, (x1 - x0) / widths.reduce((a, w) => a + w, 0));
    widths.forEach((w, i) => { widths[i] = w * fit; });
    let x = x0 + ((x1 - x0) - widths.reduce((a, w) => a + w, 0)) / 2;
    const edges = [x];
    items.forEach((it, i) => {
      const w = widths[i];
      if (!labelsOnly) {
        if (it.front && it.m.type === 'power') tractorFront(ctx, x + w / 2, groundY, it.m, it.year, sc * it.k);
        else if (it.front) separatorFront(ctx, x + w / 2, groundY, it.m.body, it.m.brand, it.m.type === 'huller', sc * it.k);
        else machine(ctx, it.m.id, x + w / 2, groundY, sc * (it.k || 1), t, 'idle', it.year);
      }
      if (label) {
        const ly = typeof label === 'number' ? label : label === 'above' ? top - 22 : groundY + 5;
        ctx.font = '11px Georgia'; ctx.textAlign = 'center';
        let name = shortName(it.m.name);
        while (name.length > 5 && ctx.measureText(name).width > w - 8) name = `${name.slice(0, -2).trimEnd()}…`;
        const tw = ctx.measureText(name).width;
        ctx.fillStyle = 'rgba(40,28,18,.6)'; ctx.fillRect(x + w / 2 - tw / 2 - 4, ly, tw + 8, 15);
        ctx.fillStyle = '#f6ecd2'; ctx.fillText(name, x + w / 2, ly + 11);
      }
      x += w; edges.push(x);
    });
    return edges;
  }
  function chicken(ctx, x, y, t, i) {
    const peck = Math.max(0, Math.sin(t * 2.5 + i * 2)) * 3;
    ctx.fillStyle = '#f4f1ea'; ctx.beginPath(); ctx.ellipse(x, y, 7, 5, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 6, y - 4 + peck, 3, 0, 7); ctx.fill();
    ctx.fillStyle = '#c0392b'; ctx.fillRect(x + 5, y - 8 + peck, 3, 2);
    ctx.fillStyle = '#e0a020'; ctx.fillRect(x + 9, y - 4 + peck, 2, 1.5);
    ctx.strokeStyle = '#d08a20'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 1, y + 4); ctx.lineTo(x - 1, y + 8); ctx.moveTo(x + 2, y + 4); ctx.lineTo(x + 2, y + 8); ctx.stroke();
  }
  function machineYard(ctx, s, t, season) {
    const p = PAL[season], snow = season === 'winter', steelRoof = s.year >= 1946;
    const loc = DATA.locations.find(l => l.id === s.locId) || DATA.locations[0], look = loc.look || {};
    const [fy, fa, ff, fl] = look.far || [215, 40, .006, 2.5];
    sky(ctx, season, t);
    distantBluffs(ctx, season, fy - 10 - fa - 22);
    ridge(ctx, fy - 10, fa, ff, 1.3, p.far, fl);
    ridge(ctx, fy + 40, fa * .6, ff * 1.5, 4.2, p.mid, fl);
    meadow(ctx, 0, 300, W, H - 300, p.ground);
    ctx.fillStyle = snow ? '#e3e8ed' : season === 'fall' ? '#9c8550' : '#8a7652';
    ctx.beginPath(); ctx.ellipse(W / 2, 478, 560, 74, 0, 0, 7); ctx.fill();
    for (let i = 0; i < 3; i++) chicken(ctx, 120 + i * 46 + Math.sin(t * .4 + i) * 20, 448 + (i % 2) * 14, t, i);
    const units = s.machines.map(o => ({ o, m: DATA.machines.find(q => q.id === o.id), year: o.built || o.bought })).filter(u => u.m)
      .sort((a, b) => YARD_ORDER.indexOf(a.m.type) - YARD_ORDER.indexOf(b.m.type) || (b.m.hp || 0) - (a.m.hp || 0));
    units.forEach(u => { [u.w, u.h] = yardSize(u.m, u.year); u.k = YARD_SCALE[u.m.type] || 1; u.w *= u.k; u.h *= u.k; });
    const saw = units.find(u => u.m.id === 'chainsaw');
    const rows = units.filter(u => u !== saw);
    const shed = !!s.buildings.machine_shed;
    let sign;
    if (shed) {
      const x0 = 60, x1 = 900, eave = 258, floor = 410;
      // roof plane rising away from us, then the dark interior under it
      ctx.fillStyle = steelRoof ? '#a7aeb3' : '#6c625a';
      ctx.beginPath(); ctx.moveTo(x0 - 16, eave); ctx.lineTo(x0 + 6, eave - 62); ctx.lineTo(x1 - 6, eave - 62); ctx.lineTo(x1 + 16, eave); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = steelRoof ? 'rgba(80,88,94,.5)' : 'rgba(40,32,26,.4)'; ctx.lineWidth = 1;
      ctx.beginPath();
      if (steelRoof) for (let x = x0; x < x1; x += 9) { ctx.moveTo(x - 10, eave); ctx.lineTo(x + 6, eave - 62); }
      else for (let y = eave - 56; y < eave; y += 7) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
      ctx.stroke();
      if (snow) { ctx.fillStyle = '#f7f9fb'; ctx.beginPath(); ctx.moveTo(x0 - 16, eave - 4); ctx.lineTo(x0 + 6, eave - 66); ctx.lineTo(x1 - 6, eave - 66); ctx.lineTo(x1 + 16, eave - 4); ctx.lineTo(x1 - 4, eave - 30); ctx.lineTo(x0 + 4, eave - 30); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = '#3a2b20'; ctx.fillRect(x0, eave, x1 - x0, floor - eave + 6);
      ctx.strokeStyle = 'rgba(0,0,0,.25)';
      ctx.beginPath();
      for (let x = x0 + 10; x < x1; x += 14) { ctx.moveTo(x, eave); ctx.lineTo(x, floor); }
      ctx.stroke();
      // windows, workbench and tools on the back wall
      ctx.fillStyle = 'rgba(255,240,190,.35)';
      for (const wx of [x0 + 140, x1 - 200]) ctx.fillRect(wx, eave + 30, 40, 22);
      ctx.fillStyle = '#6b4f35'; ctx.fillRect(x1 - 150, floor - 46, 120, 7); ctx.fillRect(x1 - 146, floor - 39, 6, 39); ctx.fillRect(x1 - 40, floor - 39, 6, 39);
      ctx.strokeStyle = '#b8b8b8'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x1 - 120, eave + 30); ctx.lineTo(x1 - 120, eave + 56); ctx.moveTo(x1 - 100, eave + 28); ctx.lineTo(x1 - 92, eave + 58); ctx.stroke();
      ctx.strokeStyle = '#8a6a3e'; ctx.beginPath(); ctx.arc(x1 - 64, eave + 44, 9, 0, 7); ctx.stroke();
      ctx.fillStyle = '#4e4033'; ctx.fillRect(x0, floor, x1 - x0, 8);
      if (saw) machine(ctx, 'chainsaw', x1 - 90, floor - 46, 1.6, t, 'idle', saw.year);
      if (units.length) {
        pedestrian(ctx, 818, floor, 1.8, t, 'man', '#a5493c', '#d9c07a', -1, 0, { overalls: true, straw: true });
        ctx.strokeStyle = '#8fa6b6'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(810, 372); ctx.lineTo(790 + Math.sin(t * 2) * 7, 365); ctx.stroke();
        ctx.strokeStyle = '#d5dade'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(790 + Math.sin(t * 2) * 7, 365); ctx.lineTo(785 + Math.sin(t * 2) * 7, 358); ctx.stroke();
      }
      // the bigger machines go inside; any extras are parked out front. Tractors and separators back in, so seen from
      // the front they take a narrow stall and leave room for more machines under the roof.
      for (const u of rows) {
        if (u.m.type === 'power' && u.m.kind !== 'steam') {
          const k = Math.min(1.25, yardSize(u.m, u.year)[0] / 64 * 1.05);
          Object.assign(u, { front: true, k, w: 66 * k, h: 64 * k, gap: 14 });
        } else if (u.m.type === 'thresher' || u.m.type === 'huller') Object.assign(u, { front: true, k: 1.35, w: 50 * 1.35, h: 62 * 1.35, gap: 14 });
      }
      const inside = [], front = [];
      let used = 0;
      for (const u of rows) { if (used + u.w + (u.gap ?? 22) <= 800 / 1.75 || !inside.length) { inside.push(u); used += u.w + (u.gap ?? 22); } else front.push(u); }
      const edges = yardRow(ctx, inside, x0 + 12, x1 - 12, floor, 2.1, t, false, false, floor - eave - 14);
      ctx.fillStyle = 'rgba(25,15,8,.2)'; ctx.fillRect(x0, eave, x1 - x0, floor - eave + 8);
      yardRow(ctx, inside, x0 + 12, x1 - 12, floor, 2.1, t, eave + 9, true, floor - eave - 14);
      // posts between the bays and the fascia board
      ctx.fillStyle = steelRoof ? '#8f969b' : '#5a4130';
      for (const px of [x0, ...edges.slice(1, -1), x1]) ctx.fillRect(px - 4, eave, 8, floor - eave + 6);
      ctx.fillStyle = '#9b2d22'; ctx.fillRect(x0 - 16, eave - 4, x1 - x0 + 32, 14);
      ctx.fillStyle = '#f3e6c4'; ctx.font = 'bold 11px Georgia'; ctx.textAlign = 'center';
      ctx.fillText('N. KNUTSON  ·  MACHINE SHED', W / 2, eave + 7);
      yardRow(ctx, front, 40, 920, 500, 1.6, t, true);
      sign = `Your machine shed: ${units.length} machine${units.length === 1 ? '' : 's'} out of the weather`;
    } else {
      // no shed: parked out by the barn, in the weather
      const bx = -40, by = 196;
      stones(ctx, bx, by + 186, bx + 300, by + 202, 77);
      boards(ctx, bx, by, bx + 300, by + 188, '#9c2b25', 10, 61);
      ctx.fillStyle = 'rgba(26,8,6,.4)'; ctx.fillRect(bx, by, 300, 10);
      ctx.beginPath(); ctx.moveTo(bx - 10, by + 4); ctx.lineTo(bx + 60, by - 60); ctx.lineTo(bx + 240, by - 60); ctx.lineTo(bx + 312, by + 4); ctx.closePath();
      shingles(ctx, '#4a4347', by - 60, by + 4, 71, 'nonzero', bx - 12, bx + 314);
      if (snow) { ctx.fillStyle = '#f7f9fb'; ctx.fillRect(bx + 50, by - 64, 200, 8); }
      boards(ctx, bx + 120, by + 80, bx + 210, by + 200, '#94271f', 10, 63);
      ctx.strokeStyle = '#efe9dc'; ctx.lineWidth = 3; ctx.strokeRect(bx + 120, by + 80, 90, 120);
      ctx.beginPath(); ctx.moveTo(bx + 120, by + 80); ctx.lineTo(bx + 210, by + 200); ctx.moveTo(bx + 210, by + 80); ctx.lineTo(bx + 120, by + 200); ctx.stroke();
      // a rail fence well behind the parked machines, small with the distance
      ctx.strokeStyle = '#7a6448'; ctx.lineWidth = 1.6;
      for (const y of [314, 323]) { ctx.beginPath(); ctx.moveTo(262, y); ctx.lineTo(W, y + 2); ctx.stroke(); }
      ctx.fillStyle = '#6b5440'; for (let x = 268; x < W; x += 34) ctx.fillRect(x, 305 + (x - 268) / 350, 3, 26);
      ctx.fillStyle = 'rgba(40,30,20,.18)'; for (let x = 268; x < W; x += 34) ctx.fillRect(x - 2, 331, 7, 2);
      const back = [], front = [];
      let used = 0;
      for (const u of rows) { if (used + u.w + 22 <= 640 / 1.5 || !back.length) { back.push(u); used += u.w + 22; } else front.push(u); }
      yardRow(ctx, back, 270, 930, 405, 1.6, t, front.length ? 'above' : true);
      if (units.length) {
        const worker = patrol(t + 4, 70, 180, 13);
        pedestrian(ctx, worker.x, 431, 1.6, t, 'man', '#a5493c', '#d9c07a', worker.dir, worker.walking, { overalls: true, straw: true });
      }
      yardRow(ctx, front, 40, 920, 505, 1.6, t, true);
      if (saw) { ctx.fillStyle = '#6b4a2a'; ctx.fillRect(208, 470, 30, 22); ctx.fillStyle = '#d9b380'; ctx.beginPath(); ctx.ellipse(223, 470, 15, 4, 0, 0, 7); ctx.fill(); machine(ctx, 'chainsaw', 224, 470, 1.4, t, 'idle', saw.year); }
      sign = units.length ? `Parked out by the barn, in the weather. A Machine Shed cuts repairs 40%.` : 'No machinery yet. Open the Machinery Dealer to buy some.';
    }
    ctx.font = 'bold 15px Georgia'; ctx.textAlign = 'center';
    const tw = ctx.measureText(sign).width;
    ctx.fillStyle = '#7a5a36'; ctx.fillRect(W / 2 - tw / 2 - 16, 16, tw + 32, 30);
    ctx.strokeStyle = '#4e3822'; ctx.lineWidth = 2; ctx.strokeRect(W / 2 - tw / 2 - 16, 16, tw + 32, 30);
    ctx.fillStyle = '#f6ecd2'; ctx.fillText(sign, W / 2, 37);
    particles(ctx, season, t, s);
  }

  // ---------- inside the dairy barn and the Ostehus: shown while the Herd & Dairy tab is open ----------
  // ---------- Herd & Dairy: the stable under the bank barn, seen from the feed alley ----------
  // A Holstein or Guernsey seen from the front through her stanchion: shoulders and topline in the stall's shade,
  // neck through the stanchion, and (two in three) her head down in the manger hay. part 'body' is drawn behind the
  // stanchion, part 'head' in front of it.
  function cowFront(ctx, x, y, sc, t, i, breed, part = 'all') {
    lit(ctx, x - 30 * sc, y - 76 * sc, x + 30 * sc, y + 30 * sc, c => cowFrontFlat(c, x, y, sc, t, i, breed, part));
  }
  function cowFrontFlat(ctx, x, y, sc, t, i, breed, part) {
    const down = i % 3 !== 1, nod = Math.sin(t * .8 + i * 2.3), chew = Math.max(0, Math.sin(t * 3.2 + i * 1.7));
    const hide = breed ? '#bf7a36' : '#f2efe8', dark = breed ? '#f3ece0' : '#1b1a1d';
    const hy = down ? 8 + nod * 1.2 : -6 + nod * .8, face = breed ? -1 : i % 4;
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
    if (part === 'tail' || part === 'all') {
      // seen from the front, the tail shows only when she flicks it up over her back at the flies
      const sw = swishAt(t, i * 13 + 5);
      if (sw.amp > .05) {
        const a = sw.amp, ex = sw.swing * 24 * a, ey = -48 - 28 * a;
        ctx.lineCap = 'round'; ctx.strokeStyle = breed ? '#7a4a24' : '#3a3634'; ctx.lineWidth = 2.8;
        ctx.beginPath(); ctx.moveTo(0, -44); ctx.quadraticCurveTo(ex * .3, -48 - 40 * a, ex, ey); ctx.stroke();
        ctx.fillStyle = breed ? '#4a2c16' : '#1e1b1a';
        ctx.beginPath(); ctx.ellipse(ex, ey, 3, 5.4, sw.swing * .9, 0, 7); ctx.fill();
        ctx.lineCap = 'butt';
      }
      if (part === 'tail') { ctx.restore(); return; }
    }
    if (part !== 'head') {
      // shoulders and back, in the stall's shade
      const back = ctx.createLinearGradient(-26, -60, 26, -10);
      back.addColorStop(0, tone(hide, -.58)); back.addColorStop(.65, tone(hide, -.34)); back.addColorStop(1, tone(hide, -.46));
      ctx.fillStyle = back;
      ctx.beginPath(); ctx.moveTo(-24, -4); ctx.bezierCurveTo(-28, -38, -20, -56, 0, -58); ctx.bezierCurveTo(20, -56, 28, -38, 24, -4); ctx.closePath(); ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = breed ? 'rgba(214,200,180,.75)' : 'rgba(22,20,24,.88)';
      const spots = [[-14, -44, 11, 8], [12, -30, 10, 12], [-8, -18, 8, 7], [15, -50, 8, 6]];
      spots.forEach(([px, py, rx, ry], k) => { if (pr(i * 7 + k) > .38) { ctx.beginPath(); ctx.ellipse(px, py, rx, ry, pr(i + k) * 2, 0, 7); ctx.fill(); } });
      ctx.restore();
      ctx.strokeStyle = rgba(tone(hide, .2), .35); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-14, -54); ctx.quadraticCurveTo(0, -60, 16, -55); ctx.stroke();
      // the neck reaching through the stanchion
      const ng = ctx.createLinearGradient(-10, 0, 10, 0);
      ng.addColorStop(0, tone(hide, -.34)); ng.addColorStop(.7, tone(hide, -.08)); ng.addColorStop(1, tone(hide, -.2));
      ctx.fillStyle = ng;
      ctx.beginPath(); ctx.moveTo(-10, -34); ctx.quadraticCurveTo(-11.5, hy - 14, -9, hy - 8); ctx.lineTo(9, hy - 8); ctx.quadraticCurveTo(11.5, hy - 14, 10, -34); ctx.closePath(); ctx.fill();
      if (!breed && i % 2) { ctx.fillStyle = 'rgba(22,20,24,.85)'; ctx.beginPath(); ctx.ellipse(-3, -24, 6, 8, .3, 0, 7); ctx.fill(); }
    }
    if (part === 'body') { ctx.restore(); return; }
    // ears, out to the sides (black on most Holsteins)
    for (const sd of [-1, 1]) {
      ctx.save(); ctx.translate(sd * 9.5, hy - 17); ctx.rotate(sd * (.3 + nod * .05));
      ctx.fillStyle = face === 1 ? tone(hide, -.12) : breed ? tone(hide, -.08) : '#232125';
      ctx.beginPath(); ctx.ellipse(sd * 7, 0, 8, 3.6, 0, 0, 7); ctx.fill();
      ctx.fillStyle = breed || face === 1 ? '#d99c94' : '#5a4446';
      ctx.beginPath(); ctx.ellipse(sd * 7.6, .5, 5, 1.7, 0, 0, 7); ctx.fill();
      ctx.restore();
    }
    // the head, broad at the poll and narrowing to a wide muzzle, lit from the upper right
    const head = () => {
      ctx.beginPath(); ctx.moveTo(-10, hy - 21);
      ctx.bezierCurveTo(-4, hy - 26, 4, hy - 26, 10, hy - 21); ctx.bezierCurveTo(12.5, hy - 12, 9, hy - 2, 7.8, hy + 7);
      ctx.lineTo(7.4, hy + 12); ctx.lineTo(-7.4, hy + 12); ctx.lineTo(-7.8, hy + 7); ctx.bezierCurveTo(-9, hy - 2, -12.5, hy - 12, -10, hy - 21); ctx.closePath();
    };
    head(); ctx.fillStyle = hide; ctx.fill();
    ctx.save(); head(); ctx.clip();
    ctx.fillStyle = breed ? '#f4ede0' : '#1b1a1d';
    if (breed || face === 0) {
      if (face === 0) { ctx.fillRect(-14, hy - 28, 28, 44); ctx.fillStyle = '#f2efe8'; }
      ctx.beginPath(); ctx.moveTo(-2.6, hy - 25); ctx.quadraticCurveTo(-5, hy - 8, -4.2, hy + 10); ctx.lineTo(4.2, hy + 10); ctx.quadraticCurveTo(5, hy - 8, 2.6, hy - 25); ctx.fill();
    } else if (face === 2) {
      for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sd * 7.5, hy - 12, 5, 6.5, sd * .3, 0, 7); ctx.fill(); }
    } else if (face === 3) { ctx.beginPath(); ctx.moveTo(-14, hy - 28); ctx.lineTo(14, hy - 28); ctx.lineTo(14, hy - 10); ctx.quadraticCurveTo(0, hy - 2, -14, hy - 12); ctx.closePath(); ctx.fill(); }
    const sh = ctx.createRadialGradient(4, hy - 16, 1, 0, hy - 6, 24);
    sh.addColorStop(0, 'rgba(255,250,236,.22)'); sh.addColorStop(.55, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(24,16,12,.42)');
    ctx.fillStyle = sh; ctx.fillRect(-14, hy - 28, 28, 44);
    ctx.restore();
    // poll tuft, eyes, and the moist muzzle (chewing)
    ctx.strokeStyle = rgba(face === 0 || face === 3 ? '#3a3638' : tone(hide, -.2), .7); ctx.lineWidth = .8; ctx.beginPath();
    for (let k = -3; k <= 3; k++) { ctx.moveTo(k * 1.6, hy - 23.5); ctx.quadraticCurveTo(k * 1.6 + 1.2, hy - 26, k * 1.6 + .4, hy - 27); }
    ctx.stroke();
    const shut = blinkAt(t, i * 13 + 5);
    for (const sd of [-1, 1]) {
      ctx.fillStyle = '#120e0d'; ctx.beginPath(); ctx.ellipse(sd * 8.4, hy - 11 + shut * .5, 1.8, Math.max(.25, 1.5 * (1 - shut)), 0, 0, 7); ctx.fill();
      if (shut < .5) { ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(sd * 8.4 + .6, hy - 11.6, .5, 0, 7); ctx.fill(); }
    }
    const my = hy + 10.5 + chew * .8, nose = breed ? '#e2b39a' : face === 0 || face === 3 ? '#3b3236' : '#d7a8a0';
    const mg = ctx.createLinearGradient(0, my - 5, 0, my + 5);
    mg.addColorStop(0, tone(nose, .14)); mg.addColorStop(1, tone(nose, -.28));
    ctx.fillStyle = mg; ctx.beginPath(); ctx.ellipse(0, my, 8.4, 5.2, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(25,12,12,.85)'; ctx.beginPath(); ctx.ellipse(-4.2, my - .4, 1.5, 2.4, -.5, 0, 7); ctx.ellipse(4.2, my - .4, 1.5, 2.4, .5, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(2, my - 3.4, 3, 1, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(30,15,15,.7)'; ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(-3.5, my + 4); ctx.quadraticCurveTo(0, my + 4.8, 3.5, my + 4); ctx.stroke();
    ctx.restore();
  }
  // A tinned-steel shipping can: rolled bands, shoulder handles, and a mushroom lid.
  function milkCan(ctx, x, y, sc = 1) {
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
    const tin = (x0, x1) => {
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, '#666e73'); g.addColorStop(.32, '#b4bbbf'); g.addColorStop(.6, '#eef2f3'); g.addColorStop(.8, '#a1a9ad'); g.addColorStop(1, '#5f676c');
      return g;
    };
    ctx.fillStyle = 'rgba(30,24,18,.3)'; ctx.beginPath(); ctx.ellipse(-1.5, 0, 12, 2.6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = tin(-9, 9);
    ctx.beginPath(); ctx.moveTo(-9, -1); ctx.lineTo(-9, -24); ctx.quadraticCurveTo(-9, -28, -5.5, -31); ctx.lineTo(-5, -35); ctx.lineTo(5, -35); ctx.lineTo(5.5, -31);
    ctx.quadraticCurveTo(9, -28, 9, -24); ctx.lineTo(9, -1); ctx.quadraticCurveTo(0, 1, -9, -1); ctx.fill();
    ctx.fillStyle = 'rgba(60,66,70,.45)'; ctx.fillRect(-9, -15, 18, 1.2); ctx.fillRect(-9, -4, 18, 1);
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(-9, -13.8, 18, .6);
    ctx.fillStyle = tin(-6, 6); ctx.fillRect(-6, -37, 12, 2.5);
    ctx.beginPath(); ctx.ellipse(0, -37.5, 6.5, 2.4, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#7f878b'; ctx.fillRect(-1, -42, 2, 3); ctx.beginPath(); ctx.ellipse(0, -42.5, 3, 1.2, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#757d82'; ctx.lineWidth = 1.4; ctx.beginPath();
    ctx.arc(-8.6, -27, 3, Math.PI * .5, Math.PI * 1.5); ctx.moveTo(8.6, -30); ctx.arc(8.6, -27, 3, -Math.PI * .5, Math.PI * .5); ctx.stroke();
    ctx.restore();
  }
  const CHEESE_LOOK = {
    cheddar: '#e8a33a', colby: '#f0b545', brick: '#e2c46a', swiss: '#f3e4a0', limburger: '#d6bc84',
    nokkelost: '#e7d48f', jarlsberg: '#f1dd8f', gamalost: '#a8763e', pultost: '#efe2bd', brunost: '#8a4b22',
  };
  // What the stable and dairy-room windows look out on: the painted sky and bluffs over the season's pasture.
  function outsideView(season) {
    return cached(`outside|${season}|${Object.keys(painted).length}`, 480, 200, g => {
      sky(g, season, 0, { w: 480, h: 200, horizon: 150, sunX: 400, sunY: 40, clouds: 3, cloudBand: .5 });
      distantBluffs(g, season, 112, 0, 480);
      const p = PAL[season];
      hill(g, x => 146 - 9 * Math.sin(x * .02 + 1) - 4 * Math.sin(x * .07), p.mid, 0, 480, 200, 120, 40);
      g.beginPath(); g.rect(0, 156, 480, 44); groundFill(g, p.pasture, 156, 200);
      g.strokeStyle = '#5e4a38'; g.lineWidth = 1.2; g.beginPath();
      for (let x = 6; x < 480; x += 34) { g.moveTo(x, 172); g.lineTo(x, 158); }
      g.moveTo(0, 161); g.lineTo(480, 160); g.moveTo(0, 167); g.lineTo(480, 166); g.stroke();
    });
  }
  // A window seen from inside: the view through the glass, a little dust and reflection, frost in winter, then the sash.
  function insideWindow(ctx, season, x, y, w, h, cols, rows, viewX, frame) {
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const sw = w * 1.5, sh = h * 1.5;
    ctx.drawImage(outsideView(season), viewX, 150 - sh * .64, sw, sh, x, y, w, h);
    const gl = ctx.createLinearGradient(x, y, x + w, y + h);
    gl.addColorStop(0, 'rgba(255,255,255,.18)'); gl.addColorStop(.45, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(96,82,60,.22)');
    ctx.fillStyle = gl; ctx.fillRect(x, y, w, h);
    if (season === 'winter') {
      for (const [cx, cy] of [[x, y + h], [x + w, y + h], [x, y], [x + w, y]]) {
        const fr = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * .55);
        fr.addColorStop(0, 'rgba(240,246,252,.85)'); fr.addColorStop(1, 'rgba(240,246,252,0)');
        ctx.fillStyle = fr; ctx.fillRect(x, y, w, h);
      }
    }
    ctx.restore();
    ctx.fillStyle = frame;
    for (let c = 1; c < cols; c++) ctx.fillRect(x + c * w / cols - 1.2, y, 2.4, h);
    for (let r = 1; r < rows; r++) ctx.fillRect(x, y + r * h / rows - 1.2, w, 2.4);
    ctx.strokeStyle = frame; ctx.lineWidth = 3.5; ctx.strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
    ctx.strokeStyle = 'rgba(40,28,18,.35)'; ctx.lineWidth = 1; ctx.strokeRect(x - 3.5, y - 3.5, w + 7, h + 7);
  }
  // Big fieldstones laid up in lime mortar and whitewashed, with a few bare stones where the lime has flaked.
  function stoneWall(g, x0, y0, x1, y1, seed) {
    g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
    g.fillStyle = '#cbc4b3'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    for (let y = y0 - 4, r = 0; y < y1; r++) {
      const rh = 15 + pr(seed + r * 3.7) * 10;
      for (let x = x0 - pr(seed + r) * 24, k = 0; x < x1; k++) {
        const w = 22 + pr(seed + r * 13 + k * 1.9) * 26, v = pr(seed + r * 7 + k * 3.3);
        const cx = x + w / 2, cy = y + rh / 2, bare = pr(seed + r * 5 + k * 7) > .9;
        const base = bare ? ['#9a9184', '#a99f92', '#8e867b'][Math.floor(v * 3)] : ['#e6e1d3', '#dfd9ca', '#ebe6da', '#d9d3c4'][Math.floor(v * 4)];
        const gr = g.createRadialGradient(cx + w * .2, cy - rh * .3, 1, cx, cy, w * .65);
        gr.addColorStop(0, tone(base, .07)); gr.addColorStop(1, tone(base, -.1));
        // an irregular, rounded fieldstone
        const pts = [];
        for (let j = 0; j < 8; j++) { const a = j / 8 * Math.PI * 2, jit = .78 + pr(seed + r * 11 + k * 5 + j) * .26; pts.push([cx + Math.cos(a) * w * .48 * jit, cy + Math.sin(a) * rh * .46 * jit]); }
        g.fillStyle = gr; g.beginPath(); g.moveTo((pts[7][0] + pts[0][0]) / 2, (pts[7][1] + pts[0][1]) / 2);
        for (let j = 0; j < 8; j++) { const n = pts[(j + 1) % 8]; g.quadraticCurveTo(pts[j][0], pts[j][1], (pts[j][0] + n[0]) / 2, (pts[j][1] + n[1]) / 2); }
        g.closePath(); g.fill();
        g.strokeStyle = 'rgba(80,68,52,.2)'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(pts[0][0], pts[0][1] + .8);
        for (const j of [1, 2, 3, 4]) g.lineTo(pts[j][0], pts[j][1] + .8);
        g.stroke();
        x += w + 1.5;
      }
      y += rh + 1;
    }
    for (let k = 0; k < 30; k++) {
      const x = x0 + pr(seed + k * 9.1) * (x1 - x0), yy = y0 + pr(seed + k * 4.7) * (y1 - y0) * .7, l = 20 + pr(k + seed) * 60;
      const dg = g.createLinearGradient(0, yy, 0, yy + l); dg.addColorStop(0, 'rgba(120,104,80,.14)'); dg.addColorStop(1, 'rgba(120,104,80,0)');
      g.fillStyle = dg; g.fillRect(x, yy, 2 + pr(k) * 3, l);
    }
    const low = g.createLinearGradient(0, y1 - 100, 0, y1); low.addColorStop(0, 'rgba(70,52,34,0)'); low.addColorStop(1, 'rgba(70,52,34,.5)');
    g.fillStyle = low; g.fillRect(x0, y1 - 100, x1 - x0, 100);
    g.restore();
  }
  // Hay or straw: a mound of strands in several tones (greener for clover and alfalfa hay).
  function strands(g, x0, x1, y0, y1, n, seed, cols) {
    g.lineWidth = 1.1;
    for (let k = 0; k < n; k++) {
      const x = x0 + pr(seed + k * 1.3) * (x1 - x0), y = y0 + pr(seed + k * 2.1) * (y1 - y0), l = 6 + pr(seed + k * 3.7) * 12, a = (pr(seed + k * 5.9) - .5) * 2.6;
      g.strokeStyle = cols[k % cols.length]; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * .5, y - Math.abs(Math.sin(a)) * l * .4 - 2, x + Math.cos(a) * l, y - Math.sin(a) * l * .5); g.stroke();
    }
  }
  const HAY = ['#c9b45a', '#a99a45', '#d8c672', '#8f8a3e', '#b9a04a'], STRAW = ['#e2c46e', '#cfae55', '#ecd690', '#b8963f'];
  // Everything in the stable behind the cows: ceiling joists under the loft, the whitewashed stone wall and its windows,
  // stall posts, the milker's vacuum line, the feed alley, and the heifer pen's bedding.
  function stablePlate(s, season, stalls, steel, concrete) {
    const milker = !!s.buildings.milker;
    return cached(`stable|${season}|${stalls}|${steel}|${concrete}|${milker}|${Object.keys(painted).length}`, 608, H, g => {
      stoneWall(g, 0, 56, 600, 340, 211);
      // windows set deep in the wall, the splayed reveals in shade
      for (const [wx, vx] of [[62, 20], [262, 150], [452, 280]]) {
        g.fillStyle = '#bdb6a6'; shape(g, [[wx - 14, 84], [wx + 86, 84], [wx + 76, 94], [wx - 4, 94]]); g.fill();
        g.fillStyle = '#d6d0c2'; shape(g, [[wx - 14, 84], [wx - 4, 94], [wx - 4, 150], [wx - 14, 162]]); g.fill();
        g.fillStyle = '#c6bfb0'; shape(g, [[wx + 86, 84], [wx + 76, 94], [wx + 76, 150], [wx + 86, 162]]); g.fill();
        boards(g, wx - 14, 150, wx + 86, 162, '#8f7a5e', 6, wx);
        g.fillStyle = 'rgba(40,30,20,.3)'; g.fillRect(wx - 14, 162, 100, 3);
        insideWindow(g, season, wx - 2, 96, 76, 52, 3, 2, vx, '#cfc6b2');
        g.strokeStyle = 'rgba(250,250,250,.4)'; g.lineWidth = .5; g.beginPath();
        for (let k = 0; k < 5; k++) { g.moveTo(wx - 2, 96 + k * 3); g.quadraticCurveTo(wx + 4, 98 + k * 2, wx + 6 + k * 2, 96); }
        g.stroke();
      }
      // the loft floor overhead on hand-hewn joists, hay showing through the cracks, and the summer beam
      const cg = g.createLinearGradient(0, 0, 0, 56); cg.addColorStop(0, '#2a1d14'); cg.addColorStop(1, '#3f2e20');
      g.fillStyle = cg; g.fillRect(0, 0, 608, 58);
      strands(g, 0, 608, 2, 50, 110, 13, ['rgba(179,154,72,.6)', 'rgba(143,122,56,.6)', 'rgba(201,178,94,.5)']);
      for (let xf = -40; xf < 660; xf += 64) {
        const xb = 300 + (xf - 300) * .86, jg = g.createLinearGradient(0, 0, 0, 56);
        jg.addColorStop(0, '#7a5a3e'); jg.addColorStop(1, '#5a412c');
        g.fillStyle = jg; shape(g, [[xf - 12, 0], [xf + 12, 0], [xb + 10, 56], [xb - 10, 56]]); g.fill();
        g.fillStyle = 'rgba(20,12,8,.45)'; shape(g, [[xf + (xf < 300 ? 12 : -12), 0], [xf + (xf < 300 ? 17 : -17), 0], [xb + (xb < 300 ? 14 : -14), 56], [xb + (xb < 300 ? 10 : -10), 56]]); g.fill();
        g.strokeStyle = 'rgba(30,18,10,.3)'; g.lineWidth = .8; g.beginPath();
        for (let k = 0; k < 5; k++) { const yy = 6 + k * 10, xx = xf + (xb - xf) * yy / 56; g.moveTo(xx - 8, yy); g.quadraticCurveTo(xx, yy + 3, xx + 8, yy); }
        g.stroke();
      }
      g.fillStyle = '#4e3826'; g.fillRect(0, 52, 608, 16);
      const bg = g.createLinearGradient(0, 52, 0, 68); bg.addColorStop(0, 'rgba(255,230,190,.16)'); bg.addColorStop(1, 'rgba(0,0,0,.25)');
      g.fillStyle = bg; g.fillRect(0, 52, 608, 16);
      g.strokeStyle = 'rgba(28,16,8,.35)'; g.lineWidth = .9; g.beginPath();
      for (let x = 8; x < 608; x += 13) { g.moveTo(x, 54 + pr(x) * 3); g.quadraticCurveTo(x + 6, 58, x + 11, 54 + pr(x + 1) * 3); }
      g.stroke();
      const under = g.createLinearGradient(0, 68, 0, 92); under.addColorStop(0, 'rgba(40,28,18,.4)'); under.addColorStop(1, 'rgba(40,28,18,0)');
      g.fillStyle = under; g.fillRect(0, 68, 600, 24);
      g.strokeStyle = 'rgba(240,240,240,.25)'; g.lineWidth = .5; g.beginPath();
      for (const cx of [4, 596]) for (let k = 0; k < 6; k++) { g.moveTo(cx, 68 + k * 5); g.quadraticCurveTo(cx + (cx < 300 ? 14 : -14), 70 + k * 3, cx + (cx < 300 ? 24 - k * 3 : -24 + k * 3), 68); }
      g.stroke();
      // the milking machine's vacuum line, with a stall cock over every other stall
      if (milker) {
        const sw = 570 / stalls, pg = g.createLinearGradient(0, 172, 0, 179);
        pg.addColorStop(0, '#d7dcdf'); pg.addColorStop(.5, '#9aa2a7'); pg.addColorStop(1, '#5d656a');
        g.fillStyle = pg; g.fillRect(6, 172, 588, 7);
        for (let k = 0; k < stalls; k += 2) { const cx = 18 + k * sw + sw; g.fillStyle = '#6d757a'; g.fillRect(cx - 2.5, 178, 5, 8); g.fillStyle = '#b02a2a'; g.fillRect(cx - 4, 182, 8, 2.2); }
      }
      // the stalls lie in the loft's shadow, darker than the whitewash above them
      const shade = g.createLinearGradient(0, 168, 0, 300);
      shade.addColorStop(0, 'rgba(46,34,22,0)'); shade.addColorStop(.35, 'rgba(46,34,22,.38)'); shade.addColorStop(1, 'rgba(46,34,22,.55)');
      g.fillStyle = shade; g.fillRect(0, 168, 600, 172);
      g.fillStyle = 'rgba(30,22,16,.45)'; g.fillRect(0, 326, 600, 14);
      // the feed alley: troweled concrete (planks before about 1912), with hay scattered from the manger
      if (concrete) {
        const fg = g.createLinearGradient(0, 348, 0, H); fg.addColorStop(0, '#cbc3b4'); fg.addColorStop(1, '#8f8678');
        g.fillStyle = fg; g.fillRect(0, 348, 600, H - 348);
        g.save(); g.globalAlpha = .9; g.translate(0, 348); g.fillStyle = patternFor(g, 'mottle', mottle); g.fillRect(0, 0, 600, H - 348); g.restore();
        g.strokeStyle = 'rgba(70,62,52,.28)'; g.lineWidth = 1; g.beginPath();
        for (const y of [384, 432, 498]) { g.moveTo(0, y); g.lineTo(600, y); }
        g.moveTo(140, 384); g.lineTo(152, 410); g.lineTo(147, 432); g.moveTo(420, 432); g.lineTo(436, 470); g.lineTo(431, 498);
        g.stroke();
        g.strokeStyle = 'rgba(255,250,240,.12)'; g.beginPath();
        for (let k = 0; k < 18; k++) { const x = pr(k + 90) * 600, y = 360 + pr(k + 91) * 170; g.moveTo(x - 22, y); g.quadraticCurveTo(x, y - 6, x + 22, y); }
        g.stroke();
      } else {
        boards(g, 0, 348, 600, H, '#8a6c4c', 22, 77);
        g.fillStyle = 'rgba(255,240,210,.1)'; g.fillRect(0, 348, 600, 40);
      }
      strands(g, 0, 600, 350, 372, 140, 41, HAY);
      strands(g, 300, 600, 380, 530, 40, 47, HAY);
      // straw bedding in the heifer pen
      g.fillStyle = 'rgba(198,166,92,.85)'; g.fillRect(22, 446, 270, 78);
      strands(g, 22, 292, 446, 524, 520, 53, STRAW);
      g.fillStyle = 'rgba(40,28,18,.3)'; g.fillRect(22, 446, 270, 4);
    });
  }
  // What stands in front of the cows and heifers, in two layers so each cow's head comes between them: 'stanchions'
  // (the stanchions on their header rail), then 'manger' (the manger and its hay, the heifer pen's rails, and the fork
  // and broom against the partition).
  function stableFront(s, stalls, steel, concrete, sc, layer) {
    return cached(`stableFront|${layer}|${stalls}|${steel}|${concrete}|${sc}`, 608, H, g => {
      const sw = 570 / stalls, gap = 10 * sc + 3;
      const wood = (x0, y0, x1, y1, col, seed) => {
        const wg = g.createLinearGradient(x0, 0, x1, 0); wg.addColorStop(0, tone(col, -.2)); wg.addColorStop(.6, tone(col, .08)); wg.addColorStop(1, tone(col, -.12));
        g.fillStyle = wg; g.fillRect(x0, y0, x1 - x0, y1 - y0);
        g.strokeStyle = 'rgba(40,24,12,.25)'; g.lineWidth = .6; g.beginPath();
        for (let k = 0; k < 3; k++) { const xx = x0 + (k + .5) * (x1 - x0) / 3 + (pr(seed + k) - .5); g.moveTo(xx, y0); g.lineTo(xx + (pr(seed + k + 5) - .5) * 2, y1); }
        g.stroke();
      };
      const pipe = (x0, y0, x1, y1) => {
        const horiz = x1 - x0 > y1 - y0, pg = horiz ? g.createLinearGradient(0, y0, 0, y1) : g.createLinearGradient(x0, 0, x1, 0);
        pg.addColorStop(0, '#6b7378'); pg.addColorStop(.45, '#dfe4e6'); pg.addColorStop(1, '#565e63');
        g.fillStyle = pg; g.fillRect(x0, y0, x1 - x0, y1 - y0);
      };
      if (layer === 'stanchions') {
        if (steel) { pipe(6, 186, 594, 191); pipe(6, 194, 594, 198); }
        else { wood(4, 184, 596, 198, '#8a6a48', 3); g.fillStyle = 'rgba(30,20,12,.35)'; g.fillRect(4, 198, 592, 3); }
        for (let k = 0; k < stalls; k++) {
          const cx = 18 + k * sw + sw / 2;
          for (const sd of [-1, 1]) {
            const x = cx + sd * gap;
            if (steel) {
              pipe(x - 2.2, 196, x + 2.2, 322);
              if (sd > 0) { g.fillStyle = '#4f575c'; g.fillRect(x - 3, 198, 6, 6); }
            } else {
              wood(x - 3.5, 196, x + 3.5, 322, '#9a7650', k * 7 + sd);
              g.fillStyle = '#2e2e2e'; g.beginPath(); g.arc(x, 204, 1.2, 0, 7); g.arc(x, 314, 1.2, 0, 7); g.fill();
            }
          }
        }
        return;
      }
      // the manger: hay heaped behind its curb (concrete, or planks in the early years)
      g.fillStyle = '#9b8a45'; g.beginPath(); g.moveTo(0, 322);
      for (let x = 0; x <= 600; x += 20) g.lineTo(x, 309 + pr(x * .3) * 7);
      g.lineTo(600, 324); g.closePath(); g.fill();
      strands(g, 0, 600, 306, 326, 700, 61, HAY);
      if (concrete) {
        const mg = g.createLinearGradient(0, 320, 0, 348); mg.addColorStop(0, '#d9d2c4'); mg.addColorStop(.18, '#bdb5a6'); mg.addColorStop(1, '#8c8476');
        g.fillStyle = mg; g.beginPath(); g.moveTo(0, 326); g.quadraticCurveTo(300, 318, 600, 326); g.lineTo(600, 348); g.lineTo(0, 348); g.closePath(); g.fill();
        g.save(); g.globalAlpha = .5; g.translate(0, 320); g.fillStyle = patternFor(g, 'mottle', mottle); g.fillRect(0, 0, 600, 28); g.restore();
      } else {
        for (const [y0, y1, k] of [[320, 334, 1], [334, 348, 2]]) {
          const pg = g.createLinearGradient(0, y0, 0, y1); pg.addColorStop(0, '#9a7a56'); pg.addColorStop(1, '#6e5238');
          g.fillStyle = pg; g.fillRect(0, y0, 600, y1 - y0);
          g.strokeStyle = 'rgba(40,24,12,.3)'; g.lineWidth = .7; g.beginPath();
          for (let x = 20 * k; x < 600; x += 47) { g.moveTo(x, y0 + 3); g.quadraticCurveTo(x + 18, y0 + 6, x + 40, y0 + 4); }
          g.stroke();
        }
      }
      g.fillStyle = 'rgba(30,20,12,.35)'; g.fillRect(0, 348, 600, 4);
      strands(g, 0, 600, 318, 330, 90, 67, HAY);
      // heifer pen rails and posts
      for (const y of [452, 476, 500]) {
        const rg = g.createLinearGradient(0, y, 0, y + 8); rg.addColorStop(0, '#a8865e'); rg.addColorStop(1, '#6a4f36');
        g.fillStyle = rg; g.fillRect(16, y, 284, 8);
        g.fillStyle = 'rgba(30,20,12,.35)'; g.fillRect(16, y + 8, 284, 2);
      }
      for (const x of [16, 154, 290]) { wood(x, 436, x + 10, 528, '#8a6a48', x); g.fillStyle = 'rgba(30,20,12,.35)'; g.fillRect(x + 10, 440, 3, 88); }
      // the partition post, a fork, and a broom
      wood(594, 0, 610, H, '#6b5038', 9);
      g.strokeStyle = '#8c6b45'; g.lineWidth = 3; g.beginPath(); g.moveTo(585, 380); g.lineTo(568, 528); g.stroke();
      g.strokeStyle = '#4a4a4a'; g.lineWidth = 1.6; g.beginPath();
      for (const d of [-5, 0, 5]) { g.moveTo(585 + d * .3, 380); g.quadraticCurveTo(586 + d, 362, 589 + d * 1.1, 346); }
      g.moveTo(580, 381); g.lineTo(591, 380); g.stroke();
      g.strokeStyle = '#a0805a'; g.lineWidth = 2.6; g.beginPath(); g.moveTo(560, 372); g.lineTo(548, 500); g.stroke();
      g.fillStyle = '#b9984f'; shape(g, [[541, 498], [556, 499], [562, 530], [536, 530]]); g.fill();
      g.strokeStyle = 'rgba(90,64,24,.6)'; g.lineWidth = .6; g.beginPath(); for (let k = 0; k < 8; k++) { g.moveTo(542 + k * 2, 500); g.lineTo(538 + k * 3.2, 530); } g.stroke();
    });
  }
  // A cold-blast barn lantern on its bail, or (with electric service) a bulb under an enamel reflector.
  function stableLight(ctx, x, t, k, electric) {
    if (electric) {
      ctx.strokeStyle = '#1e1e1e'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, 30); ctx.lineTo(x, 86); ctx.stroke();
      const glow = ctx.createRadialGradient(x, 98, 2, x, 110, 120);
      glow.addColorStop(0, 'rgba(255,246,210,.5)'); glow.addColorStop(.35, 'rgba(255,240,200,.14)'); glow.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = glow; ctx.fillRect(x - 120, 60, 240, 200);
      ctx.fillStyle = '#2f5b3e'; ctx.beginPath(); ctx.moveTo(x - 4, 86); ctx.lineTo(x + 4, 86); ctx.lineTo(x + 16, 96); ctx.lineTo(x - 16, 96); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f3efe4'; ctx.fillRect(x - 16, 95.5, 32, 1.5);
      ctx.fillStyle = '#fff8d8'; ctx.beginPath(); ctx.ellipse(x, 100, 4, 5, 0, 0, 7); ctx.fill();
      return;
    }
    const f = .86 + Math.sin(t * 9 + k * 3) * .06 + Math.sin(t * 23 + k) * .04;
    ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, 40); ctx.lineTo(x, 74); ctx.stroke();
    const glow = ctx.createRadialGradient(x, 92, 2, x, 98, 90 * f);
    glow.addColorStop(0, `rgba(255,200,110,${.5 * f})`); glow.addColorStop(.4, `rgba(255,190,100,${.14 * f})`); glow.addColorStop(1, 'rgba(255,190,100,0)');
    ctx.fillStyle = glow; ctx.fillRect(x - 100, 10, 200, 190);
    ctx.strokeStyle = '#3a3a38'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, 82, 8, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = '#4a4a46'; ctx.fillRect(x - 6, 76, 12, 5); ctx.fillRect(x - 9, 81, 2, 24); ctx.fillRect(x + 7, 81, 2, 24);
    const gl = ctx.createRadialGradient(x, 93, 1, x, 93, 8);
    gl.addColorStop(0, '#fff2c0'); gl.addColorStop(.4, `rgba(255,${200 + 20 * f | 0},120,.95)`); gl.addColorStop(1, 'rgba(200,150,80,.6)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.ellipse(x, 93, 6.5, 9, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#4a4a46'; ctx.beginPath(); ctx.ellipse(x, 106, 9, 3.4, 0, 0, 7); ctx.fill(); ctx.fillRect(x - 9, 103, 18, 3);
  }
  // Sunlight through the stable windows, with dust drifting in it.
  function sunbeams(ctx, season, t, wins, y0, floorY) {
    const a = { spring: .11, summer: .13, fall: .12, winter: .06 }[season] || .1;
    for (const [wx, ww] of wins) {
      const g = ctx.createLinearGradient(wx, y0, wx + 110, floorY);
      g.addColorStop(0, `rgba(255,244,212,${a})`); g.addColorStop(1, 'rgba(255,244,212,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(wx + 4, y0); ctx.lineTo(wx + ww - 4, y0); ctx.lineTo(wx + ww + 120, floorY); ctx.lineTo(wx + 60, floorY); ctx.closePath(); ctx.fill();
      ctx.fillStyle = `rgba(255,248,224,${a * 4})`;
      for (let k = 0; k < 12; k++) {
        const u = (pr(wx + k) + t * (.006 + pr(k + 3) * .01)) % 1, v = pr(wx + k * 2.3);
        const px = wx + 4 + v * (ww - 8) + u * (60 + v * 60), py = y0 + u * (floorY - y0) + Math.sin(t + k) * 3;
        ctx.beginPath(); ctx.arc(px, py, .9 + pr(k + 11) * .7, 0, 7); ctx.fill();
      }
    }
  }
  // An orange tabby on her rounds.
  function barnCat(ctx, x, y, t, dir) {
    const step = Math.sin(t * 5), tail = Math.sin(t * 1.6);
    ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
    contactShadow(ctx, 0, 1, 14, 2.4, .35);
    ctx.strokeStyle = '#b8682a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-6, -2); ctx.lineTo(-7 + step * 2, 1); ctx.moveTo(-2, -2); ctx.lineTo(-1 - step * 2, 1);
    ctx.moveTo(5, -2); ctx.lineTo(6 - step * 2, 1); ctx.moveTo(8, -2); ctx.lineTo(9 + step * 2, 1); ctx.stroke();
    const bg = ctx.createLinearGradient(0, -12, 0, 0); bg.addColorStop(0, '#e19a52'); bg.addColorStop(1, '#a95e26');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(1, -6, 11, 5.5, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(120,58,20,.55)'; ctx.lineWidth = 1.2; ctx.beginPath();
    for (const sx of [-6, -2, 2, 6]) { ctx.moveTo(sx, -11); ctx.quadraticCurveTo(sx + 1, -7, sx, -3); }
    ctx.stroke();
    ctx.strokeStyle = '#c47a36'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(-9, -7); ctx.quadraticCurveTo(-18, -8 + tail * 3, -17, -18 - tail * 2); ctx.stroke();
    ctx.fillStyle = '#d98d48'; ctx.beginPath(); ctx.arc(12, -10, 4.6, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(9, -13); ctx.lineTo(9.5, -18); ctx.lineTo(12, -14); ctx.moveTo(12.5, -14); ctx.lineTo(15, -18); ctx.lineTo(15.5, -12.5); ctx.fill();
    ctx.fillStyle = '#2a3a1a'; ctx.beginPath(); ctx.arc(14, -11, .8, 0, 7); ctx.fill();
    ctx.fillStyle = '#f3e3d0'; ctx.beginPath(); ctx.ellipse(15.5, -8.8, 1.8, 1.2, 0, 0, 7); ctx.fill();
    ctx.restore();
  }
  function dairyBarn(ctx, s, t, season) {
    const electric = !!s.buildings.electricity, cap = Sim.barnCap(s), year = s.year || 1900;
    const stalls = Math.max(4, Math.min(11, cap)), sw = 570 / stalls, sc = Math.round(Math.min(1.7, sw / 40) * 100) / 100;
    const steel = year >= 1918 || !!s.buildings.milker, concrete = year >= 1912;
    const filled = s.cows ? Math.max(1, Math.min(stalls, Math.round(s.cows / cap * stalls))) : 0;
    ctx.drawImage(stablePlate(s, season, stalls, steel, concrete), 0, 0);
    // the herd at the manger: tails flicking up behind, bodies behind the stanchions, heads in front of them
    for (let k = 0; k < filled; k++) cowFront(ctx, 18 + k * sw + sw / 2, 292, sc, t, k, k % 5 === 3, 'tail');
    for (let k = 0; k < filled; k++) cowFront(ctx, 18 + k * sw + sw / 2, 292, sc, t, k, k % 5 === 3, 'body');
    ctx.drawImage(stableFront(s, stalls, steel, concrete, sc, 'stanchions'), 0, 0);
    for (let k = 0; k < filled; k++) cowFront(ctx, 18 + k * sw + sw / 2, 292, sc, t, k, k % 5 === 3, 'head');
    // calves loose in their pen
    const nH = Math.min(6, s.heifers);
    for (let i = 0; i < nH; i++) {
      const x = 52 + i * 42 + Math.sin(t * .4 + i * 1.7) * 6;
      ctx.save(); ctx.translate(x, 470 + (i % 2) * 22); ctx.scale(1.1, 1.1); cow(ctx, 0, 0, Math.cos(t * .4 + i * 1.7) > 0 ? 1 : -1, t, i + 3, i % 4 === 2, .4); ctx.restore();
    }
    ctx.drawImage(stableFront(s, stalls, steel, concrete, sc, 'manger'), 0, 0);
    sunbeams(ctx, season, t, [[60, 76], [260, 76], [450, 76]], 150, 345);
    for (const [k, lx] of [165, 355, 545].entries()) stableLight(ctx, lx, t, k, electric);
    // a board on the pen post with the calf count
    ctx.fillStyle = '#6e5238'; ctx.fillRect(104, 420, 104, 20);
    ctx.fillStyle = 'rgba(255,240,210,.12)'; ctx.fillRect(104, 420, 104, 3);
    ctx.fillStyle = '#f3ead2'; ctx.font = 'bold 12px Georgia'; ctx.textAlign = 'center';
    ctx.fillText(s.heifers ? `Calves: ${s.heifers}` : 'Calf pen (empty)', 156, 434);
    // milk cans by the doorway, and the milking gear
    const cans = Math.min(8, Math.ceil(s.cows / 3));
    for (let j = 0; j < cans; j++) {
      const k = cans > 4 ? (j < cans - 4 ? j + 4 : j - (cans - 4)) : j;
      milkCan(ctx, 352 + (k % 4) * 24 + (k > 3 ? 12 : 0), k > 3 ? 490 : 508, k > 3 ? 1.04 : 1.1);
    }
    if (s.buildings.milker) {
      ctx.strokeStyle = '#1e1e1e'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(498, 452); ctx.quadraticCurveTo(522 + Math.sin(t * 4) * 1.5, 330, 506, 184); ctx.stroke();
      ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(492, 454); ctx.quadraticCurveTo(470, 470, 474, 500); ctx.stroke();
      contactShadow(ctx, 500, 504, 22, 4);
      const bk = ctx.createLinearGradient(480, 0, 520, 0); bk.addColorStop(0, '#79818a'); bk.addColorStop(.6, '#e9eef0'); bk.addColorStop(1, '#8a9298');
      ctx.fillStyle = bk; ctx.beginPath(); ctx.moveTo(480, 462); ctx.quadraticCurveTo(478, 500, 500, 504); ctx.quadraticCurveTo(522, 500, 520, 462); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#5f676c'; ctx.beginPath(); ctx.ellipse(500, 462, 20, 4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#3b3b3b'; ctx.fillRect(492, 450, 16, 10);
      ctx.font = 'bold 8px Georgia'; ctx.fillStyle = 'rgba(40,44,48,.75)'; ctx.fillText('SURGE', 500, 486);
    } else {
      contactShadow(ctx, 498, 508, 18, 3);
      ctx.fillStyle = '#7a5b3c'; ctx.beginPath(); ctx.ellipse(498, 478, 17, 4, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#6a4d32'; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(488, 481); ctx.lineTo(484, 508); ctx.moveTo(508, 481); ctx.lineTo(512, 508); ctx.moveTo(498, 482); ctx.lineTo(498, 506); ctx.stroke();
      contactShadow(ctx, 536, 508, 14, 2.6);
      const pg = ctx.createLinearGradient(524, 0, 548, 0); pg.addColorStop(0, '#7a8288'); pg.addColorStop(.6, '#e6ebed'); pg.addColorStop(1, '#868e93');
      ctx.fillStyle = pg; ctx.beginPath(); ctx.moveTo(523, 480); ctx.lineTo(549, 480); ctx.lineTo(546, 507); ctx.lineTo(526, 507); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f6f2e6'; ctx.beginPath(); ctx.ellipse(536, 481, 12.5, 2.6, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#6e767b'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(536, 482, 13, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    }
    const catX = 548 + Math.sin(t * .3) * 14;
    barnCat(ctx, catX, 526, t, Math.cos(t * .3) >= 0 ? 1 : -1);
    if (s.buildings.cheese_house) ostehus(ctx, s, t, season); else milkHouse(ctx, s, t, season);
    const parts = [`${s.cows} milk cow${s.cows === 1 ? '' : 's'} in ${cap} stalls`, `${s.heifers} ${s.heifers === 1 ? 'calf' : 'calves'}`];
    const lb = Object.values(s.cheese).reduce((a, c) => a + c.fresh + c.aged, 0);
    if (lb >= 1) parts.push(`${Math.round(lb).toLocaleString()} lb of cheese`);
    topSign(ctx, parts.join('  ·  '));
  }
  // The dairy room beyond the partition (x 608 to the right edge): plaster walls, a window, and a floor.
  function dairyRoomPlate(key, season, draw) {
    return cached(`room|${key}|${season}|${Object.keys(painted).length}`, W - 608, H, g => { g.translate(-608, 0); draw(g); });
  }
  function plasterWall(g, color, y0, y1) {
    const pg = g.createLinearGradient(608, y0, W, y1); pg.addColorStop(0, tone(color, -.06)); pg.addColorStop(1, tone(color, .04));
    g.fillStyle = pg; g.fillRect(608, y0, W - 608, y1 - y0);
    g.save(); g.globalAlpha = .45; g.translate(608, y0); g.fillStyle = patternFor(g, 'mottle', mottle); g.fillRect(0, 0, W - 608, y1 - y0); g.restore();
    g.strokeStyle = 'rgba(110,96,76,.22)'; g.lineWidth = .7; g.beginPath();
    g.moveTo(660, y0 + 40); g.lineTo(672, y0 + 70); g.lineTo(668, y0 + 96); g.moveTo(930, y0 + 120); g.lineTo(918, y0 + 150); g.stroke();
  }
  function roomCeiling(g) {
    boards(g, 608, 0, W, 42, '#9c8058', 18, 5);
    g.fillStyle = '#5a412c'; g.fillRect(608, 40, W - 608, 8);
    const sg = g.createLinearGradient(0, 48, 0, 62); sg.addColorStop(0, 'rgba(40,28,18,.3)'); sg.addColorStop(1, 'rgba(40,28,18,0)');
    g.fillStyle = sg; g.fillRect(608, 48, W - 608, 14);
  }
  function plankFloor(g, y0, colors) {
    g.save(); g.beginPath(); g.rect(608, y0, W - 608, H - y0); g.clip();
    const vx = 784;
    for (let k = 0, xb = 540; xb < 1040; k++, xb += 46) {
      const xt = vx + (xb - vx) * .55, xt2 = vx + (xb + 46 - vx) * .55;
      g.fillStyle = colors[k % colors.length]; shape(g, [[xt, y0], [xt2, y0], [xb + 46, H], [xb, H]]); g.fill();
      g.strokeStyle = 'rgba(40,24,12,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(xt, y0); g.lineTo(xb, H); g.stroke();
      g.strokeStyle = 'rgba(60,36,18,.12)'; g.lineWidth = .7; g.beginPath();
      for (let j = 1; j < 4; j++) { const f = j / 4; g.moveTo(xt + (xt2 - xt) * f, y0); g.quadraticCurveTo(xb + 46 * f + 3, (y0 + H) / 2, xb + 46 * f, H); }
      g.stroke();
    }
    const fg = g.createLinearGradient(0, y0, 0, H); fg.addColorStop(0, 'rgba(30,20,12,.25)'); fg.addColorStop(.3, 'rgba(30,20,12,0)'); fg.addColorStop(1, 'rgba(30,20,12,.2)');
    g.fillStyle = fg; g.fillRect(608, y0, W - 608, H - y0);
    g.restore();
  }
  function cheeseWheel(ctx, x, y, c) {
    const col = CHEESE_LOOK[c.id] || '#e8c46a', rind = c.aged ? tone(col, -.28) : tone(col, -.1);
    if (c.id === 'brunost' || c.id === 'gamalost') {
      const bg = ctx.createLinearGradient(x, 0, x + 18, 0); bg.addColorStop(0, tone(col, -.2)); bg.addColorStop(.7, tone(col, .1)); bg.addColorStop(1, tone(col, -.1));
      ctx.fillStyle = bg; ctx.fillRect(x, y - 13, 18, 13);
      ctx.fillStyle = tone(col, .2); ctx.beginPath(); ctx.moveTo(x, y - 13); ctx.lineTo(x + 3, y - 16); ctx.lineTo(x + 21, y - 16); ctx.lineTo(x + 18, y - 13); ctx.closePath(); ctx.fill();
      ctx.fillStyle = tone(col, -.32); ctx.beginPath(); ctx.moveTo(x + 18, y - 13); ctx.lineTo(x + 21, y - 16); ctx.lineTo(x + 21, y - 3); ctx.lineTo(x + 18, y); ctx.closePath(); ctx.fill();
      return;
    }
    const sg = ctx.createLinearGradient(x, 0, x + 20, 0); sg.addColorStop(0, tone(rind, -.18)); sg.addColorStop(.65, tone(rind, .12)); sg.addColorStop(1, tone(rind, -.1));
    ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x, y - 2); ctx.ellipse(x + 10, y - 2, 10, 2.6, 0, Math.PI, 0, true); ctx.lineTo(x + 20, y - 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = tone(col, c.aged ? -.08 : .12); ctx.beginPath(); ctx.ellipse(x + 10, y - 12, 10, 2.8, 0, 0, 7); ctx.fill();
    if (c.id === 'cheddar' && c.aged) { ctx.strokeStyle = 'rgba(240,230,210,.6)'; ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + 20, y - 8); ctx.stroke(); }
  }
  function ostehus(ctx, s, t, season) {
    const brunost = s.plan.whey === 'brunost' || !!(s.cheese.brunost && s.cheese.brunost.fresh + s.cheese.brunost.aged >= 1);
    ctx.drawImage(dairyRoomPlate(`ostehus|${brunost}`, season, g => {
      plasterWall(g, '#f4efe3', 48, 300);
      roomCeiling(g);
      // blue trim with a painted scroll, and the name on the wall
      g.fillStyle = '#2f5d8a'; g.fillRect(608, 48, W - 608, 9);
      g.strokeStyle = '#f4efe3'; g.lineWidth = .9; g.beginPath();
      for (let x = 620; x < W; x += 26) { g.moveTo(x, 55); g.bezierCurveTo(x + 4, 49, x + 10, 49, x + 12, 53); g.bezierCurveTo(x + 14, 56, x + 18, 56, x + 20, 52); }
      g.stroke();
      g.fillStyle = '#b0392e'; for (let x = 633; x < W; x += 26) { g.beginPath(); g.arc(x, 52.5, 1.4, 0, 7); g.fill(); }
      g.font = 'bold 19px Georgia'; g.textAlign = 'center'; g.fillStyle = '#2f5d8a'; g.fillText('OSTEHUS', 700, 86);
      g.strokeStyle = '#2f5d8a'; g.lineWidth = 1.2; g.beginPath();
      g.moveTo(646, 80); g.bezierCurveTo(640, 72, 632, 84, 640, 88); g.moveTo(754, 80); g.bezierCurveTo(760, 72, 768, 84, 760, 88); g.stroke();
      insideWindow(g, season, 642, 112, 60, 72, 2, 3, 300, '#f1ece0');
      g.fillStyle = 'rgba(40,30,20,.2)'; g.fillRect(636, 190, 72, 3);
      // a peg rail with the curd harp, the long skimmer, and a cheesecloth hung to dry
      const rail = g.createLinearGradient(0, 204, 0, 211); rail.addColorStop(0, '#9a7650'); rail.addColorStop(1, '#5e4430');
      g.fillStyle = rail; g.fillRect(714, 204, 80, 7); g.fillStyle = 'rgba(40,28,18,.2)'; g.fillRect(714, 211, 80, 3);
      g.fillStyle = '#4e3a28'; for (const px of [728, 756, 782]) g.fillRect(px - 1.5, 206, 3, 6);
      g.strokeStyle = '#8a6a45'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(728, 211); g.lineTo(728, 226); g.stroke();
      g.strokeStyle = '#8f9599'; g.lineWidth = 1.8; g.strokeRect(719, 226, 18, 40);
      g.strokeStyle = 'rgba(200,205,210,.8)'; g.lineWidth = .5; g.beginPath(); for (let wx = 722; wx < 737; wx += 3) { g.moveTo(wx, 227); g.lineTo(wx, 265); } g.stroke();
      g.strokeStyle = '#7a5b3c'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(756, 211); g.lineTo(756, 262); g.stroke();
      const sk = g.createRadialGradient(754, 268, 1, 756, 270, 9); sk.addColorStop(0, '#eef1f3'); sk.addColorStop(1, '#8a9196');
      g.fillStyle = sk; g.beginPath(); g.ellipse(756, 270, 8, 8.5, 0, 0, 7); g.fill();
      g.fillStyle = 'rgba(60,64,68,.6)'; for (let k = 0; k < 9; k++) { g.beginPath(); g.arc(756 + Math.cos(k * 2.4) * (k % 3 + 1) * 2, 270 + Math.sin(k * 2.4) * (k % 3 + 1) * 2, .6, 0, 7); g.fill(); }
      g.lineCap = 'butt';
      const cl = g.createLinearGradient(772, 0, 794, 0); cl.addColorStop(0, '#d8d0bc'); cl.addColorStop(.5, '#f6f1e4'); cl.addColorStop(1, '#cfc6b0');
      g.fillStyle = cl; g.beginPath(); g.moveTo(774, 210); g.lineTo(790, 210); g.quadraticCurveTo(794, 236, 792, 258); g.lineTo(786, 252); g.lineTo(781, 260); g.lineTo(776, 252); g.quadraticCurveTo(772, 232, 774, 210); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(150,140,118,.5)'; g.lineWidth = .6; g.beginPath(); for (const fx of [778, 782, 787]) { g.moveTo(fx, 212); g.quadraticCurveTo(fx + 1, 234, fx, 254); } g.stroke();
      // the blue-painted wainscot
      boards(g, 608, 300, W, 345, '#2f5d8a', 16, 31);
      g.fillStyle = '#3d6f9e'; g.fillRect(608, 297, W - 608, 5); g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(608, 297, W - 608, 1.2);
      plankFloor(g, 345, ['#c9ab7c', '#bfa070', '#cfb284', '#b8996a']);
      // the cellar shelves
      const sx0 = 800, sx1 = 950;
      for (const x of [sx0 - 6, sx1]) { boards(g, x, 100, x + 6, 290, '#8a6a45', 6, x); }
      for (const y of [130, 180, 230, 280]) {
        const sg = g.createLinearGradient(0, y, 0, y + 6); sg.addColorStop(0, '#b08a5e'); sg.addColorStop(1, '#6e5236');
        g.fillStyle = sg; g.fillRect(sx0 - 6, y, sx1 - sx0 + 12, 6);
        g.fillStyle = 'rgba(40,28,18,.25)'; g.fillRect(sx0 - 6, y + 6, sx1 - sx0 + 12, 6);
      }
      // the cheese press: an oak frame, iron screw, and a hoop of fresh curd
      for (const x of [818, 872]) boards(g, x, 326, x + 10, 452, '#7a5a3c', 5, x);
      boards(g, 812, 322, 888, 334, '#6b4f35', 76, 3); boards(g, 812, 400, 888, 410, '#6b4f35', 76, 4);
      g.strokeStyle = '#4b4b4b'; g.lineWidth = 4; g.beginPath(); g.moveTo(850, 312); g.lineTo(850, 368); g.stroke();
      g.lineWidth = 2.5; g.beginPath(); g.moveTo(832, 312); g.lineTo(868, 312); g.stroke();
      boards(g, 834, 368, 866, 374, '#9a7650', 32, 5);
      const hg = g.createLinearGradient(834, 0, 866, 0); hg.addColorStop(0, '#c9a24a'); hg.addColorStop(.6, '#f1d88a'); hg.addColorStop(1, '#c49a42');
      g.fillStyle = hg; g.fillRect(834, 374, 32, 26);
      g.strokeStyle = 'rgba(90,64,24,.5)'; g.lineWidth = 1; g.strokeRect(834, 374, 32, 26);
      // light from the window falling across the floor
      const beam = g.createLinearGradient(0, 184, 0, 520);
      beam.addColorStop(0, season === 'winter' ? 'rgba(235,242,255,.16)' : 'rgba(255,236,190,.18)'); beam.addColorStop(1, 'rgba(255,236,190,0)');
      g.fillStyle = beam; g.beginPath(); g.moveTo(644, 184); g.lineTo(702, 184); g.lineTo(800, 520); g.lineTo(700, 520); g.closePath(); g.fill();
      // the wooden whey pail by the vat, with its iron hoops and bail
      const pg = g.createLinearGradient(780, 0, 806, 0); pg.addColorStop(0, '#6e5236'); pg.addColorStop(.5, '#b08a5e'); pg.addColorStop(1, '#5e4430');
      g.fillStyle = 'rgba(30,20,10,.25)'; g.beginPath(); g.ellipse(793, 492, 16, 3.5, 0, 0, 7); g.fill();
      g.fillStyle = pg; g.beginPath(); g.moveTo(781, 466); g.lineTo(805, 466); g.lineTo(802, 491); g.lineTo(784, 491); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(50,34,20,.4)'; g.lineWidth = .6; g.beginPath(); for (let sx = 785; sx < 803; sx += 4) { g.moveTo(sx, 467); g.lineTo(sx + (sx - 793) * -.08, 490); } g.stroke();
      g.strokeStyle = '#3a3a3a'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(782, 472); g.lineTo(804, 472); g.moveTo(783.5, 486); g.lineTo(802.5, 486); g.stroke();
      g.lineWidth = 1; g.beginPath(); g.moveTo(781, 467); g.quadraticCurveTo(793, 450, 805, 467); g.stroke();
      g.fillStyle = '#e8e0c2'; g.beginPath(); g.ellipse(793, 467, 11.5, 2.4, 0, 0, 7); g.fill();
      if (brunost) {
        // a cast-iron range for boiling the whey down to brunost, its pipe elbowing into the chimney
        g.fillStyle = '#2b2b2b'; g.fillRect(912, 330, 10, 140); g.fillRect(912, 322, 40, 10);
        g.fillStyle = '#8a8478'; g.beginPath(); g.arc(950, 327, 9, 0, 7); g.fill();
        const rg = g.createLinearGradient(886, 0, 950, 0); rg.addColorStop(0, '#1a1a1a'); rg.addColorStop(.6, '#3a3a3a'); rg.addColorStop(1, '#202020');
        g.fillStyle = rg; g.fillRect(884, 470, 66, 52);
        g.fillStyle = '#c9cdd0'; g.fillRect(882, 466, 70, 5); g.fillRect(884, 520, 66, 3);
        g.fillStyle = '#101010'; g.fillRect(890, 478, 26, 20); g.fillStyle = '#b9bec2'; g.fillRect(912, 486, 6, 2);
        g.fillStyle = '#2b2b2b'; for (const x of [888, 944]) g.fillRect(x, 522, 4, 14);
      }
    }), 608, 0);
    // cheese wheels on the shelves, in proportion to the cellar's stock
    const rows = [130, 180, 230, 280];
    const stock = Object.entries(s.cheese).map(([id, c]) => ({ id, lb: c.fresh + c.aged, aged: c.aged > c.fresh })).filter(c => c.lb >= 1);
    const total = stock.reduce((a, c) => a + c.lb, 0), slots = rows.length * 6;
    const n = Math.min(slots, Math.ceil(total / 250)), wheels = [];
    stock.forEach(c => { const k = Math.max(1, Math.round(c.lb / total * n)); for (let j = 0; j < k && wheels.length < slots; j++) wheels.push(c); });
    wheels.forEach((c, k) => cheeseWheel(ctx, 804 + (k % 6) * 24, rows[Math.floor(k / 6)], c));
    ctx.font = 'italic 12px Georgia'; ctx.fillStyle = '#3a2a1a'; ctx.textAlign = 'center';
    ctx.fillText(total >= 1 ? 'The cheese cellar' : 'Shelves are empty', 875, 96);
    // whey dripping from the press
    ctx.fillStyle = 'rgba(232,226,190,.9)';
    for (let k = 0; k < 2; k++) { const u = (t * .9 + k * .5) % 1; ctx.beginPath(); ctx.ellipse(850, 402 + u * 46, 1.2, 1.8, 0, 0, 7); ctx.fill(); }
    // Ingrid stirring the curd in the copper vat: the paddle's blade sweeps a slow ellipse through the curd, her hand
    // rides above it, and her arm bends at the elbow to follow (shoulder to elbow to hand, solved each frame).
    const ph = t * 1.2, sn = Math.sin(ph), cs = Math.cos(ph);
    const bodyX = 724 + sn * 3;
    ctx.save(); ctx.translate(bodyX, 392); ctx.scale(2.2, 2.2); ingrid(ctx, 0, 0, { t, stir: true }); ctx.restore();
    const B = [700 + sn * 30, 372 + cs * 3.5], Hd = [710 + sn * 12, 320 + cs * 3], S = [bodyX - 12, 289];
    // the vat on its iron stand: copper sides, rolled bands, a riveted seam, a brass spigot, and the curd in the whey
    contactShadow(ctx, 700, 452, 80, 7);
    ctx.fillStyle = '#2e2a26'; for (const lx of [634, 758]) ctx.fillRect(lx, 428, 7, 27);
    ctx.strokeStyle = '#2e2a26'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(638, 446); ctx.lineTo(761, 446); ctx.stroke();
    const vg = ctx.createLinearGradient(622, 0, 778, 0);
    vg.addColorStop(0, '#6e3416'); vg.addColorStop(.22, '#b8693a'); vg.addColorStop(.42, '#eab07a'); vg.addColorStop(.5, '#f6cfa0'); vg.addColorStop(.62, '#c27a3e'); vg.addColorStop(1, '#5e2c12');
    ctx.fillStyle = vg; ctx.beginPath(); ctx.moveTo(622, 372); ctx.lineTo(778, 372); ctx.lineTo(770, 432); ctx.quadraticCurveTo(700, 446, 630, 432); ctx.closePath(); ctx.fill();
    for (const [y0, k] of [[386, 1.5], [418, 3.6]]) {
      ctx.strokeStyle = 'rgba(70,30,10,.55)'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(624 + k * 1.2, y0); ctx.quadraticCurveTo(700, y0 + 3 + k, 776 - k * 1.2, y0); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,214,170,.45)'; ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(624 + k * 1.2, y0 - 1.4); ctx.quadraticCurveTo(700, y0 + 1.6 + k, 776 - k * 1.2, y0 - 1.4); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(60,24,8,.5)'; for (let y0 = 378; y0 < 436; y0 += 6) { ctx.beginPath(); ctx.arc(664, y0, .8, 0, 7); ctx.fill(); }
    ctx.strokeStyle = 'rgba(70,30,10,.35)'; ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(667, 373); ctx.lineTo(668, 440); ctx.stroke();
    ctx.fillStyle = 'rgba(255,236,200,.35)'; ctx.beginPath(); ctx.moveTo(700, 376); ctx.lineTo(708, 376); ctx.lineTo(706, 440); ctx.lineTo(699, 440); ctx.closePath(); ctx.fill();
    const sp = ctx.createLinearGradient(0, 432, 0, 444); sp.addColorStop(0, '#e8c36a'); sp.addColorStop(1, '#8a6420');
    ctx.fillStyle = sp; ctx.fillRect(716, 434, 12, 5); ctx.fillRect(724, 434, 4, 10); ctx.fillRect(712, 431, 9, 2.4);
    ctx.fillStyle = '#d9925a'; ctx.fillRect(620, 369, 160, 4);
    ctx.fillStyle = 'rgba(255,226,180,.6)'; ctx.fillRect(620, 369, 160, 1.2);
    const cg = ctx.createRadialGradient(690, 370, 4, 700, 372, 80); cg.addColorStop(0, '#f6eed2'); cg.addColorStop(1, '#ddd0a4');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.ellipse(700, 372, 78, 7, 0, 0, 7); ctx.fill();
    // curds drifting round with the stir, the whey sheen, and a wake behind the paddle
    ctx.fillStyle = 'rgba(214,200,150,.9)';
    for (let k = 0; k < 18; k++) {
      const a = pr(k + 300) * 7 + ph * .5, r = .25 + pr(k + 301) * .7;
      const x = 700 + Math.cos(a) * 70 * r, y = 372 + Math.sin(a) * 6 * r;
      ctx.beginPath(); ctx.ellipse(x, y, 2.6, 1.1, 0, 0, 7); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,240,.5)'; ctx.lineWidth = .7; ctx.beginPath(); ctx.ellipse(686, 370.5, 26, 2, 0, Math.PI * 1.1, Math.PI * 1.7); ctx.stroke();
    ctx.strokeStyle = 'rgba(160,138,82,.6)'; ctx.lineWidth = 1;
    for (const k of [0, 1]) { ctx.beginPath(); ctx.ellipse(B[0] - cs * (6 + k * 7), B[1], 5 + k * 5, 1.4 + k * .8, 0, 0, 7); ctx.stroke(); }
    ctx.fillStyle = 'rgba(150,128,74,.55)'; ctx.beginPath(); ctx.ellipse(B[0], B[1] + .5, 3.4, 1.3, 0, 0, 7); ctx.fill();
    // a floating dairy thermometer leaning on the rim
    ctx.save(); ctx.translate(762, 368); ctx.rotate(.35);
    ctx.fillStyle = '#9a7650'; ctx.fillRect(-2.2, -22, 4.4, 24); ctx.fillStyle = '#efe8d6'; ctx.fillRect(-1.2, -20, 2.4, 19);
    ctx.fillStyle = '#c0392b'; ctx.fillRect(-.4, -11, .8, 10); ctx.beginPath(); ctx.arc(0, -1, 1.1, 0, 7); ctx.fill();
    ctx.restore();
    // the warm curd steams a little
    for (let i = 0; i < 3; i++) {
      const u = (t * .25 + i / 3) % 1, sx = 670 + i * 30 + Math.sin(t * .7 + i * 2) * 8, sy = 364 - u * 50;
      const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 8 + u * 14);
      sg.addColorStop(0, `rgba(255,255,255,${(season === 'winter' ? .2 : .1) * Math.sin(u * Math.PI)})`); sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg; ctx.fillRect(sx - 24, sy - 24, 48, 48);
    }
    // the paddle, from its blade down in the curd up past her hand
    const pd = Math.hypot(Hd[0] - B[0], Hd[1] - B[1]), ux = (Hd[0] - B[0]) / pd, uy = (Hd[1] - B[1]) / pd;
    const T = [Hd[0] + ux * 18, Hd[1] + uy * 18];
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#7a5b3c'; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(B[0], B[1]); ctx.lineTo(T[0], T[1]); ctx.stroke();
    ctx.strokeStyle = 'rgba(214,180,130,.7)'; ctx.lineWidth = .9; ctx.beginPath(); ctx.moveTo(B[0] + .8, B[1]); ctx.lineTo(T[0] + .8, T[1]); ctx.stroke();
    ctx.fillStyle = 'rgba(232,222,186,.8)'; ctx.beginPath(); ctx.ellipse(B[0] + ux * 3, B[1] + uy * 3, 2, 1.2, Math.atan2(uy, ux), 0, 7); ctx.fill();
    // her arm: two segments from the shoulder, the elbow bent out to the side
    const L1 = 21, L2 = 20, dx = Hd[0] - S[0], dy = Hd[1] - S[1], d = Math.min(L1 + L2 - .5, Math.hypot(dx, dy));
    const base = Math.atan2(dy, dx), bend = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
    const elbows = [base + bend, base - bend].map(a => [S[0] + Math.cos(a) * L1, S[1] + Math.sin(a) * L1]);
    const E = elbows[0][0] < elbows[1][0] ? elbows[0] : elbows[1];
    ctx.strokeStyle = '#26436a'; ctx.lineWidth = 6.2; ctx.beginPath(); ctx.moveTo(S[0], S[1]); ctx.lineTo(E[0], E[1]); ctx.stroke();
    ctx.strokeStyle = '#2f4f7a'; ctx.lineWidth = 5.4; ctx.beginPath(); ctx.moveTo(E[0], E[1]); ctx.lineTo(Hd[0] - (Hd[0] - E[0]) * .12, Hd[1] - (Hd[1] - E[1]) * .12); ctx.stroke();
    ctx.strokeStyle = 'rgba(120,150,200,.35)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(S[0] + 1.5, S[1]); ctx.lineTo(E[0] + 1.5, E[1]); ctx.lineTo(Hd[0], Hd[1]); ctx.stroke();
    ctx.fillStyle = '#35588a'; ctx.beginPath(); ctx.ellipse(S[0], S[1] + 1, 5, 3.8, 0, 0, 7); ctx.fill();
    const fa = Math.atan2(Hd[1] - E[1], Hd[0] - E[0]);
    ctx.save(); ctx.translate(Hd[0], Hd[1]); ctx.rotate(fa);
    ctx.fillStyle = '#f1ece0'; ctx.fillRect(-5.2, -3, 2, 6);
    ctx.fillStyle = '#e2b996'; ctx.beginPath(); ctx.ellipse(0, 0, 3.6, 3, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(150,100,70,.6)'; ctx.lineWidth = .6; ctx.beginPath(); ctx.moveTo(1, -2.4); ctx.lineTo(1.2, 2.4); ctx.moveTo(2.4, -2); ctx.lineTo(2.5, 2); ctx.stroke();
    ctx.restore();
    ctx.lineCap = 'butt';
    if (brunost) {
      // the whey kettle boiling on the range, the fire glowing through the grate
      ctx.fillStyle = `rgba(255,${130 + Math.sin(t * 8) * 30 | 0},40,.85)`; ctx.fillRect(894, 500, 20, 6);
      const kg = ctx.createLinearGradient(898, 0, 940, 0); kg.addColorStop(0, '#1c1c1c'); kg.addColorStop(.6, '#4a4a4a'); kg.addColorStop(1, '#1c1c1c');
      ctx.fillStyle = kg; ctx.beginPath(); ctx.moveTo(898, 448); ctx.lineTo(940, 448); ctx.quadraticCurveTo(942, 466, 934, 468); ctx.lineTo(904, 468); ctx.quadraticCurveTo(896, 466, 898, 448); ctx.fill();
      ctx.fillStyle = '#7a4a22'; ctx.beginPath(); ctx.ellipse(919, 448, 21, 4, 0, 0, 7); ctx.fill();
      for (let i = 0; i < 4; i++) {
        const u = (t * .45 + i * .25) % 1, sg = ctx.createRadialGradient(914 + Math.sin(t + i) * 6, 440 - u * 60, 0, 914 + Math.sin(t + i) * 6, 440 - u * 60, 6 + u * 10);
        sg.addColorStop(0, `rgba(245,245,245,${.4 * (1 - u)})`); sg.addColorStop(1, 'rgba(245,245,245,0)');
        ctx.fillStyle = sg; ctx.fillRect(890, 360, 60, 100);
      }
    }
  }
  function milkHouse(ctx, s, t, season) {
    ctx.drawImage(dairyRoomPlate('milkhouse', season, g => {
      boards(g, 608, 48, W, 345, '#e3ddcd', 14, 17);
      g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(608, 48, W - 608, 297);
      roomCeiling(g);
      // the name on a board over the door
      boards(g, 706, 62, 862, 92, '#7a5a3a', 52, 21);
      g.strokeStyle = '#4e3822'; g.lineWidth = 1.5; g.strokeRect(706, 62, 156, 30);
      g.font = 'bold 16px Georgia'; g.textAlign = 'center'; g.fillStyle = '#f1e6c8'; g.fillText('MILK HOUSE', 784, 83);
      insideWindow(g, season, 876, 112, 58, 72, 2, 3, 320, '#e8e2d2');
      g.fillStyle = 'rgba(40,30,20,.2)'; g.fillRect(870, 190, 70, 3);
      // pails and the strainer on their pegs
      for (const [x, k] of [[656, 0], [700, 1], [744, 2]]) {
        g.fillStyle = '#5a4430'; g.fillRect(x - 2, 232, 4, 6);
        if (k === 2) {
          const sg = g.createLinearGradient(x - 12, 0, x + 12, 0); sg.addColorStop(0, '#7a8288'); sg.addColorStop(.6, '#e6ebed'); sg.addColorStop(1, '#868e93');
          g.fillStyle = sg; g.beginPath(); g.moveTo(x - 13, 244); g.lineTo(x + 13, 244); g.lineTo(x + 4, 266); g.lineTo(x - 4, 266); g.closePath(); g.fill();
          g.fillRect(x - 3, 266, 6, 6);
        } else {
          const pg = g.createLinearGradient(x - 12, 0, x + 12, 0); pg.addColorStop(0, '#7a8288'); pg.addColorStop(.6, '#e6ebed'); pg.addColorStop(1, '#868e93');
          g.fillStyle = pg; g.beginPath(); g.moveTo(x - 12, 246); g.lineTo(x + 12, 246); g.lineTo(x + 10, 274); g.lineTo(x - 10, 274); g.closePath(); g.fill();
          g.strokeStyle = '#6e767b'; g.lineWidth = 1; g.beginPath(); g.moveTo(x - 12, 246); g.quadraticCurveTo(x, 232, x + 12, 246); g.stroke();
        }
      }
      // the concrete floor, with a drain
      const fg = g.createLinearGradient(0, 345, 0, H); fg.addColorStop(0, '#c9c2b4'); fg.addColorStop(1, '#948b7d');
      g.fillStyle = fg; g.fillRect(608, 345, W - 608, H - 345);
      g.save(); g.globalAlpha = .8; g.translate(608, 345); g.fillStyle = patternFor(g, 'mottle', mottle); g.fillRect(0, 0, W - 608, H - 345); g.restore();
      g.fillStyle = '#4a4640'; g.beginPath(); g.ellipse(760, 512, 10, 3.4, 0, 0, 7); g.fill();
      // the inside of the cooling tank
      g.fillStyle = '#9a958a'; g.fillRect(640, 404, 210, 20);
      g.fillStyle = '#6f6a60'; g.fillRect(646, 408, 198, 16);
    }), 608, 0);
    // cans standing in spring water up to their shoulders
    const n = Math.min(6, Math.ceil(s.cows / 3));
    for (let k = 0; k < n; k++) milkCan(ctx, 666 + k * 32, 456, 1);
    ctx.fillStyle = 'rgba(120,160,175,.6)'; ctx.fillRect(646, 420, 198, 10);
    ctx.strokeStyle = 'rgba(235,248,255,.7)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let k = 0; k < 6; k++) { const x = 650 + k * 32 + Math.sin(t * 1.1 + k) * 3; ctx.moveTo(x, 423 + k % 2 * 3); ctx.lineTo(x + 16, 423 + k % 2 * 3); }
    ctx.stroke();
    contactShadow(ctx, 745, 484, 110, 6);
    const tg = ctx.createLinearGradient(0, 428, 0, 484); tg.addColorStop(0, '#c9c3b6'); tg.addColorStop(1, '#8f897c');
    ctx.fillStyle = tg; ctx.fillRect(640, 428, 210, 56);
    ctx.fillStyle = '#d8d3c6'; ctx.fillRect(638, 424, 214, 5);
    ctx.save(); ctx.globalAlpha = .5; ctx.translate(640, 428); ctx.fillStyle = patternFor(ctx, 'mottle', mottle); ctx.fillRect(0, 0, 210, 56); ctx.restore();
    // a cream separator when some of the milk goes to cream
    if (s.plan.milk && s.plan.milk.cream > 0) {
      contactShadow(ctx, 895, 484, 28, 4);
      const rg = ctx.createLinearGradient(880, 0, 910, 0); rg.addColorStop(0, '#7a1c1c'); rg.addColorStop(.6, '#c23a32'); rg.addColorStop(1, '#801e1e');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.moveTo(884, 482); ctx.lineTo(906, 482); ctx.lineTo(902, 410); ctx.lineTo(888, 410); ctx.closePath(); ctx.fill();
      ctx.fillRect(872, 476, 46, 8);
      const bg = ctx.createLinearGradient(872, 0, 918, 0); bg.addColorStop(0, '#8a9298'); bg.addColorStop(.6, '#eef2f3'); bg.addColorStop(1, '#8a9298');
      ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(895, 400, 16, 10, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(875, 372); ctx.lineTo(915, 372); ctx.lineTo(908, 392); ctx.lineTo(882, 392); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f4efe2'; ctx.beginPath(); ctx.ellipse(895, 372, 20, 4, 0, 0, 7); ctx.fill();
      ctx.save(); ctx.translate(906, 440); ctx.rotate(-t * 3); ctx.strokeStyle = '#2e2e2e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(18, 0); ctx.stroke();
      ctx.fillStyle = '#5a4430'; ctx.fillRect(16, -2, 4, 8); ctx.restore();
      ctx.font = 'italic 11px Georgia'; ctx.fillStyle = '#3a2a1a'; ctx.textAlign = 'center'; ctx.fillText('Cream separator', 895, 500);
    }
    // a note tacked to the wall
    ctx.save(); ctx.translate(628, 116); ctx.rotate(-.015);
    ctx.fillStyle = 'rgba(40,30,20,.25)'; ctx.fillRect(3, 3, 226, 60);
    ctx.fillStyle = '#f3ead2'; ctx.fillRect(0, 0, 226, 60);
    ctx.fillStyle = '#9a2a22'; ctx.beginPath(); ctx.arc(113, 6, 2.4, 0, 7); ctx.fill();
    ctx.fillStyle = '#3a2a1a'; ctx.font = 'italic 13px Georgia'; ctx.textAlign = 'center';
    ctx.fillText('No Ostehus yet. The milk goes to the', 113, 28);
    ctx.fillText('creamery and the cheese factory.', 113, 46);
    ctx.restore();
  }

  // ---------- shared pieces for the tab views ----------
  const dollars = (v) => `$${Math.round(v).toLocaleString()}`;
  function topSign(ctx, text) {
    ctx.font = 'bold 15px Georgia'; ctx.textAlign = 'center';
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = '#7a5a36'; ctx.fillRect(W / 2 - tw / 2 - 16, 10, tw + 32, 30);
    ctx.strokeStyle = '#4e3822'; ctx.lineWidth = 2; ctx.strokeRect(W / 2 - tw / 2 - 16, 10, tw + 32, 30);
    ctx.fillStyle = '#f6ecd2'; ctx.fillText(text, W / 2, 31);
  }
  function backdrop(ctx, s, t, season) {
    const p = PAL[season], loc = DATA.locations.find(l => l.id === s.locId) || DATA.locations[0], look = loc.look || {};
    const [fy, fa, ff, fl] = look.far || [215, 40, .006, 2.5];
    sky(ctx, season, t);
    distantBluffs(ctx, season, fy - 10 - fa - 22);
    ridge(ctx, fy - 10, fa, ff, 1.3, p.far, fl);
    ridge(ctx, fy + 40, fa * .6, ff * 1.5, 4.2, p.mid, fl);
    return { p, loc };
  }
  const ownedPower = (s) => s.machines.map(o => ({ o, m: DATA.machines.find(q => q.id === o.id) }))
    .filter(x => x.m && x.m.type === 'power').sort((a, b) => b.m.hp - a.m.hp);
  const ownsType = (s, type) => s.machines.map(o => DATA.machines.find(q => q.id === o.id)).find(m => m && m.type === type);
  function bigText(ctx, text, x, y, size, color, align = 'center') {
    ctx.font = `bold ${size}px Georgia`; ctx.textAlign = align; ctx.fillStyle = color; ctx.fillText(text, x, y);
  }
  // What the farm hauls to town: sacks of grain, cans, cheese wheels, and boards, stacked on the bed
  function loadOn(ctx, x, y, w, load) {
    const boards = Math.min(5, load.lumber || 0);
    for (let k = 0; k < boards; k++) { ctx.fillStyle = k % 2 ? '#d8b77e' : '#cfa96c'; ctx.fillRect(x, y - 3 - k * 3, w, 3); }
    const by = y - boards * 3;
    let cx = x + 2;
    for (let k = 0; k < Math.min(3, load.cans || 0); k++) { milkCan(ctx, cx + 6, by, .6); cx += 12; }
    for (let k = 0; k < Math.min(4, load.cheese || 0); k++) { ctx.fillStyle = '#e8b33a'; ctx.beginPath(); ctx.ellipse(cx + 6, by - 5, 6, 5, 0, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(120,80,30,.6)'; ctx.lineWidth = 1; ctx.stroke(); cx += 12; }
    const sacks = Math.min(10, load.sacks || 0);
    for (let k = 0; k < sacks; k++) {
      const row = cx + 6 > x + w - 6 ? 1 : 0;
      if (row) { cx = x + 6 + (k % 5) * 12; }
      ctx.fillStyle = '#d9c9a0'; ctx.beginPath(); ctx.ellipse(cx + 6, by - 6 - row * 9, 7, 5.5, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(110,90,60,.6)'; ctx.lineWidth = 1; ctx.stroke();
      cx += 12;
    }
  }
  // The farm's road rig for the era: team and wagon (a bobsled in snow), a Model T ton truck, then a pickup
  function farmRig(ctx, x, y, year, t, season, load = {}, travel = 0) {
    const snow = season === 'winter';
    if (year < 1922) {
      // a team of drafts at full size (taller than a truck cab), in harness, on the wagon tongue
      const H = 1.6, team = (hx, hy, k) => { ctx.save(); ctx.translate(hx, hy); ctx.scale(H, H); horse(ctx, 0, -17, 1, t, k, travel !== 0, 0, true); ctx.restore(); };
      team(x + 94, y - 5, 1);
      ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(x + 36, y - 18); ctx.lineTo(x + 96, y - 26); ctx.stroke();
      ctx.strokeStyle = '#4a3a2a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x + 46, y - 22); ctx.lineTo(x + 62, y - 22); ctx.stroke();
      team(x + 86, y, 0);
      // the lines from the driver's hands to the bits
      ctx.strokeStyle = '#2a1c12'; ctx.lineWidth = .9; ctx.beginPath(); ctx.moveTo(x + 30, y - 40); ctx.quadraticCurveTo(x + 70, y - 50, x + 118, y - 46); ctx.stroke();
      person(ctx, x + 26, y - 46, '#a5493c', '#d9c07a');
      ctx.fillStyle = '#7a5532'; ctx.fillRect(x - 40, y - 32, 78, 16);
      ctx.fillStyle = '#2e6b3a'; ctx.fillRect(x - 40, y - 33, 78, 2); ctx.fillStyle = '#5c3f24'; ctx.fillRect(x - 40, y - 18, 78, 3);
      if (snow) {
        ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(x - 44, y - 5); ctx.lineTo(x + 34, y - 5); ctx.quadraticCurveTo(x + 46, y - 5, x + 42, y - 14); ctx.stroke();
        ctx.lineWidth = 2; for (const k of [-30, 20]) { ctx.beginPath(); ctx.moveTo(x + k, y - 15); ctx.lineTo(x + k, y - 5); ctx.stroke(); }
      } else { wheel(ctx, x - 26, y - 10, 10, '#8a2f22', travel / 10, true); wheel(ctx, x + 24, y - 9, 9, '#8a2f22', travel / 9, true); }
      loadOn(ctx, x - 38, y - 32, 74, load);
      return;
    }
    const truck = year < 1946, body = truck ? '#1e1e1e' : '#3d6b4a';
    ctx.fillStyle = '#6b4a2a'; ctx.fillRect(x - 46, y - 30, 56, 12);
    ctx.fillStyle = '#4e3520'; for (const k of [-46, -28, -10, 6]) ctx.fillRect(x + k, y - 40, 3, 22);
    ctx.fillRect(x - 46, y - 40, 56, 2);
    ctx.fillStyle = body;
    if (truck) {
      ctx.fillRect(x + 10, y - 48, 24, 30); ctx.fillRect(x + 34, y - 34, 24, 16);
      ctx.fillStyle = '#9bb3c4'; ctx.fillRect(x + 14, y - 44, 14, 10);
      ctx.fillStyle = '#c9c9c9'; ctx.fillRect(x + 56, y - 34, 3, 16);
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(x + 46, y - 16, 10, Math.PI, 0); ctx.fill(); ctx.beginPath(); ctx.arc(x - 26, y - 16, 10, Math.PI, 0); ctx.fill();
    } else {
      ctx.beginPath(); ctx.moveTo(x + 10, y - 18); ctx.lineTo(x + 10, y - 44); ctx.quadraticCurveTo(x + 12, y - 50, x + 22, y - 50); ctx.lineTo(x + 30, y - 50); ctx.quadraticCurveTo(x + 36, y - 48, x + 38, y - 36);
      ctx.quadraticCurveTo(x + 62, y - 36, x + 64, y - 26); ctx.lineTo(x + 64, y - 18); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#9bb3c4'; ctx.fillRect(x + 14, y - 46, 18, 10);
      ctx.fillStyle = '#d0d0d0'; ctx.fillRect(x + 60, y - 24, 6, 4);
    }
    if (travel) { ctx.fillStyle = '#e5bc97'; ctx.beginPath(); ctx.arc(x + 24, y - 40, 3, 0, 7); ctx.fill(); }
    wheel(ctx, x - 26, y - 9, 9, truck ? '#3a3a3a' : '#c9c9c9', travel / 9, false); wheel(ctx, x + 46, y - 9, 9, truck ? '#3a3a3a' : '#c9c9c9', travel / 9, false);
    loadOn(ctx, x - 44, y - 30, 52, load);
  }

  function roadCarFor(year, trip = 0) {
    const pick = (list) => list[((trip % list.length) + list.length) % list.length];
    // No new cars were built for civilians from 1942 to 1945; farm towns kept their old Fords running, so the
    // wartime road alternates a Model T with the prewar cars.
    if (year >= 1942 && year <= 1945) {
      const t = DATA.roadCars.find(c => c.id === 'ford_t'), old = DATA.roadCars.filter(c => c.country === 'USA' && c.from <= 1941 && year <= c.through && c.id !== 'ford_t');
      return trip % 2 === 0 || !old.length ? t : pick(old);
    }
    const cars = DATA.roadCars.filter(c => c.country === 'USA' && c.from <= year && year <= c.through).sort((a, b) => b.from - a.from);
    return cars.length ? pick(cars) : null;
  }

  function roadCar(ctx, car, travel, year = 1937) {
    if (!car) return;
    if (car.style === 'touring' || car.style === 'ford37' || car.style === 'packard') {
      const draw = car.style === 'touring' ? modelT : prewarSedan;
      lit(ctx, -96, -78, 104, 2, c => draw(c, car, travel, year), [0, 0, 70, 5]);
      return;
    }
    roadCarLate(ctx, car, travel);
  }
  // Shared pieces for the early cars: a crowned fender, and a wheel with its tire, rim, and hub.
  function carFender(c, cx, r, body, front) {
    const fg = c.createLinearGradient(0, -r * 2.4, 0, -r * .6);
    fg.addColorStop(0, tone(body, .22)); fg.addColorStop(.5, body); fg.addColorStop(1, tone(body, -.35));
    c.fillStyle = fg; c.beginPath();
    if (front) { c.moveTo(cx - r * 1.55, -r * .95); c.bezierCurveTo(cx - r * 1.3, -r * 2.2, cx + r * .7, -r * 2.5, cx + r * 1.7, -r * 1.05); c.lineTo(cx + r * 1.75, -r * .8); c.lineTo(cx + r * 1.2, -r * .8); }
    else { c.moveTo(cx + r * 1.5, -r * .95); c.bezierCurveTo(cx + r * 1.3, -r * 2.25, cx - r * .9, -r * 2.4, cx - r * 1.65, -r * 1); c.lineTo(cx - r * 1.65, -r * .78); c.lineTo(cx - r * 1.1, -r * .8); }
    c.quadraticCurveTo(cx, -r * 2.05, front ? cx - r * 1.2 : cx + r * 1.15, -r * .85); c.closePath(); c.fill();
    c.strokeStyle = rgba(tone(body, .5), .6); c.lineWidth = .8; c.beginPath(); c.arc(cx, -r * .9, r * 1.18, Math.PI * 1.2, Math.PI * 1.75); c.stroke();
  }
  // A 1937 Ford Tudor (or Packard One-Twenty): pontoon fenders and running boards, a long louvered hood, the V
  // grille, a sloped back with a trunk bustle, and a spare in the rear. Side view facing +x, ground at 0.
  function prewarSedan(c, car, travel, year) {
    const packard = car.style === 'packard', body = car.body, chrome = car.deluxe ? '#e6e2d6' : '#b1b6b8';
    const rear = packard ? -44 : -38, front = packard ? 52 : 44, r = 12, nose = front + 27, back = rear - 26;
    const bg = c.createLinearGradient(0, -66, 0, -14); bg.addColorStop(0, tone(body, .2)); bg.addColorStop(.45, body); bg.addColorStop(1, tone(body, -.32));
    // the body: trunk bustle, the sloped back, roof, upright windshield, cowl, long hood, and the grille's prow
    c.fillStyle = bg; c.beginPath();
    c.moveTo(back + 4, -15); c.quadraticCurveTo(back - 2, -26, back + 3, -34); c.quadraticCurveTo(back + 10, -40, rear - 4, -42);
    c.quadraticCurveTo(-34, -60, -22, -64); c.lineTo(-2, -64); c.quadraticCurveTo(4, -63, 6, -58); c.lineTo(10, -46);
    c.lineTo(front + 4, packard ? -46 : -43); c.quadraticCurveTo(nose - 6, packard ? -45 : -42, nose - 3, packard ? -40 : -36);
    c.quadraticCurveTo(nose + 1, -28, nose - 3, -18); c.lineTo(nose - 6, -15); c.closePath(); c.fill();
    // roof sheen, belt molding, door seam and handle
    c.fillStyle = 'rgba(255,255,255,.18)'; c.beginPath(); c.moveTo(-30, -60); c.quadraticCurveTo(-22, -64, -4, -63); c.lineTo(-4, -61.6); c.quadraticCurveTo(-20, -62.4, -28, -58.6); c.fill();
    c.strokeStyle = chrome; c.lineWidth = car.deluxe ? 1.2 : .8; c.beginPath(); c.moveTo(back + 6, -38); c.lineTo(front + 2, -40.5); c.stroke();
    c.strokeStyle = 'rgba(20,24,28,.55)'; c.lineWidth = .7; c.beginPath(); c.moveTo(-20, -59); c.lineTo(-20, -18); c.moveTo(8, -46); c.lineTo(9, -18); c.stroke();
    c.fillStyle = chrome; c.fillRect(-15, -35, 6, 1.4);
    // windows: rear quarter and door glass, with sky in them
    const glass = (pts) => { const gg = c.createLinearGradient(0, -60, 0, -44); gg.addColorStop(0, '#d5e3ea'); gg.addColorStop(.5, '#8fa9b8'); gg.addColorStop(1, '#4c6372'); c.fillStyle = gg; shape(c, pts); c.fill(); };
    glass([[-37, -44.5], [-29, -57], [-22, -59.5], [-22, -44.5]]);
    glass([[-18, -59.5], [-1, -59.5], [3, -57], [7, -44.5], [-18, -44.5]]);
    c.fillStyle = 'rgba(255,255,255,.25)'; shape(c, [[-14, -59], [-9, -59], [-15, -45], [-17, -45]]); c.fill();
    c.fillStyle = tone(body, -.4); c.fillRect(-20.6, -59.5, 1.6, 15);
    // the driver
    c.fillStyle = '#3a4a5c'; c.fillRect(-6, -50, 7, 6); c.fillStyle = '#e5bc97'; c.beginPath(); c.arc(-2.4, -53.2, 2.8, 0, 7); c.fill();
    c.fillStyle = '#4a3a2a'; c.beginPath(); c.ellipse(-2.6, -55.6, 3.6, 1, 0, 0, 7); c.fill(); c.fillRect(-4.6, -58.4, 4.4, 2.8);
    // hood louvers and side
    c.strokeStyle = rgba(tone(body, -.55), .8); c.lineWidth = .8; c.beginPath();
    for (let k = 0; k < (packard ? 9 : 4); k++) { const x = 20 + k * (packard ? 3.6 : 6); c.moveTo(x, -40); c.lineTo(x + (packard ? -1 : 4), packard ? -31 : -40); if (!packard) { c.moveTo(x, -36); c.lineTo(x + 4, -36); } }
    c.stroke();
    // the grille: Ford's pointed V or Packard's tall shell with its ox-yoke top
    c.fillStyle = chrome; c.beginPath(); c.moveTo(nose - 4, packard ? -42 : -37); c.quadraticCurveTo(nose + 1.5, -28, nose - 3, -18); c.lineTo(nose - 5.5, -18); c.quadraticCurveTo(nose - 2, -28, nose - 6.5, packard ? -42 : -37); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(40,44,48,.6)'; c.lineWidth = .5; c.beginPath(); for (let y = -36; y < -19; y += 2.2) { c.moveTo(nose - 5.6, y); c.lineTo(nose - 2.4, y); } c.stroke();
    if (packard) { c.fillStyle = chrome; c.beginPath(); c.moveTo(nose - 8, -44); c.lineTo(nose - 6, -49); c.lineTo(nose - 2, -46); c.closePath(); c.fill(); }
    // running board, fenders, and the spare on the back
    c.fillStyle = '#26292b'; c.fillRect(rear + 14, -15.5, front - rear - 30, 3.2);
    c.fillStyle = 'rgba(160,160,150,.5)'; for (let x = rear + 16; x < front - 18; x += 4) c.fillRect(x, -15.2, 2, .6);
    carFender(c, rear, r, body, false);
    carFender(c, front, r, body, true);
    c.fillStyle = tone(body, -.15); c.beginPath(); c.ellipse(back + 1, -28, 4, 11, 0, 0, 7); c.fill();
    c.fillStyle = chrome; c.beginPath(); c.ellipse(back, -28, 2, 5.5, 0, 0, 7); c.fill();
    // headlamp on the fender (in the catwalk on the Ford), bumpers with guards
    const lx = front + (packard ? 16 : 18), ly = packard ? -33 : -27;
    c.fillStyle = chrome; c.beginPath(); c.ellipse(lx, ly, 4.6, 3.6, -.25, 0, 7); c.fill();
    const lg = c.createRadialGradient(lx + 1.2, ly - .6, .3, lx + 1, ly, 3); lg.addColorStop(0, '#fffbe6'); lg.addColorStop(1, '#d8c890');
    c.fillStyle = lg; c.beginPath(); c.ellipse(lx + 1, ly, 2.8, 2.4, -.25, 0, 7); c.fill();
    if (packard) { c.fillStyle = chrome; c.fillRect(lx - 1, ly + 3, 2, 8); }
    for (const [x0, x1] of [[back - 5, back + 7], [nose - 6, nose + 6]]) {
      const bb = c.createLinearGradient(0, -14, 0, -9); bb.addColorStop(0, '#f6f4ee'); bb.addColorStop(1, '#8c9194');
      c.fillStyle = bb; c.fillRect(x0, -14.5, x1 - x0, 3.6);
    }
    for (const wx of [rear, front]) carWheel(c, wx, r, travel, car.deluxe ? '#e9e5d7' : '#2a2e30', chrome, false);
  }
  // A Ford Model T touring car: open tub body with the top up, upright windshield, the radiator (brass before 1917,
  // black after), flat fenders and running boards, and wooden artillery wheels.
  function modelT(c, car, travel, year) {
    const body = car.body, black = '#1d2023', brass = year < 1917, r = 14;
    const rear = -34, front = 38;
    // running boards and fenders: flat, curving down over the wheels
    c.fillStyle = '#16191b'; c.fillRect(rear + 12, -19, front - rear - 24, 2.6);
    const fend = (cx, dir) => {
      c.fillStyle = black; c.beginPath(); c.moveTo(cx - 17 * dir, -18.5);
      c.quadraticCurveTo(cx - 10 * dir, -33, cx + 6 * dir, -31); c.quadraticCurveTo(cx + 14 * dir, -29, cx + 18 * dir, -22);
      c.lineTo(cx + 17 * dir, -20); c.quadraticCurveTo(cx + 10 * dir, -28, cx - 2 * dir, -29.5); c.quadraticCurveTo(cx - 10 * dir, -29, cx - 13 * dir, -18.5); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = .7; c.beginPath(); c.moveTo(cx - 12 * dir, -27); c.quadraticCurveTo(cx - 2 * dir, -32.4, cx + 10 * dir, -29.6); c.stroke();
    };
    // the tub: rear seat with its rolled back, front doors, then the cowl and hood
    const bg = c.createLinearGradient(0, -44, 0, -19); bg.addColorStop(0, tone(body, .2)); bg.addColorStop(1, tone(body, -.3));
    c.fillStyle = bg; c.beginPath(); c.moveTo(-50, -20); c.quadraticCurveTo(-54, -34, -48, -42); c.lineTo(-30, -42); c.lineTo(-28, -36); c.lineTo(-6, -36); c.lineTo(-4, -40);
    c.lineTo(8, -40); c.lineTo(12, -38); c.lineTo(42, -36); c.lineTo(44, -22); c.lineTo(36, -20); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = .6; c.beginPath(); c.moveTo(-28, -36); c.lineTo(-28, -21); c.moveTo(-6, -36); c.lineTo(-6, -21); c.moveTo(12, -38); c.lineTo(12, -21); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(14, -37.6, 26, 1.4);
    // hood louvers and the radiator
    c.strokeStyle = 'rgba(0,0,0,.55)'; c.lineWidth = .7; c.beginPath(); for (let x = 18; x < 36; x += 3) { c.moveTo(x, -34); c.lineTo(x, -27); } c.stroke();
    const rg = c.createLinearGradient(42, 0, 49, 0); rg.addColorStop(0, brass ? '#8a6a20' : '#121416'); rg.addColorStop(.5, brass ? '#f0d27a' : '#3a3e42'); rg.addColorStop(1, brass ? '#9a7a2a' : '#16191b');
    c.fillStyle = rg; c.fillRect(42, -43, 6.5, 22); c.fillRect(43.5, -46, 3.5, 3);
    c.strokeStyle = brass ? 'rgba(90,64,20,.6)' : 'rgba(120,130,136,.5)'; c.lineWidth = .4; c.beginPath(); for (let y = -41; y < -22; y += 1.6) { c.moveTo(42.6, y); c.lineTo(48, y); } c.stroke();
    // the folding top on its bows, and the windshield frame
    c.fillStyle = '#25282a'; c.beginPath(); c.moveTo(-52, -42); c.quadraticCurveTo(-50, -66, -32, -68); c.lineTo(8, -68); c.lineTo(9, -64.5); c.lineTo(-30, -64.5); c.quadraticCurveTo(-44, -62, -46, -42); c.closePath(); c.fill();
    c.strokeStyle = '#3a3e40'; c.lineWidth = .8; c.beginPath(); for (const bx of [-38, -22, -6]) { c.moveTo(bx, -66); c.lineTo(bx - 3, -42); } c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = .8; c.beginPath(); c.moveTo(-46, -54); c.quadraticCurveTo(-42, -66, -30, -67); c.lineTo(6, -67); c.stroke();
    c.strokeStyle = brass ? '#c9a24a' : '#2a2e30'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(8, -40); c.lineTo(9, -66); c.stroke();
    c.fillStyle = 'rgba(190,214,226,.45)'; c.fillRect(9, -64, 2, 22);
    // the driver in his hat and coat, a hand on the wheel
    c.fillStyle = '#4a4a3a'; c.fillRect(-6, -48, 8, 9); c.fillStyle = '#e5bc97'; c.beginPath(); c.arc(-1.6, -51.6, 3, 0, 7); c.fill();
    c.fillStyle = '#3a3026'; c.beginPath(); c.ellipse(-1.8, -54.2, 4, 1.1, 0, 0, 7); c.fill(); c.fillRect(-4.2, -57.4, 4.8, 3.2);
    c.strokeStyle = '#1a1a1a'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(3, -46); c.lineTo(7, -40); c.stroke();
    c.strokeStyle = '#4a4a3a'; c.lineWidth = 1.8; c.beginPath(); c.moveTo(0, -46); c.lineTo(4, -45); c.stroke();
    fend(rear, -1); fend(front, 1);
    // brass (or black) headlamps and the cowl lamp
    const lamp = brass ? '#d9b44a' : '#2a2e30';
    c.fillStyle = lamp; c.beginPath(); c.arc(52, -30, 3.4, 0, 7); c.fill(); c.fillRect(49, -28, 2, 6);
    c.fillStyle = '#f6edc8'; c.beginPath(); c.ellipse(54, -30, 1.4, 2.6, 0, 0, 7); c.fill();
    c.fillStyle = lamp; c.fillRect(10, -38, 3, 4);
    for (const wx of [rear, front]) carWheel(c, wx, r, travel, '#9b7c48', brass ? '#d9b44a' : '#2a2e30', true);
  }
  function carWheel(c, x, r, travel, rim, hub, spoked) {
    c.fillStyle = 'rgba(20,16,12,.3)'; c.beginPath(); c.ellipse(x, -.5, r * 1.05, 2, 0, 0, 7); c.fill();
    const tg = c.createRadialGradient(x - r * .3, -r - r * .3, r * .2, x, -r, r);
    tg.addColorStop(0, '#3c4144'); tg.addColorStop(.8, '#1d2123'); tg.addColorStop(1, '#101214');
    c.fillStyle = tg; c.beginPath(); c.arc(x, -r, r, 0, 7); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.1)'; c.lineWidth = .8; c.beginPath(); c.arc(x, -r, r - 1.4, Math.PI * 1.1, Math.PI * 1.7); c.stroke();
    if (spoked) {
      c.fillStyle = '#2c2420'; c.beginPath(); c.arc(x, -r, r * .74, 0, 7); c.fill();
      c.strokeStyle = rim; c.lineWidth = 1.6; c.beginPath(); c.arc(x, -r, r * .72, 0, 7); c.stroke();
      spokes(c, x, -r, r * .7, rim, travel / r);
    } else {
      c.fillStyle = rim; c.beginPath(); c.arc(x, -r, r * .66, 0, 7); c.fill();
      c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.arc(x + .6, -r + .6, r * .5, 0, 7); c.fill();
      const ang = travel / r;
      c.strokeStyle = 'rgba(255,255,255,.3)'; c.lineWidth = .8; c.beginPath(); c.arc(x, -r, r * .58, ang, ang + 1.2); c.stroke();
    }
    const hg = c.createRadialGradient(x - 1, -r - 1, .2, x, -r, r * .3);
    hg.addColorStop(0, '#ffffff'); hg.addColorStop(1, hub);
    c.fillStyle = hg; c.beginPath(); c.arc(x, -r, r * .28, 0, 7); c.fill();
  }

  function roadCarLate(ctx, car, travel) {
    const style = car.style, prewar = ['touring', 'upright', 'ford37', 'packard'].includes(style);
    const packard = style === 'packard', fins = style === 'fins', hardtop = style === 'hardtop';
    const rear = packard ? -45 : fins ? -54 : hardtop ? -47 : -36;
    const front = packard ? 57 : fins ? 60 : hardtop ? 54 : 46;
    const back = rear - 23, nose = front + 26, radius = 12;
    const chrome = car.deluxe ? '#e2ded1' : '#a9afb0';
    const poly = (points, color) => {
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(...points[0]);
      for (const p of points.slice(1)) ctx.lineTo(...p);
      ctx.closePath(); ctx.fill();
    };
    ctx.save();
    ctx.fillStyle = '#24292c'; ctx.fillRect(back, -15, nose - back, 5);
    if (style === 'touring') {
      ctx.fillStyle = car.body; ctx.fillRect(-46, -34, 50, 20); ctx.fillRect(10, -39, 43, 23);
      ctx.fillStyle = '#66533f'; ctx.fillRect(-40, -32, 32, 5);
      ctx.fillStyle = '#24292c'; ctx.fillRect(-43, -58, 52, 4); ctx.fillRect(-41, -56, 2, 24); ctx.fillRect(6, -55, 2, 34);
      poly([[8,-54],[11,-52],[11,-33],[8,-33]], '#a4c7d7');
      ctx.fillStyle = '#b69b50'; ctx.fillRect(51, -42, 5, 25);
      ctx.fillStyle = '#252b30'; ctx.fillRect(52, -38, 2, 17);
      ctx.fillStyle = '#e5bc97'; ctx.beginPath(); ctx.arc(-1, -41, 3, 0, 7); ctx.fill();
    } else if (style === 'upright') {
      ctx.fillStyle = car.body;
      ctx.beginPath(); ctx.moveTo(-48, -17); ctx.lineTo(-48, -49);
      ctx.quadraticCurveTo(-46, -64, -35, -65); ctx.lineTo(-3, -65);
      ctx.quadraticCurveTo(4, -62, 7, -48); ctx.lineTo(12, -41); ctx.lineTo(56, -41); ctx.lineTo(60, -18); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#252b30'; ctx.fillRect(-40, -65, 38, 4);
      poly([[-40,-56],[-24,-56],[-24,-39],[-40,-39]], '#a4c7d7');
      poly([[-19,-56],[-3,-56],[3,-39],[-19,-39]], '#a4c7d7');
      ctx.fillStyle = chrome; ctx.fillRect(55, -43, 4, 25);
      ctx.fillStyle = '#252b30'; ctx.fillRect(56, -39, 1, 17);
    } else if (prewar) {
      ctx.fillStyle = car.body;
      ctx.beginPath(); ctx.moveTo(back, -16); ctx.quadraticCurveTo(back - 2, -33, rear - 9, -46);
      ctx.quadraticCurveTo(-38, -66, -22, packard ? -68 : -70);
      ctx.quadraticCurveTo(-5, -72, 9, -59); ctx.lineTo(22, -44);
      ctx.quadraticCurveTo(front + 5, packard ? -48 : -43, nose - 5, packard ? -43 : -35);
      ctx.lineTo(nose, -21); ctx.lineTo(nose - 4, -15); ctx.closePath(); ctx.fill();
      poly([[-42,-45],[-34,-58],[-20,-61],[-20,-43]], '#a4c7d7');
      poly([[-15,-61],[2,-57],[15,-43],[-15,-43]], '#a4c7d7');
      ctx.strokeStyle = chrome; ctx.lineWidth = car.deluxe ? 1.1 : .6;
      ctx.beginPath(); ctx.moveTo(-44, -40); ctx.lineTo(20, -40); ctx.stroke();
      ctx.strokeStyle = car.deluxe ? '#c7c6b8' : '#71818c'; ctx.lineWidth = .9; ctx.beginPath();
      if (packard) {
        for (let x = 26; x < 62; x += 4) { ctx.moveTo(x, -41); ctx.lineTo(x - 2, -32); }
      } else {
        for (let y = -38; y <= -32; y += 2) { ctx.moveTo(27, y); ctx.lineTo(55, y + 1); }
      }
      ctx.stroke();
      ctx.strokeStyle = chrome; ctx.lineWidth = packard ? 3 : 2;
      ctx.beginPath(); ctx.moveTo(nose - 6, packard ? -44 : -37); ctx.lineTo(nose - 2, -25); ctx.lineTo(nose - 5, -18); ctx.stroke();
      if (packard) {
        ctx.strokeStyle = chrome; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(nose - 9, -44); ctx.lineTo(nose - 7, -49); ctx.lineTo(nose - 2, -47); ctx.stroke();
      }
    } else {
      ctx.fillStyle = car.body;
      ctx.beginPath(); ctx.moveTo(back, -14); ctx.lineTo(back, fins ? -44 : -31);
      ctx.lineTo(rear + 8, -33); ctx.lineTo(-27, hardtop ? -54 : -56);
      ctx.quadraticCurveTo(-21, -61, -8, -59); ctx.lineTo(14, -58);
      ctx.lineTo(32, -34); ctx.lineTo(nose - 2, -32); ctx.lineTo(nose, -16); ctx.closePath(); ctx.fill();
      poly([[-25,-35],[-20,-53],[-5,-54],[-5,-35]], '#a4c7d7');
      poly([[0,-54],[12,-53],[26,-35],[0,-35]], '#a4c7d7');
      if (style === 'belair' || fins) {
        poly([[-28,-55],[-23,-60],[15,-60],[20,-55]], '#eee6d4');
        poly([[back+2,-30],[-12,-26],[-23,-19],[back+2,-22]], '#eee6d4');
      }
      ctx.strokeStyle = chrome; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(back + 2, -30); ctx.lineTo(nose - 4, -29); ctx.stroke();
      if (fins) {
        poly([[back,-44],[-28,-30],[back,-32]], '#d7c6bf');
        ctx.fillStyle = '#b52d36';
        for (const y of [-38, -33]) { ctx.beginPath(); ctx.ellipse(back + 2, y, 4, 1.7, 0, 0, 7); ctx.fill(); }
      }
      ctx.fillStyle = '#f3e7be'; ctx.fillRect(nose - 3, -29, 3, hardtop ? 7 : 5);
      ctx.fillStyle = '#a6adb0'; ctx.fillRect(nose - 3, -20, 3, 5);
    }
    if (style !== 'touring') {
      ctx.fillStyle = '#385067'; ctx.fillRect(1, prewar ? -43 : -40, 6, 8);
      ctx.fillStyle = '#e5bc97'; ctx.beginPath(); ctx.arc(4, prewar ? -47 : -44, 3, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(20,27,32,.5)'; ctx.lineWidth = .8;
      ctx.beginPath(); ctx.moveTo(-18, -38); ctx.lineTo(-18, -18); ctx.stroke();
      ctx.fillStyle = chrome; ctx.fillRect(-13, -36, 5, 1);
    }
    if (prewar) {
      ctx.fillStyle = '#242a2c'; ctx.fillRect(rear + 9, -15, front - rear - 18, 5);
      ctx.fillStyle = chrome; ctx.fillRect(rear + 10, -15, front - rear - 20, 1);
      for (const wx of [rear, front]) {
        ctx.fillStyle = car.deluxe ? '#472c34' : '#252e32';
        ctx.beginPath(); ctx.ellipse(wx, -12, 19, 20, 0, Math.PI, Math.PI * 2); ctx.lineTo(wx + 21, -10); ctx.lineTo(wx - 21, -10); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = car.deluxe ? '#9c7772' : '#596773'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(wx, -12, 18, 19, 0, Math.PI * 1.08, Math.PI * 1.94); ctx.stroke();
      }
      const lampX = front + 13, lampY = style === 'ford37' ? -28 : -35;
      ctx.fillStyle = chrome; ctx.beginPath(); ctx.ellipse(lampX, lampY, 5, 4, -.2, 0, 7); ctx.fill();
      ctx.fillStyle = '#f4e3b2'; ctx.beginPath(); ctx.ellipse(lampX + 1, lampY, 3, 2.5, -.2, 0, 7); ctx.fill();
    }
    ctx.fillStyle = chrome; ctx.fillRect(back - 3, -14, 8, 3); ctx.fillRect(nose - 2, -14, 8, 3);
    for (const wx of [rear, front]) {
      wheel(ctx, wx, -radius, radius, '#9ba4a7', travel / radius, false);
      if (style === 'touring' || style === 'upright') spokes(ctx, wx, -radius, 8, style === 'touring' ? '#9b7c48' : '#c5c1ae', travel / radius);
      else {
        if (car.deluxe) { ctx.strokeStyle = '#e9e5d7'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(wx, -radius, 9.2, 0, 7); ctx.stroke(); }
        ctx.fillStyle = chrome; ctx.beginPath(); ctx.arc(wx, -radius, 4, 0, 7); ctx.fill();
      }
    }
    ctx.restore();
  }

  function marketTraffic(ctx, s, t, season, front) {
    const y = s.year, speed = front ? 38 : 27, dir = front ? -1 : 1;
    const margin = 300, span = W + margin * 2, ground = front ? 526 : 474;
    for (let k = 0; k < 2; k++) {
      const progress = cycleAt(t * speed + k * span / 2 + (front ? 620 : 260), span);
      const x = dir === 1 ? progress - margin : W + margin - progress;
      // By the mid-1950s the draft teams were nearly gone from Wisconsin roads, so the far-lane wagon gives way to a car.
      const kind = front ? (y >= 1908 ? (k && y >= 1922 ? 'truck' : 'car') : 'wagon')
        : k === 0 ? (y > 1954 ? 'car' : 'wagon') : y >= 1922 ? 'truck' : 'horse';
      // the far lane runs a little smaller than the near one; near-lane trucks loom large and cars stay modest
      const sc = !front ? (kind === 'car' ? 1.0 : 1.26) : kind === 'truck' ? 1.68 : kind === 'car' ? .96 : 1.2;
      ctx.save(); ctx.translate(x, ground); ctx.scale(sc * dir, sc);
      const team = kind === 'wagon' || (kind === 'truck' && y < 1922), [shx, shr] = kind === 'horse' ? [0, 46] : team ? [40, 88] : [6, 63];
      ctx.fillStyle = 'rgba(40,34,27,.18)'; ctx.beginPath(); ctx.ellipse(shx, -1, shr, 5, 0, 0, 7); ctx.fill();
      const travel = t * speed / sc;
      if (kind === 'car') {
        const trip = Math.floor((t * speed + k * span / 2 + (front ? 620 : 260)) / span);
        roadCar(ctx, roadCarFor(y, trip + (front ? 0 : 1)), travel, y);
      }
      else if (kind === 'horse') {
        // a rider on a saddle horse, both at full size
        ctx.save(); ctx.scale(1.6, 1.6);
        horse(ctx, 0, -17, 1, t, k);
        ctx.fillStyle = '#4a2e1a'; ctx.beginPath(); ctx.ellipse(-2, -25.4, 6, 2, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = '#2a1c12'; ctx.lineWidth = .6; ctx.beginPath(); ctx.moveTo(-1, -24); ctx.lineTo(-1, -14); ctx.stroke();
        person(ctx, -2, -43, '#3f6683', '#d2dbe3');
        ctx.restore();
      } else farmRig(ctx, 0, 0, kind === 'wagon' ? 1900 : y, t, season, k ? { cans: 2 } : { sacks: 3 }, travel);
      if (y < 1945 && season !== 'winter' && season !== 'spring') {
        for (let j = 0; j < 3; j++) {
          const age = cycleAt(t * .7 + j / 3, 1);
          ctx.fillStyle = `rgba(211,194,158,${.16 * Math.sin(age * Math.PI)})`;
          ctx.beginPath(); ctx.ellipse(-54 - age * 32, -4 - age * 7, 7 + age * 8, 3 + age * 4, 0, 0, 7); ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  // ---------- Market: market day in town ----------
  // Corrugated sheet metal: alternating lit and shaded ribs.
  function corrugated(g, x0, y0, x1, y1, color, step = 4) {
    for (let x = x0, k = 0; x < x1; x += step, k++) {
      const cg = g.createLinearGradient(x, 0, x + step, 0);
      cg.addColorStop(0, tone(color, -.18)); cg.addColorStop(.5, tone(color, .16)); cg.addColorStop(1, tone(color, -.08));
      g.fillStyle = cg; g.fillRect(x, y0, Math.min(step, x1 - x), y1 - y0);
    }
    const sh = g.createLinearGradient(0, y0, 0, y1); sh.addColorStop(0, 'rgba(255,250,235,.12)'); sh.addColorStop(1, 'rgba(30,24,18,.28)');
    g.fillStyle = sh; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.strokeStyle = 'rgba(120,60,30,.18)'; g.lineWidth = 1; g.beginPath();
    for (let k = 0; k < 6; k++) { const x = x0 + pr(k + x0) * (x1 - x0), y = y0 + pr(k + y0) * (y1 - y0) * .5; g.moveTo(x, y); g.lineTo(x + 1, y + 20 + pr(k) * 30); }
    g.stroke();
  }
  // Common red brick in running bond, with mortar joints and a few darker headers.
  function brickWall(g, x0, y0, x1, y1, color = '#a5533c') {
    g.fillStyle = '#c9b9a0'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    for (let y = y0, r = 0; y < y1; y += 4, r++) {
      for (let x = x0 - (r % 2) * 4, k = 0; x < x1; x += 8, k++) {
        const v = pr(r * 31 + k * 7.3 + x0) - .5;
        g.fillStyle = tone(color, v * .3); g.fillRect(Math.max(x0, x + .5), y + .5, Math.min(7, x1 - x - .5), 3);
      }
    }
    const sh = g.createLinearGradient(0, y0, 0, y1); sh.addColorStop(0, 'rgba(255,240,220,.08)'); sh.addColorStop(1, 'rgba(30,20,12,.22)');
    g.fillStyle = sh; g.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  // A roof plane between pts filled with shingles (or standing-seam metal), with snow on top in winter.
  function roofPlane(g, pts, color, snow, metal = false) {
    const ys = pts.map(p => p[1]), xs = pts.map(p => p[0]), y0 = Math.min(...ys), y1 = Math.max(...ys);
    shape(g, pts);
    if (snow) { snowFill(g, y0, y1); return; }
    if (metal) {
      g.save(); g.clip();
      const mg = g.createLinearGradient(0, y0, 0, y1); mg.addColorStop(0, tone(color, .2)); mg.addColorStop(1, tone(color, -.2));
      g.fillStyle = mg; g.fillRect(Math.min(...xs), y0, Math.max(...xs) - Math.min(...xs), y1 - y0);
      g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = .8; g.beginPath();
      for (let x = Math.min(...xs); x < Math.max(...xs); x += 6) { g.moveTo(x, y0); g.lineTo(x, y1); }
      g.stroke(); g.restore();
    } else shingles(g, color, y0 - 1, y1 + 1, Math.round(xs[0]), 'nonzero', Math.min(...xs) - 4, Math.max(...xs) + 4);
    g.strokeStyle = tone(color, -.45); g.lineWidth = 1.2; g.beginPath(); g.moveTo(...pts[0]); for (const p of pts.slice(1)) g.lineTo(...p); g.stroke();
  }
  // A shop window from the street: dark interior with goods on the shelves, a reflection of the sky, and the sash.
  function shopWindow(g, x, y, w, h, goods) {
    const ig = g.createLinearGradient(0, y, 0, y + h); ig.addColorStop(0, '#2a2420'); ig.addColorStop(1, '#4a3e32');
    g.fillStyle = ig; g.fillRect(x, y, w, h);
    g.fillStyle = '#5a4430'; for (const sy of [y + h * .38, y + h * .72]) g.fillRect(x, sy, w, 2);
    const cols = ['#c9a24a', '#b03a2e', '#2f5d8a', '#e8dcc0', '#5f7f4a', '#8a6a45'];
    for (let r = 0; r < 2; r++) for (let k = 0; k < Math.floor(w / 6); k++) {
      const gx = x + 2 + k * 6, sy = r ? y + h * .72 : y + h * .38, gh = 4 + pr(goods + r * 17 + k) * 6;
      g.fillStyle = cols[Math.floor(pr(goods + k * 3 + r) * cols.length)]; g.fillRect(gx, sy - gh, 4.4, gh);
    }
    // a bolt of cloth and a few cans on the sill
    g.fillStyle = cols[goods % cols.length]; g.fillRect(x + 4, y + h - 10, 10, 8);
    g.fillStyle = '#a9b0b5'; for (let k = 0; k < 3; k++) g.fillRect(x + w - 16 + k * 5, y + h - 8, 4, 6);
    const rg = g.createLinearGradient(x, y, x + w, y + h); rg.addColorStop(0, 'rgba(200,220,235,.42)'); rg.addColorStop(.45, 'rgba(200,220,235,.08)'); rg.addColorStop(1, 'rgba(200,220,235,.18)');
    g.fillStyle = rg; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,.2)'; shape(g, [[x + w * .1, y + h], [x + w * .45, y], [x + w * .6, y], [x + w * .25, y + h]]); g.fill();
    g.strokeStyle = '#3e2a1a'; g.lineWidth = 2.4; g.strokeRect(x, y, w, h);
    g.fillStyle = 'rgba(255,240,210,.15)'; g.fillRect(x - 1, y - 1, w + 2, 1);
  }
  function lampPost(g, lx, base, electric) {
    const pg = g.createLinearGradient(lx - 3, 0, lx + 3, 0); pg.addColorStop(0, '#1a1a1a'); pg.addColorStop(.6, '#4a4a4a'); pg.addColorStop(1, '#202020');
    g.fillStyle = pg; g.fillRect(lx - 2, base - 66, 4, 80);
    g.fillRect(lx - 4, base + 8, 8, 6); g.fillRect(lx - 3, base - 30, 6, 3);
    if (!electric) {
      // a kerosene lantern in its glass case under a peaked cap
      g.fillStyle = '#1e1e1e'; shape(g, [[lx - 8, base - 80], [lx, base - 88], [lx + 8, base - 80]]); g.fill();
      g.fillRect(lx - 6, base - 66, 12, 2);
      const fl = g.createRadialGradient(lx, base - 72, 1, lx, base - 72, 7); fl.addColorStop(0, '#fff3c8'); fl.addColorStop(1, 'rgba(255,200,110,.55)');
      g.fillStyle = fl; g.fillRect(lx - 5, base - 79, 10, 13);
      g.strokeStyle = '#1e1e1e'; g.lineWidth = 1; g.strokeRect(lx - 5, base - 79, 10, 13);
    } else {
      g.strokeStyle = '#2a2a2a'; g.lineWidth = 2; g.beginPath(); g.moveTo(lx, base - 66); g.quadraticCurveTo(lx, base - 74, lx + 8, base - 74); g.stroke();
      const gl = g.createRadialGradient(lx + 6, base - 70, 1, lx + 8, base - 66, 8); gl.addColorStop(0, '#ffffff'); gl.addColorStop(.7, '#f4ecd2'); gl.addColorStop(1, '#cfc4a4');
      g.fillStyle = gl; g.beginPath(); g.arc(lx + 8, base - 66, 7, 0, 7); g.fill();
      g.fillStyle = '#2a2a2a'; g.fillRect(lx + 4, base - 75, 8, 3);
    }
  }
  // The static town, painted once per look: elevator and siding, creamery, store, implement dealer, cheese factory,
  // sidewalk, and street. Prices, smoke, the dealer's tractor, people, and traffic are drawn over it each frame.
  function marketPlate(s, y, season, brand, ground) {
    const snow = season === 'winter', red = y < 1935, brick = y >= 1920, awning = y >= 1915;
    const pump = y < 1920 ? 0 : y < 1940 ? 1 : 2, street = y < 1920 ? 'dirt' : y < 1945 ? 'gravel' : 'paved';
    const store = y < 1930 ? 'MERCANTILE' : s.locId === 'strum' ? "ROBBE'S GENERAL STORE" : 'GENERAL STORE';
    const key = `market|${season}|${red}|${brick}|${awning}|${pump}|${street}|${y < 1915}|${y >= 1903}|${store}|${y < 1928}|${brand}|${ground}`;
    return cached(key, W, H, g => {
      const base = 410;
      meadow(g, 0, 300, W, 130, ground);
      // ---- the grain elevator, its cupola, the annex with the price board, and a ladder up the side
      const ec = red ? '#8a3b2b' : '#a3a9ad';
      g.fillStyle = 'rgba(30,24,18,.25)'; g.fillRect(36, 196, 4, base - 196);
      if (red) { boards(g, 40, 190, 120, base, ec, 6, 3); boards(g, 58, 150, 102, 192, ec, 6, 9); boards(g, 120, 300, 200, base, ec, 6, 13); }
      else { corrugated(g, 40, 190, 120, base, ec); corrugated(g, 58, 150, 102, 192, ec); corrugated(g, 120, 300, 200, base, ec); }
      g.fillStyle = 'rgba(30,20,12,.3)'; g.fillRect(40, 190, 80, 8); g.fillRect(58, 150, 44, 6); g.fillRect(120, 300, 80, 6);
      roofPlane(g, [[34, 192], [80, 178], [126, 192]], red ? '#4a3a36' : '#7d8387', snow, !red);
      roofPlane(g, [[52, 152], [80, 134], [108, 152]], red ? '#4a3a36' : '#7d8387', snow, !red);
      roofPlane(g, [[116, 302], [116, 294], [204, 294], [204, 302]], red ? '#4a3a36' : '#7d8387', snow, !red);
      for (const [wx, wy] of [[72, 162], [74, 206]]) pane(g, wx, wy, 14, 16);
      g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(56, 360, 20, 50); g.strokeStyle = '#3a2a1a'; g.lineWidth = 2; g.strokeRect(56, 360, 20, 50);
      bigText(g, red ? 'FARMERS' : 'CO-OP', 80, 236, 12, '#f3ead6'); bigText(g, 'ELEVATOR', 80, 252, 12, '#f3ead6');
      g.fillStyle = 'rgba(30,20,12,.35)'; g.fillRect(40, 255, 80, 1);
      g.strokeStyle = '#3a3a3a'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(110, 196); g.lineTo(110, base); g.moveTo(115, 196); g.lineTo(115, base);
      for (let ly = 200; ly < base; ly += 6) { g.moveTo(110, ly); g.lineTo(115, ly); } g.stroke();
      // the loading spout swung out toward the boxcar
      g.strokeStyle = '#5f676c'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(100, 176); g.quadraticCurveTo(170, 230, 236, 344); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 1; g.beginPath(); g.moveTo(100, 175); g.quadraticCurveTo(170, 229, 236, 343); g.stroke(); g.lineCap = 'butt';
      // the price board, framed in oak
      const cb = g.createLinearGradient(126, 316, 194, 388); cb.addColorStop(0, '#34443a'); cb.addColorStop(1, '#253229');
      g.fillStyle = cb; g.fillRect(126, 316, 68, 72);
      g.fillStyle = 'rgba(255,255,255,.06)'; for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse(140 + pr(k + 60) * 40, 330 + pr(k + 61) * 50, 14, 5, .3, 0, 7); g.fill(); }
      g.strokeStyle = '#7a5634'; g.lineWidth = 4; g.strokeRect(124, 314, 72, 76);
      g.fillStyle = '#9a7650'; g.fillRect(122, 390, 76, 3);
      // ---- the siding: ballast, ties, and rail; then a boxcar of the Milwaukee Road
      g.fillStyle = snow ? '#d9dde0' : '#8a8072'; g.fillRect(0, base - 6, 320, 10);
      for (let x = 0; x < 320; x += 9) { g.fillStyle = '#4a3b2e'; g.fillRect(x, base - 4, 5, 6); g.fillStyle = 'rgba(255,240,210,.15)'; g.fillRect(x, base - 4, 5, 1); }
      const rl = g.createLinearGradient(0, base - 5, 0, base - 2); rl.addColorStop(0, '#d7dcdf'); rl.addColorStop(1, '#5f676c');
      g.fillStyle = rl; g.fillRect(0, base - 5, 320, 3);
      boards(g, 210, 352, 310, 398, '#7a3a24', 5, 31);
      g.fillStyle = '#5e2c1b'; for (let x = 212; x < 310; x += 14) g.fillRect(x, 352, 2, 46);
      g.fillStyle = '#4a2214'; g.fillRect(208, 348, 104, 5); g.fillStyle = 'rgba(255,230,200,.18)'; g.fillRect(208, 348, 104, 1.5);
      boards(g, 248, 358, 272, 396, '#6a2e1c', 6, 41); g.strokeStyle = '#2a1a10'; g.lineWidth = 1.2; g.strokeRect(248, 358, 24, 38);
      g.fillStyle = '#2a2a2a'; g.fillRect(244, 356, 32, 2); g.fillRect(244, 396, 32, 2);
      g.font = 'bold 6px Georgia'; g.textAlign = 'center'; g.fillStyle = '#f0e6d2';
      g.fillText(y < 1928 ? 'C.M.& ST.P.' : 'MILWAUKEE', 229, 368); g.fillText(y < 1928 ? 'RY.' : 'ROAD', 229, 376); g.fillText('40000', 291, 372);
      g.fillStyle = '#1e1e1e'; g.fillRect(214, 398, 30, 4); g.fillRect(276, 398, 30, 4);
      for (const wx of [222, 236, 284, 298]) {
        const wg = g.createRadialGradient(wx - 1, 401, .5, wx, 402, 5.2); wg.addColorStop(0, '#5a5a5a'); wg.addColorStop(1, '#141414');
        g.fillStyle = wg; g.beginPath(); g.arc(wx, 402, 5.2, 0, 7); g.fill();
      }
      // ---- the co-op creamery: clapboard, shingled gable, a brick boiler stack, and a dock of cans
      clapboard(g, 330, 320, 450, base, '#efe6cf', 3);
      roofPlane(g, [[324, 322], [390, 296], [456, 322]], '#8a3b2b', snow);
      brickWall(g, 430, 240, 442, 310, '#7a3a24'); g.fillStyle = '#4a2214'; g.fillRect(428, 238, 16, 4);
      for (const wx of [342, 414]) pane(g, wx, 350, 22, 24);
      boards(g, 392, 362, 410, base, '#7a5634', 6, 5); g.fillStyle = '#c9a24a'; g.fillRect(406, 386, 2, 2);
      g.fillStyle = 'rgba(40,30,20,.75)'; g.fillRect(340, 330, 100, 14);
      bigText(g, y >= 1903 ? 'CO-OP CREAMERY' : 'CREAMERY', 390, 341, 9, '#f3ead6');
      boards(g, 326, 390, 388, 398, '#6b4a2a', 62, 7); g.fillStyle = '#4a3220'; for (const px of [330, 382]) g.fillRect(px, 398, 4, 12);
      for (let k = 0; k < 4; k++) milkCan(g, 338 + k * 14, 391, .75);
      // ---- the general store: a false front with a bracketed cornice and sign, upper sashes, and the storefront
      if (brick) brickWall(g, 470, 262, 650, base, '#a5533c'); else clapboard(g, 470, 262, 650, base, '#d8c49a', 3);
      boards(g, 464, 254, 656, 266, brick ? '#5e3a2a' : '#8f7a5e', 192, 11);
      g.fillStyle = 'rgba(30,20,12,.35)'; g.fillRect(466, 266, 188, 3);
      for (let x = 470; x <= 650; x += 18) { g.fillStyle = brick ? '#4e2e20' : '#7a6448'; shape(g, [[x - 2, 266], [x + 3, 266], [x + 3, 274], [x - 2, 270]]); g.fill(); }
      g.fillStyle = brick ? '#3a2418' : '#f1e6c8'; g.fillRect(492, 274, 136, 18);
      g.strokeStyle = brick ? '#c9a24a' : '#5a3a20'; g.lineWidth = 1; g.strokeRect(494, 276, 132, 14);
      // the store's name, set as large as the sign board allows
      g.font = 'bold 13px Georgia'; const fs = Math.min(13, 13 * 124 / g.measureText(store).width);
      bigText(g, store, 560, 288 - (13 - fs) * .35, fs, brick ? '#e6cf8a' : '#5a3a20');
      for (const wx of [490, 545, 600]) {
        g.fillStyle = brick ? '#e2d8c4' : '#f2ede2'; g.fillRect(wx - 3, 293, 38, 3); g.fillRect(wx - 3, 326, 38, 3);
        pane(g, wx, 296, 32, 30);
      }
      boards(g, 472, 330, 648, 338, brick ? '#5e3a2a' : '#8f7a5e', 176, 19);
      shopWindow(g, 480, 352, 52, 44, 2); shopWindow(g, 588, 352, 52, 44, 5);
      boards(g, 478, 396, 534, 410, '#6b4a2a', 14, 23); boards(g, 586, 396, 642, 410, '#6b4a2a', 14, 29);
      // the door: panelled wood with a glazed upper half and a transom
      g.fillStyle = '#3e2a1a'; g.fillRect(541, 346, 38, 64);
      boards(g, 544, 350, 576, 410, '#6b4a2a', 16, 37);
      g.fillStyle = '#2a2420'; g.fillRect(548, 356, 24, 22); g.fillStyle = 'rgba(200,220,235,.3)'; g.fillRect(548, 356, 24, 22);
      g.fillStyle = '#c9a24a'; g.beginPath(); g.arc(572, 384, 1.5, 0, 7); g.fill();
      g.fillStyle = 'rgba(200,220,235,.35)'; g.fillRect(546, 342, 28, 6);
      if (awning) {
        // a striped canvas awning on its iron frame, scalloped along the valance
        const aw = (x0, x1) => {
          for (let x = x0, k = 0; x < x1; x += 10, k++) {
            g.fillStyle = k % 2 ? '#f3efe6' : '#a3322a'; shape(g, [[x, 336], [x + 10, 336], [x + 12, 348], [x + 2, 348]]); g.fill();
            g.beginPath(); g.arc(x + 7, 348, 5, 0, Math.PI); g.fill();
          }
          const ag = g.createLinearGradient(0, 336, 0, 353); ag.addColorStop(0, 'rgba(255,255,255,.18)'); ag.addColorStop(1, 'rgba(40,20,10,.28)');
          g.fillStyle = ag; g.fillRect(x0, 336, x1 - x0 + 12, 17);
          g.fillStyle = 'rgba(30,20,12,.25)'; g.fillRect(x0 + 2, 353, x1 - x0 + 8, 4);
        };
        aw(476, 536); aw(584, 644);
      }
      // a cracker barrel and sacks of feed on the walk
      contactShadow(g, 498, 410, 10, 2);
      const bg = g.createLinearGradient(490, 0, 506, 0); bg.addColorStop(0, '#5a3a20'); bg.addColorStop(.6, '#8a6040'); bg.addColorStop(1, '#5a3a20');
      g.fillStyle = bg; g.beginPath(); g.ellipse(498, 400, 8, 10, 0, 0, 7); g.fill();
      g.strokeStyle = '#3a3a3a'; g.lineWidth = 1; g.beginPath(); for (const by of [393, 407]) { g.moveTo(490.5, by); g.quadraticCurveTo(498, by + 1.5, 505.5, by); } g.stroke();
      for (let k = 0; k < 3; k++) {
        const sx = 616 + k * 11, sg = g.createRadialGradient(sx - 2, 398, 1, sx, 402, 9); sg.addColorStop(0, '#efe2bd'); sg.addColorStop(1, '#a8946a');
        g.fillStyle = sg; g.beginPath(); g.ellipse(sx, 402, 6, 8, 0, 0, 7); g.fill();
        g.fillStyle = '#7a5a2a'; g.fillRect(sx - 3, 394, 6, 1.2);
      }
      // the gas pump: a tall visible-measure pump with its glass cylinder, then a rounded computing pump
      if (pump === 1) {
        contactShadow(g, 664, 410, 9, 2);
        const pg2 = g.createLinearGradient(658, 0, 670, 0); pg2.addColorStop(0, '#7a1c1c'); pg2.addColorStop(.6, '#d0402e'); pg2.addColorStop(1, '#8a2020');
        g.fillStyle = pg2; g.fillRect(659, 362, 10, 48); g.fillRect(656, 404, 16, 6);
        g.fillStyle = 'rgba(230,180,80,.85)'; g.fillRect(656, 342, 16, 20); g.strokeStyle = '#7a1c1c'; g.lineWidth = 1.4; g.strokeRect(656, 342, 16, 20);
        g.fillStyle = 'rgba(255,255,255,.4)'; g.fillRect(658, 344, 3, 16);
        g.fillStyle = '#7a1c1c'; g.fillRect(655, 338, 18, 4); g.fillStyle = '#f3efe6'; g.beginPath(); g.arc(664, 333, 5, 0, 7); g.fill();
        g.strokeStyle = '#1e1e1e'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(669, 372); g.quadraticCurveTo(678, 384, 672, 396); g.stroke();
      } else if (pump === 2) {
        contactShadow(g, 662, 410, 11, 2);
        const pg2 = g.createLinearGradient(652, 0, 672, 0); pg2.addColorStop(0, '#7a1c1c'); pg2.addColorStop(.6, '#d0402e'); pg2.addColorStop(1, '#8a2020');
        g.fillStyle = pg2; g.beginPath(); g.moveTo(653, 410); g.lineTo(653, 380); g.quadraticCurveTo(653, 372, 662, 372); g.quadraticCurveTo(671, 372, 671, 380); g.lineTo(671, 410); g.closePath(); g.fill();
        g.fillStyle = '#f3efe6'; g.fillRect(656, 380, 12, 9); g.fillStyle = '#2a2a2a'; g.fillRect(658, 382, 8, 2); g.fillRect(658, 385.5, 8, 2);
        const gl = g.createRadialGradient(660, 363, 1, 662, 366, 8); gl.addColorStop(0, '#ffffff'); gl.addColorStop(1, '#e8e0cc');
        g.fillStyle = gl; g.beginPath(); g.arc(662, 365, 7, 0, 7); g.fill();
        g.fillStyle = '#b03a2e'; g.fillRect(656, 364, 12, 2);
      }
      // ---- the implement dealer: a metal-clad shed with a big sliding door
      corrugated(g, 690, 300, 840, base, '#c9c2b0', 5);
      g.fillStyle = '#4e5359'; g.fillRect(686, 294, 158, 8); g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(686, 294, 158, 1.5);
      if (snow) { g.fillStyle = '#f7f9fb'; g.fillRect(686, 290, 158, 5); }
      const dg = g.createLinearGradient(0, 340, 0, base); dg.addColorStop(0, '#1e1c1a'); dg.addColorStop(1, '#3a3530');
      g.fillStyle = dg; g.fillRect(730, 340, 70, 70);
      g.fillStyle = '#2a2a2a'; g.fillRect(722, 336, 86, 3);
      corrugated(g, 800, 340, 834, base, '#a49c8a', 4);
      g.strokeStyle = '#5a5a5a'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(800, 340); g.lineTo(834, 410); g.moveTo(834, 340); g.lineTo(800, 410); g.stroke();
      g.fillStyle = '#f1e6c8'; g.fillRect(704, 306, 122, 30); g.strokeStyle = '#3a2a1a'; g.lineWidth = 1.2; g.strokeRect(706, 308, 118, 26);
      bigText(g, brand ? brand.toUpperCase() : 'IMPLEMENTS', 765, 320, 10, '#7a1c1c');
      bigText(g, 'IMPLEMENTS', 765, 332, 9, '#3a2a1a');
      // ---- the cheese factory, white clapboard under a blue roof, with its whey tank
      clapboard(g, 860, 330, 950, base, '#f3efe6', 3);
      roofPlane(g, [[854, 332], [905, 310], [956, 332]], '#2f5d8a', snow);
      pane(g, 872, 372, 16, 18); pane(g, 924, 372, 16, 18);
      bigText(g, 'CHEESE', 905, 350, 10, '#2f5d8a'); bigText(g, 'FACTORY', 905, 362, 10, '#2f5d8a');
      boards(g, 896, 380, 914, base, '#2f5d8a', 6, 51);
      const tg = g.createLinearGradient(844, 0, 862, 0); tg.addColorStop(0, '#6c7479'); tg.addColorStop(.55, '#d8dde0'); tg.addColorStop(1, '#6c7479');
      g.fillStyle = tg; g.fillRect(844, 356, 16, 54); g.beginPath(); g.ellipse(852, 356, 8, 3, 0, 0, 7); g.fill();
      g.fillStyle = 'rgba(60,64,68,.5)'; for (const by of [370, 386, 400]) g.fillRect(844, by, 16, 1.4);
      // ---- the sidewalk: plank boardwalk early, then concrete squares with a curb
      if (y < 1915) {
        boards(g, 320, base, W, base + 14, '#8a6a45', 8, 61);
        g.fillStyle = 'rgba(30,20,12,.4)'; g.fillRect(320, base + 12, W - 320, 2);
      } else {
        const cg = g.createLinearGradient(0, base, 0, base + 14); cg.addColorStop(0, '#d6d0c2'); cg.addColorStop(1, '#b8b2a4');
        g.fillStyle = cg; g.fillRect(320, base, W - 320, 12);
        g.strokeStyle = 'rgba(80,72,60,.35)'; g.lineWidth = .8; g.beginPath(); for (let x = 320; x < W; x += 30) { g.moveTo(x, base); g.lineTo(x - 2, base + 12); } g.stroke();
        g.fillStyle = '#8f897c'; g.fillRect(320, base + 11, W - 320, 3);
      }
      if (snow) { g.fillStyle = 'rgba(250,252,255,.8)'; g.fillRect(320, base, W - 320, 4); }
      // ---- the street: dirt with ruts, gravel and oil, or blacktop with a center stripe
      const sy = base + 14;
      if (snow) {
        g.beginPath(); g.rect(0, sy, W, H - sy); groundFill(g, '#e8ecef', sy, H);
        g.strokeStyle = 'rgba(120,110,100,.35)'; g.lineWidth = 3; g.beginPath(); for (const ry of [470, 506]) { g.moveTo(0, ry); g.lineTo(W, ry); } g.stroke();
      } else {
        const sc = street === 'dirt' ? '#a88d66' : street === 'gravel' ? '#a49b88' : '#5f5d58';
        const sg = g.createLinearGradient(0, sy, 0, H); sg.addColorStop(0, tone(sc, .08)); sg.addColorStop(1, tone(sc, -.12));
        g.fillStyle = sg; g.fillRect(0, sy, W, H - sy);
        g.save(); g.globalAlpha = street === 'paved' ? .4 : .9; g.translate(0, sy); g.fillStyle = patternFor(g, 'mottle', mottle); g.fillRect(0, 0, W, H - sy); g.restore();
        if (street !== 'paved') {
          for (const ry of [458, 472, 510, 524]) {
            const rg = g.createLinearGradient(0, ry - 3, 0, ry + 3); rg.addColorStop(0, 'rgba(60,46,30,0)'); rg.addColorStop(.5, 'rgba(60,46,30,.28)'); rg.addColorStop(1, 'rgba(255,240,210,.12)');
            g.fillStyle = rg; g.fillRect(0, ry - 3, W, 6);
          }
          for (let k = 0; k < 260; k++) { const v = pr(k + 811); g.fillStyle = v > .5 ? 'rgba(235,225,199,.5)' : 'rgba(70,56,40,.35)'; g.fillRect(pr(k + 810) * W, 428 + v * 112, 1.6 + pr(k) * 1.4, 1.2); }
          if (street === 'dirt') { g.fillStyle = 'rgba(110,80,40,.35)'; for (let k = 0; k < 14; k++) { g.beginPath(); g.ellipse(pr(k + 70) * W, 440 + pr(k + 71) * 90, 4, 1.6, 0, 0, 7); g.fill(); } }
        } else {
          g.fillStyle = '#e8d36a'; for (let x = 0; x < W; x += 50) g.fillRect(x, 488, 26, 3);
          g.strokeStyle = 'rgba(20,20,20,.35)'; g.lineWidth = .8; g.beginPath();
          for (let k = 0; k < 8; k++) { const x = pr(k + 90) * W, yy = 440 + pr(k + 91) * 90; g.moveTo(x, yy); g.lineTo(x + 8, yy + 4); g.lineTo(x + 14, yy + 2); }
          g.stroke();
        }
      }
      g.fillStyle = 'rgba(30,20,12,.2)'; g.fillRect(0, sy, W, 3);
      for (const lx of [326, 676, 852]) lampPost(g, lx, base, y >= 1915);
    });
  }
  // A tractor seen from the front, for the implement dealer's doorway (ground at y, about 64 wide and 62 tall):
  // the big rear wheels at the sides, the radiator and grille, the hood, the steering wheel and seat, the exhaust
  // stack, and the small front wheels close together (or splayed on a standard-tread tractor).
  function tractorFront(ctx, cx, y, m, year, sc = 1) {
    const L = lookOf(m, year), body = L.body, wheel = L.wheel || body, steel = L.steel, rowcrop = L.st === 'rowcrop' || L.st === 'tricycle';
    lit(ctx, cx - 36 * sc, y - 66 * sc, cx + 36 * sc, y + 2 * sc, c => {
      c.save(); c.translate(cx, y); c.scale(sc, sc);
      c.fillStyle = 'rgba(20,14,8,.45)'; c.beginPath(); c.ellipse(0, 0, 34, 3.4, 0, 0, 7); c.fill();
      // the rear wheels, seen edge-on: tread facing us, the rim and hub inside
      for (const sd of [-1, 1]) {
        const wx = sd * 24;
        const tg = c.createLinearGradient(wx - 7, 0, wx + 7, 0);
        tg.addColorStop(0, steel ? '#3a3632' : '#141414'); tg.addColorStop(.5, steel ? '#6a625a' : '#2e2e2e'); tg.addColorStop(1, steel ? '#2e2a26' : '#101010');
        c.fillStyle = tg; c.beginPath(); c.ellipse(wx, -19, 7.5, 19, 0, 0, 7); c.fill();
        c.strokeStyle = steel ? 'rgba(160,150,140,.6)' : 'rgba(70,70,70,.9)'; c.lineWidth = 1.2; c.beginPath();
        for (let k = -16; k <= 14; k += 4) { c.moveTo(wx - 6.5, -19 + k + (steel ? 0 : sd * 1.2)); c.lineTo(wx + 6.5, -19 + k - (steel ? 0 : sd * 1.2)); }
        c.stroke();
        c.fillStyle = wheel; c.beginPath(); c.ellipse(wx - sd * 6.4, -19, 2.4, 12, 0, 0, 7); c.fill();
        c.fillStyle = tone(wheel, -.3); c.beginPath(); c.ellipse(wx - sd * 7.2, -19, 1.2, 4, 0, 0, 7); c.fill();
      }
      // fenders over the rear wheels on the later tractors
      if (L.styled) for (const sd of [-1, 1]) { c.fillStyle = tone(body, -.1); c.beginPath(); c.ellipse(sd * 24, -38, 9, 4, 0, Math.PI, 0); c.fill(); }
      // the rear axle housing and the seat and steering wheel above the hood
      c.fillStyle = tone(body, -.35); c.fillRect(-18, -24, 36, 6);
      c.fillStyle = '#2a2a2a'; c.beginPath(); c.ellipse(0, -52, 8, 2.4, 0, 0, 7); c.fill(); c.fillRect(-.8, -52, 1.6, 8);
      c.fillStyle = '#3a3a3a'; c.fillRect(-7, -48, 14, 3);
      // the hood and radiator, narrowing toward us
      const hood = L.sheet || body, hg = c.createLinearGradient(-11, 0, 11, 0); hg.addColorStop(0, tone(hood, -.3)); hg.addColorStop(.6, tone(hood, .12)); hg.addColorStop(1, tone(hood, -.2));
      c.fillStyle = hg;
      if (L.styled) { c.beginPath(); c.moveTo(-11, -12); c.lineTo(-11, -38); c.quadraticCurveTo(-11, -46, 0, -46); c.quadraticCurveTo(11, -46, 11, -38); c.lineTo(11, -12); c.closePath(); c.fill(); }
      else c.fillRect(-11, -44, 22, 32);
      // the grille: bars on a styled tractor, a honeycomb radiator core on the early ones
      c.fillStyle = '#1a1a1a'; c.fillRect(-7.5, -40, 15, 24);
      c.strokeStyle = L.styled ? tone(L.trim, -.1) : '#6a6a6a'; c.lineWidth = L.styled ? 1.4 : .6; c.beginPath();
      if (L.styled) for (let k = -38; k < -16; k += 3) { c.moveTo(-7, k); c.lineTo(7, k); }
      else for (let k = -6; k <= 6; k += 2) { c.moveTo(k, -40); c.lineTo(k, -16); }
      c.stroke();
      c.fillStyle = L.trim; c.font = 'bold 3.6px Georgia'; c.textAlign = 'center'; c.fillText(L.label.split(' ')[0].slice(0, 10), 0, -42);
      c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(4, -44, 3, 32);
      // the exhaust stack and air intake
      c.fillStyle = '#2a2a2a'; c.fillRect(4, -60, 2.6, 16); c.fillRect(-6.4, -56, 2.6, 12);
      // front wheels: close together under a row-crop nose, out at the corners on a standard tractor
      const fx = rowcrop ? 3.6 : 13, fr = 9;
      c.fillStyle = tone(body, -.35); c.fillRect(-fx, -11, fx * 2, 3);
      for (const sd of [-1, 1]) {
        const tg = c.createLinearGradient(sd * fx - 3, 0, sd * fx + 3, 0); tg.addColorStop(0, steel ? '#3a3632' : '#151515'); tg.addColorStop(.5, steel ? '#6a625a' : '#333'); tg.addColorStop(1, steel ? '#2e2a26' : '#111');
        c.fillStyle = tg; c.beginPath(); c.ellipse(sd * fx, -fr, 3.4, fr, 0, 0, 7); c.fill();
        c.fillStyle = wheel; c.beginPath(); c.ellipse(sd * fx, -fr, 1.4, fr * .55, 0, 0, 7); c.fill();
      }
      // headlamps on the later tractors
      if (L.styled || year >= 1938) for (const sd of [-1, 1]) {
        const lg = c.createRadialGradient(sd * 13, -40, .3, sd * 13, -40, 3); lg.addColorStop(0, '#fffbe6'); lg.addColorStop(1, '#a8a296');
        c.fillStyle = lg; c.beginPath(); c.arc(sd * 13, -40, 2.6, 0, 7); c.fill();
      }
      c.restore();
    }, [cx, y, 32 * sc, 3 * sc]);
  }
  function marketTown(ctx, s, t, season) {
    const { p, loc } = backdrop(ctx, s, t, season), y = s.year, snow = season === 'winter';
    const base = 410;
    const show = DATA.machines.filter(m => m.type === 'power' && m.kind !== 'steam' && m.from <= y && y <= m.to).sort((a, b) => b.from - a.from || b.hp - a.hp)[0];
    const brand = show ? show.brand.replace('International Harvester', 'McCormick-Deering') : '';
    ctx.drawImage(marketPlate(s, y, season, brand, snow ? '#e6ebef' : p.near), 0, 0);
    // the day's prices chalked on the board
    ctx.font = 'bold 9px Georgia'; ctx.fillStyle = '#f2f2e8'; ctx.textAlign = 'center';
    ctx.font = `bold ${Math.min(9, 9 * 60 / ctx.measureText("TODAY'S PRICES").width).toFixed(2)}px Georgia`; ctx.fillText("TODAY'S PRICES", 160, 328);
    ctx.fillStyle = 'rgba(242,242,232,.5)'; ctx.fillRect(132, 331, 56, .8);
    const ph = season === 'fall' || season === 'winter' ? 'fall' : 'spring';
    ctx.font = '9px Georgia'; ctx.fillStyle = '#ecece0';
    [['Wheat', 'wheat'], ['Oats', 'oats'], ['Corn', 'corn'], ['Hay', 'hay']].forEach(([n, gd], k) => {
      ctx.textAlign = 'left'; ctx.fillText(n, 131, 343 + k * 12); ctx.textAlign = 'right'; ctx.fillText(`$${Sim.sellPrice(s, gd, ph).toFixed(2)}`, 190, 343 + k * 12);
    });
    smoke(ctx, 436, 240, t, 'rgba(110,110,110,', 1);
    // the dealer's newest tractor, seen head-on just inside the open door
    if (show) tractorFront(ctx, 765, base, show, y);
    // People on the walk are drawn first, so the player's load parked at the curb stands in front of them.
    const walkers = [
      [18, 30, 'man', '#3d6484', '#d9e1e6', 1],
      [15, 320, 'woman', '#8a435e', '#e4cfb0', -1],
      [15, 348, 'child', '#b86b3f', '#40647a', -1],
      [17, 640, 'woman', '#367468', '#9d78a6', 1],
      [13, 880, 'man', '#667744', '#e6d9ba', -1],
    ];
    for (const [speed, offset, kind, color, hat, dir] of walkers) {
      const progress = cycleAt(t * speed + offset, W + 100);
      pedestrian(ctx, dir > 0 ? progress - 50 : W + 50 - progress, 426, 1.5, t + offset, kind, color, hat, dir);
    }
    // Keep the player's load parked by the elevator; through traffic uses two separate lanes.
    const st = s.store, bu = (st.wheat || 0) + (st.oats || 0) + (st.corn || 0);
    const lbCheese = Object.values(s.cheese).reduce((a, c) => a + c.fresh + c.aged, 0);
    ctx.save(); ctx.translate(220, 447); ctx.scale(1.05, 1.05);
    farmRig(ctx, 0, 0, y, t, season, { sacks: Math.ceil(bu / 120), cans: s.cows ? 2 : 0, cheese: Math.ceil(lbCheese / 400), lumber: Math.ceil((st.lumber || 0) / 3) });
    ctx.restore();
    marketTraffic(ctx, s, t, season, false);
    marketTraffic(ctx, s, t, season, true);
    particles(ctx, season, t, s);
    topSign(ctx, `Market day in ${loc.town}, ${y}  ·  pop. ${Sim.townPop(s).toLocaleString()}`);
  }

  // ---------- Woodlot: in the woods ----------
  // A standing tree trunk from y0 to y1: rounded by the light, with furrowed bark and lichen.
  function barkColumn(ctx, x, w, y0, y1, color, seed) {
    const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    g.addColorStop(0, tone(color, -.45)); g.addColorStop(.35, tone(color, -.12)); g.addColorStop(.75, tone(color, .16)); g.addColorStop(1, tone(color, -.1));
    ctx.fillStyle = g; ctx.fillRect(x - w / 2, y0, w, y1 - y0);
    ctx.strokeStyle = 'rgba(16,10,6,.35)'; ctx.lineWidth = Math.max(.6, w * .06); ctx.beginPath();
    for (let k = 0; k < 4; k++) { const bx = x - w / 2 + w * (.18 + k * .2); for (let y = y0; y < y1; y += 22) { const j = (pr(seed * 7 + k + y) - .5) * w * .1, ye = Math.min(y1, y + 22); ctx.moveTo(bx + j, y); ctx.lineTo(bx + j - 2 * j * (ye - y) / 22, ye); } }
    ctx.stroke();
    ctx.fillStyle = 'rgba(150,170,120,.22)';
    for (let k = 0; k < 6; k++) { const ly = y0 + pr(seed + k * 3) * (y1 - y0); ctx.beginPath(); ctx.ellipse(x - w * .25, ly, w * .2, 3 + pr(k) * 4, 0, 0, 7); ctx.fill(); }
    const r = ctx.createLinearGradient(0, y1 - 14, 0, y1); r.addColorStop(0, 'rgba(20,12,6,0)'); r.addColorStop(1, 'rgba(20,12,6,.35)');
    ctx.fillStyle = r; ctx.fillRect(x - w / 2, y1 - 14, w, 14);
  }

  function woodlotView(ctx, s, t, season) {
    const { p } = backdrop(ctx, s, t, season), snow = season === 'winter';
    const wf = Math.max(.15, Math.min(1, s.timber / Math.max(1, Sim.timberMax(s))));
    meadow(ctx, 0, 300, W, H - 300, snow ? '#eef2f5' : season === 'fall' ? '#8f7a46' : tone(p.near, -.08));
    for (let i = 0; i < 30; i++) tree(ctx, pr(i + 200) * W, 312 + pr(i) * 14, 9 + pr(i + 1) * 6, p.trees[i % p.trees.length], season, i);
    // skidding a log out along a trail back in the woods, behind the big trunks and everything in front of them:
    // the biggest tractor, or the team
    const sy = 368;
    ctx.fillStyle = snow ? 'rgba(170,182,196,.35)' : 'rgba(90,70,45,.22)'; ctx.fillRect(0, sy - 4, W, 8);
    ctx.fillStyle = snow ? 'rgba(255,255,255,.5)' : 'rgba(255,240,210,.12)'; ctx.fillRect(0, sy + 4, W, 1.5);
    const pw = ownedPower(s).find(x => x.m.kind !== 'steam'), sx = -120 + cycleAt(t * 24 + 450, W + 440);
    ctx.save(); ctx.translate(sx, sy); ctx.scale(1.35, 1.35);
    if (pw) {
      ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-30, -8); ctx.lineTo(-60, -6); ctx.stroke();
      machine(ctx, pw.m.id, 0, 0, 1, t * 24 / (18 * 1.35), 'drive', pw.o.built || pw.o.bought);
    } else {
      ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-14, -10); ctx.lineTo(-60, -6); ctx.stroke();
      horse(ctx, 0, -10, 1, t, 0); horse(ctx, 6, -4, 1, t, 1);
      person(ctx, -40, -20, '#6d8fb4', '#cdb06a');
    }
    ctx.fillStyle = '#6b4a2a'; ctx.fillRect(-160, -14, 100, 12);
    ctx.fillStyle = '#d9b380'; ctx.beginPath(); ctx.ellipse(-60, -8, 3, 6, 0, 0, 7); ctx.fill();
    ctx.restore();
    // big trunks: fewer as the woods are cut; sap buckets on the maples in spring
    const n = Math.round(5 + 13 * wf);
    for (let i = 0; i < n; i++) {
      const x = 20 + pr(i + 300) * 920, w = 9 + pr(i + 301) * 12, gy = 372 + pr(i + 302) * 36;
      barkColumn(ctx, x, w, 0, gy, i % 3 ? '#54402e' : '#77706a', i);
      if (snow) { ctx.fillStyle = '#fff'; ctx.fillRect(x - w / 2 - 2, gy - 4, w + 4, 5); }
      else { ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(x, gy, w, 3, 0, 0, 7); ctx.fill(); }
      if (season === 'spring' && i % 3 === 0) { ctx.fillStyle = '#9aa0a6'; ctx.fillRect(x - 5, gy - 62, 10, 12); ctx.fillStyle = '#6b6b6b'; ctx.fillRect(x - 6, gy - 64, 12, 2); }
    }
    if (snow || season === 'spring') {
      for (let i = 0; i < 26; i++) { const x = pr(i + 600) * W, y0 = 30 + pr(i + 601) * 90; bareBranches(ctx, x, y0 + 30, 26 + pr(i + 2) * 20, -Math.PI / 2 + (pr(i) - .5) * 1.4, 2.2, 3, i + 1); }
    }
    if (!snow) {
      // the leaf canopy overhead: shaded below, sunlit clusters above, sky glimpsed through the gaps
      ctx.drawImage(cached(`canopy-roof|${season}`, W, 150, g => {
        for (let i = 0; i < 46; i++) foliage(g, pr(i + 400) * W, pr(i + 401) * 80, 40 + pr(i) * 40, 22 + pr(i + 2) * 16, p.trees[i % p.trees.length], i * 3, season === 'spring' ? 6 : 9);
        if (season === 'spring') { g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, 0, W, 150); }
      }), 0, 0);
    }
    // stumps where trees came down
    for (let i = 0; i < Math.round((1 - wf) * 14); i++) {
      const x = 30 + pr(i + 500) * 880, y = 430 + pr(i + 501) * 70, r = 7 + pr(i + 502) * 5;
      ctx.fillStyle = '#5a4332'; ctx.fillRect(x - r, y - 8, r * 2, 8);
      ctx.fillStyle = snow ? '#fff' : '#d9b380'; ctx.beginPath(); ctx.ellipse(x, y - 8, r, 3, 0, 0, 7); ctx.fill();
    }
    // felling: a two-man crosscut saw, or the one-man chain saw once you own one
    const fx = 200, fg = 446;
    barkColumn(ctx, fx, 22, 0, fg, '#54402e', 99);
    ctx.fillStyle = '#d9b380'; ctx.beginPath(); ctx.moveTo(fx + 11, fg - 24); ctx.lineTo(fx + 2, fg - 18); ctx.lineTo(fx + 11, fg - 12); ctx.fill();
    const own = (id) => s.machines.some(o => o.id === id);
    if (own('chainsaw')) {
      ctx.save(); ctx.translate(fx - 34, fg - 16); ctx.scale(1.5, 1.5); person(ctx, 0, 0, '#a5493c', '#d9c07a'); ctx.restore();
      machine(ctx, 'chainsaw', fx - 14, fg - 6, 1.3, t, 'belt');
    } else {
      const off = Math.sin(t * 3) * 10;
      for (const [px, c, h] of [[fx - 40, '#a5493c', '#d9c07a'], [fx + 40, '#6d8fb4', '#cdb06a']]) { ctx.save(); ctx.translate(px, fg - 22); ctx.scale(1.5, 1.5); person(ctx, 0, 0, c, h); ctx.restore(); }
      ctx.strokeStyle = '#e8c3a0'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(fx - 35, fg - 24); ctx.lineTo(fx - 32 + off, fg - 20);
      ctx.moveTo(fx + 35, fg - 24); ctx.lineTo(fx + 32 + off, fg - 20); ctx.stroke();
      ctx.strokeStyle = '#b8bcc0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(fx - 30 + off, fg - 18); ctx.lineTo(fx + 30 + off, fg - 18); ctx.stroke();
      ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 3; for (const hx of [fx - 32 + off, fx + 32 + off]) { ctx.beginPath(); ctx.moveTo(hx, fg - 24); ctx.lineTo(hx, fg - 12); ctx.stroke(); }
    }
    ctx.fillStyle = '#cfac72';
    for (let k = 0; k < 5; k++) {
      const fall = cycleAt(t * .9 + k / 5, 1);
      ctx.fillRect(fx + 8 + Math.sin(k * 2) * fall * 18, fg - 18 + fall * 24, 2, 1);
    }
    // the log deck for the saw logs you plan to cut
    const logs = Math.min(9, Math.ceil((s.plan.logs || 0) * 2));
    if (logs) { ctx.save(); ctx.translate(640, 470); ctx.scale(1.7, 1.7); logDeck(ctx, 0, 0, logs); ctx.restore(); }
    // the sawmill or buzz saw if you own one
    const mill = ownsType(s, 'sawmill');
    if (mill) {
      ctx.fillStyle = snow ? '#e6dcc6' : '#cdae7c'; ctx.beginPath(); ctx.ellipse(300, 532, 50, 10, 0, 0, 7); ctx.fill();
      machine(ctx, mill.id, 300, 530, 1.1, t, 'idle');
    }
    if (own('buzz_saw')) machine(ctx, 'buzz_saw', 120, 528, 1.4, t, 'idle');
    if ((s.store.lumber || 0) >= .3) { ctx.save(); ctx.translate(560, 534); ctx.scale(1.6, 1.6); lumberPile(ctx, 0, 0, s.store.lumber, season); ctx.restore(); }
    // the woodshed, or the woodpile out in the weather
    const cords = s.store.wood || 0;
    if (s.buildings.woodshed) {
      ctx.fillStyle = '#6b4f35'; ctx.fillRect(760, 400, 180, 100);
      ctx.fillStyle = '#3a2b20'; ctx.fillRect(770, 412, 160, 88);
      const rows = Math.min(10, Math.ceil(cords / 4));
      ctx.fillStyle = '#c89a62'; ctx.beginPath();
      for (let r = 0; r < rows; r++) for (let cx = 774 + (r % 2) * 3; cx < 928; cx += 7) { ctx.moveTo(cx + 3.4, 496 - r * 8); ctx.arc(cx, 496 - r * 8, 3.4, 0, Math.PI * 2); }
      ctx.fill();
      ctx.fillStyle = '#5a4130'; ctx.beginPath(); ctx.moveTo(748, 404); ctx.lineTo(850, 372); ctx.lineTo(952, 404); ctx.closePath(); ctx.fill();
      if (snow) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(752, 400); ctx.lineTo(850, 369); ctx.lineTo(948, 400); ctx.lineTo(948, 396); ctx.lineTo(850, 374); ctx.lineTo(752, 396); ctx.fill(); }
      bigText(ctx, 'WOODSHED', 850, 398, 10, '#f3e6c4');
    } else { ctx.save(); ctx.translate(790, 510); ctx.scale(2.2, 2.2); woodpile(ctx, 0, 0, cords, season); ctx.restore(); }
    particles(ctx, season, t, s);
    topSign(ctx, `${Sim.woods(s)} acres of woods (${Math.round(wf * 100)}% stocked)  ·  ${Math.round(cords)} cords of firewood  ·  ${(s.store.lumber || 0).toFixed(1)} MBF lumber`);
  }

  // ---------- Land & Bank: inside the Farmers State Bank ----------
  // Plat of the country around each homestead: rivers, bluffs, railroad, the town, and where the Knutson forties lie (12 x 12 forties = 9 sections)
  const PLATS = {
    strum: { water: [[0, .18], [.22, .32], [.42, .26], [.58, .5], [.8, .58], [1, .82]], ww: 5, wname: 'Buffalo River', rail: [[0, .26], [.4, .34], [1, .74]], town: [.86, .8, 'STRUM'], farm: [3, 7], church: [.3, .64] },
    westby: { water: [[0, .82], [.16, .9], [.3, 1]], ww: 2, wname: 'Kickapoo br.', ridge: [[0, .36], [.25, .3], [.5, .44], [.75, .36], [1, .46]], rail: [[.1, 0], [.5, .12], [1, .16]], town: [.55, .1, 'WESTBY'], farm: [5, 6] },
    coonvalley: { water: [[.52, 0], [.46, .3], [.56, .6], [.5, 1]], ww: 3, wname: 'Coon Creek', bluffs: .14, town: [.5, .9, 'COON VALLEY'], farm: [8, 3] },
    blair: { water: [[0, .52], [.3, .6], [.6, .5], [1, .6]], ww: 7, wname: 'Trempealeau River', marsh: true, rail: [[0, .44], [1, .5]], town: [.84, .4, 'BLAIR'], farm: [3, 1] },
    mondovi: { water: [[0, .72], [.4, .66], [.6, .76], [1, .7]], ww: 4, wname: 'Buffalo River', pond: [.62, .74, .07], town: [.8, .86, 'MONDOVI'], farm: [4, 2] },
    chippewa: { water: [[0, .1], [.4, .18], [.7, .08], [1, .18]], ww: 13, wname: 'Chippewa River', rail: [[0, .34], [1, .3]], town: [.8, .3, 'CHIPPEWA FALLS'], big: true, farm: [3, 6] },
    trempealeau: { water: [[0, .92], [1, .86]], ww: 22, wname: 'Mississippi River', island: [.5, .88], bluffs: .1, rail: [[0, .76], [1, .72]], town: [.16, .7, 'TREMPEALEAU'], farm: [6, 2] },
    winona: { water: [[0, .08], [1, .14]], ww: 22, wname: 'Mississippi River', bridge: .62, town: [.6, .32, 'WINONA'], big: true, sugar: [.86, .76], farm: [2, 8] },
  };
  function platMap(ctx, s, loc, x0, y0, w, h) {
    const P = PLATS[loc.id] || PLATS.strum;
    ctx.fillStyle = '#6b4a2a'; ctx.fillRect(x0, y0, w, h);
    ctx.fillStyle = '#f1e8cf'; ctx.fillRect(x0 + 8, y0 + 8, w - 16, h - 16);
    const mx = x0 + 14, my = y0 + 24, mw = w - 28, mh = h - 46, X = (u) => mx + u * mw, Y = (v) => my + v * mh;
    ctx.save(); ctx.beginPath(); ctx.rect(mx, my, mw, mh); ctx.clip();
    ctx.fillStyle = '#f7f1de'; ctx.fillRect(mx, my, mw, mh);
    const path = (pts) => { ctx.beginPath(); ctx.moveTo(X(pts[0][0]), Y(pts[0][1])); for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; ctx.quadraticCurveTo(X(a[0]), Y(a[1]), X((a[0] + b[0]) / 2), Y((a[1] + b[1]) / 2)); } const l = pts[pts.length - 1]; ctx.lineTo(X(l[0]), Y(l[1])); };
    // forties and section lines (roads on the section lines)
    ctx.strokeStyle = 'rgba(120,90,50,.18)'; ctx.lineWidth = .6;
    ctx.beginPath();
    for (let k = 1; k < 12; k++) { ctx.moveTo(X(k / 12), my); ctx.lineTo(X(k / 12), my + mh); ctx.moveTo(mx, Y(k / 12)); ctx.lineTo(mx + mw, Y(k / 12)); }
    ctx.stroke();
    // the Knutson forties
    const n = Math.max(1, Math.round(s.land / 40)), cols = n <= 4 ? 2 : n <= 12 ? 4 : 6, [fc, fr] = P.farm;
    ctx.fillStyle = '#a9c98a';
    for (let k = 0; k < Math.min(n, cols * (12 - fr)); k++) { const c = Math.min(11, fc + (k % cols)), r = fr + Math.floor(k / cols); ctx.fillRect(X(c / 12) + .5, Y(r / 12) + .5, mw / 12 - 1, mh / 12 - 1); }
    ctx.strokeStyle = '#3f6b2a'; ctx.lineWidth = 1.5; ctx.strokeRect(X(fc / 12), Y(fr / 12), mw / 12 * cols, mh / 12 * Math.ceil(n / cols));
    ctx.strokeStyle = 'rgba(110,70,30,.55)'; ctx.lineWidth = 1; ctx.setLineDash([3, 2]);
    for (let k = 1; k < 3; k++) { ctx.beginPath(); ctx.moveTo(X(k / 3), my); ctx.lineTo(X(k / 3), my + mh); ctx.moveTo(mx, Y(k / 3)); ctx.lineTo(mx + mw, Y(k / 3)); ctx.stroke(); }
    ctx.setLineDash([]);
    if (P.ridge) { ctx.strokeStyle = '#8a5a30'; ctx.lineWidth = 2; path(P.ridge); ctx.stroke(); ctx.font = 'italic 8px Georgia'; ctx.fillStyle = '#8a5a30'; ctx.textAlign = 'left'; ctx.fillText('Ridge Road', X(.04), Y(P.ridge[0][1]) - 4); }
    // bluffs: hachures along the valley walls
    if (P.bluffs) {
      ctx.strokeStyle = 'rgba(90,70,50,.6)'; ctx.lineWidth = .8;
      for (let v = 0; v < 1; v += .025) {
        const near = P.water.reduce((a, q) => (Math.abs(q[1] - v) < Math.abs(a[1] - v) ? q : a), P.water[0]);
        if (P.water.length > 2) { for (const sd of [-1, 1]) { const u = near[0] + sd * P.bluffs; ctx.beginPath(); ctx.moveTo(X(u), Y(v)); ctx.lineTo(X(u + sd * .05), Y(v)); ctx.stroke(); } }
        else { const u = v; ctx.beginPath(); ctx.moveTo(X(u), Y(near[1] - P.bluffs - .1)); ctx.lineTo(X(u), Y(near[1] - P.bluffs - .18)); ctx.stroke(); }
      }
    }
    if (P.marsh) { ctx.fillStyle = '#6f9a5a'; for (let k = 0; k < 50; k++) { const u = pr(k + 900), v = P.water[1][1] + (pr(k + 901) - .5) * .25; ctx.fillRect(X(u), Y(v), 2, 1); ctx.fillRect(X(u) + 1, Y(v) - 2, .6, 2); } }
    // water
    ctx.strokeStyle = '#7aa6c9'; ctx.lineWidth = P.ww; ctx.lineCap = 'round'; path(P.water); ctx.stroke(); ctx.lineCap = 'butt';
    if (P.pond) { ctx.fillStyle = '#7aa6c9'; ctx.beginPath(); ctx.ellipse(X(P.pond[0]), Y(P.pond[1]), P.pond[2] * mw, P.pond[2] * mh * .7, 0, 0, 7); ctx.fill(); }
    if (P.island) { ctx.fillStyle = '#8fae78'; ctx.beginPath(); ctx.ellipse(X(P.island[0]), Y(P.island[1]), 14, 5, 0, 0, 7); ctx.fill(); }
    if (P.bridge) { ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(P.bridge), my); ctx.lineTo(X(P.bridge), Y(P.water[1][1] + .1)); ctx.stroke(); }
    if (P.sugar) { ctx.fillStyle = '#b9a27a'; ctx.beginPath(); ctx.moveTo(X(P.sugar[0]) - 10, Y(P.sugar[1]) + 6); ctx.lineTo(X(P.sugar[0]), Y(P.sugar[1]) - 8); ctx.lineTo(X(P.sugar[0]) + 10, Y(P.sugar[1]) + 6); ctx.closePath(); ctx.fill(); }
    ctx.font = 'italic 8px Georgia'; ctx.fillStyle = '#3c6a8f'; ctx.textAlign = 'center';
    const wm = P.water[Math.floor(P.water.length / 2)];
    ctx.fillText(P.wname, X(Math.min(.8, Math.max(.2, wm[0]))), Y(wm[1]) + (P.ww > 10 ? 3 : -5));
    // railroad
    if (P.rail) {
      ctx.strokeStyle = '#222'; ctx.lineWidth = 1.2;
      ctx.beginPath(); P.rail.forEach((q, i) => (i ? ctx.lineTo(X(q[0]), Y(q[1])) : ctx.moveTo(X(q[0]), Y(q[1])))); ctx.stroke();
      ctx.lineWidth = .8;
      for (let i = 1; i < P.rail.length; i++) {
        const [ax, ay] = [X(P.rail[i - 1][0]), Y(P.rail[i - 1][1])], [bx2, by2] = [X(P.rail[i][0]), Y(P.rail[i][1])], len = Math.hypot(bx2 - ax, by2 - ay), nx = -(by2 - ay) / len, ny = (bx2 - ax) / len;
        for (let d = 4; d < len; d += 8) { const px = ax + (bx2 - ax) * d / len, py = ay + (by2 - ay) * d / len; ctx.beginPath(); ctx.moveTo(px - nx * 2.5, py - ny * 2.5); ctx.lineTo(px + nx * 2.5, py + ny * 2.5); ctx.stroke(); }
      }
    }
    // the town and a country church
    const [tu, tv, tn] = P.town, tw = P.big ? 50 : 26, th = P.big ? 26 : 14;
    ctx.fillStyle = '#c9c2b2'; ctx.fillRect(X(tu) - tw / 2, Y(tv) - th / 2, tw, th);
    ctx.strokeStyle = '#8a8070'; ctx.lineWidth = .6; for (let k = 1; k < (P.big ? 6 : 3); k++) { ctx.beginPath(); ctx.moveTo(X(tu) - tw / 2 + k * tw / (P.big ? 6 : 3), Y(tv) - th / 2); ctx.lineTo(X(tu) - tw / 2 + k * tw / (P.big ? 6 : 3), Y(tv) + th / 2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(X(tu) - tw / 2, Y(tv)); ctx.lineTo(X(tu) + tw / 2, Y(tv)); ctx.stroke();
    if (P.church) { ctx.fillStyle = '#3a2a1a'; ctx.fillRect(X(P.church[0]) - 2, Y(P.church[1]) - 3, 4, 4); ctx.fillRect(X(P.church[0]) - .5, Y(P.church[1]) - 7, 1, 4); }
    ctx.restore();
    ctx.font = 'bold 8px Georgia'; ctx.fillStyle = '#2b2b2b'; ctx.textAlign = 'center';
    const tl = Math.min(mx + mw - 30, Math.max(mx + 30, X(tu)));
    ctx.fillText(tn, tl, Math.min(my + mh - 2, Math.max(my + 8, Y(tv) + th / 2 + 9)));
    ctx.font = 'bold 10px Georgia'; ctx.fillStyle = '#3a2a1a';
    ctx.fillText(`PLAT · ${loc.county.toUpperCase()}`, x0 + w / 2, y0 + 19);
    ctx.fillText(`N. KNUTSON  ·  ${s.land} ACRES`, x0 + w / 2, y0 + h - 11);
  }
  // People in the bank blink now and then, each on their own rhythm. Returns how far the lids are closed (0-1).
  function blinkAt(t, seed) {
    const period = 3.6 + pr(seed) * 3.2, ph = (((t + pr(seed + 1) * period) % period) + period) % period;
    if (ph < .14) return Math.sin(ph / .14 * Math.PI);
    // now and then a quick second blink
    if (pr(seed + 2) > .6 && ph > .24 && ph < .36) return Math.sin((ph - .24) / .12 * Math.PI);
    return 0;
  }
  // Now and then a cow swishes her tail at the flies: a short burst of two or three swings, then it hangs still again.
  // Returns the burst's envelope (0-1) and the side-to-side swing (-1 to 1).
  function swishAt(t, seed) {
    const period = 5.5 + pr(seed + 7) * 5, ph = (((t + pr(seed + 8) * period) % period) + period) % period, len = 1.7;
    if (ph >= len) return { amp: 0, swing: 0 };
    return { amp: Math.sin(ph / len * Math.PI), swing: Math.sin(ph / len * Math.PI * 2 * (1.5 + pr(seed + 9))) };
  }
  // A face in three-quarter light: ears, eyes that blink and look down when ld is set, brows, nose, and a mustache.
  function bustFace(c, hx, hy, o, t) {
    const skin = '#e2b892', closed = blinkAt(t, o.seed), ld = o.lookDown || 0;
    for (const sd of [-1, 1]) { c.fillStyle = tone(skin, sd < 0 ? -.16 : -.04); c.beginPath(); c.ellipse(hx + sd * 12.2, hy + 1, 2.6, 4.2, 0, 0, 7); c.fill(); }
    const fg = c.createRadialGradient(hx + 4, hy - 5, 1, hx, hy, 17);
    fg.addColorStop(0, tone(skin, .12)); fg.addColorStop(.7, skin); fg.addColorStop(1, tone(skin, -.22));
    c.fillStyle = fg; c.beginPath(); c.ellipse(hx, hy, 12, 14.5, 0, 0, 7); c.fill();
    // hair (white for the banker), parted on the side
    c.fillStyle = o.hair;
    c.beginPath(); c.moveTo(hx - 12.4, hy + 1); c.bezierCurveTo(hx - 13.6, hy - 14, hx - 5, hy - 17.5, hx + 2, hy - 16.8);
    c.bezierCurveTo(hx + 10, hy - 16.4, hx + 13.4, hy - 9, hx + 12.4, hy - 2); c.quadraticCurveTo(hx + 9, hy - 10, hx - 3, hy - 11.5);
    c.quadraticCurveTo(hx - 9, hy - 9.5, hx - 10.6, hy + 2); c.closePath(); c.fill();
    c.strokeStyle = rgba(tone(o.hair, .3), .5); c.lineWidth = .7; c.beginPath(); c.moveTo(hx - 3, hy - 16.6); c.quadraticCurveTo(hx + 4, hy - 14, hx + 10, hy - 9); c.stroke();
    // eyes, with lids that close when blinking
    const ey = hy - 1 + ld * .6;
    for (const sd of [-1, 1]) {
      const ex = hx + sd * 4.8;
      c.fillStyle = 'rgba(120,70,50,.18)'; c.beginPath(); c.ellipse(ex, ey - .6, 3, 2.2, 0, 0, 7); c.fill();
      const open = Math.max(.08, 1 - closed) * (1 - ld * .35);
      c.fillStyle = '#f6f1e6'; c.beginPath(); c.ellipse(ex, ey, 2.4, 1.55 * open, 0, 0, 7); c.fill();
      if (open > .2) {
        c.save(); c.beginPath(); c.ellipse(ex, ey, 2.4, 1.55 * open, 0, 0, 7); c.clip();
        c.fillStyle = o.iris || '#4a5f74'; c.beginPath(); c.arc(ex + .3, ey + ld * .7, 1.25, 0, 7); c.fill();
        c.fillStyle = '#141010'; c.beginPath(); c.arc(ex + .3, ey + ld * .7, .6, 0, 7); c.fill();
        c.restore();
      }
      c.strokeStyle = tone(skin, -.42); c.lineWidth = .8; c.beginPath(); c.ellipse(ex, ey, 2.5, 1.6 * open + .1, 0, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
      c.strokeStyle = o.brow; c.lineWidth = 1.3; c.beginPath(); c.moveTo(ex - 2.6, ey - 3.6 + sd * .2); c.quadraticCurveTo(ex, ey - 4.6, ex + 2.7, ey - 3.8 - sd * .2); c.stroke();
    }
    c.strokeStyle = tone(skin, -.3); c.lineWidth = 1; c.beginPath(); c.moveTo(hx + .6, hy - 1); c.quadraticCurveTo(hx + 2.4, hy + 5, hx + .2, hy + 6); c.stroke();
    c.fillStyle = 'rgba(200,110,90,.16)'; for (const sd of [-1, 1]) { c.beginPath(); c.ellipse(hx + sd * 7, hy + 4, 2.6, 1.8, 0, 0, 7); c.fill(); }
    c.fillStyle = o.stache;
    c.beginPath(); c.moveTo(hx - 6.4, hy + 9.4); c.quadraticCurveTo(hx - 3, hy + 6.2, hx, hy + 7.4); c.quadraticCurveTo(hx + 3, hy + 6.2, hx + 6.4, hy + 9.4);
    c.quadraticCurveTo(hx + 3, hy + 9, hx, hy + 9.6); c.quadraticCurveTo(hx - 3, hy + 9, hx - 6.4, hy + 9.4); c.fill();
    c.strokeStyle = 'rgba(110,50,40,.6)'; c.lineWidth = .8; c.beginPath(); c.moveTo(hx - 2.4, hy + 11.4); c.quadraticCurveTo(hx, hy + 12, hx + 2.4, hy + 11.4); c.stroke();
    if (o.spectacles) {
      c.strokeStyle = '#8a7a52'; c.lineWidth = .8; c.beginPath();
      for (const sd of [-1, 1]) c.ellipse(hx + sd * 4.8, ey + .2, 3.2, 2.5, 0, 0, 7);
      c.moveTo(hx - 1.6, ey); c.quadraticCurveTo(hx, ey - 1, hx + 1.6, ey); c.moveTo(hx - 8, ey - .4); c.lineTo(hx - 11.8, ey - 1); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.22)'; for (const sd of [-1, 1]) { c.beginPath(); c.ellipse(hx + sd * 4.8 + 1, ey - .6, 1.4, .8, -.5, 0, 7); c.fill(); }
    }
  }
  // A sleeve from shoulder to elbow to wrist (shirt or coat), with a hand at the end.
  function sleeve(c, pts, color, width, garter) {
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = tone(color, -.22); c.lineWidth = width + 1.4; c.beginPath(); c.moveTo(...pts[0]); c.lineTo(...pts[1]); c.lineTo(...pts[2]); c.stroke();
    c.strokeStyle = color; c.lineWidth = width; c.beginPath(); c.moveTo(...pts[0]); c.lineTo(...pts[1]); c.lineTo(...pts[2]); c.stroke();
    c.strokeStyle = rgba(tone(color, .25), .55); c.lineWidth = width * .3; c.beginPath(); c.moveTo(pts[0][0] + 1.5, pts[0][1]); c.lineTo(pts[1][0] + 1.5, pts[1][1]); c.stroke();
    if (garter) {
      const gx = (pts[0][0] + pts[1][0]) / 2, gy = (pts[0][1] + pts[1][1]) / 2, a = Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]);
      c.save(); c.translate(gx, gy); c.rotate(a); c.fillStyle = '#1c1c1c'; c.fillRect(-1.6, -width / 2 - .6, 3.2, width + 1.2); c.restore();
    }
    c.lineCap = 'butt';
  }
  function bankHand(c, x, y, a = 0) {
    c.save(); c.translate(x, y); c.rotate(a);
    const hg = c.createLinearGradient(0, -3, 0, 3); hg.addColorStop(0, '#ecc6a2'); hg.addColorStop(1, '#c4916c');
    c.fillStyle = hg; c.beginPath(); c.ellipse(0, 0, 5, 3.3, 0, 0, 7); c.fill();
    c.strokeStyle = 'rgba(120,70,50,.45)'; c.lineWidth = .5; c.beginPath(); for (const d of [-1.5, .3, 2]) { c.moveTo(d + 1.6, -2.4); c.lineTo(d + 3.4, -1.4); } c.stroke();
    c.restore();
  }
  const bill = (c, x, y, w = 15, a = 0) => {
    c.save(); c.translate(x, y); c.rotate(a);
    c.fillStyle = '#bccfae'; c.fillRect(-w / 2, -1.3, w, 2.6); c.strokeStyle = '#5f7c5a'; c.lineWidth = .5; c.strokeRect(-w / 2 + 1.2, -.8, w - 2.4, 1.6);
    c.restore();
  };
  // The teller in shirtsleeves, vest, and green eyeshade, counting bills at the wicket. Origin: the counter top under him.
  // The bank's staff are drawn at this fraction of their modelled size, to stand with the customers.
  const STAFF = .62;
  function teller(ctx, x, y, t) {
    if (STAFF !== 1) { ctx.save(); ctx.translate(x, y); ctx.scale(STAFF, STAFF); try { tellerAt(ctx, 0, 0, t); } finally { ctx.restore(); } return; }
    tellerAt(ctx, x, y, t);
  }
  function tellerAt(ctx, x, y, t) {
    lit(ctx, x - 44, y - 104, x + 44, y + 6, c => {
      // one bill at a time: reach to the stack, take it, lay it on the pile, then rest a moment
      const p = (t / 2.8) % 1, ease = (u) => u * u * (3 - 2 * u);
      const stack = -5, pile = 9;
      let rx, carry = false;
      if (p < .3) rx = pile + (stack - pile) * ease(p / .3);
      else if (p < .42) rx = stack;
      else if (p < .74) { rx = stack + (pile - stack) * ease((p - .42) / .32); carry = true; }
      else rx = pile;
      const lift = p >= .42 && p < .74 ? Math.sin((p - .42) / .32 * Math.PI) * 1.6 : 0;
      const nod = Math.sin(t * .7) * .5;
      c.save(); c.translate(x, y);
      // the shirt, the vest buttoned over it, collar and bow tie
      const sg = c.createLinearGradient(-30, 0, 30, 0); sg.addColorStop(0, '#c9c6bd'); sg.addColorStop(.65, '#f3f0e8'); sg.addColorStop(1, '#d9d6cc');
      c.fillStyle = sg; c.beginPath(); c.moveTo(-28, 4); c.bezierCurveTo(-31, -30, -30, -58, -14, -62); c.lineTo(14, -62); c.bezierCurveTo(30, -58, 31, -30, 28, 4); c.closePath(); c.fill();
      const vg = c.createLinearGradient(-22, 0, 22, 0); vg.addColorStop(0, '#22262c'); vg.addColorStop(.65, '#3c424b'); vg.addColorStop(1, '#2a2f36');
      c.fillStyle = vg; c.beginPath(); c.moveTo(-21, 4); c.lineTo(-22, -46); c.quadraticCurveTo(-20, -58, -12, -60); c.lineTo(0, -38); c.lineTo(12, -60); c.quadraticCurveTo(20, -58, 22, -46); c.lineTo(21, 4); c.closePath(); c.fill();
      c.fillStyle = '#b89a52'; for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(0, -32 + k * 8, 1, 0, 7); c.fill(); }
      c.strokeStyle = '#b89a52'; c.lineWidth = .7; c.beginPath(); c.moveTo(0, -16); c.quadraticCurveTo(-8, -10, -14, -16); c.stroke();
      c.fillStyle = '#f7f4ec'; c.beginPath(); c.moveTo(-7, -62); c.lineTo(0, -56); c.lineTo(7, -62); c.lineTo(5, -66); c.lineTo(-5, -66); c.closePath(); c.fill();
      c.fillStyle = '#6a1f24'; c.beginPath(); c.moveTo(0, -60); c.lineTo(-5, -63); c.lineTo(-5, -57); c.closePath(); c.moveTo(0, -60); c.lineTo(5, -63); c.lineTo(5, -57); c.closePath(); c.fill();
      c.fillStyle = '#d8ab86'; c.fillRect(-4.5, -71, 9, 7);
      // the head, bent a little toward the money
      const hx = 0, hy = -82 + 1.2 + nod;
      bustFace(c, hx, hy, { seed: 17, hair: '#4a3324', brow: '#3a281c', stache: '#5a3e2a', lookDown: 1 }, t);
      // the green celluloid eyeshade on its band
      c.fillStyle = '#2c2c2c'; c.beginPath(); c.ellipse(hx, hy - 9.5, 12.6, 2.4, 0, Math.PI * .95, Math.PI * 2.05, false); c.fill();
      c.fillStyle = 'rgba(46,140,96,.72)';
      c.beginPath(); c.moveTo(hx - 13, hy - 10); c.quadraticCurveTo(hx, hy - 13, hx + 13, hy - 10); c.lineTo(hx + 15.5, hy - 5); c.quadraticCurveTo(hx, hy - 7.6, hx - 15.5, hy - 5); c.closePath(); c.fill();
      c.fillStyle = 'rgba(40,120,80,.16)'; c.beginPath(); c.ellipse(hx, hy - 1, 11, 4, 0, 0, 7); c.fill();
      c.strokeStyle = 'rgba(220,255,230,.35)'; c.lineWidth = .7; c.beginPath(); c.moveTo(hx - 12, hy - 9.6); c.quadraticCurveTo(hx, hy - 12.3, hx + 12, hy - 9.6); c.stroke();
      // bills: the stack under his left hand, the counted pile, and the one he is moving
      for (let k = 0; k < 5; k++) bill(c, -14, -1.4 - k * 1.1, 16, .05);
      for (let k = 0; k < 4; k++) bill(c, 18, -1.2 - k * 1, 16, -.06 + k * .03);
      // arms: shirtsleeves with garters, elbows out, hands on the counter
      sleeve(c, [[-25, -54], [-33, -24], [-17, -6]], '#ece9e1', 9, true);
      sleeve(c, [[25, -54], [32, -24], [rx + 4, -6 - lift]], '#ece9e1', 9, true);
      bankHand(c, -16, -5.5, .2);
      if (carry) bill(c, rx + 1, -5 - lift, 15, -.05);
      bankHand(c, rx + 4, -6.5 - lift, -.15);
      c.restore();
    }, [x, y + 1, 30, 3]);
  }
  // The banker at his desk in a dark suit, spectacles, and a white mustache, writing in the mortgage ledger.
  function banker(ctx, x, y, t, part = 'body') {
    ctx.save(); ctx.translate(x, y); ctx.scale(STAFF, STAFF);
    try { bankerAt(ctx, 0, 0, t, part); } finally { ctx.restore(); }
  }
  function bankerAt(ctx, x, y, t, part) {
    const drift = ((t / 7) % 1), wx = -2 + drift * 12 + Math.sin(t * 3.1) * 1.2, wy = -4 + Math.sin(t * 6.2) * .5;
    if (part === 'hands') {
      // over the ledger: the left hand flat on the page, the right hand writing with a dip pen
      ctx.save(); ctx.translate(x, y);
      sleeve(ctx, [[-28, -30], [-30, -16], [-18, -5]], '#2e343e', 10, false);
      sleeve(ctx, [[28, -30], [30, -16], [wx + 2, wy]], '#2e343e', 10, false);
      ctx.fillStyle = '#f5f2ea'; ctx.save(); ctx.translate(wx + 1, wy - .4); ctx.rotate(-.5); ctx.fillRect(-1.6, -2.4, 3.2, 4.8); ctx.restore();
      bankHand(ctx, -16, -4.5, .1);
      bankHand(ctx, wx, wy - 1, -.4);
      ctx.strokeStyle = '#1c1c1c'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(wx - 3, wy + .5); ctx.lineTo(wx + 5, wy - 10); ctx.stroke();
      ctx.restore();
      return;
    }
    lit(ctx, x - 44, y - 92, x + 44, y + 6, c => {
      c.save(); c.translate(x, y);
      const cg = c.createLinearGradient(-32, 0, 32, 0); cg.addColorStop(0, '#1f242c'); cg.addColorStop(.62, '#39404c'); cg.addColorStop(1, '#262b33');
      c.fillStyle = cg; c.beginPath(); c.moveTo(-30, 4); c.bezierCurveTo(-34, -24, -32, -48, -15, -52); c.lineTo(15, -52); c.bezierCurveTo(32, -48, 34, -24, 30, 4); c.closePath(); c.fill();
      c.fillStyle = '#7d6c58'; c.beginPath(); c.moveTo(-9, -50); c.lineTo(0, -28); c.lineTo(9, -50); c.closePath(); c.fill();
      c.fillStyle = '#f5f2ea'; c.beginPath(); c.moveTo(-6.5, -52); c.lineTo(0, -45); c.lineTo(6.5, -52); c.lineTo(4.6, -56); c.lineTo(-4.6, -56); c.closePath(); c.fill();
      c.fillStyle = '#5a2430'; c.beginPath(); c.moveTo(-2, -49); c.lineTo(2, -49); c.lineTo(3, -34); c.lineTo(0, -31); c.lineTo(-3, -34); c.closePath(); c.fill();
      c.strokeStyle = '#141820'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-9, -50); c.lineTo(-12, -24); c.moveTo(9, -50); c.lineTo(12, -24); c.stroke();
      c.strokeStyle = '#c9a85a'; c.lineWidth = .8; c.beginPath(); c.moveTo(-4, -30); c.quadraticCurveTo(-10, -26, -16, -30); c.stroke();
      c.fillStyle = '#d8ab86'; c.fillRect(-4.5, -60, 9, 6);
      const hy = -71 + .8 + Math.sin(t * .5) * .4;
      bustFace(c, 0, hy, { seed: 41, hair: '#dedad2', brow: '#bdb6aa', stache: '#ece8e0', iris: '#5b6a52', spectacles: true, lookDown: .9 }, t);
      // upper arms, reaching forward to the desk
      sleeve(c, [[-26, -44], [-30, -30], [-30, -30]], '#2e343e', 10, false);
      sleeve(c, [[26, -44], [30, -30], [30, -30]], '#2e343e', 10, false);
      c.restore();
    }, [x, y + 1, 32, 3]);
  }
  // The room itself, painted once per town, season, and year: pressed-tin ceiling, plaster and pilasters, side windows on
  // Main Street, oak wainscot, a marble floor and runner, the vault, the inside of the teller's cage, and the wall clock case.
  function bankPlate(loc, y, season, poster) {
    return cached(`bank|${loc.id}|${y}|${season}|${poster ? poster.join() : ''}|${Object.keys(painted).length}`, W, H, g => {
      // plaster walls
      const wg = g.createLinearGradient(0, 54, 0, 300); wg.addColorStop(0, '#d9cfb2'); wg.addColorStop(1, '#e6dec6');
      g.fillStyle = wg; g.fillRect(0, 54, W, 250);
      g.save(); g.globalAlpha = .5; g.translate(0, 54); g.fillStyle = patternFor(g, 'mottle', mottle); g.fillRect(0, 0, W, 250); g.restore();
      // a stencilled frieze under the cornice
      g.fillStyle = '#b5a37a'; g.fillRect(0, 54, W, 16);
      g.strokeStyle = 'rgba(110,84,40,.55)'; g.lineWidth = 1; g.beginPath();
      for (let x = 0; x < W; x += 24) { g.moveTo(x, 66); g.bezierCurveTo(x + 4, 56, x + 12, 56, x + 12, 62); g.bezierCurveTo(x + 12, 68, x + 20, 68, x + 24, 58); }
      g.stroke();
      g.fillStyle = '#8a7650'; g.fillRect(0, 70, W, 2);
      // pressed-tin ceiling: embossed squares, each with a rosette, lit from the lamps below
      for (let x = 0, k = 0; x < W; x += 32, k++) for (let yy = 0, r = 0; yy < 54; yy += 18, r++) {
        const tg = g.createLinearGradient(x, yy, x + 32, yy + 18); tg.addColorStop(0, '#e4ddc9'); tg.addColorStop(1, '#a89f88');
        g.fillStyle = tg; g.fillRect(x, yy, 32, 18);
        g.strokeStyle = 'rgba(255,255,245,.6)'; g.lineWidth = 1; g.strokeRect(x + 2.5, yy + 2.5, 26, 12);
        g.strokeStyle = 'rgba(80,70,52,.4)'; g.strokeRect(x + 3.5, yy + 3.5, 26, 12);
        const rg = g.createRadialGradient(x + 15, yy + 8, .5, x + 16, yy + 9, 6); rg.addColorStop(0, '#f2ecdc'); rg.addColorStop(1, '#8f866f');
        g.fillStyle = rg; g.beginPath(); for (let j = 0; j < 8; j++) { const a = j / 8 * Math.PI * 2; g.moveTo(x + 16, yy + 9); g.arc(x + 16, yy + 9, 5, a, a + .3); } g.fill();
      }
      const cs = g.createLinearGradient(0, 40, 0, 56); cs.addColorStop(0, 'rgba(40,30,20,0)'); cs.addColorStop(1, 'rgba(40,30,20,.35)');
      g.fillStyle = cs; g.fillRect(0, 40, W, 16);
      // crown molding
      for (const [yy, h, col] of [[50, 4, '#efe7d2'], [54, 2, '#8a7650']]) { g.fillStyle = col; g.fillRect(0, yy, W, h); }
      // two tall windows onto Main Street, the painted sky and bluffs beyond
      for (const [wx, vx] of [[52, 40], [214, 230]]) {
        g.fillStyle = 'rgba(40,30,20,.18)'; g.fillRect(wx - 8, 100, 112, 132);
        boards(g, wx - 10, 96, wx + 106, 232, '#7a5634', 116, wx);
        const top = 112;
        g.save(); g.beginPath(); g.moveTo(wx, 224); g.lineTo(wx, top + 24); g.quadraticCurveTo(wx, top, wx + 48, top); g.quadraticCurveTo(wx + 96, top, wx + 96, top + 24); g.lineTo(wx + 96, 224); g.closePath(); g.clip();
        insideWindow(g, season, wx, top, 96, 112, 2, 3, vx, '#e9e1cc');
        g.restore();
        g.strokeStyle = '#5a3d24'; g.lineWidth = 3; g.beginPath(); g.moveTo(wx, 224); g.lineTo(wx, top + 24); g.quadraticCurveTo(wx, top, wx + 48, top); g.quadraticCurveTo(wx + 96, top, wx + 96, top + 24); g.lineTo(wx + 96, 224); g.stroke();
        // the bank's name in gilt, reversed, on the glass
        g.save(); g.translate(wx + 48, 196); g.scale(-1, 1); g.font = 'bold 9px Georgia'; g.textAlign = 'center'; g.fillStyle = 'rgba(214,174,66,.75)'; g.fillText(wx < 100 ? 'FARMERS' : 'STATE BANK', 0, 0); g.restore();
        boards(g, wx - 14, 224, wx + 110, 232, '#8a6440', 124, wx + 1);
        g.fillStyle = 'rgba(30,20,12,.3)'; g.fillRect(wx - 14, 232, 124, 3);
        // half-drawn roller shade
        const sh = g.createLinearGradient(0, top - 4, 0, top + 20); sh.addColorStop(0, '#d8c8a0'); sh.addColorStop(1, '#c2b086');
        g.fillStyle = sh; g.fillRect(wx - 2, top - 6, 100, 22);
        g.fillStyle = '#6b4a2a'; g.fillRect(wx - 3, top - 8, 102, 3); g.beginPath(); g.arc(wx + 48, top + 19, 2, 0, 7); g.fill();
      }
      // fluted pilasters between the bays
      for (const px of [336, 548, 676]) {
        const pg = g.createLinearGradient(px - 9, 0, px + 9, 0); pg.addColorStop(0, '#b4a988'); pg.addColorStop(.6, '#efe7d2'); pg.addColorStop(1, '#bfb393');
        g.fillStyle = pg; g.fillRect(px - 9, 72, 18, 226);
        g.strokeStyle = 'rgba(110,96,70,.35)'; g.lineWidth = 1; g.beginPath(); for (const d of [-5, 0, 5]) { g.moveTo(px + d, 86); g.lineTo(px + d, 286); } g.stroke();
        g.fillStyle = '#e9e1cb'; g.fillRect(px - 12, 72, 24, 8); g.fillStyle = '#a99c78'; g.fillRect(px - 12, 80, 24, 2);
      }
      // the oak wainscot of raised panels, with a chair rail
      boards(g, 0, 298, W, 420, '#6a4527', 60, 101);
      for (let x = 0; x < W; x += 60) {
        const px = x + 7, py = 312, pw = 46, ph = 94;
        g.fillStyle = 'rgba(255,230,190,.14)'; shape(g, [[px, py], [px + pw, py], [px + pw - 5, py + 5], [px + 5, py + 5]]); g.fill();
        shape(g, [[px + pw, py], [px + pw, py + ph], [px + pw - 5, py + ph - 5], [px + pw - 5, py + 5]]); g.fill();
        g.fillStyle = 'rgba(20,10,4,.3)'; shape(g, [[px, py], [px + 5, py + 5], [px + 5, py + ph - 5], [px, py + ph]]); g.fill();
        shape(g, [[px, py + ph], [px + 5, py + ph - 5], [px + pw - 5, py + ph - 5], [px + pw, py + ph]]); g.fill();
      }
      const rail = g.createLinearGradient(0, 292, 0, 304); rail.addColorStop(0, '#8a5e36'); rail.addColorStop(.4, '#a87a4c'); rail.addColorStop(1, '#4a2f1b');
      g.fillStyle = rail; g.fillRect(0, 292, W, 12);
      // a marble floor of cream and verde squares, laid toward the back wall, with a dark baseboard
      const rows = [420]; for (let r = 1; rows[rows.length - 1] < H; r++) rows.push(420 + r * (6 + r * 1.6));
      const xAt = (k, yy) => { const f = (yy - 420) / (H - 420); return 480 + k * (34 + 44 * f); };
      for (let r = 0; r < rows.length - 1; r++) for (let k = -16; k < 16; k++) {
        const y0 = rows[r], y1 = rows[r + 1], light = (k + r) % 2 === 0;
        g.fillStyle = light ? '#ddd5c4' : '#5f6d60';
        shape(g, [[xAt(k, y0), y0], [xAt(k + 1, y0), y0], [xAt(k + 1, y1), y1], [xAt(k, y1), y1]]); g.fill();
      }
      g.save(); g.beginPath(); g.rect(0, 420, W, H - 420); g.clip();
      g.globalAlpha = .7; g.translate(0, 420); g.fillStyle = patternFor(g, 'mottle', mottle); g.fillRect(0, 0, W, H - 420); g.translate(0, -420); g.globalAlpha = 1;
      g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = .6; g.beginPath();
      for (let k = 0; k < 40; k++) { const x = pr(k + 500) * W, yy = 424 + pr(k + 501) * 110; g.moveTo(x, yy); g.bezierCurveTo(x + 10, yy + 3, x + 18, yy - 2, x + 30 + pr(k) * 20, yy + 4); }
      g.stroke();
      // reflections of the windows and the lamps in the polish
      for (const rx of [100, 262, 480, 612]) { const rg = g.createLinearGradient(0, 420, 0, 500); rg.addColorStop(0, 'rgba(255,250,232,.2)'); rg.addColorStop(1, 'rgba(255,250,232,0)'); g.fillStyle = rg; g.fillRect(rx - 26, 420, 52, 80); }
      g.restore();
      g.fillStyle = '#3a2516'; g.fillRect(0, 414, W, 8);
      // the runner from the door to the banker's desk: a red Turkey carpet with a gold border and fringe
      g.fillStyle = '#7a2a24'; shape(g, [[430, 422], [560, 422], [640, H], [380, H]]); g.fill();
      g.save(); shape(g, [[430, 422], [560, 422], [640, H], [380, H]]); g.clip();
      g.globalAlpha = .45; g.translate(0, 420); g.fillStyle = patternFor(g, 'mottle', mottle); g.fillRect(0, 0, W, 120); g.globalAlpha = 1; g.translate(0, -420);
      g.fillStyle = 'rgba(30,40,80,.5)';
      for (let r = 0; r < 4; r++) { const yy = 440 + r * 26 + r * r * 2, f = (yy - 420) / 120, cx = 495 + f * 15; g.beginPath(); g.moveTo(cx, yy - 6 - f * 4); g.lineTo(cx + 14 + f * 8, yy); g.lineTo(cx, yy + 6 + f * 4); g.lineTo(cx - 14 - f * 8, yy); g.closePath(); g.fill(); }
      g.restore();
      g.strokeStyle = '#c9a227'; g.lineWidth = 3; g.beginPath(); g.moveTo(440, 426); g.lineTo(550, 426); g.lineTo(622, H - 4); g.lineTo(398, H - 4); g.closePath(); g.stroke();
      g.strokeStyle = 'rgba(201,162,39,.5)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(452, 432); g.lineTo(538, 432); g.lineTo(604, H - 12); g.lineTo(416, H - 12); g.closePath(); g.stroke();
      g.strokeStyle = '#e8dcc0'; g.lineWidth = 1; g.beginPath(); for (let x = 432; x < 560; x += 3) { g.moveTo(x, 422); g.lineTo(x + .5, 419); } g.stroke();
      // the vault: a steel frame, safe-deposit boxes inside, and the round door swung open on its hinge
      g.fillStyle = 'rgba(30,24,18,.3)'; g.fillRect(352, 146, 168, 156);
      const vf = g.createLinearGradient(354, 0, 516, 0); vf.addColorStop(0, '#4c5257'); vf.addColorStop(.6, '#8a9094'); vf.addColorStop(1, '#53595d');
      g.fillStyle = vf; g.fillRect(356, 146, 158, 152);
      g.fillStyle = '#c9a227'; g.fillRect(362, 152, 146, 1.4); g.fillRect(362, 292, 146, 1.4);
      const vi = g.createLinearGradient(0, 164, 0, 298); vi.addColorStop(0, '#1a1c1f'); vi.addColorStop(1, '#2c2a27');
      g.fillStyle = vi; g.fillRect(372, 162, 126, 136);
      for (let r = 0; r < 6; r++) for (let k = 0; k < 7; k++) {
        const bx = 378 + k * 16.6, by = 168 + r * 13;
        const bg = g.createLinearGradient(bx, by, bx + 14, by + 11); bg.addColorStop(0, '#b0904a'); bg.addColorStop(1, '#6e5426');
        g.fillStyle = bg; g.fillRect(bx, by, 14.6, 11); g.fillStyle = '#2a2210'; g.fillRect(bx + 6, by + 4.5, 2.6, 1.6);
      }
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(372, 162, 126, 12);
      boards(g, 376, 252, 494, 258, '#6b4a2a', 118, 9); boards(g, 376, 278, 494, 284, '#6b4a2a', 118, 10);
      g.fillStyle = '#d8d0b8'; for (let k = 0; k < 6; k++) g.fillRect(384 + k * 17, 244 - (k % 2) * 3, 12, 8 + (k % 2) * 3);
      g.font = 'bold 8px Georgia'; g.textAlign = 'center'; g.fillStyle = '#c9a227'; g.fillText('DIEBOLD SAFE & LOCK CO.', 435, 160);
      g.fillStyle = '#5a6064'; g.fillRect(508, 172, 8, 20); g.fillRect(508, 262, 8, 20);
      // the door, edge-on: its thick steel rim with locking bolts, then its face with a spoked hand wheel
      g.fillStyle = '#3e4347'; g.beginPath(); g.ellipse(530, 226, 22, 72, 0, 0, 7); g.fill();
      const df = g.createLinearGradient(512, 0, 556, 0); df.addColorStop(0, '#6f767b'); df.addColorStop(.55, '#c9ced1'); df.addColorStop(1, '#7c8387');
      g.fillStyle = df; g.beginPath(); g.ellipse(538, 226, 20, 70, 0, 0, 7); g.fill();
      g.fillStyle = '#d6dadc'; for (let k = 0; k < 9; k++) { const a = -Math.PI / 2 + k / 8 * Math.PI; g.fillRect(522 + Math.cos(a) * 2, 226 + Math.sin(a) * 66 - 2, 7, 4); }
      g.strokeStyle = '#c9a227'; g.lineWidth = 2; g.beginPath(); g.ellipse(538, 226, 15, 54, 0, 0, 7); g.stroke();
      g.strokeStyle = '#3a3f43'; g.lineWidth = 2.4; g.beginPath(); for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI; g.moveTo(540 - Math.cos(a) * 3, 226 - Math.sin(a) * 14); g.lineTo(540 + Math.cos(a) * 3, 226 + Math.sin(a) * 14); } g.stroke();
      g.strokeStyle = '#c9a227'; g.lineWidth = 2; g.beginPath(); g.ellipse(540, 226, 4, 14, 0, 0, 7); g.stroke();
      g.fillStyle = '#e8ecee'; g.beginPath(); g.ellipse(541, 196, 3, 6, 0, 0, 7); g.fill();
      bigText(g, 'VAULT', 435, 142, 11, '#4a3a1e');
      // the poster of the day, a calendar, and the regulator clock case
      if (poster) {
        g.fillStyle = 'rgba(30,20,12,.25)'; g.fillRect(563, 123, 70, 90);
        g.fillStyle = '#f1ead8'; g.fillRect(560, 120, 70, 90); g.strokeStyle = '#2f4f7a'; g.lineWidth = 3; g.strokeRect(562, 122, 66, 86);
        poster.forEach((l, k) => bigText(g, l, 595, 146 + k * 22, k === 1 ? 13 : 10, k === 1 ? '#a3262a' : '#2f4f7a'));
        g.fillStyle = '#9a2a22'; g.beginPath(); g.arc(595, 124, 2, 0, 7); g.fill();
      }
      g.fillStyle = 'rgba(30,20,12,.25)'; g.fillRect(563, 233, 44, 54);
      g.fillStyle = '#f3efe6'; g.fillRect(560, 230, 44, 54); g.fillStyle = '#a3262a'; g.fillRect(560, 230, 44, 12);
      bigText(g, String(y), 582, 270, 13, '#2b2b2b');
      g.strokeStyle = 'rgba(80,70,60,.3)'; g.lineWidth = .5; g.beginPath(); for (let r = 0; r < 3; r++) { g.moveTo(564, 274 + r * 3); g.lineTo(600, 274 + r * 3); } g.stroke();
      g.fillStyle = 'rgba(30,20,12,.3)'; g.fillRect(622, 218, 44, 84);
      boards(g, 618, 214, 660, 298, '#6b3f22', 42, 13);
      g.fillStyle = '#4a2a16'; shape(g, [[614, 214], [664, 214], [656, 204], [622, 204]]); g.fill();
      g.fillStyle = '#f3efe6'; g.beginPath(); g.arc(639, 234, 14, 0, 7); g.fill();
      g.strokeStyle = '#c9a227'; g.lineWidth = 2; g.stroke();
      g.strokeStyle = '#3a3a3a'; g.lineWidth = .7; g.beginPath(); for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; g.moveTo(639 + Math.cos(a) * 11, 234 + Math.sin(a) * 11); g.lineTo(639 + Math.cos(a) * 13, 234 + Math.sin(a) * 13); } g.stroke();
      g.fillStyle = '#2a1a10'; g.fillRect(626, 254, 26, 38);
      g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(627, 255, 6, 36);
      bigText(g, 'REGULATOR', 639, 300, 5, '#c9a227');
      // inside the teller's cage: a darker wall, a shelf of ledgers, and the cash register
      const cg2 = g.createLinearGradient(0, 240, 0, 392); cg2.addColorStop(0, '#8d8468'); cg2.addColorStop(1, '#6a6048');
      g.fillStyle = cg2; g.fillRect(30, 244, 300, 148);
      boards(g, 40, 300, 320, 306, '#6b4a2a', 280, 21);
      const spines = ['#5a2a22', '#2f3e52', '#4a3a24', '#6a2a2a', '#2e4a3a', '#5a4a2a'];
      for (let k = 0; k < 18; k++) { if (k > 6 && k < 11) continue; const bx = 46 + k * 15, bh = 26 + (k % 3) * 3; g.fillStyle = spines[k % spines.length]; g.fillRect(bx, 300 - bh, 12, bh); g.fillStyle = '#c9a227'; g.fillRect(bx + 2, 300 - bh + 5, 8, 1.2); g.fillRect(bx + 2, 300 - bh + 9, 8, .8); }
      const reg = g.createLinearGradient(52, 0, 112, 0); reg.addColorStop(0, '#7a5a20'); reg.addColorStop(.55, '#e2c06a'); reg.addColorStop(1, '#8a6a28');
      g.fillStyle = reg; shape(g, [[52, 390], [112, 390], [108, 352], [98, 344], [66, 344], [56, 352]]); g.fill();
      g.strokeStyle = 'rgba(90,60,20,.6)'; g.lineWidth = .7; g.beginPath(); for (let k = 0; k < 5; k++) { g.moveTo(58 + k * 11, 356); g.bezierCurveTo(60 + k * 11, 362, 64 + k * 11, 362, 66 + k * 11, 356); } g.stroke();
      g.fillStyle = '#1e1e1e'; g.fillRect(70, 334, 24, 10); g.fillStyle = '#f3efe6'; g.font = 'bold 7px Georgia'; g.fillText('$ 0.25', 82, 342);
      g.fillStyle = '#efe9da'; for (let r = 0; r < 2; r++) for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(60 + k * 8, 370 + r * 8, 2.4, 0, 7); g.fill(); }
    });
  }
  // The front of the teller's cage: brass grille with an arched wicket, an oak frame and gilt transom, and the marble counter.
  function bankCage() {
    return cached('bankCage', W, H, g => {
      const brass = (x0, y0, x1, y1) => { const bg = g.createLinearGradient(x0, 0, x1, 0); bg.addColorStop(0, '#7a5a1a'); bg.addColorStop(.5, '#f0d27a'); bg.addColorStop(1, '#8a6a22'); g.fillStyle = bg; g.fillRect(x0, y0, x1 - x0, y1 - y0); };
      g.save(); g.beginPath(); g.rect(30, 246, 300, 144);
      g.moveTo(150, 390); g.lineTo(150, 326); g.quadraticCurveTo(150, 306, 180, 306); g.quadraticCurveTo(210, 306, 210, 326); g.lineTo(210, 390); g.closePath();
      g.clip('evenodd');
      for (let x = 36; x < 330; x += 9) brass(x - 1, 246, x + 1.2, 390);
      for (const yy of [276, 350]) brass(30, yy - 1.5, 330, yy + 1.5);
      g.strokeStyle = '#b8942e'; g.lineWidth = 1; g.beginPath(); for (let x = 36; x < 330; x += 18) { g.moveTo(x, 262); g.quadraticCurveTo(x + 4.5, 254, x + 9, 262); g.quadraticCurveTo(x + 13.5, 270, x + 18, 262); } g.stroke();
      g.restore();
      g.strokeStyle = '#b8942e'; g.lineWidth = 3; g.beginPath(); g.moveTo(150, 390); g.lineTo(150, 326); g.quadraticCurveTo(150, 306, 180, 306); g.quadraticCurveTo(210, 306, 210, 326); g.lineTo(210, 390); g.stroke();
      g.strokeStyle = 'rgba(255,240,190,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(151.5, 388); g.lineTo(151.5, 326); g.quadraticCurveTo(151.5, 308, 180, 308); g.stroke();
      // oak frame posts and cornice, with TELLER in gilt on a frosted transom
      for (const x of [24, 324]) boards(g, x, 230, x + 12, 392, '#7a5634', 12, x);
      boards(g, 18, 226, 342, 248, '#7a5634', 324, 7);
      g.fillStyle = '#5a3d24'; g.fillRect(16, 224, 328, 4);
      g.fillStyle = 'rgba(232,236,232,.85)'; g.fillRect(140, 230, 80, 15);
      bigText(g, 'TELLER', 180, 242, 11, '#9a7420');
      // the marble counter: a polished slab over a veined front with an oak plinth
      const sl = g.createLinearGradient(0, 388, 0, 398); sl.addColorStop(0, '#f6f2ea'); sl.addColorStop(1, '#c9c2b4');
      g.fillStyle = sl; g.fillRect(20, 388, 320, 10);
      const mf = g.createLinearGradient(0, 398, 0, 440); mf.addColorStop(0, '#d9d2c4'); mf.addColorStop(1, '#a9a191');
      g.fillStyle = mf; g.fillRect(28, 398, 304, 42);
      g.save(); g.beginPath(); g.rect(28, 398, 304, 42); g.clip();
      g.strokeStyle = 'rgba(110,104,96,.45)'; g.lineWidth = .8; g.beginPath();
      for (let k = 0; k < 16; k++) { const x = 28 + pr(k + 610) * 304, yy = 398 + pr(k + 611) * 40; g.moveTo(x, yy); g.bezierCurveTo(x + 14, yy + 6, x + 22, yy - 4, x + 40, yy + 8); }
      g.stroke();
      g.fillStyle = 'rgba(0,0,0,.14)'; for (let x = 28; x < 332; x += 76) g.fillRect(x, 398, 1.4, 42);
      g.restore();
      g.fillStyle = 'rgba(30,20,12,.35)'; g.fillRect(20, 398, 320, 3);
      boards(g, 26, 436, 334, 444, '#4a2f1b', 308, 17);
      // a bell on the counter
      g.fillStyle = '#c9a227'; g.beginPath(); g.ellipse(232, 384, 6, 4, 0, Math.PI, 0); g.fill(); g.fillStyle = '#3a3a3a'; g.fillRect(226, 384, 12, 2);
    });
  }
  // The banker's pedestal desk with its green-shaded lamp; the ledger and telephone sit on top.
  function bankDesk(y) {
    return cached(`bankDesk|${y < 1925}`, W, H, g => {
      g.fillStyle = 'rgba(30,20,12,.35)'; g.beginPath(); g.ellipse(684, 432, 136, 8, 0, 0, 7); g.fill();
      boards(g, 560, 360, 808, 430, '#5a3a22', 248, 61);
      for (const px of [568, 732]) {
        g.fillStyle = 'rgba(20,10,4,.3)'; g.fillRect(px, 366, 68, 58);
        for (const dy of [370, 388, 406]) {
          g.fillStyle = 'rgba(255,230,190,.1)'; g.fillRect(px + 4, dy, 60, 15);
          g.fillStyle = 'rgba(20,10,4,.25)'; g.fillRect(px + 4, dy + 15, 60, 1.5);
          g.fillStyle = '#c9a227'; g.fillRect(px + 30, dy + 6, 8, 2.4);
        }
      }
      g.fillStyle = 'rgba(20,10,4,.35)'; g.fillRect(640, 366, 88, 22);
      const top = g.createLinearGradient(0, 348, 0, 362); top.addColorStop(0, '#8a5e36'); top.addColorStop(.3, '#6e4628'); top.addColorStop(1, '#3e2614');
      g.fillStyle = top; g.fillRect(552, 348, 256, 14);
      g.fillStyle = '#2f5a3a'; g.fillRect(586, 340, 92, 10);
      g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(586, 340, 92, 2);
    });
  }
  function bankView(ctx, s, t, season) {
    const loc = DATA.locations.find(l => l.id === s.locId) || DATA.locations[0], y = s.year, electric = y >= 1915;
    const poster = (y >= 1917 && y <= 1919) ? ['BUY', 'LIBERTY', 'BONDS'] : (y >= 1942 && y <= 1945) ? ['BUY', 'WAR', 'BONDS'] : y === 1933 ? ['BANK', 'HOLIDAY', 'MARCH 6-13'] : null;
    ctx.drawImage(bankPlate(loc, y, season, poster), 0, 0);
    // the bank's name in gilt on the frieze board
    ctx.font = 'bold 20px Georgia'; const name = `FARMERS STATE BANK OF ${loc.town.toUpperCase()}`, btw = ctx.measureText(name).width;
    const nb = ctx.createLinearGradient(0, 64, 0, 92); nb.addColorStop(0, '#3a2414'); nb.addColorStop(1, '#22140a');
    ctx.fillStyle = nb; ctx.fillRect(W / 2 - btw / 2 - 14, 64, btw + 28, 28);
    ctx.strokeStyle = '#c9a227'; ctx.lineWidth = 1.2; ctx.strokeRect(W / 2 - btw / 2 - 10, 67, btw + 20, 22);
    bigText(ctx, name, W / 2, 84, 20, '#d9b24a');
    // the teller at his wicket, then the cage in front of him
    teller(ctx, 180, 388, t);
    ctx.drawImage(bankCage(), 0, 0);
    // the plat of the country around the farm, framed on the wall
    ctx.fillStyle = 'rgba(30,20,12,.3)'; ctx.fillRect(696, 110, 250, 192);
    ctx.drawImage(cached(`plat|${loc.id}|${s.land}`, 250, 192, g => { g.translate(-690, -104); platMap(g, s, loc, 690, 104, 250, 192); }), 690, 104);
    // the regulator's hands and pendulum
    const sw = Math.sin(t * Math.PI) * .16;
    ctx.save(); ctx.beginPath(); ctx.rect(626, 254, 26, 38); ctx.clip();
    ctx.translate(639, 250); ctx.rotate(sw);
    ctx.strokeStyle = '#b8942e'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 34); ctx.stroke();
    const bob = ctx.createRadialGradient(-1.5, 32, .5, 0, 34, 6); bob.addColorStop(0, '#fff2b8'); bob.addColorStop(1, '#a8842a');
    ctx.fillStyle = bob; ctx.beginPath(); ctx.arc(0, 34, 5, 0, 7); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#1e1e1e'; ctx.lineWidth = 1.4; ctx.beginPath();
    ctx.moveTo(639, 234); ctx.lineTo(639 + Math.cos(t * .05 - 1) * 10, 234 + Math.sin(t * .05 - 1) * 10);
    ctx.moveTo(639, 234); ctx.lineTo(639 + Math.cos(t * .004 + 2) * 6.5, 234 + Math.sin(t * .004 + 2) * 6.5); ctx.stroke();
    // lights: gas jets before 1915, then electric schoolhouse globes
    for (const [k, lx] of [181, 480, 612].entries()) {
      const f = electric ? 1 : .88 + Math.sin(t * 7 + k * 2) * .06 + Math.sin(t * 17 + k) * .04;
      ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lx, 54); ctx.lineTo(lx, electric ? 96 : 92); ctx.stroke();
      ctx.fillStyle = '#8a6a1e'; ctx.beginPath(); ctx.ellipse(lx, 56, 7, 2.4, 0, 0, 7); ctx.fill();
      const g = ctx.createRadialGradient(lx, 108, 2, lx, 120, 110 * f);
      g.addColorStop(0, electric ? 'rgba(255,248,214,.5)' : `rgba(255,204,120,${.42 * f})`); g.addColorStop(.4, electric ? 'rgba(255,244,210,.12)' : 'rgba(255,200,120,.1)'); g.addColorStop(1, 'rgba(255,230,160,0)');
      ctx.fillStyle = g; ctx.fillRect(lx - 110, 40, 220, 200);
      if (electric) {
        ctx.fillStyle = '#a88a3a'; ctx.fillRect(lx - 5, 94, 10, 5);
        const gl = ctx.createRadialGradient(lx - 3, 106, 1, lx, 110, 13); gl.addColorStop(0, '#fffbe8'); gl.addColorStop(.7, '#f4ecd2'); gl.addColorStop(1, '#d8cca8');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.ellipse(lx, 110, 12, 12, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(160,140,90,.5)'; ctx.lineWidth = .8; ctx.beginPath(); ctx.ellipse(lx, 113, 11, 3, 0, 0, Math.PI); ctx.stroke();
      } else {
        ctx.strokeStyle = '#8a6a1e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lx - 18, 98); ctx.quadraticCurveTo(lx, 108, lx + 18, 98); ctx.stroke();
        for (const d of [-16, 0, 16]) {
          const fy = d ? 96 : 104, fl = ctx.createRadialGradient(lx + d, fy - 3, .5, lx + d, fy - 2, 5);
          fl.addColorStop(0, '#fff6d0'); fl.addColorStop(.5, `rgba(255,190,90,${.9 * f})`); fl.addColorStop(1, 'rgba(255,160,60,0)');
          ctx.fillStyle = '#8a6a1e'; ctx.fillRect(lx + d - 2, fy, 4, 3);
          ctx.fillStyle = fl; ctx.beginPath(); ctx.ellipse(lx + d, fy - 3, 3 * f, 5.5 * f, 0, 0, 7); ctx.fill();
        }
      }
    }
    // the banker behind his desk, the ledger with your mortgage, the lamp, and the telephone of the day
    banker(ctx, 690, 352, t);
    ctx.drawImage(bankDesk(y), 0, 0);
    ctx.save(); ctx.translate(664, 352);
    // the ledger lying open on the blotter, pages fanning toward the viewer
    ctx.fillStyle = 'rgba(30,20,12,.3)'; ctx.fillRect(-60, -1, 124, 4);
    ctx.fillStyle = '#5a2a22'; shape(ctx, [[-64, 1], [64, 1], [58, -12], [-58, -12]]); ctx.fill();
    ctx.fillStyle = '#efe8d4'; shape(ctx, [[-60, -1], [0, 0], [0, -12], [-55, -13]]); ctx.fill();
    ctx.fillStyle = '#f6f0de'; shape(ctx, [[0, 0], [60, -1], [55, -13], [0, -12]]); ctx.fill();
    ctx.strokeStyle = 'rgba(120,100,70,.45)'; ctx.lineWidth = .5; ctx.beginPath(); for (let r = 0; r < 3; r++) { ctx.moveTo(4, -9.5 + r * 3); ctx.lineTo(54, -10 + r * 3); } ctx.stroke();
    ctx.font = 'bold 8px Georgia'; ctx.fillStyle = '#2b2b2b'; ctx.textAlign = 'center';
    ctx.fillText(`Mortgage ${dollars(s.debt)}`, -26, -3.5);
    ctx.restore();
    banker(ctx, 690, 352, t, 'hands');
    // the banker's lamp: brass stand and green cased-glass shade
    contactShadow(ctx, 578, 350, 14, 2.4);
    ctx.fillStyle = '#b8942e'; ctx.fillRect(576, 322, 4, 26); ctx.beginPath(); ctx.ellipse(578, 348, 10, 3, 0, 0, 7); ctx.fill();
    const shade = ctx.createLinearGradient(562, 0, 596, 0); shade.addColorStop(0, '#1e4a2c'); shade.addColorStop(.6, '#3f8a56'); shade.addColorStop(1, '#22502f');
    ctx.fillStyle = shade; ctx.beginPath(); ctx.moveTo(562, 324); ctx.quadraticCurveTo(578, 312, 596, 324); ctx.lineTo(594, 328); ctx.lineTo(564, 328); ctx.closePath(); ctx.fill();
    if (electric) { const lg = ctx.createRadialGradient(580, 334, 1, 580, 340, 34); lg.addColorStop(0, 'rgba(255,246,200,.5)'); lg.addColorStop(1, 'rgba(255,246,200,0)'); ctx.fillStyle = lg; ctx.fillRect(546, 326, 70, 30); }
    ctx.fillStyle = '#1e1e1e';
    if (y < 1925) {
      contactShadow(ctx, 748, 349, 10, 2);
      ctx.fillRect(745, 318, 4, 30); ctx.beginPath(); ctx.ellipse(747, 348, 8, 2.6, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(741, 312); ctx.lineTo(753, 312); ctx.lineTo(751, 320); ctx.lineTo(743, 320); ctx.closePath(); ctx.fill();
      ctx.fillRect(756, 320, 3, 13); ctx.beginPath(); ctx.ellipse(757.5, 334, 3, 2, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#1e1e1e'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(757, 320); ctx.quadraticCurveTo(762, 314, 752, 316); ctx.stroke();
    } else {
      contactShadow(ctx, 752, 350, 16, 2.4);
      ctx.beginPath(); ctx.ellipse(752, 346, 14, 6, 0, Math.PI, 0); ctx.lineTo(766, 348); ctx.lineTo(738, 348); ctx.fill();
      ctx.beginPath(); ctx.moveTo(738, 334); ctx.quadraticCurveTo(752, 328, 766, 334); ctx.lineTo(766, 337); ctx.lineTo(738, 337); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(742, 333, 20, 1);
    }
    // Nels on the customer's side, a lady at the wicket, and the hired men waiting at the door
    pedestrian(ctx, 262, 462, 3.05, t, 'woman', '#376d68', '#c5a5cc', -1, 0);
    pedestrian(ctx, 520, 482, 3.1, t, 'man', '#3b5998', '#d5dfe7', -1, 0);
    const hired = s.plan.hired || 0;
    for (let k = 0; k < Math.min(6, hired); k++) {
      pedestrian(ctx, 40 + k * 50, 506 + (k % 2) * 3, 2.75, t + k, 'man',
        ['#556b2f', '#8a3b2b', '#444', '#7a5a36', '#3b5998', '#6b4a8a'][k], ['#e6d9ba', '#365879', '#a8bdcc'][k % 3], 1, 0);
    }
    const visitor = patrol(t + 8, 365, 900, 27, 3);
    pedestrian(ctx, visitor.x, 496, 3.1, t, 'man', '#60764b', '#dfe5df', visitor.dir, visitor.walking);
    const lady = patrol(t + 30, 360, 920, 22, 4);
    pedestrian(ctx, lady.x, 526, 3.2, t + 2, 'woman', '#85465d', '#a0b7ca', lady.dir, lady.walking);
    ctx.font = 'bold 13px Georgia'; ctx.textAlign = 'center';
    const lab = hired ? `${hired} hired m${hired === 1 ? 'an' : 'en'} this year` : 'No hired men this year';
    const lw = ctx.measureText(lab).width;
    ctx.fillStyle = 'rgba(40,28,18,.75)'; ctx.fillRect(170 - lw / 2 - 8, 518, lw + 16, 20); ctx.fillStyle = '#f6ecd2'; ctx.fillText(lab, 170, 533);
    topSign(ctx, `${s.land} acres  ·  mortgage ${dollars(s.debt)}  ·  cash ${dollars(s.cash)}`);
  }

  // ---------- Harvest Plan: the grain harvest to come ----------
  const BINDER_COLORS = { Deering: '#c4572a', McCormick: '#b5352a', 'McCormick-Deering': '#a8302a' };
  const HARVEST_SPEED = 12, BUNDLE_CYCLE = 4.4, BUNDLE_RELEASE = 3.5, BUNDLE_FALL = .7;
  const BUNDLE_PULL_START = BUNDLE_RELEASE - .9, BUNDLE_PULL_END = BUNDLE_RELEASE - .5, BUNDLE_CARRY_START = BUNDLE_RELEASE - .35;
  const cycleAt = (t, period) => ((t % period) + period) % period;
  const dinnerPies = (pl) => ({ plain: 1, hearty: 3, legendary: 7 }[pl.dinner] || 2);
  const smoothStep = (p) => p * p * (3 - 2 * p);
  function cutOats(ctx, x, y, length, seed) {
    ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = '#97702c'; ctx.lineWidth = .7;
    for (let i = 0; i < 5; i++) {
      const yy = (i - 2) * 1.3, end = length - pr(seed + i) * 4;
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(end, yy - 1); ctx.stroke();
      ctx.strokeStyle = i % 2 ? '#f3d982' : '#cda44e';
      for (let k = 0; k < 3; k++) {
        const xx = end - k * 2.6;
        ctx.beginPath(); ctx.moveTo(xx - 2, yy - 1); ctx.lineTo(xx, yy - 3); ctx.lineTo(xx + 1.5, yy - 2); ctx.stroke();
      }
      ctx.strokeStyle = '#c9a355';
    }
    ctx.restore();
  }
  // A tied bundle (sheaf) lying in the stubble: butts to the left, heads to the right, twine in the middle
  function sheaf(ctx, x, y, sc = 1, angle = 0) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(sc, sc);
    ctx.fillStyle = '#9b752f'; ctx.beginPath(); ctx.moveTo(-13, -3); ctx.lineTo(-2, -2); ctx.lineTo(11, -5); ctx.lineTo(15, 2); ctx.lineTo(-2, 3); ctx.lineTo(-13, 4); ctx.closePath(); ctx.fill();
    cutOats(ctx, -13, 0, 27, 8);
    ctx.strokeStyle = '#f2d785'; ctx.lineWidth = .8;
    ctx.beginPath(); ctx.moveTo(-13, -2.5); ctx.lineTo(-2, -1.5); ctx.lineTo(7, -3); ctx.stroke();
    ctx.strokeStyle = '#71502b'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(-2, -3); ctx.quadraticCurveTo(0, 0, -2, 3.5); ctx.stroke();
    ctx.strokeStyle = '#e9d8a5'; ctx.lineWidth = .8;
    ctx.beginPath(); ctx.moveTo(-2.5, -3); ctx.quadraticCurveTo(-.5, 0, -2.5, 3.5); ctx.stroke();
    ctx.restore();
  }
  // The threshers' dinner table under a white cloth, with one pie per Classic dinner count.
  // One pie in its tin, 20 units across, seen slightly from above, centered at (px, py).
  function pie(c, px, py) {
    c.fillStyle = 'rgba(60,45,25,.25)'; c.beginPath(); c.ellipse(px, py + 1.5, 10, 2.4, 0, 0, 7); c.fill();
    c.fillStyle = '#8f8a82'; c.beginPath(); c.ellipse(px, py, 10, 3.6, 0, 0, Math.PI); c.fill();
    const crust = c.createRadialGradient(px + 2, py - 2, .5, px, py - .5, 9.5);
    crust.addColorStop(0, '#f0c27a'); crust.addColorStop(.7, '#c98a3e'); crust.addColorStop(1, '#8a5424');
    c.fillStyle = crust; c.beginPath(); c.ellipse(px, py - .8, 9.4, 3.4, 0, 0, 7); c.fill();
    c.strokeStyle = 'rgba(110,60,20,.55)'; c.lineWidth = .6; c.beginPath();
    for (const d of [-4, 0, 4]) { c.moveTo(px + d - 1.5, py - 2.2); c.lineTo(px + d + 1.5, py + .6); }
    c.stroke();
  }  // Ingrid in a blue dress and cream apron, her fair hair gathered up, standing beside the table (feet at y).
  // o.t makes her blink now and then; o.stir leaves off her right arm (on the left of the picture) so it can be
  // drawn separately, reaching for the paddle.
  function ingrid(ctx, x, y, o = {}) {
    lit(ctx, x - 14, y - 72, x + 14, y + 2, c => {
      c.save(); c.translate(x, y);
      c.fillStyle = '#2a1f18'; c.fillRect(-5, -3, 4, 3); c.fillRect(1, -3, 4, 3);
      const dress = c.createLinearGradient(-10, 0, 10, 0);
      dress.addColorStop(0, '#203654'); dress.addColorStop(.6, '#2f4f7a'); dress.addColorStop(1, '#466a96');
      c.fillStyle = dress;
      c.beginPath(); c.moveTo(-5, -50); c.lineTo(5, -50); c.quadraticCurveTo(7, -40, 6, -32); c.lineTo(10, -3); c.quadraticCurveTo(0, -1, -10, -3); c.lineTo(-6, -32); c.quadraticCurveTo(-7, -40, -5, -50); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(14,24,40,.4)'; c.lineWidth = .7; c.beginPath(); c.moveTo(-3, -30); c.lineTo(-5, -4); c.moveTo(2, -30); c.lineTo(3, -4); c.stroke();
      // gathered shoulders of the sleeves
      c.fillStyle = '#35588a'; for (const sd of [-1, 1]) { if (o.stir && sd < 0) continue; c.beginPath(); c.ellipse(sd * 5.6, -48.4, 2.2, 1.7, 0, 0, 7); c.fill(); }
      const apron = c.createLinearGradient(-6, 0, 6, 0); apron.addColorStop(0, '#ddd5c2'); apron.addColorStop(1, '#fbf7ec');
      c.fillStyle = apron; c.beginPath(); c.moveTo(-4, -46); c.lineTo(4, -46); c.lineTo(4.5, -33); c.lineTo(7, -6); c.lineTo(-7, -6); c.lineTo(-4.5, -33); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(150,138,112,.45)'; c.lineWidth = .35; c.beginPath(); c.moveTo(-2, -32); c.lineTo(-3.4, -7); c.moveTo(1.6, -32); c.lineTo(2.6, -7); c.stroke();
      c.fillStyle = 'rgba(160,150,130,.6)'; c.fillRect(-6.5, -34, 13, 1.2);
      // the arms in their sleeves, with the hands showing below the cuffs
      c.fillStyle = '#2f4f7a';
      if (!o.stir) { c.beginPath(); c.moveTo(-6, -48); c.lineTo(-9, -32); c.lineTo(-6.5, -31); c.lineTo(-4, -44); c.closePath(); c.fill(); }
      c.beginPath(); c.moveTo(6, -48); c.lineTo(9, -32); c.lineTo(6.5, -31); c.lineTo(4, -44); c.closePath(); c.fill();
      c.fillStyle = '#f1ece0'; if (!o.stir) c.fillRect(-9.2, -32.4, 2.8, .9); c.fillRect(6.4, -32.4, 2.8, .9);
      c.fillStyle = '#e2b996'; c.beginPath(); if (!o.stir) c.arc(-8, -30.5, 1.6, 0, 7); c.arc(8, -30.5, 1.6, 0, 7); c.fill();
      // the neck and a small white collar with a brooch
      c.fillRect(-1.3, -53, 2.6, 3);
      c.fillStyle = '#f3eee2'; c.beginPath(); c.moveTo(-3.4, -50.6); c.quadraticCurveTo(0, -48.6, 3.4, -50.6); c.lineTo(2.6, -49); c.quadraticCurveTo(0, -47.8, -2.6, -49); c.closePath(); c.fill();
      c.fillStyle = '#c9a34a'; c.beginPath(); c.arc(0, -48.6, .6, 0, 7); c.fill();
      const face = c.createRadialGradient(1.5, -58, .5, 0, -57, 5.5); face.addColorStop(0, '#f2cfae'); face.addColorStop(1, '#c99a78');
      c.fillStyle = face; c.beginPath(); c.ellipse(0, -57, 4.3, 5, 0, 0, 7); c.fill();
      // the hair: parted and drawn back over the ears into a braided bun
      c.fillStyle = '#d6b25c'; c.beginPath(); c.ellipse(-.3, -60.4, 4.9, 2.9, 0, Math.PI, 0); c.fill();
      c.beginPath(); c.ellipse(-4, -58, 1.5, 3.3, .2, 0, 7); c.ellipse(4, -58.2, 1.2, 3, -.2, 0, 7); c.fill();
      c.strokeStyle = 'rgba(140,100,40,.6)'; c.lineWidth = .3; c.beginPath();
      c.moveTo(-.6, -63.2); c.quadraticCurveTo(-3, -62, -4.4, -59); c.moveTo(-.6, -63.2); c.quadraticCurveTo(2.4, -62.2, 4.2, -59.6); c.moveTo(.6, -62.9); c.quadraticCurveTo(3.4, -61.4, 4.6, -58.4); c.stroke();
      c.fillStyle = '#c49c48'; c.beginPath(); c.arc(-3.2, -63.5, 2.6, 0, 7); c.fill();
      c.strokeStyle = 'rgba(120,84,30,.6)'; c.lineWidth = .35; c.beginPath(); for (const a of [-.6, .3, 1.2]) { c.moveTo(-3.2 + Math.cos(a + 2) * 2.4, -63.5 + Math.sin(a + 2) * 2.4); c.quadraticCurveTo(-3.2, -63.5, -3.2 + Math.cos(a) * 2.4, -63.5 + Math.sin(a) * 2.4); } c.stroke();
      c.fillStyle = 'rgba(255,240,190,.35)'; c.beginPath(); c.arc(-2.4, -64.3, 1, 0, 7); c.fill();
      // the face: brows, blue eyes that blink, rosy cheeks, the nose, and a small smile
      const shut = o.t === undefined ? 0 : blinkAt(o.t, 41);
      c.strokeStyle = 'rgba(150,108,50,.75)'; c.lineWidth = .35; c.beginPath(); c.moveTo(-2.6, -59.1); c.lineTo(-.9, -59.3); c.moveTo(.9, -59.3); c.lineTo(2.6, -59.1); c.stroke();
      for (const ex of [-1.7, 1.7]) {
        if (shut > .5) { c.strokeStyle = '#6a4a38'; c.lineWidth = .35; c.beginPath(); c.moveTo(ex - .7, -57.6); c.quadraticCurveTo(ex, -57.2, ex + .7, -57.6); c.stroke(); }
        else {
          c.fillStyle = '#fbf6ee'; c.beginPath(); c.ellipse(ex, -57.7, .78, .5 * (1 - shut), 0, 0, 7); c.fill();
          c.fillStyle = '#3d5f86'; c.beginPath(); c.arc(ex + .1, -57.7, .42 * (1 - shut * .6), 0, 7); c.fill();
          c.fillStyle = '#1e1a18'; c.beginPath(); c.arc(ex + .1, -57.7, .18, 0, 7); c.fill();
        }
      }
      c.fillStyle = 'rgba(214,110,96,.25)'; c.beginPath(); c.arc(-2.4, -55.6, 1.1, 0, 7); c.arc(2.4, -55.6, 1.1, 0, 7); c.fill();
      c.strokeStyle = 'rgba(150,96,70,.6)'; c.lineWidth = .3; c.beginPath(); c.moveTo(.2, -57.2); c.lineTo(.5, -55.8); c.lineTo(-.2, -55.6); c.stroke();
      c.strokeStyle = '#a5554a'; c.lineWidth = .4; c.beginPath(); c.moveTo(-1, -54.3); c.quadraticCurveTo(0, -53.7, 1, -54.3); c.stroke();
      c.restore();
    }, [x, y, 12, 2.2]);
  }
  // The camera follows the binder: landed bundles move with the stubble, never reset with a short tractor pass.
  function harvestBundles(ctx, t, bx, gy, sc) {
    const latest = Math.floor((t - BUNDLE_RELEASE) / BUNDLE_CYCLE);
    const count = Math.ceil((bx + 60) / (HARVEST_SPEED * BUNDLE_CYCLE)) + 1;
    for (let i = latest - count; i <= latest; i++) {
      const age = t - (i * BUNDLE_CYCLE + BUNDLE_RELEASE);
      const u = Math.min(1, age / BUNDLE_FALL), settle = Math.max(0, age - BUNDLE_FALL);
      const eased = smoothStep(u);
      const throwDistance = HARVEST_SPEED * BUNDLE_FALL + 22 * sc * (1 - Math.exp(-4 * BUNDLE_FALL));
      // Match the resting carrier's velocity at release, and the moving stubble's velocity at landing.
      const travel = throwDistance * eased + HARVEST_SPEED * BUNDLE_FALL * (u * u * u - u * u) + HARVEST_SPEED * settle;
      const x = bx - 29 * sc - travel;
      const floor = gy + 7, lift = settle < .24 ? 3 * Math.sin(settle / .24 * Math.PI) ** 2 : 0;
      const y = gy - 28 * sc + (28 * sc + 7) * u * u - 4 * Math.sin(u * Math.PI) ** 2 - lift;
      if (x < -30) continue;
      ctx.fillStyle = `rgba(83,61,29,${.1 + .14 * u})`;
      ctx.beginPath(); ctx.ellipse(x + 2, floor + 4, 12 + 5 * u, 2 + u, 0, 0, 7); ctx.fill();
      sheaf(ctx, x, y, sc * .95, -.18 * (1 - eased) + .28 * Math.sin(eased * Math.PI));
      if (age >= BUNDLE_FALL && settle < .4) {
        ctx.fillStyle = `rgba(232,210,157,${.35 * (1 - settle / .4)})`;
        for (let k = 0; k < 3; k++) {
          ctx.beginPath(); ctx.ellipse(x + (k - 1) * (5 + settle * 18), floor + 2 - settle * 8, 3 + settle * 5, 1 + settle * 3, 0, 0, 7); ctx.fill();
        }
      }
    }
  }
  // A Deering / McCormick grain binder from the stubble side, driving right: the canvas platform reaches back into the standing
  // grain with the sickle on its leading edge, a six-bat reel turns over it, the elevator carries the grain up over the bull wheel,
  // and the knotter deck ties the bundles and drops them from the bundle carrier.
  function grainBinder(ctx, t, run, color = '#b5352a', parked = false, spin = .9) {
    const D = [62, -34], frame = color, cloth = '#e9dcb6', ang = run ? t * 2.6 : 0;
    const phase = cycleAt(t, BUNDLE_CYCLE);
    const quad = (pts, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) ctx.lineTo(q[0], q[1]); ctx.closePath(); ctx.fill(); };
    const along = (p, f, ox = 0, oy = 0) => [p[0] + D[0] * f + ox, p[1] + D[1] * f + oy];
    const P0 = [0, -6], P1 = [38, -6];
    // platform: canvas apron reaching back into the grain, its slats creeping in toward the elevator
    const gw = along(P0, 1, 10, 2); wheel(ctx, gw[0], gw[1], 6, '#7d8387', run ? t * spin * 20 / 6 : 0, true);
    quad([along(P0, 0, 0, -8), along(P0, 1, 0, -8), along(P0, 1), P0], '#d9b77e');
    quad([P0, P1, along(P1, 1), along(P0, 1)], cloth);
    ctx.strokeStyle = 'rgba(110,80,40,.5)'; ctx.lineWidth = 1;
    for (let k = 0; k < 9; k++) { const f = (((k / 9) - (run ? t * .35 : 0)) % 1 + 1) % 1, a = along(P0, f), b = along(P1, f); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    if (run) {
      for (let k = 0; k < 7; k++) {
        const f = cycleAt(k / 7 - t * .35, 1), g = along(P0, f, 4, -2);
        ctx.save(); ctx.globalAlpha *= smoothStep(Math.min(1, f / .06, (1 - f) / .06));
        ctx.fillStyle = 'rgba(104,77,32,.16)'; ctx.beginPath(); ctx.ellipse(g[0] + 14, g[1] + 1, 16, 3, -.15, 0, 7); ctx.fill();
        cutOats(ctx, g[0], g[1], 28, k);
        ctx.restore();
      }
    }
    ctx.strokeStyle = frame; ctx.lineWidth = 2.4;
    let a = along(P0, 0, 0, -8), b = along(P0, 1, 0, -8); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    // sickle and guards along the leading edge, the outside divider and grain wheel
    a = P1; b = along(P1, 1);
    ctx.strokeStyle = '#4e5459'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    ctx.fillStyle = '#9aa0a5';
    for (let k = 0; k <= 12; k++) { const g = along(P1, k / 12); ctx.beginPath(); ctx.moveTo(g[0], g[1] - 1.2); ctx.lineTo(g[0] + 5, g[1] + .4); ctx.lineTo(g[0], g[1] + 1.6); ctx.closePath(); ctx.fill(); }
    const dv = along(P1, 1); ctx.fillStyle = frame; ctx.beginPath(); ctx.moveTo(dv[0] - 4, dv[1] - 3); ctx.lineTo(dv[0] + 12, dv[1]); ctx.lineTo(dv[0] - 4, dv[1] + 3); ctx.closePath(); ctx.fill();
    // the reel: two hubs on a long shaft, six wooden bats sweeping the grain onto the canvas
    const A = along(P1, .1, -14, -40), B = along(P1, .9, -14, -40), r = 22;
    ctx.strokeStyle = frame; ctx.lineWidth = 2;
    const post = along(P0, .9, 0, -8); ctx.beginPath(); ctx.moveTo(post[0], post[1]); ctx.lineTo(B[0], B[1]); ctx.moveTo(-6, -62); ctx.quadraticCurveTo(10, -66, A[0], A[1]); ctx.stroke();
    ctx.strokeStyle = '#5a5f66'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const an = ang + i * Math.PI / 3, ox = Math.cos(an) * r, oy = Math.sin(an) * r;
      ctx.strokeStyle = '#7a5a36'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(A[0] + ox, A[1] + oy); ctx.moveTo(B[0], B[1]); ctx.lineTo(B[0] + ox, B[1] + oy); ctx.stroke();
      ctx.strokeStyle = '#e8cf86'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(A[0] + ox, A[1] + oy); ctx.lineTo(B[0] + ox, B[1] + oy); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(122,90,54,.7)'; ctx.lineWidth = 1; for (const h of [A, B]) { ctx.beginPath(); ctx.arc(h[0], h[1], r, 0, 7); ctx.stroke(); }
    ctx.fillStyle = '#3a3a3a'; for (const h of [A, B]) { ctx.beginPath(); ctx.arc(h[0], h[1], 2.5, 0, 7); ctx.fill(); }
    // the elevator: two canvases carry the grain up and over the bull wheel
    quad([[-2, -6], [38, -6], [24, -64], [-16, -64]], frame);
    quad([[3, -10], [33, -10], [21, -60], [-11, -60]], cloth);
    ctx.strokeStyle = 'rgba(110,80,40,.55)'; ctx.lineWidth = 1;
    for (let k = 0; k < 6; k++) { const f = ((k / 6) + (run ? t * .5 : 0)) % 1, yy = -10 - f * 50, sh = f * 13; ctx.beginPath(); ctx.moveTo(3 - sh, yy); ctx.lineTo(33 - sh, yy); ctx.stroke(); }
    if (run) for (let k = 0; k < 4; k++) {
      const f = cycleAt(k / 4 + t * .5, 1);
      ctx.save(); ctx.globalAlpha *= smoothStep(Math.min(1, f / .08, (1 - f) / .08));
      cutOats(ctx, 3 - f * 14, -13 - f * 44, 26, k + 10);
      ctx.restore();
    }
    // bull wheel (the drive wheel under the elevator)
    wheel(ctx, 14, -20, 20, '#8f969b', run ? t * spin : 0, true);
    // binding deck sloping toward us, with the packers, the knotter, and the needle
    quad([[-16, -64], [24, -64], [12, -40], [-28, -40]], frame);
    quad([[-13, -61], [21, -61], [10, -43], [-24, -43]], '#d9b77e');
    if (run && phase < BUNDLE_RELEASE) {
      const bindTime = BUNDLE_PULL_START;
      const carry = Math.max(0, Math.min(1, (phase - BUNDLE_CARRY_START) / (BUNDLE_RELEASE - BUNDLE_CARRY_START)));
      const slide = smoothStep(carry), size = Math.min(1, phase / bindTime);
      sheaf(ctx, -4 - 25 * slide, -53 + 25 * slide, .95 * size, -.18 * slide);
    }
    ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 1.4;
    for (let k = 0; k < 3; k++) { const ph = run ? Math.sin(t * 5 + k * 2) * 3 : 0; ctx.beginPath(); ctx.moveTo(-8 + k * 9, -60); ctx.quadraticCurveTo(-6 + k * 9 + ph, -52, -12 + k * 9, -44); ctx.stroke(); }
    ctx.fillStyle = '#2b2b2b'; ctx.beginPath(); ctx.arc(-14, -50, 3.5, 0, 7); ctx.fill();
    const nd = run && phase < BUNDLE_PULL_START ? Math.sin(phase / BUNDLE_PULL_START * Math.PI) : 0;
    ctx.beginPath(); ctx.arc(-14, -38, 12, Math.PI * 1.05, Math.PI * (1.05 + .35 * nd)); ctx.stroke();
    // twine can, bundle carrier fingers, the driver's seat on its spring bar, and the tongue
    ctx.fillStyle = '#4a4a4a'; ctx.fillRect(16, -76, 8, 11); ctx.fillStyle = '#d9c99a'; ctx.beginPath(); ctx.ellipse(20, -76, 4, 1.5, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#4e5459'; ctx.lineWidth = 2;
    const tip = run && phase >= BUNDLE_RELEASE ? Math.sin(smoothStep(Math.min(1, (phase - BUNDLE_RELEASE) / .55)) * Math.PI) : 0;
    for (const fx of [-30, -24, -18]) { ctx.beginPath(); ctx.moveTo(fx + 6, -40); ctx.lineTo(fx - 2 - tip * 5, -26 + tip * 12); ctx.stroke(); }
    ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(-4, -30); ctx.quadraticCurveTo(-30, -38, -40, -58); ctx.stroke();
    ctx.fillStyle = '#2b2b2b'; ctx.beginPath(); ctx.ellipse(-42, -60, 7, 2.5, 0, 0, 7); ctx.fill();
    const pull = !run ? 0 : phase < BUNDLE_RELEASE
      ? smoothStep(Math.max(0, Math.min(1, (phase - BUNDLE_PULL_START) / (BUNDLE_PULL_END - BUNDLE_PULL_START))))
      : 1 - smoothStep(Math.max(0, Math.min(1, (phase - BUNDLE_RELEASE - .15) / .45)));
    const leverAngle = -1.49 - pull * .48, gripX = -26 + Math.cos(leverAngle) * 25, gripY = -43 + Math.sin(leverAngle) * 25;
    ctx.strokeStyle = '#546473'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-26, -43); ctx.lineTo(gripX, gripY); ctx.stroke();
    ctx.strokeStyle = '#c2cdd2'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#242b33'; ctx.beginPath(); ctx.arc(gripX, gripY, 2.3, 0, 7); ctx.fill();
    if (!parked) {
      ctx.strokeStyle = '#293b50'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-42, -61); ctx.lineTo(-35, -56); ctx.lineTo(-33, -47); ctx.stroke();
      ctx.fillStyle = '#385c81'; ctx.fillRect(-45 - pull * 2, -74, 7, 13);
      ctx.fillStyle = '#6e91ad'; ctx.fillRect(-44 - pull * 2, -73, 2, 9);
      ctx.strokeStyle = '#385c81'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-39 - pull * 2, -71); ctx.lineTo(-32 - pull * 3, -64); ctx.lineTo(gripX, gripY); ctx.stroke();
      ctx.fillStyle = '#e1b78c'; ctx.beginPath(); ctx.arc(gripX, gripY, 1.8, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(-41 - pull * 2, -78, 4, 0, 7); ctx.fill();
      ctx.fillStyle = '#5c4331'; ctx.fillRect(-47 - pull * 2, -82, 12, 2); ctx.fillRect(-45 - pull * 2, -86, 7, 5);
      ctx.lineCap = 'butt';
    }
    const tl = parked ? 70 : 112;
    ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(34, -18); ctx.lineTo(tl, parked ? -4 : -16); ctx.stroke();
    if (!parked) { ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(110, -24); ctx.lineTo(110, -8); ctx.stroke(); }
  }
  // `paint` is the optional painted-layer hook set from Painted (js/painted.js); null keeps the Classic drawing.
  function harvestView(ctx, s, t, paint = null) {
    // The season follows the game, as on the Fields tab: young green grain in spring, the binder at work in summer,
    // threshed stubble and a straw stack in fall, and snow over the stubble in winter. Painted art covers summer only.
    const season = paint ? 'summer' : seasonOf(s), pl = s.plan, working = season === 'summer', growing = season === 'spring';
    const { p, loc } = paint ? { p: PAL[season], loc: DATA.locations.find(l => l.id === s.locId) || DATA.locations[0] } : backdrop(ctx, s, 0, season);
    const small = (pl.crops.wheat || 0) + (pl.crops.oats || 0);
    const binder = ownsType(s, 'binder'), pw = ownedPower(s).find(x => x.m.kind !== 'steam');
    // F-20 wheelbase calibrated against the six-foot cutter; see the dimension references in the developer notes.
    const fx1 = 720, sc = 1.5, gy = 476, tractorScale = 3.4;
    const tractorWidth = pw ? yardSize(pw.m, pw.o.built || pw.o.bought)[0] * tractorScale * 1.1 : 0;
    const tractorX = 112 + (tractorWidth / 2 + 4) / sc;
    const bx = pw ? Math.min(300, fx1 - 8 - 112 * sc - 4 - tractorWidth) : 300;
    const distance = small && working ? t * HARVEST_SPEED : 0;
    // The painted standing oats replace drawn stalks (in Classic and Painted) when oats lead the small-grain plan.
    const oatsFirst = !!(small && working && oatsLead(pl));
    const standing = small && (working || growing);
    if (!paint) meadow(ctx, 0, 300, W, H - 300, p.near);
    // The farmyard is a fixed panel; only the field panel follows the harvesting crew.
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, fx1, H); ctx.clip();
    const [fy, fa, ff, fl] = loc.look.far;
    if (paint) paint.backdrop(ctx, { distance, fx1, small, t });
    else {
      sky(ctx, season, t);
      distantBluffs(ctx, season, fy - 10 - fa - 22, distance * .08, fx1);
      ridge(ctx, fy - 10, fa, ff, 1.3, p.far, fl, distance * .15, fx1);
      ridge(ctx, fy + 40, fa * .6, ff * 1.5, 4.2, p.mid, fl, distance * .35, fx1);
      meadow(ctx, 0, 300, fx1, H - 300, p.near, distance * .6);
    }
    const fieldTop = paint ? paint.fieldTop : 300;
    const G = growing
      ? { field: '#6f9a45', head: '#5f8a3a', dark: '#5d8a3c', light: '#9cc66a', leaf: '#79a84c', kernels: ['#86b25a', '#b4d67c'], tall: .6 }
      : { field: '#d9b44a', head: '#b8902e', dark: '#ac873d', light: '#e5c46e', leaf: '#b79a49', kernels: ['#d6b761', '#f4dda0'], tall: 1 };
    const gold = G.field, head = G.head;
    const grain = (x0, x1, y0, y1, cutEdge = false) => {
      if (x1 <= x0) return;
      ctx.fillStyle = gold;
      if (cutEdge) {
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y1); ctx.lineTo(bx + 38 * sc, y1); ctx.closePath(); ctx.fill();
      } else ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      for (let yy = y0 + 7; yy < y1; yy += 10) {
        const left = cutEdge ? bx + 38 * sc + (gy - 6 * sc - yy) * 62 / 34 : x0;
        const stalks = [];
        for (let k = Math.ceil((left + distance) / 8); k * 8 - distance < x1; k++) {
          const xx = k * 8 - distance, seed = k + yy * 17;
          const height = ((cutEdge ? 54 : 26 + (yy - y0) * .22) + pr(seed) * 12) * G.tall;
          const sway = Math.sin(t * 1.4 + k * .7 + yy) * 2.2, top = yy - height, tipX = xx + sway;
          stalks.push({ x: xx, height, tipX, top, light: pr(seed + 1) > .5 });
        }
        // Keep depth ordering by row, but submit each color as one path instead of thousands of tiny strokes.
        ctx.lineWidth = 1;
        for (const light of [false, true]) {
          ctx.strokeStyle = light ? G.light : G.dark; ctx.beginPath();
          for (const o of stalks) if (o.light === light) {
            ctx.moveTo(o.x, yy); ctx.quadraticCurveTo(o.x - 2, yy - o.height * .6, o.tipX, o.top);
          }
          ctx.stroke();
        }
        ctx.strokeStyle = G.leaf; ctx.beginPath();
        for (const o of stalks) {
          ctx.moveTo(o.x, yy - o.height * .35); ctx.quadraticCurveTo(o.x - 6, yy - o.height * .6, o.x - 7, yy - o.height * .52);
        }
        ctx.stroke();
        ctx.strokeStyle = head; ctx.beginPath();
        for (const o of stalks) for (let j = 0; j < 3; j++) {
          const py = o.top + j * 4, side = j % 2 ? -1 : 1, px = o.tipX + side * (4 + j);
          ctx.moveTo(o.tipX, py); ctx.lineTo(px, py + 1); ctx.lineTo(px, py + 4);
        }
        ctx.stroke();
        for (let shade = 0; shade < 2; shade++) {
          ctx.fillStyle = G.kernels[shade]; ctx.beginPath();
          for (const o of stalks) for (let j = shade; j < 3; j += 2) {
            const py = o.top + j * 4 + 4, side = j % 2 ? -1 : 1, px = o.tipX + side * (4 + j), angle = -.25 * side;
            ctx.moveTo(px + Math.cos(angle) * 1.3, py + Math.sin(angle) * 1.3);
            ctx.ellipse(px, py, 1.3, 2.4, angle, 0, Math.PI * 2);
          }
          ctx.fill();
        }
      }
    };
    // standing grain beyond the swath, stubble where the binder has been, and the swath still to cut ahead of it
    const edge = gy - 40 * sc;
    const cut = [bx + 38 * sc, gy - 6 * sc, bx + 100 * sc, edge];
    const paintedOats = oatsFirst && (paint ? paint.standingOats(ctx, { distance, t, fx1, cut }) : standingOats(ctx, { distance, t, fx1, cut, deep: true }));
    if (standing && !paintedOats) grain(0, fx1, fieldTop + 14, edge);
    if (!paint) {
      // a headland below the grain; after threshing the whole field is stubble (under snow in winter)
      const groundTop = small && !standing ? fieldTop + 14 : edge;
      const ground = { spring: '#7fae58', summer: small ? '#cdb46c' : '#8cab5a', fall: small ? '#c3a865' : p.near, winter: p.ground }[season];
      meadow(ctx, 0, groundTop, fx1, H - groundTop, ground, distance);
      ctx.strokeStyle = { spring: 'rgba(70,110,40,.5)', winter: 'rgba(130,120,95,.35)' }[season] || 'rgba(150,120,50,.5)'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let yy = groundTop + 6; yy < H; yy += 7) for (let xx = (yy % 2) * 3 - cycleAt(distance, 8); xx < fx1; xx += season === 'winter' ? 21 : 8) { ctx.moveTo(xx, yy); ctx.lineTo(xx - 1, yy - 4); }
      ctx.stroke();
    }
    if (small && working && !paintedOats) {
      ctx.fillStyle = '#b8902e'; ctx.fillRect(0, edge, Math.min(fx1, bx + 38 * sc), 5);
      grain(bx + 100 * sc, fx1, edge, gy - 6 * sc, true);
      ctx.strokeStyle = '#9d7d3b'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(bx + 38 * sc, gy - 6 * sc); ctx.lineTo(bx + 100 * sc, edge); ctx.stroke();
    }
    // the binder at work behind three horses or your tractor (in spring the crew waits at the headland);
    // Classic lights the whole hitch as one group
    if (small && !standing) {
      // threshed: the straw stack stands where the rig set up
      const size = Math.min(1.5, .55 + small / 60);
      strawStack(ctx, 430, 470, size, season);
      strawStack(ctx, 250, 432, size * .55, season);
    }
    if (standing) {
      const crew = (c) => {
        c.save(); c.translate(bx, gy); c.scale(sc, sc);
        grainBinder(c, t, working, BINDER_COLORS[binder ? binder.brand : 'McCormick'], false, working ? HARVEST_SPEED / (20 * sc) : 0);
        if (pw) {
          const painted = paint && paint.tractor(c, { pw, t, sc, gy, bx, tractorX, tractorWidth, hitch: [112, -16] });
          if (!painted) {
            c.strokeStyle = '#4e5459'; c.lineWidth = 2.2;
            c.beginPath(); c.moveTo(112, -16); c.lineTo(tractorX - tractorWidth / (4 * sc), -16); c.stroke();
            machine(c, pw.m.id, tractorX, 0, tractorScale / sc, working ? t * HARVEST_SPEED / (18 * tractorScale) : t, working ? 'drive' : 'idle', pw.o.built || pw.o.bought);
          }
        }
        else { for (let k = 0; k < 3; k++) horse(c, 126 + k * 6, -12 + k * 5, 1, t, k, working); }
        if (!binder) bigText(c, 'custom binder crew', 20, 12, 9, '#5a3a20');
        c.restore();
      };
      if (paint) crew(ctx);
      else lit(ctx, bx - 82 * sc, gy - 104 * sc, fx1, gy + 16, crew, [(bx + fx1) / 2 - 20, gy + 3, (fx1 - bx) / 2 + 20, 7]);
      if (working) harvestBundles(ctx, t, bx, gy, sc);
    }
    particles(ctx, season, t, s);
    ctx.restore();
    if (paint) paint.farmyard(ctx, s, t, { small, fx1 });
    else {
      // the same farmyard as the Fields view, with the rig waiting, or in fall Ingrid's threshers' dinner before it
      farmyard(ctx, s, t, season, [], { harvest: true, small, finish: false });
      ctx.fillStyle = '#6b5135'; ctx.fillRect(fx1 - 2, 0, 3, H);
      ctx.fillStyle = '#d8c49a'; ctx.fillRect(fx1 + 1, 0, 1, H);
    }
    const dn = { plain: 'plain', hearty: 'hearty', legendary: 'legendary' }[pl.dinner] || '';
    const sign = { spring: `${small} acres of small grain sown, to bind and thresh in July`, summer: `${small} acres of small grain to bind and thresh`,
      fall: `${small} acres of small grain bound and threshed`, winter: `${small} acres of small grain in the plan` }[season];
    topSign(ctx, small ? `${sign}  ·  a ${dn} threshers' dinner` : 'No small grain planned this year');
  }

  function scene(ctx, s, t, opts = {}) {
    sceneBody(ctx, s, t, opts);
    // Painted harvest layers keep their own color; every Classic scene gets the painterly finish.
    if (!opts.paint) finish(ctx, opts.season || seasonOf(s));
  }
  // A landscape backdrop for the mini-game yards (w x h): sky, two wooded ridges, big yard trees, and ground from groundY down.
  // o.bleed paints that many extra pixels on every side, for yards that shake.
  function plate(ctx, w, h, season, groundY, o = {}) {
    const b = o.bleed || 0;
    if (b) {
      ctx.save(); ctx.translate(-b, -b);
      try { plate(ctx, w + 2 * b, h + 2 * b, season, groundY + b, { ...o, bleed: 0, trees: (o.trees || []).map(([x, ht, i]) => [x + b, ht, i]) }); }
      finally { ctx.restore(); }
      return;
    }
    const p = PAL[season];
    sky(ctx, season, 0, { w, h, horizon: groundY, sunX: Math.round(w * .82), sunY: Math.round(h * .17), clouds: 4, overcast: o.overcast, cloudBand: .45 });
    distantBluffs(ctx, season, groundY - 112, 0, w);
    hill(ctx, (x) => groundY - 70 - 22 * Math.sin(x * .008 + 1.3) - 8 * Math.sin(x * .03), o.far || p.far, 0, w, groundY + 6, groundY - 100, 100);
    hill(ctx, (x) => groundY - 24 - 9 * Math.sin(x * .013 + 4) - 4 * Math.sin(x * .05), o.mid || p.mid, 0, w, groundY + 6, groundY - 40, 50);
    ctx.beginPath(); ctx.rect(0, groundY, w, h - groundY); groundFill(ctx, o.ground || p.ground, groundY, h);
    for (const [x, height, i] of o.trees || []) {
      const r = height / 2.3;
      if (season === 'winter') tree(ctx, x, groundY - r * .9, r, p.trees[0], season, i || 0);
      else oak(ctx, x, groundY - r * .8, r * .7, p.trees[(i || 0) % p.trees.length], season);
    }
  }

  function sceneBody(ctx, s, t, opts = {}) {
    const season = opts.season || seasonOf(s);
    if (opts.view === 'shed' && s) { machineYard(ctx, s, t, season); return; }
    if (opts.view === 'dairy' && s) { dairyBarn(ctx, s, t, season); return; }
    if (opts.view === 'market' && s) { marketTown(ctx, s, t, season); return; }
    if (opts.view === 'woodlot' && s) { woodlotView(ctx, s, t, season); return; }
    if (opts.view === 'bank' && s) { bankView(ctx, s, t, season); return; }
    if (opts.view === 'yard' && s) { yardWide(ctx, s, t, season); return; }
    if (opts.view === 'harvest' && s) { harvestView(ctx, s, t, opts.paint || null); return; }
    const p = PAL[season], open = season !== 'winter';
    const year = s ? s.year : opts.year || 1900;
    const loc = DATA.locations.find(l => l.id === (s ? s.locId : opts.locId)) || DATA.locations[0];
    const look = loc.look || {}, has = (e) => (look.extras || []).includes(e);
    const [fy, fa, ff, fl] = look.far || [215, 40, .006, 2.5];
    const [my, ma, mf, ml] = look.mid || [250, 55, .009, 3];
    const farY = (x) => ridgeY(x, fy, fa, ff, 1.3, fl), midY = (x) => ridgeY(x, my, ma, mf, 4.2, ml);
    sky(ctx, season, t);
    distantBluffs(ctx, season, fy - fa - 22);
    ridge(ctx, fy, fa, ff, 1.3, p.far, fl);
    if (has('tobacco')) { farShed(ctx, 560, farY(575) + 7); farShed(ctx, 650, farY(665) + 8); }
    if (has('skijump') && year >= 1923) skiJump(ctx, 430, farY, season);
    // woods thin out as you cut more than they grow
    const kind = look.trees || 'hardwood';
    const wf = s ? Math.max(.3, Math.min(1, s.timber / Math.max(1, Sim.timberMax(s)))) : .8;
    const plant = (n, yAt, skip) => {
      const count = Math.round(n * (.4 + .6 * wf));
      for (let i = 0; i < count; i++) {
        const x = pr(i) * W;
        if (skip && skip(x)) continue;
        const y = yAt(x, i), r = (kind === 'dense' ? 6 : 7) + pr(i + 3) * 6, c = p.trees[i % p.trees.length];
        if (kind === 'pine' || (kind === 'mixed' && i % 3 === 0)) pine(ctx, x, y, r * 1.1, season);
        else if (kind === 'savanna') oak(ctx, x, y, r * 1.3, c, season);
        else tree(ctx, x, y, r, c, season, i);
      }
    };
    const treeN = { dense: 100, sparse: 36, savanna: 14 }[kind] || 70;
    if (look.distant) {
      const [wy, wh] = look.distant;
      distantWater(ctx, wy, wh, season, t);
      if (has('brewery')) brewery(ctx, 700, wy + 1, t);
      if (has('logs') && open && year < 1915) floatingLogs(ctx, wy, wh, t);
      if (has('steamboat') && open) steamboat(ctx, ((t * 9) % (W + 260)) - 160, wy + wh * .5 + 3, t, year >= 1930);
      if (has('mountain')) island(ctx, 560, wy + wh * .75, season, p);
      if (has('lockdam') && year >= 1936) lockDam(ctx, 790, wy, wh);
      if (has('highbridge')) highBridge(ctx, wy, wh, year);
      ctx.fillStyle = p.mid; ctx.fillRect(0, wy + wh, W, H - wy - wh);
      if (has('train')) train(ctx, wy + wh + 5, t, year);
      const town = has('rivertown');
      if (town) riverTown(ctx, wy + wh + 3, year, season);
      plant(treeN * .45, (x, i) => wy + wh + 14 + pr(i + 7) * 12, town ? (x) => x > 285 && x < 670 : null);
    } else {
      ridge(ctx, my, ma, mf, 4.2, p.mid, ml);
      const nb = has('contourNeighbors'), ch = has('church');
      if (nb) neighborSlope(ctx, midY, season, year);
      if (ch) { ctx.save(); ctx.translate(300, midY(300) + 8); ctx.scale(1.4, 1.4); church(ctx, 0, 0); ctx.restore(); }
      plant(treeN, (x, i) => midY(x) + 8 + pr(i + 7) * 30, (x) => (nb && x > 505 && x < 805) || (ch && x > 280 && x < 325));
    }
    bluff(ctx, look.bluff || 'limestone', season);
    if (has('sugarloaf')) sugarLoaf(ctx, 40, 200, season);
    ctx.beginPath(); ctx.moveTo(0, 300); ctx.quadraticCurveTo(300, 255, 640, 280); ctx.quadraticCurveTo(820, 290, W, 285); ctx.lineTo(W, H); ctx.lineTo(0, H);
    groundFill(ctx, p.near, 260, H);
    // In a game the fields run the full width; the farmstead has its own Buildings tab. The title preview keeps it.
    const farmstead = !s;
    fields(ctx, s, season, t, !farmstead);
    meadow(ctx, 0, 462, W, 80, p.pasture);
    if (look.water === 'creek') creek(ctx, season, t);
    else if (look.water === 'millpond') millpond(ctx, season, t);
    else river(ctx, season, t);
    if (has('marsh')) marsh(ctx, season);
    if (has('fisherman') && open) fisherman(ctx, t);
    // farmstead; with opts.paintedYard the painted renderer draws the yard right of x=720 instead
    const b = s ? s.buildings : {}, yard = farmstead && !opts.paintedYard;
    if (farmstead) {
      if (b.electricity) poles(ctx);
      if (b.tobacco_shed && yard) tobaccoShed(ctx, 640, 360);
      house(ctx, 650, 345, season, t);
      if (yard) barn(ctx, 760, 320, s);
      if (b.silo && yard) silo(ctx, 920, 300);
      if (b.cheese_house && yard) cheeseHouse(ctx, 690, 425);
      if (b.windmill && yard) windmill(ctx, 905, 325, t);
      // mailbox
      ctx.fillStyle = '#5a4535'; ctx.fillRect(620, 440, 3, 16); ctx.fillStyle = '#777'; ctx.fillRect(612, 433, 18, 9);
      ctx.fillStyle = '#fff'; ctx.font = '5px Arial'; ctx.textAlign = 'center'; ctx.fillText('N.KNUTSON', 621, 440);
      woodpile(ctx, 634, 430, s ? s.store.wood : 6, season);
      if (yard) lumberPile(ctx, 900, 490, s ? s.store.lumber : 0, season);
    }
    // machinery: plow with your best tractor; at threshing show the rig actually on the belt
    const rank = (x) => (x.m.kind === 'steam' ? 0 : 1000) + x.m.hp;
    const owned = s ? s.machines.map(o => ({ o, m: DATA.machines.find(q => q.id === o.id) })).filter(x => x.m && x.m.type === 'power').sort((a, c) => rank(c) - rank(a)) : [];
    const yr = (x) => x.o.built || x.o.bought;
    let inUse = null;
    if (season === 'spring') {
      inUse = owned[0] || null;
      const plowTime = inUse ? t / 3 : t;
      const px = 100 + ((plowTime * 25) % (farmstead ? 480 : 760)), py = 330 + Math.sin(plowTime * .2) * 3;
      // the field is mid-distance, so the tractor is drawn smaller than the machines parked by the barn
      if (inUse) {
        const m = inUse.m, sc = .8, steam = m.kind === 'steam', L = steam ? null : lookOf(m, yr(inUse));
        const k = steam ? 1 : (.72 + m.hp / 85) * (L.st === 'utility' ? .92 : L.st === 'frame' ? 1.08 : 1);
        const n = steam ? 6 : m.hp < 18 ? 2 : m.hp < 30 ? 3 : 4, mounted = !steam && L.st === 'utility';
        const hx = px - (steam ? 34 : 24 * k) * sc, hy = py - (steam ? 8 : 4 * k) * sc;
        furrows(ctx, 110, hx - plowLength(n, mounted) + 4, py, 3 + n);
        plow(ctx, hx, hy, py, n, plowTime, steam ? '#9b2d22' : L.body, mounted);
        machine(ctx, m.id, px, py, sc, plowTime, 'drive', yr(inUse));
      } else {
        furrows(ctx, 110, px - 34, py + 15, 4);
        walkingPlow(ctx, px - 12, py + 2, py + 15, t);
        horse(ctx, px, py, 1, t, 0); horse(ctx, px + 4, py + 6, 1, t, 1); person(ctx, px - 36, py - 2, '#a5493c', '#d9c07a');
      }
    } else if (season === 'fall' && s && s.season && s.season.smallBu > 0) {
      const rig = Sim.rigFor(s, 'thresh');
      strawStack(ctx, 640, 455, Math.min(1.4, s.season.smallBu / 3000), season);
      const sx = 560, sy = 452;
      separator(ctx, sx, sy, rig.sepBody, t, true, rig.sepBrand, false);
      const P = machine(ctx, rig.powerId, sx - 135, sy, 1.3, t, 'belt', rig.powerYear);
      belt(ctx, P.x, P.y, sx - 34, sy - 28, t, { r1: P.r, r2: 6 });
      for (let k = 0; k < 4; k++) person(ctx, sx - 60 + k * 22, sy - 2 + (k % 2) * 4, ['#3b5998', '#8a3b2b', '#556b2f', '#444'][k]);
      inUse = owned.find(x => x.m.id === rig.powerId) || null;
    }
    // (the wood work, the saw rig and its power, is pictured on the Woodlot tab)
    const parked = owned.filter(x => x !== inUse).slice(0, 2);
    if (opts.report) opts.report.parked = parked.map(x => ({ id: x.m.id, year: yr(x) }));
    if (yard) parked.forEach((x, i) => machine(ctx, x.m.id, [885, 800][i], 452, 1.2, t, 'idle', yr(x)));
    // livestock
    const nCows = s ? Math.min(14, s.cows) : 8;
    if (season !== 'winter') {
      const nH = s ? Math.min(4, s.horses) : 2, showHorses = season !== 'spring' || owned.length;
      const pasture = herdAt(s, t, nCows, showHorses ? nH : 0);
      pasture.cows.forEach((a, i) => { if (!a.gone) cow(ctx, a.x, a.y, a.dir, t, i, i % 5 === 3, a.walk); });
      pasture.horses.forEach((a, i) => { if (!a.gone) horse(ctx, a.x, a.y, a.dir, t * .55, i, a.walk, smoothStep(1 - a.walk)); });
    } else if (yard) {
      person(ctx, 840, 420, '#6d8fb4', '#cdb06a');
    }
    if (yard) person(ctx, 735, 395, '#a5493c', '#d9c07a');
    particles(ctx, season, t, s);
    if (season === 'winter') { ctx.fillStyle = 'rgba(200,215,235,.12)'; ctx.fillRect(0, 0, W, H); }
  }

  // ---------- the home farmyard beside the Fields view ----------
  // A close view of the home place, composed after the selected winter farmyard painting: a red gambrel bank barn on a
  // fieldstone basement with its earthen ramp, a big yard tree, and the table in the yard. It is drawn the Classic way so
  // it matches the homestead landscape to its left. Plate coordinates run 0-240 across, starting at canvas x = 720.
  const YARD_X = 720, YARD_W = 240;
  const YARD_DIRT = { spring: '#76654d', summer: '#a08862', fall: '#94795a', winter: '#857463' };
  // Parked machines: [x, ground y, scale]; then the lumber pile, Nels, and the hens, all in plate coordinates.
  // People are drawn at their real size for where they stand: Nels about 6 ft and Ingrid about 5 ft 5 in, against a 6-ft table.
  const YARD_SLOTS = Object.freeze({ parked: [[52, 480, .85], [140, 500, .85]], lumber: [176, 534], nels: [212, 452, 3.3], hand: [118, 412, 2.9],
    hens: [[118, 318], [142, 324], [166, 316]] });
  // Pie positions on the yard table for a plain, hearty, or legendary dinner (1, 3, or 7 pies).
  const YARD_PIES = Object.freeze({ 1: [[137, 352]], 2: [[122, 352], [152, 352]], 3: [[110, 352], [137, 352], [164, 352]],
    7: [[106, 347], [127, 347], [148, 347], [169, 347], [116, 356], [137, 356], [158, 356]] });
  const BARN = Object.freeze({
    gable: [[52, 263], [52, 214], [60, 185], [96, 154], [132, 185], [140, 214], [140, 263]],
    rake: [[46, 218], [57, 184], [96, 150], [135, 184], [146, 218]],
    ridge: [[96, 150], [246, 158]], knee: [[135, 184], [246, 190]], eave: [[146, 218], [246, 223]],
  });
  const WHITE = '#efe9dc';
  function shape(g, pts) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) g.lineTo(p[0], p[1]); g.closePath(); }
  function line(g, pts) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) g.lineTo(p[0], p[1]); g.stroke(); }
  // Snow lying on a roof or ledge: the current path filled bright at the top, cooler and bluer lower down.
  function snowFill(g, y0, y1) {
    const sg = g.createLinearGradient(0, y0, 0, y1);
    sg.addColorStop(0, '#fdfeff'); sg.addColorStop(1, '#d9e1ea');
    g.fillStyle = sg; g.fill();
  }
  function yardBackground(g, season) {
    const p = PAL[season], snow = season === 'winter';
    hill(g, (x) => 228 - 9 * Math.sin(x * .028 + .6) - 4 * Math.sin(x * .09), p.far, 0, YARD_W, 300, 212, 60);
    for (let i = 0; i < 10; i++) tree(g, 2 + i * 6.5 + pr(i + 40) * 4, 251 + pr(i + 41) * 5, 3.5 + pr(i + 42) * 2.5, p.trees[i % p.trees.length], season, i + 2);
    hill(g, (x) => 258 - 5 * Math.sin(x * .02 + 2), snow ? '#e8edf1' : p.mid, 0, YARD_W, 300, 250, 30);
    // a rail fence along the far field
    g.strokeStyle = '#5b4a3c'; g.lineWidth = 1.1;
    for (let x = 2; x < 56; x += 11) line(g, [[x, 266 - x * .05], [x, 276 - x * .05]]);
    g.lineWidth = .8; line(g, [[0, 268], [58, 265]]); line(g, [[0, 272.5], [58, 269.5]]);
    if (snow) { g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = .8; line(g, [[0, 267.3], [58, 264.3]]); }
  }
  function yardGround(g, season) {
    const p = PAL[season], snow = season === 'winter';
    shape(g, [[-4, 268], [YARD_W + 4, 262], [YARD_W + 4, H + 4], [-4, H + 4]]);
    groundFill(g, snow ? '#f2f5f7' : p.ground, 262, H);
    if (snow) {
      // drifts: long soft blue hollows across the snow
      for (let k = 0; k < 9; k++) {
        const y = 320 + k * 26 + pr(k + 80) * 12, x = pr(k + 81) * YARD_W, rx = 50 + pr(k + 82) * 60, gr = g.createRadialGradient(x, y, 0, x, y, rx);
        gr.addColorStop(0, 'rgba(120,142,175,.16)'); gr.addColorStop(1, 'rgba(120,142,175,0)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rx, 7 + pr(k + 83) * 6, 0, 0, 7); g.fill();
      }
    } else {
      // the worn dirt yard in front of the barn
      shape(g, [[-4, 300], [YARD_W + 4, 298], [YARD_W + 4, 322], [204, 334], [130, 340], [60, 352], [-4, 372]]);
      const dg = g.createLinearGradient(0, 298, 0, 372);
      dg.addColorStop(0, tone(YARD_DIRT[season], .08)); dg.addColorStop(1, tone(YARD_DIRT[season], -.1));
      g.save(); g.clip(); g.fillStyle = dg; g.fillRect(-4, 290, YARD_W + 8, 90);
      g.globalAlpha = .7; g.fillStyle = patternFor(g, 'mottle', mottle); g.fillRect(-4, 290, YARD_W + 8, 90);
      g.restore();
      // ragged grass edge where the yard gives way to sod
      g.strokeStyle = rgba(tone(p.ground, -.15), .6); g.lineWidth = .8; g.beginPath();
      for (let x = 0; x < YARD_W; x += 3) { const y = x < 60 ? 372 - x * .33 : x < 130 ? 352 - (x - 60) * .17 : x < 204 ? 340 - (x - 130) * .08 : 334 - (x - 204) * .33; g.moveTo(x, y + 1); g.lineTo(x + (pr(x) - .5) * 2, y - 2 - pr(x + 1) * 3); }
      g.stroke();
    }
    // wheel tracks from the field lane to the stable doors
    g.lineCap = 'round';
    for (const [dy, a] of [[0, .5], [12, .42]]) {
      g.strokeStyle = snow ? `rgba(122,104,86,${a * .45})` : `rgba(70,52,34,${a * .7})`; g.lineWidth = snow ? 3.4 : 2;
      g.beginPath(); g.moveTo(-4, 330 + dy); g.bezierCurveTo(50, 318 + dy, 110, 306 + dy * .5, 176, 302 + dy * .3); g.stroke();
      if (snow) { g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-4, 328 + dy); g.bezierCurveTo(50, 316 + dy, 110, 304 + dy * .5, 176, 300 + dy * .3); g.stroke(); }
    }
  }
  function yardBarn(g, s, season) {
    const snow = season === 'winter', red = '#9c2b25', roof = '#5b5550', b = s ? s.buildings : {}, B = BARN;
    // a barn addition: a lower wing on the far side of the ramp, its shed roof sloping away from the barn
    const n = Math.min(3, b.barn_addition || 0);
    if (n) {
      const x0 = 52 - 18 - 11 * n;
      stones(g, x0, 262, 53, 296, 51);
      g.save(); shape(g, [[x0, 243], [52, 224], [52, 263], [x0, 263]]); g.clip(); boards(g, x0 - 2, 222, 54, 264, tone(red, -.14), 3.4, 61); g.restore();
      for (let k = 0; k < n; k++) pane(g, x0 + 7 + k * 11, 248 - (k * 11 + 7) * .26, 5, 5);
      shape(g, [[x0 - 3, 240], [53, 218], [53, 224], [x0 - 3, 246]]);
      if (snow) snowFill(g, 218, 246); else shingles(g, roof, 216, 248, 5, 'nonzero', x0 - 4, 55);
      g.fillStyle = 'rgba(25,10,8,.3)'; shape(g, [[x0, 246], [52, 224], [52, 228], [x0, 250]]); g.fill();
    }
    // the stone basement along the side, with stable windows and red Dutch doors
    stones(g, 138, 263, 248, 298, 71);
    for (const wx of [168, 190, 231]) pane(g, wx, 274, 7, 8);
    for (const dx of [145, 207]) {
      g.fillStyle = WHITE; g.fillRect(dx - 1.5, 268, 13, 30);
      boards(g, dx, 269.5, dx + 10, 298, '#8e2a23', 2.5, dx);
      g.fillStyle = 'rgba(20,8,6,.45)'; g.fillRect(dx, 283, 10, 1);
      g.fillStyle = '#2a2420'; g.fillRect(dx + 7.5, 284.5, 1.2, 2);
    }
    // the side wall of vertical boards, lit by the sun to the right
    g.save(); shape(g, [[140, 208], [248, 213], [248, 268], [140, 264]]); g.clip();
    boards(g, 138, 205, 250, 268, tone(red, .03), 3.6, 5);
    const eg = g.createLinearGradient(0, 214, 0, 232);
    eg.addColorStop(0, 'rgba(26,8,6,.5)'); eg.addColorStop(1, 'rgba(26,8,6,0)');
    g.fillStyle = eg; g.fillRect(138, 210, 112, 24);
    g.fillStyle = WHITE; g.fillRect(140, 262.5, 108, 2);
    g.restore();
    // the gable end, in shade
    g.save(); shape(g, B.gable); g.clip();
    boards(g, 50, 150, 142, 264, tone(red, -.1), 3.2, 9);
    g.strokeStyle = 'rgba(26,8,6,.42)'; g.lineWidth = 7; line(g, B.gable.slice(1, 6).map(([x, y]) => [x, y + 2]));
    g.restore();
    stones(g, 100, 263, 141, 296, 29);
    pane(g, 118, 273, 7, 8);
    g.fillStyle = WHITE; g.fillRect(50.5, 214, 2.5, 49); g.fillRect(138.5, 214, 2.5, 50);
    // the track beam, the big sliding doors onto the threshing floor, and the hay door under the peak
    g.fillStyle = '#3a3634'; g.fillRect(62, 218.5, 64, 2);
    g.fillStyle = WHITE; g.fillRect(62, 216, 64, 2.5);
    boards(g, 70, 222, 118, 263, tone(red, -.18), 4, 13);
    g.strokeStyle = WHITE; g.lineWidth = 1.6; g.strokeRect(70, 222, 48, 41);
    g.lineWidth = 1.1; line(g, [[94, 222], [94, 263]]);
    line(g, [[70, 222], [94, 263]]); line(g, [[118, 222], [94, 263]]);
    g.fillStyle = '#2b2725'; for (const rx of [74, 90, 98, 114]) { g.beginPath(); g.arc(rx, 220.8, 1.3, 0, 7); g.fill(); }
    boards(g, 87, 160, 105, 190, tone(red, -.16), 3, 53);
    g.strokeStyle = WHITE; g.lineWidth = 1.3; g.strokeRect(87, 160, 18, 30); line(g, [[87, 160], [105, 190]]);
    g.fillStyle = '#3a3634'; g.fillRect(94, 154, 4, 4);
    pane(g, 70, 186, 6, 7); pane(g, 116, 186, 6, 7);
    g.fillStyle = 'rgba(243,230,196,.9)'; g.font = 'bold 7px Georgia'; g.textAlign = 'center';
    g.fillText(`${s ? s.startYear : 1900}`, 96, 211);
    // the gambrel roof: a shallow upper slope and a steep lower slope, both running back along the side
    const upper = [B.ridge[0], B.ridge[1], B.knee[1], B.knee[0]], lower = [B.knee[0], B.knee[1], B.eave[1], B.eave[0]];
    shape(g, upper); shingles(g, tone(roof, .12), 148, 192, 3, 'nonzero', 90, 250);
    shape(g, lower); shingles(g, roof, 182, 225, 7, 'nonzero', 128, 250);
    g.strokeStyle = 'rgba(20,16,14,.35)'; g.lineWidth = .8; line(g, B.knee);
    if (snow) {
      shape(g, upper); snowFill(g, 150, 192);
      g.save(); shape(g, lower); g.clip(); g.beginPath(); g.moveTo(128, 180);
      for (let x = 128; x <= 250; x += 5) g.lineTo(x, 199 + (x - 128) * .05 + Math.sin(x * .41) * 2.5 + pr(x) * 4);
      g.lineTo(250, 180); g.closePath(); snowFill(g, 184, 206);
      g.fillStyle = 'rgba(250,252,255,.85)';
      for (let k = 0; k < 14; k++) { const x = 140 + pr(k + 90) * 106, y = 206 + pr(k + 91) * 12; g.beginPath(); g.ellipse(x, y, 2 + pr(k + 92) * 4, 1 + pr(k + 93), 0, 0, 7); g.fill(); }
      g.restore();
      g.strokeStyle = '#f7f9fb'; g.lineWidth = 2.6; g.lineCap = 'round'; line(g, B.eave);
      g.strokeStyle = 'rgba(160,178,200,.6)'; g.lineWidth = .7; line(g, B.eave.map(([x, y]) => [x, y + 1.4]));
    }
    g.strokeStyle = WHITE; g.lineWidth = 1.8; g.lineCap = 'round'; line(g, B.rake);
    if (snow) { g.strokeStyle = '#fbfdff'; g.lineWidth = 2.2; line(g, B.rake.map(([x, y]) => [x, y - 1.6])); }
    if (b.lightning_rods) {
      for (const [lx, ly] of [[96, 150], [156, 153], [216, 156]]) {
        g.strokeStyle = '#2e2e2e'; g.lineWidth = 1; line(g, [[lx, ly], [lx, ly - 13]]);
        g.fillStyle = '#6fc3df'; g.beginPath(); g.arc(lx, ly - 7, 2.2, 0, 7); g.fill();
        g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(lx + .6, ly - 7.7, .7, 0, 7); g.fill();
      }
      g.strokeStyle = 'rgba(40,40,40,.6)'; g.lineWidth = .6; line(g, [[96, 151], [216, 157]]);
    }
  }
  function yardRamp(g, season) {
    const p = PAL[season], snow = season === 'winter';
    // the dark drive-through under the bridge to the barn floor
    const dk = g.createLinearGradient(0, 266, 0, 298);
    dk.addColorStop(0, '#120e0d'); dk.addColorStop(1, '#2e2621');
    g.fillStyle = dk; g.fillRect(80, 264, 22, 34);
    // the fieldstone retaining wall under the ramp's front edge, and the log over the opening
    g.save(); shape(g, [[28, 293], [82, 266], [82, 298], [28, 301]]); g.clip(); stones(g, 26, 262, 84, 302, 83); g.restore();
    g.fillStyle = '#4a3526'; g.fillRect(80, 262.5, 24, 4);
    g.fillStyle = 'rgba(255,230,190,.2)'; g.fillRect(80, 262.5, 24, 1.2);
    // the earthen bank, rising to the big doors
    shape(g, [[-4, 287], [66, 260], [120, 260], [120, 263.5], [82, 266.5], [28, 293], [-4, 301]]);
    if (snow) {
      snowFill(g, 258, 300);
      g.strokeStyle = '#fbfdff'; g.lineWidth = 3; g.lineCap = 'round'; line(g, [[-4, 300], [28, 292.5], [82, 266], [120, 263]]);
      g.strokeStyle = 'rgba(150,170,195,.55)'; g.lineWidth = 1; line(g, [[-4, 302], [28, 294.5], [82, 268]]);
    } else {
      groundFill(g, p.ground, 258, 302);
      shape(g, [[-4, 293], [66, 261.5], [116, 261.5], [100, 264.5], [70, 268], [14, 295], [-4, 299]]);
      g.fillStyle = rgba(YARD_DIRT[season], .8); g.fill();
    }
    // soft shade where the barn and bank meet the yard
    const sh = g.createLinearGradient(0, 295, 0, 306);
    sh.addColorStop(0, snow ? 'rgba(90,110,140,.3)' : 'rgba(30,20,12,.35)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh; g.fillRect(26, 295, 222, 11);
  }
  // The big yard tree at the right edge: bare and snow-lined in winter, in leaf the rest of the year.
  function yardTree(g, season) {
    const snow = season === 'winter', tips = [];
    const limb = (x, y, len, ang, w, depth, seed) => {
      const bend = (pr(seed) - .5) * .5, ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len;
      const mx = x + Math.cos(ang + bend) * len * .55, my = y + Math.sin(ang + bend) * len * .55;
      g.strokeStyle = depth > 2 ? '#3d322a' : '#4d4038'; g.lineWidth = w; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
      if (snow && w > .6) {
        g.strokeStyle = 'rgba(252,253,255,.92)'; g.lineWidth = w * .5;
        g.beginPath(); g.moveTo(x, y - w * .4); g.quadraticCurveTo(mx, my - w * .4, ex, ey - w * .4); g.stroke();
      }
      if (depth === 0) { tips.push([ex, ey]); return; }
      const k = depth > 4 ? 2 : 3;
      for (let i = 0; i < k; i++) {
        const spread = (i - (k - 1) / 2) * (.42 + pr(seed + i) * .3);
        limb(ex, ey, len * (.68 + pr(seed + i * 3) * .14), ang + spread + (pr(seed + i * 7) - .5) * .3, Math.max(.35, w * .64), depth - 1, seed * 1.37 + i * 11 + 3);
      }
    };
    // the trunk, flaring at the ground and lit along its right side
    const tg = g.createLinearGradient(226, 0, 246, 0);
    tg.addColorStop(0, '#2e251f'); tg.addColorStop(.6, '#4a3d33'); tg.addColorStop(1, '#6a5a4c');
    g.fillStyle = tg; g.beginPath(); g.moveTo(224, 326); g.quadraticCurveTo(230, 318, 230, 300); g.lineTo(229, 236); g.lineTo(240, 232); g.lineTo(244, 300); g.quadraticCurveTo(246, 318, 252, 326); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(20,14,10,.35)'; g.lineWidth = .6;
    for (let k = 0; k < 8; k++) { const x = 231 + k * 1.6; line(g, [[x, 236 + pr(k) * 20], [x + (pr(k + 1) - .5) * 2, 300 + pr(k + 2) * 18]]); }
    if (snow) {
      limb(232, 240, 46, -1.95, 6.5, 6, 3);
      limb(234, 238, 52, -1.5, 6, 6, 7);
      limb(230, 246, 50, -2.55, 5, 6, 11);
      limb(232, 256, 30, -2.75, 3.4, 4, 17);
      limb(240, 236, 40, -.95, 5, 5, 23);
      g.fillStyle = '#fbfdff'; g.beginPath(); g.ellipse(237, 326, 20, 4, 0, Math.PI, 0); g.fill();
      return;
    }
    limb(233, 240, 44, -1.8, 6.5, 4, 3);
    limb(235, 238, 48, -1.42, 6, 4, 7);
    limb(231, 248, 40, -2.3, 5, 4, 11);
    limb(240, 236, 36, -.95, 5, 4, 23);
    const cols = PAL[season].trees;
    if (season === 'spring') {
      // new leaf: a thin haze of pale green at the twig ends
      tips.forEach(([x, y], i) => { g.fillStyle = rgba(['#a9d37a', '#c3e08f', '#8fc363'][i % 3], .8); g.beginPath(); g.ellipse(x, y, 4 + pr(i) * 4, 3 + pr(i + 1) * 3, 0, 0, 7); g.fill(); });
      return;
    }
    // the crown in a few broad masses, darker underneath and sunlit up and to the right
    const masses = [[226, 92, 36, 30], [192, 112, 30, 26], [246, 124, 30, 30], [214, 142, 34, 26], [178, 150, 24, 20], [236, 176, 26, 22], [206, 70, 24, 20]];
    masses.forEach(([x, y, rx, ry], i) => foliage(g, x, y, rx, ry, cols[i % cols.length], i * 13 + 5, 13));
  }
  // The table in the yard, its cloth drawn over a 3/4 view; in winter a cushion of snow sits on top.
  function yardTable(g, season) {
    const snow = season === 'winter';
    g.save(); g.translate(138, 392); g.scale(.78, .78); g.translate(-138, -404);
    g.fillStyle = snow ? 'rgba(90,72,52,.75)' : 'rgba(40,30,18,.25)';
    g.beginPath(); g.ellipse(138, 404, 74, 11, -.04, 0, 7); g.fill();
    if (snow) { g.fillStyle = 'rgba(120,96,70,.6)'; for (let k = 0; k < 10; k++) { g.beginPath(); g.ellipse(80 + pr(k + 60) * 110, 398 + pr(k + 61) * 12, 6 + pr(k + 62) * 8, 1.6 + pr(k + 63) * 2, 0, 0, 7); g.fill(); } }
    for (const [lx, top, bot] of [[88, 368, 398], [186, 368, 396], [73, 384, 418], [198, 382, 414]]) {
      const lg = g.createLinearGradient(lx, 0, lx + 5, 0); lg.addColorStop(0, '#3e2a1c'); lg.addColorStop(1, '#6e4e32');
      g.fillStyle = lg; g.fillRect(lx, top, 5, bot - top);
    }
    // the cloth: the top, the front drape with its hem of folds, and the right-hand drape
    const top = [[80, 343], [196, 342], [208, 360], [66, 362]];
    shape(g, top); g.fillStyle = '#f3eee2'; g.fill();
    const front = g.createLinearGradient(0, 362, 0, 396);
    front.addColorStop(0, '#ece5d4'); front.addColorStop(.5, '#ddd4bf'); front.addColorStop(1, '#c4b9a0');
    g.fillStyle = front; g.beginPath(); g.moveTo(66, 362); g.lineTo(208, 360);
    for (let x = 208; x >= 66; x -= 10) g.quadraticCurveTo(x - 3, 397 + (x % 20 ? 2 : -1), x - 5, 393 + (x % 20 ? 1 : 3));
    g.lineTo(64, 392); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(110,98,80,.35)'; g.lineWidth = .7; g.beginPath();
    for (let x = 76; x < 206; x += 12) { g.moveTo(x, 364); g.quadraticCurveTo(x - 1, 380, x - 2.5, 394); }
    g.stroke();
    const side = g.createLinearGradient(196, 0, 214, 0);
    side.addColorStop(0, '#d9d0bb'); side.addColorStop(1, '#f1ebdc');
    g.fillStyle = side; g.beginPath(); g.moveTo(196, 342); g.lineTo(208, 360); g.lineTo(210, 386); g.quadraticCurveTo(204, 378, 198, 372); g.closePath(); g.fill();
    if (snow) {
      g.beginPath(); g.moveTo(68, 361); g.bezierCurveTo(70, 352, 78, 338, 96, 337); g.lineTo(190, 335); g.bezierCurveTo(200, 336, 210, 350, 209, 360); g.closePath();
      snowFill(g, 334, 362);
      g.strokeStyle = 'rgba(140,160,190,.5)'; g.lineWidth = .8; line(g, [[68, 362], [208, 360.5]]);
    }
    g.restore();
  }
  function granaryFlat(g, x, y, snow) {
    // a small board granary raised on fieldstone piers against rats, with a plank door and a gable roof
    g.fillStyle = 'rgba(30,20,14,.35)'; g.fillRect(x + 1, y - 6, 42, 6);
    for (const px of [x + 2, x + 19, x + 36]) stones(g, px, y - 7, px + 6, y, px);
    boards(g, x, y - 34, x + 44, y - 7, '#a23b2e', 3.2, 91);
    g.fillStyle = WHITE; g.fillRect(x, y - 34, 1.6, 27); g.fillRect(x + 42.4, y - 34, 1.6, 27); g.fillRect(x, y - 8.5, 44, 1.5);
    boards(g, x + 16, y - 29, x + 28, y - 8.5, '#7e2a22', 3, 97);
    g.strokeStyle = WHITE; g.lineWidth = 1; g.strokeRect(x + 16, y - 29, 12, 20.5);
    shape(g, [[x - 3, y - 33], [x + 22, y - 50], [x + 47, y - 33]]);
    if (snow) snowFill(g, y - 50, y - 32); else shingles(g, '#4d4a48', y - 51, y - 32, 101, 'nonzero', x - 4, x + 48);
    g.strokeStyle = WHITE; g.lineWidth = 1.2; line(g, [[x - 3, y - 33], [x + 22, y - 50], [x + 47, y - 33]]);
  }
  // Snow on a simple gable roof whose eaves run from (x0, y) to (x1, y) under a peak at (px, py).
  function snowRoof(g, x0, x1, y, px, py) {
    shape(g, [[x0, y], [px, py - 1.5], [x1, y], [x1 - 4, y + 1], [px, py + 3], [x0 + 4, y + 1]]); snowFill(g, py, y);
  }
  // Everything in the farmyard that does not move, painted once per season and set of buildings.
  // The farmyard behind the Harvest Plan (and the title preview): only the bank barn, the silo, and the windmill.
  // Every other building is pictured on the Buildings tab.
  function yardPlate(s, season) {
    const b = s ? s.buildings : {}, snow = season === 'winter';
    const owned = ['silo', 'lightning_rods', 'electricity'].filter(k => b[k]).join(',');
    const key = `yard|${season}|${s ? s.startYear : 1900}|${owned}|${Math.min(3, b.barn_addition || 0)}`;
    return cached(key, YARD_W * 2, H * 2, g => {
      g.scale(2, 2);
      yardBackground(g, season);
      yardGround(g, season);
      if (b.silo) {
        g.save(); g.translate(118, 112); g.scale(.95, .95); siloFlat(g, 0, 0); g.restore();
        if (snow) { g.beginPath(); g.arc(132.25, 112, 14.5, Math.PI, 0); g.lineTo(146.5, 113.5); g.lineTo(118, 113.5); g.closePath(); snowFill(g, 97, 113); }
      }
      if (b.electricity) {
        g.strokeStyle = '#5a4535'; g.lineWidth = 2.2; line(g, [[6, 300], [6, 252]]);
        g.fillStyle = '#5a4535'; g.fillRect(-2, 254, 16, 2.2);
        g.strokeStyle = '#2e2e2e'; g.lineWidth = .6;
        g.beginPath(); g.moveTo(-4, 252); g.quadraticCurveTo(2, 256, 12, 255); g.quadraticCurveTo(32, 250, 54, 226); g.stroke();
      }
      yardBarn(g, s, season);
      yardRamp(g, season);
      yardTree(g, season);
    });
  }
  // The farmyard panel at the right of the Fields view: the painted sky and bluffs continue from the homestead
  // landscape, then the yard plate, then whatever moves or changes with the farm's stores and machinery.
  function yardLabel(ctx, text, x, y) {
    ctx.font = 'bold 11px Georgia'; ctx.textAlign = 'center';
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(40,28,18,.72)'; ctx.fillRect(x - tw / 2 - 6, y - 12, tw + 12, 17);
    ctx.fillStyle = '#f6ecd2'; ctx.fillText(text, x, y);
  }
  const scaled = (ctx, [x, y, k], draw) => { ctx.save(); ctx.translate(x, y); ctx.scale(k, k); draw(); ctx.restore(); };
  // o.harvest: the Harvest Plan's version, without Nels, with the threshing rig and Ingrid's dinner by season (see yardHarvest).
  // o.finish = false when the caller grades the whole frame itself.
  function farmyard(ctx, s, t, season, parked = [], o = {}) {
    ctx.save();
    try {
      ctx.beginPath(); ctx.rect(YARD_X, 0, YARD_W, H); ctx.clip();
      sky(ctx, season, t);
      distantBluffs(ctx, season, 202);
      ctx.drawImage(yardPlate(s, season), YARD_X, 0, YARD_W, H);
      ctx.translate(YARD_X, 0);
      const b = s ? s.buildings : {}, threshing = o.harvest && s && season === 'fall';
      if (b.windmill) windmill(ctx, 34, 228, t);
      if (season !== 'winter' && !threshing) YARD_SLOTS.hens.forEach(([x, y], i) => chicken(ctx, x + Math.sin(t * .3 + i * 2) * 6, y, t, i));
      if (o.harvest && s) yardHarvest(ctx, s, t, o.small, season);
      else {
        parked.slice(0, YARD_SLOTS.parked.length).forEach((m, i) => { const [x, y, k] = YARD_SLOTS.parked[i]; machine(ctx, m.id, x, y, k, t, 'idle', m.year); });
        if (s) lumberPile(ctx, ...YARD_SLOTS.lumber, s.store.lumber, season);
        if (season === 'winter') scaled(ctx, YARD_SLOTS.hand, () => person(ctx, 0, 0, '#6d8fb4', '#cdb06a'));
        scaled(ctx, YARD_SLOTS.nels, () => person(ctx, 0, 0, '#a5493c', '#d9c07a'));
      }
      ctx.translate(-YARD_X, 0);
      particles(ctx, season, t, s);
      if (season === 'winter') { ctx.fillStyle = 'rgba(200,215,235,.12)'; ctx.fillRect(YARD_X, 0, YARD_W, H); }
      if (o.finish !== false) finish(ctx, season, YARD_W, H, YARD_X);
    } finally { ctx.restore(); }
  }
  // Harvest Plan extras, in plate coordinates, by season. Spring and summer: the threshing rig (and the clover huller)
  // waits in the yard. Fall is threshing time: the rig stands full size at the back of the yard, with Ingrid and the
  // threshers' pies on the table in front of it and the hens in front of that. Winter: everything is put away.
  // Sizes follow Ingrid (about 5 ft 5 in): the separator body stands taller than she does and runs off the panel.
  // The rig stands near the barn at its real size (the separator a head taller than a man, the tractor or steam engine
  // at the near end of its belt); in fall, Ingrid and the table stand in front of the barn and the rig.
  const THRESHING_YARD = Object.freeze({
    sep: [122, 394, 1.35], power: [16, 400, 1.7], table: [124, 470, .92], ingrid: [214, 482, 1.6],
    hens: [[44, 514, 1.5], [96, 524, 1.5], [150, 514, 1.5]], label: [120, 534],
  });
  function yardHarvest(ctx, s, t, small, season) {
    const pl = s.plan;
    lumberPile(ctx, ...YARD_SLOTS.lumber, s.store.lumber, season);
    if (season === 'winter') return;
    if (pl.hull && (pl.crops.clover || 0) > 0) {
      const hl = pl.hullMethod === 'own' ? Sim.huller(s) : null;
      ctx.save(); ctx.translate(200, 318); ctx.scale(.5, .5); separator(ctx, 0, 0, hl ? hl.body : '#c2902f', t, false, hl ? hl.brand : 'Birdsell', true); ctx.restore();
    }
    const fall = season === 'fall', Y = THRESHING_YARD;
    const rig = small ? Sim.rigFor(s, 'thresh') : null;
    if (rig) {
      // the engine stands at the near end of the belt, in front of the separator
      scaled(ctx, Y.sep, () => separator(ctx, 0, 0, rig.sepBody, t, false, rig.sepBrand, false));
      scaled(ctx, Y.power, () => machine(ctx, rig.powerId, 0, 0, 1, t, 'idle', rig.powerYear));
    }
    if (fall) {
      // the table and pies were laid out for the table standing at (138, 392) at .78 scale; move and enlarge them together
      const [tx, ty, k] = Y.table;
      ctx.save(); ctx.translate(tx, ty); ctx.scale(k / .78, k / .78); ctx.translate(-138, -392);
      yardTable(ctx, season);
      for (const [x, y] of YARD_PIES[dinnerPies(pl)] || YARD_PIES[3]) pie(ctx, x, y);
      ctx.restore();
      scaled(ctx, Y.ingrid, () => ingrid(ctx, 0, 0, { t }));
      Y.hens.forEach(([x, y, k], i) => scaled(ctx, [x + Math.sin(t * .3 + i * 2) * 6, y, k], () => chicken(ctx, 0, 0, t, i)));
    }
    const who = rig && { own: 'Your own outfit', ring: 'The threshing ring', custom: 'The custom thresherman' }[rig.method];
    if (who) yardLabel(ctx, who, ...Y.label);
  }

  // ---------- Buildings: the home place, with every owned building around the yard ----------
  // A machine shed with three open bays (100 units wide, ground at y + 50).
  function machineShedFlat(g, x, y) {
    boards(g, x, y + 8, x + 100, y + 50, '#8e3a2c', 4, 131);
    for (const bx of [6, 38, 70]) {
      const dg = g.createLinearGradient(0, y + 16, 0, y + 50); dg.addColorStop(0, '#120e0b'); dg.addColorStop(1, '#3a2e24');
      g.fillStyle = dg; g.fillRect(x + bx, y + 16, 26, 34);
    }
    // a wagon wheel and a plow handle in the shadows
    g.strokeStyle = 'rgba(150,110,70,.55)'; g.lineWidth = 1.4; g.beginPath(); g.arc(x + 51, y + 41, 8, 0, 7); g.moveTo(x + 51, y + 33); g.lineTo(x + 51, y + 49); g.moveTo(x + 43, y + 41); g.lineTo(x + 59, y + 41); g.stroke();
    g.strokeStyle = 'rgba(130,100,70,.5)'; g.beginPath(); g.moveTo(x + 76, y + 48); g.lineTo(x + 90, y + 30); g.moveTo(x + 80, y + 48); g.lineTo(x + 93, y + 32); g.stroke();
    g.fillStyle = WHITE; for (const px of [4, 34, 66, 96]) g.fillRect(x + px, y + 14, 2.5, 36);
    g.fillRect(x, y + 13, 100, 2);
    shape(g, [[x - 5, y + 10], [x + 50, y - 6], [x + 105, y + 10], [x + 105, y + 13], [x - 5, y + 13]]);
    shingles(g, '#4a4347', y - 6, y + 13, 141, 'nonzero', x - 6, x + 106);
    g.strokeStyle = WHITE; g.lineWidth = 1.2; line(g, [[x - 5, y + 10], [x + 50, y - 6], [x + 105, y + 10]]);
    g.fillStyle = 'rgba(30,20,12,.35)'; g.fillRect(x, y + 13, 100, 3);
  }
  // A lean-to woodshed with the firewood stacked under it (56 wide, ground at y + 30).
  function woodshedFlat(g, x, y) {
    boards(g, x, y, x + 56, y + 30, '#7a5a3c', 4, 151);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 9; k++) {
      const lx = x + 6 + k * 5.6 + (r % 2) * 2.8, ly = y + 27 - r * 5.4, lr = 2.5 + pr(r * 9 + k) * .5;
      if (lx > x + 52) continue;
      const lg = g.createRadialGradient(lx - .6, ly - .6, .2, lx, ly, lr); lg.addColorStop(0, '#e2bd86'); lg.addColorStop(1, '#9a6f40');
      g.fillStyle = lg; g.beginPath(); g.arc(lx, ly, lr, 0, 7); g.fill();
      g.strokeStyle = 'rgba(110,70,30,.5)'; g.lineWidth = .3; g.beginPath(); g.arc(lx, ly, lr * .5, 0, 7); g.stroke();
    }
    g.fillStyle = '#5a412c'; g.fillRect(x, y, 2.5, 30); g.fillRect(x + 53.5, y, 2.5, 30);
    shape(g, [[x - 4, y - 4], [x + 60, y + 3], [x + 60, y + 6], [x - 4, y - 1]]);
    shingles(g, '#4d4a48', y - 4, y + 6, 157, 'nonzero', x - 5, x + 61);
    g.fillStyle = 'rgba(30,20,12,.3)'; g.fillRect(x, y + 1, 56, 3);
  }
  // Contour strips across a hillside: bands of crops following the slope (x0-x1, from y0 down to y1).
  function contourHill(g, x0, x1, y0, y1, season) {
    const cols = ['grain', 'hay', 'corn', 'hay'].map(c => fieldColor(c === 'grain' ? 'oats' : c === 'hay' ? 'alfalfa' : 'corn', season));
    const n = 5, crest = (x) => y0 + 8 * Math.sin((x - x0) / (x1 - x0) * Math.PI * 1.3 + .4);
    g.save(); g.beginPath(); g.moveTo(x0, y1); for (let x = x0; x <= x1; x += 6) g.lineTo(x, crest(x)); g.lineTo(x1, y1); g.closePath(); g.clip();
    for (let k = 0; k < n; k++) {
      const a = k / n, b = (k + 1) / n;
      g.fillStyle = cols[k % cols.length]; g.beginPath();
      for (let x = x0; x <= x1; x += 6) { const c = crest(x); g.lineTo(x, c + (y1 - c) * a + 3 * Math.sin(x / 40 + k)); }
      for (let x = x1; x >= x0; x -= 6) { const c = crest(x); g.lineTo(x, c + (y1 - c) * b + 3 * Math.sin(x / 40 + k + 1)); }
      g.closePath(); g.fill();
    }
    fieldShade(g, y0 - 10, y1);
    g.restore();
  }
  function powerPole(g, x, y, h) {
    const pg = g.createLinearGradient(x - 2.5, 0, x + 2.5, 0); pg.addColorStop(0, '#3e3024'); pg.addColorStop(.6, '#6e5a44'); pg.addColorStop(1, '#3e3024');
    g.fillStyle = pg; g.fillRect(x - 2.5, y - h, 5, h);
    g.fillStyle = '#5a4535'; g.fillRect(x - 16, y - h + 8, 32, 3.5);
    g.fillStyle = '#6fa3b8'; for (const d of [-13, -5, 5, 13]) { g.beginPath(); g.ellipse(x + d, y - h + 6, 1.6, 2.4, 0, 0, 7); g.fill(); }
  }
  // The Surge bucket milker: a steel pail with its pulsator lid, hoses, and teat cups (ground at y).
  function milkerFlat(g, x, y) {
    const bk = g.createLinearGradient(x - 14, 0, x + 14, 0); bk.addColorStop(0, '#79818a'); bk.addColorStop(.6, '#eef2f3'); bk.addColorStop(1, '#8a9298');
    g.fillStyle = bk; g.beginPath(); g.moveTo(x - 14, y - 30); g.quadraticCurveTo(x - 15, y - 4, x, y); g.quadraticCurveTo(x + 15, y - 4, x + 14, y - 30); g.closePath(); g.fill();
    g.fillStyle = '#5f676c'; g.beginPath(); g.ellipse(x, y - 30, 14, 3, 0, 0, 7); g.fill();
    g.fillStyle = '#3b3b3b'; g.fillRect(x - 6, y - 38, 12, 8);
    g.strokeStyle = '#1e1e1e'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x + 4, y - 38); g.quadraticCurveTo(x + 22, y - 52, x + 28, y - 34);
    g.moveTo(x - 4, y - 38); g.quadraticCurveTo(x - 20, y - 50, x - 26, y - 34); g.stroke();
    g.fillStyle = '#c9ced2'; for (const [cx, cy] of [[28, -34], [24, -30], [-26, -34], [-22, -30]]) g.fillRect(x + cx - 1.6, y + cy, 3.2, 7);
    g.font = 'bold 6px Georgia'; g.textAlign = 'center'; g.fillStyle = 'rgba(40,44,48,.75)'; g.fillText('SURGE', x, y - 14);
  }
  // Thumbnails for the Buildings tab: each building or improvement on a patch of sky and grass.
  const BTHUMB = {
    silo: { box: [-4, -20, 34, 100], draw: g => siloFlat(g, 0, 0) },
    cheese_house: { box: [-6, -30, 70, 34], draw: g => ostehusWide(g, false) },
    barn_addition: { box: [-10, -52, 205, 84], draw: (g, s) => barnFlat(g, 0, 0, { startYear: s ? s.startYear : 1900, buildings: { barn_addition: 1 } }) },
    tobacco_shed: { box: [-6, -18, 116, 41], draw: g => tobaccoShedFlat(g, 0, 0) },
    granary: { box: [-5, -60, 62, 1], draw: g => granaryWide(g, false) },
    machine_shed: { box: [-6, -8, 106, 50], draw: g => machineShedFlat(g, 0, 0) },
    woodshed: { box: [-5, -6, 61, 30], draw: g => woodshedFlat(g, 0, 0) },
    lightning_rods: { box: [-10, -64, 160, 84], draw: (g, s) => barnFlat(g, 0, 0, { startYear: s ? s.startYear : 1900, buildings: { lightning_rods: true } }) },
    windmill: { box: [-20, -22, 34, 90], draw: g => windmillFlat(g, 0, 0, .3) },
    contour: { box: [0, -40, 140, 0], draw: g => contourHill(g, 0, 140, -40, 0, 'summer') },
    electricity: { box: [-10, -84, 130, 56], draw: g => {
      houseFlat(g, 0, 0, 'summer');
      g.fillStyle = 'rgba(255,214,120,.55)'; g.fillRect(10, 12, 12, 14); g.fillRect(58, 12, 12, 14);
      powerPole(g, 116, 56, 136); g.strokeStyle = '#2a2a2a'; g.lineWidth = .8; g.beginPath(); g.moveTo(103, -76); g.quadraticCurveTo(90, -40, 78, -6); g.stroke();
    } },
    milker: { box: [-34, -56, 34, 0], draw: g => milkerFlat(g, 0, 0) },
  };
  function buildingThumb(c, id, s, w, h) {
    const sky = c.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#8fb9d8'); sky.addColorStop(1, '#e6ecea');
    c.fillStyle = sky; c.fillRect(0, 0, w, h);
    const gy = h * .86;
    c.fillStyle = '#7fae58'; c.fillRect(0, gy, w, h - gy);
    c.fillStyle = 'rgba(40,60,20,.25)'; c.fillRect(0, gy, w, 2);
    const T = BTHUMB[id];
    if (!T) return;
    const [x0, y0, x1, y1] = T.box, ground = id === 'contour' ? y1 : y1, k = Math.min(w * .9 / (x1 - x0), (gy - h * .07) / (ground - y0));
    c.save(); c.translate(w / 2 - (x0 + x1) / 2 * k, gy - ground * k); c.scale(k, k);
    contactShadow(c, (x0 + x1) / 2, ground, (x1 - x0) * .45, 4);
    T.draw(c, s);
    c.restore();
    const v = c.createLinearGradient(0, 0, w, h); v.addColorStop(0, 'rgba(255,240,210,.12)'); v.addColorStop(1, 'rgba(30,20,10,.18)');
    c.fillStyle = v; c.fillRect(0, 0, w, h);
  }
  // ---------- depth for the Buildings tab ----------
  // A building's side wall and roof slope receding toward the middle of the picture, drawn before its front face, in the
  // front face's units. o: x0/x1 the wall's corners, top (eave height on the wall) and ground, d = [dx, dy] going back
  // (dx > 0 shows the right side), roof = points from the ridge down to that side's eave, wall/roofColor, siding
  // ('clap' or 'boards'), stones (foundation height), corner (trim color), snow, and onWall(map, shade) for windows.
  function sideDepth(g, o) {
    const [dx, dy] = o.d, right = dx > 0, xe = right ? o.x1 : o.x0, shade = right ? -.14 : -.32;
    const map = (u, y) => [xe + dx * u, y + dy * u];
    const box = (pts) => { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return [Math.min(...xs) - 1, Math.min(...ys) - 1, Math.max(...xs) + 1, Math.max(...ys) + 1]; };
    const wall = [map(0, o.top), map(0, o.ground), map(1, o.ground), map(1, o.top)], [ax, ay, bx, by] = box(wall);
    g.save(); shape(g, wall); g.clip();
    const wg = g.createLinearGradient(xe, 0, xe + dx, 0); wg.addColorStop(0, tone(o.wall, shade + .05)); wg.addColorStop(1, tone(o.wall, shade - .12));
    g.fillStyle = wg; g.fillRect(ax, ay, bx - ax, by - ay);
    g.lineWidth = .5;
    if (o.siding === 'clap') { g.strokeStyle = 'rgba(50,42,34,.32)'; for (let y = o.top + 2.6; y < o.ground; y += 2.6) line(g, [map(0, y), map(1, y)]); }
    else { const n = Math.max(3, Math.round(Math.abs(dx) / 2.6)); g.strokeStyle = 'rgba(24,10,6,.38)'; for (let k = 1; k < n; k++) line(g, [map(k / n, o.top), map(k / n, o.ground)]); }
    if (o.stones) {
      shape(g, [map(0, o.ground - o.stones), map(0, o.ground), map(1, o.ground), map(1, o.ground - o.stones)]); g.fillStyle = tone('#9c9484', shade); g.fill();
      g.fillStyle = 'rgba(40,36,30,.35)';
      for (let k = 0; k < 9; k++) { const [px, py] = map((k + .5) / 9, o.ground - o.stones * (.3 + (k % 2) * .4)); g.beginPath(); g.ellipse(px, py, Math.abs(dx) / 22, o.stones * .2, 0, 0, 7); g.fill(); }
    }
    if (o.onWall) o.onWall(map, shade);
    g.strokeStyle = 'rgba(20,12,8,.35)'; g.lineWidth = 1.8; line(g, [map(0, o.top + .9), map(1, o.top + .9)]);
    g.restore();
    if (o.corner) { g.strokeStyle = tone(o.corner, shade); g.lineWidth = 1.4; line(g, [map(1, o.top), map(1, o.ground - (o.stones || 0))]); }
    // the roof, plane by plane from the ridge down to the eave, its courses running back along the building
    for (let i = 0; i < o.roof.length - 1; i++) {
      const a = o.roof[i], b = o.roof[i + 1], q = [a, b, [b[0] + dx, b[1] + dy], [a[0] + dx, a[1] + dy]], [qx, qy, rx, ry] = box(q);
      shape(g, q);
      if (o.snow) { snowFill(g, qy, ry); shape(g, q); g.fillStyle = `rgba(90,110,140,${right ? .06 : .16})`; g.fill(); continue; }
      g.save(); g.clip();
      const lt = right ? .02 - i * .05 : -.26, rg = g.createLinearGradient(a[0], a[1], b[0], b[1]);
      rg.addColorStop(0, tone(o.roofColor, lt + .1)); rg.addColorStop(1, tone(o.roofColor, lt - .1));
      g.fillStyle = rg; g.fillRect(qx, qy, rx - qx, ry - qy);
      const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2.6)), m = Math.max(3, Math.round(Math.hypot(dx, dy) / 3));
      for (let k = 1; k <= n; k++) {
        const u = k / n, u0 = (k - 1) / n, p = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], p0 = [a[0] + (b[0] - a[0]) * u0, a[1] + (b[1] - a[1]) * u0];
        g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = .55; line(g, [p, [p[0] + dx, p[1] + dy]]);
        g.strokeStyle = 'rgba(0,0,0,.16)'; g.lineWidth = .35;
        for (let j = 0; j < m; j++) { const v = (j + (k % 2) * .5) / m; line(g, [[p0[0] + dx * v, p0[1] + dy * v], [p[0] + dx * v, p[1] + dy * v]]); }
      }
      g.restore();
    }
    const r0 = o.roof[0]; g.strokeStyle = o.snow ? '#e6edf3' : tone(o.roofColor, -.35); g.lineWidth = 1.1; line(g, [r0, [r0[0] + dx, r0[1] + dy]]);
  }
  // A sash window on a receding side wall (u along the wall's depth, y down the wall).
  function sidePane(g, map, u0, u1, y0, y1, shade) {
    const frame = tone('#f2ede2', shade);
    shape(g, [map(u0 - .03, y0 - .9), map(u1 + .03, y0 - .9), map(u1 + .03, y1 + .9), map(u0 - .03, y1 + .9)]); g.fillStyle = frame; g.fill();
    const f = [map(u0, y0), map(u1, y0), map(u1, y1), map(u0, y1)];
    shape(g, f); const gl = g.createLinearGradient(f[0][0], f[0][1], f[2][0], f[2][1]); gl.addColorStop(0, '#7c96a8'); gl.addColorStop(1, '#1e2a34'); g.fillStyle = gl; g.fill();
    g.strokeStyle = frame; g.lineWidth = .6; line(g, [map((u0 + u1) / 2, y0), map((u0 + u1) / 2, y1)]); line(g, [map(u0, (y0 + y1) / 2), map(u1, (y0 + y1) / 2)]);
  }
  // A roof's edge seen on the gable end: a shingled band between the outer and inner rake lines, with a white fascia.
  function rakeBand(g, outer, inner, color, snow, seed) {
    const ys = outer.concat(inner).map(p => p[1]), xs = outer.concat(inner).map(p => p[0]);
    const path = () => { g.beginPath(); outer.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); inner.slice().reverse().forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); };
    path();
    if (snow) { g.save(); g.clip('evenodd'); g.fillStyle = '#f7fafc'; g.fillRect(Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)); g.restore(); }
    else shingles(g, color, Math.min(...ys), Math.max(...ys), seed, 'evenodd', Math.min(...xs) - 1, Math.max(...xs) + 1);
    g.strokeStyle = WHITE; g.lineWidth = 1.3; line(g, inner);
  }
  // The Ostehus in three-quarter view for the Buildings tab: white clapboard with blue trim and shutters, a carved
  // bargeboard, a diamond gable vent, a signboard, the paneled door with its transom and stone step, and a brick chimney
  // for the curd kettle (front face 50 wide, walls from y 1 down to the foundation at 29-33).
  function ostehusWide(g, snow) {
    const d = [15, -8], blue = '#2f5378', roof = '#3b5f86', white = '#f6f2e8';
    sideDepth(g, { x0: 0, x1: 50, top: 1, ground: 33, d, roof: [[25, -16.5], [54.5, 2.6]], wall: '#f1ebdc', roofColor: roof, siding: 'clap', stones: 4, snow, corner: white,
      onWall: (map, sh) => sidePane(g, map, .34, .66, 9, 20, sh) });
    // brick chimney rising from the far half of the roof
    g.fillStyle = '#86503a'; g.fillRect(42, -26, 5, 13); g.fillStyle = 'rgba(30,14,8,.35)'; g.fillRect(45.4, -26, 1.6, 13);
    g.fillStyle = 'rgba(40,20,14,.4)'; for (let r = 0; r < 5; r++) { g.fillRect(42, -26 + r * 2.6, 5, .4); g.fillRect(42 + (r % 2 ? 1.5 : 3.4), -26 + r * 2.6, .4, 2.6); }
    g.fillStyle = snow ? '#f7fafc' : '#5e5a55'; g.fillRect(41.3, -27.6, 6.4, 1.8);
    // foundation, clapboard walls, and the gable
    stones(g, -1, 29, 51, 33, 61);
    clapboard(g, 0, 1, 50, 29.5, '#f4efe2', 2.4);
    g.save(); shape(g, [[0, 1.4], [25, -14.6], [50, 1.4]]); g.clip(); clapboard(g, 0, -15, 50, 1.4, '#f4efe2', 2.4); g.restore();
    g.strokeStyle = 'rgba(40,30,20,.22)'; g.lineWidth = 2.6; line(g, [[1, 2.6], [25, -12.6], [49, 2.6]]);
    // a diamond louvered vent in the gable
    shape(g, [[25, -10.4], [29, -5.6], [25, -.8], [21, -5.6]]); g.fillStyle = white; g.fill();
    shape(g, [[25, -9], [27.7, -5.6], [25, -2.2], [22.3, -5.6]]); g.fillStyle = '#2a2622'; g.fill();
    g.strokeStyle = white; g.lineWidth = .4; for (let y = -8; y < -2.5; y += 1.2) { const hw = 2.7 * (1 - Math.abs(y + 5.6) / 3.4); line(g, [[25 - hw, y], [25 + hw, y]]); }
    // corner boards, water table, and the eave shade
    g.fillStyle = white; g.fillRect(0, 1, 2, 28.5); g.fillRect(48, 1, 2, 28.5); g.fillRect(-.5, 28.4, 51, 1.3);
    g.fillStyle = 'rgba(40,30,20,.18)'; g.fillRect(2, 1, .8, 27.4);
    // the roof edge, a white fascia, and the carved scallops of the bargeboard
    rakeBand(g, [[-4.5, 2.8], [25, -17], [54.5, 2.8]], [[-.6, 1.6], [25, -13.9], [50.6, 1.6]], roof, snow, 37);
    g.fillStyle = white;
    for (const [ex, ey] of [[-.6, 1.6], [50.6, 1.6]]) for (let k = 1; k < 8; k++) { const u = k / 8, px = 25 + (ex - 25) * u, py = -13.9 + (ey + 13.9) * u; g.beginPath(); g.arc(px, py + .5, .7, 0, Math.PI); g.fill(); }
    g.beginPath(); g.moveTo(25, -13.9); g.lineTo(24, -11.8); g.lineTo(26, -11.8); g.closePath(); g.fill();
    // a window with blue louvered shutters
    for (const sx of [4, 18]) { g.fillStyle = blue; g.fillRect(sx, 12, 3.2, 12); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = .3; for (let y = 13; y < 23.5; y += 1.1) line(g, [[sx + .4, y], [sx + 2.8, y]]); }
    pane(g, 7.6, 12.4, 10, 11);
    // the signboard over the door
    g.fillStyle = 'rgba(30,24,18,.3)'; g.fillRect(27.6, 3, 19, 5);
    g.fillStyle = blue; g.fillRect(27, 2.4, 19, 5); g.strokeStyle = white; g.lineWidth = .5; g.strokeRect(27.6, 3, 17.8, 3.8);
    g.fillStyle = white; g.font = 'bold 3.3px Georgia'; g.textAlign = 'center'; g.fillText('OSTEHUS', 36.5, 6.1);
    // the paneled door, a full man's height, with its transom, frame, and a stone step
    g.fillStyle = white; g.fillRect(31, 8.2, 11, 21.4);
    pane(g, 32.2, 9, 8.6, 1.8);
    const dg = g.createLinearGradient(32, 0, 41, 0); dg.addColorStop(0, '#2c4f74'); dg.addColorStop(1, '#4878a6');
    g.fillStyle = dg; g.fillRect(32.2, 11.4, 8.6, 18.2);
    g.strokeStyle = 'rgba(14,24,40,.5)'; g.lineWidth = .4; for (const [px, py, pw, ph] of [[33.2, 12.4, 2.8, 7.4], [37, 12.4, 2.8, 7.4], [33.2, 21, 2.8, 7.4], [37, 21, 2.8, 7.4]]) g.strokeRect(px, py, pw, ph);
    g.fillStyle = '#d9b45a'; g.beginPath(); g.arc(39.8, 20.4, .55, 0, 7); g.fill();
    const sg = g.createLinearGradient(0, 29.6, 0, 33); sg.addColorStop(0, '#c4bcab'); sg.addColorStop(1, '#8a8274');
    g.fillStyle = sg; g.fillRect(29.6, 29.6, 13.8, 3.4);
    g.fillStyle = 'rgba(255,255,255,.4)'; g.fillRect(29.6, 29.6, 13.8, .5);
    milkCan(g, 46.6, 33, .3);
  }
  // The granary in three-quarter view for the Buildings tab: red board walls raised on fieldstone piers against rats,
  // white corner boards, a Z-braced plank door with strap hinges and a hasp, a louvered vent, and a plank step
  // (front face 44 wide, ground at y 0).
  function granaryWide(g, snow) {
    const d = [14, -8], red = '#a23b2e', door = '#7e2a22', iron = '#2a2624';
    // the crawl space under the floor, dark between the piers, and the far piers
    shape(g, [[0, -7], [44, -7], [44 + d[0], -7 + d[1]], [44 + d[0], d[1]], [44, 0], [0, 0]]); g.fillStyle = 'rgba(24,16,10,.6)'; g.fill();
    for (const u of [.5, 1]) stones(g, 38 + d[0] * u, -7 + d[1] * u, 44 + d[0] * u, d[1] * u, 19 + u * 10);
    sideDepth(g, { x0: 0, x1: 44, top: -34, ground: -7, d, roof: [[22, -51], [47.6, -32.4]], wall: red, roofColor: '#4d4a48', siding: 'boards', snow, corner: WHITE,
      onWall: (map, sh) => {
        shape(g, [map(.38, -29), map(.62, -29), map(.62, -23), map(.38, -23)]); g.fillStyle = 'rgba(20,10,6,.75)'; g.fill();
        g.strokeStyle = tone(WHITE, sh); g.lineWidth = .5; for (let y = -28; y < -23; y += 1.2) line(g, [map(.38, y), map(.62, y)]);
      } });
    for (const px of [1, 19, 37]) stones(g, px, -7, px + 6, 0, px);
    // front wall and gable of vertical boards, shaded under the roof edge
    boards(g, 0, -34, 44, -7, red, 3.2, 91);
    g.save(); shape(g, [[0, -33.6], [22, -48.6], [44, -33.6]]); g.clip(); boards(g, 0, -49, 44, -33.4, red, 3.2, 93); g.restore();
    g.strokeStyle = 'rgba(30,10,6,.3)'; g.lineWidth = 2.4; line(g, [[1, -32.4], [22, -46.8], [43, -32.4]]);
    // a small louvered vent in the gable
    g.fillStyle = WHITE; g.fillRect(18.6, -43.4, 6.8, 5.4); g.fillStyle = 'rgba(20,10,6,.8)'; g.fillRect(19.4, -42.6, 5.2, 3.8);
    g.strokeStyle = WHITE; g.lineWidth = .4; for (let y = -41.8; y < -39; y += 1) line(g, [[19.4, y], [24.6, y]]);
    // corner boards, the sill, and a shadow line under it
    g.fillStyle = WHITE; g.fillRect(0, -34, 1.8, 27); g.fillRect(42.2, -34, 1.8, 27); g.fillRect(-.4, -8.6, 44.8, 1.6);
    g.fillStyle = 'rgba(30,10,6,.3)'; g.fillRect(1.8, -34, .7, 25.4); g.fillRect(0, -7, 44, .8);
    // the Z-braced plank door with its trim, strap hinges, and hasp
    boards(g, 15, -29, 29, -8.6, door, 2.8, 97);
    g.strokeStyle = tone(door, .18); g.lineWidth = 1.5; g.lineCap = 'round'; line(g, [[16, -27], [28, -27], [16, -11], [28, -11]]); g.lineCap = 'butt';
    g.strokeStyle = WHITE; g.lineWidth = 1; g.strokeRect(14.5, -29.5, 15, 21);
    g.fillStyle = iron; for (const hy of [-26.6, -11.6]) { g.fillRect(15, hy - .5, 7, 1); g.beginPath(); g.arc(22, hy, .7, 0, 7); g.fill(); }
    g.fillRect(27.4, -20, 1.2, 3); g.beginPath(); g.arc(28, -16.4, .6, 0, 7); g.fill();
    // a plank step up to the door
    g.fillStyle = '#6b4f35'; g.fillRect(15.5, -3.6, 1.2, 3.6); g.fillRect(27.3, -3.6, 1.2, 3.6);
    const pg = g.createLinearGradient(0, -4.4, 0, -2.6); pg.addColorStop(0, '#b08a5e'); pg.addColorStop(1, '#7a5a3c');
    g.fillStyle = pg; g.fillRect(14, -4.4, 16, 1.8);
    // the roof edge on the gable
    rakeBand(g, [[-3.6, -32.2], [22, -51.4], [47.6, -32.2]], [[-.4, -33.4], [22, -48.2], [44.4, -33.4]], '#4d4a48', snow, 101);
  }
  // The wide view of the home place on the Buildings tab: house, windmill, silo, and the bank barn across the back;
  // the machine shed and tobacco shed to the right; the Ostehus, granary, and woodshed in front; the yard below
  // (the machines themselves are on the Machinery tab).
  const WIDE = Object.freeze({ base: 395, front: 458 });
  function yardWidePlate(s, season, p) {
    const b = s ? s.buildings : {}, snow = season === 'winter';
    const owned = ['silo', 'cheese_house', 'granary', 'tobacco_shed', 'lightning_rods', 'electricity', 'machine_shed', 'woodshed', 'contour', 'milker'].filter(k => b[k]).join(',');
    const key = `yardwide|${season}|${s ? s.startYear : 1900}|${owned}|${Math.min(3, b.barn_addition || 0)}|${Object.keys(painted).length}`;
    return cached(key, W, H, g => {
      const B = WIDE.base, F = WIDE.front, place = (x, y, k, draw) => { g.save(); g.translate(x, y); g.scale(k, k); draw(); g.restore(); };
      // the farm's own slopes behind the yard, contour-stripped once that is done, and the pasture
      g.beginPath(); g.moveTo(0, 300); g.quadraticCurveTo(300, 270, 640, 286); g.quadraticCurveTo(820, 292, W, 288); g.lineTo(W, H); g.lineTo(0, H); groundFill(g, p.near, 270, H);
      if (b.contour) contourHill(g, 0, W, 286, 352, season);
      // the yard: packed dirt (or trodden snow) in front of the buildings
      g.beginPath(); g.ellipse(470, 470, 470, 74, 0, 0, 7); groundFill(g, snow ? '#e4e6e4' : YARD_DIRT[season], 400, H);
      g.strokeStyle = snow ? 'rgba(140,130,120,.35)' : 'rgba(60,44,28,.28)'; g.lineWidth = 3; g.beginPath();
      g.moveTo(0, 520); g.quadraticCurveTo(300, 470, 450, 405); g.moveTo(40, 535); g.quadraticCurveTo(320, 480, 470, 405); g.stroke();
      // a big yard tree behind the barn's right shoulder
      const tr = 100;
      if (snow) tree(g, 640, B - tr * .9 - 40, tr, p.trees[0], season, 3); else oak(g, 640, B - tr * .8 - 40, tr * .7, p.trees[1 % p.trees.length], season);
      // back row: house, silo, the bank barn (with its additions and rods), machine shed, tobacco shed
      contactShadow(g, 76, B, 64, 6);
      place(20, B - 56 * 1.35, 1.35, () => {
        sideDepth(g, { x0: 0, x1: 80, top: 2, ground: 56, d: [16, -9], roof: [[40, -30], [86, 2]], wall: '#ece6d6', roofColor: '#4d5058', siding: 'clap', stones: 6, snow, corner: '#f4efe4',
          onWall: (map, sh) => { sidePane(g, map, .28, .62, 12, 26, sh); sidePane(g, map, .28, .62, 33, 45, sh); } });
        houseFlat(g, 0, 0, season);
      });
      if (b.electricity) {
        g.fillStyle = 'rgba(255,214,120,.5)'; for (const wx of [10, 58]) g.fillRect(20 + wx * 1.35, B - 56 * 1.35 + 12 * 1.35, 12 * 1.35, 14 * 1.35);
        powerPole(g, 156, B + 4, 150); powerPole(g, 690, B + 4, 150);
        g.strokeStyle = '#2a2a2a'; g.lineWidth = 1; g.beginPath();
        g.moveTo(143, B - 140); g.quadraticCurveTo(120, B - 110, 96, B - 84);
        g.moveTo(169, B - 140); g.quadraticCurveTo(430, B - 112, 677, B - 140); g.moveTo(703, B - 140); g.lineTo(W, B - 150); g.stroke();
      }
      if (b.silo) { contactShadow(g, 246, B, 30, 5); place(224, B - 100 * 1.5, 1.5, () => siloFlat(g, 0, 0)); }
      contactShadow(g, 420, B, 190, 10);
      place(290, B - 84 * 1.5, 1.5, () => {
        sideDepth(g, { x0: 0, x1: 150, top: 22, ground: 84, d: [20, -11], roof: [[75, -30], [132, -12], [158, 22]], wall: '#9c2b25', roofColor: '#4a4347', siding: 'boards', stones: 14, snow, corner: WHITE,
          onWall: (map, sh) => { sidePane(g, map, .25, .45, 40, 50, sh); sidePane(g, map, .6, .8, 40, 50, sh); } });
        barnFlat(g, 0, 0, s);
      });
      if (snow) {
        // snow on the gambrel roof
        place(290, B - 84 * 1.5, 1.5, () => { shape(g, [[-8, 22], [18, -12], [75, -30], [132, -12], [158, 22], [150, 22], [126, -6], [75, -22], [24, -6], [4, 22]]); snowFill(g, -30, 22); });
      }
      if (b.milker) { place(400, B + 2, 1, () => milkerFlat(g, 0, 0)); }
      else { for (let k = 0; k < 3; k++) milkCan(g, 392 + k * 15, B + 2, .8); }
      if (b.machine_shed) {
        contactShadow(g, 710, B, 74, 6);
        place(640, B - 50 * 1.4, 1.4, () => {
          sideDepth(g, { x0: 0, x1: 100, top: 13, ground: 50, d: [-14, -8], roof: [[50, -6], [-5, 10]], wall: '#8e3a2c', roofColor: '#4a4347', siding: 'boards', snow, corner: WHITE });
          machineShedFlat(g, 0, 0); if (snow) snowRoof(g, -5, 105, 10, 50, -6);
        });
      }
      if (b.tobacco_shed) {
        contactShadow(g, 872, B, 80, 6);
        place(800, B - 40 * 1.3, 1.3, () => {
          sideDepth(g, { x0: 0, x1: 110, top: 2, ground: 40, d: [-14, -8], roof: [[55, -16], [-4, 2]], wall: '#6d6358', roofColor: '#3f3a36', siding: 'boards', snow });
          tobaccoShedFlat(g, 0, 0); if (snow) snowRoof(g, -4, 114, 2, 55, -16);
        });
      }
      // front row: the woodshed (the Ostehus and granary are on their own layer, in front of the windmill)
      if (b.woodshed) {
        contactShadow(g, 900, F, 44, 5);
        place(860, F - 30 * 1.4, 1.4, () => {
          sideDepth(g, { x0: 0, x1: 56, top: -1, ground: 30, d: [-10, -6], roof: [[-4, -4], [60, 3]], wall: '#7a5a3c', roofColor: '#4d4a48', siding: 'boards', snow });
          woodshedFlat(g, 0, 0); if (snow) { shape(g, [[-4, -4], [60, 3], [60, 5], [-4, -2]]); snowFill(g, -5, 6); }
        });
      }
    });
  }
  // The Ostehus and the granary in three-quarter view in the foreground of the Buildings tab, in front of the house,
  // windmill, and silo, on a transparent layer of their own.
  // [x, scale, ground line]: set low in the foreground so the house shows above them
  const WIDE_FRONT = Object.freeze({ ostehus: [26, 2.52, 510], granary: [184, 2.52, 510] });
  // the men in the yard are sized so a man in his straw hat stands upright in the granary door (21 units x 2.52)
  const YARD_MAN = 1.4;
  function yardWideFront(s, season) {
    const b = s.buildings, snow = season === 'winter', [ox, ok, oy] = WIDE_FRONT.ostehus, [gx, gk, gy] = WIDE_FRONT.granary;
    return cached(`yardfront|${season}|${!!b.cheese_house}|${!!b.granary}`, W, H, g => {
      const place = (x, y, k, draw) => { g.save(); g.translate(x, y); g.scale(k, k); draw(); g.restore(); };
      if (b.cheese_house) { contactShadow(g, ox + 30 * ok, oy, 40 * ok, 4 * ok); place(ox, oy - 33 * ok, ok, () => ostehusWide(g, snow)); }
      if (b.granary) { contactShadow(g, gx + 28 * gk, gy, 34 * gk, 4 * gk); place(gx, gy, gk, () => granaryWide(g, snow)); }
    });
  }
  function yardWide(ctx, s, t, season) {
    const { p } = backdrop(ctx, s, t, season), b = s.buildings, B = WIDE.base, F = WIDE.front, snow = season === 'winter';
    ctx.drawImage(yardWidePlate(s, season, p), 0, 0);
    const scaledAt = (x, y, k, draw) => { ctx.save(); ctx.translate(x, y); ctx.scale(k, k); draw(); ctx.restore(); };
    if (season === 'winter' || season === 'fall') smoke(ctx, 20 + 60 * 1.35, B - 56 * 1.35 - 32 * 1.35, t, 'rgba(200,200,205,', 1.3);
    if (b.windmill) scaledAt(180, B - 90 * 1.45, 1.45, () => windmill(ctx, 0, 0, t));
    // what's in the yard behind the Ostehus and granary: the lumber pile, the firewood, the hens, and in winter a hired
    // man; all in their work clothes: bib overalls over a work shirt, and straw hats
    const work = { overalls: true, straw: true };
    scaledAt(470, F + 34, 1.5, () => lumberPile(ctx, 0, 0, s.store.lumber, season));
    scaledAt(372, F + 30, 1.4, () => woodpile(ctx, 0, 0, s.store.wood, season));
    if (!snow) for (let i = 0; i < 4; i++) scaledAt(590 + i * 34 + Math.sin(t * .3 + i * 2) * 8, 474 + (i % 2) * 8, 1.6, () => chicken(ctx, 0, 0, t, i));
    if (snow) { const hand = patrol(t + 7, 560, 830, 16, 3); pedestrian(ctx, hand.x, 474, YARD_MAN * .94, t, 'man', '#6d8fb4', '#cdb06a', hand.dir, hand.walking, work); }
    if (b.cheese_house || b.granary) ctx.drawImage(yardWideFront(s, season), 0, 0);
    // the curd kettle's fire sends a thin wisp up the Ostehus chimney
    if (b.cheese_house) { const [ox, ok, oy] = WIDE_FRONT.ostehus; smoke(ctx, ox + 44.5 * ok, oy - 33 * ok - 28 * ok, t + 1.3, 'rgba(225,225,230,', .55); }
    // Nels walks along the front of the yard, past the Ostehus and granary
    const nels = patrol(t, 70, 640, 18, 2.5);
    pedestrian(ctx, nels.x, 526, YARD_MAN, t, 'man', '#a5493c', '#d9c07a', nels.dir, nels.walking, work);
    particles(ctx, season, t, s);
    if (snow) { ctx.fillStyle = 'rgba(200,215,235,.12)'; ctx.fillRect(0, 0, W, H); }
    const n = DATA.buildings.filter(d => b[d.id]).length;
    topSign(ctx, `The Knutson place, ${s.year}  ·  ${n} building${n === 1 ? '' : 's'} & improvements  ·  ${(s.store.lumber || 0).toFixed(1)} MBF lumber on hand`);
  }

  return { W, H, scene, machine, lookOf, separator, belt, strawStack, person, horse, cow, smoke, wheel, sky, ridge, PAL, pr, blade, logDeck, spokes, roadCar, roadCarFor, sawyer,
    finish, plate, lit, tone, oatsLead, standingOats,
    seasonOf, particles, lumberPile, dinnerPies, farmyard, baleSide, pasture, buildingThumb, HARVEST_SPEED };
})();

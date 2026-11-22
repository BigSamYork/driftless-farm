// User interface, game flow, threshing mini-game, and cheat console.
const UI = (() => {
  const SAVE_KEY = 'nels-driftless-save-v1';
  let s = null, tab = 'fields', busy = false, muted = false, usedOpen = false;
  let previewLoc = 'strum', previewYear = 1900;
  const $ = (q) => document.querySelector(q);
  const money = (n) => (n < 0 ? '-$' : '$') + Math.round(Math.abs(n)).toLocaleString();
  const fx = (n, d = 0) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Mini-games draw in their own 760-wide units at GAME_RES times the pixels, and their window is fitted to cover the
  // picture area (#stage), so they fill the screen without going soft.
  const GAME_RES = 2;
  function fitGame(modal, cv, LW, LH) {
    const stage = document.getElementById('stage'), r = stage ? stage.getBoundingClientRect() : null;
    const box = r && r.width > 300 && r.height > 200 ? r : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const edge = cv.offsetWidth - cv.clientWidth, chromeW = modal.offsetWidth - cv.offsetWidth, chromeH = modal.offsetHeight - cv.offsetHeight;
    const k = Math.max(.4, Math.min((box.width - 12 - chromeW - edge) / LW, (box.height - 12 - chromeH - edge) / LH));
    const w = Math.floor(LW * k), h = Math.floor(LH * k);
    if (cv.style.width !== `${w}px`) { cv.style.width = `${w}px`; cv.style.height = `${h}px`; }
    Object.assign(modal.style, {
      position: 'fixed', margin: '0', maxWidth: 'none', maxHeight: 'none', overflow: 'hidden',
      left: `${Math.round(box.left + (box.width - (w + edge + chromeW)) / 2)}px`, top: `${Math.round(box.top + (box.height - (h + edge + chromeH)) / 2)}px`,
    });
  }
  function miniFrames(wrap, ctx, st, frame, cleanup, reject) {
    let raf = 0, last = null, finishedAt = null, stopped = false;
    const cv = ctx.canvas, modal = wrap.querySelector('.modal'), LW = cv.width, LH = cv.height;
    cv.width = LW * GAME_RES; cv.height = LH * GAME_RES;
    const fit = () => { if (modal && wrap.isConnected) fitGame(modal, cv, LW, LH); };
    const sizer = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    if (sizer && modal) sizer.observe(modal);
    window.addEventListener('resize', fit); fit();
    const stop = () => {
      stopped = true; cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('resize', fit); if (sizer) sizer.disconnect();
    };
    const visibility = () => {
      last = null; cancelAnimationFrame(raf);
      if (!document.hidden && !stopped) raf = requestAnimationFrame(tick);
    };
    function tick(now) {
      if (!wrap.isConnected) { cleanup(); stop(); return; }
      if (document.hidden) { last = null; return; }
      if (last !== null && now - last < 1000 / 60 - .25) { raf = requestAnimationFrame(tick); return; }
      const dt = last === null ? 0 : Math.max(0, Math.min(.05, (now - last) / 1000));
      last = now; st.t += dt;
      st.shake = Math.max(0, st.shake - dt); st.flashT = Math.max(0, st.flashT - dt / 1.5);
      try { ctx.setTransform(GAME_RES, 0, 0, GAME_RES, 0, 0); frame(dt); }
      catch (e) {
        stop(); cleanup(); ctx.reset(); wrap.remove();
        console.error(e); toast('The mini-game could not continue. Use Load to restore your last spring save.', true);
        reject(e); return;
      }
      if (st.done && finishedAt === null) finishedAt = st.t;
      if (finishedAt !== null && st.t - finishedAt >= .8) { stop(); return; }
      raf = requestAnimationFrame(tick);
    }
    document.addEventListener('visibilitychange', visibility);
    raf = requestAnimationFrame(tick);
    return stop;
  }
  // An offscreen layer for a mini-game, w x h in game units at the games' resolution; draw it with drawLayer.
  function canvasLayer(w, h, paint) {
    const cv = document.createElement('canvas'); cv.width = w * GAME_RES; cv.height = h * GAME_RES; cv.lw = w; cv.lh = h;
    const c = cv.getContext('2d'); c.scale(GAME_RES, GAME_RES);
    paint(c); return cv;
  }
  const drawLayer = (ctx, layer, x, y) => ctx.drawImage(layer, x, y, layer.lw, layer.lh);
  const getPath = (o, p) => p.split('.').reduce((a, k) => a[k], o);
  const setPath = (o, p, v) => { const k = p.split('.'); const last = k.pop(); k.reduce((a, x) => a[x], o)[last] = v; };

  // ---------- sound ----------
  const soundPools = new Map();
  let soundWarning = false;
  const SOUND_TONES = { cut: [660, .08, 'square'], good: [520, .08, 'square'], slug: [110, .3, 'sawtooth'], whistle: [880, .9, 'sine'], coin: [990, .12, 'triangle'] };
  function soundError(e) {
    if (soundWarning) return;
    soundWarning = true; console.error('Game sound unavailable:', e);
    toast('Sound could not play. The game can continue; check the browser sound permission.', true);
  }
  function tonePool(kind) {
    if (soundPools.has(kind)) return soundPools.get(kind);
    const [frequency, duration, shape] = SOUND_TONES[kind], rate = 24000, samples = Math.ceil(rate * duration);
    const buffer = new ArrayBuffer(44 + samples * 2), data = new DataView(buffer);
    const text = (at, value) => { for (let i = 0; i < value.length; i++) data.setUint8(at + i, value.charCodeAt(i)); };
    text(0, 'RIFF'); data.setUint32(4, 36 + samples * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
    data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
    data.setUint32(24, rate, true); data.setUint32(28, rate * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true);
    text(36, 'data'); data.setUint32(40, samples * 2, true);
    for (let i = 0; i < samples; i++) {
      const t = i / rate, cycles = frequency * t + (kind === 'whistle' ? (760 - frequency) * t * t / (2 * duration) : 0);
      const sine = Math.sin(cycles * Math.PI * 2);
      const wave = shape === 'square' ? (sine >= 0 ? 1 : -1) : shape === 'sawtooth' ? 2 * (cycles % 1) - 1 : shape === 'triangle' ? 2 / Math.PI * Math.asin(sine) : sine;
      const gain = .08 * Math.exp(Math.log(.001 / .08) * t / duration);
      data.setInt16(44 + i * 2, Math.round(wave * gain * 32767), true);
    }
    const url = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
    const pool = { voices: [], next: 0, url };
    soundPools.set(kind, pool);
    return pool;
  }
  function sfx(kind) {
    if (muted) return;
    try {
      const pool = tonePool(Object.hasOwn(SOUND_TONES, kind) ? kind : 'good');
      let voice = pool.voices.find(a => a.paused || a.ended);
      if (!voice && pool.voices.length < 3) { voice = new Audio(pool.url); pool.voices.push(voice); }
      if (!voice) { voice = pool.voices[pool.next++ % pool.voices.length]; voice.pause(); }
      voice.currentTime = 0;
      voice.play().catch(e => { if (e.name !== 'AbortError') soundError(e); });
    } catch (e) { soundError(e); }
  }

  // ---------- modal ----------
  function modal({ title = '', html = '', cls = '', buttons = [{ label: 'OK', value: 'ok', primary: true }], onRender, onButton }) {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'modal-wrap';
      wrap.innerHTML = `<div class="modal ${cls}">${title ? `<h2>${title}</h2>` : ''}<div class="modal-body">${html}</div>
        <div class="modal-buttons">${buttons.map((b, i) => `<button class="${b.primary ? 'primary' : ''}" data-i="${i}">${b.label}</button>`).join('')}</div></div>`;
      document.body.appendChild(wrap);
      if (onRender) onRender(wrap);
      wrap.querySelector('.modal-buttons').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-i]');
        if (!btn) return;
        const b = buttons[+btn.dataset.i];
        const value = b.value !== undefined ? b.value : +btn.dataset.i;
        if (onButton && onButton(value, wrap) === false) return;
        wrap.remove();
        resolve(value);
      });
      const first = wrap.querySelector('.modal-buttons button.primary') || wrap.querySelector('.modal-buttons button');
      if (first) first.focus();
    });
  }
  const list = (lines) => `<ul class="report">${lines.filter(Boolean).map((l) => `<li>${l}</li>`).join('')}</ul>`;
  async function banner(text, ms = 1600) {
    const b = $('#banner');
    b.textContent = text; b.classList.add('show');
    await sleep(ms);
    b.classList.remove('show');
    await sleep(250);
  }
  function toast(msg, bad) {
    const t = document.createElement('div');
    t.className = 'toast' + (bad ? ' bad' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }
  function log(msg) {
    if (!s || !msg) return;
    s.log.unshift(`<b>${s.year}</b> ${msg}`);
    s.log.length = Math.min(s.log.length, 80);
    renderLog();
  }

  function nelsSvg(year) {
    const hair = year < 1925 ? '#7a5230' : year < 1945 ? '#a39a8e' : '#e4e0d8';
    return `<svg viewBox="0 0 80 80" class="portrait"><circle cx="40" cy="40" r="38" fill="#efe2c4" stroke="#6b4a2b" stroke-width="3"/>
      <path d="M16 80 Q20 62 40 61 Q60 62 64 80Z" fill="#3b5998"/><rect x="33" y="60" width="4" height="20" fill="#2c4373"/><rect x="43" y="60" width="4" height="20" fill="#2c4373"/>
      <ellipse cx="40" cy="44" rx="15" ry="18" fill="#e8c3a0"/><circle cx="34" cy="42" r="1.8" fill="#333"/><circle cx="46" cy="42" r="1.8" fill="#333"/>
      <path d="M30 52 Q35 47 40 50 Q45 47 50 52 Q40 56 30 52" fill="${hair}"/><rect x="17" y="24" width="46" height="5" rx="2" fill="#4a3a2a"/><rect x="25" y="10" width="30" height="16" rx="4" fill="#4a3a2a"/><rect x="25" y="20" width="30" height="3" fill="#8a2a1e"/></svg>`;
  }
  // Ingrid's year-end letter, hand-printed on ruled paper with her photograph tucked in the corner.
  function ingridLetter(rep, year) {
    return `<h2 class="sr-only">${rep.title}</h2>
      <div class="letter-photo-wrap"><div class="letter-photo">${ingridSvg(year)}Ingrid, ${year}</div></div>
      <p class="letter-place">Near ${Sim.loc(s).town}, vinter ${year}</p>
      <p class="letter-salute">${rep.greeting}</p>
      ${rep.lines.filter(Boolean).map((l) => `<p>${l}</p>`).join('')}
      <p class="letter-closing">${rep.closing}</p>
      <p class="letter-sign">${rep.signature}</p>`;
  }
  function ingridSvg(year) {
    const hair = year < 1925 ? '#d9b45a' : year < 1945 ? '#c9bba0' : '#e6e2da';
    return `<svg viewBox="0 0 80 80" class="portrait" role="img" aria-label="Ingrid"><circle cx="40" cy="40" r="38" fill="#efe2c4" stroke="#6b4a2b" stroke-width="3"/>
      <path d="M14 80 Q18 60 40 59 Q62 60 66 80Z" fill="#7b2a32"/><path d="M30 62 L50 62 L53 80 L27 80Z" fill="#f6f1e4"/>
      <path d="M24 48 Q22 22 40 21 Q58 22 56 48 Q52 31 40 31 Q28 31 24 48Z" fill="${hair}"/>
      <ellipse cx="40" cy="44" rx="14" ry="17" fill="#ecc9a8"/>
      <path d="M25 31 Q40 17 55 31" fill="none" stroke="${hair}" stroke-width="6" stroke-linecap="round"/>
      <path d="M28 29 L31 25 M34 24 L37 21 M42 21 L45 23 M48 24 L51 28" stroke="rgba(0,0,0,.2)" stroke-width="1.2"/>
      <circle cx="34" cy="42" r="1.7" fill="#333"/><circle cx="46" cy="42" r="1.7" fill="#333"/>
      <circle cx="31" cy="48" r="2.4" fill="#f0a8a0" opacity=".6"/><circle cx="49" cy="48" r="2.4" fill="#f0a8a0" opacity=".6"/>
      <path d="M35 52 Q40 56 45 52" fill="none" stroke="#9a4a3a" stroke-width="1.6" stroke-linecap="round"/>
      <circle cx="40" cy="62" r="2" fill="#c9a227"/></svg>`;
  }

  // ---------- save / load ----------
  const SLOTS_KEY = 'nels-driftless-slots-v1';
  const SLOT_COUNT = 6;
  function save() {
    // a save always resumes at the start of a spring; never store the half-finished year while the woodlot is being planned
    if (s && s.season && s.season.woodPlan) return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) { /* storage full or blocked */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? Sim.sanitize(JSON.parse(raw), true) : null;
    } catch (e) { return null; }
  }
  function readSlots() {
    try { const v = JSON.parse(localStorage.getItem(SLOTS_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function writeSlots(slots) {
    try { localStorage.setItem(SLOTS_KEY, JSON.stringify(slots)); return true; } catch (e) { toast('Could not save: browser storage is full or blocked.', true); return false; }
  }
  const slotSummary = (st) => `${Sim.loc(st).town} · ${st.year} · ${money(Sim.netWorth(st))} · ${st.land} ac · ${st.cows} cows`;
  const canSave = () => s && !busy && (s.phase === 'spring' || s.over);

  async function saveDialog() {
    if (!s) return;
    if (!canSave()) { toast('You can save during spring planning, before the season begins.', true); return; }
    const slots = readSlots();
    const rows = Array.from({ length: SLOT_COUNT }, (_, i) => {
      const e = slots[i];
      return `<tr><td><b>Slot ${i + 1}</b></td><td>${e ? `${esc(e.name)}<br><small>${esc(e.summary)} · saved ${esc(new Date(e.savedAt).toLocaleString())}</small>` : '<small>empty</small>'}</td>
        <td><button data-slot="${i}" class="${e ? '' : 'primary'}">${e ? 'Overwrite' : 'Save here'}</button></td></tr>`;
    }).join('');
    const html = `<p>Save the farm as it stands in <b>spring ${s.year}</b>. Saves stay in this browser; use <b>Export to file</b> to keep a copy anywhere.</p>
      <label class="save-name">Save name <input id="saveName" maxlength="40" value="${esc(`Nels, ${Sim.loc(s).town} ${s.year}`)}"></label>
      <table class="tbl slots">${rows}</table>`;
    await modal({
      title: 'Save Game', cls: 'wide', html,
      buttons: [{ label: 'Export to file', value: 'export' }, { label: 'Close', value: 'close', primary: true }],
      onRender: (root) => root.querySelector('.slots').addEventListener('click', async (ev) => {
        const b = ev.target.closest('button[data-slot]');
        if (!b) return;
        const i = +b.dataset.slot, cur = readSlots();
        if (cur[i] && !window.confirm(`Overwrite "${cur[i].name}"?`)) return;
        const name = (root.querySelector('#saveName').value || '').trim().slice(0, 40) || `Spring ${s.year}`;
        cur[i] = { name, savedAt: Date.now(), year: s.year, summary: slotSummary(s), state: s };
        if (writeSlots(cur)) { save(); toast(`Saved to slot ${i + 1}: ${name}`); sfx('coin'); root.querySelector('.modal-buttons button.primary').click(); }
      }),
      onButton: (v) => { if (v === 'export') { exportSave(); return false; } return true; },
    });
  }
  function exportSave() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ game: 'nels-of-the-driftless', savedAt: new Date().toISOString(), state: s }, null, 1)], { type: 'application/json' }));
    a.download = `Nels_${Sim.loc(s).town.replace(/\W+/g, '')}_${s.year}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Save file downloaded.');
  }
  function readImport(file) {
    return new Promise((resolve) => {
      if (!file) return resolve(null);
      if (file.size > 3e6) { toast('That file is too large to be a save.', true); return resolve(null); }
      const fr = new FileReader();
      fr.onload = () => {
        try {
          const raw = JSON.parse(fr.result);
          const st = Sim.sanitize(raw && raw.state ? raw.state : raw, false);
          if (!st) toast('That file is not a Driftless Farm save.', true);
          resolve(st);
        } catch (e) { toast('Could not read that save file.', true); resolve(null); }
      };
      fr.onerror = () => resolve(null);
      fr.readAsText(file);
    });
  }
  // Resolves with a sanitized state to load, or null if cancelled.
  function loadDialog() {
    return new Promise((resolve) => {
      let chosen = null;
      const slots = readSlots(), auto = load();
      const rows = [];
      if (auto) rows.push(`<tr><td><b>Autosave</b></td><td><small>${esc(slotSummary(auto))}</small></td><td><button data-load="auto" class="primary">Load</button></td></tr>`);
      for (let i = 0; i < SLOT_COUNT; i++) {
        const e = slots[i];
        if (e) rows.push(`<tr><td><b>Slot ${i + 1}</b></td><td>${esc(e.name)}<br><small>${esc(e.summary)} · saved ${esc(new Date(e.savedAt).toLocaleString())}</small></td>
          <td><button data-load="${i}" class="primary">Load</button> <button data-del="${i}">Delete</button></td></tr>`);
      }
      const html = `<table class="tbl slots">${rows.join('') || '<tr><td>No saved games yet.</td></tr>'}</table>
        <p class="hint">Or load a save file you exported earlier:</p><input type="file" id="importFile" accept=".json,application/json">`;
      modal({
        title: 'Load Game', cls: 'wide', html, buttons: [{ label: 'Cancel', value: 'cancel' }],
        onRender: (root) => {
          root.querySelector('.slots').addEventListener('click', (ev) => {
            const l = ev.target.closest('button[data-load]'), d = ev.target.closest('button[data-del]');
            if (d) {
              const cur = readSlots(), i = +d.dataset.del;
              if (cur[i] && window.confirm(`Delete "${cur[i].name}"?`)) { cur[i] = null; writeSlots(cur); d.closest('tr').remove(); }
              return;
            }
            if (!l) return;
            chosen = l.dataset.load === 'auto' ? load() : Sim.sanitize((readSlots()[+l.dataset.load] || {}).state, true);
            if (!chosen) { toast('That save could not be read.', true); return; }
            root.querySelector('.modal-buttons button').click();
          });
          root.querySelector('#importFile').addEventListener('change', async (ev) => {
            chosen = await readImport(ev.target.files[0]);
            if (chosen) root.querySelector('.modal-buttons button').click();
          });
        },
      }).then(() => resolve(chosen));
    });
  }
  async function resumeGame(st) {
    s = st;
    $('#app').classList.remove('titlemode');
    save();
    render();
    log(`Game loaded: ${Sim.loc(s).town}, ${s.year}.`);
    if (s.over) return endGame();
    if (s.phase !== 'spring') await startYear();
  }
  async function loadFromMenu() {
    if (busy) { toast('Finish the current season step first.', true); return; }
    const st = await loadDialog();
    if (st) await resumeGame(st);
  }

  // ---------- title ----------
  async function title() {
    s = null;
    $('#app').classList.add('titlemode');
    const saved = load();
    const years = []; for (let y = 1900; y <= 1940; y++) years.push(y);
    // The title screen is a first-edition front page in the same style as The Coulee Courier.
    const html = `<div class="paper-top">
        <div class="paper-ear"><b>First Edition</b>Gudbrandsdalen to the coulees</div>
        <h1 class="masthead">The Driftless Farm</h1>
        <div class="paper-ear"><b>Version</b>${DATA.version}</div>
      </div>
      <div class="paper-motto">“A Wisconsin Farm Chronicle, 1900&ndash;1970”</div>
      <div class="dateline"><span>Vol. I &mdash; No. 1</span><span id="tDate"></span><span>Two Cents</span></div>
      <h2 class="headline">Norwegian Farmer Takes Up Coulee Land</h2>
      <p class="paper-deck">Arrives with a Trunk, a Bible, and a Cheese Recipe</p><hr class="paper-rule">
      <figure class="paper-cut">${nelsSvg(1900)}<figcaption>Mr. Nels Knutson</figcaption></figure>
      <p class="story dropcap">Nels Knutson came from Gudbrandsdalen with a trunk, a Bible, and a cheese recipe. Now he farms a coulee in the Driftless country of Wisconsin and Minnesota &mdash; hills the glaciers never flattened. Plant, thresh, hull clover, milk cows, make cheese, and keep Ingrid happy through up to ${DATA.gameYears} years of history.</p>
      <div class="paper-lower title-lower">
        <div><h3 class="paper-h4">Choose Your Homestead</h3>
          <div class="form-grid">
            <label>Homestead near<select id="tLoc">${DATA.locations.map((l) => `<option value="${l.id}">${l.town}, ${l.county}</option>`).join('')}</select></label>
            <label>Starting year<select id="tYear">${years.map((y) => `<option ${y === 1900 ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
          </div>
          <p class="paper-small" id="tBlurb"></p>
          <p class="paper-small"><b>Homestead benefit:</b> <span id="tBonus"></span></p>
          <p class="paper-small"><b>Your chronicle:</b> <span id="tSpan"></span></p>
        </div>
        <div><h3 class="paper-h4">Notices</h3>
          <p class="paper-notice"><b>NEW IN 2.1</b>Every view is redrawn with sunlight and shade; the home place has its own Buildings tab; hay is baled from 1947 on Baling Day; and the Market opens in spring and winter as well as after harvest.</p>
          <p class="paper-notice"><b>CHEAT &amp; TEST CONSOLE</b>Press <kbd>\`</kbd> (backtick) or <kbd>F2</kbd> any time.</p>
        </div>
      </div>`;
    const buttons = [{ label: 'Begin a New Chronicle', value: 'new', primary: true }];
    if (saved) buttons.push({ label: `Continue (${saved.year})`, value: 'cont' });
    buttons.push({ label: 'Load Game…', value: 'load' });
    let opts = null;
    const onRender = (root) => {
      const locSel = root.querySelector('#tLoc'), yearSel = root.querySelector('#tYear');
      const sync = () => {
        previewLoc = locSel.value; previewYear = +yearSel.value;
        const L = DATA.locations.find((l) => l.id === previewLoc);
        root.querySelector('#tBlurb').textContent = `${L.town}, on the ${L.river}: ${L.blurb}`;
        root.querySelector('#tDate').textContent = `${L.town}, ${L.state === 'Minn.' ? 'Minnesota' : 'Wisconsin'}, spring ${previewYear}`;
        root.querySelector('#tBonus').textContent = L.bonus.text;
        const end = Math.min(previewYear + DATA.gameYears - 1, DATA.lastYear);
        root.querySelector('#tSpan').textContent = `${previewYear}–${end} (${end - previewYear + 1} seasons)`;
      };
      locSel.value = previewLoc;
      locSel.addEventListener('change', sync); yearSel.addEventListener('change', sync);
      sync();
    };
    const v = await modal({ html, cls: 'title newspaper', buttons, onRender, onButton: (val, root) => { opts = { locId: root.querySelector('#tLoc').value, startYear: +root.querySelector('#tYear').value }; } });
    if (v === 'load') {
      const st = await loadDialog();
      if (st) return resumeGame(st);
      return title();
    }
    $('#app').classList.remove('titlemode');
    if (v === 'cont') return resumeGame(saved);
    s = Sim.newGame(opts);
    render();
    const L = Sim.loc(s);
    await modal({
      title: `Spring ${s.year} — near ${L.town}`,
      html: `<div class="title-art">${nelsSvg(s.year)}<div><p>Nels and Ingrid hold a mortgage on <b>${s.land} acres</b> in the hills above the ${L.river}: about ${Sim.cropland(s)} acres of ridge-top and valley cropland, ${Sim.pasture(s)} acres of pasture, and ${Sim.woods(s)} acres of oak woods on the steep coulee sides.</p></div></div>
      <p>You start with ${s.cows} cows, ${s.horses} work horses, a grain binder${s.startYear >= 1925 ? ', a used McCormick-Deering 10-20' : ''}, ${money(s.cash)} in cash, and a ${money(s.debt)} mortgage.</p>
      <p><b>Homestead benefit:</b> ${L.bonus.text}</p>
      <p><b>The chronicle</b> runs ${Sim.finalYear(s) - s.year + 1} seasons, from ${s.year} through the harvest of ${Sim.finalYear(s)}.</p>
      <p><b>Each year has two rounds.</b> <b>Summer:</b> plan your fields, herd, dairy, and harvest in the panel on the right, then press <b>Plant &amp; Begin the Season</b>. Thresh the small grain, hull the clover, make cheese, and sell at the fall market. <b>Winter:</b> plan the woodlot (firewood and saw logs), press <b>Begin the Winter Work</b>, split the wood and run the sawmill &mdash; and see what history brings.</p>`,
      buttons: [{ label: 'Uff da, let\'s farm!', primary: true }],
    });
    await startYear();
  }

  // ---------- year flow ----------
  async function startYear() {
    busy = true;
    if (tab === 'woods') tab = 'fields';
    try {
      const r = Sim.yearStart(s);
      render();
      if (s.year > s.startYear) {
        const fresh = DATA.machines.filter((m) => m.from === s.year);
        if (fresh.length) r.notes.push(`New at the implement dealer: ${fresh.map((m) => m.name).join(', ')}.`);
      }
      if (r.notes.length) { r.notes.forEach(log); await modal({ title: `Spring ${s.year}`, html: list(r.notes), buttons: [{ label: 'Continue', primary: true }] }); }
      for (const ev of r.events) await newspaper(ev);
      save();
    } finally { busy = false; render(); }
  }
  // A front page of The Coulee Courier. The lower half carries the real market prices and a period notice.
  const COURIER_NOTICES = [
    ['LUTEFISK SUPPER', 'Saturday evening in the church basement. Lefse, meatballs, and coffee. Free-will offering.'],
    ['WANTED', 'Two strong hands for threshing season. Inquire at the elevator office.'],
    ['BINDER TWINE', 'Fresh stock at the Farmers Co-op. Order early; bring your own sacks.'],
    ['SONS OF NORWAY', 'The lodge meets Tuesday at eight. Bring a dish to pass.'],
    ['OLD-TIME DANCE', 'Town hall, Saturday night. Music by the Hardanger fiddlers. Ladies free.'],
    ['CUSTOM GRINDING', 'Buckwheat, rye, and feed ground Wednesdays at the mill. Bring your grain dry.'],
    ['CREAM CHECKS', 'Paid Saturdays at the creamery. Bring your cans clean and scalded.'],
    ['STRAYED', 'Brown heifer, white star on forehead. Finder please notify the Courier office. Reward.'],
  ];
  const WEATHER = { spring: 'Fair and mild; mud in the lanes', summer: 'Warm; thunder by evening', fall: 'Cool; frost likely tonight', winter: 'Cold; snow flurries' };
  function courier(head, body, effect = '', season = s ? s.phase : 'spring') {
    const L = Sim.loc(s), y = s.year, state = L.state === 'Minn.' ? 'Minnesota' : 'Wisconsin';
    const issue = 1 + ((y * 7 + (season === 'summer' ? 23 : 3)) % 48);
    const [nHead, nText] = COURIER_NOTICES[(y + (season === 'summer' ? 3 : 0)) % COURIER_NOTICES.length];
    const prices = ['wheat', 'oats', 'corn', 'hay'].map((g) => {
      const d = DATA.goods[g], p = Sim.sellPrice(s, g);
      return `<tr><td>${d.name}, per ${d.unit === 't' ? 'ton' : d.unit}</td><td>${Math.round(p * 100) < 100 ? `${Math.round(p * 100)}&cent;` : `$${p.toFixed(2)}`}</td></tr>`;
    }).join('');
    return `<div class="paper-top">
        <div class="paper-ear"><b>Est. 1884</b>${L.town} &amp; the coulees</div>
        <div class="masthead">The Coulee Courier</div>
        <div class="paper-ear"><b>Weather</b>${WEATHER[season] || WEATHER.spring}</div>
      </div>
      <div class="paper-motto">“All the News of the Ridges and the Valleys”</div>
      <div class="dateline"><span>Vol. ${y - 1883} &mdash; No. ${issue}</span><span>${L.town}, ${state}, ${season} ${y}</span><span>Two Cents</span></div>
      <h3 class="headline">${head}</h3>
      <p class="paper-deck">Special to the Courier</p><hr class="paper-rule">
      <p class="story ${String(body).length > 110 ? 'dropcap' : String(body).length < 70 ? 'short' : ''}">${body}</p>${effect ? `<p class="effect">${effect}</p>` : ''}
      <div class="paper-lower">
        <div><h4>Markets at the Elevator</h4><table>${prices}</table></div>
        <div><h4>Notices</h4><p class="paper-notice"><b>${nHead}</b>${nText}</p></div>
      </div>`;
  }
  async function newspaper(ev) {
    const pre = !ev.choices ? Sim.applyEvent(s, ev, -1) : '';
    const html = courier(ev.head, ev.body, pre, 'spring');
    const buttons = ev.choices ? ev.choices.map((c, i) => ({ label: c.label, value: i, primary: i === 0 })) : [{ label: 'Fold the paper', value: -1, primary: true }];
    const choice = await modal({ html, cls: 'newspaper', buttons });
    if (ev.choices) {
      const txt = Sim.applyEvent(s, ev, choice);
      log(`${ev.head}: ${txt}`);
      if (txt) await modal({ title: ev.head, html: `<p>${txt}</p>`, buttons: [{ label: 'Very well', primary: true }] });
    } else if (pre) log(`${ev.head}: ${pre}`);
    render();
  }

  async function beginSeason() {
    if (busy || !s || s.over) return;
    busy = true; render();
    try {
      const year = s.year;
      Sim.commitPlan(s).forEach(log);
      render();
      await banner(`Summer ${year}`, 2000);
      for (const e of Sim.summer(s)) {
        log(`${e.head}: ${e.text}`);
        await modal({ html: courier(e.head, e.text, '', 'summer'), cls: 'newspaper', buttons: [{ label: 'Continue', primary: true }] });
        render();
      }
      const lines = Sim.harvest(s);
      render();
      await banner(`Harvest ${year}`, 1500);
      await modal({ title: `The ${year} Harvest`, html: list(lines), buttons: [{ label: Sim.hayingDue(s) ? (Sim.balerRig(s) ? 'On to baling!' : 'Put up the hay') : s.season.smallBu > 0 ? 'On to threshing!' : 'Continue', primary: true }] });
      if (Sim.hayingDue(s)) {
        const rig = Sim.balerRig(s);
        const eff = rig ? await balingDay(rig) : 1;
        const r = Sim.haying(s, eff);
        r.lines.forEach(log);
        await modal({ title: rig ? 'Baling is done' : 'Haying', html: `${rig ? `<p>Baling efficiency: <b>${Math.round(eff * 100)}%</b></p>` : ''}${list(r.lines)}`, buttons: [{ label: s.season.smallBu > 0 ? 'On to threshing!' : 'Continue', primary: true }] });
        render();
      }
      if (s.season.smallBu > 0) {
        const eff = await threshDay('thresh');
        const r = Sim.threshing(s, eff);
        r.lines.forEach(log);
        await modal({ title: 'Threshing is done', html: `<p>Separator efficiency: <b>${Math.round(eff * 100)}%</b></p>${list(r.lines)}`, buttons: [{ label: 'Continue', primary: true }] });
        render();
      }
      if ((s.season.gross.cloverSeed || 0) > 0) {
        const eff = await threshDay('hull');
        const r = Sim.hulling(s, eff);
        r.lines.forEach(log);
        await modal({ title: 'Clover Hulling', html: `<p>Huller efficiency: <b>${Math.round(eff * 100)}%</b></p>${list(r.lines)}`, buttons: [{ label: 'Continue', primary: true }] });
      }
      const d = Sim.dairy(s);
      await modal({ title: 'The Dairy Year', html: list(d), buttons: [{ label: 'To the fall market', primary: true }] });
      render();
      await marketWindow();
      // second round of the year: the crops are in; now the woodlot work is planned for winter
      s.phase = 'winter'; s.season.woodPlan = true; tab = 'woods';
      render();
      await banner(`Winter ${year}`, 1500);
      log(`Winter ${year}: plan the woodlot work, then press "Begin the ${year} Winter Work".`);
    } finally { busy = false; render(); }
  }

  // ---------- the winter round: woodlot work, then Ingrid's letter ----------
  async function beginWinter() {
    if (busy || !s || s.over || !(s.season && s.season.woodPlan)) return;
    busy = true; s.season.woodPlan = false; render();
    let wintered = false;
    try {
      const year = s.year, w = Sim.woodlotInfo(s);
      if (w.cords > 0 && w.buzz && !w.chain) s.season.buzzEff = await woodDay('buzz', w);
      if (w.cords > 0) s.season.woodEff = await woodDay('split', w);
      if (w.logs > 0 && w.method === 'own') s.season.sawEff = await woodDay('saw', w);
      render();
      const rep = Sim.winter(s);
      wintered = true;
      render();
      await modal({ cls: 'letter-modal', html: ingridLetter(rep, year), buttons: [{ label: s.over ? 'Continue' : `Takk, Ingrid! On to ${s.year + 1}`, primary: true }] });
      Sim.nextYear(s);
      save();
      if (s.over) { busy = false; return endGame(); }
      busy = false;
      await startYear();
    } catch (e) {
      console.error(e);
      if (!wintered && s && s.season) {
        s.season.woodPlan = true;
        toast('Something went wrong in the winter work. Press Begin the Winter Work to try again.', true);
      }
    } finally { busy = false; render(); }
  }
  const SPLIT_ROUNDS = 14, SAW_BOARDS = 10, SAW_TIME = 50, BUZZ_BLOCKS = 16;
  const WOOD_GAMES = {
    split: { title: 'Splitting Firewood', play: 'Split it myself', best: 1.15, done: 'Splitting firewood' },
    saw: { title: 'Sawing Day', play: 'Run the saw myself', best: 1.12, done: 'Sawing lumber' },
    buzz: { title: 'Buzz Saw Day', play: 'Run the buzz saw myself', best: 1.1, done: 'Bucking on the buzz saw' },
  };
  async function woodDay(kind, w) {
    const G = WOOD_GAMES[kind];
    if (s.cheats.perfect) { toast(`Cheat: perfect ${G.done.toLowerCase()}`); return G.best; }
    if (!s.plan.woodGame) return 1;
    const rig = kind === 'buzz' ? Sim.buzzPower(s) : Sim.woodRig(s);
    if (kind === 'saw' && rig.job !== 'sawmill') return 1;
    const tool = w.chain ? 'with the chain saw' : w.buzz ? 'on the buzz saw' : 'with the crosscut saw';
    const html = {
      split: () => `<p>${fx(w.cords)} cords of wood to buck up ${tool}, and every round has to be split. Swing the maul yourself: a marker sweeps back and forth across the <b>swing meter</b>. Press <kbd>Space</kbd> (or click the picture) while it is in the <b>green</b>; the dark center gives a clean split. Outside the green the maul glances off and you swing again. Knotty rounds have a narrower green.</p><p class="hint">Good splitting fills the woodpile up to 15% fuller than the crew would; sloppy work up to 15% short.</p>`,
      saw: () => `<p>${fx(w.logs, 1)} MBF of saw logs to run through your ${w.mill && w.mill.name}. You are the sawyer: <b>hold</b> <kbd>Space</kbd> (or hold the mouse button on the picture) to feed the carriage into the blade. Cutting pulls the blade speed down. Let off before the needle drops into the red, or the saw bogs down and the belt flies off. Saw ${SAW_BOARDS} boards before the dinner bell (${SAW_TIME} seconds).</p><p class="hint">A good sawyer gets up to 12% more lumber from the logs; a poor one up to 15% less.</p>`,
      buzz: () => `<p>The poles are skidded up from the woods, and the buzz saw is belted to your ${Sim.machineDef(rig.powerId).name}. The boy slides each pole along the tilting table; you swing the table into the blade. Press <kbd>Space</kbd> (or click the picture) when the end of the pole reaches the <b>16-inch mark</b> on the measuring stick &mdash; stove length. The boy pushes in fits and starts, so watch him. Cut too soon and you make kindling; too late and the block won't fit Ingrid's range. Buck ${BUZZ_BLOCKS} blocks.</p><p class="hint">Blocks of the right length stack tight: up to 10% more firewood than the crew's work, or 10% less if they're all over the place.</p>`,
    }[kind]();
    const v = await modal({
      title: G.title, cls: `wood-prompt ${kind}`, html,
      buttons: [{ label: G.play, value: 'play', primary: true }, { label: 'Let the crew handle it (100%)', value: 'auto' }],
    });
    if (v === 'auto') return 1;
    const eff = await (kind === 'split' ? splitGame() : kind === 'saw' ? sawGame(rig) : buzzGame(rig));
    log(`${G.done}: your own work came to ${Math.round(eff * 100)}% of a crew's.`);
    return eff;
  }
  // ---------- buzz saw mini-game: swing the table when the pole reaches stove length ----------
  function buzzGame(rig) {
    return new Promise((resolve, reject) => {
      const W = 760, H = 330, N = BUZZ_BLOCKS, BX = 420, BY = 258, BR = 28, PY = 256, PR = 9, MARK = BX + 48, POLE = 230, FEET = 304;
      const st = { endX: BX - 50, len: POLE, pole: 1, blocks: 0, perfect: 0, good: 0, bad: 0, cut: -1, res: null, falling: [], pile: [], roll: 0, flash: null, flashT: 0, done: false, t: 0, ph: Math.random() * 6, ang: 0, shake: 0 };
      let resultEff = 1;
      const wrap = document.createElement('div');
      wrap.className = 'modal-wrap';
      wrap.innerHTML = `<div class="modal game buzz"><h2>Buzz Saw Day &mdash; ${s.year}</h2>
        <canvas width="${W}" height="${H}"></canvas>
        <div class="modal-buttons"><button class="primary" data-k="cut">Swing the table into the saw (Space)</button><button data-k="done" disabled>Continue</button></div></div>`;
      document.body.appendChild(wrap);
      const cv = wrap.querySelector('canvas'), ctx = cv.getContext('2d');
      const finishBtn = wrap.querySelector('[data-k="done"]');
      const flash = (text, color) => { st.flash = [text, color]; st.flashT = 1; };
      const eng = Sim.machineDef(rig.powerId).type === 'engine';
      function swing(auto) {
        if (st.done || st.cut >= 0 || st.roll > 0) return;
        if (!auto && st.endX - BX < 14) { st.bad++; flash('Nothing to cut yet!', '#a3262a'); return; }
        const d = st.endX - MARK;
        st.res = Math.abs(d) < 5 ? 'perfect' : Math.abs(d) < 14 ? 'good' : d < 0 ? 'short' : 'long';
        st.cut = 0;
      }
      function sever() {
        const blockLen = st.endX - BX, r = st.res;
        st.falling.push({ x0: BX + blockLen / 2, len: blockLen, p: 0, slot: st.pile.length + st.falling.length, res: r });
        st.len -= blockLen; st.endX = BX; st.blocks++;
        if (r === 'perfect') { st.perfect++; flash('Stove length!', '#2e7d32'); sfx('cut'); }
        else if (r === 'good') { st.good++; flash('Close enough', '#7a6a1a'); sfx('good'); }
        else { st.bad++; st.shake = .2; flash(r === 'short' ? 'Short \u2014 that one\u2019s kindling' : 'Too long \u2014 it won\u2019t fit the range!', '#a3262a'); sfx('slug'); }
        if (st.blocks >= N) finish();
        else if (st.len < 56) { st.len = POLE; st.endX = BX - 30; st.roll = .7; st.pole++; }
      }
      function finish() {
        st.done = true;
        const score = (st.perfect + .7 * st.good) / N;
        resultEff = Math.max(.9, Math.min(1.1, .9 + .2 * score - .02 * st.bad));
        flash(`Done! Firewood at ${Math.round(resultEff * 100)}%`, '#1d4d8a'); st.flashT = 99;
        finishBtn.disabled = false; finishBtn.classList.add('primary'); finishBtn.focus();
        window.removeEventListener('keydown', key);
      }
      function key(e) { if (e.code === 'Space') { e.preventDefault(); swing(false); } }
      window.addEventListener('keydown', key);
      cv.addEventListener('mousedown', () => swing(false));
      wrap.querySelector('.modal-buttons').addEventListener('click', (e) => {
        const k = e.target.closest('button') && e.target.closest('button').dataset.k;
        if (k === 'cut') swing(false);
        else if (k === 'done' && !finishBtn.disabled) { stopFrames(); window.removeEventListener('keydown', key); wrap.remove(); resolve(resultEff); }
      });
      const slotXY = (i) => { const row = Math.floor(i / 7), col = i % 7; return { x: 520 + col * 22 + (row % 2) * 11, y: 316 - row * 18 }; };
      function frame(dt) {
        st.ang += dt * (eng ? 22 : 26);
        if (!st.done) {
          if (st.roll > 0) st.roll = Math.max(0, st.roll - dt);
          else if (st.cut >= 0) {
            const prev = st.cut; st.cut += dt / .4;
            if (prev < .5 && st.cut >= .5) sever();
            if (st.cut >= 1) st.cut = -1;
          } else {
            // the boy pushes the pole in fits and starts
            st.endX += (40 + 3 * st.blocks) * (.4 + 1.2 * Math.abs(Math.sin(st.t * 1.6 + st.ph))) * dt;
            if (st.endX > MARK + 34) { flash('Whoa! Too far!', '#a3262a'); swing(true); }
          }
        }
        for (const b of st.falling) { b.p += dt / .5; if (b.p >= 1) { b.gone = true; st.pile.push(b.res); } }
        st.falling = st.falling.filter((b) => !b.gone);
        draw(st.t);
      }
      function draw(t) {
        ctx.save();
        if (st.shake > 0) ctx.translate((Math.random() - .5) * 6, (Math.random() - .5) * 4);
        winterYard(ctx, W, H, t, 240);
        // engine at the back, belted to the saw arbor
        const P = Art.machine(ctx, rig.powerId, 690, 262, eng ? 1.7 : 1.3, t, 'belt', rig.powerYear);
        const AX = BX + 30, AY = BY + 4;
        // the boy at the tail of the pole and Nels at the table, both behind it
        const tail = Math.max(-20, st.endX - st.len), boyX = Math.max(40, Math.min(BX - 120, tail - 12));
        ctx.save(); ctx.translate(boyX, FEET - 4); ctx.scale(2.2, 2.2); Art.person(ctx, 0, -17, '#556b2f'); ctx.restore();
        ctx.save(); ctx.translate(BX - 66, FEET - 4); ctx.scale(2.2, 2.2); Art.person(ctx, 0, -17, '#a5493c', '#d9c07a'); ctx.restore();
        // sawbuck frame and blade
        ctx.strokeStyle = '#5a4332'; ctx.lineWidth = 5;
        for (const lx of [BX - 120, BX - 30, BX + 96]) { ctx.beginPath(); ctx.moveTo(lx - 8, FEET); ctx.lineTo(lx + 8, PY + PR + 4); ctx.moveTo(lx + 8, FEET); ctx.lineTo(lx - 8, PY + PR + 4); ctx.stroke(); }
        Art.blade(ctx, BX, BY, BR, -st.ang);
        ctx.strokeStyle = '#333'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(BX, BY); ctx.lineTo(AX, AY); ctx.stroke();
        Art.spokes(ctx, AX, AY, 8, '#222', -st.ang);
        Art.belt(ctx, P.x, P.y, AX, AY, t, { r1: P.r, r2: 8, width: 2.5, phase: st.ang * 8 });
        const tilt = st.cut >= 0 ? 9 * Math.sin(Math.PI * Math.min(1, st.cut)) : 0;
        const rollY = st.roll > 0 ? -26 * Math.sin(st.roll / .7 * Math.PI) : 0;
        ctx.fillStyle = '#8a6a44'; ctx.fillRect(BX - 150, PY + PR - tilt, 270, 6);
        // the pole
        const y0 = PY - PR - tilt + rollY, x0 = Math.max(-20, st.endX - st.len);
        if (!st.done) {
          ctx.fillStyle = '#6b4a2a'; ctx.fillRect(x0, y0, st.endX - x0, 2 * PR);
          ctx.strokeStyle = 'rgba(40,25,10,.45)'; ctx.lineWidth = 1;
          for (let k = 1; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x0 + 2, y0 + k * 6); ctx.lineTo(st.endX - 2, y0 + k * 6 + (k % 2 ? 1 : -1)); ctx.stroke(); }
          ctx.fillStyle = '#d9b380'; ctx.beginPath(); ctx.ellipse(st.endX, y0 + PR, 4, PR, 0, 0, 7); ctx.fill();
          if (st.cut >= 0 && st.cut < .5) {
            ctx.strokeStyle = '#2b1d10'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(BX, y0 + 2 * PR * (1 - st.cut * 2)); ctx.lineTo(BX, y0 + 2 * PR); ctx.stroke();
            for (let k = 0; k < 12; k++) { const ph = (t * 3 + k / 12) % 1; ctx.fillStyle = `rgba(225,195,135,${.9 * (1 - ph)})`; ctx.fillRect(BX - 4 - ph * 30 + Math.sin(k * 3) * 4, y0 + 2 * PR + ph * 24, 2.5, 2.5); }
          }
        }
        // the upper teeth show above the pole
        ctx.save(); ctx.beginPath(); ctx.rect(BX - BR - 2, BY - BR - 2, 2 * BR + 4, Math.max(0, y0 - (BY - BR - 2))); ctx.clip(); Art.blade(ctx, BX, BY, BR, -st.ang); ctx.restore();
        // measuring stick with the 16-inch mark
        const sy = PY + PR + 16;
        ctx.fillStyle = '#efe3c2'; ctx.fillRect(BX, sy, 84, 8);
        ctx.fillStyle = '#9fd09f'; ctx.fillRect(MARK - 14, sy, 28, 8);
        ctx.fillStyle = '#2e7d32'; ctx.fillRect(MARK - 5, sy, 10, 8);
        ctx.strokeStyle = '#5a4332'; ctx.lineWidth = 1; ctx.strokeRect(BX, sy, 84, 8);
        for (let k = 0; k <= 28; k += 2) { const x = BX + k * 3; ctx.beginPath(); ctx.moveTo(x, sy); ctx.lineTo(x, sy + (k % 8 ? 3 : 6)); ctx.stroke(); }
        ctx.fillStyle = '#a3262a'; ctx.fillRect(MARK - 1, sy - 6, 2, 16);
        ctx.font = 'bold 11px Georgia'; ctx.textAlign = 'center'; ctx.fillText('16 in', MARK, sy + 21);
        // the block pile and blocks in the air
        const endView = (x, y, res) => {
          ctx.fillStyle = '#5a3d22'; ctx.beginPath(); ctx.arc(x, y, 10, 0, 7); ctx.fill();
          ctx.fillStyle = res === 'perfect' || res === 'good' ? '#d9b380' : '#c7a77a'; ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.fill();
          ctx.strokeStyle = 'rgba(122,85,48,.6)'; ctx.lineWidth = .8; ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.stroke();
        };
        st.pile.forEach((r, i) => { const p = slotXY(i); endView(p.x, p.y, r); });
        for (const b of st.falling) {
          const p = Math.min(1, b.p), dst = slotXY(b.slot), x = b.x0 + (dst.x - b.x0) * p, y = PY + (dst.y - PY) * p - 50 * Math.sin(Math.PI * p);
          ctx.save(); ctx.translate(x, y); ctx.rotate(p * 3);
          ctx.fillStyle = '#6b4a2a'; ctx.fillRect(-b.len / 2, -PR, b.len, 2 * PR);
          ctx.fillStyle = '#d9b380'; ctx.beginPath(); ctx.ellipse(b.len / 2, 0, 3, PR, 0, 0, 7); ctx.fill();
          ctx.restore();
        }
        Art.finish(ctx, 'winter');
        // HUD
        ctx.fillStyle = 'rgba(255,250,235,.85)'; ctx.fillRect(10, 10, 330, 62);
        ctx.fillStyle = '#3b2a1e'; ctx.textAlign = 'left'; ctx.font = 'bold 14px Georgia';
        ctx.fillText(`Blocks: ${st.blocks} / ${N}     Pole ${st.pole}`, 20, 30);
        ctx.font = '13px Georgia';
        ctx.fillText(`Stove length ${st.perfect}   Close ${st.good}   Kindling/too long ${st.bad}`, 20, 52);
        gameFlash(ctx, st, W, 110);
        ctx.restore();
      }
      const stopFrames = miniFrames(wrap, ctx, st, frame, () => window.removeEventListener('keydown', key), reject);
    });
  }
  const winterLayers = new Map();
  function winterYard(ctx, W, H, t, groundY) {
    const key = `${W}:${H}:${groundY}`;
    if (!winterLayers.has(key)) winterLayers.set(key, canvasLayer(W + 20, H + 20, c => {
      c.translate(10, 10); paintWinterYard(c, W, H, groundY);
    }));
    drawLayer(ctx, winterLayers.get(key), -10, -10);
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    for (let k = 0; k < 40; k++) { const x = (Art.pr(k) * W + t * 12 * (1 + Art.pr(k + 3))) % W, y = (Art.pr(k + 7) * H + t * (24 + 20 * Art.pr(k + 1))) % H; ctx.fillRect(x, y, 2, 2); }
  }
  function paintWinterYard(ctx, W, H, groundY) {
    Art.plate(ctx, W, H, 'winter', groundY, { bleed: 10, far: '#a9b4be', trees: [[30, 120, 1], [92, 96, 2], [618, 104, 3], [676, 130, 4], [738, 92, 0]] });
  }
  function gameFlash(ctx, st, W, y = 110) {
    if (!st.flash || st.flashT <= 0) return;
    ctx.globalAlpha = Math.min(1, st.flashT * 2);
    ctx.fillStyle = st.flash[1]; ctx.font = 'bold 26px Georgia'; ctx.textAlign = 'center';
    ctx.fillText(st.flash[0], W / 2, y);
    ctx.globalAlpha = 1;
  }
  // ---------- splitting mini-game: swing the maul when the meter is in the green ----------
  function splitGame() {
    return new Promise((resolve, reject) => {
      const W = 760, H = 330, N = SPLIT_ROUNDS, BX = 400, TOP = 270, SH = { x: 343, y: 244 }, MAN = 2.4, RAISED = -2.0, STRIKE = .03, REACH = 58;
      const st = { k: 0, perfect: 0, good: 0, glance: 0, ph: 0, c: .5, hw: .12, knot: false, anim: -1, res: null, wait: .4, halves: [], pieces: 0, flash: null, flashT: 0, done: false, t: 0, shake: 0 };
      let resultEff = 1;
      const wrap = document.createElement('div');
      wrap.className = 'modal-wrap';
      wrap.innerHTML = `<div class="modal game split"><h2>Splitting Firewood &mdash; ${s.year}</h2>
        <canvas width="${W}" height="${H}"></canvas>
        <div class="modal-buttons"><button class="primary" data-k="swing">Swing the maul (Space)</button><button data-k="done" disabled>Continue</button></div></div>`;
      document.body.appendChild(wrap);
      const cv = wrap.querySelector('canvas'), ctx = cv.getContext('2d');
      const finishBtn = wrap.querySelector('[data-k="done"]');
      const flash = (text, color) => { st.flash = [text, color]; st.flashT = 1; };
      const pos = () => .5 + .5 * Math.sin(st.ph);
      function newRound() {
        st.knot = st.k % 4 === 3;
        st.c = .22 + Math.random() * .56;
        st.hw = Math.max(.065, .12 - .004 * st.k) * (st.knot ? .7 : 1);
        st.wait = .45;
      }
      newRound(); st.wait = .2;
      function swing() {
        if (st.done || st.anim >= 0 || st.wait > 0) return;
        const d = Math.abs(pos() - st.c);
        st.res = d < st.hw * .35 ? 'perfect' : d < st.hw ? 'good' : 'glance';
        st.anim = 0;
      }
      function strike() {
        if (st.res === 'glance') { st.glance++; st.shake = .2; flash(st.knot ? 'Bounced off the knot!' : 'Glancing blow!', '#a3262a'); sfx('slug'); return; }
        if (st.res === 'perfect') { st.perfect++; flash('Clean split!', '#2e7d32'); sfx('cut'); }
        else { st.good++; flash('Split it', '#7a6a1a'); sfx('good'); }
        const slot = st.pieces + st.halves.length;
        st.halves.push({ x0: BX - 8, y0: TOP - 12, slot, p: 0, side: -1 }, { x0: BX + 8, y0: TOP - 12, slot: slot + 1, p: -.12, side: 1 });
        st.k++;
        if (st.k >= N) finish(); else newRound();
      }
      function finish() {
        st.done = true;
        const score = (st.perfect + .7 * st.good) / N;
        resultEff = Math.max(.85, Math.min(1.15, .85 + .3 * score - .02 * st.glance));
        flash(`Done! Woodpile at ${Math.round(resultEff * 100)}%`, '#1d4d8a'); st.flashT = 99;
        finishBtn.disabled = false; finishBtn.classList.add('primary'); finishBtn.focus();
        window.removeEventListener('keydown', key);
      }
      function key(e) { if (e.code === 'Space') { e.preventDefault(); swing(); } }
      window.addEventListener('keydown', key);
      cv.addEventListener('mousedown', swing);
      wrap.querySelector('.modal-buttons').addEventListener('click', (e) => {
        const k = e.target.closest('button') && e.target.closest('button').dataset.k;
        if (k === 'swing') swing();
        else if (k === 'done' && !finishBtn.disabled) { stopFrames(); window.removeEventListener('keydown', key); wrap.remove(); resolve(resultEff); }
      });
      const slotXY = (i) => { const row = Math.floor(i / 10), col = i % 10; return { x: 548 + col * 15 + (row % 2) * 7, y: 296 - row * 12 }; };
      function maulAngle() {
        const p = st.anim;
        if (p < 0) return RAISED + .05 * Math.sin(st.t * 3);
        if (p < .3) return RAISED + (STRIKE - RAISED) * (p / .3) * (p / .3);
        const low = st.res === 'glance' ? STRIKE - .45 : STRIKE + .4;
        if (p < .5) return st.res === 'glance' ? STRIKE - .45 * Math.sin((p - .3) / .2 * Math.PI / 2) : low;
        return low + (RAISED - low) * (p - .5) / .5;
      }
      function frame(dt) {
        if (!st.done) {
          st.ph += dt * (2.4 + .17 * st.k);
          st.wait = Math.max(0, st.wait - dt);
        }
        if (st.anim >= 0) {
          const prev = st.anim; st.anim += dt / .6;
          if (prev < .3 && st.anim >= .3) strike();
          if (st.anim >= 1) st.anim = -1;
        }
        for (const h of st.halves) { h.p += dt / .55; if (h.p >= 1) { h.gone = true; st.pieces++; } }
        st.halves = st.halves.filter((h) => !h.gone);
        draw(st.t);
      }
      const halfRound = (x, y, rot, side) => {
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
        ctx.fillStyle = '#d9b380'; ctx.beginPath(); ctx.moveTo(-7, 0); ctx.arc(0, 0, 7, Math.PI, 0); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#5a3d22'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 7, Math.PI, 0); ctx.stroke();
        ctx.strokeStyle = 'rgba(122,85,48,.6)'; ctx.lineWidth = .8; ctx.beginPath(); ctx.arc(0, 0, 3.5, Math.PI, 0); ctx.stroke();
        ctx.restore();
      };
      function round(x, bottom, knot) {
        const r = 18, h = 24, top = bottom - h;
        ctx.fillStyle = '#6b4a2a'; ctx.fillRect(x - r, top, 2 * r, h);
        ctx.beginPath(); ctx.ellipse(x, bottom, r, 6, 0, 0, Math.PI); ctx.fill();
        ctx.strokeStyle = '#4a321c'; ctx.lineWidth = 1;
        for (let k = -14; k <= 14; k += 6) { ctx.beginPath(); ctx.moveTo(x + k, top + 3); ctx.lineTo(x + k + 1, bottom + 3); ctx.stroke(); }
        if (knot) { ctx.fillStyle = '#3a2614'; ctx.beginPath(); ctx.ellipse(x + 5, top + 12, 4.5, 3.5, 0, 0, 7); ctx.fill(); }
        ctx.fillStyle = '#dcb987'; ctx.beginPath(); ctx.ellipse(x, top, r, 5, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(122,85,48,.55)';
        for (const f of [.7, .45, .2]) { ctx.beginPath(); ctx.ellipse(x, top, r * f, 5 * f, 0, 0, 7); ctx.stroke(); }
      }
      function draw(t) {
        ctx.save();
        if (st.shake > 0) ctx.translate((Math.random() - .5) * 6, (Math.random() - .5) * 4);
        winterYard(ctx, W, H, t, 236);
        ctx.fillStyle = '#dde2e6'; ctx.beginPath(); ctx.ellipse(400, 296, 190, 20, 0, 0, 7); ctx.fill();
        // rounds still to split, piled on the left
        const left = N - st.k - (st.done ? 0 : 1);
        for (let i = 0; i < left; i++) {
          const row = i < 5 ? 0 : i < 9 ? 1 : i < 12 ? 2 : 3, col = row === 0 ? i : row === 1 ? i - 5 : row === 2 ? i - 9 : i - 12;
          const cx = 120 + col * 30 + row * 15, cy = 284 - row * 26;
          ctx.fillStyle = '#5a3d22'; ctx.beginPath(); ctx.arc(cx, cy, 14, 0, 7); ctx.fill();
          ctx.fillStyle = '#d9b380'; ctx.beginPath(); ctx.arc(cx, cy, 11.5, 0, 7); ctx.fill();
          ctx.strokeStyle = 'rgba(122,85,48,.6)'; ctx.lineWidth = .8; for (const r of [7.5, 4]) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke(); }
        }
        // the split woodpile on the right
        for (let i = 0; i < st.pieces; i++) { const p = slotXY(i); halfRound(p.x, p.y, 0, 1); }
        // chopping block
        ctx.fillStyle = '#5a3d22'; ctx.fillRect(374, TOP, 52, 22);
        ctx.beginPath(); ctx.ellipse(400, TOP + 22, 26, 5, 0, 0, Math.PI); ctx.fill();
        ctx.fillStyle = '#c9a46e'; ctx.beginPath(); ctx.ellipse(400, TOP, 26, 5, 0, 0, 7); ctx.fill();
        if (!st.done) round(BX, TOP - 160 * st.wait * st.wait, st.knot);
        // the man and his maul
        ctx.save(); ctx.translate(SH.x - 3, 292); ctx.scale(MAN, MAN); Art.person(ctx, 0, -17, '#a5493c', '#d9c07a'); ctx.restore();
        const a = maulAngle(), ca = Math.cos(a), sa = Math.sin(a);
        const hx = SH.x + 18 * ca, hy = SH.y + 18 * sa, ex = SH.x + REACH * ca, ey = SH.y + REACH * sa;
        ctx.strokeStyle = '#8b6a3e'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(SH.x + 10 * ca, SH.y + 10 * sa); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.save(); ctx.translate(ex, ey); ctx.rotate(a);
        ctx.fillStyle = '#4d4d4d'; ctx.fillRect(-4, -11, 11, 22); ctx.fillStyle = '#8a8a8a'; ctx.fillRect(7, -7, 3, 14);
        ctx.restore();
        ctx.strokeStyle = '#7a2e2e'; ctx.lineWidth = 4.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(SH.x - 1, SH.y); ctx.lineTo(hx, hy); ctx.moveTo(SH.x - 5, SH.y + 1); ctx.lineTo(SH.x + 28 * ca, SH.y + 28 * sa); ctx.stroke();
        ctx.lineCap = 'butt';
        // flying halves
        for (const h of st.halves) {
          if (h.p < 0) continue;
          const p = Math.min(1, h.p), dst = slotXY(h.slot);
          halfRound(h.x0 + (dst.x - h.x0) * p, h.y0 + (dst.y - h.y0) * p - 90 * Math.sin(Math.PI * p), h.side * p * 6.28, h.side);
        }
        Art.finish(ctx, 'winter');
        // swing meter
        const mx = 230, mw = 300, my = 26;
        ctx.fillStyle = 'rgba(255,250,235,.92)'; ctx.fillRect(mx - 70, my - 12, mw + 84, 46);
        ctx.fillStyle = '#e8dcc0'; ctx.fillRect(mx, my, mw, 18);
        ctx.fillStyle = '#86c286'; ctx.fillRect(mx + (st.c - st.hw) * mw, my, 2 * st.hw * mw, 18);
        ctx.fillStyle = '#2e7d32'; ctx.fillRect(mx + (st.c - st.hw * .35) * mw, my, .7 * st.hw * mw, 18);
        ctx.strokeStyle = '#3b2a1e'; ctx.lineWidth = 1.5; ctx.strokeRect(mx, my, mw, 18);
        if (!st.done) {
          const px = mx + pos() * mw;
          ctx.fillStyle = '#111'; ctx.fillRect(px - 1.5, my - 4, 3, 26);
          ctx.beginPath(); ctx.moveTo(px - 6, my - 10); ctx.lineTo(px + 6, my - 10); ctx.lineTo(px, my - 3); ctx.fill();
        }
        ctx.fillStyle = '#3b2a1e'; ctx.font = 'bold 12px Georgia'; ctx.textAlign = 'right'; ctx.fillText('SWING', mx - 8, my + 13);
        if (st.knot && !st.done) { ctx.textAlign = 'left'; ctx.fillStyle = '#7a4a1a'; ctx.fillText('KNOT', mx + mw + 6, my + 13); }
        // HUD
        ctx.fillStyle = 'rgba(255,250,235,.85)'; ctx.fillRect(10, 76, 250, 52);
        ctx.fillStyle = '#3b2a1e'; ctx.textAlign = 'left'; ctx.font = 'bold 14px Georgia';
        ctx.fillText(`Rounds split: ${st.k} / ${N}`, 20, 96);
        ctx.font = '13px Georgia';
        ctx.fillText(`Clean ${st.perfect}   Good ${st.good}   Glances ${st.glance}`, 20, 117);
        gameFlash(ctx, st, W, 160);
        ctx.restore();
      }
      const stopFrames = miniFrames(wrap, ctx, st, frame, () => window.removeEventListener('keydown', key), reject);
    });
  }
  // ---------- sawmill mini-game: feed the carriage without bogging the saw ----------
  function sawGame(rig) {
    return new Promise((resolve, reject) => {
      const W = 760, H = 330, BX = 430, BY = 228, BR = 50, DECK = 262, LEN = 180, STALL = .28, LOG_H = 46, BOARD = 7, PER_LOG = 5;
      const X0 = BX - LEN - 36, X1 = BX + 4;
      const st = { x: X0, logH: LOG_H, rpm: 1, ang: 0, feeding: false, gig: false, pause: 0, roll: 0, boards: 0, stalls: 0, time: SAW_TIME, flying: [], piled: 0, cutting: false, flash: null, flashT: 0, done: false, t: 0, shake: 0, lever: 0 };
      let resultEff = 1;
      const wrap = document.createElement('div');
      wrap.className = 'modal-wrap';
      wrap.innerHTML = `<div class="modal game saw"><h2>Sawing Day &mdash; ${s.year}</h2>
        <canvas width="${W}" height="${H}"></canvas>
        <div class="modal-buttons"><button class="primary" data-k="feed">Feed the carriage (hold Space)</button><button data-k="done" disabled>Continue</button></div></div>`;
      document.body.appendChild(wrap);
      const cv = wrap.querySelector('canvas'), ctx = cv.getContext('2d');
      const finishBtn = wrap.querySelector('[data-k="done"]'), feedBtn = wrap.querySelector('[data-k="feed"]');
      const flash = (text, color) => { st.flash = [text, color]; st.flashT = 1; };
      const hold = (on) => { if (!st.done) st.feeding = on; };
      function keyDown(e) { if (e.code === 'Space') { e.preventDefault(); hold(true); } }
      function keyUp(e) { if (e.code === 'Space') { e.preventDefault(); hold(false); } }
      const up = () => hold(false);
      window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp); window.addEventListener('mouseup', up);
      window.addEventListener('blur', up);
      document.addEventListener('visibilitychange', up);
      cv.addEventListener('mousedown', () => hold(true));
      feedBtn.addEventListener('mousedown', () => hold(true));
      feedBtn.addEventListener('mouseleave', up);
      const cleanup = () => { window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('mouseup', up); window.removeEventListener('blur', up); document.removeEventListener('visibilitychange', up); };
      finishBtn.addEventListener('click', () => { if (finishBtn.disabled) return; stopFrames(); cleanup(); wrap.remove(); resolve(resultEff); });
      function finish(timeUp) {
        st.done = true; st.feeding = false;
        resultEff = Math.max(.85, Math.min(1.12, .85 + .27 * Math.min(1, st.boards / SAW_BOARDS) - .03 * st.stalls));
        flash(`${timeUp ? 'Dinner bell! ' : ''}Lumber at ${Math.round(resultEff * 100)}%`, '#1d4d8a'); st.flashT = 99;
        finishBtn.disabled = false; finishBtn.classList.add('primary'); feedBtn.disabled = true; finishBtn.focus();
        cleanup();
      }
      function frame(dt) {
        st.cutting = false;
        if (!st.done) {
          st.time -= dt;
          const contact = st.x + LEN > BX - 2 && st.x < X1;
          if (st.pause > 0) st.pause -= dt;
          else if (st.roll > 0) st.roll = Math.max(0, st.roll - dt);
          else if (st.gig) { st.x -= 430 * dt; if (st.x <= X0) { st.x = X0; st.gig = false; } }
          else if (st.feeding) {
            st.x += (contact ? 105 : 170) * dt;
            if (contact) { st.cutting = true; st.rpm -= .52 * dt; }
            if (st.x >= X1) {
              st.flying.push({ x: st.x, y: DECK - st.logH, p: 0, slot: st.piled + st.flying.length });
              st.boards++; st.logH -= BOARD; st.gig = true; sfx('cut');
              if (st.boards >= SAW_BOARDS) finish(false);
              else if (st.boards % PER_LOG === 0) { st.logH = LOG_H; st.roll = .6; flash('A fresh log on the carriage', '#5a3d22'); }
            }
          }
          if (!st.cutting) st.rpm = Math.min(1, st.rpm + .4 * dt);
          if (st.rpm < STALL) {
            st.stalls++; st.rpm = .5; st.pause = 1.1; st.x = Math.max(X0, st.x - 22); st.shake = .35;
            flash('Bogged down! The belt flew off.', '#7a1010'); sfx('slug');
          }
          if (!st.done && st.time <= 0) { st.time = 0; finish(true); }
        }
        st.ang += dt * (st.done ? 6 : 30 * st.rpm * (st.pause > 0 ? .2 : 1));
        st.lever += ((st.feeding && !st.done ? 1 : 0) - st.lever) * Math.min(1, dt * 9);
        for (const b of st.flying) { b.p += dt / .5; if (b.p >= 1) { b.gone = true; st.piled++; } }
        st.flying = st.flying.filter((b) => !b.gone);
        draw(st.t);
      }
      function draw(t) {
        ctx.save();
        if (st.shake > 0) ctx.translate((Math.random() - .5) * 8, (Math.random() - .5) * 6);
        winterYard(ctx, W, H, t, 240);
        // power and mandrel: the engine stands back of the mill facing it, belted from its pulley to the saw arbor
        const TX = 690, TY = 250;
        ctx.save(); ctx.translate(TX, TY); ctx.scale(-1, 1);
        const Pm = Art.machine(ctx, rig.powerId, 0, 0, 1.25, t, 'belt', rig.powerYear);
        ctx.restore();
        const P = { x: TX - Pm.x, y: TY + Pm.y, r: Pm.r };
        const PX = BX + 62, PY = BY + 6;
        if (st.pause > 0) { ctx.strokeStyle = '#3b2a1e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(PX + 6, PY + 6); ctx.quadraticCurveTo(PX + 30, DECK + 30, PX + 70, DECK + 22); ctx.stroke(); }
        ctx.strokeStyle = '#333'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(BX, BY); ctx.lineTo(PX, PY); ctx.stroke();
        Art.spokes(ctx, PX, PY, 9, '#222', -st.ang);
        if (st.pause <= 0) Art.belt(ctx, P.x, P.y, PX, PY, t, { r1: P.r, r2: 9, width: 2.5, phase: st.ang * 9 });
        // husk frame under the saw, and the track
        ctx.fillStyle = '#4a3a2a'; ctx.fillRect(BX - 30, BY + 20, 92, DECK - BY - 2);
        ctx.fillStyle = '#5a4332'; for (let x = 70; x < 640; x += 22) ctx.fillRect(x, DECK + 18, 12, 6);
        ctx.strokeStyle = '#333'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(60, DECK + 17); ctx.lineTo(650, DECK + 17); ctx.stroke();
        // log deck on the left
        ctx.save(); ctx.translate(14, DECK + 18); ctx.scale(2, 2); Art.logDeck(ctx, 0, 0, Math.max(3, 7 - Math.floor(st.boards / PER_LOG))); ctx.restore();
        // lumber pile on the right
        const pileY = (i) => 318 - i * 6;
        for (let i = 0; i < st.piled; i++) {
          ctx.fillStyle = i % 2 ? '#d8b77e' : '#cfa96c'; ctx.fillRect(648, pileY(i), 104, 5);
          ctx.fillStyle = '#7a5a35'; for (const sx of [6, 50, 94]) ctx.fillRect(648 + sx, pileY(i) + 5, 4, 1);
        }
        // the saw blade (behind the log's near face)
        Art.blade(ctx, BX, BY, BR, -st.ang);
        // carriage, head blocks and the log
        const cx = st.x - 10, rollY = st.roll > 0 ? -30 * Math.sin(st.roll / .6 * Math.PI) : 0;
        ctx.fillStyle = '#7a5a35'; ctx.fillRect(cx, DECK, LEN + 20, 9);
        for (const wx of [cx + 20, cx + 100, cx + 180]) { ctx.fillStyle = '#2b2b2b'; ctx.beginPath(); ctx.arc(wx, DECK + 12, 6, 0, 7); ctx.fill(); }
        const top = DECK - st.logH + rollY;
        ctx.fillStyle = '#6b4a2a'; ctx.fillRect(st.x, top, LEN, st.logH);
        if (st.boards % PER_LOG) { ctx.fillStyle = '#e2c08a'; ctx.fillRect(st.x, top, LEN, 3); }
        ctx.strokeStyle = 'rgba(40,25,10,.45)'; ctx.lineWidth = 1;
        for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(st.x + 4, top + st.logH * k / 4); ctx.lineTo(st.x + LEN - 4, top + st.logH * k / 4 + (k % 2 ? 1 : -1)); ctx.stroke(); }
        ctx.fillStyle = '#d9b380'; ctx.beginPath(); ctx.ellipse(st.x + LEN, top + st.logH / 2, 5, st.logH / 2, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#3d2d22'; for (const k of [20, 90, 160]) ctx.fillRect(st.x + k, top - 4, 5, DECK - top + 4);
        // the kerf already sawn, and the board coming off the top
        const cut0 = Math.max(st.x, BX), cut1 = st.x + LEN;
        if (cut1 > cut0 && st.x < X1 && !st.gig) {
          ctx.fillStyle = '#e8c992'; ctx.fillRect(cut0, top, cut1 - cut0, BOARD - 1);
          ctx.strokeStyle = '#2b1d10'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cut0, top + BOARD); ctx.lineTo(cut1, top + BOARD); ctx.stroke();
        }
        // the upper half of the blade shows through the cut, with sawdust flying
        ctx.save(); ctx.beginPath(); ctx.rect(BX - BR - 2, BY - BR - 2, 2 * BR + 4, Math.max(0, top - (BY - BR - 2))); ctx.clip(); Art.blade(ctx, BX, BY, BR, -st.ang); ctx.restore();
        if (st.cutting) {
          for (let k = 0; k < 16; k++) {
            const ph = (t * 3 + k / 16) % 1;
            ctx.fillStyle = `rgba(225,195,135,${.9 * (1 - ph)})`;
            ctx.fillRect(BX - 8 - ph * 70 + Math.sin(k * 3) * 4, top + 4 + ph * 26 + Math.cos(k) * 4, 2.5, 2.5);
          }
        }
        // Nels at the feed lever, easing it forward to feed and back to gig
        Art.sawyer(ctx, 146, DECK + 46, 2.7, t, st.lever);
        for (const b of st.flying) {
          const p = Math.min(1, b.p), tx = 648, ty = pileY(b.slot), w = LEN + (104 - LEN) * p;
          ctx.fillStyle = '#e2c08a'; ctx.fillRect(b.x + (tx - b.x) * p, b.y + (ty - b.y) * p - 70 * Math.sin(Math.PI * p), w, 5);
        }
        Art.finish(ctx, 'winter');
        // HUD and blade-speed gauge
        ctx.fillStyle = 'rgba(255,250,235,.85)'; ctx.fillRect(10, 10, 300, 62);
        ctx.fillStyle = '#3b2a1e'; ctx.textAlign = 'left'; ctx.font = 'bold 14px Georgia';
        ctx.fillText(`Boards: ${st.boards} / ${SAW_BOARDS}     Time: ${Math.ceil(st.time)} s`, 20, 30);
        ctx.font = '13px Georgia';
        ctx.fillText(`Stalls ${st.stalls}${st.pause > 0 ? '   (putting the belt back on…)' : st.feeding && !st.done ? '   feeding…' : ''}`, 20, 52);
        gauge(ctx, 706, 58, st.rpm * .9, 'RPM');
        gameFlash(ctx, st, W, 110);
        ctx.restore();
      }
      const stopFrames = miniFrames(wrap, ctx, st, frame, cleanup, reject);
    });
  }

  // ---------- threshing mini-game ----------
  async function threshDay(kind) {
    const rig = Sim.rigFor(s, kind);
    const titleTxt = rig.isHull ? 'Clover Hulling Day' : 'Threshing Day!';
    if (s.cheats.perfect) { toast('Cheat: perfect separator run'); return 1; }
    if (!s.plan.minigame) return .78;
    const what = rig.isHull ? 'forkful of clover' : 'bundle';
    const v = await modal({
      title: titleTxt,
      html: `<p>${rig.who}</p><p>The wagon man lifts ${rig.isHull ? 'forkfuls of clover' : 'bundles'} from the pile and pitches them forward to you. Press <kbd>Space</kbd> (or click the picture) to fork each ${what} into the ${rig.isHull ? 'huller' : 'separator'}'s feeder as it reaches the <b>pitch line</b>${rig.isHull ? '' : ' (the self-feeder&rsquo;s knives cut the twine)'}. Pitch too early or too late and it goes in crossways and slugs the cylinder; miss one and it slides off the wagon while the feeder runs empty.${rig.steam ? ' This is a wood-fired <b>steam engine</b>: press <kbd>S</kbd> to throw wood in the firebox and keep the pressure gauge in the green.' : ''}</p>`,
      buttons: [{ label: rig.isHull ? 'Pitch the clover myself' : 'Pitch bundles myself', value: 'play', primary: true }, { label: 'Let the crew handle it (78%)', value: 'auto' }],
    });
    if (v === 'auto') return .78;
    sfx('whistle');
    return minigame(rig);
  }
  function minigame(rig) {
    return new Promise((resolve, reject) => {
      const W = 760, H = 330, PITCH = 400, WAGON_END = 470, RIDE_Y = 274;
      // the feeder carrier continues the separator's own feeder slope down toward the wagon
      const feedY = (x) => 198.8 + .364 * (506 - x) - 15, LAND_X = 440, MOUTH_X = 506, END_X = 540, FEED_ROT = -.35;
      const REST = .72, THROW = -.8;
      const total = rig.isHull ? 16 : 22, noun = rig.isHull ? 'Forkfuls' : 'Bundles';
      const PASS_START = 210, PICKUP_START = PASS_START - 75, PASS_END = PITCH - 60;
      const HELPER_X = 205, HELPER_Y = 266, HELPER_REST = -3.5, HELPER_THROW = -.55;
      const releasePose = forkLoadPose(HELPER_X, HELPER_Y, HELPER_THROW, 0);
      const st = { bundles: [], spawned: 0, next: .6, perfect: 0, good: 0, miss: 0, whiff: 0, fed: 0, pressure: .72, pops: 0, flash: null, flashT: 0, done: false, t: 0, shake: 0, swing: 0 };
      let resultEff = .78;
      const wrap = document.createElement('div');
      wrap.className = 'modal-wrap';
      wrap.innerHTML = `<div class="modal game"><h2>${rig.isHull ? 'Clover Hulling' : 'Threshing Day'} &mdash; ${s.year}</h2>
        <canvas width="${W}" height="${H}"></canvas>
        <div class="modal-buttons"><button class="primary" data-k="pitch">Pitch ${rig.isHull ? 'forkful' : 'bundle'} (Space)</button>${rig.steam ? '<button data-k="stoke">Stoke firebox (S)</button>' : ''}<button data-k="done" disabled>Continue</button></div></div>`;
      document.body.appendChild(wrap);
      const cv = wrap.querySelector('canvas'), ctx = cv.getContext('2d');
      let scenery = null, wagon = null, pile = null, pileCount = -1;
      const finishBtn = wrap.querySelector('[data-k="done"]');
      function flash(text, color) { st.flash = [text, color]; st.flashT = 1; }
      function pitch() {
        if (st.done) return;
        st.swing = 1;
        let cand = null;
        for (const b of st.bundles) if (b.state === 'ride' && (!cand || Math.abs(b.x - PITCH) < Math.abs(cand.x - PITCH))) cand = b;
        if (!cand || Math.abs(cand.x - PITCH) > 60) { st.whiff++; flash('Your fork stabs empty air!', '#a3262a'); return; }
        const d = Math.abs(cand.x - PITCH);
        cand.state = 'fly'; cand.p = 0; cand.x0 = cand.x;
        if (d < 14) { cand.q = 'perfect'; st.perfect++; flash('PERFECT pitch!', '#2e7d32'); sfx('cut'); }
        else if (d < 34) { cand.q = 'good'; st.good++; flash('Good toss', '#7a6a1a'); sfx('good'); }
        else { cand.q = 'rough'; st.whiff++; flash('Crossways toss!', '#a3262a'); }
      }
      function stoke() {
        if (!rig.steam || st.done) return;
        st.pressure += .17;
        if (st.pressure > 1) { st.pops++; st.pressure = .82; flash('Safety valve pops! Wasted wood.', '#a3262a'); sfx('whistle'); }
      }
      function key(e) {
        if (e.code === 'Space') { e.preventDefault(); pitch(); }
        else if (e.code === 'KeyS') { e.preventDefault(); stoke(); }
      }
      window.addEventListener('keydown', key);
      cv.addEventListener('mousedown', pitch);
      wrap.querySelector('.modal-buttons').addEventListener('click', (e) => {
        const k = e.target.closest('button') && e.target.closest('button').dataset.k;
        if (k === 'pitch') pitch(); else if (k === 'stoke') stoke();
        else if (k === 'done' && !finishBtn.disabled) { stopFrames(); window.removeEventListener('keydown', key); wrap.remove(); resolve(resultEff); }
      });
      function frame(dt) {
        st.swing = Math.max(0, st.swing - dt / .3);
        if (!st.done) {
          const prog = st.spawned / total;
          if (rig.steam) st.pressure = Math.max(0, st.pressure - dt * .085);
          const slow = rig.steam && st.pressure < .35 ? .55 : 1;
          const speed = 150 * (1 + prog * .4) * slow;
          st.next -= dt * slow;
          if (st.next <= 0 && st.spawned < total) { st.bundles.push({ x: -30, y: RIDE_Y, rot: 0, state: 'ride' }); st.spawned++; st.next = 1.15 - .45 * prog; }
          for (const b of st.bundles) {
            if (b.state === 'ride') {
              b.x += speed * dt;
              if (b.x >= WAGON_END) { b.state = 'drop'; b.vy = -60; st.miss++; st.shake = .25; flash('Dropped! The feeder runs empty.', '#7a1010'); sfx('slug'); }
            } else if (b.state === 'fly') {
              b.p = Math.min(1, b.p + dt / .3);
              b.x = b.x0 + (LAND_X - b.x0) * b.p;
              b.y = RIDE_Y + (feedY(LAND_X) - RIDE_Y) * b.p - 46 * Math.sin(Math.PI * b.p);
              b.rot = (b.q === 'rough' ? 1.5 : FEED_ROT) * b.p;
              if (b.p >= 1) { b.state = 'feed'; b.p = 0; }
            } else if (b.state === 'feed') {
              b.p += dt * 1.7 * slow;
              b.x = LAND_X + (END_X - LAND_X) * Math.min(1, b.p); b.y = feedY(b.x);
              if (b.p >= 1) {
                b.gone = true; st.fed++;
                if (b.q === 'rough') { st.shake = .4; flash('Crossways! The cylinder slugs.', '#7a1010'); sfx('slug'); }
              }
            } else {
              b.vy += 900 * dt; b.x += 70 * dt;
              b.y = Math.min(306, b.y + b.vy * dt);
              if (b.y >= 306) { b.rot = 1.2; b.rest = (b.rest || 0) + dt; if (b.rest > .7) b.gone = true; } else b.rot += dt * 6;
            }
          }
          st.bundles = st.bundles.filter((b) => !b.gone);
          if (st.spawned >= total && !st.bundles.length) {
            st.done = true;
            const score = (st.perfect + .75 * st.good) / total;
            resultEff = Math.max(.5, Math.min(1, .55 + .45 * score - .02 * st.whiff - .03 * st.pops));
            flash(`Done! Efficiency ${Math.round(resultEff * 100)}%`, '#1d4d8a');
            st.flashT = 99;
            finishBtn.disabled = false; finishBtn.classList.add('primary'); finishBtn.focus();
            window.removeEventListener('keydown', key);
          }
        }
        draw(st.t);
      }
      function draw(t) {
        ctx.save();
        if (st.shake > 0) ctx.translate((Math.random() - .5) * 8, (Math.random() - .5) * 6);
        if (!scenery) scenery = canvasLayer(W + 20, H + 20, c => {
          c.translate(10, 10);
          Art.plate(c, W, H, 'fall', 205, rig.isHull
            ? { bleed: 10, overcast: true, far: '#8f8a7a', mid: '#9a9580', ground: '#9b9c86', trees: [[40, 110, 4], [736, 96, 2]] }
            : { bleed: 10, far: '#a98a5f', mid: '#a28d55', ground: '#c9b36a', trees: [[40, 110, 0], [736, 96, 1]] });
        });
        drawLayer(ctx, scenery, -10, -10);
        // rig
        Art.strawStack(ctx, 700, 250, Math.min(1.6, .3 + (st.fed + st.miss) / total * 1.3), 'fall');
        ctx.save(); ctx.translate(590, 245); ctx.scale(2.1, 2.1); Art.separator(ctx, 0, 0, rig.sepBody, t, true, rig.sepBrand, rig.isHull); ctx.restore();
        const P = Art.machine(ctx, rig.powerId, rig.steam ? 270 : 285, 250, rig.steam ? 1.9 : 2.4, t, 'belt', rig.powerYear);
        Art.belt(ctx, P.x, P.y, 590 - 34 * 2.1, 245 - 28 * 2.1, t, { r1: P.r, r2: 6 * 2.1, width: 2.5 });
        feederCarrier(ctx, t, (x) => feedY(x) + 15);
        if (!wagon) wagon = canvasLayer(W, H, c => bundleWagon(c, WAGON_END));
        drawLayer(ctx, wagon, 0, 0);
        const waiting = st.bundles.filter(b => b.state === 'ride' && b.x < PASS_START);
        const remaining = total - st.spawned + waiting.filter(b => b.x < PICKUP_START).length;
        if (remaining !== pileCount) {
          pileCount = remaining;
          if (!pile) pile = canvasLayer(200, 140, () => {});
          const c = pile.getContext('2d'); c.clearRect(0, 0, pile.lw, pile.lh);
          wagonLoad(c, remaining, total, rig.isHull);
        }
        drawLayer(ctx, pile, 0, 174);
        const ready = waiting.reduce((best, b) => !best || b.x > best.x ? b : best, null);
        const passing = st.bundles.find(b => b.state === 'ride' && b.x >= PASS_START && b.x < PASS_END);
        const lift = ready ? Math.max(0, Math.min(1, (ready.x - PICKUP_START) / (PASS_START - PICKUP_START))) : 0;
        const returning = passing ? Math.min(1, (passing.x - PASS_START) / 75) : 1;
        const smooth = v => v * v * (3 - 2 * v);
        const helperAngle = lift > 0 ? HELPER_REST + (HELPER_THROW - HELPER_REST) * smooth(lift)
          : HELPER_THROW + (HELPER_REST - HELPER_THROW) * smooth(returning);
        pitcher(ctx, HELPER_X, HELPER_Y, helperAngle, '#3f6683');
        // pitch line
        ctx.setLineDash([5, 4]); ctx.strokeStyle = '#a3262a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(PITCH, 244); ctx.lineTo(PITCH, 306); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(46,125,50,.2)'; ctx.fillRect(PITCH - 14, 270, 28, 30);
        ctx.fillStyle = '#7a1010'; ctx.font = 'bold 12px Georgia'; ctx.textAlign = 'center'; ctx.fillText('PITCH', PITCH, 320);
        const ang = st.swing > 0 ? REST + (THROW - REST) * Math.sin(Math.PI * (1 - st.swing)) : REST;
        pitcher(ctx, PITCH - 34, RIDE_Y + 8, ang);
        for (const b of st.bundles) {
          if (b === ready && b.x >= PICKUP_START && b.x < PASS_START) {
            const pose = forkLoadPose(HELPER_X, HELPER_Y, helperAngle, helperAngle - HELPER_THROW);
            sheaf(ctx, pose.x, pose.y, rig.isHull, pose.rot);
          } else if (b.state === 'ride' && b.x >= PASS_START && b.x < PASS_END) {
            const u = (b.x - PASS_START) / (PASS_END - PASS_START), eased = smooth(u);
            const x = releasePose.x + (PASS_END - releasePose.x) * eased + (PASS_END - PASS_START) * (u * u * u - u * u);
            const y = releasePose.y + (RIDE_Y - releasePose.y) * u - 48 * Math.sin(Math.PI * u);
            sheaf(ctx, x, y, rig.isHull, -.18 * Math.sin(Math.PI * u));
          } else if ((b.state === 'ride' && b.x >= PASS_END) || b.state === 'drop') sheaf(ctx, b.x, b.y, rig.isHull, b.rot);
        }
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, MOUTH_X, H); ctx.clip();
        for (const b of st.bundles) if (b.state === 'feed') sheaf(ctx, b.x, b.y, rig.isHull, b.q === 'rough' ? 1.5 : FEED_ROT);
        ctx.restore();
        for (const b of st.bundles) if (b.state === 'fly') sheaf(ctx, b.x, b.y, rig.isHull, b.rot);
        Art.finish(ctx, 'fall');
        // HUD
        ctx.fillStyle = 'rgba(255,250,235,.85)'; ctx.fillRect(10, 10, 290, 62);
        ctx.fillStyle = '#3b2a1e'; ctx.textAlign = 'left'; ctx.font = 'bold 14px Georgia';
        ctx.fillText(`${noun}: ${Math.min(st.spawned, total)} / ${total}`, 20, 30);
        ctx.font = '13px Georgia';
        ctx.fillText(`Perfect ${st.perfect}   Good ${st.good}   Dropped ${st.miss}   Misses ${st.whiff}`, 20, 52);
        if (rig.steam) gauge(ctx, 690, 60, st.pressure);
        if (st.flash && st.flashT > 0) {
          ctx.globalAlpha = Math.min(1, st.flashT * 2);
          ctx.fillStyle = st.flash[1]; ctx.font = 'bold 26px Georgia'; ctx.textAlign = 'center';
          ctx.fillText(st.flash[0], W / 2, 110);
          ctx.globalAlpha = 1;
        }
        ctx.restore();
      }
      const stopFrames = miniFrames(wrap, ctx, st, frame, () => window.removeEventListener('keydown', key), reject);
    });
  }
  // The self-feeder's slatted carrier, rising from the wagon into the cylinder
  function feederCarrier(ctx, t, top) {
    const x0 = 404, x1 = 508;
    ctx.fillStyle = '#4a3a2a';
    ctx.beginPath(); ctx.moveTo(x0, top(x0)); ctx.lineTo(x1, top(x1)); ctx.lineTo(x1, top(x1) + 11); ctx.lineTo(x0, top(x0) + 11); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#2b2118'; ctx.lineWidth = 2;
    for (let k = 0; k < 9; k++) { const x = x0 + (x1 - x0) * ((t * 1.2 + k / 9) % 1); ctx.beginPath(); ctx.moveTo(x, top(x) + 1); ctx.lineTo(x, top(x) + 10); ctx.stroke(); }
    ctx.strokeStyle = '#6b5a45'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0, top(x0) - 3); ctx.lineTo(x1, top(x1) - 3); ctx.stroke();
  }
  // The hayrack supports the pile and both pitchers.
  function wagonLoad(ctx, remaining, total, clover) {
    if (remaining === 0) return;
    const fraction = Math.sqrt(remaining / total), left = 14, width = 174 * fraction, height = 88 * fraction;
    const base = 126, top = base - height, right = left + width;
    ctx.save();
    ctx.fillStyle = clover ? '#887e4d' : '#d7b34f';
    ctx.beginPath(); ctx.moveTo(left, base); ctx.lineTo(left, top + height * .35);
    ctx.quadraticCurveTo(left + width * .18, top, left + width * .48, top);
    ctx.quadraticCurveTo(right - width * .12, top, right, top + height * .3);
    ctx.lineTo(right, base); ctx.closePath(); ctx.fill();
    ctx.clip();
    ctx.fillStyle = clover ? '#70663e' : '#bc943c'; ctx.fillRect(left, base - height * .2, width, height * .2);
    ctx.strokeStyle = clover ? '#aca36d' : '#efd282'; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 0; i < 75; i++) {
      const x = left + Art.pr(i + 37) * width, y = top + Art.pr(i + 71) * height;
      ctx.moveTo(x, y); ctx.lineTo(x + (clover ? 5 : 12), y - 3);
    }
    ctx.stroke();
    if (clover) {
      ctx.fillStyle = '#a06d83'; ctx.beginPath();
      for (let i = 0; i < 22; i++) {
        const x = left + Art.pr(i + 90) * width, y = top + Art.pr(i + 111) * height;
        ctx.moveTo(x + 2, y); ctx.arc(x, y, 2, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.restore();
  }
  function bundleWagon(ctx, end) {
    ctx.fillStyle = '#8a6a44'; ctx.fillRect(0, 270, end, 30);
    ctx.strokeStyle = '#6b4f33'; ctx.lineWidth = 1;
    for (let y = 276; y < 298; y += 6) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(end, y); ctx.stroke(); }
    ctx.fillStyle = '#5b4632'; ctx.fillRect(0, 266, end, 4); ctx.fillRect(0, 298, end, 7); ctx.fillRect(end - 6, 258, 6, 47);
    for (const wx of [70, 300]) {
      ctx.strokeStyle = '#3d2e20'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(wx, 314, 13, 0, 7); ctx.stroke();
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; ctx.beginPath(); ctx.moveTo(wx, 314); ctx.lineTo(wx + 13 * Math.cos(a), 314 + 13 * Math.sin(a)); ctx.stroke(); }
    }
  }
  const PITCH_FORK = { handX: 11, handY: -29, tipX: 55, tipY: 3 };
  function forkLoadPose(x, y, angle, rotation) {
    const tipX = x + PITCH_FORK.handX + PITCH_FORK.tipX * Math.cos(angle) - PITCH_FORK.tipY * Math.sin(angle);
    const tipY = y + PITCH_FORK.handY + PITCH_FORK.tipX * Math.sin(angle) + PITCH_FORK.tipY * Math.cos(angle);
    // Both grain and clover are centered six pixels below their drawing origin.
    return { x: tipX + 6 * Math.sin(rotation), y: tipY - 6 * Math.cos(rotation), rot: rotation };
  }
  // The man on the wagon with his three-tine fork; ang is the fork's angle from horizontal
  function pitcher(ctx, x, y, ang, shirt = '#556b2f') {
    ctx.save(); ctx.translate(x, y); ctx.scale(1.8, 1.8); Art.person(ctx, 0, -17, shirt, '#d4c7a6'); ctx.restore();
    const hx = x + PITCH_FORK.handX, hy = y + PITCH_FORK.handY;
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(ang);
    ctx.strokeStyle = '#8b6a3e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(40, 0); ctx.stroke();
    ctx.strokeStyle = '#707070'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(40, -4); ctx.lineTo(40, 4);
    for (const k of [-4, 0, 4]) { ctx.moveTo(40, k); ctx.quadraticCurveTo(48, k, PITCH_FORK.tipX, k + PITCH_FORK.tipY); }
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = shirt; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x + 2, y - 36); ctx.lineTo(hx, hy);
    ctx.moveTo(x - 1, y - 35); ctx.lineTo(hx - 12 * Math.cos(ang), hy - 12 * Math.sin(ang)); ctx.stroke();
    ctx.lineCap = 'butt';
  }
  function sheaf(ctx, x, y, hull, rot = 0) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    if (hull) {
      ctx.fillStyle = '#887e4d';
      ctx.beginPath(); ctx.moveTo(-26, 10); ctx.quadraticCurveTo(-29, -2, -15, 0);
      ctx.quadraticCurveTo(-8, -9, 4, -3); ctx.quadraticCurveTo(18, -6, 21, 1);
      ctx.quadraticCurveTo(33, 1, 28, 12); ctx.quadraticCurveTo(8, 18, -14, 13); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#b6aa74'; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 0; i < 12; i++) { const xx = -20 + Art.pr(i + 4) * 42, yy = 2 + Art.pr(i + 20) * 8; ctx.moveTo(xx, yy); ctx.lineTo(xx + 5, yy - 3); }
      ctx.stroke(); ctx.fillStyle = '#a06d83'; ctx.beginPath();
      for (let i = 0; i < 7; i++) { const xx = -18 + Art.pr(i + 51) * 39, yy = 1 + Art.pr(i + 66) * 9; ctx.moveTo(xx + 2, yy); ctx.arc(xx, yy, 2, 0, Math.PI * 2); }
      ctx.fill(); ctx.restore(); return;
    }
    ctx.fillStyle = '#e0bb52';
    ctx.beginPath(); ctx.ellipse(0, 6, 26, 9, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#a8842c'; ctx.lineWidth = 1;
    for (let k = -22; k < 22; k += 5) { ctx.beginPath(); ctx.moveTo(k, 2); ctx.lineTo(k + 4, 11); ctx.stroke(); }
    ctx.fillStyle = '#c9a03a'; for (let k = -6; k <= 6; k += 4) { ctx.beginPath(); ctx.ellipse(27, 6 + k, 5, 2, 0, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#b22222'; ctx.fillRect(-3, -3, 5, 18);
    ctx.restore();
  }
  function gauge(ctx, x, y, p, label = 'STEAM') {
    ctx.fillStyle = '#f7f1e1'; ctx.strokeStyle = '#333'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, 42, 0, 7); ctx.fill(); ctx.stroke();
    const ang = (v) => Math.PI * .8 + v * Math.PI * 1.4;
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#c0392b'; ctx.beginPath(); ctx.arc(x, y, 32, ang(0), ang(.35)); ctx.stroke();
    ctx.strokeStyle = '#2e7d32'; ctx.beginPath(); ctx.arc(x, y, 32, ang(.45), ang(.92)); ctx.stroke();
    ctx.strokeStyle = '#e67e22'; ctx.beginPath(); ctx.arc(x, y, 32, ang(.92), ang(1)); ctx.stroke();
    ctx.strokeStyle = '#111'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ang(p)) * 30, y + Math.sin(ang(p)) * 30); ctx.stroke();
    ctx.fillStyle = '#333'; ctx.font = 'bold 10px Georgia'; ctx.textAlign = 'center'; ctx.fillText(label, x, y + 24);
  }

  // ---------- Baling Day: steer the baler along the windrow ahead of the storm ----------
  const BALE_FIELD = 3900, BALE_STORM = 34, BALE_SPEED = 130, BALE_HAY = 150;
  async function balingDay(rig) {
    if (s.cheats.perfect) { toast('Cheat: perfect baling'); return 1; }
    if (!s.plan.baleGame) return .8;
    const b = rig.baler;
    const v = await modal({
      title: 'Baling Day!',
      html: `<p>Your ${b.name} is hitched behind the ${rig.power.name}, and the alfalfa lies cured in windrows that wander across the field. A thunderhead is building in the west.</p>
        <p><b>You drive.</b> Steer with <kbd>&uarr;</kbd> and <kbd>&darr;</kbd> (or hold the mouse where you want to go) to keep the pickup on the windrow: hay you drive past is hay lost. Steer around the <b>woodchuck holes</b> (a bump bounces a bale off the wagon). In the dark, heavy clumps hold <kbd>&larr;</kbd> to ease off or the baler plugs; hold <kbd>&rarr;</kbd> to hurry when the storm is close. The hired man stacks the bales on the wagon.${b.tie === 'twine' ? ' Twine knotters miss now and then.' : ' Wire ties seldom miss.'}</p>`,
      buttons: [{ label: 'Drive the baler myself', value: 'play', primary: true }, { label: 'Let the crew handle it (80%)', value: 'auto' }],
    });
    if (v === 'auto') return .8;
    sfx('whistle');
    return balingGame(rig);
  }
  function balingGame(rig) {
    return new Promise((resolve, reject) => {
      const W = 760, H = 330, b = rig.baler, tieKind = b.tie, SC = 1.25, PICK = 400;
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      // the field seen a little from above: lane 0 is the far side of the band, lane 1 the near side
      const LANE0 = 222, LANE1 = 318, laneY = (l) => LANE0 + l * (LANE1 - LANE0), depth = (l) => .6 + .28 * l;
      const seed = Math.floor(Math.random() * 997), ph1 = Math.random() * 6, ph2 = Math.random() * 6;
      const rowLane = (x) => clamp(.5 + .3 * Math.sin(x * .0042 + ph1) + .12 * Math.sin(x * .0115 + ph2), .08, .92);
      // windrow thickness: gentle swells plus a heavy clump every so often
      const thick = (x) => {
        let v = .9 + .2 * Math.sin(x * .011 + ph2);
        const k = Math.floor(x / 520), c = x - k * 520 - 260;
        if (Art.pr(seed + k * 11) > .35) v += .75 * Math.exp(-c * c / 2600);
        return clamp(v, .4, 1.8);
      };
      // woodchuck holes lie close beside the windrow, so steering around one means leaving the row for a moment
      const hazards = [];
      for (let x = 640, k = 0; x < BALE_FIELD - 160; k++) {
        const side = Art.pr(seed + k * 3) < .5 ? -1 : 1;
        hazards.push({ x, lane: clamp(rowLane(x) + side * (.015 + Art.pr(seed + k * 5) * .07), .03, .97), hit: false });
        x += 420 + Art.pr(seed + k * 13) * 300;
      }
      const st = {
        phase: 'drive', t: 0, shake: 0, flash: null, flashT: 0, done: false, note: '',
        dist: 0, v: 1, lane: rowLane(0), up: false, down: false, slow: false, fast: false, ptr: null, roll: 0, driveT: 0, repair: 0,
        hay: 0, picked: 0, missed: 0, feed: 0, plug: 0, onRow: true, gaps: [], good: 0, broken: 0, bounced: 0, holes: 0, plugs: 0,
        flying: [], lying: [], rained: 0,
      };
      let resultEff = .8, scenery = null;
      const wrap = document.createElement('div');
      wrap.className = 'modal-wrap';
      wrap.innerHTML = `<div class="modal game baling"><h2>Baling Day &mdash; ${s.year}</h2><canvas width="${W}" height="${H}"></canvas><div class="modal-buttons"></div></div>`;
      document.body.appendChild(wrap);
      const cv = wrap.querySelector('canvas'), ctx = cv.getContext('2d'), bar = wrap.querySelector('.modal-buttons');
      const buttons = (list) => { bar.innerHTML = list.map(([k, label, primary]) => `<button data-k="${k}" class="${primary ? 'primary' : ''}">${label}</button>`).join(''); };
      const flash = (text, color) => { st.flash = [text, color]; st.flashT = 1; };
      buttons([['upB', 'Steer &uarr;'], ['downB', 'Steer &darr;'], ['slowB', 'Ease off (&larr;)'], ['fastB', 'Hurry (&rarr;)']]);

      // ----- controls -----
      const btnKey = (e) => { const el = e.target.closest('button'); return el ? el.dataset.k : null; };
      const held = { upB: 'up', downB: 'down', slowB: 'slow', fastB: 'fast' };
      bar.addEventListener('pointerdown', (e) => { const k = btnKey(e); if (held[k] && st.phase === 'drive') st[held[k]] = true; });
      const release = () => { st.up = st.down = st.slow = st.fast = false; };
      bar.addEventListener('pointerup', release); bar.addEventListener('pointerleave', release);
      bar.addEventListener('click', (e) => {
        const k = btnKey(e);
        if (k === 'done' && st.done) { stopFrames(); unbind(); wrap.remove(); resolve(resultEff); }
      });
      function key(e, pressed) {
        const c = e.code;
        if (st.phase !== 'drive') return;
        if (c === 'ArrowUp' || c === 'KeyW') st.up = pressed;
        else if (c === 'ArrowDown' || c === 'KeyS') st.down = pressed;
        else if (c === 'ArrowLeft' || c === 'KeyA') st.slow = pressed;
        else if (c === 'ArrowRight' || c === 'KeyD') st.fast = pressed;
        else return;
        e.preventDefault();
      }
      const kd = (e) => key(e, true), ku = (e) => key(e, false);
      window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
      const unbind = () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
      const canvasY = (e) => { const r = cv.getBoundingClientRect(); return (e.clientY - r.top) * H / r.height; };
      // the mouse points where the pickup should go: its ground track sits about 5.5 px below the lane line
      const steerTo = (e) => { st.ptr = clamp((canvasY(e) - 5.5 - LANE0) / (LANE1 - LANE0), 0, 1); };
      cv.addEventListener('pointerdown', (e) => { if (st.phase === 'drive') steerTo(e); });
      cv.addEventListener('pointermove', (e) => { if (st.phase === 'drive' && e.buttons) steerTo(e); });
      const letGo = () => { st.ptr = null; };
      cv.addEventListener('pointerup', letGo); cv.addEventListener('pointerleave', letGo);

      // ----- round 1: driving along the windrow -----
      function driveFrame(dt) {
        st.driveT += dt;
        let steer = (st.down ? 1 : 0) - (st.up ? 1 : 0);
        if (st.ptr !== null) steer = clamp((st.ptr - st.lane) * 9, -1, 1);
        st.lane = clamp(st.lane + steer * .8 * dt, 0, 1);
        if (st.repair > 0) {
          st.repair -= dt; st.v = 0;
          if (st.repair <= 0) flash('Back at it!', '#1d4d8a');
        } else {
          const want = st.slow ? .5 : st.fast ? 1.45 : 1;
          st.v += (want - st.v) * Math.min(1, dt * 3);
        }
        const dx = st.v * BALE_SPEED * dt, x0 = st.dist;
        st.dist += dx; st.roll += st.v * dt;
        if (st.repair <= 0 && dx > 0) {
          const h = thick(st.dist);
          st.onRow = Math.abs(st.lane - rowLane(st.dist)) < .075;
          if (st.onRow) { st.hay += h * dx; st.picked += h * dx; }
          else {
            st.missed += h * dx;
            const g = st.gaps[st.gaps.length - 1];
            if (g && g[1] >= x0 - 1) g[1] = st.dist; else st.gaps.push([x0, st.dist]);
          }
          // a heavy clump taken too fast plugs the baler
          st.feed = st.onRow ? st.v * h : 0;
          if (st.feed > 1.3) st.plug += (st.feed - 1.3) * dt * 3.2; else st.plug = Math.max(0, st.plug - dt * .5);
          if (st.plug >= 1) { st.plug = 0; st.plugs++; st.repair = 1.6; st.shake = .4; flash('Plugged! Snapped a shear bolt.', '#7a1010'); sfx('slug'); }
          if (st.hay >= BALE_HAY) {
            st.hay -= BALE_HAY;
            if (Math.random() < rig.tie.miss) { st.broken++; st.lying.push({ x: st.dist - 140, lane: st.lane }); flash('The knotter missed: a broken bale', '#7a6a1a'); sfx('slug'); }
            else { st.good++; st.flying.push({ p: 0, slot: st.good - 1 }); sfx('good'); }
          }
        }
        for (const z of hazards) {
          if (z.hit || z.x > st.dist || z.x <= x0) continue;
          if (Math.abs(st.lane - z.lane) >= .065) continue;
          z.hit = true; st.holes++; st.shake = .35;
          if (st.good > 0) { st.good--; st.bounced++; st.flying = st.flying.filter((f) => f.slot < st.good); st.lying.push({ x: st.dist - 300, lane: clamp(st.lane + .12, 0, 1) }); flash('Woodchuck hole! A bale bounced off.', '#7a1010'); }
          else flash('Woodchuck hole!', '#7a1010');
          sfx('slug');
        }
        for (const f of st.flying) f.p = Math.min(1, f.p + dt / .7);
        if (st.dist >= BALE_FIELD) endDrive(0);
        else if (st.driveT >= BALE_STORM) endDrive(1 - st.dist / BALE_FIELD);
      }
      function endDrive(rained) {
        st.rained = rained;
        const total = st.picked + st.missed, frac = total ? st.picked / total : 0, n = st.good + st.broken + st.bounced, kept = n ? st.good / n : 0;
        resultEff = Math.round(clamp(.5 + .5 * frac * (.4 + .6 * kept) * (1 - rained) - .02 * st.plugs, .5, 1) * 1000) / 1000;
        st.note = rained > 0 ? `Rain! ${Math.round(rained * 100)}% of the field got soaked.` : `Field done ahead of the storm! ${Math.round(frac * 100)}% picked up.`;
        st.phase = 'done'; st.done = true; release(); st.ptr = null;
        sfx(rained > 0 ? 'slug' : 'coin');
        flash(`Done! Baling at ${Math.round(resultEff * 100)}%`, '#1d4d8a'); st.flashT = 99;
        buttons([['done', 'Continue', true]]); bar.querySelector('button').focus(); unbind();
      }
      function frame(dt) {
        if (st.phase === 'drive') driveFrame(dt);
        Object.assign(wrap.dataset, { phase: st.phase, lane: st.lane.toFixed(3), row: rowLane(st.dist).toFixed(3) });
        draw(st.t);
      }
      // ----- drawing -----
      function storm(t) {
        const sp = Math.min(1, st.driveT / BALE_STORM);
        ctx.fillStyle = `rgba(38,44,58,${.55 * sp * sp})`; ctx.fillRect(0, 0, W, 210);
        ctx.fillStyle = `rgba(66,72,88,${.85 * sp})`;
        for (let k = 0; k < 7; k++) { ctx.beginPath(); ctx.ellipse(W - 30 - k * 46 * sp, 70 + Art.pr(k + 5) * 40, 70 * sp + 10, 34 * sp + 6, 0, 0, 7); ctx.fill(); }
        if (sp > .8 && Math.sin(t * 7.3) > .993) { ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(0, 0, W, H); }
        if (st.phase !== 'drive' && st.rained > 0) {
          ctx.strokeStyle = 'rgba(190,205,225,.6)'; ctx.lineWidth = 1; ctx.beginPath();
          for (let k = 0; k < 90; k++) { const x = (Art.pr(k) * W + t * 60) % W, y = (Art.pr(k + 40) * H + t * 420) % H; ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 12); }
          ctx.stroke();
        }
      }
      const toScreen = (wx) => PICK + (wx - st.dist);
      // Where the pickup meets the ground for a lane (it is drawn just below the lane line). The windrow, the holes, and
      // mouse steering are all centered on this track, so the hay counts as picked up exactly where it looks it should.
      const track = (l) => laneY(l) + 4 + 2 * depth(l);
      const missedAt = (wx) => st.gaps.some((g) => wx >= g[0] && wx <= g[1]);
      // the windrow: always ahead of the pickup, and behind it only where it was missed
      function windrow() {
        let run = null;
        const flush = () => {
          if (!run || run.length < 2) { run = null; return; }
          ctx.beginPath(); run.forEach(([x, y, h], i) => (i ? ctx.lineTo(x, y - h) : ctx.moveTo(x, y - h)));
          for (let i = run.length - 1; i >= 0; i--) ctx.lineTo(run[i][0], run[i][1] + 2);
          ctx.closePath();
          const g = ctx.createLinearGradient(0, LANE0 - 24, 0, LANE1);
          g.addColorStop(0, st.rained > 0 && st.phase !== 'drive' ? '#8a8d68' : '#efdc8a'); g.addColorStop(1, '#a8913e');
          ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(96,74,20,.75)'; ctx.lineWidth = 1.4; ctx.stroke();
          ctx.strokeStyle = 'rgba(255,246,196,.7)'; ctx.lineWidth = .9; ctx.beginPath();
          for (let i = 0; i < run.length; i += 2) { const [x, y, h] = run[i]; ctx.moveTo(x, y - h * .5); ctx.lineTo(x + 4, y - h * .85); }
          ctx.stroke();
          run = null;
        };
        for (let x = -6; x <= W + 6; x += 4) {
          const wx = st.dist + (x - PICK);
          if (wx < 0 || wx > BALE_FIELD || (x < PICK && !missedAt(wx))) { flush(); continue; }
          const l = rowLane(wx), h = (5 + thick(wx) * 10) * depth(l);
          (run || (run = [])).push([x, track(l) + h / 2 - 1, h]);
        }
        flush();
        // heavy clumps show darker and taller
        for (let x = PICK; x <= W; x += 4) {
          const wx = st.dist + (x - PICK);
          if (wx > BALE_FIELD || thick(wx) <= 1.3) continue;
          const l = rowLane(wx), h = (5 + thick(wx) * 10) * depth(l);
          ctx.fillStyle = 'rgba(120,92,24,.5)'; ctx.fillRect(x, track(l) + h / 2 - 1 - h * .85, 4.5, h * .75);
        }
      }
      // a woodchuck hole with its mound of dirt; now and then the woodchuck peeks out
      function hazard(z) {
        const x = toScreen(z.x), y = track(z.lane), k = depth(z.lane) * 1.4;
        if (x < -30 || x > W + 30) return;
        ctx.fillStyle = '#8a6a42'; ctx.beginPath(); ctx.ellipse(x + 5 * k, y - 1, 9 * k, 4 * k, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#1e140c'; ctx.beginPath(); ctx.ellipse(x - 2 * k, y, 7 * k, 3 * k, 0, 0, 7); ctx.fill();
        if (!z.hit && Math.sin(st.t * 1.3 + z.x) > .6) {
          ctx.fillStyle = '#6b4a2c'; ctx.beginPath(); ctx.ellipse(x - 2 * k, y - 4 * k, 3.4 * k, 4 * k, 0, 0, 7); ctx.fill();
          ctx.fillStyle = '#1a120c'; ctx.beginPath(); ctx.arc(x - .6 * k, y - 6 * k, .7 * k, 0, 7); ctx.fill();
        }
      }
      function lyingBale(q) {
        const x = toScreen(q.x), y = track(q.lane), k = depth(q.lane);
        if (x < -40 || x > W + 40) return;
        ctx.fillStyle = 'rgba(30,24,16,.25)'; ctx.beginPath(); ctx.ellipse(x, y + 1, 16 * k, 3 * k, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#9aa35c'; ctx.beginPath(); ctx.ellipse(x, y - 3 * k, 15 * k, 5 * k, .1, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(80,88,34,.6)'; ctx.lineWidth = .8; ctx.beginPath(); for (let i = -2; i <= 2; i++) { ctx.moveTo(x + i * 5 * k, y - 7 * k); ctx.lineTo(x + i * 6 * k + 2, y + 1); } ctx.stroke();
      }
      // the outfit in rig coordinates: the pickup at x 0, the ground at y 0
      function outfit(t) {
        const BX = -20 * SC, TX = BX + 48 * SC + 40, CHUTE = BX - 96 * SC, WX = CHUTE - 150;
        ctx.strokeStyle = '#4a3a2a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(WX + 140, -18); ctx.lineTo(CHUTE + 4, -8); ctx.stroke();
        ctx.fillStyle = '#7a5a38'; ctx.fillRect(WX, -26, 140, 7);
        ctx.fillStyle = '#5b4632'; ctx.fillRect(WX, -66, 4, 40); ctx.fillRect(WX + 136, -52, 4, 26);
        for (const wx of [WX + 26, WX + 114]) Art.wheel(ctx, wx, -11, 11, '#8a2a22', -st.roll * 9, false);
        const slot = (i) => ({ x: WX + 6 + (i % 6) * 21, y: -37 - Math.floor(i / 6) * 11 });
        st.flying.forEach((f) => { if (f.p >= 1 && f.slot < 30) { const p = slot(f.slot); Art.baleSide(ctx, p.x, p.y, 20, 11, tieKind); } });
        const top = slot(Math.max(0, Math.min(29, st.good))).y;
        ctx.save(); ctx.translate(WX + 62, top + 4); ctx.scale(1.6, 1.6); Art.person(ctx, 0, -17, '#6d8fb4', '#cdb06a'); ctx.restore();
        for (const f of st.flying) {
          if (f.p >= 1 || f.slot >= 30) continue;
          const p = slot(f.slot), x = CHUTE + (p.x - CHUTE) * f.p, y = -8 + (p.y + 8) * f.p - 40 * Math.sin(Math.PI * f.p);
          Art.baleSide(ctx, x, y, 20, 11, tieKind);
        }
        const running = st.phase === 'drive' && st.repair <= 0;
        Art.machine(ctx, b.id, BX, 0, SC, st.roll * 1.6 + st.t * .2, running ? 'drive' : 'idle', rig.balerYear);
        Art.machine(ctx, rig.power.id, TX, 0, 1.45, st.roll * 1.6, running && st.v > 0 ? 'drive' : 'idle', rig.powerYear);
        // the pickup glows green on the windrow, red off it
        if (st.phase === 'drive') {
          ctx.fillStyle = st.repair > 0 ? 'rgba(160,160,160,.5)' : st.onRow ? 'rgba(70,170,60,.55)' : 'rgba(200,50,40,.55)';
          ctx.beginPath(); ctx.ellipse(4, 2, 16, 4, 0, 0, 7); ctx.fill();
        }
        if (st.repair > 0) { ctx.save(); ctx.translate(BX + 34, 4); ctx.scale(1.7, 1.7); Art.person(ctx, 0, -17, '#a5493c', '#d9c07a'); ctx.restore(); }
      }
      function drawDrive(t) {
        storm(t);
        // the mown band being baled, lighter than the standing grass around it
        const band = ctx.createLinearGradient(0, LANE0 - 14, 0, LANE1 + 10);
        band.addColorStop(0, 'rgba(206,198,128,0)'); band.addColorStop(.12, 'rgba(206,198,128,.42)'); band.addColorStop(.9, 'rgba(196,188,116,.48)'); band.addColorStop(1, 'rgba(196,188,116,0)');
        ctx.fillStyle = band; ctx.fillRect(0, LANE0 - 14, W, LANE1 - LANE0 + 24);
        // stubble rows across the band, scrolling past
        ctx.strokeStyle = 'rgba(48,82,30,.5)'; ctx.lineWidth = 1; ctx.beginPath();
        for (let l = 0; l <= 1.001; l += .2) {
          const y = laneY(l), gap = 15 - l * 6;
          for (let x = -((st.dist * depth(l)) % gap); x < W; x += gap) { ctx.moveTo(x, y + 4); ctx.lineTo(x + 1.5, y + 1); }
        }
        ctx.stroke();
        windrow();
        // things on the far side of the rig, the rig itself, then things on the near side
        const far = (l) => l < st.lane;
        for (const q of st.lying) if (far(q.lane)) lyingBale(q);
        for (const z of hazards) if (far(z.lane)) hazard(z);
        const k = depth(st.lane);
        ctx.save(); ctx.translate(PICK, laneY(st.lane) + 4); ctx.scale(k, k); outfit(t); ctx.restore();
        for (const q of st.lying) if (!far(q.lane)) lyingBale(q);
        for (const z of hazards) if (!far(z.lane)) hazard(z);
      }
      function draw(t) {
        ctx.save();
        if (st.shake > 0) ctx.translate((Math.random() - .5) * 8, (Math.random() - .5) * 6);
        if (!scenery) scenery = canvasLayer(W + 20, H + 20, (c) => {
          c.translate(10, 10);
          Art.plate(c, W, H, 'summer', 205, { bleed: 10, trees: [[40, 110, 0], [712, 96, 1]] });
        });
        drawLayer(ctx, scenery, -10, -10);
        drawDrive(t);
        Art.finish(ctx, 'summer');
        // HUD
        ctx.fillStyle = 'rgba(255,250,235,.88)'; ctx.fillRect(10, 10, 360, 66);
        ctx.fillStyle = '#3b2a1e'; ctx.textAlign = 'left'; ctx.font = 'bold 14px Georgia';
        const total = st.picked + st.missed;
        ctx.fillText(`Steer along the windrow   ${total ? Math.round(st.picked / total * 100) : 100}% picked up`, 20, 30);
        ctx.font = '13px Georgia';
        ctx.fillText(`Bales ${st.good}   Lost ${st.broken + st.bounced}   Woodchuck holes ${st.holes}   Plugs ${st.plugs}`, 20, 50);
        if (st.done) ctx.fillText(st.note, 20, 68);
        else {
          ctx.fillStyle = '#d8ccb0'; ctx.fillRect(20, 58, 150, 8); ctx.fillRect(200, 58, 150, 8);
          ctx.fillStyle = '#4f8a2e'; ctx.fillRect(20, 58, 150 * Math.min(1, st.dist / BALE_FIELD), 8);
          ctx.fillStyle = '#3d4a66'; ctx.fillRect(200, 58, 150 * Math.min(1, st.driveT / BALE_STORM), 8);
          ctx.fillStyle = '#3b2a1e'; ctx.font = '10px Georgia'; ctx.fillText('FIELD', 20, 75); ctx.fillText('STORM', 200, 75);
          ctx.fillStyle = 'rgba(255,250,235,.88)'; ctx.fillRect(648, 10, 102, 40);
          ctx.fillStyle = '#d8ccb0'; ctx.fillRect(658, 30, 82, 8);
          ctx.fillStyle = st.plug > .6 ? '#a3262a' : '#c9a227'; ctx.fillRect(658, 30, 82 * Math.min(1, st.plug), 8);
          ctx.fillStyle = '#3b2a1e'; ctx.font = 'bold 10px Georgia'; ctx.textAlign = 'center'; ctx.fillText('PLUGGING', 699, 24);
        }
        gameFlash(ctx, st, W, 120);
        ctx.restore();
      }
      const stopFrames = miniFrames(wrap, ctx, st, frame, unbind, reject);
    });
  }

  // ---------- the market window: the fall market after harvest, or any planning season from the Market tab ----------
  async function marketWindow() {
    const keep = Sim.keepSuggestion(s), qty = {}, tally = { sold: 0, bought: 0 };
    const fall = s.phase === 'fall', ps = Sim.marketSeason(s);
    const label = { spring: 'Spring', summer: 'Summer', fall: 'Fall', winter: 'Winter' }[s.phase] || 'Spring';
    const intro = fall ? 'Prices sag at harvest time: about 8% below spring for selling and buying alike. Keep enough for winter feed and next year\'s seed &mdash; or sell now and buy back later.'
      : s.phase === 'winter' ? 'Winter trading runs at the harvest-time prices, about 8% below spring. Keep enough hay and grain to see the herd through to pasture, and seed for spring.'
        : 'Spring prices: buying costs about 8% more than selling brings. Keep enough for the herd until pasture and the seed for this year\'s planting.';
    const f2 = (v) => `$${v.toFixed(v < 1 ? 3 : 2)}`;
    const qtyOf = (k, dflt) => (qty[k] === undefined ? dflt : qty[k]);
    const body = () => {
      const rows = Object.entries(DATA.goods).map(([g, d]) => {
        const have = s.store[g] || 0, none = have < .05 ? 'disabled' : '';
        return `<tr><td>${d.name}</td><td>${fx(have)} ${d.unit}</td><td>${fx(keep[g] || 0)}</td><td>${f2(Sim.sellPrice(s, g, ps))}</td><td>${f2(Sim.buyPrice(s, g, ps))}</td>
          <td><input type="number" min="0" class="qty" data-k="${g}" value="${qtyOf(g, 100)}"></td>
          <td class="btns"><button type="button" data-fm="buy" data-g="${g}">Buy</button><button type="button" data-fm="sell" data-g="${g}" ${none}>Sell</button><button type="button" data-fm="sellAll" data-g="${g}" ${none}>Sell all</button></td></tr>`;
      }).join('');
      const crow = Object.keys(DATA.cheeses).map((id) => {
        const d = DATA.cheeses[id], c = s.cheese[id];
        return ['fresh', 'aged'].filter((w) => c[w] > .5).map((w) => {
          const k = `${id}:${w}`;
          return `<tr><td>${d.name} <small>(${w}${w === 'fresh' && d.ages ? ', can age' : ''})</small></td><td>${fx(c[w])} lb</td><td>demand ~${fx(Math.max(0, Sim.cheeseDemand(s, id) - (s.season.cheeseSold[id] || 0)))}</td><td>$${Sim.cheesePrice(s, id, w === 'aged').toFixed(3)}</td>
            <td><input type="number" min="0" class="qty" data-k="${k}" value="${qtyOf(k, Math.floor(c[w]))}"></td>
            <td class="btns"><button type="button" data-fm="sellCheese" data-id="${id}" data-w="${w}">Sell</button><button type="button" data-fm="sellCheeseAll" data-id="${id}" data-w="${w}">Sell all</button></td></tr>`;
        }).join('');
      }).join('');
      return `<p>${intro} Trades happen at once.</p>
        <table class="tbl market fall"><thead><tr><th>Goods</th><th>On hand</th><th>Keep for feed/seed</th><th>Sell</th><th>Buy</th><th>Qty</th><th></th></tr></thead><tbody>${rows}</tbody></table>
        ${crow ? `<h4>Cheese cellar</h4><table class="tbl market fall"><thead><tr><th>Cheese</th><th>On hand</th><th>Market</th><th>Price/lb</th><th>Qty</th><th></th></tr></thead><tbody>${crow}</tbody></table><p class="hint">Cheese that can age gains value next year. Fresh cheese that can't age loses 40% over the winter. Sales beyond market demand fetch only 55%.</p>` : ''}`;
    };
    const topBar = () => `<div class="dealer-top"><span>Cash on hand <b id="mCash">${money(s.cash)}</b></span><span>Sold <b>${money(tally.sold)}</b></span><span>Bought <b>${money(tally.bought)}</b></span></div>`;
    const count = (before) => { const d = s.cash - before; if (d > 0) { tally.sold += d; sfx('coin'); } else tally.bought -= d; };
    await modal({
      title: `${label} Market — ${s.year}`, cls: 'wide fallmkt', html: `<div id="fmBody">${body()}</div>`,
      buttons: [{ label: 'Sell surplus', value: 'surplus' }, { label: 'Sell all cheese', value: 'cheese' }, { label: 'Done trading', value: 'done', primary: true }],
      onRender: (root) => {
        const box = root.querySelector('#fmBody'), scroller = root.querySelector('.modal');
        const head = document.createElement('div');
        head.className = 'dealer-head';
        head.innerHTML = `<div class="dealer-title"><h2>${label} Market &mdash; ${s.year}</h2><span class="head-btns"><button data-i="0">Sell surplus</button><button data-i="1">Sell all cheese</button><button class="primary" data-i="2">Done trading</button></span></div><div id="fmTop">${topBar()}</div>`;
        scroller.querySelector(':scope > h2').remove();
        scroller.prepend(head);
        head.querySelector('.head-btns').addEventListener('click', (e) => { const b = e.target.closest('button[data-i]'); if (b) root.querySelectorAll('.modal-buttons button')[+b.dataset.i].click(); });
        const redraw = () => { const y = scroller.scrollTop; box.innerHTML = body(); head.querySelector('#fmTop').innerHTML = topBar(); scroller.scrollTop = y; render(); };
        box.addEventListener('input', (e) => { const i = e.target.closest('input.qty'); if (i) qty[i.dataset.k] = Math.max(0, Math.floor(+i.value || 0)); });
        box.addEventListener('click', (e) => {
          const b = e.target.closest('button[data-fm]');
          if (!b) return;
          const a = b.dataset.fm, g = b.dataset.g, before = s.cash;
          let err = null;
          if (a === 'buy') err = Sim.trade(s, g, qtyOf(g, 10));
          else if (a === 'sell') err = Sim.trade(s, g, -Math.min(qtyOf(g, 10), s.store[g]));
          else if (a === 'sellAll') err = Sim.trade(s, g, -s.store[g]);
          else {
            const id = b.dataset.id, w = b.dataset.w, have = s.cheese[id][w];
            const n = a === 'sellCheeseAll' ? have : Math.min(have, qtyOf(`${id}:${w}`, Math.floor(have)));
            if (n > 0) Sim.sellCheese(s, id, w, n);
          }
          if (err) { toast(err, true); return; }
          count(before);
          redraw();
        });
        root._redraw = redraw;
      },
      onButton: (v, root) => {
        const before = s.cash;
        if (v === 'surplus') {
          for (const g of Object.keys(DATA.goods)) { const extra = Math.floor(Math.max(0, (s.store[g] || 0) - (keep[g] || 0))); if (extra > 0) Sim.trade(s, g, -extra); }
          count(before); root._redraw(); return false;
        }
        if (v === 'cheese') {
          for (const id of Object.keys(DATA.cheeses)) for (const w of ['fresh', 'aged']) if (s.cheese[id][w] > 0) Sim.sellCheese(s, id, w, s.cheese[id][w]);
          count(before); root._redraw(); return false;
        }
        if (tally.sold || tally.bought) log(`${label} market: sold ${money(tally.sold)}${tally.bought ? `, bought ${money(tally.bought)}` : ''}.`);
        return true;
      },
    });
    render();
  }

  // ---------- end game ----------
  async function endGame() {
    const r = Sim.rating(s);
    const html = `<div class="title-art">${nelsSvg(s.year)}<div><h3>${s.over.text}</h3>
      <p>Final net worth: <b>${money(Sim.netWorth(s))}</b> (${money(r.real)} in 1910 dollars).</p>
      <p>Nels will be remembered as: <b class="rating">${r.title}</b>${s.cheats.used ? ' <small>(with a little help from the cheat console)</small>' : ''}</p></div></div>
      <canvas id="worthChart" width="640" height="220"></canvas>`;
    const v = await modal({ title: `The Chronicle of Nels, ${s.startYear}–${s.year}`, cls: 'wide', html, onRender: (root) => chart(root.querySelector('#worthChart')), buttons: [{ label: 'Start a new chronicle', value: 'new', primary: true }] });
    if (v === 'new') { localStorage.removeItem(SAVE_KEY); title(); }
  }
  function chart(cv) {
    const ctx = cv.getContext('2d'), h = s.history, W = cv.width, H = cv.height;
    ctx.fillStyle = '#fbf6e9'; ctx.fillRect(0, 0, W, H);
    if (h.length < 2) return;
    const max = Math.max(...h.map((x) => x.worth), 1), min = Math.min(0, ...h.map((x) => x.worth));
    const X = (i) => 50 + i * (W - 70) / (h.length - 1), Y = (v) => H - 30 - (v - min) / (max - min) * (H - 50);
    ctx.strokeStyle = '#ccb'; ctx.fillStyle = '#665'; ctx.font = '11px Georgia';
    for (let k = 0; k <= 4; k++) { const v = min + (max - min) * k / 4; ctx.beginPath(); ctx.moveTo(50, Y(v)); ctx.lineTo(W - 20, Y(v)); ctx.stroke(); ctx.fillText(money(v), 2, Y(v) + 4); }
    ctx.strokeStyle = '#367c2b'; ctx.lineWidth = 2.5; ctx.beginPath();
    h.forEach((p, i) => (i ? ctx.lineTo(X(i), Y(p.worth)) : ctx.moveTo(X(i), Y(p.worth)))); ctx.stroke();
    ctx.fillStyle = '#665'; ctx.textAlign = 'center';
    const labeled = new Set();
    h.forEach((p, i) => { if (p.year % 10 === 0 && !labeled.has(p.year)) { labeled.add(p.year); ctx.fillText(p.year, X(i), H - 10); } });
  }

  // ---------- panel rendering ----------
  function stepper(path, step = 1, max) {
    const v = getPath(s.plan, path);
    return `<span class="stepper"><button data-act="step" data-path="${path}" data-step="${-step}">&minus;</button><input type="number" min="0" ${max !== undefined ? `max="${max}"` : ''} data-plan="${path}" value="${v}"><button data-act="step" data-path="${path}" data-step="${step}" ${max !== undefined ? `data-max="${max}"` : ''}>+</button></span>`;
  }
  const yieldF = () => .5 + s.soil / 100 * .7;
  function tabFields() {
    const cl = Sim.cropland(s), planned = Sim.plannedAcres(s), cap = Sim.powerCap(s);
    const need = Sim.laborNeed(s), have = Sim.laborAvail(s);
    const rows = DATA.cropOrder.filter((c) => !(DATA.crops[c].from > Sim.finalYear(s)) || Sim.cropAllowed(s, c)).map((c) => {
      const d = DATA.crops[c], ok = Sim.cropAllowed(s, c);
      const next = Object.values(DATA.crops).find((x) => x.replaces === c);
      const why = ok ? '' : d.needs && !s.buildings[d.needs] ? `needs ${Sim.buildingDef(d.needs).name}` : d.to && s.year > d.to && next ? `replaced by ${next.name.toLowerCase()} in ${d.to + 1}` : `available ${d.from}`;
      const good = DATA.goods[c] ? c : /hay/.test(d.unit) ? 'hay' : null;
      const pv = good ? Sim.sellPrice(s, good, Sim.marketSeason(s)) : 0;
      const price = good ? `$${pv.toFixed(pv < 1 ? 3 : 2)}` : 'feed';
      return `<tr class="${ok ? '' : 'locked'}"><td><span class="sw" style="background:${d.color}"></span>${d.name}${why ? `<small> (${why})</small>` : ''}</td>
        <td>${ok ? stepper('crops.' + c, 2) : '&mdash;'}</td><td>${fx(d.yield * yieldF(), d.yield < 10 ? 1 : 0)} ${d.unit}</td><td>${price}</td></tr>`;
    }).join('');
    return `<div class="stats3"><div><b>${planned}</b> / ${cl} ac<small>planned / cropland</small></div>
      <div class="${planned > cap ? 'bad' : ''}"><b>${cap}</b> ac<small>power capacity</small></div>
      <div class="${need > have ? 'bad' : ''}"><b>${fx(need, 1)}</b> / ${fx(have, 1)}<small>labor need / have</small></div></div>
      <h4>Help</h4><div class="row">Hired men: ${stepper('hired', 1)} <span class="price">${money(Sim.wage(s))}/yr each</span></div>
      <table class="tbl"><thead><tr><th>Crop</th><th>Acres</th><th>Est./ac</th><th title="What the Market pays today">Price</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="meter"><span>Soil fertility</span><div><i style="width:${s.soil}%;background:${s.soil > 60 ? '#4f8a2e' : s.soil > 40 ? '#c9a227' : '#a3262a'}"></i></div><b>${Math.round(s.soil)}</b></div>
      ${siloNote()}
      <p class="hint">Clover and alfalfa build the soil; corn and tobacco wear it out and wash it down the coulee${s.buildings.contour ? ' (your contour strips hold it)' : ''}. Cows add manure. Each horse handles ~20 acres; tractors far more.</p>`;
  }
  // What the silo will take from this year's corn, at this soil and before the weather.
  function siloNote() {
    if (!s.buildings.silo) return '';
    const need = Sim.siloTarget(s), corn = s.plan.crops.corn || 0, perAcre = DATA.crops.corn.yield * yieldF() * Sim.SILAGE_PER_BU;
    if (!need) return '<p class="hint"><b>Silo:</b> already full for the herd this winter.</p>';
    if (!corn) return '<p class="hint"><b>Silo:</b> plant some corn to fill it; silage-fed cows give 8% more milk and need less hay.</p>';
    const ac = Math.min(corn, need / perAcre);
    return `<p class="hint"><b>Silo:</b> about ${fx(ac, 1)} of your ${corn} acres of corn will be cut green for about ${fx(ac * perAcre, 0)} t of silage${ac < need / perAcre ? ' (not quite enough for the whole herd)' : ''}; the rest is picked for grain.</p>`;
  }
  function tabHerd() {
    const p = s.plan, sh = Sim.milkShares(s);
    const whole = Object.entries(DATA.cheeses).filter(([id, c]) => c.milk === 'whole');
    const cellar = Object.entries(s.cheese).filter(([, c]) => c.fresh + c.aged > .5);
    const ch = !!s.buildings.cheese_house;
    return `<div class="row"><b>Milk cows: ${s.cows}</b> / ${Sim.barnCap(s)} stalls <span class="price">${money(Sim.cowPrice(s))} ea</span>
        <span class="btns"><button data-act="animal" data-kind="cows" data-n="-5">−5</button><button data-act="animal" data-kind="cows" data-n="-1">−1</button><button data-act="animal" data-kind="cows" data-n="1">+1</button><button data-act="animal" data-kind="cows" data-n="5">+5</button></span></div>
      <div class="row"><b>Work horses: ${s.horses}</b> <span class="price">${money(Sim.horsePrice(s))} ea</span>
        <span class="btns"><button data-act="animal" data-kind="horses" data-n="-1">−1</button><button data-act="animal" data-kind="horses" data-n="1">+1</button></span></div>
      <div class="row">Calves growing: ${s.heifers}. Keep heifer calves: ${stepper('keepHeifers', 1)}</div>
      <div class="row">Ration: <select data-plan="ration"><option value="lean" ${p.ration === 'lean' ? 'selected' : ''}>Lean (-18% milk)</option><option value="std" ${p.ration === 'std' ? 'selected' : ''}>Standard</option><option value="gen" ${p.ration === 'gen' ? 'selected' : ''}>Generous (+12% milk)</option></select></div>
      <h4>Where the milk goes</h4>
      <div class="row">Cream to co-op creamery % ${stepper('milk.cream', 10, 100)}</div>
      <div class="row">Whole milk to cheese factory % ${stepper('milk.factory', 10, 100)}</div>
      <div class="row ${ch ? '' : 'locked'}">Ingrid's Ostehus % ${ch ? stepper('milk.home', 10, 100) : '<small>build a cheese house</small>'}</div>
      <p class="hint">Actual split: cream ${Math.round(sh.cream * 100)}%, factory ${Math.round(sh.factory * 100)}%, home cheese ${Math.round(sh.home * 100)}%.</p>
      <div class="row">Vat cheese: <select data-plan="cheese" ${ch ? '' : 'disabled'}>${whole.map(([id, c]) => `<option value="${id}" ${p.cheese === id ? 'selected' : ''} ${Sim.cheeseAvailable(s, id) ? '' : 'disabled'}>${c.name}${Sim.cheeseAvailable(s, id) ? '' : ` (${c.from})`}</option>`).join('')}</select></div>
      <p class="hint">${DATA.cheeses[p.cheese].note}</p>
      <div class="row">Skim milk: <select data-plan="skim"><option value="calves">Feed calves &amp; pigs</option><option value="gamalost" ${p.skim === 'gamalost' ? 'selected' : ''} ${ch ? '' : 'disabled'}>Make Gamalost</option><option value="pultost" ${p.skim === 'pultost' ? 'selected' : ''} ${ch ? '' : 'disabled'}>Make Pultost</option></select></div>
      <div class="row">Whey: <select data-plan="whey"><option value="calves">Feed calves &amp; pigs</option><option value="brunost" ${p.whey === 'brunost' ? 'selected' : ''} ${ch ? '' : 'disabled'}>Boil into Brunost (uses firewood)</option></select></div>
      <h4>Cheese cellar</h4>${cellar.length ? `<table class="tbl"><tr><th>Cheese</th><th>Fresh</th><th>Aged</th></tr>${cellar.map(([id, c]) => `<tr><td>${DATA.cheeses[id].name}</td><td>${fx(c.fresh)} lb</td><td>${fx(c.aged)} lb</td></tr>`).join('')}</table>` : '<p class="hint">Empty. Ingrid is itching to make cheese.</p>'}
      <p class="hint">Cheese skill: ${Math.round(s.skill * 100)}% · Firewood: ${fx(s.store.wood, 1)} cords</p>`;
  }
  const thumbs = {};
  function thumb(id, year) {
    const key = `${id}:${year}`;
    if (!thumbs[key]) {
      const m = Sim.machineDef(id), c = document.createElement('canvas');
      c.width = 96; c.height = 56;
      const x = c.getContext('2d');
      x.fillStyle = '#efe5c9'; x.fillRect(0, 0, 96, 56); x.fillStyle = '#b9a77a'; x.fillRect(0, 51, 96, 5);
      const L = m.type === 'power' && m.kind !== 'steam' ? Art.lookOf(m, year) : null;
      const k = L ? (.72 + m.hp / 85) * (L.st === 'utility' ? .92 : L.st === 'frame' ? 1.08 : 1) : 1;
      const dims = L ? [64 * k, (L.st === 'frame' ? 54 : 40) * k] : m.type === 'binder' ? [60, 36] : m.kind === 'steam' ? [66, 62]
        : m.type === 'baler' ? [150, 62] : m.type === 'engine' ? [40, 34] : m.type === 'sawmill' ? [130, 45] : m.id === 'buzz_saw' ? [40, 36] : m.id === 'chainsaw' ? [36, 16] : [135, 64];
      const sc = Math.min(48 / dims[1], 90 / dims[0]);
      // a baler reaches 96 units behind its origin and 48 ahead, so it is shifted to center it
      Art.machine(x, id, 48 - (L ? 4 * k * sc : 0) + (m.type === 'baler' ? 24 * sc : 0), 51, sc, 0, 'idle', year);
      thumbs[key] = c.toDataURL();
    }
    return thumbs[key];
  }
  const TYPE_ORDER = ['power', 'engine', 'thresher', 'huller', 'binder', 'baler', 'sawmill', 'woodtool'];
  const traitChips = (m, year) => Sim.traits(m, year).map((k) => `<span class="trait t-${k}" title="${Sim.TRAITS[k].note}">${Sim.TRAITS[k].name}</span>`).join('');
  // Identical machines (same model, year, and condition) share one row with a quantity
  function machineGroups() {
    const groups = new Map();
    for (const o of s.machines) {
      const key = `${o.id}|${o.bought}|${o.built || o.bought}|${o.used ? 1 : 0}`;
      if (!groups.has(key)) groups.set(key, { o, m: Sim.machineDef(o.id), uids: [] });
      groups.get(key).uids.push(o.uid);
    }
    return [...groups.values()].sort((a, b) => TYPE_ORDER.indexOf(a.m.type) - TYPE_ORDER.indexOf(b.m.type));
  }
  function tabMachines() {
    const rows = machineGroups().map(({ o, m, uids }) => `<tr><td><img class="thumb sm" src="${thumb(m.id, o.built || o.bought)}" alt=""></td><td>${m.name}<small class="sub">${o.used ? 'used, ' : ''}bought ${o.bought}</small></td><td class="num">${uids.length}</td>
      <td class="btns"><button data-act="sellMachine" data-uid="${uids[uids.length - 1]}">Sell one ${money(Sim.machineValue(s, o) * .85)}</button></td></tr>`).join('');
    return `<button class="primary dealer-open" data-act="dealer">Open the Machinery Dealer &#9656;</button>
      <p class="hint">Belt power <b>${Sim.beltHP(s)} HP</b> · field power <b>${Sim.powerCap(s)} acres</b>. Shop for tractors, separators, balers, and sawmills at the dealer; buildings are on the Buildings tab. Every kind of tractor has its own advantage.</p>
      <h4>Your machinery</h4>${rows ? `<table class="tbl market shed"><thead><tr><th></th><th>Machine</th><th>Qty</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="hint">No machinery yet.</p>'}`;
  }
  // ---------- the Buildings tab ----------
  const bthumbs = {};
  function bthumb(id) {
    const key = `${id}:${s ? s.startYear : 1900}`;
    if (!bthumbs[key]) {
      const c = document.createElement('canvas'); c.width = 240; c.height = 140;
      Art.buildingThumb(c.getContext('2d'), id, s, 240, 140);
      bthumbs[key] = c.toDataURL();
    }
    return bthumbs[key];
  }
  function tabBuildings() {
    const editable = canPlan() && !winterPlanning();
    const rows = DATA.buildings.map((b) => {
      const avail = Sim.buildingAvailable(s, b), have = s.buildings[b.id], c = Sim.buildingCost(s, b);
      const lum = b.lumber ? `${b.lumber} MBF lumber${c.use > .05 ? ` (${fx(c.use, 1)} from your own pile saves ${money(c.credit)})` : ''}` : 'no lumber';
      const needs = b.needs && !s.buildings[b.needs] ? Sim.buildingDef(b.needs) : null;
      const act = have && !b.repeat ? '<b class="ok">Built</b>'
        : avail && !needs ? `<button data-act="build" data-id="${b.id}" ${!editable || c.cash > s.cash ? 'disabled' : ''}>Build ${money(c.cash)}</button>`
        : `<small>${needs ? `needs ${needs.name}` : b.id === 'contour' ? 'from 1933' : `from ${b.from}`}</small>`;
      return `<tr class="${avail && !needs || have ? '' : 'locked'}${have ? ' built' : ''}"><td><img class="thumb bld" src="${bthumb(b.id)}" alt=""></td>
        <td><b>${b.name}</b>${have && b.repeat ? ` &times;${have}` : ''}<small class="sub">${b.note}</small><small class="sub">${lum}</small></td><td class="btns">${act}</td></tr>`;
    }).join('');
    const n = DATA.buildings.filter((b) => s.buildings[b.id]).length;
    return `<p class="hint">${n} of ${DATA.buildings.length} built · lumber on hand <b>${fx(s.store.lumber || 0, 1)} MBF</b> · cash <b>${money(s.cash)}</b>. ${editable ? 'Build during spring planning; your own sawn lumber is used first.' : 'Building happens during spring planning.'}</p>
      <table class="tbl shed blds-tab"><tbody>${rows}</tbody></table>`;
  }
  // ---------- the Machinery dealer window ----------
  async function machineryWindow() {
    if (!s || document.querySelector('.modal.dealer')) return;
    const editable = () => canPlan() && !winterPlanning();
    const dis = (blocked) => (!editable() || blocked ? 'disabled' : '');
    const shedF = () => (s.buildings.machine_shed ? .6 : 1);
    const fuelText = (m) => (m.kind === 'steam' ? `${Math.round(m.fuel * .2)} cords` : m.fuel ? money(m.fuel * Sim.fuelF(m) * Sim.cost(s) * .6) : '—');
    const spec = (m) => m.type === 'binder' ? `cuts and binds ${m.acres} acres of small grain`
      : m.type === 'engine' ? `${m.hp} HP stationary belt power: runs a buzz saw`
      : m.type === 'baler' ? `${m.tie} tie · ${m.engine ? 'own engine; any tractor pulls it' : `tractor PTO, needs ${m.minHP} HP`} · bales about ${m.perDay} t a day`
      : m.type === 'sawmill' ? `needs ${m.minHP} belt HP · saws ${m.perDay} MBF a day`
      : m.type === 'woodtool' ? (m.minHP ? `needs ${m.minHP} HP from an engine or tractor · firewood labor halved` : 'fells and bucks timber fast · firewood and log labor cut sharply')
      : `${m.minHP ? `needs ${m.minHP} belt HP · ` : ''}${m.perDay} bu a day${m.attach ? ' · fits on your separator' : ''}`;
    const topBar = () => {
      const bt = Sim.bestThresher(s), hl = Sim.huller(s), sm = Sim.bestSawmill(s), br = Sim.balerRig(s);
      return `<div class="dealer-top"><span>Cash <b>${money(s.cash)}</b></span><span>Belt power <b>${Sim.beltHP(s)} HP</b></span><span>Field power <b>${Sim.powerCap(s)} ac</b> (${Sim.plannedAcres(s)} planned)</span>
        <span>Separator: <b>${bt ? bt.name : 'none'}</b></span>${Sim.cropAllowed(s, 'alfalfa') ? `<span>Baler: <b>${br ? br.baler.name : 'none'}</b></span>` : `<span>Huller: <b>${hl ? hl.name : 'none'}</b></span>`}<span>Sawmill: <b>${sm ? sm.name : 'none'}</b></span></div>`;
    };
    const body = () => {
      const y = s.year;
      const top = editable() ? '' : '<p class="hint">You can look around now; buying and selling happen during spring planning.</p>';
      const groups = machineGroups();
      const shed = groups.length ? `<table class="tbl dealer"><thead><tr><th></th><th>Machine</th><th>Qty</th><th>Advantages</th><th>Repairs/yr each</th><th>Value each</th><th></th></tr></thead><tbody>${groups.map(({ o, m, uids }) => {
        const yr = o.built || o.bought;
        return `<tr><td><img class="thumb" src="${thumb(m.id, yr)}" alt=""></td><td><b>${m.name}</b><small class="sub">${o.used ? `used, built ${yr}, ` : ''}bought ${o.bought}</small></td><td class="num">${uids.length}</td>
          <td>${traitChips(m, yr) || '<small class="sub">—</small>'}</td><td>${money(Sim.machineRepairs(s, o))}</td><td>${money(Sim.machineValue(s, o))}</td>
          <td class="btns"><button data-dl="sell" data-uid="${uids[uids.length - 1]}" ${dis(false)}>Sell one ${money(Sim.machineValue(s, o) * .85)}</button></td></tr>`;
      }).join('')}</tbody></table>` : '<p class="hint">No machinery yet.</p>';
      const tractorRow = (m, p) => {
        const yr = p ? (p.cond === 'used' ? m.to : Math.max(m.from, Math.min(y, m.to))) : m.from;
        const repairs = p && m.kind !== 'steam' ? money(p.price * .03 * Sim.repairF(m, yr) * shedF()) : p ? money(p.price * .03 * shedF()) : '—';
        return `<tr class="${p ? '' : 'locked'}"><td><img class="thumb" src="${thumb(m.id, yr)}" alt=""></td><td><b>${m.name}</b><small class="sub">${m.brand} · built ${m.from}–${m.to}${p && p.cond === 'used' ? ` · this one built ${m.to}` : ''}</small></td>
          <td class="num">${m.hp}</td><td class="num">${Math.round(Sim.fieldAcres(m, yr))}</td><td>${fuelText(m)}</td><td>${repairs}</td><td>${traitChips(m, yr)}</td>
          <td class="btns">${p ? `<button data-dl="buy" data-id="${m.id}" ${dis(p.price > s.cash)}>${p.cond === 'used' ? 'Used' : 'Buy'} ${money(p.price)}</button>` : `<small>Arrives ${m.type === 'baler' ? Math.max(m.from, DATA.crops.alfalfa.from) : m.from}</small>`}</td></tr>`;
      };
      const thead = '<thead><tr><th></th><th>Engine or tractor</th><th>Belt HP</th><th>Field acres</th><th>Fuel/spring</th><th>Repairs/yr</th><th>Advantages</th><th></th></tr></thead>';
      const power = DATA.machines.filter((m) => m.type === 'power').map((m) => ({ m, p: Sim.machinePrice(s, m) }));
      const fresh = power.filter((x) => x.p && x.p.cond === 'new');
      const used = power.filter((x) => x.p && x.p.cond === 'used').sort((a, b) => b.m.to - a.m.to);
      const soon = power.filter((x) => !x.p && x.m.from > y).sort((a, b) => a.m.from - b.m.from).slice(0, 4);
      const otherRow = (m, p) => `<tr class="${p ? '' : 'locked'}"><td><img class="thumb" src="${thumb(m.id, p && p.cond === 'used' ? m.to : Math.max(m.from, Math.min(y, m.to)))}" alt=""></td><td><b>${m.name}</b><small class="sub">${spec(m)}</small></td>
        <td class="btns">${p ? `<button data-dl="buy" data-id="${m.id}" ${dis(p.price > s.cash)}>${p.cond === 'used' ? 'Used' : 'Buy'} ${money(p.price)}</button>` : `<small>Arrives ${m.type === 'baler' ? Math.max(m.from, DATA.crops.alfalfa.from) : m.from}</small>`}</td></tr>`;
      const other = [['thresher', 'Threshing Separators'], ['huller', 'Clover Hullers'], ['binder', 'Grain Binders'], ['baler', 'Hay Balers'], ['sawmill', 'Sawmills'], ['woodtool', 'Wood-Cutting Tools'], ['engine', 'Stationary Engines']].map(([type, name]) => {
        // balers are listed from two years before alfalfa arrives, so the dealer's catalog does not fill up early games
        const list = DATA.machines.filter((m) => m.type === type && (type !== 'baler' || y >= DATA.crops.alfalfa.from - 2)).map((m) => ({ m, p: Sim.machinePrice(s, m) })).filter((x) => x.p || x.m.from > y || (type === 'baler' && y < DATA.crops.alfalfa.from));
        return list.length ? `<h4>${name}</h4><table class="tbl dealer other"><tbody>${list.map((x) => otherRow(x.m, x.p)).join('')}</tbody></table>` : '';
      }).join('');
      const legend = Object.entries(Sim.TRAITS).map(([k, t]) => `<tr><td><span class="trait t-${k}">${t.name}</span></td><td>${t.note}</td></tr>`).join('');
      return `${top}<h4>Your machine shed</h4>${shed}
        <h4>Engines &amp; tractors at the dealer (${y})</h4>${fresh.length ? `<table class="tbl dealer">${thead}<tbody>${fresh.map((x) => tractorRow(x.m, x.p)).join('')}</tbody></table>` : '<p class="hint">Nothing new this year.</p>'}
        ${used.length ? `<details class="usedlist" ${usedOpen ? 'open' : ''}><summary>Used engines &amp; tractors (${used.length})</summary><table class="tbl dealer">${thead}<tbody>${used.map((x) => tractorRow(x.m, x.p)).join('')}</tbody></table></details>` : ''}
        ${soon.length ? `<h4>Coming soon</h4><table class="tbl dealer">${thead}<tbody>${soon.map((x) => tractorRow(x.m, null)).join('')}</tbody></table>` : ''}
        <h4>What each kind of tractor is good at</h4><table class="tbl legend">${legend}</table><p class="hint">Hover over an advantage to see what it does. Several tractors of the same kind don't add up: owning one row-crop tractor already cuts the row-crop labor.</p>
        ${other}`;
    };
    await modal({
      title: `Machinery &mdash; ${s.year}`, cls: 'dealer', html: `<div id="dlBody">${body()}</div>`,
      buttons: [{ label: 'Close', value: 'close', primary: true }],
      onRender: (root) => {
        const box = root.querySelector('#dlBody'), scroller = root.querySelector('.modal');
        const head = document.createElement('div');
        head.className = 'dealer-head';
        head.innerHTML = `<div class="dealer-title"><h2>Machinery &mdash; ${s.year}</h2><button class="primary" data-close>Close</button></div><div id="dlTop">${topBar()}</div>`;
        scroller.querySelector(':scope > h2').remove();
        scroller.prepend(head);
        head.querySelector('[data-close]').addEventListener('click', () => root.querySelector('.modal-buttons button').click());
        const hook = () => { const d = box.querySelector('details.usedlist'); if (d) d.addEventListener('toggle', () => { usedOpen = d.open; }); };
        const redraw = () => { const y0 = scroller.scrollTop; box.innerHTML = body(); head.querySelector('#dlTop').innerHTML = topBar(); scroller.scrollTop = y0; hook(); render(); };
        hook();
        setTimeout(() => { scroller.scrollTop = 0; }, 0);
        box.addEventListener('click', (e) => {
          const b = e.target.closest('button[data-dl]');
          if (!b || !editable()) return;
          const a = b.dataset.dl;
          let err = null;
          if (a === 'buy') {
            err = Sim.buyMachine(s, b.dataset.id);
            if (!err) { log(`Bought the ${Sim.machineDef(b.dataset.id).name}.`); sfx('coin'); }
          } else if (a === 'sell') {
            const o = s.machines.find((x) => x.uid === +b.dataset.uid), v = o ? Sim.machineValue(s, o) * .85 : 0;
            err = Sim.sellMachine(s, +b.dataset.uid);
            if (!err) log(`Sold the ${Sim.machineDef(o.id).name} for ${money(v)}.`);
          } else if (a === 'build') {
            const d = Sim.buildingDef(b.dataset.id), c = Sim.buildingCost(s, d);
            err = Sim.build(s, b.dataset.id);
            if (!err) log(`Built: ${d.name}${c.use > .05 ? `, using ${fx(c.use, 1)} MBF of our own lumber (saved ${money(c.credit)})` : ''}.`);
          }
          if (err) toast(err, true);
          redraw();
        });
      },
    });
    render();
  }
  function tabLand() {
    const fam = Sim.family(s).filter((f) => f.present || f.away);
    return `<h4>Land</h4><div class="row">${s.land} acres: ${Sim.cropland(s)} crop · ${Sim.pasture(s)} pasture · ${Sim.woods(s)} woods</div>
      <div class="row">Price: <b>${money(Sim.landPrice(s))}</b>/acre · Neighbors offering: <b>${s.landOffer} ac</b></div>
      <div class="row"><input type="number" id="landQty" min="0" value="10" class="qty"> acres <span class="btns"><button data-act="buyLand">Buy</button><button data-act="sellLand">Sell</button></span></div>
      <h4>The Bank</h4><div class="row">Mortgage: <b>${money(s.debt)}</b> at ${(Sim.rate(s) * 100).toFixed(1)}% · Credit available: ${money(Sim.creditLimit(s))}</div>
      <div class="row"><input type="number" id="bankQty" min="0" value="500" class="qty"> dollars <span class="btns"><button data-act="borrow">Borrow</button><button data-act="repay">Repay</button></span></div>
      <h4>The Family</h4><table class="tbl">${fam.map((f) => `<tr><td>${f.name}</td><td>${f.age}</td><td>${f.away ? 'away' : f.labor ? `${f.labor.toFixed(1)} labor` : 'little one'}</td></tr>`).join('')}</table>
      <div class="meter"><span>Contentment</span><div><i style="width:${s.contentment}%;background:#c4508a"></i></div><b>${Math.round(s.contentment)}</b></div>
      <div class="meter"><span>Reputation</span><div><i style="width:${s.reputation}%;background:#2f5d8a"></i></div><b>${Math.round(s.reputation)}</b></div>`;
  }
  function tabWoods() {
    const w = Sim.woodlotInfo(s), p = s.plan, max = Sim.timberMax(s), lv = Sim.lumberValue(s);
    const pct = max ? Math.min(100, s.timber / max * 100) : 0;
    const tool = w.chain ? 'the chain saw' : w.buzz ? 'the buzz saw' : 'crosscut saw, axe &amp; maul (a buzz saw or chain saw is much faster)';
    const methods = [
      ['own', `Saw them on my own ${w.mill ? w.mill.name : 'sawmill'}`, !!w.mill, w.mill ? `About 10% more lumber than the log scale, plus slab wood for the stove. Uses ${fx(w.logs / w.mill.perDay * 3, 1)} man-days and engine fuel (a steam engine burns cordwood).` : 'Needs a sawmill and enough belt horsepower (Machinery tab).'],
      ['custom', `Hire the custom sawyer (${money(Sim.sawFee(s))}/MBF)`, true, 'He sets up his mill in the yard; you get the lumber and some slab wood.'],
      ['sell', `Sell the logs to the mill in ${Sim.loc(s).town} (${money(Sim.logPrice(s))}/MBF)`, true, 'Cash now, no lumber.'],
    ];
    const head = winterPlanning()
      ? `<p class="winter-note">&#10052; <b>Winter ${s.year}.</b> The crops are in and sold. Plan the woodlot work, then press <b>Begin the ${s.year} Winter Work</b>.</p>`
      : s.phase === 'spring' ? '<p class="hint"><b>The woodlot is planned in the winter round</b>, after the fall market. You can look ahead here.</p>' : '';
    return `${head}<div class="stats3"><div><b>${Sim.woods(s)}</b> ac<small>woods</small></div>
      <div class="${s.store.wood < 6 ? 'bad' : ''}"><b>${fx(s.store.wood, 1)}</b> cords<small>firewood on hand</small></div>
      <div><b>${fx(s.store.lumber, 1)}</b> MBF<small>lumber (${money(s.store.lumber * lv)})</small></div></div>
      <div class="meter"><span>Standing timber</span><div><i style="width:${pct}%;background:#3d6b2a"></i></div><b>${fx(s.timber)}</b></div>
      <p class="hint">${fx(s.timber)} of the ${fx(max)} MBF the woods can hold; regrows about ${fx(Sim.timberGrowth(s), 1)} MBF a year (faster when thinned). A cord of firewood takes about half an MBF.</p>
      <h4>Firewood (cut &amp; split in winter)</h4>
      <div class="row">Cords to cut: ${stepper('cords', 2)}</div>
      <p class="hint">The house burns about 6 cords a winter${p.whey === 'brunost' ? ', and boiling brunost takes more' : ''}${Sim.steamFieldCords(s) ? `; your steam engine burns about ${fx(Sim.steamFieldCords(s))} cords in spring field work, plus more on threshing and sawing days (bought if the pile runs short)` : ''}. With ${tool}: ${w.perCord} man-days per cord.${s.buildings.woodshed ? ' The woodshed keeps it dry.' : ' Without a woodshed, 10% of the pile rots each year.'}</p>
      <h4>Saw logs &amp; lumber</h4>
      <div class="row">Saw logs to cut (MBF): ${stepper('logs', 1)}</div>
      ${methods.map(([v, label, ok, note]) => `<label class="radio ${ok ? '' : 'locked'}"><input type="radio" name="saw" data-plan="sawMethod" value="${v}" ${w.method === v ? 'checked' : ''} ${ok ? '' : 'disabled'}> ${label}<small>${note}</small></label>`).join('')}
      <h4>Winter work</h4>
      <div class="stats3"><div class="${w.needDays > w.haveDays ? 'bad' : ''}"><b>${fx(w.needDays)}</b> / ${fx(w.haveDays)}<small>man-days need / have</small></div>
        <div class="${w.timberNeed > s.timber ? 'bad' : ''}"><b>${fx(w.timberNeed, 1)}</b> MBF<small>timber to cut</small></div>
        <div><b>${money(lv)}</b><small>lumber per MBF</small></div></div>
      <label class="radio"><input type="checkbox" data-plan="woodGame" ${p.woodGame ? 'checked' : ''}> I'll do the winter work myself: the buzz saw, splitting, and the sawmill (mini-games)<small>Otherwise the crew does the work at the normal rate. Good bucking on the buzz saw yields up to 10% more firewood, good splitting up to 15% more, good sawing up to 12% more lumber; poor work less.</small></label>
      <p class="hint">Lumber in the shed is used automatically when you build: each MBF knocks its market value off the building's price (up to 70%). Extra lumber sells at the Market.</p>`;
  }
  function tabMarket() {
    const f = Sim.feedNeeds(s);
    const ms = Sim.marketSeason(s);
    const rows = Object.entries(DATA.goods).map(([g, d]) => {
      const p = Sim.sellPrice(s, g, ms), b = Sim.buyPrice(s, g, ms), f2 = (v) => `$${v.toFixed(v < 1 ? 3 : 2)}`;
      return `<tr><td>${d.name}</td><td>${fx(s.store[g])} ${d.unit}</td><td>${f2(p)}</td><td>${f2(b)}</td><td><input type="number" min="0" value="10" class="qty" id="mq-${g}"></td>
        <td class="btns"><button data-act="trade" data-g="${g}" data-dir="1">Buy</button><button data-act="trade" data-g="${g}" data-dir="-1">Sell</button><button data-act="sellAll" data-g="${g}" ${s.store[g] < .05 ? 'disabled' : ''}>Sell all</button></td></tr>`;
    }).join('');
    const cheese = Object.entries(s.cheese).flatMap(([id, c]) => ['fresh', 'aged'].filter((w) => c[w] > .5).map((w) => `<tr><td>${DATA.cheeses[id].name} <small>(${w})</small></td><td>${fx(c[w])} lb</td><td>$${Sim.cheesePrice(s, id, w === 'aged').toFixed(3)}/lb</td><td class="btns"><button data-act="sellCheese" data-id="${id}" data-w="${w}">Sell all</button></td></tr>`)).join('');
    const river = Sim.loc(s).bonus.buy ? ' Steamboat traffic at the landing keeps buying cheap and selling dear.' : '';
    const label = { spring: 'Spring', summer: 'Summer', fall: 'Fall', winter: 'Winter' }[s.phase] || 'Spring';
    return `<button type="button" class="primary dealer-open" data-act="market">Open the ${label} Market &#9656;</button>
      <p class="hint">${ms === 'fall' ? 'Winter trading runs at the harvest-time prices, about 8% below spring.' : 'Spring prices.'} Buying costs more than selling brings.${river} Winter feed need: ~${fx(f.hay, 1)} t hay and ${fx(f.grainLb)} lb grain.</p>
      <table class="tbl market"><thead><tr><th>Good</th><th>Stock</th><th>Sell</th><th>Buy</th><th>Qty</th><th></th></tr></thead><tbody>${rows}</tbody></table>${cheese ? `<h4>Cheese</h4><table class="tbl market"><thead><tr><th>Cheese</th><th>Stock</th><th>Sell</th><th></th></tr></thead><tbody>${cheese}</tbody></table>
      <p class="hint">Cheese sales beyond the market's demand fetch only 55%.</p>` : ''}`;
  }
  function tabHarvest() {
    const opt = Sim.threshOptions(s), p = s.plan, use = Sim.resolveThresh(s);
    const radio = (v, label, ok, note) => `<label class="radio ${ok ? '' : 'locked'}"><input type="radio" name="thresh" data-plan="thresh" value="${v}" ${use === v ? 'checked' : ''} ${ok ? '' : 'disabled'}> ${label}<small>${note}</small></label>`;
    const hl = Sim.huller(s);
    return `<h4>Threshing the small grain</h4>
      ${radio('own', 'Run your own outfit', opt.own, opt.own ? 'Thresh right away and do custom work for neighbors.' : opt.ownWhy)}
      ${p.thresh === 'own' && use !== 'own' ? `<p class="hint">Your own outfit can't run this year, so the ${use === 'ring' ? 'threshing ring' : 'custom thresherman'} will thresh your grain.</p>` : ''}
      ${radio('ring', 'Join the threshing ring', opt.ring, opt.ring ? 'Neighbors swap work. Wait depends on your reputation.' : s.flags.noRing ? 'No ring this year.' : 'Your reputation is too low.')}
      ${radio('custom', 'Hire the custom thresherman', true, 'Pay by the bushel; he comes when he comes.')}
      ${opt.own ? `<div class="row">Custom jobs for neighbors (up to ${opt.neighbors}): ${stepper('customJobs', 1, opt.neighbors)}</div>` : ''}
      <div class="row">Threshers' dinner: <select data-plan="dinner"><option value="plain" ${p.dinner === 'plain' ? 'selected' : ''}>Plain (cheap, rep -2)</option><option value="hearty" ${p.dinner === 'hearty' ? 'selected' : ''}>Hearty (rep +1)</option><option value="legendary" ${p.dinner === 'legendary' ? 'selected' : ''}>Legendary: lefse, meatballs &amp; seven pies (rep +4)</option></select></div>
      ${Sim.cropAllowed(s, 'clover') ? `<h4>Clover</h4>
      <label class="radio"><input type="checkbox" data-plan="hull" ${p.hull ? 'checked' : ''}> Save the second cutting for seed and hull it<small>Less hay, but clover seed is valuable.</small></label>
      <div class="row">Huller: <select data-plan="hullMethod"><option value="custom">Hire the traveling huller</option><option value="own" ${p.hullMethod === 'own' ? 'selected' : ''} ${hl ? '' : 'disabled'}>Use my own ${hl ? hl.name : '(none owned)'}</option></select></div>`
        : hayPlan()}
      <h4>Threshing Day</h4>
      <label class="radio"><input type="checkbox" data-plan="minigame" ${p.minigame ? 'checked' : ''}> I'll pitch bundles into the feeder myself (mini-game)<small>Otherwise the crew manages about 78% efficiency.</small></label>`;
  }

  // From 1947 the alfalfa is put up loose, or baled once the farm owns a baler it can run.
  function hayPlan() {
    const br = Sim.balerRig(s), have = s.machines.find((o) => Sim.machineDef(o.id).type === 'baler');
    if (!br) {
      const why = !have ? 'Buy a hay baler at the dealer to bale it instead.' : !s.machines.some((o) => Sim.machineDef(o.id).type === 'power' && Sim.machineDef(o.id).kind !== 'steam') ? `Your ${Sim.machineDef(have.id).name} needs a tractor to pull it.` : `Your ${Sim.machineDef(have.id).name} needs a tractor with ${Sim.machineDef(have.id).minHP} PTO horsepower.`;
      return `<h4>Hay</h4><p class="hint">Since ${DATA.crops.alfalfa.from} the hay fields are alfalfa. It is put up loose: mowed, side-raked, and lifted onto the rack with the hay loader. About 12% of the hay is lost and it takes extra hands. ${why}</p>`;
    }
    const n = Sim.baleNeighbors(s);
    return `<h4>Hay: baling the alfalfa</h4><p class="hint">Your ${br.baler.name} (${br.baler.tie} tie) behind the ${br.power.name}.</p>
      <div class="row">Custom baling for neighbors (up to ${n}): ${stepper('baleJobs', 1, n)}</div>
      <label class="radio"><input type="checkbox" data-plan="baleGame" ${s.plan.baleGame ? 'checked' : ''}> I'll drive the baler myself (mini-game)<small>Otherwise the crew manages about 80%.</small></label>`;
  }
  function renderTop() {
    const season = { spring: 'Spring', summer: 'Summer', fall: 'Fall', winter: 'Winter' }[s.phase] || '';
    const chips = [
      ['Year', `${s.year} <small>${season}</small>`], ['Cash', money(s.cash), s.cash < 0], ['Mortgage', money(s.debt)], ['Net worth', money(Sim.netWorth(s))],
      ['Land', `${s.land} ac`], ['Cows', s.cows], ['Hired men', s.plan.hired, false, 'fields'], ['Soil', Math.round(s.soil)], ['Family', Math.round(s.contentment), s.contentment < 25], ['Standing', Math.round(s.reputation)],
    ];
    $('#stats').innerHTML = chips.map(([k, v, bad, go]) => `<div class="chip-stat ${bad ? 'bad' : ''} ${go ? 'link' : ''}" ${go ? `data-goto="${go}" title="Hire men on the Fields tab"` : ''}><small>${k}</small><b>${v}</b></div>`).join('') + (s.cheats.used ? '<div class="chip-stat cheat"><small>mode</small><b>cheats</b></div>' : '');
    const L = Sim.loc(s), sign = $('#townSign');
    sign.querySelector('b').textContent = L.town;
    sign.querySelector('small').textContent = `${L.county.replace(' County', ' Co.')}, ${L.state || 'Wis.'}`;
    sign.querySelector('em').textContent = `Pop. ${Sim.townPop(s).toLocaleString()}`;
    sign.classList.toggle('wood', s.year < 1925);
    sign.title = `Your homestead near ${L.town}, on the ${L.river}`;
    sign.setAttribute('aria-label', sign.title);
  }
  function renderLog() { if (s) $('#log').innerHTML = s.log.slice(0, logSize === 'big' ? 80 : 40).map((l) => `<div>${l}</div>`).join(''); }
  let logSize = (() => { try { return localStorage.getItem('strumLogSize') || 'normal'; } catch (e) { return 'normal'; } })();
  function setLogSize(v) {
    logSize = v;
    $('#logWrap').className = v === 'normal' ? '' : v;
    $('#logMin').innerHTML = v === 'min' ? '+' : '&#8211;';
    $('#logMin').title = v === 'min' ? 'Restore the history' : 'Minimize the history';
    $('#logBig').innerHTML = v === 'big' ? '&#10529;' : '&#10530;';
    $('#logBig').title = v === 'big' ? 'Shrink the history' : 'Enlarge the history';
    try { localStorage.setItem('strumLogSize', v); } catch (e) { /* storage blocked */ }
    renderLog();
    $('#log').scrollTop = 0;
  }
  function render() {
    if (!s) return;
    renderTop();
    const tabs = [['fields', 'Fields'], ['herd', 'Herd & Dairy'], ['woods', 'Woodlot'], ['machines', 'Machinery'], ['buildings', 'Buildings'], ['land', 'Land & Bank'], ['market', 'Market'], ['harvest', 'Harvest Plan']];
    $('#tabs').innerHTML = tabs.map(([id, n]) => `<button class="${tab === id ? 'on' : ''}" data-act="tab" data-tab="${id}">${n}</button>`).join('');
    const body = { fields: tabFields, herd: tabHerd, woods: tabWoods, machines: tabMachines, buildings: tabBuildings, land: tabLand, market: tabMarket, harvest: tabHarvest }[tab]();
    const scroll = $('#tabBody').scrollTop;
    $('#tabBody').innerHTML = body;
    $('#tabBody').scrollTop = scroll;
    const used = $('#tabBody details.usedlist');
    if (used) { used.open = usedOpen; used.addEventListener('toggle', () => { usedOpen = used.open; }); }
    const woodPlan = winterPlanning(), planning = canPlan();
    $('#panel').classList.toggle('frozen', !planning || (woodPlan ? !winterTab(tab) : tab === 'woods'));
    $('#goBtn').disabled = !planning;
    $('#goBtn').textContent = s.over ? 'The chronicle has ended' : !planning ? 'The season is under way…' : woodPlan ? `Begin the ${s.year} Winter Work ▶` : `Plant & Begin the ${s.year} Season ▶`;
    renderLog();
  }

  // ---------- actions ----------
  // Two planning rounds a year: spring (crops, herd, machines...) and winter (the woodlot, with the market open)
  const winterPlanning = () => !!(s && s.phase === 'winter' && s.season && s.season.woodPlan);
  const canPlan = () => !!(s && !busy && !s.over && (s.phase === 'spring' || winterPlanning()));
  // In winter only the woodlot plan and the market are open; the rest waits for spring.
  const winterTab = (t) => t === 'woods' || t === 'market';
  const planEditable = () => canPlan() && (winterPlanning() ? winterTab(tab) : tab !== 'woods');
  function act(el) {
    const a = el.dataset.act;
    if (a === 'tab') {
      tab = el.dataset.tab; render();
      return;
    }
    if (a === 'dealer') { if (s && !busy) machineryWindow(); return; }
    if (a === 'market') { if (s && !busy && planEditable()) marketWindow(); return; }
    if (!planEditable()) return;
    let err = null;
    if (a === 'step') {
      const path = el.dataset.path;
      let v = (+getPath(s.plan, path) || 0) + +el.dataset.step;
      v = Math.max(0, el.dataset.max ? Math.min(+el.dataset.max, v) : v);
      if (path.startsWith('milk.')) v = Math.min(100, v);
      setPath(s.plan, path, v);
    } else if (a === 'animal') err = Sim.buyAnimal(s, el.dataset.kind, +el.dataset.n);
    else if (a === 'buyMachine') { err = Sim.buyMachine(s, el.dataset.id); if (!err) log(`Bought the ${Sim.machineDef(el.dataset.id).name}.`); }
    else if (a === 'sellMachine') err = Sim.sellMachine(s, +el.dataset.uid);
    else if (a === 'build') {
      const c = Sim.buildingCost(s, Sim.buildingDef(el.dataset.id));
      err = Sim.build(s, el.dataset.id);
      if (!err) log(`Built: ${Sim.buildingDef(el.dataset.id).name}${c.use > .05 ? `, using ${fx(c.use, 1)} MBF of our own lumber (saved ${money(c.credit)})` : ''}.`);
    }
    else if (a === 'buyLand') err = Sim.buyLand(s, Math.floor(+$('#landQty').value || 0));
    else if (a === 'sellLand') err = Sim.sellLand(s, Math.floor(+$('#landQty').value || 0));
    else if (a === 'borrow') err = Sim.borrow(s, Math.max(0, +$('#bankQty').value || 0));
    else if (a === 'repay') err = Sim.repay(s, Math.max(0, +$('#bankQty').value || 0));
    else if (a === 'trade') err = Sim.trade(s, el.dataset.g, (+$('#mq-' + el.dataset.g).value || 0) * +el.dataset.dir);
    else if (a === 'sellAll') {
      const g = el.dataset.g, q = s.store[g], before = s.cash;
      err = Sim.trade(s, g, -q);
      if (!err) log(`Sold all ${fx(q, q < 10 ? 1 : 0)} ${DATA.goods[g].unit} of ${DATA.goods[g].name.toLowerCase()} for ${money(s.cash - before)}.`);
    }
    else if (a === 'sellCheese') {
      const id = el.dataset.id, c = s.cheese[id], ws = el.dataset.w ? [el.dataset.w] : ['fresh', 'aged'];
      const amt = ws.reduce((t, w) => t + Sim.sellCheese(s, id, w, c[w]), 0);
      log(`Sold ${DATA.cheeses[id].name} for ${money(amt)}.`);
    }
    if (err) toast(err, true);
    render();
  }
  function bindInput(el) {
    if (!planEditable()) return;
    let v;
    if (el.type === 'checkbox') v = el.checked;
    else if (el.type === 'number') { v = Math.max(0, Math.floor(+el.value || 0)); if (el.max) v = Math.min(+el.max, v); }
    else v = el.value;
    setPath(s.plan, el.dataset.plan, v);
    render();
  }

  // ---------- cheat console ----------
  const CHEATS = {
    UFFDA: ['+$1,000 cash', () => { s.cash += 1000; }],
    LUTEFISK: ['+$10,000 cash', () => { s.cash += 10000; }],
    LEFSE: ['+$100,000 cash', () => { s.cash += 100000; }],
    MORTGAGE: ['Pay off all debt for free', () => { s.debt = 0; }],
    NEXTYEAR: ['Auto-play the rest of this year (no prompts)', () => runAuto(1)],
    AUTOPLAY: ['AUTOPLAY n — auto-play n years', (n) => runAuto(Math.max(1, Math.min(60, n || 5)))],
    TIMEWARP: [`TIMEWARP yyyy — jump straight to a year (1900–${DATA.lastYear})`, (y) => timewarp(y)],
    HERD: ['HERD n — add n cows (barn expands)', (n) => { n = n || 10; s.cows += n; while (s.cows > Sim.barnCap(s)) s.buildings.barn_addition = (s.buildings.barn_addition || 0) + 1; }],
    LAND: ['LAND n — add n free acres', (n) => { s.land += n || 80; }],
    GRANARY: ['Fill granary, haymow, and woodshed', () => { Object.assign(s.store, { wheat: s.store.wheat + 2000, oats: s.store.oats + 2000, corn: s.store.corn + 2000, cloverSeed: s.store.cloverSeed + 50, hay: s.store.hay + 200, wood: s.store.wood + 50 }); }],
    CHEESE: ['+2,000 lb of every cheese', () => { for (const id of Object.keys(s.cheese)) s.cheese[id].fresh += 2000; }],
    LUMBER: ['+20 MBF lumber, +20 cords firewood, and the woods grown back to full', () => { s.store.lumber += 20; s.store.wood += 20; s.timber = Sim.timberMax(s); }],
    MACHINESHED: ['Get one of every machine available this year', () => { for (const m of DATA.machines) { const p = Sim.machinePrice(s, m); if (p && !s.machines.some((o) => o.id === m.id)) s.machines.push({ uid: Sim.nextUid(s), id: m.id, bought: s.year, built: p.cond === 'used' ? Math.min(s.year, m.to) : s.year, used: p.cond === 'used' }); } }],
    BUILDALL: ['Build every building/improvement', () => { for (const b of DATA.buildings) s.buildings[b.id] = b.repeat ? Math.max(1, s.buildings[b.id] || 0) : true; s.flags.contour = true; }],
    UNLOCK: ['Toggle: all machines, crops, cheeses, buildings available regardless of year', () => { s.cheats.unlock = !s.cheats.unlock; return `Unlock is ${s.cheats.unlock ? 'ON' : 'OFF'}.`; }],
    HAPPY: ['Contentment and reputation to 100', () => { s.contentment = 100; s.reputation = 100; }],
    SKILL: ['Ingrid becomes a master cheesemaker', () => { s.skill = 1.25; }],
    SOIL: ['Soil fertility to 100', () => { s.soil = 100; }],
    PERFECT: ['Toggle: every threshing/hulling run is 100%, and the winter wood games are perfect', () => { s.cheats.perfect = !s.cheats.perfect; return `Perfect threshing ${s.cheats.perfect ? 'ON' : 'OFF'}.`; }],
    GODMODE: ['Toggle: no foreclosure, family never leaves', () => { s.cheats.godMode = !s.cheats.godMode; return `God mode ${s.cheats.godMode ? 'ON' : 'OFF'}.`; }],
    DROUGHT: ['Force a drought this summer (-45%)', () => { s.cheats.weather = .55; }],
    BUMPER: ['Force a bumper crop this summer (+30%)', () => { s.cheats.weather = 1.3; }],
    EVENT: ['EVENT yyyy — replay the newspaper event(s) of that year', async (y) => { const evs = DATA.events.filter((e) => e.year === y); if (!evs.length) return `No historic event in ${y}.`; closeCheat(); for (const e of evs) await newspaper(e); return 'Done.'; }],
    RANDOM: ['RANDOM name — force a random event this summer (HAIL, FROST, WET, FLOOD, LIGHTNING, MICE, BLOAT, SYTTENDE, RIBBON, LIMBURGER, BRIDGE, BUMPER, LUTEFISK, BULL)', (n, raw) => { const key = (raw || '').toUpperCase(); const e = DATA.randomEvents.find((x) => x.head.toUpperCase().replace(/[^A-Z ]/g, '').split(' ').some((w) => w && key.startsWith(w.slice(0, 4)))); if (!e) return 'Unknown event.'; s.cheats.forceEvent = e.head; return `Forced: ${e.head}`; }],
    STATE: ['Download the current save as JSON', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' })); a.download = `nels_${s.year}.json`; a.click(); }],
    TEST: ['Run automated tests: simulate many full games headlessly', () => selfTest()],
    RESET: ['Delete the save and return to the title screen', () => { localStorage.removeItem(SAVE_KEY); closeCheat(); title(); }],
    HELP: ['List the codes', () => Object.entries(CHEATS).map(([k, v]) => `${k.padEnd(12)} ${v[0]}`).join('\n')],
  };
  function openCheat() {
    if (!s) { toast('Start a game first.', true); return; }
    $('#cheat').classList.remove('hidden');
    $('#cheatQuick').innerHTML = ['UFFDA', 'LUTEFISK', 'NEXTYEAR', 'AUTOPLAY 5', 'GRANARY', 'LUMBER', 'MACHINESHED', 'BUILDALL', 'UNLOCK', 'PERFECT', 'GODMODE', 'TEST', 'HELP'].map((c) => `<button data-cheat="${c}">${c}</button>`).join('');
    $('#cheatIn').focus();
  }
  function closeCheat() { $('#cheat').classList.add('hidden'); }
  function cheatOut(t) { const o = $('#cheatOut'); o.textContent = `${t}\n${o.textContent}`.slice(0, 6000); }
  async function runCheat(line) {
    const parts = line.trim().split(/\s+/), code = (parts[0] || '').toUpperCase().replace(/[^A-Z]/g, '');
    const c = CHEATS[code];
    if (!c) { cheatOut(`? Unknown code "${line}". Type HELP.`); return; }
    if (busy && !['HELP', 'TEST', 'STATE', 'UFFDA', 'LUTEFISK', 'LEFSE', 'HAPPY', 'PERFECT', 'GODMODE', 'UNLOCK'].includes(code)) { cheatOut('Finish the current season step first (or use codes that work any time).'); return; }
    s.cheats.used = true;
    const res = await c[1](parseInt(parts[1], 10), parts.slice(1).join(' '));
    cheatOut(`> ${line}\n${res || 'OK — ' + c[0]}`);
    Sim.clampStats(s); save(); render();
  }
  async function runAuto(n) {
    closeCheat();
    busy = true; render();
    const start = s.year;
    try {
      for (let i = 0; i < n && !s.over; i++) {
        if (winterPlanning()) { s.season.woodPlan = false; Sim.winter(s); Sim.nextYear(s); }
        else Sim.autoYear(s, i === 0 && s.phase === 'spring');
        s.phase = 'winter'; render(); await sleep(60);
      }
    } finally { busy = false; }
    log(`Cheat: auto-played ${start}–${s.over ? s.year : s.year - 1}.`);
    save();
    if (s.over) return endGame();
    await startYear();
    return `Now in ${s.year}.`;
  }
  async function timewarp(y) {
    if (!(y >= 1900 && y <= DATA.lastYear)) return `Year must be 1900–${DATA.lastYear}.`;
    closeCheat();
    s.year = y;
    if (y >= 1903) s.flags.coop = true;
    s.history.push(Sim.snapshot(s));
    await startYear();
    return `Welcome to ${y}.`;
  }
  function selfTest() {
    const t0 = performance.now(), problems = [], results = [];
    const bad = (o, path = '') => {
      for (const [k, v] of Object.entries(o)) {
        if (typeof v === 'number' && !Number.isFinite(v)) problems.push(`${path}${k}=${v}`);
        else if (v && typeof v === 'object') bad(v, `${path}${k}.`);
      }
    };
    const run = (st, label, started = false, each = null) => {
      let guard = 0;
      try {
        while (!st.over && guard++ < 70) { if (each) each(st); Sim.autoYear(st, started && guard === 1); bad(st); }
        results.push(`${label}: ${st.startYear}->${st.year} ${st.over.reason} worth ${money(Sim.netWorth(st))} land ${st.land} cows ${st.cows}`);
      } catch (e) { problems.push(`${label} @${st.year}: ${e.message}`); }
    };
    if (s) {
      const clone = JSON.parse(JSON.stringify(s)); clone.cheats = { unlock: false, perfect: false, used: true };
      run(clone, 'current game', clone.phase === 'spring');
      const reloaded = Sim.sanitize(JSON.parse(JSON.stringify(s)), true);
      if (!reloaded || reloaded.year !== s.year || Math.round(reloaded.cash) !== Math.round(s.cash) || reloaded.machines.length !== s.machines.length || Math.round(reloaded.timber) !== Math.round(s.timber) || reloaded.plan.sawMethod !== s.plan.sawMethod) problems.push('save/load round-trip changed the game state');
    }
    const L = DATA.locations.length;
    for (let i = 0; i < 14; i++) {
      const g = Sim.newGame({ startYear: 1900 + (i * 7) % 41, seed: 1000 + i, locId: DATA.locations[i % L].id });
      if (i % 3 === 1) { g.plan.milk = { cream: 30, factory: 30, home: 40 }; g.buildings.cheese_house = true; g.plan.whey = 'brunost'; g.plan.skim = 'gamalost'; g.plan.cheese = 'limburger'; }
      if (i % 3 === 2) { g.plan.thresh = 'custom'; g.plan.hull = false; g.plan.hired = 1; }
      if (i % 4 === 1) { g.plan.logs = 4; g.plan.sawMethod = 'own'; g.cash += 2000; for (const id of ['sawmill_small', 'buzz_saw', 'hitmiss_engine']) Sim.buyMachine(g, id); }
      if (i % 4 === 3) { g.plan.logs = 6; g.plan.sawMethod = 'sell'; g.plan.cords = 20; }
      if (i % 5 === 2) g.buildings.silo = true;
      // some farms buy an engine baler as soon as the dealers have them
      const baler = i % 3 === 0 ? (st) => { if (st.year >= 1947 && !Sim.balerRig(st) && st.machines.some((o) => Sim.machineDef(o.id).type === 'power')) { st.cash += 3000; Sim.buyMachine(st, st.year >= 1949 ? 'nh_77' : 'jd_116w'); } } : null;
      run(g, `game ${i + 1} (${g.locId})`, false, baler);
    }
    // A save from before 2.0 keeps its barley, timothy, and silage-corn acres, and its stored barley as oats.
    const old = JSON.parse(JSON.stringify(Sim.newGame({ startYear: 1910, seed: 5 })));
    Object.assign(old.plan.crops, { oats: 20, clover: 10, corn: 12, barley: 9, hay: 7, silage: 4 }); Object.assign(old.store, { oats: 100, barley: 30 });
    const up = Sim.sanitize(old);
    if (!up || up.plan.crops.oats !== 29 || up.plan.crops.clover !== 17 || up.plan.crops.corn !== 16 || up.store.oats !== 145 || up.store.barley !== 0) problems.push('a pre-2.0 save lost its barley, timothy, or silage corn');
    // Red clover and alfalfa are never offered together, and the clover acres become alfalfa in 1947 (and back if a save goes earlier).
    const hay = Sim.newGame({ startYear: 1940, seed: 4 });
    hay.cheats.unlock = true;
    for (const y of [1915, 1946, 1947, 1960]) { hay.year = y; if (Sim.cropAllowed(hay, 'clover') === Sim.cropAllowed(hay, 'alfalfa') || Sim.cropAllowed(hay, 'clover') !== y < 1947) problems.push(`clover and alfalfa overlap in ${y}`); }
    hay.cheats.unlock = false; hay.year = 1947; hay.plan.crops.clover = 20; hay.plan.crops.alfalfa = 0; Sim.yearStart(hay);
    if (hay.plan.crops.alfalfa !== 20 || hay.plan.crops.clover !== 0 || !DATA.events.some((e) => e.year === 1947 && /ALFALFA/.test(e.head))) problems.push('the 1947 switch to alfalfa did not happen');
    const back = JSON.parse(JSON.stringify(hay)); back.year = 1930;
    const early = Sim.sanitize(back);
    if (early.plan.crops.clover !== 20 || early.plan.crops.alfalfa !== 0) problems.push('alfalfa acres in a save before 1947 were not moved to clover');
    // A silo is filled from the corn field, 3 t a cow, before the rest of the corn is picked for grain.
    const silo = Sim.newGame({ startYear: 1925, seed: 9 }), plain = Sim.newGame({ startYear: 1925, seed: 9 });
    silo.buildings.silo = true;
    for (const g of [silo, plain]) { Sim.yearStart(g); Sim.commitPlan(g); Sim.harvest(g); }
    if (!(silo.season.siloAcres > 0) || Math.abs(silo.store.silage - silo.cows * 3) > .01 || !(silo.store.corn < plain.store.corn) || plain.store.silage !== 0) problems.push('the silo did not fill from the corn field');
    // From 1947 the alfalfa is put up loose (about 12% lost) until the farm owns a baler; a baler loses less and costs tie and fuel.
    const hayFarm = (balerId) => {
      const g = Sim.newGame({ startYear: 1940, seed: 21 }); g.year = 1952; g.cash += 20000; Sim.yearStart(g);
      if (balerId && Sim.buyMachine(g, balerId)) problems.push(`could not buy the ${balerId}`);
      Sim.commitPlan(g); Sim.harvest(g);
      const hay0 = g.store.hay, cash0 = g.cash, tons = g.season.gross.alfalfa || 0, r = Sim.haying(g, .9);
      return { tons, lost: (hay0 - g.store.hay) / Math.max(1, tons), spent: cash0 - g.cash, baled: r.baled, again: Sim.haying(g, .9).lines.length };
    };
    const loose = hayFarm(null), twine = hayFarm('nh_77'), wire = hayFarm('jd_116w');
    if (!(loose.tons > 0) || loose.baled || !(loose.lost > .08 && loose.lost < .16) || loose.spent > .01) problems.push('loose hay did not lose about 12%');
    if (!twine.baled || !wire.baled || !(twine.lost < .07) || !(twine.spent > 0 && wire.spent > 0) || twine.again || !(Sim.TIES.wire.perBale > Sim.TIES.twine.perBale)) problems.push('baling did not save hay at the cost of tie and fuel');
    const dealer = Sim.newGame({ startYear: 1940, seed: 22 }); dealer.year = 1946;
    const before = Sim.machinePrice(dealer, Sim.machineDef('mcc_50t')); dealer.year = 1947;
    if (before || !Sim.machinePrice(dealer, Sim.machineDef('mcc_50t'))) problems.push('balers were sold before alfalfa arrived in 1947');
    const kept = JSON.parse(JSON.stringify(dealer)); kept.plan.baleJobs = 3; kept.plan.baleGame = false;
    const back2 = Sim.sanitize(kept);
    if (back2.plan.baleJobs !== 3 || back2.plan.baleGame !== false) problems.push('the baling plan did not survive a save');
    return `${problems.length ? 'PROBLEMS:\n' + problems.slice(0, 20).join('\n') : 'PASS: no errors or NaN values.'}\n${results.join('\n')}\n(${Math.round(performance.now() - t0)} ms)`;
  }

  // ---------- boot ----------
  function init() {
    document.title = `The Driftless Farm - Version ${DATA.version}`;
    $('.brand').title = `Version ${DATA.version}`;
    const cv = $('#scene'), ctx = cv.getContext('2d');
    const loop = (now) => {
      const t = now / 1000;
      const season = s ? undefined : ['spring', 'summer', 'fall', 'winter'][Math.floor(t / 6) % 4];
      if (!document.hidden && !document.querySelector('.modal.game')) {
        try { Art.scene(ctx, s, t, { season, locId: previewLoc, year: previewYear, view: s ? { machines: 'shed', buildings: 'yard', herd: 'dairy', market: 'market', woods: 'woodlot', land: 'bank', harvest: 'harvest' }[tab] || null : null }); } catch (e) { console.error(e); }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (el && el.closest('#panel')) act(el);
      const ch = e.target.closest('[data-cheat]');
      if (ch) runCheat(ch.dataset.cheat);
    });
    document.addEventListener('change', (e) => { const el = e.target.closest('[data-plan]'); if (el && el.closest('#panel')) bindInput(el); });
    $('#goBtn').addEventListener('click', () => (winterPlanning() ? beginWinter() : beginSeason()));
    $('#helpBtn').addEventListener('click', help);
    $('#saveBtn').addEventListener('click', saveDialog);
    $('#loadBtn').addEventListener('click', loadFromMenu);
    $('#newBtn').addEventListener('click', async () => {
      if (busy) return;
      const v = await modal({ title: 'Start over?', html: '<p>Abandon this chronicle and return to the title screen?</p>', buttons: [{ label: 'Yes, start over', value: 1, primary: true }, { label: 'Keep farming', value: 0 }] });
      if (v === 1) { localStorage.removeItem(SAVE_KEY); title(); }
    });
    $('#muteBtn').addEventListener('click', () => {
      muted = !muted; soundWarning = false;
      if (muted) for (const pool of soundPools.values()) for (const voice of pool.voices) voice.pause();
      $('#muteBtn').textContent = muted ? 'Sound: off' : 'Sound: on';
    });
  $('#logMin').addEventListener('click', () => setLogSize(logSize === 'min' ? 'normal' : 'min'));
  $('#stats').addEventListener('click', (e) => { const c = e.target.closest('[data-goto]'); if (c && s) { tab = c.dataset.goto; render(); } });
  $('#logBig').addEventListener('click', () => setLogSize(logSize === 'big' ? 'normal' : 'big'));
  setLogSize(logSize);
    $('#cheatClose').addEventListener('click', closeCheat);
    $('#cheatIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') { runCheat(e.target.value); e.target.value = ''; } if (e.key === 'Escape') closeCheat(); });
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (s && !document.querySelector('.modal-wrap')) saveDialog(); return; }
      if (e.key === '`' || e.key === 'F2') {
        e.preventDefault();
        $('#cheat').classList.contains('hidden') ? openCheat() : closeCheat();
      }
    });
    title();
  }
  function help() {
    modal({
      title: `The Farmer's Almanac - Version ${DATA.version}`, cls: 'wide',
      html: `<p><b>Goal:</b> build the most valuable farm by the end of the chronicle (${DATA.gameYears} seasons, or through ${DATA.lastYear} if that comes first) without losing the farm to the bank or losing Ingrid's patience.</p>
      <ul class="report">
        <li><b>Fields:</b> split your cropland among wheat, oats, corn, red clover (until 1946) or alfalfa (from 1947), and tobacco (needs a shed). Red clover and alfalfa make the hay; they are never grown together. In 1947, when alfalfa overtook red clover in Wisconsin, your clover acres become alfalfa: more hay, but no clover seed. With a silo, enough corn for the herd is cut green each fall and stored as silage: cows give 8% more milk and need less hay. Watch power capacity (horses ~20 ac each; tractors more) and labor. Hire men in the <b>Help</b> section beside the labor summary; the annual wage per man is shown there. The <b>Hired men</b> header chip also takes you to Fields.</li>
        <li><b>Threshing:</b> wheat and oats must be cut by a binder and threshed. Join the ring, hire the thresherman, or buy a Case or McCormick-Deering separator plus a steam engine or tractor with enough belt horsepower &mdash; then thresh for your neighbors for extra income. On threshing day you can pitch the bundles into the feeder yourself. Waiting in the shock loses grain, especially in a wet fall.</li>
        <li><b>Hay baling (from 1947):</b> the alfalfa is put up loose, losing about 12% of the hay and taking extra hands, until you buy a hay baler. Balers tie with wire or twine depending on the model; engine-driven ones need only a tractor to pull them, PTO balers need the horsepower. On Baling Day you steer the baler along a wandering windrow ahead of the storm, steering around woodchuck holes and easing off in heavy clumps, while the hired man stacks the wagon. You can also bale for neighbors.</li>
        <li><b>Clover hulling (until 1946):</b> save the second cutting for seed and hull it. Clover seed sells high and clover rebuilds the soil. Once alfalfa replaces red clover in 1947, the dealers stop selling hullers and there is no hulling day.</li>
        <li><b>Dairy:</b> send cream to the creamery, whole milk to the cheese factory, or build an Ostehus and make Cheddar, Colby, Brick, Swiss, Limburger, Nøkkelost, or Jarlsberg (1956+). Skim milk can become Gamalost or Pultost; whey boils down into Brunost if you have firewood from the woods.</li>
        <li><b>Winter:</b> livestock eat hay and grain. Keep enough at the fall market, or buy it back on the Market tab during the winter round (at fall prices) or in spring. Short feed means lost cows and less milk.</li>
        <li><b>Two rounds a year:</b> the <b>summer round</b> (spring planning through the fall market) is for the crops, herd, and machinery; the <b>winter round</b> is for the woodlot. After the fall market the Woodlot tab opens for planning and the Market stays open for trading (the other tabs are view-only); press <b>Begin the Winter Work</b> when ready. Ingrid's letter closes the year.</li>
        <li><b>Woodlot:</b> every winter the men cut firewood (the house burns about 6 cords) and saw logs from your oak and maple woods. Saw the logs on your own portable sawmill (needs belt horsepower), hire the custom sawyer, or sell them to the town mill. You can buck the poles on your buzz saw (swing the table when the pole reaches the 16-inch mark), split the firewood yourself (time the maul on the swing meter), and be the sawyer on your own mill (hold <kbd>Space</kbd> to feed the carriage without bogging the saw); good work yields more wood and lumber than the crew's, poor work less. Lumber in the shed pays for much of a new silo, barn addition, granary, machine shed, tobacco shed, cheese house, or woodshed. A buzz saw (on a hit-and-miss engine or tractor belt) and, from 1950, a one-man chain saw make the work far faster. Don't cut faster than the woods grow back. Steam engines are wood-fired: they burn cordwood from your pile in spring field work and on threshing and sawing days, and any shortfall is bought.</li>
        <li><b>Homesteads:</b> each town has its own scenery and a starting benefit. Strum: an extra $1,000. Westby: a tobacco shed already built. Coon Valley: richer soil (85). Blair: 2 extra cows and 25 t of hay. Mondovi: 20 extra acres (180 instead of 160). Chippewa Falls: extra firewood, lumber, and fully stocked woods. Trempealeau: steamboat and rail trade &mdash; sell 4% higher, buy feed, seed, and goods 3% cheaper, 35% more cheese demand, and bigger price swings to trade on. Winona, Minnesota: the flour mill pays 15% more for wheat and the brewery 15% more for corn.</li>
        <li><b>History:</b> the Titanic, World War I, the Spanish Flu, Prohibition, the Depression and milk strikes, the Dust Bowl droughts, rural electrification, World War II, Korea, and the 1960s (Kennedy, bulk milk tanks, the Packers, the moon landing, and Earth Day) all change prices, labor, and choices.</li>
        <li><b>Machinery dealer:</b> open it from the Machinery tab. Buildings and improvements are on their own <b>Buildings</b> tab, each with a picture, and the picture above that tab shows the whole home place. Identical machines share one row with a quantity. Every kind of power has its own advantage: ${Object.values(Sim.TRAITS).map((t) => `<i>${t.name}</i> (${t.note})`).join('; ')}.</li>
        <li><b>Machines by era:</b> Case steam engines (1900–1924) and the Hart-Parr "Old Reliable" (1907); International Mogul and Titan (1914–15); Waterloo Boy and Fordson (1918); McCormick-Deering 15-30 and 10-20, Case 12-20, and the John Deere D (1921–23); the Farmall (1924), John Deere GP, Case L, Farmall F-20 (gray until 1937, then red), and Allis-Chalmers WC; John Deere A, B and G and the Oliver 70; Farmall H and M, Ford 9N, 2N and 8N, and Case DC; Allis-Chalmers WD, Oliver 77 and the John Deere R diesel; Farmall Super M, John Deere 50/60/70 and the Ford "Golden Jubilee"; Farmall 400/450/560, John Deere 520/620/720, Ford 860/801 and Allis-Chalmers D17; and the John Deere 430/530/630/730 (1958). Out-of-production machines turn up used for 25 years.</li>
        <li><b>Saving:</b> press <b>Save</b> (or <kbd>Ctrl</kbd>+<kbd>S</kbd>) during spring planning to keep the farm in one of six save slots, or export it to a file. <b>Load</b> brings back any slot, the autosave, or an exported file. The game also autosaves every year.</li>
        <li><b>Graphics:</b> every view is drawn with one sun lighting each object, textured scenery, and a painterly finish, under painted skies and distant bluffs (with the painted standing oats in an oat harvest). The Fields view shows the fields across the full width; the Buildings tab shows the whole home place (house, bank barn, yard tree, and every owned building, in each season). The Harvest Plan keeps a close view of the home farmyard: the threshing rig waits near the barn in spring and summer, in fall Ingrid sets out the threshers' pies on a cloth-covered table in front of the barn and the rig, and in winter all of it is put away.</li>
      </ul>
      <h4>Cheat &amp; test console</h4><p>Press <kbd>\`</kbd> or <kbd>F2</kbd>. Codes:</p>
      <pre class="codes">${esc(Object.entries(CHEATS).map(([k, v]) => `${k.padEnd(12)} ${v[0]}`).join('\n'))}</pre>`,
      buttons: [{ label: 'Close', primary: true }],
    });
  }

  return { init, get state() { return s; }, selfTest };
})();
window.addEventListener('DOMContentLoaded', UI.init);

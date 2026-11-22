// Asset foundation for the 2.0 code preview. No automatic artwork substitution.
const AssetSystem = (() => {
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const finite = (n, label) => { if (!Number.isFinite(n)) throw new Error(`${label} must be finite.`); return n; };
  const positive = (n, label) => { finite(n, label); if (n <= 0) throw new Error(`${label} must be positive.`); return n; };
  const unit = (n, label) => { finite(n, label); if (n < 0 || n > 1) throw new Error(`${label} must be between 0 and 1.`); return n; };
  const clamp = n => Math.max(0, Math.min(1, n));

  function wearFactor(owned, currentYear, maxAge = 15) {
    positive(maxAge, 'Maximum visual age');
    if (typeof owned === 'number') return clamp(finite(owned, 'Preview age') / maxAge);
    if (!owned || typeof owned !== 'object') throw new Error('An owned machine or numeric preview age is required.');
    finite(currentYear, 'Current year');
    const built = Number.isFinite(owned.built) ? owned.built : owned.bought;
    finite(built, 'Machine built/bought year');
    // Ignore cached age/boughtYear fields: visual wear must survive a save round-trip.
    return clamp((currentYear - built) / maxAge);
  }

  function worldPoint(x, y, w, h, point, flipX = false) {
    finite(x, 'X'); finite(y, 'Y'); positive(w, 'Width'); positive(h, 'Height');
    unit(point.rx, 'Anchor X'); unit(point.ry, 'Anchor Y');
    const result = { x: x + w * (flipX ? 1 - point.rx : point.rx), y: y + h * point.ry };
    if (point.rr !== undefined) result.r = positive(point.rr, 'Radius ratio') * h;
    return result;
  }

  function create(manifest, baseURL) {
    if (!manifest || !manifest.images) throw new Error('An explicit asset manifest is required.');
    const definitions = new Map(), cache = new Map(), blends = new Map();
    const sets = structuredClone(manifest.spriteSets || {});
    const machines = { ...(manifest.machines || {}) }, cars = structuredClone(manifest.cars || {});
    const base = baseURL || document.baseURI;

    function registerAssets(entries) {
      for (const [key, spec] of Object.entries(entries)) {
        if (definitions.has(key)) throw new Error(`Duplicate asset registration: ${key}`);
        if (!spec || typeof spec.src !== 'string' || !spec.src.trim()) throw new Error(`Missing image URL: ${key}`);
      }
      for (const [key, spec] of Object.entries(entries)) definitions.set(key, Object.freeze({ ...spec }));
    }
    registerAssets(manifest.images);

    function definition(key) {
      if (!definitions.has(key)) throw new Error(`Unknown asset: ${key}`);
      return definitions.get(key);
    }
    function status(key) {
      const spec = definition(key), item = cache.get(key);
      return { key, approved: spec.approved === true, state: item ? item.state : 'unloaded', error: item ? item.error : null };
    }
    function load(key) {
      let spec;
      try { spec = definition(key); } catch (e) { return Promise.reject(e); }
      if (cache.has(key)) return cache.get(key).promise;
      const image = new Image(), entry = { image, state: 'loading', error: null, promise: null };
      cache.set(key, entry);
      entry.promise = new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => fail(new Error('Image loading timed out')), 15000);
        const cleanup = () => { clearTimeout(timer); image.onload = null; image.onerror = null; };
        function fail(cause) {
          if (settled) return;
          settled = true; cleanup();
          entry.state = 'failed'; entry.error = new Error(`Cannot load asset "${key}": ${cause.message}`);
          reject(entry.error);
        }
        image.onerror = () => fail(new Error('Image could not be loaded or decoded'));
        image.onload = async () => {
          try {
            // decode() can stay pending while the tab is hidden; onload already guarantees a usable image.
            if (!document.hidden) await Promise.race([image.decode(), new Promise(resolve => setTimeout(resolve, 1000))]);
            if (settled) return;
            if (!image.naturalWidth || !image.naturalHeight) throw new Error('Image is empty');
            if (spec.width !== undefined && spec.width !== image.naturalWidth) throw new Error('Declared width does not match the image');
            if (spec.height !== undefined && spec.height !== image.naturalHeight) throw new Error('Declared height does not match the image');
            settled = true; cleanup(); entry.state = 'ready'; resolve(image);
          } catch (e) { fail(e); }
        };
        try { image.src = new URL(spec.src, base).href; } catch (e) { fail(e); }
      });
      return entry.promise;
    }
    function preloadAll(callback) {
      // Snapshot each requested batch; later registrations are included by the next call.
      return Promise.all([...definitions.keys()].map(load)).then(images => {
        if (callback) callback(images);
        return images;
      });
    }
    function image(key, requireApproval = true) {
      const spec = definition(key), entry = cache.get(key);
      if (requireApproval && spec.approved !== true) throw new Error(`Artwork is not approved: ${key}`);
      if (!entry || entry.state !== 'ready') throw new Error(`Asset is not ready: ${key}${entry && entry.error ? ' - ' + entry.error.message : ''}`);
      return entry.image;
    }
    function resolveMachineBaseKey(id) {
      return own(machines, id) ? machines[id] : null;
    }
    function machineSupport(id, mode = 'idle') {
      const key = resolveMachineBaseKey(id), spec = key && sets[key];
      if (!spec) return { available: false, key: null, reason: `No exact painted asset mapping for ${id}.` };
      if (spec.approved !== true) return { available: false, key, reason: `Painted artwork for ${id} is awaiting approval.` };
      for (const asset of [spec.fresh, spec.aged].filter(Boolean)) {
        if (!definitions.has(asset) || definitions.get(asset).approved !== true) return { available: false, key, reason: `Image ${asset} is missing or not approved.` };
      }
      if (!(spec.modes || ['idle']).includes(mode)) return { available: false, key, reason: `No approved ${mode} animation for ${id}.` };
      return { available: true, key, reason: null };
    }
    function spriteSpec(keyOrId) {
      const key = own(sets, keyOrId) ? keyOrId : resolveMachineBaseKey(keyOrId);
      if (!key || !own(sets, key)) throw new Error(`No exact sprite mapping for ${keyOrId}.`);
      const spec = sets[key];
      if (spec.approved !== true) throw new Error(`Sprite set is not approved: ${key}`);
      return { key, spec };
    }
    function agedImage(key, spec, wear) {
      const fresh = image(spec.fresh);
      if (wear === 0) return fresh;
      if (!spec.aged) throw new Error(`No registered aged variant for ${key}.`);
      const aged = image(spec.aged);
      if (fresh.naturalWidth !== aged.naturalWidth || fresh.naturalHeight !== aged.naturalHeight) throw new Error(`New/aged canvas sizes differ: ${key}`);
      if (wear === 1) return aged;
      let blend = blends.get(key);
      if (!blend) {
        const canvas = document.createElement('canvas');
        canvas.width = fresh.naturalWidth; canvas.height = fresh.naturalHeight;
        blend = { canvas, wear: -1 }; blends.set(key, blend);
      }
      if (blend.wear !== wear) {
        const c = blend.canvas.getContext('2d'); c.clearRect(0, 0, blend.canvas.width, blend.canvas.height);
        c.save();
        try {
          c.globalAlpha = 1 - wear; c.drawImage(fresh, 0, 0);
          c.globalCompositeOperation = 'lighter'; c.globalAlpha = wear; c.drawImage(aged, 0, 0);
        } finally { c.restore(); }
        blend.wear = wear;
      }
      return blend.canvas;
    }
    function drawAgedSprite(ctx, keyOrId, x, y, w, h, wear = 0, flipX = false) {
      finite(x, 'X'); finite(y, 'Y'); positive(w, 'Width'); positive(h, 'Height'); unit(wear, 'Wear');
      const { key, spec } = spriteSpec(keyOrId), picture = agedImage(key, spec, wear);
      const pulley = spec.pulley ? worldPoint(x, y, w, h, spec.pulley, flipX) : null;
      ctx.save();
      try {
        ctx.translate(x + (flipX ? w : 0), y); ctx.scale(flipX ? -1 : 1, 1);
        // Composite the variants once, then apply the caller's opacity once.
        ctx.drawImage(picture, 0, 0, w, h);
      } finally { ctx.restore(); }
      return { pulley };
    }
    function drawRoadCar(ctx, key, x, y, w, h, distance = 0, flipX = false, year) {
      finite(x, 'X'); finite(y, 'Y'); positive(w, 'Width'); positive(h, 'Height'); finite(distance, 'Travel');
      if (!own(cars, key)) throw new Error(`No exact painted car mapping for ${key}.`);
      const spec = cars[key];
      if (spec.approved !== true) throw new Error(`Car artwork is not approved: ${key}`);
      if (year !== undefined) {
        finite(spec.from, 'Car introduction'); finite(spec.through, 'Car final display year');
        if (finite(year, 'Year') < spec.from || year > spec.through) throw new Error(`Car is outside its registered era: ${key}`);
      }
      const wheels = spec.wheels || [];
      if (wheels.length && spec.bodyHasWheels !== false) throw new Error(`Separate wheels require a wheel-free body: ${key}`);
      if (distance !== 0 && !wheels.length) throw new Error(`No independent moving wheels for ${key}.`);
      const body = image(spec.body);
      const parts = wheels.map(wheel => {
        positive(wheel.rr, 'Wheel radius ratio');
        return { wheel, image: image(wheel.asset), point: worldPoint(x, y, w, h, wheel, flipX) };
      });
      ctx.save();
      try {
        ctx.translate(x + (flipX ? w : 0), y); ctx.scale(flipX ? -1 : 1, 1);
        ctx.drawImage(body, 0, 0, w, h);
        for (const part of parts) {
          const wheel = part.wheel, radius = part.point.r;
          ctx.save();
          try {
            ctx.translate(w * wheel.rx, h * wheel.ry); ctx.rotate(distance / radius);
            ctx.drawImage(part.image, -radius, -radius, radius * 2, radius * 2);
          } finally { ctx.restore(); }
        }
      } finally { ctx.restore(); }
      return { wheels: parts.map(p => p.point) };
    }
    function drawBackdrop(ctx, key, x, y, w, h, alpha = 1, opts = {}) {
      finite(x, 'X'); finite(y, 'Y'); positive(w, 'Width'); positive(h, 'Height'); unit(alpha, 'Opacity');
      const spec = definition(key), picture = image(key);
      const scroll = opts.scrollX === undefined ? 0 : finite(opts.scrollX, 'Scroll');
      const clipWidth = opts.clipWidth === undefined ? w : positive(opts.clipWidth, 'Clip width');
      if (scroll !== 0 && spec.tileable !== true) throw new Error(`Backdrop is not approved for horizontal repetition: ${key}`);
      ctx.save();
      try {
        ctx.beginPath(); ctx.rect(x, y, Math.min(w, clipWidth), h); ctx.clip();
        ctx.globalAlpha *= alpha;
        if (scroll === 0) ctx.drawImage(picture, x, y, w, h);
        else {
          const shift = ((scroll % w) + w) % w;
          ctx.drawImage(picture, x - shift, y, w, h);
          ctx.drawImage(picture, x + w - shift, y, w, h);
        }
      } finally { ctx.restore(); }
    }
    function drawParallax(ctx, layers, x, y, w, h, time) {
      finite(time, 'Animation time');
      if (!layers || layers.far === layers.near) throw new Error('Parallax requires separate far and near hill layers.');
      if (!(layers.farSpeed > 0 && layers.nearSpeed > layers.farSpeed)) throw new Error('Near hills must move faster than far hills.');
      // Validate before drawing so a rejected scene cannot leave a partial image.
      for (const key of [layers.sky, layers.far, layers.near]) image(key);
      for (const key of [layers.far, layers.near]) if (definition(key).tileable !== true) throw new Error(`Parallax layer is not tileable: ${key}`);
      const clipWidth = layers.clipWidth;
      drawBackdrop(ctx, layers.sky, x, y, w, h, 1, { clipWidth });
      drawBackdrop(ctx, layers.far, x, y, w, h, 1, { clipWidth, scrollX: time * layers.farSpeed });
      drawBackdrop(ctx, layers.near, x, y, w, h, 1, { clipWidth, scrollX: time * layers.nearSpeed });
    }
    return Object.freeze({ registerAssets, load, preloadAll, status,
      getImage: key => image(key, false), getWearFactor: wearFactor,
      resolveMachineBaseKey, machineSupport, drawAgedSprite, drawRoadCar, drawBackdrop, drawParallax });
  }
  return Object.freeze({ create, wearFactor, worldPoint });
})();
const ASSETS = AssetSystem.create(ASSET_MANIFEST, new URL('../', document.currentScript.src).href);

// Core simulation for The Driftless Farm. No DOM access.
const Sim = (() => {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const r0 = (v) => Math.round(v);
  const OVER_TEXT = {
    foreclosure: 'The bank has foreclosed on the farm. There is an auction on the front lawn.',
    family: 'Ingrid has had enough. The family packs up for a flat in La Crosse.',
    retired: 'Nels hangs up his overalls. The chronicle is complete.',
  };
  const finalYear = (s) => Math.min(s.startYear + DATA.gameYears - 1, DATA.lastYear);
  const FINAL_HARVEST = { head: 'THE FINAL HARVEST', body: 'This is the last season of the chronicle. Make it a good one.', effect: () => '' };

  function interp(table, year) {
    const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
    if (year <= keys[0]) return table[keys[0]];
    for (let i = 1; i < keys.length; i++) {
      if (year <= keys[i]) {
        const a = keys[i - 1], b = keys[i];
        return table[a] + (table[b] - table[a]) * (year - a) / (b - a);
      }
    }
    return table[keys[keys.length - 1]];
  }
  function hash(...args) {
    let h = 2166136261;
    const str = args.join('|');
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 100000) / 100000;
  }
  const noise = (s, key, amp = .08) => 1 + (hash(s.seed, s.year, key) - .5) * 2 * amp;
  function rand(s) {
    s.rng = (s.rng + 0x6D2B79F5) | 0;
    let t = s.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const pI = (s) => interp(DATA.priceIndex, s.year) * s.mods.price;
  const cost = (s) => interp(DATA.costIndex, s.year);
  const loc = (s) => DATA.locations.find(l => l.id === s.locId) || DATA.locations[0];
// Town population: the census trend, nudged by farm prices and by how well the farm and its family are doing
const TOWN_POP = { strum: 400, westby: 1000, coonvalley: 420, blair: 700, mondovi: 1550, chippewa: 8900, trempealeau: 620, winona: 18600 };
const POP_TREND = { 1900: .9, 1910: 1, 1920: 1.08, 1930: 1.07, 1940: 1.12, 1950: 1.18, 1960: 1.24, 1970: 1.3 };
function townPop(s) {
  const c = cost(s), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const econ = clamp((interp(DATA.priceIndex, s.year) / c - 1) * .12, -.06, .06);
  const you = clamp((netWorth(s) / c - 6000) / 100000, -.04, .08) + clamp((s.reputation - 50) / 1000, -.03, .03);
  const n = (TOWN_POP[s.locId] || 600) * interp(POP_TREND, s.year) * (1 + econ + you), r = n > 5000 ? 50 : 5;
  return Math.round(n / r) * r;
}
  const spend = (s, amt) => { s.cash -= amt; };
  const prohibition = (s) => s.year >= 1920 && s.year <= 1933;

  function goodPrice(s, g, season = 'spring') {
    let p = DATA.goods[g].price * pI(s) * (s.mods.goods[g] || 1) * noise(s, g, loc(s).bonus.swing || .08);
    p *= (loc(s).bonus.goods || {})[g] || 1;
    // Prohibition closes the breweries that bought corn for their lager.
    if (g === 'corn' && prohibition(s)) p *= .9;
    if (g === 'tobacco' && s.year >= 1930 && s.year <= 1934) p *= .7;
    if (g === 'wood') p = DATA.goods.wood.price * cost(s);
    if (g === 'lumber') p = DATA.goods.lumber.price * cost(s) * noise(s, 'lumber', .06);
    return p * (season === 'fall' ? .92 : 1);
  }
  // Market price as the farmer sees it; buying carries an 8% markup. Trempealeau's river trade improves both.
  const sellF = (s) => loc(s).bonus.sell || 1;
  const buyF = (s) => loc(s).bonus.buy || 1;
  const sellPrice = (s, g, season = 'spring') => goodPrice(s, g, season) * sellF(s);
  const buyPrice = (s, g, season = 'spring') => goodPrice(s, g, season) * 1.08 * buyF(s);
  // From harvest through the winter the market runs at the lower fall prices; the spring prices come back with the new year.
  const marketSeason = (s) => (s.phase === 'fall' || s.phase === 'winter' ? 'fall' : 'spring');
  const landPrice = (s) => interp(DATA.landPrice, s.year) * noise(s, 'land', .05);
  const cowPrice = (s) => 50 * pI(s) * noise(s, 'cow');
  const horsePrice = (s) => 140 * cost(s) * (s.year > 1935 ? .45 : s.year > 1925 ? .7 : 1) * noise(s, 'horse');
  const bfPrice = (s) => .27 * pI(s) * (s.flags.coop ? 1.08 : 1) * (s.year >= 1964 ? .9 : 1) * noise(s, 'bf', .05);
  const factoryPrice = (s) => 1.3 * pI(s) * noise(s, 'milk', .05);
  const skillQ = (s) => .9 + .3 * (s.skill - .85);
  function cheeseAvailable(s, id) { const c = DATA.cheeses[id]; return !c.from || s.year >= c.from || s.cheats.unlock; }
  function cheesePrice(s, id, aged) {
    const c = DATA.cheeses[id];
    return c.price * pI(s) * noise(s, 'ch' + id) * (aged ? (c.aged || 1) : 1) * skillQ(s) * sellF(s);
  }
  function cheeseDemand(s, id) {
    const c = DATA.cheeses[id];
    let d = c.demand * (1 + (s.year - 1900) / 60) * (loc(s).bonus.demand || 1);
    if (c.norse) d *= s.mods.norse;
    if (id === 'limburger' && prohibition(s)) d *= .7;
    return d;
  }

  function machinePrice(s, m) {
    const base = m.price * cost(s) / interp(DATA.costIndex, m.from) * s.mods.machine;
    if (s.cheats.unlock && s.year < m.from) return { price: base, cond: 'new' };
    if (s.year < m.from) return null;
    // Once alfalfa replaces red clover there is no clover seed to hull, so the dealers stop offering hullers; balers come with alfalfa.
    if (m.type === 'huller' && !cropAllowed(s, 'clover')) return null;
    if (m.type === 'baler' && !cropAllowed(s, 'alfalfa')) return null;
    if (s.year <= m.to) return { price: base, cond: 'new' };
    if (s.year > m.to + 25 && !s.cheats.unlock) return null;
    return { price: base * Math.max(.25, .55 * Math.pow(.94, s.year - m.to)), cond: 'used' };
  }
  const machineDef = (id) => DATA.machines.find(m => m.id === id);
  function machineValue(s, owned) {
    const m = machineDef(owned.id);
    return m.price * cost(s) / interp(DATA.costIndex, m.from) * Math.max(.2, Math.pow(.9, s.year - owned.bought)) * (owned.used ? .6 : 1) * resaleF(m);
  }

  // ---------- tractor types: each kind of power brings its own advantage ----------
  const TRAITS = {
    steam: { name: 'Big belt power', note: 'your outfit can thresh for 3 more neighbor farms' },
    kerosene: { name: 'Burns kerosene', note: 'fuel costs 25% less' },
    unit: { name: 'Mass-produced', note: 'cheap parts at every dealer: repairs 30% lower' },
    standard: { name: 'Heavy drawbar', note: 'pulls a bigger plow: 15% more field acres' },
    rowcrop: { name: 'Row-crop', note: 'cultivates the rows: labor for corn and tobacco 25% lower' },
    utility: { name: 'Three-point hitch', note: 'mounted implements: all field labor 10% lower' },
    diesel: { name: 'Diesel', note: 'fuel costs 35% less' },
    twoCyl: { name: 'Two-cylinder', note: 'the simple "Johnny Popper" holds its value: resale 15% higher' },
    lights: { name: 'Electric lights', note: 'works after dark: 10% more field acres' },
    rubber: { name: 'Rubber tires', note: 'easy on the machine: repairs 35% lower, and 5% more field acres' },
  };
  // The art draws steel wheels exactly when this is false
  function rubberTires(m, year) {
    if (!m || m.type !== 'power' || m.kind === 'steam') return false;
    const L = m.look || {}, y = year || m.from;
    return L.rubberFrom ? y >= L.rubberFrom : !(L.st === 'frame' || L.st === 'unit' || (m.from < 1930 && !L.styled));
  }
  function traits(m, year) {
    if (!m || m.type !== 'power') return [];
    if (m.kind === 'steam') return ['steam'];
    const L = m.look || {}, t = [{ frame: 'kerosene', unit: 'unit', rowcrop: 'rowcrop', utility: 'utility' }[L.st] || 'standard'];
    if (/diesel/i.test(m.name)) t.push('diesel');
    if (m.brand === 'John Deere') t.push('twoCyl');
    if ((L.feat || []).includes('lights')) t.push('lights');
    if (rubberTires(m, year)) t.push('rubber');
    return t;
  }
  const builtYear = (o) => o.built || o.bought;
  const hasTrait = (s, k) => s.machines.some(o => traits(machineDef(o.id), builtYear(o)).includes(k));
  function fieldAcres(m, year) {
    if (m.kind === 'steam') return m.acres * .75;
    const t = traits(m, year);
    return m.acres * (1 + (t.includes('standard') ? .15 : 0) + (t.includes('rubber') ? .05 : 0) + (t.includes('lights') ? .1 : 0));
  }
  const fuelF = (m) => { const t = traits(m, m.from); return t.includes('diesel') ? .65 : t.includes('kerosene') ? .75 : 1; };
  const repairF = (m, year) => { const t = traits(m, year); return (t.includes('rubber') ? .65 : 1) * (t.includes('unit') ? .7 : 1); };
  const resaleF = (m) => (traits(m, m.from).includes('twoCyl') ? 1.15 : 1);
  const machineRepairs = (s, o) => machineValue(s, o) * .03 * repairF(machineDef(o.id), builtYear(o)) * (s.buildings.machine_shed ? .6 : 1);
  const buildingDef = (id) => DATA.buildings.find(b => b.id === id);
  const buildingPrice = (s, b) => b.price * cost(s) * (b.id === 'contour' ? Math.max(1, cropland(s) / 72) : 1);

  const cropland = (s) => r0(s.land * .6);
  const pasture = (s) => r0(s.land * .25);
  const woods = (s) => s.land - cropland(s) - pasture(s);
  const barnCap = (s) => 16 + 12 * (s.buildings.barn_addition || 0);
  const owned = (s, type) => s.machines.map(o => ({ o, m: machineDef(o.id) })).filter(x => x.m.type === type);

  function powerCap(s) {
    let cap = s.horses * 20;
    for (const { o, m } of owned(s, 'power')) cap += fieldAcres(m, builtYear(o));
    return r0(cap);
  }
  function bestPower(s) {
    let best = null;
    for (const { m } of owned(s, 'power')) if (!best || m.hp > best.hp) best = m;
    return best;
  }
  const beltHP = (s) => (bestPower(s) ? bestPower(s).hp : 0);
  function bestThresher(s) {
    const hp = beltHP(s);
    let best = null;
    for (const { m } of owned(s, 'thresher')) if (m.minHP <= hp && (!best || m.perDay > best.perDay)) best = m;
    return best;
  }
  function huller(s) {
    const hp = beltHP(s);
    const b = owned(s, 'huller').map(x => x.m);
    const bird = b.find(m => !m.attach && m.minHP <= hp);
    if (bird) return bird;
    const att = b.find(m => m.attach);
    if (att && bestThresher(s)) return att;
    return null;
  }

  // ---------- woodlot & sawmill (MBF = thousand board feet; 1 cord of firewood uses about 0.5 MBF of timber) ----------
  const timberMax = (s) => woods(s) * 6;
  const timberGrowth = (s) => woods(s) * .3 * (1 - .6 * Math.min(1, s.timber / Math.max(1, timberMax(s))));
  const lumberValue = (s) => goodPrice(s, 'lumber');
  const logPrice = (s) => 11 * cost(s) * noise(s, 'logs', .1);
  const sawFee = (s) => 6 * cost(s);
  function bestSawmill(s) {
    const hp = beltHP(s);
    let best = null;
    for (const { m } of owned(s, 'sawmill')) if (m.minHP <= hp && (!best || m.perDay > best.perDay)) best = m;
    return best;
  }
  const woodPower = (s) => Math.max(beltHP(s), ...owned(s, 'engine').map(x => x.m.hp), 0);
  // Steam engines are wood-fired: fuel values are 1910 dollars, and a cord of wood was about $3.
  const steamCordsPerDay = (m) => m.fuel / 75;
  const steamFieldCords = (s) => owned(s, 'power').reduce((a, { m }) => a + (m.kind === 'steam' ? m.fuel * .2 : 0), 0);
  function burnWood(s, cords) {
    const use = Math.min(cords, Math.max(0, s.store.wood));
    const short = cords - use, cost = short * goodPrice(s, 'wood') * 1.1 * buyF(s);
    s.store.wood -= use; s.cash -= cost;
    return { cords, use, short, cost };
  }
  const woodNote = (w) => w.short > .05 ? `${w.use.toFixed(1)} from the woodpile, ${w.short.toFixed(1)} bought for $${r0(w.cost)}` : 'all from your woodpile';
  function woodlotInfo(s) {
    const tools = owned(s, 'woodtool').map(x => x.m.id);
    const chain = tools.includes('chainsaw'), buzz = tools.includes('buzz_saw') && woodPower(s) >= 5;
    const mill = bestSawmill(s);
    let method = s.plan.sawMethod;
    if (method === 'own' && !mill) method = 'custom';
    const cords = s.plan.cords || 0, logs = s.plan.logs || 0;
    const perCord = chain ? .45 : buzz ? .7 : 1.4, perLog = chain ? 1.5 : 3;
    const millDays = method === 'own' && logs ? logs / mill.perDay : 0;
    return { chain, buzz, mill, method, cords, logs, perCord, perLog, millDays,
      needDays: cords * perCord + logs * perLog + millDays * 3, haveDays: laborAvail(s) * 45, timberNeed: cords * .5 + logs };
  }
  // What the winter wood scene shows: the sawmill, the buzz saw, or a man with an axe
  const rigPower = (s, m) => { const o = s.machines.find(x => x.id === m.id); return { powerId: m.id, powerYear: o ? (o.built || o.bought) : s.year }; };
  function buzzPower(s) { const eng = owned(s, 'engine')[0]; return rigPower(s, eng ? eng.m : bestPower(s)); }
  function woodRig(s) {
    const w = woodlotInfo(s);
    if (w.method === 'own' && w.logs > 0 && w.mill) return { job: 'sawmill', millId: w.mill.id, ...rigPower(s, bestPower(s)) };
    if (w.buzz && w.cords > 0) return { job: 'buzz', ...buzzPower(s) };
    return { job: w.chain ? 'chainsaw' : 'axe' };
  }
  function woodlot(s) {
    const w = woodlotInfo(s), out = [];
    const se = s.season || {}, woodEff = (se.woodEff || 1) * (se.buzzEff || 1), sawEff = se.sawEff || 1;
    const myWork = (e) => (e !== 1 ? ` (your own work: ${Math.round(e * 100)}%)` : '');
    const f = Math.min(1, w.haveDays / Math.max(.01, w.needDays), s.timber / Math.max(.01, w.timberNeed));
    const cut = w.cords * f, cords = cut * woodEff, logs = w.logs * f;
    s.timber = Math.max(0, s.timber - cut * .5 - logs);
    s.store.wood += cords;
    if (cords > .4) out.push(`Cut and split ${cords.toFixed(1)} cords of firewood ${w.chain ? 'with the chain saw' : w.buzz ? 'on the buzz saw' : 'with crosscut saw, axe, and maul'}${myWork(woodEff)}.`);
    if (logs > .05) {
      if (w.method === 'own') {
        const pw = bestPower(s), lumber = logs * 1.1 * sawEff, slab = logs * .4, days = logs / w.mill.perDay;
        s.store.lumber += lumber; s.store.wood += slab;
        let fuelNote;
        if (pw.kind === 'steam') { const b = burnWood(s, days * steamCordsPerDay(pw)); fuelNote = `the engine burned ${b.cords.toFixed(1)} cords, ${woodNote(b)}`; }
        else { const fuel = days * pw.fuel * fuelF(pw) / 25 * cost(s); s.cash -= fuel; fuelNote = `fuel $${r0(fuel)}`; }
        out.push(`Sawed ${logs.toFixed(1)} MBF of logs on your ${w.mill.name}, belted to the ${pw.name}: ${lumber.toFixed(1)} MBF of lumber${myWork(sawEff)} and ${slab.toFixed(1)} cords of slab wood (${fuelNote}).`);
      } else if (w.method === 'custom') {
        const fee = logs * sawFee(s), slab = logs * .3;
        s.store.lumber += logs; s.store.wood += slab; s.cash -= fee;
        out.push(`The custom sawyer set up his mill in the yard and sawed ${logs.toFixed(1)} MBF of lumber for $${r0(fee)}.`);
      } else {
        const income = logs * logPrice(s);
        s.cash += income;
        out.push(`Hauled ${logs.toFixed(1)} MBF of saw logs to the mill in ${loc(s).town} for $${r0(income)}.`);
      }
    }
    if (f < .97 && (w.cords || w.logs)) out.push(w.haveDays < w.needDays ? 'Not enough hands this winter to finish all the woodlot work.' : 'The woods ran short of good timber.');
    if (s.store.wood >= 6) s.store.wood -= 6;
    else {
      const short = 6 - s.store.wood, c = short * goodPrice(s, 'wood') * 1.2 * buyF(s);
      s.store.wood = 0; s.cash -= c; s.contentment -= 2;
      out.push(`The woodbox ran empty — bought ${short.toFixed(1)} cords of wood and coal for $${r0(c)}.`);
    }
    if (!s.buildings.woodshed) s.store.wood *= .9;
    s.timber = Math.min(timberMax(s), s.timber + timberGrowth(s));
    return out;
  }

  function family(s) {
    return DATA.family.map(f => {
      const age = s.year - f.born;
      const away = f.away && s.year >= f.away[0] && s.year <= f.away[1];
      const present = age >= 0 && s.year < f.leave && !away;
      let labor = 0;
      if (present) {
        if (age >= 75) labor = .25; else if (age >= 65) labor = .6; else if (age >= 16) labor = 1; else if (age >= 12) labor = .5;
        if (f.role === 'wife' || f.role === 'daughter') labor *= .6;
      }
      return { ...f, age, away, present, labor };
    }).filter(f => f.age >= 0);
  }
  const laborAvail = (s) => (family(s).reduce((a, f) => a + f.labor, 0) + s.plan.hired) * s.mods.labor;
  function milkShares(s) {
    const m = { ...s.plan.milk };
    if (!s.buildings.cheese_house) { m.factory += m.home; m.home = 0; }
    const t = m.cream + m.factory + m.home || 1;
    return { cream: m.cream / t, factory: m.factory / t, home: m.home / t };
  }
  function laborNeed(s) {
    let n = 0;
    const rowF = hasTrait(s, 'rowcrop') ? .75 : 1, hitchF = hasTrait(s, 'utility') ? .9 : 1;
    for (const c of DATA.cropOrder) n += (s.plan.crops[c] || 0) * DATA.crops[c].labor / 60 * hitchF * (['corn', 'tobacco'].includes(c) ? rowF : 1);
    // Loose alfalfa is mowed, raked, loaded with the hay loader, and forked into the mow: extra hands until a baler does it.
    if (cropAllowed(s, 'alfalfa') && !balerRig(s)) n += (s.plan.crops.alfalfa || 0) * .5 / 60;
    n += s.cows / (s.buildings.milker ? 24 : 12) + s.heifers / 40 + s.horses / 30;
    const home = milkShares(s).home;
    if (home > 0) n += .3 + s.cows * home * .05;
    return n;
  }
  const rate = (s) => (s.year < 1930 ? .06 : s.year < 1940 ? .05 : s.year < 1950 ? .04 : s.year < 1960 ? .045 : .055) + s.mods.interest;

  function storeValue(s) {
    let v = 0;
    for (const g of Object.keys(DATA.goods)) v += (s.store[g] || 0) * sellPrice(s, g, 'fall');
    for (const id of Object.keys(s.cheese)) v += (s.cheese[id].fresh + s.cheese[id].aged) * cheesePrice(s, id, false) * .8;
    return v;
  }
  function assets(s) {
    const land = s.land * landPrice(s);
    const stock = s.cows * cowPrice(s) + s.heifers * cowPrice(s) * .5 + s.horses * horsePrice(s);
    const mach = s.machines.reduce((a, o) => a + machineValue(s, o), 0);
    let bld = 0;
    for (const [id, n] of Object.entries(s.buildings)) bld += buildingDef(id).price * cost(s) * .5 * (n === true ? 1 : n);
    const bonds = s.bonds.reduce((a, b) => a + b.amount, 0);
    return { land, stock, mach, bld, store: storeValue(s), bonds };
  }
  function netWorth(s) {
    const a = assets(s);
    return s.cash + a.land + a.stock + a.mach + a.bld + a.store + a.bonds - s.debt;
  }
  function creditLimit(s) {
    const a = assets(s);
    return Math.max(0, .6 * a.land + .3 * (a.stock + a.mach) - s.debt);
  }

  function feedNeeds(s) {
    const pastNeed = s.cows * 2 + s.horses * 1.5 + s.heifers;
    const pf = pastNeed ? clamp(pasture(s) / pastNeed, 0, 1) : 1;
    const hayMult = 1 - .38 * pf;
    const ration = { lean: 450, std: 900, gen: 1500 }[s.plan.ration];
    return {
      hay: (s.cows * 2.6 + s.horses * 2.2 + s.heifers * 1.2) * hayMult,
      grainLb: s.cows * ration + s.horses * 1500 + s.heifers * 250,
    };
  }
  function seedNeed(s) {
    const p = s.plan.crops;
    return { wheat: (p.wheat || 0) * 1.5, oats: (p.oats || 0) * 2.5, corn: (p.corn || 0) * .2, cloverSeed: (p.clover || 0) * .15 };
  }
  function keepSuggestion(s) {
    const f = feedNeeds(s), seed = seedNeed(s);
    const k = { hay: Math.max(0, f.hay - (s.store.silage || 0) / 3) * 1.05 };
    let lb = f.grainLb * 1.05;
    for (const [g, w] of [['oats', 32], ['corn', 56]]) {
      const take = Math.min(s.store[g] * w, lb);
      k[g] = take / w; lb -= take;
    }
    for (const g of Object.keys(seed)) k[g] = (k[g] || 0) + seed[g];
    k.wood = 6 + steamFieldCords(s);
    k.lumber = s.store.lumber;
    return k;
  }

  const START_LAND = 160;
  function defaultPlan() {
    return {
      // Barley, timothy hay, and silage corn were dropped in 2.0; their zero entries let version 1.0 still open a 2.0 save.
      crops: { wheat: 12, oats: 28, corn: 18, clover: 22, alfalfa: 0, tobacco: 0, barley: 0, hay: 0, silage: 0 },
      hired: 0, ration: 'std', keepHeifers: 2, milk: { cream: 50, factory: 50, home: 0 },
      cheese: 'cheddar', skim: 'calves', whey: 'calves', thresh: 'ring', customJobs: 0,
      hull: true, hullMethod: 'custom', dinner: 'hearty', minigame: true,
      cords: 8, logs: 0, sawMethod: 'custom', woodGame: true, baleJobs: 0, baleGame: true,
    };
  }
  function freshMods() {
    return { price: 1, goods: {}, interest: 0, wages: 1, machine: 1, labor: 1, milk: 1, weather: 1, yield: {}, norse: 1 };
  }

  function newGame(opts = {}) {
    const startYear = clamp(opts.startYear || 1900, 1900, 1940);
    const seed = opts.seed || Math.floor(Math.random() * 1e9);
    const s = {
      v: 1, seed, rng: seed, year: startYear, startYear, locId: opts.locId || 'strum', phase: 'spring',
      cash: 0, debt: 0, land: START_LAND, soil: 72, contentment: 70, reputation: 40, skill: .9,
      cows: startYear >= 1920 ? 8 : 6, heifers: 2, horses: 4, feedShortage: 0,
      store: { wheat: 20, oats: 170, barley: 0, corn: 100, cloverSeed: 2, hay: 12, tobacco: 0, wood: 10, silage: 0, lumber: 0 },
      cheese: {}, machines: [], buildings: {}, bonds: [], flags: {}, mods: freshMods(),
      plan: defaultPlan(), landOffer: 40, history: [], log: [], season: null, over: null,
      cheats: { unlock: false, perfect: false, used: false },
    };
    for (const id of Object.keys(DATA.cheeses)) s.cheese[id] = { fresh: 0, aged: 0 };
    const bonus = loc(s).bonus || {};
    s.land += bonus.land || 0;
    s.timber = woods(s) * 4;
    s.cash = r0(450 * cost(s));
    s.debt = r0(START_LAND * landPrice(s) * .4);
    s.cash += bonus.cash || 0;
    s.soil = bonus.soil || s.soil;
    s.cows += bonus.cows || 0;
    s.store.hay += bonus.hay || 0;
    s.store.wood += bonus.wood || 0;
    s.store.lumber += bonus.lumber || 0;
    if (bonus.fullWoods) s.timber = timberMax(s);
    if (bonus.building) s.buildings[bonus.building] = true;
    if (startYear >= 1903) s.flags.coop = true;
    if (startYear >= 1934) s.flags.contour = true;
    const binder = DATA.machines.find(m => m.type === 'binder' && m.from <= startYear && startYear <= m.to) || machineDef('mccd_binder');
    s.machines.push({ uid: 1, id: binder.id, bought: startYear, built: Math.min(startYear, binder.to), used: true });
    if (startYear >= 1925) s.machines.push({ uid: 2, id: 'mccd_10_20', bought: startYear, built: Math.min(startYear, 1939), used: true });
    s.history.push(snapshot(s));
    return s;
  }
  const snapshot = (s) => ({ year: s.year, worth: r0(netWorth(s)), cash: r0(s.cash), debt: r0(s.debt), land: s.land, cows: s.cows, soil: r0(s.soil) });

  // ---------- Spring ----------
  function yearStart(s) {
    s.mods = freshMods();
    s.flags.noRing = false; s.flags.wet = false;
    s.phase = 'spring';
    s.season = { cheeseSold: {} };
    s.landOffer = 20 + Math.floor(rand(s) * 9) * 10;
    const notes = [];
    for (const f of DATA.family) {
      if (f.leave === s.year && f.leaveNote) notes.push(f.leaveNote);
      if (f.born === s.year && s.year > s.startYear) notes.push(`${f.name} was born this year!`);
      if (f.away && f.away[0] === s.year) notes.push(f.awayNote);
      if (f.away && f.away[1] + 1 === s.year) notes.push(`${f.name} has come home.`);
    }
    for (const b of s.bonds.filter(b => b.due === s.year)) { s.cash += b.amount * b.rate; notes.push(`Liberty Bond matured: $${r0(b.amount * b.rate)}.`); }
    s.bonds = s.bonds.filter(b => b.due !== s.year);
    if (s.year >= 1934) s.flags.contour = true;
    rotateHayCrop(s);
    const events = DATA.events.filter(e => e.year === s.year);
    if (s.year === finalYear(s)) events.push(FINAL_HARVEST);
    return { events, notes };
  }
  function applyEvent(s, ev, choice) {
    const out = [];
    if (ev.effect) { const t = ev.effect(s, API); if (t) out.push(t); }
    if (ev.choices && ev.choices[choice]) { const t = ev.choices[choice].effect(s, API); if (t) out.push(t); }
    clampStats(s);
    return out.join(' ');
  }
  function clampStats(s) {
    s.contentment = clamp(s.contentment, 0, 100);
    s.reputation = clamp(s.reputation, 0, 100);
    s.soil = clamp(s.soil, 15, 100);
    s.skill = clamp(s.skill, .7, 1.25);
    for (const g of Object.keys(s.store)) s.store[g] = Math.max(0, s.store[g]);
    s.cows = Math.max(0, s.cows);
  }

  // Market & purchases (return error string or null)
  function trade(s, g, qty) {
    if (!qty) return null;
    if (qty > 0) {
      const amt = qty * buyPrice(s, g, marketSeason(s));
      if (amt > s.cash) return 'Not enough cash.';
      s.cash -= amt; s.store[g] += qty;
    } else {
      const q = Math.min(-qty, s.store[g]);
      s.cash += q * sellPrice(s, g, marketSeason(s));
      s.store[g] -= q;
    }
    return null;
  }
  function sellCheese(s, id, which, qty) {
    const inv = s.cheese[id];
    qty = Math.min(qty, inv[which]);
    if (qty <= 0) return 0;
    const sold = s.season.cheeseSold[id] || 0;
    const dem = Math.max(0, cheeseDemand(s, id) - sold);
    const full = Math.min(qty, dem), cheap = qty - full;
    const p = cheesePrice(s, id, which === 'aged');
    const amt = full * p + cheap * p * .55;
    inv[which] -= qty; s.cash += amt;
    s.season.cheeseSold[id] = sold + qty;
    return amt;
  }
  function buyLand(s, n) {
    n = Math.min(n, s.landOffer);
    const amt = n * landPrice(s);
    if (n <= 0) return 'No land offered.';
    if (amt > s.cash) return 'Not enough cash. Borrow from the bank first.';
    const w0 = woods(s);
    s.cash -= amt; s.land += n; s.landOffer -= n;
    s.timber += (woods(s) - w0) * 3;
    return null;
  }
  function sellLand(s, n) {
    n = Math.min(n, s.land - 40);
    if (n <= 0) return 'You must keep at least 40 acres.';
    const w0 = woods(s);
    s.cash += n * landPrice(s) * .95; s.land -= n;
    if (w0) s.timber *= woods(s) / w0;
    return null;
  }
  function borrow(s, n) { if (n > creditLimit(s)) return 'The banker shakes his head.'; s.debt += n; s.cash += n; return null; }
  function repay(s, n) { n = Math.min(n, s.debt, s.cash); s.debt -= n; s.cash -= n; return null; }
  function buyAnimal(s, kind, n) {
    const price = kind === 'cows' ? cowPrice(s) : kind === 'horses' ? horsePrice(s) : 0;
    if (n > 0) {
      if (kind === 'cows' && s.cows + n > barnCap(s)) return 'The barn is full.';
      if (n * price * 1.05 > s.cash) return 'Not enough cash.';
      s.cash -= n * price * 1.05; s[kind] += n;
    } else {
      const q = Math.min(-n, s[kind]);
      s.cash += q * price * .9; s[kind] -= q;
    }
    return null;
  }
  function buyMachine(s, id) {
    const m = machineDef(id), p = machinePrice(s, m);
    if (!p) return 'Not available yet.';
    if (p.price > s.cash) return 'Not enough cash.';
    if (m.attach && !owned(s, 'thresher').length) return 'You need a threshing separator first.';
    s.cash -= p.price;
    s.machines.push({ uid: nextUid(s), id, bought: s.year, built: p.cond === 'used' ? Math.min(s.year, m.to) : s.year, used: p.cond === 'used' });
    return null;
  }
  const nextUid = (s) => s.machines.reduce((mx, o) => Math.max(mx, o.uid || 0), 0) + 1;
  function sellMachine(s, uid) {
    const i = s.machines.findIndex(o => o.uid === uid);
    if (i < 0) return 'Not found.';
    s.cash += machineValue(s, s.machines[i]) * .85;
    s.machines.splice(i, 1);
    return null;
  }
  function buildingAvailable(s, b) { return (s.year >= b.from && (b.id !== 'contour' || s.flags.contour)) || s.cheats.unlock; }
  function buildingCost(s, b) {
    const full = buildingPrice(s, b), need = b.lumber || 0;
    const use = Math.min(need, s.store.lumber || 0);
    const credit = Math.min(full * .7, use * lumberValue(s));
    return { full, need, use, credit, cash: full - credit };
  }
  function build(s, id) {
    const b = buildingDef(id);
    if (!buildingAvailable(s, b)) return 'Not available yet.';
    if (s.buildings[id] && !b.repeat) return 'Already built.';
    if (b.needs && !s.buildings[b.needs]) return `Requires ${buildingDef(b.needs).name}.`;
    const c = buildingCost(s, b);
    if (c.cash > s.cash) return 'Not enough cash.';
    s.cash -= c.cash; s.store.lumber -= c.use;
    s.buildings[id] = b.repeat ? (s.buildings[id] || 0) + 1 : true;
    return null;
  }
  function cropAllowed(s, c) {
    const d = DATA.crops[c];
    // A crop that replaces another keeps its year even with the unlock cheat, so the two are never offered together.
    if (d.from && s.year < d.from && (d.replaces || !s.cheats.unlock)) return false;
    if (d.to && s.year > d.to) return false;
    if (d.needs && !s.buildings[d.needs]) return false;
    return true;
  }
  // Moves a replaced crop's acres to whichever of the pair can be grown this year (red clover until 1946, then alfalfa).
  function rotateHayCrop(s) {
    for (const [c, d] of Object.entries(DATA.crops)) {
      if (!d.replaces) continue;
      const [from, to] = cropAllowed(s, c) ? [d.replaces, c] : [c, d.replaces];
      s.plan.crops[to] = (s.plan.crops[to] || 0) + (s.plan.crops[from] || 0);
      s.plan.crops[from] = 0;
    }
  }
  const plannedAcres = (s) => DATA.cropOrder.reduce((a, c) => a + (cropAllowed(s, c) ? s.plan.crops[c] || 0 : 0), 0);
  const wage = (s) => 230 * cost(s) * s.mods.wages;

  function threshOptions(s) {
    const seps = owned(s, 'thresher').map(x => x.m).sort((a, b) => a.minHP - b.minHP), p = bestPower(s);
    const ownWhy = bestThresher(s) ? '' : !seps.length ? 'Needs a separator and enough belt horsepower.'
      : `Your ${seps[0].name} needs ${seps[0].minHP} belt horsepower; ${p ? `your ${p.name} has only ${p.hp}` : 'you have no tractor or steam engine to drive it'}.`;
    return {
      own: !!bestThresher(s), ownWhy, ring: !s.flags.noRing && s.reputation >= 15, custom: true,
      neighbors: Math.max(0, r0((6 + s.reputation / 8) * (s.year >= 1951 ? Math.max(.2, 1 - (s.year - 1950) / 12) : 1)) + (bestPower(s) && bestPower(s).kind === 'steam' ? 3 : 0)),
    };
  }

  function resolveThresh(s) {
    const opt = threshOptions(s);
    let method = s.plan.thresh;
    if (method === 'own' && !opt.own) method = opt.ring ? 'ring' : 'custom';
    if (method === 'ring' && !opt.ring) method = 'custom';
    return method;
  }

  // The neighbors' or thresherman's outfit, chosen per year so it stays the same all season
  function neighborPower(s) {
    const y = s.year;
    const pool = DATA.machines.filter(m => m.type === 'power' && m.hp >= 20 && m.from <= y && y <= m.to + 15);
    const era = y < 1918 ? pool.filter(m => m.kind === 'steam' || m.brand === 'Hart-Parr') : pool.filter(m => y - m.from <= 18);
    const use = era.length ? era : pool;
    return use[Math.floor(hash(s.seed, y, 'rig') * use.length)];
  }
  function neighborSeparator(s) {
    const y = s.year;
    const pool = DATA.machines.filter(m => m.type === 'thresher' && m.from <= y && y <= m.to + 15);
    return pool[Math.floor(hash(s.seed, y, 'sep') * pool.length)] || machineDef('case_28x50');
  }
  function rigFor(s, kind) {
    const isHull = kind === 'hull', method = resolveThresh(s), own = bestPower(s);
    let p = null, sep = null, who = '';
    if (!isHull && method === 'own') { p = own; sep = bestThresher(s); who = `You belt your ${sep.name} to the ${p.name}.`; }
    else if (isHull && s.plan.hullMethod === 'own' && huller(s) && own) { p = own; sep = huller(s); who = `You line up the ${sep.name} behind the ${p.name}.`; }
    if (!p) p = neighborPower(s);
    if (!sep) sep = isHull ? machineDef('birdsell_huller') : neighborSeparator(s);
    if (!who) who = isHull ? `The traveling clover huller rolls in, pulled by a ${p.name}.`
      : method === 'ring' ? `The threshing ring arrives with a ${p.name} and a ${sep.name} — neighbors with bundle wagons, pitchforks, and appetites.`
        : `The custom thresherman puffs up the lane with his ${p.name} and ${sep.name}.`;
    // planned to run our own outfit but can't (a tractor sold, or one too small for the separator): say so
    if (!isHull && s.plan.thresh === 'own' && method !== 'own') who = `${owned(s, 'thresher').length ? threshOptions(s).ownWhy : 'You have no separator of your own.'} ${who}`;
    const mine = s.machines.find(o => o.id === p.id);
    return { powerId: p.id, powerYear: mine ? (mine.built || mine.bought) : Math.min(s.year, p.to), sepBody: sep.body, sepBrand: sep.brand, isHull, method, who, steam: p.kind === 'steam' };
  }

  function commitPlan(s) {
    const msgs = [];
    for (const c of DATA.cropOrder) if (!cropAllowed(s, c)) s.plan.crops[c] = 0;
    const total = plannedAcres(s), cl = cropland(s);
    if (total > cl) {
      for (const c of DATA.cropOrder) s.plan.crops[c] = Math.floor((s.plan.crops[c] || 0) * cl / total);
      msgs.push(`Plantings trimmed to fit your ${cl} acres of cropland.`);
    }
    const seed = seedNeed(s);
    let seedCost = 0;
    for (const [g, need] of Object.entries(seed)) {
      const use = Math.min(need, s.store[g]); s.store[g] -= use;
      seedCost += (need - use) * goodPrice(s, g) * 1.15 * buyF(s);
    }
    const p = s.plan.crops;
    seedCost += ((p.alfalfa || 0) * 2 + (p.tobacco || 0) * 3) * pI(s);
    const wages = s.plan.hired * wage(s);
    const fuel = owned(s, 'power').reduce((a, { m }) => a + (m.kind === 'steam' ? 0 : m.fuel * fuelF(m)), 0) * cost(s) * .6;
    s.cash -= seedCost + wages + fuel;
    msgs.push(`Seed $${r0(seedCost)}, hired help $${r0(wages)}, field fuel $${r0(fuel)}.`);
    const steamCords = steamFieldCords(s);
    if (steamCords > 0) msgs.push(`Spring field work: the steam engine burned ${steamCords.toFixed(1)} cords of wood (${woodNote(burnWood(s, steamCords))}).`);
    const need = laborNeed(s), have = laborAvail(s);
    const planted = plannedAcres(s), cap = powerCap(s);
    s.season.laborEff = Math.pow(Math.min(1, have / Math.max(.1, need)), .5);
    s.season.powerF = planted > cap ? (cap + (planted - cap) * .5) / planted : 1;
    s.season.acres = { ...s.plan.crops };
    s.season.weatherRoll = clamp(1 + (rand(s) + rand(s) + rand(s) - 1.5) * .2, .6, 1.3);
    if (s.season.laborEff < .95) msgs.push('The family is stretched thin. Consider hiring help.');
    if (s.season.powerF < 1) msgs.push(`Not enough horses or tractors for ${planted} acres — some fields were planted late.`);
    s.phase = 'summer';
    return msgs;
  }

  function summer(s) {
    const out = [];
    const forced = s.cheats.forceEvent;
    for (const e of DATA.randomEvents) {
      if (out.length >= 2) break;
      if (e.cond && !e.cond(s)) continue;
      if (forced ? forced === e.head : rand(s) < e.p) out.push({ head: e.head, text: e.effect(s, API) });
    }
    s.cheats.forceEvent = null;
    if (s.cheats.weather) { s.mods.weather *= s.cheats.weather; s.cheats.weather = null; }
    clampStats(s);
    return out;
  }

  function techF(s, crop) {
    let f = 1;
    if (crop === 'corn') f += s.year < 1936 ? 0 : s.year < 1950 ? .5 * (s.year - 1936) / 14 : .5 + .25 * (s.year - 1950) / 10;
    if (s.year > 1945) f *= 1 + .25 * (s.year - 1945) / 15;
    return f;
  }
  // A stave silo holds about 120 t. It is filled to 3 t a cow: 2 t keep the silage milk bonus, and the rest stretches the hay.
  const SILO_TONS = 120, SILAGE_PER_BU = 9 / 35;
  const siloTarget = (s) => (s.buildings.silo ? Math.max(0, Math.min(SILO_TONS, s.cows * 3) - (s.store.silage || 0)) : 0);
  function siloFill(s, acres, perAcre) {
    const need = siloTarget(s);
    if (!need || !acres || !(perAcre > 0)) return { acres: 0, tons: 0 };
    const ac = Math.min(acres, need / perAcre);
    return { acres: ac, tons: ac * perAcre };
  }
  function harvest(s) {
    s.phase = 'fall';
    const se = s.season, a = se.acres, w = se.weatherRoll * s.mods.weather;
    const soilF = .5 + s.soil / 100 * .7;
    const g = {};
    for (const c of DATA.cropOrder) {
      const d = DATA.crops[c];
      let wf = d.small ? Math.pow(w, .9) : c === 'corn' ? Math.pow(w, 1.3) : w;
      let y = (a[c] || 0) * d.yield * soilF * wf * techF(s, c) * se.laborEff * se.powerF * noise(s, 'y' + c, .06);
      if (d.small) y *= s.mods.yield.small || 1;
      y *= s.mods.yield[c] || 1;
      if (c === 'alfalfa' && s.soil < 50) y *= .75;
      g[c] = Math.max(0, y);
    }
    if (s.plan.hull && a.clover) {
      g.cloverSeed = a.clover * 1.6 * soilF * w * se.laborEff * noise(s, 'cs', .1);
      g.clover *= .65;
    } else g.cloverSeed = 0;
    // With a silo, enough corn for the winter is cut green and ensiled before the rest is picked for grain.
    const fill = siloFill(s, a.corn || 0, a.corn ? g.corn / a.corn * SILAGE_PER_BU : 0);
    g.silage = fill.tons; se.siloAcres = fill.acres;
    if (fill.acres) g.corn *= 1 - fill.acres / a.corn;
    se.gross = g;
    s.store.corn += g.corn;
    s.store.hay += g.clover + g.alfalfa;
    s.store.silage += g.silage;
    s.store.tobacco += g.tobacco;
    const lines = [];
    for (const c of DATA.cropOrder) {
      const ac = (a[c] || 0) - (c === 'corn' ? fill.acres : 0);
      if (ac > .05) lines.push(`${DATA.crops[c].name}: ${r0(g[c]).toLocaleString()} ${DATA.crops[c].unit} (${(g[c] / ac).toFixed(1)}/ac)`);
    }
    if (fill.acres) lines.push(`Silage: ${r0(fill.tons)} t from ${fill.acres.toFixed(1)} ac of corn cut green to fill the silo.`);
    se.smallBu = (g.wheat || 0) + (g.oats || 0);
    return lines;
  }

  // ---------- hay baling: from 1947 the hay is alfalfa, put up loose until the farm owns a baler ----------
  // A small square bale weighed about 55 lb, so a ton made about 36 bales. Tie and custom-work rates are 1910 dollars
  // (scaled by the cost and price indexes); see the README for the sources.
  const BALES_PER_TON = 36, LOOSE_LOSS = .12, BALE_JOB_TONS = 30;
  const TIES = { twine: { name: 'twine', perBale: .0075, miss: .07 }, wire: { name: 'wire', perBale: .012, miss: .03 } };
  const hayingDue = (s) => !!(s.season && s.season.gross && s.season.gross.alfalfa > 0 && !s.season.hayed && cropAllowed(s, 'alfalfa'));
  // The best baler the farm can run: an engine-driven baler needs only a tractor to pull it; a PTO baler needs the horsepower.
  function balerRig(s) {
    const tractors = owned(s, 'power').filter(x => x.m.kind !== 'steam').sort((a, b) => b.m.hp - a.m.hp);
    if (!tractors.length) return null;
    const pw = tractors[0];
    let best = null;
    for (const x of owned(s, 'baler')) if ((x.m.engine || pw.m.hp >= x.m.minHP) && (!best || x.m.perDay > best.m.perDay)) best = x;
    return best && { baler: best.m, balerYear: builtYear(best.o), power: pw.m, powerYear: builtYear(pw.o), tie: TIES[best.m.tie] };
  }
  const baleNeighbors = (s) => Math.max(0, r0(3 + s.reputation / 12));
  function haying(s, eff = .8) {
    const se = s.season, tons = (se.gross && se.gross.alfalfa) || 0, out = [];
    if (!hayingDue(s)) return { lines: out, baled: false, total: 0 };
    se.hayed = true;
    const rig = balerRig(s);
    if (!rig) {
      const loss = tons * LOOSE_LOSS * noise(s, 'loose', .2);
      s.store.hay -= loss; se.hayLoss = loss;
      out.push(`The alfalfa was put up loose: mowed, side-raked, and lifted onto the rack with the hay loader. About ${r0(loss)} t of leaves and hay were lost between the field and the mow.`);
      out.push('A hay baler would save most of that, and much of the labor.');
      return { lines: out, baled: false, total: tons - loss };
    }
    const b = rig.baler, tie = rig.tie;
    const loss = tons * (.03 + (1 - eff) * .15), kept = tons - loss, bales = r0(kept * BALES_PER_TON);
    const dayCost = (rig.power.fuel * fuelF(rig.power) / 25 + (b.fuel || 0) / 5 + 2) * cost(s);
    const days = kept / b.perDay, tieCost = bales * tie.perBale * cost(s);
    let fee = days * dayCost + tieCost;
    const jobs = Math.min(s.plan.baleJobs || 0, baleNeighbors(s), Math.floor(Math.max(0, 14 - days) * b.perDay / BALE_JOB_TONS));
    if (jobs > 0) {
      const jobBales = jobs * BALE_JOB_TONS * BALES_PER_TON;
      const income = jobBales * .03 * pI(s), jobCost = jobs * BALE_JOB_TONS / b.perDay * dayCost + jobBales * tie.perBale * cost(s);
      s.cash += income - jobCost;
      s.reputation += eff > .8 ? jobs * .6 : -jobs * .4;
      out.push(`You baled for ${jobs} neighbor farm(s): earned $${r0(income)}, ${tie.name} and fuel $${r0(jobCost)}.`);
    }
    s.store.hay -= loss; s.cash -= fee; se.hayLoss = loss; se.bales = bales;
    out.push(`You baled the alfalfa with your ${b.name} behind the ${rig.power.name}.`);
    out.push(`${bales.toLocaleString()} bales (${r0(kept)} t) in the mow in ${days.toFixed(1)} day(s); ${r0(loss)} t lost in the field (${(loss / tons * 100).toFixed(0)}%).`);
    out.push(`Baling cost $${r0(fee)}: ${tie.name} $${r0(tieCost)}, fuel and help $${r0(fee - tieCost)}.`);
    clampStats(s);
    return { lines: out, baled: true, total: kept };
  }

  function dinnerEffect(s) {
    const d = { plain: [8, -2, 0], hearty: [15, 1, 0], legendary: [30, 4, -1] }[s.plan.dinner];
    s.cash -= d[0] * cost(s); s.reputation += d[1]; s.contentment += d[2];
    return d;
  }
  function threshing(s, eff) {
    const se = s.season, g = se.gross, opt = threshOptions(s);
    const method = resolveThresh(s);
    const out = [], total = se.smallBu;
    if (total <= 0) return { method, lines: ['No small grain to thresh this year.'], total: 0 };
    const smallAcres = (se.acres.wheat || 0) + (se.acres.oats || 0);
    const binderAcres = owned(s, 'binder').reduce((x, { m }) => x + m.acres, 0);
    if (smallAcres > binderAcres) {
      const c = (smallAcres - binderAcres) * 1.4 * cost(s);
      s.cash -= c; out.push(`Hired custom binder work for ${r0(smallAcres - binderAcres)} acres: $${r0(c)}.`);
    }
    let wait, fee = 0;
    if (method === 'own') {
      wait = 1;
      const t = bestThresher(s), pw = bestPower(s);
      const perDay = t.perDay * (.6 + .4 * eff);
      const ownDays = total / perDay, steam = pw.kind === 'steam';
      const dayCost = (steam ? 0 : pw.fuel * fuelF(pw) / 25 * cost(s)) + 4 * cost(s);
      fee = ownDays * dayCost;
      let engineDays = ownDays;
      const jobs = Math.min(s.plan.customJobs, opt.neighbors, Math.floor(Math.max(0, 22 - ownDays) * perDay / 1100));
      if (jobs > 0) {
        const jobDays = jobs * 1100 / perDay;
        const income = jobs * 1100 * .03 * pI(s), jobCost = jobDays * dayCost;
        s.cash += income - jobCost; engineDays += jobDays;
        s.reputation += eff > .8 ? jobs * .8 : -jobs * .5;
        out.push(`Your outfit threshed for ${jobs} neighbor farm(s): earned $${r0(income)}, ${steam ? 'crew' : 'fuel & crew'} $${r0(jobCost)}.`);
      }
      if (steam) {
        const b = burnWood(s, engineDays * steamCordsPerDay(pw));
        out.push(`The steam engine burned ${b.cords.toFixed(1)} cords of wood in ${engineDays.toFixed(1)} days of threshing (${woodNote(b)}).`);
      }
      const age = s.year - Math.min(...owned(s, 'thresher').map(x => x.o.bought));
      if (rand(s) < Math.min(.3, .05 + age * .012)) { const rep = 40 * cost(s); s.cash -= rep; wait += 3; out.push(`Breakdown! The ${t.name} lost a cylinder tooth. Repairs $${r0(rep)}, 3 days lost.`); }
      out.push(`You ran your own ${t.name}, belted to the ${pw.name}.`);
    } else if (method === 'ring') {
      wait = Math.max(1, 4 + rand(s) * 8 - s.reputation / 20);
      fee = total * .015 * pI(s);
      out.push('The threshing ring came through — neighbors swapped work at every farm.');
    } else {
      wait = 5 + rand(s) * 10;
      fee = ((g.wheat || 0) * .04 + (g.oats || 0) * .025) * pI(s);
      out.push('You hired the custom thresherman and his rig.');
    }
    const d = dinnerEffect(s);
    const shockLoss = Math.min(.25, wait * (s.flags.wet ? .012 : .003));
    const threshLoss = (1 - eff) * .12;
    const keep = (1 - shockLoss) * (1 - threshLoss);
    let net = 0;
    for (const c of ['wheat', 'oats']) { const q = (g[c] || 0) * keep; s.store[c] += q; net += q; }
    s.cash -= fee;
    out.push(`Waited ${r0(wait)} day(s) in the shock (${(shockLoss * 100).toFixed(1)}% lost), separator loss ${(threshLoss * 100).toFixed(1)}%.`);
    out.push(`Threshing cost $${r0(fee)} plus $${r0(d[0] * cost(s))} for the threshers' dinner. Net grain: ${r0(net).toLocaleString()} bu.`);
    se.threshNet = net;
    clampStats(s);
    return { method, lines: out, total: net };
  }
  function hulling(s, eff) {
    const se = s.season, pot = se.gross.cloverSeed || 0;
    if (pot <= 0) return { lines: ['No clover saved for seed.'], total: 0 };
    const h = s.plan.hullMethod === 'own' ? huller(s) : null;
    const out = [];
    let loss = (1 - eff) * .25, fee = 0;
    if (h) {
      if (h.attach) loss += .08;
      fee = pot / h.perDay * 3 * cost(s);
      out.push(`You hulled clover with your ${h.name}.`);
      if (!h.attach) {
        const jobs = Math.min(3 + Math.floor(s.reputation / 20), 8);
        const inc = jobs * 25 * pI(s);
        s.cash += inc; out.push(`Custom hulling for ${jobs} neighbors earned $${r0(inc)}.`);
      }
    } else {
      fee = pot * 1.0 * pI(s);
      out.push('The traveling clover huller came by in November.');
    }
    const net = pot * (1 - loss);
    s.store.cloverSeed += net; s.cash -= fee;
    out.push(`Clover seed: ${net.toFixed(1)} bu (loss ${(loss * 100).toFixed(0)}%), hulling cost $${r0(fee)}.`);
    return { lines: out, total: net };
  }

  function dairy(s) {
    const se = s.season;
    let per = interp(DATA.milkPerCow, s.year) * { lean: .82, std: 1, gen: 1.12 }[s.plan.ration];
    if (s.store.silage >= s.cows * 2 && s.cows) per *= 1.08;
    if (s.flags.bull) per *= 1.1;
    if (s.buildings.windmill) per *= 1.03;
    if (s.buildings.milker) per *= 1.03;
    per *= (1 - .4 * s.feedShortage) * se.laborEff * s.mods.milk * noise(s, 'milkcow', .05);
    const cwt = s.cows * per / 100;
    const sh = milkShares(s);
    const out = [`${s.cows} cows gave ${r0(cwt * 100).toLocaleString()} lb of milk (${r0(per).toLocaleString()} lb/cow).`];
    let cash = 0, saving = 0;
    se.cheesesMade = [];
    const creamCwt = cwt * sh.cream;
    if (creamCwt > 0) {
      const bf = creamCwt * 3.7, v = bf * bfPrice(s);
      cash += v; out.push(`Cream to the creamery: ${r0(bf)} lb butterfat, $${r0(v)}.`);
      const skim = creamCwt * .9;
      const sc = DATA.cheeses[s.plan.skim];
      if (sc && s.buildings.cheese_house) {
        const lb = skim * sc.yield * s.skill; s.cheese[s.plan.skim].fresh += lb;
        if (lb > 1) se.cheesesMade.push(s.plan.skim);
        out.push(`Skim milk made into ${r0(lb)} lb of ${sc.name}.`);
      } else { saving += skim * 8; out.push('Skim milk fed to the calves and pigs.'); }
    }
    const facCwt = cwt * sh.factory;
    if (facCwt > 0) { const v = facCwt * factoryPrice(s); cash += v; out.push(`Whole milk to the cheese factory: $${r0(v)}.`); }
    const homeCwt = cwt * sh.home;
    if (homeCwt > 0) {
      let id = s.plan.cheese;
      if (!cheeseAvailable(s, id) || DATA.cheeses[id].milk !== 'whole') id = 'cheddar';
      const lb = homeCwt * DATA.cheeses[id].yield * s.skill;
      s.cheese[id].fresh += lb; s.skill += .015;
      if (lb > 1) se.cheesesMade.unshift(id);
      out.push(`Ingrid made ${r0(lb).toLocaleString()} lb of ${DATA.cheeses[id].name} in the Ostehus.`);
      const whey = homeCwt * .88;
      if (s.plan.whey === 'brunost') {
        const wood = Math.max(0, s.store.wood - 6);
        const lbB = Math.min(whey * 8, wood * 250);
        s.store.wood -= lbB / 250; s.cheese.brunost.fresh += lbB;
        if (lbB > 1) se.cheesesMade.push('brunost');
        saving += (whey - lbB / 8) * 4;
        out.push(`Whey boiled down over ${(lbB / 250).toFixed(1)} cords of wood into ${r0(lbB)} lb of Brunost${lbB < whey * 8 ? ' (ran short of firewood)' : ''}.`);
      } else saving += whey * 4;
    }
    s.cash += cash; se.milkCash = cash; se.feedSaving = saving; se.milkCwt = cwt;
    out.push(`Milk checks for the year: $${r0(cash)}.`);
    return out;
  }

  function sellSurplus(s, season = 'fall') {
    const keep = keepSuggestion(s);
    let total = 0;
    for (const g of Object.keys(DATA.goods)) {
      const q = Math.max(0, s.store[g] - (keep[g] || 0));
      if (q > .5) { total += q * sellPrice(s, g, season); s.store[g] -= q; }
    }
    s.cash += total;
    for (const id of Object.keys(s.cheese)) { total += sellCheese(s, id, 'fresh', s.cheese[id].fresh); total += sellCheese(s, id, 'aged', s.cheese[id].aged); }
    return total;
  }

  function winter(s) {
    s.phase = 'winter';
    const se = s.season, out = [];
    // Feed the stock
    const f = feedNeeds(s);
    let hayNeed = f.hay;
    const sil = Math.min(s.store.silage, hayNeed * 3); s.store.silage -= sil; hayNeed -= sil / 3;
    const hay = Math.min(s.store.hay, hayNeed); s.store.hay -= hay; hayNeed -= hay;
    let lb = Math.max(0, f.grainLb - (se.feedSaving || 0));
    for (const [g, wt] of [['oats', 32], ['corn', 56], ['wheat', 60]]) {
      const take = Math.min(s.store[g] * wt, lb); s.store[g] -= take / wt; lb -= take;
    }
    let bought = 0;
    if (hayNeed > 0) { const ph = goodPrice(s, 'hay') * 1.1 * buyF(s); const c = Math.min(s.cash > 0 ? s.cash : 0, hayNeed * ph); const t = c / ph; hayNeed -= t; s.cash -= c; bought += c; }
    if (lb > 0) { const pLb = goodPrice(s, 'corn') * 1.1 * buyF(s) / 56; const c = Math.min(s.cash > 0 ? s.cash : 0, lb * pLb); lb -= c / pLb; s.cash -= c; bought += c; }
    if (bought > 1) out.push(`Bought $${r0(bought)} of feed to get the stock through winter.`);
    const short = clamp((hayNeed / Math.max(1, f.hay) + lb / Math.max(1, f.grainLb)) / 2, 0, 1);
    s.feedShortage = short;
    if (short > .02) {
      const dead = Math.round(s.cows * .1 * short);
      s.cows -= dead; s.contentment -= 10 * short;
      out.push(`Feed ran short (${r0(short * 100)}%)! ${dead} cow(s) lost; next year's milk will suffer.`);
    }
    // Calves & herd
    const born = Math.round(s.cows * .85 * (.9 + rand(s) * .15));
    const heiferCalves = Math.floor(born / 2);
    const space = Math.max(0, barnCap(s) - s.cows);
    const join = Math.min(s.heifers, space);
    s.cows += join;
    let calfCash = (s.heifers - join) * cowPrice(s) * .9;
    s.heifers = Math.min(s.plan.keepHeifers, heiferCalves);
    calfCash += (born - s.heifers) * 9 * pI(s);
    s.cash += calfCash;
    const lostCows = Math.floor(s.cows * .02 + rand(s));
    s.cows = Math.max(0, s.cows - (lostCows > 1 ? 1 : lostCows));
    out.push(`${born} calves born; ${join} heifer(s) joined the milking string; calves & surplus stock sold for $${r0(calfCash)}.`);
    if (s.horses && rand(s) < .04 * s.horses) {
      const names = DATA.horseNames, name = names[(s.year - s.startYear + (s.seed || 0)) % names.length];
      s.horses -= 1; out.push(`${name[0].toUpperCase() + name.slice(1)}, one of the work horses, died this winter.`);
    }
    // Cheese aging
    for (const id of Object.keys(s.cheese)) {
      const c = s.cheese[id], d = DATA.cheeses[id];
      c.aged = c.aged * .92 + (d.ages ? c.fresh * .95 : 0);
      c.fresh = d.ages ? 0 : c.fresh * .6;
    }
    // Woodlot: firewood, saw logs, lumber
    out.push(...woodlot(s));
    // Expenses
    const fam = family(s).filter(m => m.present).length;
    const living = (fam + s.plan.hired * .3) * 55 * cost(s);
    const tax = s.land * .22 * cost(s);
    const interest = s.debt * rate(s);
    const upkeep = s.machines.reduce((a, o) => a + machineRepairs(s, o), 0) + (s.horses * 6 * cost(s));
    s.cash -= living + tax + interest + upkeep;
    out.push(`Household $${r0(living)}, taxes $${r0(tax)}, interest $${r0(interest)}, upkeep & blacksmith $${r0(upkeep)}.`);
    // Soil
    const cl = Math.max(1, cropland(s));
    let ds = 0, rowCrops = 0, planted = 0;
    for (const c of DATA.cropOrder) { const ac = se.acres[c] || 0; ds += ac * DATA.crops[c].soil; planted += ac; if (['corn', 'tobacco'].includes(c)) rowCrops += ac; }
    ds += (cl - planted);
    ds = ds / cl + Math.min(4, s.cows * 8 / cl);
    const erosion = (rowCrops / cl) * 4 * (s.buildings.contour ? .2 : 1) + .3;
    s.soil += ds - erosion;
    // Contentment
    const need = laborNeed(s), have = laborAvail(s);
    s.contentment += 1 + (s.buildings.electricity ? 2 : 0) - Math.min(8, Math.max(0, need / have - 1) * 8) - (s.debt > .5 * assets(s).land ? 4 : 0) + (s.cash > 1000 * cost(s) ? 2 : 0);
    s.reputation += (50 - s.reputation) * .03;
    clampStats(s);
    if (s.cheats.godMode) { s.contentment = 100; if (s.cash < 0) s.cash = 0; }
    // Bank
    if (s.cash < 0) {
      const need2 = -s.cash;
      if (need2 <= creditLimit(s)) { s.debt += need2; s.cash = 0; out.push(`The banker extended your note by $${r0(need2)}.`); }
      else s.over = { reason: 'foreclosure', text: OVER_TEXT.foreclosure };
    }
    if (s.contentment <= 0 && !s.over) s.over = { reason: 'family', text: OVER_TEXT.family };
    const report = yearReport(s, out);
    s.history.push(snapshot(s));
    if (!s.over && s.year >= finalYear(s)) s.over = { reason: 'retired', text: OVER_TEXT.retired };
    return report;
  }
  function nextYear(s) { if (!s.over) s.year += 1; }

  // Ingrid keeps the books and writes Nels the year's tally in her Norwegian-Wisconsin way.
  function yearReport(s, lines) {
    const se = s.season, nw = netWorth(s);
    const g = se.gross || {};
    const prev = s.history.length ? s.history[s.history.length - 1].worth : nw;
    const diff = r0(nw - prev);
    const money = (v) => `$${r0(v).toLocaleString()}`;
    const mood = s.contentment > 70 ? 'Da family is content and vell fed. Uff da, how dose kids eat!'
      : s.contentment > 40 ? 'Da family is getting by, ya, same as everybody else in da valley.'
      : s.contentment > 20 ? 'Da family is grumbling some, Nels. I\'m yust saying.'
      : 'Nels, I am at da end of my rope. Someting has got to change, ya?';
    const standing = s.reputation > 70 ? 'After church da neighbors say ve are pillars of da congregation. Don\'t let it go to your head.'
      : s.reputation > 40 ? 'Da neighbors speak vell of us after church.'
      : 'Da neighbors are talking about us, and not in a good vay.';
    const soil = s.soil > 70 ? 'and da soil is good and black' : s.soil > 45 ? 'and da soil is holding up okay' : `but da soil is getting tired, Nels, it needs ${cropAllowed(s, 'clover') ? 'clover' : 'alfalfa'}`;
    const feeling = s.contentment > 91 ? 'loving' : s.contentment > 85 ? 'happy' : s.contentment > 70 ? 'cheerful' : s.contentment > 40 ? 'tired' : s.contentment > 20 ? 'grumpy' : 'fed-up';
    // Rotate through the openings so no two letters in one chronicle start alike
    const k = s.year - s.startYear, salt = (s.seed || 0) % 9973;
    const G = DATA.letterGreetings;
    const greeting = (k === 0 ? G[0] : G[1 + (k - 1 + salt) % (G.length - 1)])(feeling, s.year);
    const made = se.cheesesMade || [];
    const ctx = { y: s.year, dry: prohibition(s), cheeseIds: made, county: loc(s).county,
      cheese: made.length ? DATA.cheeses[made[0]].name.replace(/\s*\(.*\)/, '').split(' / ')[0] : null };
    const cheesy = DATA.letterClosings.filter((c) => c.cheese && c.ok(ctx));
    const general = DATA.letterClosings.filter((c) => !c.cheese);
    let pick;
    if (ctx.cheese && cheesy.length && k % 3 === 1) pick = cheesy[(Math.floor(k / 3) + salt) % cheesy.length];
    else {
      // a stride coprime to the list length walks every closing before any repeats
      let p = (k * 17 + salt) % general.length;
      while (general[p].ok && !general[p].ok(ctx)) p = (p + 1) % general.length;
      pick = general[p];
    }
    const closing = pick.text(ctx);
    const family = [];
    for (const f of DATA.family) {
      if (f.born === s.year && s.year > s.startYear && f.birthLetter) family.push(f.birthLetter);
      if (f.leave === s.year && f.leaveLetter) family.push(f.leaveLetter);
      if (f.away && f.away[0] === s.year && f.awayLetter) family.push(f.awayLetter);
      if (f.away && f.away[1] + 1 === s.year && f.homeLetter) family.push(f.homeLetter);
    }
    for (const e of DATA.familyEvents) if (e.year === s.year) family.push(e.letter);
    return {
      title: `A Letter from Ingrid \u2014 Winter ${s.year}`,
      greeting,
      lines: [
        ...family,
        `Vell, our ${s.land} acres near ${loc(s).town} brought in ${r0(se.threshNet || 0).toLocaleString()} bushels of threshed grain and ${r0(g.corn || 0).toLocaleString()} bushels of corn.`,
        `Ve got ${s.cows} milk cows and ${s.heifers} ${s.heifers === 1 ? 'calf' : 'calves'} in da barn now, ${soil} (${r0(s.soil)}).`,
        ...lines,
        `Land is going for ${money(landPrice(s))} an acre. Ve owe da bank ${money(s.debt)}, and dere's ${money(s.cash)} in da coffee can.`,
        mood,
        standing,
        `All told, ve are vorth ${money(nw)}. ${diff >= 0 ? `Dat's ${money(diff)} better dan last year \u2014 ya, sure, you betcha!` : `Dat's ${money(-diff)} less dan last year. Uff da.`}`,
      ],
      closing: s.contentment > 20 ? closing : 'Ve need to talk, Nels. After supper.',
      signature: s.contentment > 20 ? 'Your Ingrid' : 'Ingrid (still here, for now)',
    };
  }

  function rating(s) {
    const real = netWorth(s) / cost(s);
    const titles = [[0, 'Hired Man Again'], [5000, 'Struggling Homesteader'], [15000, 'Respectable Farmer'], [40000, 'Pillar of the Congregation'], [90000, 'Dairy Baron of the Coulees'], [200000, 'Legend of the Driftless']];
    let t = titles[0][1];
    for (const [v, n] of titles) if (real >= v) t = n;
    return { real: r0(real), title: t };
  }

  // Rebuild a state from untrusted saved data: only known keys, finite numbers, and whitelisted strings survive.
  function sanitize(raw, trusted = false) {
    if (!raw || typeof raw !== 'object' || raw.v !== 1) return null;
    const num = (v, d, lo = -1e12, hi = 1e12) => { const n = Number(v); return Number.isFinite(n) ? clamp(n, lo, hi) : d; };
    const int = (v, d, lo, hi) => Math.round(num(v, d, lo, hi));
    const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    const pick = (v, allowed, d) => (allowed.includes(v) ? v : d);
    const startYear = int(raw.startYear, 1900, 1900, 1940);
    const s = newGame({ startYear, seed: int(raw.seed, 1, 1, 2e9), locId: pick(raw.locId, DATA.locations.map(l => l.id), 'strum') });
    s.rng = int(raw.rng, s.seed, -2147483648, 2147483647);
    s.year = int(raw.year, startYear, 1900, DATA.lastYear);
    s.phase = pick(raw.phase, ['spring', 'summer', 'fall', 'winter'], 'spring');
    s.cash = num(raw.cash, s.cash);
    s.debt = num(raw.debt, s.debt, 0);
    s.land = int(raw.land, START_LAND, 40, 1e6);
    s.timber = num(raw.timber, woods(s) * 4, 0, 1e7);
    s.soil = num(raw.soil, 72, 15, 100);
    s.contentment = num(raw.contentment, 70, 0, 100);
    s.reputation = num(raw.reputation, 40, 0, 100);
    s.skill = num(raw.skill, .9, .7, 1.25);
    s.feedShortage = num(raw.feedShortage, 0, 0, 1);
    s.cows = int(raw.cows, 6, 0, 1e5); s.heifers = int(raw.heifers, 0, 0, 1e5); s.horses = int(raw.horses, 4, 0, 1e4);
    s.landOffer = int(raw.landOffer, 40, 0, 1000);
    const store = obj(raw.store);
    for (const g of Object.keys(s.store)) s.store[g] = num(store[g], 0, 0);
    const cheese = obj(raw.cheese);
    for (const id of Object.keys(DATA.cheeses)) { const c = obj(cheese[id]); s.cheese[id] = { fresh: num(c.fresh, 0, 0), aged: num(c.aged, 0, 0) }; }
    // renumber on load: older saves clamped their Date.now() ids to one shared value, so selling one sold another
    s.machines = (Array.isArray(raw.machines) ? raw.machines : []).filter(o => o && machineDef(o.id)).slice(0, 300).map((o, i) => {
      const bought = int(o.bought, s.year, 1900, DATA.lastYear);
      return { uid: i + 1, id: String(o.id), bought, built: int(o.built, bought, 1900, DATA.lastYear), used: !!o.used };
    });
    const b = obj(raw.buildings);
    s.buildings = {};
    for (const d of DATA.buildings) if (b[d.id]) s.buildings[d.id] = d.repeat ? int(b[d.id], 1, 1, 100) : true;
    s.bonds = (Array.isArray(raw.bonds) ? raw.bonds : []).slice(0, 50).map(x => ({ amount: num(obj(x).amount, 0, 0), due: int(obj(x).due, 1927, 1900, 1990), rate: num(obj(x).rate, 1, 0, 5) }));
    const f = obj(raw.flags);
    s.flags = {};
    for (const k of ['coop', 'contour', 'noRing', 'wet', 'bull']) if (f[k]) s.flags[k] = true;
    const m = obj(raw.mods), mm = freshMods();
    for (const k of ['price', 'interest', 'wages', 'machine', 'labor', 'milk', 'weather', 'norse']) mm[k] = num(m[k], mm[k], -1, 10);
    const mg = obj(m.goods), my = obj(m.yield);
    for (const g of Object.keys(DATA.goods)) if (mg[g] !== undefined) mm.goods[g] = num(mg[g], 1, 0, 10);
    for (const k of ['small', ...DATA.cropOrder]) if (my[k] !== undefined) mm.yield[k] = num(my[k], 1, 0, 10);
    s.mods = mm;
    const p = obj(raw.plan), plan = defaultPlan(), crops = obj(p.crops), milk = obj(p.milk);
    for (const c of DATA.cropOrder) plan.crops[c] = int(crops[c], plan.crops[c], 0, 1e6);
    // Saves from before 2.0: barley acres go to oats, timothy to red clover, silage corn to corn, and stored barley
    // becomes oats of the same feed weight (48 lb a bushel against 32).
    for (const [old, now] of [['barley', 'oats'], ['hay', 'clover'], ['silage', 'corn']]) plan.crops[now] += int(crops[old], 0, 0, 1e6);
    s.store.oats += s.store.barley * 48 / 32; s.store.barley = 0;
    plan.hired = int(p.hired, 0, 0, 50);
    plan.ration = pick(p.ration, ['lean', 'std', 'gen'], 'std');
    plan.keepHeifers = int(p.keepHeifers, 2, 0, 1e4);
    for (const k of ['cream', 'factory', 'home']) plan.milk[k] = int(milk[k], plan.milk[k], 0, 100);
    plan.cheese = pick(p.cheese, Object.keys(DATA.cheeses).filter(id => DATA.cheeses[id].milk === 'whole'), 'cheddar');
    plan.skim = pick(p.skim, ['calves', 'gamalost', 'pultost'], 'calves');
    plan.whey = pick(p.whey, ['calves', 'brunost'], 'calves');
    plan.thresh = pick(p.thresh, ['own', 'ring', 'custom'], 'ring');
    plan.customJobs = int(p.customJobs, 0, 0, 200);
    plan.hull = p.hull === undefined ? true : !!p.hull;
    plan.hullMethod = pick(p.hullMethod, ['own', 'custom'], 'custom');
    plan.dinner = pick(p.dinner, ['plain', 'hearty', 'legendary'], 'hearty');
    plan.minigame = p.minigame === undefined ? true : !!p.minigame;
    plan.cords = num(p.cords, plan.cords, 0, 1000);
    plan.logs = num(p.logs, plan.logs, 0, 1000);
    plan.sawMethod = pick(p.sawMethod, ['own', 'custom', 'sell'], 'custom');
    plan.woodGame = p.woodGame === undefined ? true : !!p.woodGame;
    plan.baleJobs = int(p.baleJobs, 0, 0, 200);
    plan.baleGame = p.baleGame === undefined ? true : !!p.baleGame;
    s.plan = plan;
    rotateHayCrop(s);
    s.history = (Array.isArray(raw.history) ? raw.history : []).slice(0, 120).map(h => {
      h = obj(h);
      return { year: int(h.year, startYear, 1900, DATA.lastYear), worth: num(h.worth, 0), cash: num(h.cash, 0), debt: num(h.debt, 0), land: num(h.land, 0), cows: num(h.cows, 0), soil: num(h.soil, 0) };
    });
    if (!s.history.length) s.history.push(snapshot(s));
    s.log = trusted && Array.isArray(raw.log) ? raw.log.filter(x => typeof x === 'string').slice(0, 80) : [];
    const sold = obj(obj(raw.season).cheeseSold);
    s.season = { cheeseSold: {} };
    for (const id of Object.keys(DATA.cheeses)) if (sold[id] !== undefined) s.season.cheeseSold[id] = num(sold[id], 0, 0);
    const over = obj(raw.over);
    s.over = OVER_TEXT[over.reason] ? { reason: over.reason, text: OVER_TEXT[over.reason] } : null;
    const ch = obj(raw.cheats);
    s.cheats = { unlock: !!ch.unlock, perfect: !!ch.perfect, used: !!ch.used, godMode: !!ch.godMode,
      weather: ch.weather == null ? null : num(ch.weather, null, 0, 3),
      forceEvent: DATA.randomEvents.some(e => e.head === ch.forceEvent) ? ch.forceEvent : null };
    return s;
  }

  // Headless year: used by cheats and automated testing.
  function autoYear(s, alreadyStarted = false) {
    if (!alreadyStarted) {
      const ys = yearStart(s);
      for (const e of ys.events) applyEvent(s, e, e.choices ? e.choices.length - 1 : -1);
    }
    s.plan.hired = 0;
    s.plan.hired = Math.max(0, Math.ceil(laborNeed(s) - laborAvail(s) - .3));
    commitPlan(s); summer(s); harvest(s);
    const eff = s.cheats.perfect ? 1 : .78;
    haying(s, s.cheats.perfect ? 1 : .8);
    threshing(s, eff); hulling(s, eff); dairy(s); sellSurplus(s);
    const report = winter(s);
    nextYear(s);
    return report;
  }

  const API = {
    interp, rand, noise, pI, cost, loc, spend, goodPrice, sellPrice, buyPrice, marketSeason, landPrice, cowPrice, horsePrice, bfPrice, factoryPrice,
    cheesePrice, cheeseDemand, cheeseAvailable, machinePrice, machineDef, machineValue, buildingDef, buildingPrice, buildingAvailable,
    cropland, pasture, woods, barnCap, owned, powerCap, bestPower, beltHP, bestThresher, huller, family, laborAvail, laborNeed,
    milkShares, rate, assets, netWorth, creditLimit, feedNeeds, seedNeed, keepSuggestion, newGame, defaultPlan, yearStart, applyEvent,
    trade, sellCheese, buyLand, sellLand, borrow, repay, buyAnimal, buyMachine, sellMachine, nextUid, townPop, TRAITS, traits, rubberTires, fieldAcres, fuelF, repairF, machineRepairs, build, cropAllowed, plannedAcres, wage,
    threshOptions, resolveThresh, rigFor, commitPlan, summer, harvest, hayingDue, balerRig, baleNeighbors, haying, BALES_PER_TON, TIES, threshing, hulling, dairy, sellSurplus, winter, nextYear, rating, sanitize, autoYear, snapshot, clampStats,
    timberMax, timberGrowth, lumberValue, logPrice, sawFee, bestSawmill, woodPower, woodlotInfo, woodRig, buzzPower, woodlot, buildingCost, finalYear,
    steamCordsPerDay, steamFieldCords, burnWood, START_LAND, siloTarget, SILAGE_PER_BU, rotateHayCrop,
  };
  return API;
})();
if (typeof module !== 'undefined') module.exports = Sim;

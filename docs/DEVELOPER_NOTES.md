# The Driftless Farm — Developer Notes (version 2.1)

Notes for whoever (human or AI) picks this game up next. Read this before changing anything.

## Where things live

| Folder | What it is | Rules |
|---|---|---|
| `C:\temp\Driftless_Farm` | **The 2.1 release.** Only the files the game needs, plus `docs\`. | Treat as a snapshot. Don't develop here. |
| `C:\temp\Strum.2.0-preview` | **The working copy** (2.x development): game, tests, the painted-art experiments, Gemini prompts, `README.md` change log. | Develop here, then copy the runtime files to a new release folder. |
| `C:\temp\Strum.1.0` (+ `Strum.1.0.zip`) | The approved 1.0 release. | **Never modify.** |
| `C:\temp\Strum` | The 1.0 working copy. | Leave alone. |
| `C:\temp\Strum_validation\manual21` | User-manual tooling for 2.1: `capture21.py` (screenshots), `build_manual.py` (DOCX), `sim_results_2.1.txt`. | Rebuild the manual from here. |
| `C:\temp\Strum_validation` (rest) | 1.0-era tools (harness.html, sims, old manual builder). | Reference only; the 1.0 harness points at `C:\temp\Strum`. |

## What the game is

A dependency-free, no-build browser game: a Hammurabi-style farm chronicle (1900–1970) for Nels and Ingrid Knutson in
Wisconsin's Driftless Area. Open `Strum.html` (from disk or a local HTTP server). Everything is drawn on one 960×540
canvas plus HTML panels and modals. Mini-games are canvas modals.

## Files and load order

Scripts are plain globals, loaded in this order by `Strum.html`: `DATA` → `Sim` → `ASSET_MANIFEST`/`ASSETS` → `Art` → `UI`.
Every `<script>`/`<link>` carries a cache-bust query (`?v=2.1`). **Bump it whenever you ship a change** (in `Strum.html`
and both test pages), or players keep the stale script.

| File | Role |
|---|---|
| `js/data.js` | All data. `DATA.version` (shown on the title page, browser title, Almanac), price/cost/land indexes, `locations` (8 towns: `look`, `bonus`), `crops` (wheat, oats, corn, clover → alfalfa in 1947, tobacco), `goods`, `cheeses`, `machines` (50 power units via `tr(...)`, separators, hullers, 10 balers, binders, engine, wood tools, sawmills), `buildings`, `family`, `events` (newspaper), `randomEvents`, `roadCars`. |
| `js/sim.js` | Pure simulation, **no DOM**. Year flow (`yearStart`, `commitPlan`, `summer`, `harvest`, `haying`, `threshing`, `hulling`, `dairy`, `winter`, `nextYear`), prices (`goodPrice`, `sellPrice`, `buyPrice`, `marketSeason`, `cheesePrice`, `cheeseDemand`), trading (`trade`, `sellCheese`, `sellSurplus`), machinery (`machinePrice`, `traits`, `fieldAcres`, `rigFor`, `threshOptions`, `resolveThresh`, `balerRig`), woodlot, `sanitize` (save loading), `autoYear`, `rating`. **Export new functions in the `API` object at the bottom.** |
| `js/art.js` | The Classic renderer (~6,000 lines). `Art.scene(ctx, s, t, {season, view})` → `sceneBody` picks a view, then `finish()` applies the painterly grade. Exports at the very end. |
| `js/assets.js`, `js/asset-manifest.js` | Image loader. Only the painted sky, far bluffs, and standing oats are actually used by the Classic renderer (with procedural fallbacks). |
| `js/painted.js` | The old "Painted" mode. **Not loaded by `Strum.html`** (the game is Classic-only); only `tests/painted-tests.html` uses it. |
| `js/ui.js` | Everything DOM: title page, tabs, modals, the market and dealer windows, the five mini-games, cheats, saving, Almanac, `selfTest()`. |
| `css/style.css`, `css/fonts.css`, `fonts/` | Styles; bundled OFL fonts (Old Standard TT, UnifrakturMaguntia, Patrick Hand) so the newspaper and letter look the same offline. |
| `tests/asset-tests.html`, `tests/painted-tests.html` | Regression pages (794 and 216 checks). |
| `tests/manual-frame.html` | Hosts the game in a fixed-size iframe (helper for screenshots when the browser window can't be resized). |

Runtime images actually requested by the game: `Images/painted/harvest_sky.png`, `harvest_sky_winter.png`,
`harvest_far_hills.png`, `harvest_far_hills_spring.png`, `harvest_far_hills_winter.png`,
`harvest_standing_oats_tile_native.png` (measured by watching network requests over every tab and season).
Sounds are generated in code (`tonePool` builds small WAVs); there are no audio files.

## The year (two rounds)

1. **Spring planning** (`s.phase === 'spring'`). Every tab except Woodlot is editable → *Plant & Begin the Season* (`beginSeason`).
2. Summer events → harvest (silo filled from corn first) → **Baling Day** if alfalfa and a baler (from 1947) → threshing →
   clover hulling (through 1946) → dairy year → **Fall Market** (`marketWindow()` with `s.phase === 'fall'`).
3. **Winter round** (`phase 'winter'`, `season.woodPlan = true`). Only **Woodlot** and **Market** are editable
   (`winterTab()`); saving is disabled. *Begin the Winter Work* (`beginWinter`) → buzz saw / splitting / sawmill mini-games →
   `Sim.winter` → Ingrid's letter → `nextYear` → autosave → next spring.

The panel's editability is `planEditable()`; the dimmed look is `#panel.frozen`. `act()` ignores clicks when not editable,
except `dealer` and `market`, which open their windows (the windows themselves disable buying when not allowed).

## Views (what the big canvas shows)

`ui.js` `init()` maps the open tab to a view: `machines→'shed'`, `buildings→'yard'`, `herd→'dairy'`, `market→'market'`,
`woods→'woodlot'`, `land→'bank'`, `harvest→'harvest'`, Fields → `null` (the landscape).

| View | Function (art.js) | Notes |
|---|---|---|
| Fields | `sceneBody` (bottom half) | Homestead landscape full width; farmstead only on the title preview (`!s`). Bluff kinds in `bluff()`. |
| shed | `machineYard` | `YARD_SCALE`, `yardRow`; tractors and separators parked nose-out use `tractorFront`/`separatorFront`. |
| yard (Buildings) | `yardWide` + `yardWidePlate` (cached) + `yardWideFront` | `WIDE_FRONT` = Ostehus/granary `[x, scale, ground]`; `YARD_MAN` sizes Nels/hired man to fit the granary door; `sideDepth`/`sidePane`/`rakeBand` give buildings depth. |
| dairy | `dairyBarn`, `ostehus`, `ingrid` | Calf pen sign says "Calves" (data field is still `s.heifers`). |
| market | `marketTown`, `marketTraffic`, `farmRig` | No horses/wagons in traffic after 1954. Chalkboard uses fall prices in fall and winter. |
| woodlot | `woodlotView` | Skid trail at `sy = 368`, drawn before the big trunks so the foreground covers it. |
| bank | `bankView` | Per-town plat maps. |
| harvest | `harvestView` | Tracking view; `groundFill`/`meadow` take a `dx` scroll offset (mod 768). |

## People and animals (keep them consistent)

- `pedestrian(ctx, x, y, sc, t, kind, color, hat, dir, walking, o)`: the full figure (two-part legs, elbows, blinking eye).
  Options: `o.overalls`, `o.straw`, `o.reach` (IK arm to a point), `o.glove`.
- `person(ctx, x, y, color, hat)`: the small front-facing farmhand (≈31 units tall) used on tractor seats, behind teams,
  in the woods, and in mini-games. In 2.1 it wears bib overalls; a light hat color (`lum > 150`) draws a straw hat.
- **Identity colors:** Nels = shirt `#a5493c`, straw hat `#d9c07a`. Hired man = shirt `#6d8fb4`, hat `#cdb06a`. Use these
  everywhere Nels or the hired man appears. Townspeople and bank visitors keep their own colors.
- `sawyer(...)` is Nels at the sawmill lever (overalls, straw hat, glove, elbow IK).
- `cowFlat`/`cowFront` blink (`blinkAt`) and swish (`swishAt`); `horseFlat` grazes with the neck attached to the rotated head.
- `lit()` renders small figures through a shared offscreen canvas for lighting; tiny figures (area < 4600) draw directly.

## Mini-games (ui.js)

All five share `miniFrames` (≤60 draws/s, pauses when hidden, cleanup on close) and are rendered at `GAME_RES = 2`
(backing store 2× the logical 760×330; `ctx.setTransform(2,0,0,2,0,0)` each frame; `fitGame` makes them full width).
Pre-rendered backgrounds come from `canvasLayer(w, h, paint)` and **must** be drawn with `drawLayer` (they carry `.lw/.lh`).
Mouse mapping divides by `rect.width` against the logical width, so it is unaffected by `GAME_RES`.

| Game | Function | Result range | Crew default |
|---|---|---|---|
| Threshing / hulling | `threshDay` → `minigame(rig)` | 50–100% | 78% |
| Baling Day | `balingDay` → `balingGame(rig)` | 50–100% | 80% |
| Buzz saw | `woodDay('buzz')` → `buzzGame` | 90–110% | 100% |
| Splitting | `woodDay('split')` → `splitGame` | 85–115% | 100% |
| Sawmill | `woodDay('saw')` → `sawGame` | 85–112% | 100% |

Baling: the pickup's ground track is `track(l) = laneY(l) + 4 + 2·depth(l)`; the windrow, holes, lying bales, and mouse
steering (`-5.5` px) are all centered on it. **Lesson:** in 2.0 the windrow was drawn on `laneY` while the pickup sat ~5–7 px
lower, so steering "onto" the drawn hay missed most of it. If you move the outfit's drawing, keep `track()` in step.
The game exposes `data-phase`, `data-lane`, `data-row` on its wrapper for automated tests.

## Markets and prices

- `marketSeason(s)` → `'fall'` for the fall and winter phases, else `'spring'`. **Every** trade price (Sim.trade, the Market
  tab, the market window, the Fields Price column, the market chalkboard) goes through it. Fall/winter prices are 8% lower.
  Winter deliberately uses fall prices: with spring prices in winter, buy-in-fall / sell-in-winter was a risk-free 0.6%.
- Buying costs 8% over market (`buyPrice`), Trempealeau gets `bonus.sell`/`bonus.buy`.
- Cheese: `cheesePrice` per lb; sales beyond `cheeseDemand` fetch 55%. Market tab shows fresh and aged rows with $/lb.
- One market window, `marketWindow()`, titled `${Season} Market — year` from `s.phase`. The Fall Market opens automatically
  after the dairy year; the Market tab's green button (`data-act="market"`) opens it in spring and winter.

## Save compatibility (do not break)

- Storage keys: `nels-driftless-save-v1` (autosave), `nels-driftless-slots-v1` (six slots), `strumLogSize`.
  `driftless-graphics-v2` is a leftover preference from the Painted experiment.
- Schema stays `v: 1`. **Never rename data fields**, even when the UI wording changes: `s.heifers` is shown as "Calves",
  `plan.keepHeifers`, `plan.baleGame`, `plan.minigame`, `plan.woodGame`, etc. Add new fields with defaults in `defaultPlan`
  **and** in `sanitize` (which clamps and defaults every field of a loaded save).
- Retired crops (barley, timothy hay, silage corn) stay in the plan and store at zero so a 2.x save still opens in 1.0.
- Pre-2.0 saves are migrated in `sanitize` (barley→oats, timothy→clover, silage corn→corn). `UI.selfTest()` checks it.

## Validation (run all of these before calling something done)

1. Start the local server: `files\serve.ps1` from the agent session folder, or any static server serving the game folder
   on `http://127.0.0.1:8731/`. (The session server also accepts `POST /shots/*.png` to save canvas captures.)
2. In a page with the game loaded: `UI.selfTest()` → must start with `PASS`. It simulates many games and checks saves,
   migrations, hay/baler rules, etc.
3. `tests/asset-tests.html` → `"result": "PASS", "checks": 794`.
4. `tests/painted-tests.html` → `"result": "PASS", "checks": 216`. (Its console shows two intentional errors:
   "test drawing failure" and a missing `p_f20_tire` — the test injects them.)
5. Look at the pictures. Render the changed view in all four seasons and an early and late year, and view the PNGs.
   Most real bugs in this project were visual (overlaps, wrong sizes, things behind the wrong layer).
6. For gameplay or market changes, run long autoplays (`Sim.autoYear`) across all 8 towns and several start years and
   check for NaN, negative stores, and price ordering (buy > sell, fall < spring).

## The user manual

- `docs/The_Driftless_Farm_User_Manual.docx` is **generated**. Don't hand-edit it.
- Rebuild: start the server, then in `C:\temp\Strum_validation\manual21`:
  `py capture21.py` (all screenshots, ~5 minutes; or name sections: `title tabs machinery almanac season thresh baling wood endgame tiles lineup`)
  then `py build_manual.py C:\temp\Strum.2.0-preview` (writes `docs\…docx` in that game folder).
- `capture21.py` drives the real game in headless Edge through Python Playwright (`py -m pip install --user playwright`;
  it uses the installed Edge via `channel="msedge"`, no browser download). Each section uses a fresh browser context, so
  no real saves are touched. Scene tiles are drawn straight from `Art.scene` into PNGs.
- To check layout, convert to PDF with Word COM (`Documents.Open` → `SaveAs2(path, 17)`) and render pages with PyMuPDF (`fitz`).
- Strategy numbers in the manual come from `sim_results_2.1.txt` (440 automated chronicles). Re-run if the economy changes.

## Making a release folder

Copy only what the game loads: `Strum.html`, `js/{data,sim,asset-manifest,assets,art,ui}.js`, `css/{style,fonts}.css`,
`fonts/*`, the six `Images/painted/` files listed above, and `docs/` (manual + these notes), plus a short player README.
Then run `C:\temp\Strum_validation\manual21\release_check.py` with a static server for `C:\temp` on port 8732: it plays a
year over HTTP and from `file://`, lists every file requested (must all exist), runs `selfTest`, and loads a save written by
1.0 (`C:\temp\Strum.1.0`) into the release. Saves live in browser storage per origin, so a game opened from a different
folder or address starts without the old saves — tell players to use Export/Load.

## Lessons learned (the hard way)

**Process**
- The user reviews by screenshot and cares about period accuracy, consistent sizes, and readable pictures. Verify every
  visual change with a rendered image before reporting. Ask before changing gameplay rules (e.g. winter market prices).
- Keep `README.md` in the working copy as the change log: one bullet per user-visible change.
- Update the in-game Almanac (`help()` in ui.js) whenever rules change; the manual and Almanac must agree.

**PowerShell and files**
- Files are CRLF, UTF-8 **without BOM**. After a PowerShell rewrite, normalize: read, `-replace "`r`n","`n"`, edit, write back
  with `"`n" → "`r`n"` and `New-Object Text.UTF8Encoding $false`.
- String `.Replace()` on a CRLF file with an LF pattern silently does nothing. Check the replacement count.
- Double-quoted here-strings eat backticks (template literals) and `$`. Use single-quoted `@'…'@` for JS or Python.
- Splicing text with `Substring` can drop a newline at the seam (it joined `})` and `function …` onto one line twice).
  Re-parse after big edits (`node --check` isn't available; for Python use `ast.parse`; for JS load the page and run `selfTest`).
- The `view`/`grep` tools can show stale content right after a PowerShell write. Confirm with `Select-String`.

**Browser automation**
- The embedded browser's window is fixed (~903×530); `setViewportSize` doesn't change the layout. Use the CDP
  `Emulation.setDeviceMetricsOverride`, or headless Edge via Python Playwright with a real viewport.
- `page.screenshot()` in the embedded browser can return stale frames; capture canvases with `toBlob` instead.
- Mini-games need a visible tab (they pause when hidden). In headless runs that's fine.
- Playwright `evaluate` calls a function expression immediately; wrap setup code in `() => { … }`.

**Rendering**
- `Art.finish()` resets the transform and covers the whole canvas; call it last.
- Cached plates (`cached(key, …)`) must include every input in the key (season, buildings owned, start year…), or old
  pictures stick.
- Draw order is depth: anything that should pass "behind the trees" must be drawn before the trunks (woodlot skid trail).
- Sizes are relative to people: a man ≈ 31 units in `person`, ≈ 38 in `pedestrian`. Size buildings, doors, and machines
  against the people standing next to them (the Buildings tab men must fit the granary door).
- Mirroring with `ctx.scale(-1, 1)` mirrors text too; `decal()` un-mirrors lettering.

**Simulation and history**
- Check that data, events, and the Almanac agree: the 1915 "Grimm alfalfa" headline used to say "Alfalfa is now available"
  while alfalfa only arrives in 1947 (fixed in 2.1 to news only).
- Hide options that can never happen in the current chronicle (alfalfa in a game that ends in 1941).
- Horses and wagons leave the market road after 1954 (Wisconsin draft horses fell from ~700,000 in 1920 to ~100,000 by 1954).

## Ideas for later

- Hay baling could add a stacking mini-game again only if it plays well; the user removed the first one.
- The Painted mode files (`js/painted.js`, `Images/painted/*`, Gemini prompts) are kept in the working copy for reference
  but are not part of the release.

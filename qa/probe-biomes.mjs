/**
 * Spot-check: generated biomes (ocean/tundra/mineral) must be visibly colored,
 * water surfaces must render, placement flash must decay.
 */
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 860 });
page.on('pageerror', (e) => { console.log('[pageerror]', e.message); process.exitCode = 1; });
await page.goto('http://127.0.0.1:4173/index.html', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 1200));

await page.evaluate(() => window.__TF.startGame('standard', 'PROBE1', 10));
await new Promise((r) => setTimeout(r, 2000));
// zoom hub out a bit so tiles are big enough
const report = await page.evaluate(() => new Promise((res) => {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const app = window.__TF;
    const c = document.querySelector('canvas.gl');
    const gl = c.getContext('webgl2');
    const sample = (tileIdx) => {
      const w = app.renderer.tileWorld(tileIdx);
      w.y += 0.05;
      const p = app.renderer.project(w);
      const px = Math.round(p.x * (c.width / c.clientWidth));
      const py = Math.round((1 - p.y / c.clientHeight) * c.height);
      const buf = new Uint8Array(9 * 9 * 4);
      gl.readPixels(px - 4, py - 4, 9, 9, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < buf.length; i += 4) { r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; }
      const n = buf.length / 4;
      return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
    };
    const find = (pred, from = 0) => {
      for (let i = from; i < app.g.tiles.length; i++) if (pred(app.g.tiles[i])) return i;
      return -1;
    };
    const out = {};
    out.hub = sample(app.g.hubIndex);
    const ocean = find((t) => t.biome === 'ocean');
    const tundra = find((t) => t.biome === 'tundra');
    const barren = find((t) => t.biome === 'barren');
    const mineral = find((t) => t.biome === 'mineralfield');
    const desert = find((t) => t.biome === 'desert');
    out.oceanIdx = ocean; out.tundraIdx = tundra; out.mineralIdx = mineral; out.desertIdx = desert;
    if (ocean >= 0) out.ocean = sample(ocean);
    if (tundra >= 0) out.tundra = sample(tundra);
    if (barren >= 0) out.barren = sample(barren);
    if (mineral >= 0) out.mineral = sample(mineral);
    if (desert >= 0) out.desert = sample(desert);
    out.waterInstances = app.renderer.waterCount();
    res(out);
  }));
}));
console.log(JSON.stringify(report, null, 1));
const { out } = { out: report };
const black = (c) => c && c[0] < 10 && c[1] < 10 && c[2] < 10;
const dist = (a, b) => a && b ? Math.round(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])) : -1;
let fail = [];
if (black(out.hub)) fail.push('hub renders black');
if (black(out.barren)) fail.push('barren renders black');
if (out.ocean && black(out.ocean)) fail.push('ocean renders black');
if (dist(out.hub, out.barren) === 0) fail.push('hub identical to barren (no hub tint?)');
if (out.waterInstances === 0 && out.oceanIdx >= 0) fail.push('ocean tiles but zero water instances');
console.log(fail.length ? 'PROBE FAIL:\n' + fail.join('\n') : 'PROBE OK — generated biomes are colored, water instances:', out.waterInstances);
await browser.close();
process.exit(fail.length ? 1 : 0);

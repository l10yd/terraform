/**
 * Headless QA smoke test:
 *  - boots the built game in Chrome (SwiftShader WebGL)
 *  - fails on any console error / page exception
 *  - plays a few turns through the real input path
 *  - captures screenshots for visual review
 * Usage: node --import ./qa/serve.mjs qa/smoke.mjs  (or: npm run qa)
 */
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL_BASE = process.env.QA_URL ?? 'http://127.0.0.1:4173';

const shot = (n) => `qa/shots/${n}.png`;
fs.mkdirSync('qa/shots', { recursive: true });

const errors = [];
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: [
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--window-size=1440,860',
    '--no-sandbox',
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 860, deviceScaleFactor: 1 });
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console.error: ' + m.text().slice(0, 500));
  if (m.type() === 'warning' && /WebGL|shader|program not valid/i.test(m.text())) errors.push('warn: ' + m.text().slice(0, 500));
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));

const step = async (name, fn, waitMs = 700) => {
  try {
    await fn();
  } catch (e) {
    errors.push(`step ${name} threw: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, waitMs));
};

await step('load', async () => {
  await page.goto(URL_BASE + '/index.html', { waitUntil: 'networkidle0', timeout: 30000 });
}, 1500);
await page.screenshot({ path: shot('01-menu') });

await step('start game', async () => {
  await page.evaluate(() => {
    const app = window.__TF;
    app.startGame('standard', 'QA01', 10);
  });
}, 1800);
await page.screenshot({ path: shot('02-game') });

await step('select biome + hover preview', async () => {
  await page.evaluate(async () => {
    const app = window.__TF;
    app.selectAction({ kind: 'biome', id: 'grassland' });
    const i = app.valid[0];
    app.onTileHover(i);
  });
}, 400);
await page.screenshot({ path: shot('03-preview') });

await step('place 6 tiles', async () => {
  await page.evaluate(async () => {
    const app = window.__TF;
    const seq = ['grassland', 'forest', 'grassland', 'forest', 'wetland', 'river'];
    for (const b of seq) {
      const biome = b === 'river' ? undefined : b;
      app.selectAction(biome ? { kind: 'biome', id: biome } : { kind: 'biome', id: 'river' });
      const i = app.valid[Math.floor(Math.random() * Math.min(8, app.valid.length))];
      if (i !== undefined) app.onTileClick(i);
      await new Promise((r) => setTimeout(r, 120));
    }
  });
}, 1500);
await page.screenshot({ path: shot('04-placed') });

await step('wait cycles', async () => {
  await page.evaluate(async () => {
    const app = window.__TF;
    for (let k = 0; k < 12; k++) {
      app.doWait(true);
      await new Promise((r) => setTimeout(r, 60));
    }
  });
}, 1200);
await page.screenshot({ path: shot('05-cycles') });

await step('placed biomes grow, not wither', async () => {
  const planted = await page.evaluate(() => {
    const app = window.__TF;
    const out = [];
    app.g.tiles.forEach((t, i) => {
      if (['grassland', 'forest', 'wetland', 'tundra'].includes(t.biome)) {
        out.push({ biome: t.biome, dev: +t.dev.toFixed(2), suit: +t.suit.toFixed(2) });
      }
    });
    return out;
  });
  console.log('placed biome tiles after ~18 cycles:', JSON.stringify(planted.slice(0, 10)));
  const crops = planted.filter((x) => x.biome === 'grassland' || x.biome === 'forest');
  if (crops.length === 0) errors.push('no grassland/forest survived 18 cycles — placement impact is broken');
  else if (Math.max(...crops.map((x) => x.dev)) < 0.85) errors.push(`placed biomes did not develop (max dev ${Math.max(...crops.map((x) => x.dev))})`);
});

await step('real mouse click → raycast pick → placement', async () => {
  const probe = (tile) => page.evaluate((t) => new Promise((res) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const app = window.__TF;
      const w = app.renderer.tileWorld(t);
      w.y += 0.05;
      const p = app.renderer.project(w);
      const c = document.querySelector('canvas.gl');
      const gl = c.getContext('webgl2');
      const px = Math.round(p.x * (c.width / c.clientWidth));
      const py = Math.round((1 - p.y / c.clientHeight) * c.height);
      const buf = new Uint8Array(17 * 17 * 4);
      gl.readPixels(px - 8, py - 8, 17, 17, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < buf.length; i += 4) { r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; }
      const n = buf.length / 4;
      res({ r: r / n, g: g / n, b: b / n });
    }));
  }), tile);
  const pick = await page.evaluate(() => {
    const app = window.__TF;
    app.selectAction({ kind: 'biome', id: 'grassland' });
    const i = app.valid[Math.min(2, app.valid.length - 1)];
    const w = app.renderer.tileWorld(i);
    w.y += 0.3;
    const p = app.renderer.project(w);
    return { x: p.x, y: p.y, tile: i, before: app.g.tiles[i].biome, cycle: app.g.cycle };
  });
  const colBefore = await probe(pick.tile);
  await page.mouse.move(pick.x, pick.y);
  await new Promise((r) => setTimeout(r, 150));
  await page.mouse.click(pick.x, pick.y);
  await new Promise((r) => setTimeout(r, 900));
  const colAfter = await probe(pick.tile);
  const after = await page.evaluate((i, wasBiome, wasCycle) => {
    const app = window.__TF;
    return { biome: app.g.tiles[i].biome, cycle: app.g.cycle, ok: app.g.tiles[i].biome !== wasBiome && app.g.cycle > wasCycle };
  }, pick.tile, pick.before, pick.cycle);
  if (!after.ok) errors.push(`canvas click did not place tile: before=${pick.before} after=${after.biome} cycle ${pick.cycle}→${after.cycle}`);
  else console.log(`canvas click placed: ${pick.before} → ${after.biome}`);
  const dist = Math.hypot(colAfter.r - colBefore.r, colAfter.g - colBefore.g, colAfter.b - colBefore.b);
  console.log(`tile pixel color before=${colBefore.r.toFixed(0)},${colBefore.g.toFixed(0)},${colBefore.b.toFixed(0)} after=${colAfter.r.toFixed(0)},${colAfter.g.toFixed(0)},${colAfter.b.toFixed(0)} dist=${dist.toFixed(1)}`);
  if (dist < 12) errors.push(`placed tile did not change visual color (dist ${dist.toFixed(1)}) — top-face/texture bug?`);
  if (colBefore.r < 8 && colBefore.g < 8 && colBefore.b < 8) errors.push('tiles render black (culled top faces?)');
}, 400);
await page.screenshot({ path: shot('05-click') });

await step('tech modal', async () => {
  await page.evaluate(() => {
    const app = window.__TF;
    app.updateSettings({ debug: true });
    app.modals.showTech(app.g);
  });
}, 500);
await page.screenshot({ path: shot('06-tech') });
await page.evaluate(() => window.__TF.modals.close());

await step('event modal (forced)', async () => {
  await page.evaluate(() => {
    const app = window.__TF;
    app.g.pendingChoice = { eventId: 'meteor', cycle: app.g.cycle, options: [] };
    app.modals.showEvent(app.g);
  });
}, 400);
await page.screenshot({ path: shot('07-event') });
await page.evaluate(() => {
  const app = window.__TF;
  app.modals.close();
  app.g.pendingChoice = null;
});

await step('report overlay (forced)', async () => {
  await page.evaluate(() => {
    const app = window.__TF;
    app.g.end = { type: 'victory', cycle: app.g.cycle, score: 8421, grade: 'A' };
    app.onGameEnd();
  });
}, 2000);
await page.screenshot({ path: shot('08-report') });
await page.evaluate(() => {
  const app = window.__TF;
  app.report.close();
  app.g.end = null;
  app.hud.show(true);
});

await step('language switch', async () => {
  await page.evaluate(() => window.__TF.setLang('ru'));
}, 800);
await page.screenshot({ path: shot('09-ru') });
await page.evaluate(() => window.__TF.setLang('en'));

await step('fps sample', async () => {
  await page.evaluate(() => new Promise((res) => setTimeout(res, 1800)));
}, 100);
const fps = await page.evaluate(() => window.__TF.renderer.stats);
console.log('renderer stats:', JSON.stringify(fps));
if (fps.fps < 8) errors.push(`headless fps too low: ${fps.fps}`);

// pixel sanity: is the planet actually drawn (not a black screen)?
const px = await page.evaluate(() => new Promise((res) => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const c = document.querySelector('canvas.gl');
      const gl = c.getContext('webgl2');
      const w = 420, h = 260;
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(Math.floor((c.width - w) / 2), Math.floor((c.height - h) / 2), w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let lit = 0; let sum = 0;
      for (let i = 0; i < buf.length; i += 4) {
        const v = buf[i] + buf[i + 1] + buf[i + 2];
        if (v > 60) lit++;
        sum += v;
      }
      res({ litPct: +(lit / (w * h) * 100).toFixed(1), avg: +(sum / (w * h)).toFixed(1) });
    });
  });
}));
console.log('pixel probe:', JSON.stringify(px));
if (px.litPct < 5) errors.push(`screen nearly black: lit ${px.litPct}%`);

await browser.close();

if (errors.length) {
  console.log('\n=== QA FAILURES ===');
  for (const e of errors) console.log(' - ' + e);
  process.exit(1);
}
console.log('\nQA OK: no console errors, all steps passed');

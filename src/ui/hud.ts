/**
 * In-game HUD: topbar, left inspector, right planetary panel, bottom tray.
 * Pure view: app calls render() with latest state + view info.
 */
import { el, attachTip, fmt, signed } from './dom';
import { t, getLang } from '../i18n';
import {
  BIOMES, STRUCTURES, RES_IDS, getObjectiveLite, neighborsIdx,
} from '../sim/ui-facade';
import type { BiomeId, StructureId } from '../sim/ui-facade';
import type { Derived } from '../sim/adjacency';
import type { GameState } from '../sim/types';
import type { Preview } from '../sim/actions';

export type TraySel = { kind: 'biome'; id: BiomeId } | { kind: 'struct'; id: StructureId } | null;

export interface HudHooks {
  onSelectAction(sel: TraySel): void;
  onWait(): void;
  onOpenTech(): void;
  onOpenHelp(): void;
  onOpenSettings(): void;
  onMenu(): void;
  onToggleLang(): void;
  onToggleMute(): void;
  onToggleLog(): void;
}

export interface RenderInfo {
  g: GameState;
  derived: Derived;
  sel: TraySel;
  preview: Preview | null;
  previewTile: number | null;
  inspectTile: number | null;
  muted: boolean;
}

const RES_ICON: Record<string, string> = { water: '💧', minerals: '⛏', energy: '⚡', biomass: '🌿', research: '🔬' };

const PVAR_DEFS = [
  { key: 'temp', icon: '🌡', nm: 'pv.temp', tip: 'pv.tempTip', max: 60, min: -80, unit: '°C', fmt: (v: number) => `${Math.round(v)}°` },
  { key: 'water', icon: '💧', nm: 'pv.water', tip: 'pv.waterTip', max: 100, fmt: (v: number) => `${Math.round(v)}` },
  { key: 'oxygen', icon: '🫧', nm: 'pv.oxygen', tip: 'pv.oxygenTip', max: 100, fmt: (v: number) => `${v.toFixed(1)}%` },
  { key: 'humidity', icon: '💦', nm: 'pv.humidity', tip: 'pv.humidityTip', max: 100, fmt: (v: number) => `${Math.round(v)}` },
  { key: 'bio', icon: '🌱', nm: 'pv.bio', tip: 'pv.bioTip', max: 100, fmt: (v: number) => `${Math.round(v)}` },
  { key: 'pressure', icon: '🌬', nm: 'pv.pressure', tip: 'pv.pressureTip', max: 100, fmt: (v: number) => `${Math.round(v)}` },
  { key: 'fert', icon: '🌾', nm: 'pv.fert', tip: 'pv.fertTip', max: 100, fmt: (v: number) => `${Math.round(v)}` },
  { key: 'pollution', icon: '🏭', nm: 'pv.pollution', tip: 'pv.pollutionTip', max: 100, invert: true, fmt: (v: number) => `${Math.round(v)}` },
] as const;

export class Hud {
  root: HTMLElement;
  private topbar: HTMLElement;
  private planetName: HTMLElement;
  private planetSub: HTMLElement;
  private cycleN: HTMLElement;
  private phasePill: HTMLElement;
  private stabFill: HTMLElement;
  private stabVal: HTMLElement;
  private left: HTMLElement;
  private right: HTMLElement;
  private bottom: HTMLElement;
  private resbar: HTMLElement;
  private trayItems: HTMLElement;
  private logPanel: HTMLElement;
  private logItems: HTMLElement;
  private hint: HTMLElement;
  private toasts: HTMLElement;
  floats: HTMLElement;
  private flash: HTMLElement;
  private langBtn: HTMLButtonElement;
  private muteBtn: HTMLButtonElement;
  private pTitle!: HTMLElement;
  private objTitle!: HTMLElement;
  private logTitle!: HTMLElement;
  private trayTitle!: HTMLElement;
  private waitBtn!: HTMLButtonElement;
  private logVisible = false;
  private hooks: HudHooks;
  private projector: ((i: number) => { x: number; y: number; visible: boolean } | null) | null = null;
  private lastNet: Record<string, number> = {};

  constructor(app: HTMLElement, hooks: HudHooks) {
    this.hooks = hooks;
    this.root = el('div', { cls: 'hud', parent: app });

    // ---- top ----
    this.topbar = el('div', { cls: 'topbar panel', parent: this.root });
    const pid = el('div', { cls: 'planet-id', parent: this.topbar });
    this.planetName = el('div', { cls: 'planet-name', text: '—', parent: pid });
    this.planetSub = el('div', { cls: 'planet-sub', text: '—', parent: pid });
    const cyc = el('div', { cls: 'cycle-chip', parent: this.topbar });
    this.cycleN = el('div', { cls: 'n', text: '1', parent: cyc });
    el('div', { cls: 'l', parent: cyc, text: 'CYCLE' });
    this.phasePill = el('div', { cls: 'phase-pill', parent: this.topbar, text: '' });
    const stab = el('div', { cls: 'stab-wrap', parent: this.topbar });
    const stabTop = el('div', { cls: 'lab', parent: stab });
    el('span', { text: 'STABILITY', parent: stabTop });
    this.stabVal = el('span', { cls: 'val', parent: stabTop, text: '0' });
    const g1 = el('div', { cls: 'gauge', parent: stab });
    this.stabFill = el('div', { parent: g1, style: { width: '0%' } });
    el('div', { cls: 'grow', parent: this.topbar });
    const logBtn = el('button', { cls: 'icon-btn', parent: this.topbar, text: '📡', title: 'Signals log' });
    logBtn.addEventListener('click', () => this.toggleLog());
    this.muteBtn = el('button', { cls: 'icon-btn', parent: this.topbar, text: '♪', onClick: () => this.hooks.onToggleMute() }) as HTMLButtonElement;
    el('button', { cls: 'icon-btn', parent: this.topbar, text: '?', title: 'Help', onClick: () => this.hooks.onOpenHelp() });
    const techBtn = el('button', { cls: 'icon-btn', parent: this.topbar, text: '⚗', title: 'Technology' });
    techBtn.addEventListener('click', () => this.hooks.onOpenTech());
    this.langBtn = el('button', {
      cls: 'icon-btn', parent: this.topbar, text: 'RU',
      onClick: () => this.hooks.onToggleLang(), title: 'Language',
    }) as HTMLButtonElement;
    el('button', { cls: 'icon-btn', parent: this.topbar, text: '⚙', onClick: () => this.hooks.onOpenSettings() });
    el('button', { cls: 'icon-btn', parent: this.topbar, text: '≡', onClick: () => this.hooks.onMenu() });

    // ---- left inspector ----
    this.left = el('div', { cls: 'left', parent: this.root });
    const insp = el('div', { cls: 'panel inspector', parent: this.left });
    insp.dataset.role = 'inspector';
    // ---- right panel ----
    this.right = el('div', { cls: 'right', parent: this.root });
    const ppanel = el('div', { cls: 'panel', parent: this.right });
    this.pTitle = el('div', { cls: 'panel-title', parent: ppanel, text: t('hud.planetReport') });
    const pvars = el('div', { cls: 'pvars', parent: ppanel });
    pvars.dataset.role = 'pvars';
    const opanel = el('div', { cls: 'panel', parent: this.right });
    this.objTitle = el('div', { cls: 'panel-title', parent: opanel, text: t('hud.objectives') });
    const obj = el('div', { cls: 'obj', parent: opanel });
    obj.dataset.role = 'objectives';

    // log
    this.logPanel = el('div', { cls: 'log panel', parent: this.left, style: { display: 'none' } });
    this.logTitle = el('div', { cls: 'panel-title', parent: this.logPanel, text: t('hud.log') });
    this.logItems = el('div', { cls: 'log-items', parent: this.logPanel });

    // ---- bottom ----
    this.bottom = el('div', { cls: 'bottom', parent: this.root });
    const tray = el('div', { cls: 'tray panel' });
    this.trayTitle = el('div', { cls: 'panel-title', parent: tray, text: t('tray.title') });
    this.trayItems = el('div', { cls: 'tray-items', parent: tray });
    this.bottom.appendChild(tray);
    this.resbar = el('div', { cls: 'resbar panel', parent: this.bottom });
    const waitWrap = el('div', { parent: this.bottom, style: { display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'stretch' } });
    this.waitBtn = el('button', { cls: 'btn', parent: waitWrap, text: '⏭ ' + t('hud.wait') });
    this.waitBtn.addEventListener('click', () => this.hooks.onWait());
    attachTip(this.waitBtn, () => t('hud.waitHint'));
    this.hint = el('div', { cls: 'hint-line', parent: this.root, text: t('tray.place'), style: { display: 'none' } });

    // overlays
    this.toasts = el('div', { cls: 'toasts', parent: this.root });
    this.root.appendChild((() => { const n = el('div'); n.id = 'floats'; return n; })());
    this.floats = document.getElementById('floats')!;
    this.flash = el('div', { cls: 'screen-flash', parent: app });
  }

  setProjector(fn: (i: number) => { x: number; y: number; visible: boolean } | null): void {
    this.projector = fn;
  }

  /** relabel static panel titles after a language switch */
  refreshStatic(): void {
    this.pTitle.textContent = t('hud.planetReport');
    this.objTitle.textContent = t('hud.objectives');
    this.logTitle.textContent = t('hud.log');
    this.trayTitle.textContent = t('tray.title');
    this.waitBtn.textContent = '⏭ ' + t('hud.wait');
  }

  show(show: boolean): void {
    this.root.style.display = show ? '' : 'none';
  }

  // -------------------------------------------------------------------------
  render(info: RenderInfo): void {
    const { g, derived } = info;
    this.gRef = g;
    const p = g.planet;
    // top
    this.planetName.textContent = g.planetName.toUpperCase();
    this.planetSub.textContent = `${g.seed} · ${g.mode === 'daily' ? '★' : g.mode.toUpperCase()}`;
    this.cycleN.textContent = String(g.cycle);
    this.phasePill.textContent = `${t('hud.phase')} ${g.phase} · ${t(`phase.${g.phase}`)}`;
    this.cycleN.parentElement!.querySelector('.l')!.textContent = t('hud.cycle');
    this.stabVal.textContent = Math.round(p.stability) + '%';
    this.stabFill.style.width = `${Math.round(p.stability)}%`;
    this.stabFill.style.background = p.stability > 60 ? 'linear-gradient(90deg,#3fae7a,#5fd98f)' : p.stability > 35 ? 'linear-gradient(90deg,#b8814a,#ffb45e)' : 'linear-gradient(90deg,#a04a44,#ff7a6b)';
    this.langBtn.textContent = getLang() === 'ru' ? 'EN' : 'RU';
    this.muteBtn.classList.toggle('active', !info.muted);

    // resources
    this.renderRes(derived);
    // planetary vars
    this.renderPVars(derived);
    // inspector
    this.renderInspector(info);
    // tray
    this.renderTray(info);
    // objectives
    this.renderObjectives(g);
    // log
    this.renderLog(g);
    // hint
    this.hint.style.display = info.sel ? '' : '';
    this.hint.textContent = info.sel
      ? `${(info.sel.kind === 'biome' ? BIOMES[info.sel.id] : STRUCTURES[info.sel.id]).icon} ${info.sel.kind === 'biome' ? t(BIOMES[info.sel.id].descKey) : t(STRUCTURES[info.sel.id].descKey)} — ${t('tray.place')} · ${t('tray.escHint')}`
      : t('hud.turnHint');
    // panel titles react to language
    const titles = this.root.querySelectorAll('.panel-title');
    void titles;
  }

  private renderRes(derived: Derived): void {
    this.resbar.innerHTML = '';
    const st = this.gRef!;
    for (const k of RES_IDS) {
      const row = el('div', { cls: 'resrow', parent: this.resbar });
      el('span', { cls: 'ic', text: RES_ICON[k], parent: row });
      const amt = el('span', { cls: 'amt', parent: row });
      amt.textContent = fmt(Math.floor(st.res[k]));
      const netv = derived.totals.prod[k] - derived.totals.use[k];
      el('span', { cls: 'net' + (netv >= 0 ? ' pos' : ' neg'), text: `${signed(netv, 1)}/c`, parent: row });
      this.lastNet[k] = netv;
      attachTip(row, () => `<b>${t(`res.${k}`)}</b><br>${t('res.net')}: ${signed(derived.totals.prod[k] - derived.totals.use[k], 2)}`);
    }
  }

  private renderPVars(derived: Derived): void {
    const holder = this.root.querySelector('[data-role="pvars"]') as HTMLElement;
    holder.innerHTML = '';
    const p = this.gRef!.planet;
    const prev = this.prevP;
    this.prevP = { ...p };
    void derived;
    for (const v of PVAR_DEFS) {
      const val = (p as unknown as Record<string, number>)[v.key];
      const d = prev ? val - ((prev as unknown as Record<string, number>)[v.key] ?? val) : 0;
      const row = el('div', { cls: 'pvar', parent: holder });
      const top = el('div', { cls: 'top', parent: row });
      const nm = el('span', { cls: 'nm', parent: top });
      el('span', { text: v.icon, parent: nm });
      el('span', { text: t(v.nm), parent: nm });
      const rt = el('span', { parent: top });
      el('span', { cls: 'vl', text: v.fmt(val), parent: rt });
      if (Math.abs(d) > 0.001) {
        const dirUp = d > 0;
        const beneficial = 'invert' in v ? !dirUp : dirUp;
        el('span', { cls: 'dl ' + (beneficial ? 'pos' : 'neg'), text: (dirUp ? '▲' : '▼') + Math.abs(d).toFixed(2).replace(/0$/, ''), parent: rt });
      }
      const bar = el('div', { cls: 'gauge', parent: row });
      const min = 'min' in v ? (v.min as number) : 0;
      const pct = Math.max(0, Math.min(100, ((val - min) / ((v as { max: number }).max - min)) * 100));
      const fill = el('div', { parent: bar, style: { width: `${pct}%` } });
      const good = 'invert' in v ? val < 30 : true;
      fill.style.background = good
        ? (pct > 55 ? 'linear-gradient(90deg,#3fae7a,#5fd98f)' : 'linear-gradient(90deg,#2e6f9a,#6ec8ff)')
        : pct > 55 ? 'linear-gradient(90deg,#a04a44,#ff7a6b)' : 'linear-gradient(90deg,#b8814a,#ffb45e)';
      attachTip(row, () => `<b>${t(v.nm)}</b><br>${t(v.tip)}`);
    }
  }

  private prevP: GameState['planet'] | null = null;

  private gRef: GameState | null = null;

  private renderInspector(info: RenderInfo): void {
    const insp = this.root.querySelector('[data-role="inspector"]') as HTMLElement;
    insp.innerHTML = '';
    const { g, derived, sel, preview } = info;
    const ti = info.inspectTile;

    el('div', { cls: 'panel-title', parent: insp, text: t('tile.info') });
    if (ti === null || ti === undefined) {
      el('div', { cls: 'insp-desc', parent: insp, text: t('tile.none') });
    } else {
      const t0 = g.tiles[ti];
      const bdef = BIOMES[t0.biome];
      const head = el('div', { cls: 'insp-head', parent: insp });
      const icon = el('span', { cls: 'hexicon', text: bdef.icon, parent: head, style: { background: cssColor(bdef.color) } });
      void icon;
      const names = el('div', { cls: 'names', parent: head });
      el('div', { cls: 'bname', text: t(bdef.descKey), parent: names });
      if (t0.structure) el('div', { cls: 'sname', text: `${STRUCTURES[t0.structure].icon} ${t(STRUCTURES[t0.structure].descKey)}`, parent: names });
      el('div', { cls: 'insp-desc', parent: insp, text: tDescSafe(bdef) });
      const bars = el('div', { cls: 'bars', parent: insp });
      miniBar(bars, t('tile.elevation'), t0.elev / 5, String(t0.elev));
      miniBar(bars, t('tile.moisture'), t0.moist / 100, String(Math.round(t0.moist)));
      miniBar(bars, t('tile.fertility'), t0.fert / 100, String(Math.round(t0.fert)));
      miniBar(bars, t('tile.dev'), t0.dev / 3, `${Math.floor(t0.dev)}/3`);
      miniBar(bars, t('tile.suit'), t0.suit, `${Math.round(t0.suit * 100)}%`);
      if (t0.poll > 2) miniBar(bars, t('tile.pollution'), t0.poll / 100, String(Math.round(t0.poll)));
      const flags: string[] = [];
      if (t0.dep > 0) flags.push('◆'.repeat(t0.dep));
      if (t0.geo) flags.push('♨');
      flags.push(g.inTerritory[ti] ? t('tile.terr') : t('tile.outside'));
      if (flags.length) el('div', { cls: 'insp-desc', parent: insp, text: flags.join('  ·  ') });

      // tile yields
      const y = derived.ty[ti];
      const yr = el('div', { cls: 'yields-row', parent: insp });
      const addChip = (v: number, res: string) => {
        if (Math.abs(v) < 0.05) return;
        el('span', { cls: `chip ${v >= 0 ? 'pos' : 'neg'}`, text: `${res} ${signed(v, 1)}`, parent: yr });
      };
      el('div', { cls: 'panel-title', parent: insp, text: t('tile.yields') });
      addChip(y.wProd - y.wUse, '💧');
      addChip(y.mProd, '⛏');
      addChip(y.eProd - y.eUse, '⚡');
      addChip(y.bio, '🌿');
      addChip(y.rp, '🔬');
      addChip(y.dO2 * 0.4, '🫧');
      if (y.moistAdd > 0.05) addChip(y.moistAdd, '💦');
      if (y.combos.length) {
        const cr = el('div', { cls: 'yields-row', parent: insp });
        for (const c of y.combos) el('span', { cls: 'chip combo', text: '✦ ' + t(`combo.${c}`), parent: cr });
      }
      if (derived.netSize[ti] > 0) {
        const nl = el('div', { cls: 'insp-list', parent: insp });
        el('div', { cls: 'row', parent: nl, html: `<span>${t('tile.network')}</span><b>${derived.netSize[ti]} ${t('tile.tiles')} ×${y.netMult.toFixed(2)}</b>` });
      }
      // adjacency summary
      const nb = neighborsIdx(g.mapR)[ti] ?? [];
      const counts = new Map<string, number>();
      for (const j of nb) {
        const bt = g.tiles[j]?.biome;
        if (bt) counts.set(bt, (counts.get(bt) ?? 0) + 1);
      }
      if (counts.size) {
        el('div', { cls: 'panel-title', parent: insp, text: t('tile.adjacency') });
        const al = el('div', { cls: 'insp-list', parent: insp });
        [...counts.entries()].sort((a, b) => b[1] - a[1]).forEach(([b, c]) => {
          el('div', {
            cls: 'row', parent: al,
            html: `<span>${BIOMES[b as keyof typeof BIOMES].icon} ${t(BIOMES[b as keyof typeof BIOMES].descKey)}</span><b>×${c}</b>`,
          });
        });
      }
    }

    // placement preview
    if (sel && preview) {
      const card = el('div', { cls: 'panel', parent: this.left, style: { marginTop: '8px' } });
      el('div', { cls: 'panel-title', parent: card, text: `${t('tray.preview')} — ${sel.kind === 'biome' ? t(BIOMES[sel.id].descKey) : t(STRUCTURES[sel.id].descKey)}` });
      if (!preview.ok) {
        el('div', { cls: 'insp-desc', parent: card, text: t(preview.reason ?? 'err.invalid') });
      } else {
        // long-term suitability verdict — the "will this survive here?" answer
        if (sel.kind === 'biome' && info.previewTile !== null && info.previewTile < g.tiles.length) {
          const t0 = g.tiles[info.previewTile];
          const envSuit = BIOMES[sel.id].suit({ ...t0, fert: Math.max(t0.fert, 24), moist: Math.max(t0.moist, 14) }, g.planet);
          const v = Math.round(envSuit * 100);
          const [cls, txt] = envSuit >= 0.55
            ? ['pos', `✓ ${t('tile.vigHigh')} · ${t('tile.suit')} ${v}%`]
            : envSuit >= 0.3
              ? ['combo', `△ ${t('tile.vigMid')} · ${t('tile.suit')} ${v}%`]
              : ['neg', `✖ ${t('tile.vigLow')} · ${t('tile.suit')} ${v}%`];
          const vr = el('div', { cls: 'yields-row', parent: card });
          el('span', { cls: `chip ${cls}`, text: txt, parent: vr });
        }
        const yr = el('div', { cls: 'yields-row', parent: card });
        const names: Record<string, string> = { water: '💧', minerals: '⛏', energy: '⚡', biomass: '🌿', research: '🔬' };
        for (const [k, v] of Object.entries(preview.deltas.res)) {
          el('span', { cls: `chip ${(v as number) >= 0 ? 'pos' : 'neg'}`, text: `${names[k] ?? k} ${signed(v as number, 1)}`, parent: yr });
        }
        const pnames: Record<string, string> = { temp: '🌡', water: '💧', oxygen: '🫧', humidity: '💦', bio: '🌱', pollution: '🏭', pressure: '🌬' };
        const pr = el('div', { cls: 'yields-row', parent: card });
        for (const [k, v] of Object.entries(preview.deltas.planet)) {
          el('span', { cls: `chip ${((v as number) > 0 && k !== 'pollution') || ((v as number) < 0 && k === 'pollution') ? 'pos' : 'neg'}`, text: `${pnames[k] ?? k} ${signed(v as number, 2)}`, parent: pr });
        }
        for (const c of preview.comboIds) {
          const cr = el('div', { cls: 'yields-row', parent: card });
          el('span', { cls: 'chip combo', text: '✦ ' + t(`combo.${c}`) + ' ✦', parent: cr });
        }
        const ct = el('div', { cls: 'insp-desc', parent: card, text: `${t('tray.cost')}: ${costStr(preview.cost)}` });
        void ct;
      }
    }
  }

  private renderTray(info: RenderInfo): void {
    const { g, sel } = info;
    this.trayItems.innerHTML = '';
    let hot = 0;
    const mk = (icon: string, color: [number, number, number], name: string, cost: string,
      locked: boolean, afford: boolean, selected: boolean, onClick: () => void, key: string) => {
      hot++;
      const item = el('button', { cls: 'tray-item' + (locked ? ' locked' : '') + (afford ? '' : ' unaffordable') + (selected ? ' sel' : ''), parent: this.trayItems }) as HTMLButtonElement;
      el('span', { cls: 'hexicon', text: icon, parent: item, style: { background: locked ? '#3a4450' : cssColor(color) } });
      el('span', { cls: 'nm', text: name, parent: item });
      el('span', { cls: 'cost', text: locked ? t('tray.lockedChip') : cost, parent: item });
      el('span', { cls: 'kb', text: hot <= 9 ? String(hot) : '', parent: item });
      item.addEventListener('click', () => { if (!locked) onClick(); });
      attachTip(item, () => `<b>${name}</b> (${key})<br>${locked ? t('err.locked') : cost ? `${t('tray.cost')}: ${cost}` : ''}`);
      return item;
    };
    for (const b of Object.keys(BIOMES) as BiomeId[]) {
      const def = BIOMES[b];
      if (!def.placeable) continue;
      const locked = def.unlock !== null && !g.techDone.includes(def.unlock);
      const cost = biomeCostStr(g, b);
      const afford = !locked && canAfford(g, cost);
      mk(def.icon, def.color, t(def.descKey), costFmt(cost), locked, afford, sel?.kind === 'biome' && sel.id === b,
        () => this.hooks.onSelectAction(sel?.kind === 'biome' && sel.id === b ? null : { kind: 'biome', id: b }), `key:${hot + 1}`);
    }
    for (const s of Object.keys(STRUCTURES) as StructureId[]) {
      if (s === 'hub') continue;
      const def = STRUCTURES[s];
      const locked = !isStructUnlocked(g, s);
      const cost = structCostStr(g, s);
      const afford = !locked && canAfford(g, cost);
      mk(def.icon, def.color, t(def.descKey), costFmt(cost), locked, afford, sel?.kind === 'struct' && sel.id === s,
        () => this.hooks.onSelectAction(sel?.kind === 'struct' && sel.id === s ? null : { kind: 'struct', id: s }), `key:${hot + 1}`);
    }
  }

  /** hotkeys 1..9 select tray items */
  selectByHotkey(n: number): void {
    const items = this.trayItems.querySelectorAll('.tray-item') as NodeListOf<HTMLButtonElement>;
    items[n - 1]?.click();
  }

  private renderObjectives(g: GameState): void {
    const holder = this.root.querySelector('[data-role="objectives"]') as HTMLElement;
    holder.innerHTML = '';
    for (const o of g.objectives) {
      const def = getObjectiveLite(o.id);
      if (!def) continue;
      const row = el('div', { cls: 'objrow' + (o.done ? ' done' : ''), parent: holder });
      const lab = el('div', { cls: 'lab', parent: row });
      el('b', { text: (o.id.startsWith('primary') ? '★ ' : '') + t(`obj.${o.id}`), parent: lab });
      const prog = Math.min(1, def.prog(g));
      el('span', { text: o.done ? '✓' : `${Math.round(prog * 100)}%`, parent: lab });
      el('div', { cls: 'lab', parent: row, style: { fontSize: '0.92em' }, text: t(`obj.${o.id}.d`) });
      const bar = el('div', { cls: 'bar', parent: row });
      const fill = el('div', { parent: bar, style: { width: `${Math.round((o.done ? 1 : prog) * 100)}%` } });
      void fill;
    }
  }

  private renderLog(g: GameState): void {
    if (!this.logVisible) { this.logPanel.style.display = 'none'; return; }
    this.logPanel.style.display = '';
    this.logItems.innerHTML = '';
    const rows: { cycle: number; text: string; tone: string }[] = [];
    for (const e of g.recentEvents) {
      rows.push({ cycle: e.cycle, text: t(`ev.${e.eventId}`) + (e.choice ? ` → ${t(e.choice)}` : ''), tone: '' });
    }
    for (const e of this.logEntries) rows.push(e);
    rows.sort((a, b) => a.cycle - b.cycle);
    for (const r of rows.slice(-16)) {
      const item = el('div', { cls: 'log-item' + (r.tone ? ' ' + r.tone : ''), parent: this.logItems });
      el('span', { cls: 'c', text: `${r.cycle} · `, parent: item });
      item.appendChild(document.createTextNode(r.text));
    }
  }

  /** add a player-action line to the signals log (session scope) */
  logLine(cycle: number, text: string, tone: 'good' | 'bad' | 'info' = 'info'): void {
    this.logEntries.push({ cycle, text, tone });
    if (this.logEntries.length > 60) this.logEntries.splice(0, this.logEntries.length - 60);
  }

  private logEntries: { cycle: number; text: string; tone: string }[] = [];

  toggleLog(): void {
    this.logVisible = !this.logVisible;
    this.hooks.onToggleLog();
  }

  toast(text: string, tone: 'good' | 'bad' | 'info' = 'info', ms = 2600): void {
    const n = el('div', { cls: `toast ${tone}`, text, parent: this.toasts });
    setTimeout(() => {
      n.classList.add('out');
      setTimeout(() => n.remove(), 450);
    }, ms);
  }

  milestoneFlash(tone: 'good' | 'bad' | 'info'): void {
    this.flash.className = `screen-flash ${tone} go`;
    setTimeout(() => this.flash.classList.remove('go'), 1000);
  }

  spawnFloat(i: number, text: string, tone: 'good' | 'bad' | 'info'): void {
    if (!this.projector) return;
    const pos = this.projector(i);
    const n = el('div', { cls: `float-num ${tone}`, text, parent: this.floats }) as HTMLDivElement;
    const place = () => {
      if (!pos || !pos.visible) { n.style.opacity = '0'; return; }
      n.style.left = `${pos.x}px`;
      n.style.top = `${pos.y}px`;
    };
    place();
    setTimeout(() => n.remove(), 1650);
  }

  setG(g: GameState): void {
    this.gRef = g;
  }
}

function cssColor(c: [number, number, number]): string {
  const f = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 255);
  return `rgb(${f(c[0])},${f(c[1])},${f(c[2])})`;
}

function tDescSafe(bdef: { id: string; descKey: string }): string {
  return t(`${bdef.descKey}.d`);
}

function miniBar(parent: HTMLElement, label: string, frac: number, valText: string): void {
  const row = el('div', { cls: 'barrow', parent });
  el('span', { text: label, parent: row });
  const g = el('div', { cls: 'gauge', parent: row });
  const fill = el('div', { parent: g, style: { width: `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%` } });
  fill.style.background = 'linear-gradient(90deg,#2e6f9a,#6ec8ff)';
  el('span', { cls: 'num', text: valText, parent: row });
}

export { el, cssColor, RES_ICON };

// ---------------------------------------------------------------------------
// cost string helpers shared with preview — delegated to facade to avoid dupes
// ---------------------------------------------------------------------------
import { biomeCost, structureCost, canAfford as afford, isStructureUnlocked, aggregateTechs } from '../sim/ui-facade';

function biomeCostStr(g: GameState, b: BiomeId): Partial<Record<string, number>> {
  return biomeCost(g, aggregateTechs(g), b) as Partial<Record<string, number>>;
}
function structCostStr(g: GameState, s: StructureId): Partial<Record<string, number>> {
  return structureCost(g, aggregateTechs(g), s) as Partial<Record<string, number>>;
}
function canAfford(g: GameState, cost: Partial<Record<string, number>>): boolean {
  return afford(g.res, cost as never);
}
function isStructUnlocked(g: GameState, s: StructureId): boolean {
  return isStructureUnlocked(g, aggregateTechs(g), s);
}
function costFmt(cost: Partial<Record<string, number>>): string {
  const names: Record<string, string> = { water: '💧', minerals: '⛏', energy: '⚡', biomass: '🌿', research: '🔬' };
  return Object.entries(cost).map(([k, v]) => `${names[k] ?? '?'}${v}`).join(' ');
}
function costStr(cost: Partial<Record<string, number>>): string {
  return costFmt(cost);
}

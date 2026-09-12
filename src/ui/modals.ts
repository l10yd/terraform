/**
 * Modals: environmental event decisions, technology tree, settings, help.
 */
import { el, attachTip } from './dom';
import { t, getLang } from '../i18n';
import { TECHS, TECH_BRANCHES, BIOMES, STRUCTURES } from '../sim/ui-facade';
import type { GameState, TechId, StructureId } from '../sim/ui-facade';
import { EVENTS } from '../sim/events';
import type { Settings } from '../save/settings';
import type { QualityLevel } from '../render/quality';

export interface ModalHooks {
  onChoose(option: number): void;
  onPickTech(tech: TechId): void;
  onSettings(s: Partial<Settings>): void;
  onDeleteSave(): void;
  onRecommendQuality(): QualityLevel;
  onLanguage(lang: 'en' | 'ru'): void;
}

export class Modals {
  private host: HTMLElement;
  open: 'none' | 'event' | 'tech' | 'settings' | 'help' = 'none';

  constructor(app: HTMLElement, private hooks: ModalHooks) {
    this.host = el('div', { parent: app, style: { display: 'none' } });
  }

  private overlay(): HTMLElement {
    this.host.innerHTML = '';
    this.host.style.display = '';
    return el('div', { cls: 'overlay', parent: this.host });
  }

  close(): void {
    this.host.style.display = 'none';
    this.host.innerHTML = '';
    this.open = 'none';
  }

  // -------------------------------------------------------------- event
  showEvent(g: GameState): void {
    if (!g.pendingChoice) return;
    const def = EVENTS.find((e) => e.id === g.pendingChoice!.eventId);
    if (!def) return;
    this.open = 'event';
    const ov = this.overlay();
    const card = el('div', { cls: 'event-card', parent: ov });
    el('div', { cls: 'big-icon', text: def.good ? '✦' : '⚠', parent: card });
    el('h2', { text: t(`ev.${def.id}`), parent: card });
    el('div', { cls: 'txt', text: t(`ev.${def.id}.t`), parent: card });
    const opts = el('div', { cls: 'event-opts', parent: card });
    (def.options ?? []).forEach((o, idx) => {
      const b = el('button', { cls: 'event-opt', parent: opts });
      el('div', { cls: 't', text: t(o.key), parent: b });
      el('div', { cls: 'd', text: t(`${o.key}.d`), parent: b });
      b.addEventListener('click', () => {
        this.close();
        this.hooks.onChoose(idx);
      });
    });
  }

  // -------------------------------------------------------------- tech
  showTech(g: GameState): void {
    this.open = 'tech';
    const ov = this.overlay();
    const modal = el('div', { cls: 'modal panel', parent: ov });
    const head = el('div', { cls: 'modal-head', parent: modal });
    el('h2', { text: t('tech.title'), parent: head });
    el('div', { cls: 'grow', parent: head });
    el('div', { text: `${Math.floor(g.res.research)} 🔬 ${t('tech.stock')}`, parent: head, style: { color: 'var(--dim)', fontSize: '0.85em' } });
    const closeB = el('button', { cls: 'btn', text: t('tech.close'), parent: head });
    closeB.addEventListener('click', () => this.close());
    const body = el('div', { cls: 'modal-body', parent: modal });

    if (g.techCurrent) {
      const def = TECHS[g.techCurrent];
      const box = el('div', { cls: 'tech-researching', parent: body });
      const pct = Math.min(100, (g.res.research / def.cost) * 100);
      el('span', { text: `${t('tech.researching')}: ${t(def.descKey)}`, parent: box });
      const bar = el('div', { cls: 'gauge', parent: box, style: { flex: '1' } });
      el('div', { parent: bar, style: { width: `${pct}%`, background: 'var(--amber)' } });
      el('span', { text: `${Math.floor(pct)}%`, parent: box });
      const hint = el('div', { text: t('tech.auto'), parent: box, style: { fontSize: '0.78em', color: 'var(--faint)' } });
      void hint;
    }

    const grid = el('div', { cls: 'tech-grid', parent: body });
    for (const branch of TECH_BRANCHES) {
      const col = el('div', { cls: 'tech-col', parent: grid });
      el('h3', { text: t(`branch.${branch}`), parent: col });
      const list = Object.values(TECHS).filter((x) => x.branch === branch).sort((a, b) => a.tier - b.tier);
      for (const def of list) {
        const done = g.techDone.includes(def.id);
        const current = g.techCurrent === def.id;
        const reqsOk = def.reqs.every((r) => g.techDone.includes(r));
        const canBuy = !done && !current && reqsOk;
        const cls = done ? 'done' : current ? 'current' : canBuy ? 'available' : 'locked';
        const node = el('div', { cls: `tech-node ${cls}`, parent: col });
        const nm = el('div', { cls: 'tn', parent: node });
        el('span', { text: done ? '✓' : def.icon, parent: nm });
        el('span', { text: t(def.descKey), parent: nm });
        el('div', { cls: 'cost', text: `${def.cost}🔬`, parent: node });
        el('div', { cls: 'tc', text: t(`${def.descKey}.d`), parent: node });
        const unlocks: string[] = [];
        for (const m of def.mods) {
          if (m.kind === 'unlockBiome') unlocks.push(t(BIOMES[m.target as keyof typeof BIOMES].descKey));
          if (m.kind === 'unlockStructure') unlocks.push(t(STRUCTURES[m.target as StructureId].descKey));
        }
        if (unlocks.length) {
          const u = el('div', { parent: node, style: { marginTop: '4px', fontSize: '0.82em', color: 'var(--cyan)' } });
          u.textContent = `${t('tech.unlocks')}: ${unlocks.join(', ')}`;
        }
        if (current) {
          const pct = Math.min(100, (g.res.research / def.cost) * 100);
          const pr = el('div', { cls: 'prog', parent: node });
          pr.style.width = `${pct}%`;
        }
        if (canBuy) {
          attachTip(node, () => `<b>${t(def.descKey)}</b><br>${t('tech.choose')}`);
          node.addEventListener('click', () => {
            this.close();
            this.hooks.onPickTech(def.id);
          });
        }
      }
    }
  }

  // -------------------------------------------------------------- settings
  showSettings(s: Settings): void {
    this.open = 'settings';
    const ov = this.overlay();
    ov.addEventListener('click', (e) => { if (e.target === ov) this.close(); });
    const modal = el('div', { cls: 'modal panel', parent: ov, style: { width: 'min(700px, 94vw)' } });
    const head = el('div', { cls: 'modal-head', parent: modal });
    el('h2', { text: t('menu.settings'), parent: head });
    el('div', { cls: 'grow', parent: head });
    const closeB = el('button', { cls: 'btn', text: t('tech.close'), parent: head });
    closeB.addEventListener('click', () => this.close());
    const body = el('div', { cls: 'modal-body', parent: modal });
    const grid = el('div', { cls: 'set-grid', parent: body });

    const row = (label: string): HTMLElement => {
      const r = el('div', { cls: 'set-row', parent: grid });
      el('span', { text: label, parent: r });
      return r;
    };

    // language
    const lr = row(t('set.language'));
    const lseg = el('div', { cls: 'seg', parent: lr });
    for (const lg of ['en', 'ru'] as const) {
      const b = el('button', { cls: getLang() === lg ? 'on' : '', text: lg === 'en' ? 'English' : 'Русский', parent: lseg });
      b.addEventListener('click', () => { this.hooks.onLanguage(lg); this.close(); });
    }

    // quality
    const qr = row(t('set.graphics'));
    const qseg = el('div', { cls: 'seg', parent: qr });
    const rec = this.hooks.onRecommendQuality();
    for (const q of ['auto', 'low', 'medium', 'high', 'ultra'] as const) {
      const b = el('button', {
        cls: s.quality === q ? 'on' : '',
        text: q === 'auto' ? `${t('set.auto')} (${rec})` : t(`set.${q}`),
        parent: qseg,
      });
      b.addEventListener('click', () => { this.hooks.onSettings({ quality: q }); this.showSettings({ ...s, quality: q }); });
    }

    // volume sliders
    const vr = row(`${t('set.music')} / ${t('set.sfx')} / ${t('set.audio')}`);
    const sliders = el('div', { parent: vr, style: { display: 'flex', gap: '8px' } });
    const mkSlider = (label: string, val: number, cb: (v: number) => void) => {
      const w = el('div', { parent: sliders, style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' } });
      const inp = el('input', { attrs: { type: 'range', min: 0, max: 100, value: Math.round(val * 100) }, parent: w }) as HTMLInputElement;
      el('span', { text: label, parent: w, style: { fontSize: '0.68em', color: 'var(--faint)' } });
      inp.addEventListener('input', () => cb(Number(inp.value) / 100));
    };
    mkSlider('♪', s.music, (v) => this.hooks.onSettings({ music: v }));
    mkSlider('🔊', s.sfx, (v) => this.hooks.onSettings({ sfx: v }));
    mkSlider('◉', s.volume, (v) => this.hooks.onSettings({ volume: v }));

    const mkCheck = (key: keyof Settings, label: string) => {
      const r = row(label);
      const c = el('input', { attrs: { type: 'checkbox' }, parent: r }) as HTMLInputElement;
      c.checked = Boolean(s[key]);
      c.addEventListener('change', () => this.hooks.onSettings({ [key]: c.checked } as Partial<Settings>));
    };
    mkCheck('reduceMotion', t('set.reduceMotion'));
    mkCheck('highContrast', t('set.highContrast'));
    mkCheck('colorblind', t('set.colorblind'));
    mkCheck('debug', t('set.debug'));

    const ur = row(t('set.uizoom'));
    const ui = el('input', { attrs: { type: 'range', min: 85, max: 130, value: Math.round(s.uiScale * 100) }, parent: ur }) as HTMLInputElement;
    ui.addEventListener('input', () => this.hooks.onSettings({ uiScale: Number(ui.value) / 100 }));

    const drow = row(t('set.danger'));
    let armed = false;
    const db = el('button', { cls: 'btn', text: t('set.danger'), parent: drow });
    db.addEventListener('click', () => {
      if (!armed) { armed = true; db.textContent = t('set.dangerSure'); return; }
      this.hooks.onDeleteSave();
      this.close();
    });
  }

  // -------------------------------------------------------------- help
  showHelp(): void {
    this.open = 'help';
    const ov = this.overlay();
    ov.addEventListener('click', (e) => { if (e.target === ov) this.close(); });
    const modal = el('div', { cls: 'modal panel', parent: ov, style: { width: 'min(660px, 94vw)' } });
    const head = el('div', { cls: 'modal-head', parent: modal });
    el('h2', { text: t('help.title'), parent: head });
    el('div', { cls: 'grow', parent: head });
    const closeB = el('button', { cls: 'btn', text: t('help.close'), parent: head });
    closeB.addEventListener('click', () => this.close());
    const body = el('div', { cls: 'modal-body', parent: modal, style: { display: 'flex', flexDirection: 'column', gap: '12px' } });
    for (let i = 1; i <= 5; i++) {
      const line = el('div', { parent: body, style: { display: 'flex', gap: '10px', lineHeight: '1.5' } });
      el('span', { text: `${i}`, parent: line, style: { color: 'var(--amber)', fontWeight: '800', fontFamily: 'var(--serif-num)' } });
      el('span', { text: t(`help.t${i}`), parent: line, style: { color: 'var(--dim)' } });
    }
    const keys = el('div', { parent: body, style: { marginTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px', fontSize: '0.85em', color: 'var(--faint)' } });
    for (let i = 1; i <= 4; i++) el('div', { text: t(`help.k${i}`), parent: keys });
  }
}

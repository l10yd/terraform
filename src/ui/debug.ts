/**
 * Dev-only overlay: live counters + simulation manipulation buttons.
 */
import { el } from './dom';
import { t } from '../i18n';
import type { GameRenderer } from '../render/renderer';
import type { GameState } from '../sim/types';
import { stateHash } from '../sim/state';

export interface DebugHooks {
  onRegenerate(): void;
  onAdvance(n: number): void;
  onGive(): void;
  onUnlockAll(): void;
  onToggleGrid(): void;
  onSave(): void;
  onLoad(): void;
}

export class DebugPanel {
  root: HTMLElement;
  private lines: Record<string, HTMLElement> = {};

  constructor(app: HTMLElement, private renderer: GameRenderer, private hooks: DebugHooks) {
    this.root = el('div', { cls: 'debug panel', parent: app, style: { display: 'none' } });
    el('div', { text: t('dbg.title'), parent: this.root, style: { color: 'var(--amber)', letterSpacing: '0.18em', fontSize: '0.9em', marginBottom: '4px' } });
    for (const k of ['fps', 'draws', 'tris', 'seed', 'turn', 'tiles', 'tech', 'res', 'hash']) {
      this.lines[k] = el('div', { parent: this.root });
    }
    const btns = el('div', { cls: 'btns', parent: this.root });
    const mk = (label: string, fn: () => void) => {
      el('button', { cls: 'btn', text: label, parent: btns, onClick: fn });
    };
    mk(t('dbg.regen'), () => this.hooks.onRegenerate());
    mk('+1c', () => this.hooks.onAdvance(1));
    mk('+25c', () => this.hooks.onAdvance(25));
    mk(t('dbg.res'), () => this.hooks.onGive());
    mk(t('dbg.tech'), () => this.hooks.onUnlockAll());
    mk(t('dbg.grid'), () => this.hooks.onToggleGrid());
    mk('SAVE', () => this.hooks.onSave());
    mk('LOAD', () => this.hooks.onLoad());
  }

  show(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }

  update(g: GameState | null): void {
    if (this.root.style.display === 'none') return;
    const s = this.renderer.stats;
    this.lines.fps.innerHTML = `${t('dbg.fps')}: <b>${s.fps.toFixed(0)}</b>`;
    this.lines.draws.innerHTML = `${t('dbg.draws')}: <b>${s.draws}</b>`;
    this.lines.tris.innerHTML = `${t('dbg.tris')}: <b>${(s.tris / 1000).toFixed(0)}k</b>`;
    this.lines.turn.innerHTML = `${t('dbg.turn')}: <b>${g ? g.cycle : '—'}</b>`;
    this.lines.tiles.innerHTML = `${t('dbg.tiles')}: <b>${g ? g.tiles.length : 0}</b>`;
    this.lines.tech.innerHTML = `${t('dbg.tech')}: <b>${g ? g.techDone.length : 0}</b>`;
    if (g) {
      this.lines.seed.innerHTML = `${t('dbg.seed')}: <b>${g.seed}</b>`;
      this.lines.res.innerHTML = `💧${Math.floor(g.res.water)} ⛏${Math.floor(g.res.minerals)} ⚡${Math.floor(g.res.energy)} 🌿${Math.floor(g.res.biomass)} 🔬${Math.floor(g.res.research)}`;
      this.lines.hash.innerHTML = `hash: <b>${stateHash(g).slice(0, 10)}</b>`;
    }
  }
}

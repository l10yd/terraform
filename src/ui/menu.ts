/**
 * Main menu: mode select, seed, map size, best scores, continue.
 */
import { el } from './dom';
import { t, getLang } from '../i18n';
import type { GameMode } from '../sim/types';
import { dailySeed } from '../sim/ui-facade';
import type { Meta } from '../sim/serialize';

export interface MenuHooks {
  onStart(mode: GameMode, seed: string, mapR: number): void;
  onContinue(): void;
  onSettings(): void;
  onHelp(): void;
  onToggleLang(): void;
}

const MODES: { id: GameMode; icon: string }[] = [
  { id: 'standard', icon: '🌍' },
  { id: 'daily', icon: '★' },
  { id: 'arid', icon: '☀' },
  { id: 'frozen', icon: '❄' },
  { id: 'volcanic', icon: '♨' },
  { id: 'ecological', icon: '🌿' },
  { id: 'hardcore', icon: '☠' },
];

export class MainMenu {
  root: HTMLElement;
  private modeBtns = new Map<GameMode, HTMLElement>();
  private seedInput!: HTMLInputElement;
  private sizeBtns = new Map<number, HTMLElement>();
  private bestLine!: HTMLElement;
  private contBtn!: HTMLButtonElement;
  private mode: GameMode = 'standard';
  private mapR = 11;

  constructor(app: HTMLElement, hooks: MenuHooks, private hasSave: boolean, private meta: Meta) {
    this.root = el('div', { cls: 'menu-wrap', parent: app });
    const logo = el('div', { cls: 'menu-logo', parent: this.root });
    el('div', { cls: 'l1', text: t('game.title'), parent: logo });
    el('div', { cls: 'l2', text: t('game.tagline'), parent: logo });

    const cards = el('div', { cls: 'menu-cards', parent: this.root });
    for (const m of MODES) {
      const card = el('button', { cls: 'mode-card' + (m.id === this.mode ? ' on' : ''), parent: cards }) as HTMLButtonElement;
      el('div', { cls: 'mi', text: m.icon, parent: card });
      el('div', { cls: 'mn', text: m.id === 'daily' ? `${t('menu.daily')} · ${dailySeed().slice(7)}` : t(`menu.mode.${m.id}`), parent: card });
      if (m.id !== 'daily') el('div', { cls: 'md', text: t(`menu.mode.${m.id}.d`), parent: card });
      else el('div', { cls: 'md', text: t('menu.season'), parent: card });
      card.addEventListener('click', () => {
        this.mode = m.id;
        for (const [k, n] of this.modeBtns) n.classList.toggle('on', k === m.id);
        this.seedInput.disabled = m.id === 'daily';
        if (m.id === 'daily') this.seedInput.placeholder = dailySeed();
      });
      this.modeBtns.set(m.id, card);
    }

    const seedRow = el('div', { cls: 'menu-seed', parent: this.root });
    el('span', { text: t('menu.seed'), parent: seedRow, style: { fontSize: '0.8em', color: 'var(--dim)', whiteSpace: 'nowrap' } });
    this.seedInput = el('input', {
      cls: 'seed', attrs: { type: 'text', placeholder: 'random' }, parent: seedRow,
    }) as HTMLInputElement;
    el('button', {
      cls: 'btn', text: '🎲', parent: seedRow,
      onClick: () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let s = '';
        for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
        this.seedInput.value = s;
      },
    });

    const sizeRow = el('div', { cls: 'menu-seed', parent: this.root, style: { width: '380px' } });
    el('span', { text: t('menu.mapsize'), parent: sizeRow, style: { fontSize: '0.8em', color: 'var(--dim)', whiteSpace: 'nowrap' } });
    const seg = el('div', { cls: 'seg', parent: sizeRow });
    for (const r of [9, 11, 13]) {
      const b = el('button', { cls: r === this.mapR ? 'on' : '', text: t(r === 9 ? 'menu.small' : r === 11 ? 'menu.medium' : 'menu.large'), parent: seg });
      b.addEventListener('click', () => {
        this.mapR = r;
        for (const [k, n] of this.sizeBtns) n.classList.toggle('on', k === r);
      });
      this.sizeBtns.set(r, b);
    }

    const acts = el('div', { cls: 'menu-actions', parent: this.root });
    this.contBtn = el('button', { cls: 'btn big', text: `▶ ${t('menu.continue')}`, parent: acts }) as HTMLButtonElement;
    this.contBtn.style.display = this.hasSave ? '' : 'none';
    this.contBtn.addEventListener('click', () => hooks.onContinue());
    const startBtn = el('button', { cls: 'btn big primary', text: `${t('menu.start')} ▸`, parent: acts });
    startBtn.addEventListener('click', () => {
      hooks.onStart(this.mode, this.mode === 'daily' ? dailySeed() : this.seedInput.value.trim(), this.mapR);
    });
    el('button', { cls: 'icon-btn', text: getLang() === 'ru' ? 'EN' : 'RU', parent: acts, onClick: () => hooks.onToggleLang() });
    el('button', { cls: 'icon-btn', text: '?', parent: acts, onClick: () => hooks.onHelp() });
    el('button', { cls: 'icon-btn', text: '⚙', parent: acts, onClick: () => hooks.onSettings() });

    this.bestLine = el('div', { cls: 'menu-best', parent: this.root });
    el('div', { cls: 'menu-foot', parent: this.root, text: t('menu.credits') });
    this.refreshBest();
  }

  private refreshBest(): void {
    const entries = Object.entries(this.meta.bestScores ?? {}).filter(([, v]) => v > 0);
    if (!entries.length) {
      this.bestLine.textContent = '';
      return;
    }
    const best = entries.sort((a, b) => b[1] - a[1])[0];
    this.bestLine.innerHTML = `${t('menu.bestOverall')}: <b>${best[1]}</b> · ${t(`menu.mode.${best[0]}`)}`;
  }

  setHasSave(v: boolean): void {
    this.hasSave = v;
    this.contBtn.style.display = v ? '' : 'none';
  }

  show(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
    if (v) this.refreshBest();
  }

  rebuild(): void {
    // language changed: destroy & let app recreate
    this.root.remove();
  }

  static isMine(e: KeyboardEvent): boolean {
    return (e.target as HTMLElement)?.tagName === 'INPUT';
  }
}

/**
 * End-of-run Planetary Report: animated score, transformation replay
 * driven by state snapshots, full score breakdown.
 */
import { el } from './dom';
import { t } from '../i18n';
import { computeScore, snapshotAt } from '../sim/ui-facade';
import type { GameState } from '../sim/ui-facade';

export interface ReportHooks {
  onReplayFrame(cycle: number | null): void;
  onNewGame(): void;
  onMenu(): void;
  onContinue(): void;
}

export class Report {
  root: HTMLElement | null = null;
  playing = false;
  private timer: number | null = null;
  private slider: HTMLInputElement | null = null;
  private labelCycle: HTMLElement | null = null;
  onFrame: ((cycle: number) => void) | null = null;

  constructor(private app: HTMLElement, private hooks: ReportHooks, public reduceMotion: boolean) {}

  show(g: GameState, best: number): void {
    this.close();
    const win = g.end?.type === 'victory';
    const parts = computeScore(g);
    this.root = el('div', { cls: `overlay report ${win ? 'win' : 'lose'}`, parent: this.app });
    const inner = el('div', { cls: 'report-inner', parent: this.root });
    el('h1', { text: win ? t('report.title.win') : t('report.title.lose'), parent: inner });
    el('div', { cls: 'sub', text: `${g.planetName.toUpperCase()} · ${g.seed} · ${t(win ? 'report.subtitle.win' : 'report.subtitle.lose')}`, parent: inner });

    const line = el('div', { cls: 'score-line', parent: inner });
    const scoreEl = el('div', { cls: 'score', text: '0', parent: line });
    el('div', { cls: 'grade', text: parts.grade, parent: line });
    if (this.reduceMotion) scoreEl.textContent = String(parts.total);
    else this.animateNum(scoreEl, parts.total, 1400);
    el('div', { text: t('report.score'), parent: inner, style: { fontSize: '0.8em', color: 'var(--dim)', letterSpacing: '0.2em', textTransform: 'uppercase' } });

    // replay
    const maxC = g.cycle;
    const rb = el('div', { cls: 'replay-bar', parent: inner });
    const top = el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } }, );
    rb.appendChild(top);
    const playBtn = el('button', { cls: 'btn', text: '▶ ' + t('report.play'), parent: top }) as HTMLButtonElement;
    this.labelCycle = el('span', { text: t('report.replay'), parent: top, style: { fontSize: '0.78em', color: 'var(--dim)', marginLeft: 'auto' } });
    this.slider = el('input', { cls: 'replay-slider', attrs: { type: 'range', min: 1, max: Math.max(1, maxC), value: maxC }, parent: rb }) as HTMLInputElement;
    const labs = el('div', { cls: 'lab', parent: rb });
    el('span', { text: `${t('hud.cycle')} 1`, parent: labs });
    el('span', { text: `${t('hud.cycle')} ${maxC}`, parent: labs });
    this.slider.addEventListener('input', () => this.applyFrame(Number(this.slider!.value)));
    playBtn.addEventListener('click', () => {
      if (this.playing) { this.stopPlay(playBtn); return; }
      this.playing = true;
      playBtn.textContent = '⏸ ' + t('report.pause');
      this.slider!.value = '1';
      this.applyFrame(1);
      this.timer = window.setInterval(() => {
        const c = Number(this.slider!.value) + 1;
        if (c > maxC) { this.stopPlay(playBtn); return; }
        this.slider!.value = String(c);
        this.applyFrame(c);
      }, Math.max(40, 1600 / Math.max(1, maxC)));
    });

    // vitals evolution
    const vitals = el('div', { cls: 'vitals', parent: inner });
    const first = snapshotAt(g, 1);
    void first;
    const p = g.planet;
    this.vitalBar(vitals, t('pv.bio'), p.bio, 100, `${Math.round(p.bio)}%`);
    this.vitalBar(vitals, t('pv.oxygen'), p.oxygen, 25, `${p.oxygen.toFixed(1)}%`);
    this.vitalBar(vitals, t('pv.water'), p.water, 100, `${Math.round(p.water)}%`);
    this.vitalBar(vitals, t('pv.temp'), (p.temp + 60) / 120 * 100, 100, `${Math.round(p.temp)}°C`);
    this.vitalBar(vitals, t('pv.stability'), p.stability, 100, `${Math.round(p.stability)}%`);
    this.vitalBar(vitals, t('pv.pollution'), p.pollution, 100, `${Math.round(p.pollution)}%`);

    // score parts
    el('div', { text: t('report.parts'), parent: inner, style: { fontSize: '0.72em', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: '6px' } });
    const pr = el('div', { cls: 'report-parts', parent: inner });
    const rows: [string, number][] = [
      ['report.part.life', parts.life], ['report.part.climate', parts.climate], ['report.part.water', parts.water],
      ['report.part.tech', parts.tech], ['report.part.networks', parts.networks], ['report.part.habitats', parts.habitats],
      ['report.part.objectives', parts.objectives], ['report.part.efficiency', parts.efficiency], ['report.part.pollution', parts.pollution],
    ];
    for (const [k, v] of rows) {
      const r = el('div', { cls: 'row', parent: pr });
      el('span', { text: t(k), parent: r });
      el('b', { text: String(v), parent: r });
    }

    const st = el('div', { cls: 'report-stats', parent: inner });
    this.stat(st, t('report.cycle'), g.cycle);
    this.stat(st, t('report.cycle'), g.cycle);
    this.stat(st, t('report.placed'), g.stats.placed);
    this.stat(st, t('report.events'), g.stats.eventsSeen);
    this.stat(st, t('report.decisions'), g.stats.decisionsMade);
    this.stat(st, t('report.combos'), g.stats.combos);
    this.stat(st, t('report.yours'), best);

    const btns = el('div', { style: { display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '18px' } });
    inner.appendChild(btns);
    const cont = el('button', { cls: 'btn', text: t('hud.continue'), parent: btns });
    cont.addEventListener('click', () => { this.close(); this.hooks.onContinue(); });
    const again = el('button', { cls: 'btn primary', text: t('report.new'), parent: btns });
    again.addEventListener('click', () => { this.close(); this.hooks.onNewGame(); });
    const menu = el('button', { cls: 'btn', text: t('report.menu'), parent: btns });
    menu.addEventListener('click', () => { this.close(); this.hooks.onMenu(); });
  }

  private stopPlay(btn: HTMLButtonElement): void {
    this.playing = false;
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
    btn.textContent = '▶ ' + t('report.play');
    if (this.slider && this.onFrame) this.applyFrame(Number(this.slider.value));
  }

  private applyFrame(c: number): void {
    if (this.labelCycle) this.labelCycle.textContent = `${t('hud.cycle')} ${c}`;
    this.onFrame?.(c);
  }

  /** replay current slider frame to the renderer (used on close to restore) */
  restore(): void {
    this.hooks.onReplayFrame(null);
  }

  private vitalBar(parent: HTMLElement, label: string, pct: number, max: number, valText: string): void {
    const v = el('div', { cls: 'vital', parent });
    const trow = el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '0.8em', color: 'var(--dim)' } });
    el('span', { text: label, parent: trow });
    el('b', { text: valText, parent: trow, style: { color: 'var(--text)', fontFamily: 'var(--serif-num)' } });
    v.appendChild(trow);
    const bar = el('div', { cls: 'gauge', parent: v });
    const f = el('div', { parent: bar, style: { width: '0%' } });
    f.style.background = label.includes('%') ? '' : 'linear-gradient(90deg,#2e6f9a,#6ec8ff)';
    setTimeout(() => { f.style.width = `${Math.min(100, (pct / max) * 100)}%`; }, 80);
  }

  private stat(parent: HTMLElement, label: string, val: number): void {
    const d = el('div', { parent });
    el('b', { text: String(val), parent: d });
    el('span', { text: label, parent: d, style: { fontSize: '0.8em' } });
  }

  private animateNum(node: HTMLElement, target: number, dur: number): void {
    const t0 = performance.now();
    const step = () => {
      const f = Math.min(1, (performance.now() - t0) / dur);
      node.textContent = String(Math.round(target * (1 - Math.pow(1 - f, 3))));
      if (f < 1) requestAnimationFrame(step);
    };
    step();
  }

  close(): void {
    if (this.timer) window.clearInterval(this.timer);
    this.playing = false;
    this.onFrame = null;
    this.hooks.onReplayFrame(null);
    this.root?.remove();
    this.root = null;
  }

  get visible(): boolean {
    return this.root !== null;
  }
}

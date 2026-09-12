/**
 * App: glues simulation, renderer, HUD, modals, menu, report, audio, save.
 * The sim only advances through actions — opening menus never changes it.
 */
import { GameRenderer } from './render/renderer';
import { Hud, type TraySel, type RenderInfo } from './ui/hud';
import { Modals } from './ui/modals';
import { MainMenu } from './ui/menu';
import { Report } from './ui/report';
import { DebugPanel } from './ui/debug';
import { AudioEngine } from './audio/audio';
import { loadSettings, saveSettings, type Settings } from './save/settings';
import { t, getLang, setLang } from './i18n';
import {
  newGame, saveGame, loadGame, hasSave, clearSave, loadMeta, saveMeta,
  act, deriveAll, aggregateTechs, checkPlacement, previewPlacement, openSandbox,
  snapshotAt, dailySeed,
} from './sim/ui-facade';
import type { Derived, GameState, GameMode, Fx } from './sim/ui-facade';
import { BIOMES, STRUCTURES, TECHS, RES_IDS } from './sim/defs';
import type { Preview } from './sim/actions';
import { el, signed } from './ui/dom';

export class App {
  private root: HTMLElement;
  private canvas: HTMLCanvasElement;
  private renderer!: GameRenderer;
  private hud!: Hud;
  private modals!: Modals;
  private menu!: MainMenu;
  private report!: Report;
  private debug!: DebugPanel;
  audio = new AudioEngine();
  settings: Settings;
  private g: GameState | null = null;
  private derived: Derived | null = null;
  private sel: TraySel = null;
  private valid: number[] = [];
  private inspect: number | null = null;
  private preview: Preview | null = null;
  private previewTile: number | null = null;
  private inMenu = true;
  private muted = false;
  private gridShown = false;
  private netShown = false;
  private meta = loadMeta();
  private keysDown = new Set<string>();

  constructor(root: HTMLElement) {
    this.settings = loadSettings();
    this.root = root;
    this.canvas = el('canvas', { cls: 'gl', parent: root }) as HTMLCanvasElement;
    window.addEventListener('pointerdown', () => { this.audio.init(); }, { once: true });

    this.renderer = new GameRenderer(this.canvas, {
      onTileClick: (i) => this.onTileClick(i),
      onTileHover: (i) => this.onTileHover(i),
      onFloatText: (i, text, tone) => this.hud.spawnFloat(i, text, tone),
      onMilestoneFlash: (tone) => this.hud.milestoneFlash(tone),
    });
    this.renderer.setKeys(this.keysDown);

    const hudHooks = {
      onSelectAction: (s: TraySel) => this.selectAction(s),
      onWait: () => this.doWait(),
      onOpenTech: () => { if (this.g) this.modals.showTech(this.g); },
      onOpenHelp: () => this.modals.showHelp(),
      onOpenSettings: () => this.modals.showSettings(this.settings),
      onMenu: () => this.showMenu(),
      onToggleLang: () => this.setLang(getLang() === 'ru' ? 'en' : 'ru'),
      onToggleMute: () => this.toggleMute(),
      onToggleLog: () => this.render(),
    };
    this.hud = new Hud(root, hudHooks);
    this.hud.show(false);
    this.hud.setProjector((i) => {
      const w = this.renderer.tileWorld(i);
      if (!w) return null;
      w.y += 0.7;
      return this.renderer.project(w);
    });

    this.modals = new Modals(root, {
      onChoose: (opt) => this.resolveChoice(opt),
      onPickTech: (tech) => this.pickTech(tech),
      onSettings: (partial) => this.updateSettings(partial),
      onDeleteSave: () => { clearSave(); this.menu.setHasSave(false); this.hud.toast(t('st.saved'), 'info'); },
      onRecommendQuality: () => this.renderer.autoQuality,
      onLanguage: (l) => this.setLang(l),
    });

    this.report = new Report(root, {
      onReplayFrame: (c) => this.replayFrame(c),
      onNewGame: () => { this.g = null; this.showMenu(); },
      onMenu: () => this.showMenu(),
      onContinue: () => {
        if (!this.g) return;
        const g = openSandbox(this.g);
        this.commitState(g, []);
      },
    }, this.settings.reduceMotion);
    this.report.onFrame = (c) => {
      if (!this.g) return;
      this.renderer.setReplayFrame(snapshotAt(this.g, c));
    };

    this.debug = new DebugPanel(root, this.renderer, {
      onRegenerate: () => { if (this.g) this.startGame(this.g.mode, Math.random().toString(36).slice(2, 8).toUpperCase(), this.g.mapR); },
      onAdvance: (n) => { for (let k = 0; k < n && this.g && !this.g.pendingChoice && !this.g.end; k++) this.doWait(true); },
      onGive: () => { if (this.g) { (Object.keys(this.g.res) as (keyof GameState['res'])[]).forEach((k) => { this.g!.res[k] += 900; }); this.commitState(this.g, []); } },
      onUnlockAll: () => {
        if (!this.g) return;
        for (const id of Object.keys(TECHS)) if (!this.g.techDone.includes(id)) this.g.techDone.push(id);
        this.commitState(this.g, []);
      },
      onToggleGrid: () => { this.renderer.setGrid(!this.gridShown); this.render(); },
      onSave: () => { if (this.g) { saveGame(this.g); this.hud.toast('saved ✓', 'info'); } },
      onLoad: () => this.tryLoad(),
    });
    this.debug.show(this.settings.debug || location.search.includes('debug'));
    this.debug.update(null);

    this.buildMenu();
    this.applySettings(this.settings, true);
    this.setupMenuPreview();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.setInterval(() => { if (this.g) this.debug.update(this.g); else this.debug.update(null); }, 500);
  }

  // -------------------------------------------------------------------------
  private buildMenu(): void {
    this.menu = new MainMenu(this.root, {
      onStart: (mode, seed, mapR) => this.startGame(mode, seed, mapR),
      onContinue: () => this.tryLoad(),
      onSettings: () => this.modals.showSettings(this.settings),
      onHelp: () => this.modals.showHelp(),
      onToggleLang: () => this.setLang(getLang() === 'ru' ? 'en' : 'ru'),
    }, hasSave(), this.meta);
  }

  private setupMenuPreview(): void {
    const g = newGame('MENU', 'standard', 10);
    this.renderer.setGame(g);
    this.renderer.autoRotate = true;
    this.audio.setAmbientMenu();
  }

  private showMenu(): void {
    this.inMenu = true;
    this.hud.show(false);
    this.modals.close();
    this.report.close();
    this.menu.setHasSave(hasSave());
    this.menu.show(true);
    this.renderer.autoRotate = true;
    if (!this.g) this.setupMenuPreview();
    else this.renderer.sync(this.g, this.derived ?? undefined);
  }

  private startGame(mode: GameMode, seedRaw: string, mapR: number): void {
    const seed = mode === 'daily'
      ? dailySeed()
      : (seedRaw && seedRaw.length ? seedRaw : Math.random().toString(36).slice(2, 8).toUpperCase());
    const g = newGame(seed, mode, mapR);
    this.inMenu = false;
    this.g = g;
    this.sel = null;
    this.valid = [];
    this.inspect = null;
    this.preview = null;
    this.menu.show(false);
    this.report.close();
    this.modals.close();
    this.hud.show(true);
    this.renderer.autoRotate = false;
    this.renderer.setGame(g);
    this.renderer.focusHub();
    this.commitState(g, []);
    this.audio.init();
    if (!localStorage.getItem('tf_seen_intro')) {
      localStorage.setItem('tf_seen_intro', '1');
      setTimeout(() => this.hud.toast(t('help.t1'), 'info', 5200), 900);
      setTimeout(() => this.hud.toast(t('help.t2'), 'info', 5200), 6800);
    }
  }

  private tryLoad(): void {
    const g = loadGame();
    if (!g) { this.hud.toast(t('err.invalid'), 'bad'); return; }
    this.inMenu = false;
    this.g = g;
    this.menu.show(false);
    this.hud.show(true);
    this.renderer.autoRotate = false;
    this.renderer.setGame(g);
    this.commitState(g, []);
    this.audio.init();
  }

  // -------------------------------------------------------------------------
  // actions
  // -------------------------------------------------------------------------

  private onTileClick(i: number | null): void {
    if (this.inMenu || !this.g) return;
    if (i === null) {
      this.inspect = null;
      this.renderer.setSelection(null);
      this.render();
      return;
    }
    if (this.sel && this.valid.includes(i)) {
      const a = this.sel.kind === 'biome'
        ? ({ type: 'place', tile: i, biome: this.sel.id } as const)
        : ({ type: 'place', tile: i, structure: this.sel.id } as const);
      const prev = this.derived;
      const def = this.sel.kind === 'biome' ? BIOMES[this.sel.id] : STRUCTURES[this.sel.id];
      const r = act(this.g, a);
      if (r.error) {
        this.audio.error();
        this.hud.toast(t(r.error), 'bad');
        return;
      }
      this.audio.place();
      this.inspect = i;
      this.commitState(r.state, r.fx, {
        name: t(def.descKey), icon: def.icon, prev: prev ?? undefined,
      });
      if (r.state.stats.placed === 1 && !localStorage.getItem('tf_seen_place')) {
        localStorage.setItem('tf_seen_place', '1');
        setTimeout(() => this.hud.toast(t('help.t3'), 'info', 6000), 2600);
      }
      return;
    }
    this.inspect = i;
    this.renderer.setSelection(i);
    this.audio.tick();
    if (i !== this.g.hubIndex) this.render();
    else { this.renderer.focusTile(i); this.render(); }
  }

  private onTileHover(i: number | null): void {
    if (!this.g) return;
    if (this.sel && i !== null && this.valid.includes(i)) {
      this.preview = previewPlacement(
        this.g, i,
        this.sel.kind === 'biome' ? this.sel.id : undefined,
        this.sel.kind === 'struct' ? this.sel.id : undefined,
      );
      this.previewTile = i;
      const col = this.sel.kind === 'biome' ? BIOMES[this.sel.id].color : STRUCTURES[this.sel.id].color;
      this.renderer.setGhost(i, this.preview.ok, col as [number, number, number]);
    } else {
      this.preview = null;
      this.previewTile = null;
      this.renderer.setGhost(null, false, [1, 1, 1]);
    }
    this.render();
  }

  private selectAction(sel: TraySel, silent = false): void {
    if (!silent) this.audio.ui();
    this.sel = sel;
    this.valid = [];
    if (sel && this.g) {
      const agg = aggregateTechs(this.g);
      for (let i = 0; i < this.g.tiles.length; i++) {
        if (!this.g.inTerritory[i]) continue;
        const c = checkPlacement(this.g, agg, i, sel.kind === 'biome' ? sel.id : undefined, sel.kind === 'struct' ? sel.id : undefined);
        if (c.ok || c.reason === 'err.cost') this.valid.push(i);
      }
    }
    this.preview = null;
    this.renderer.setValidTiles(this.valid);
    this.renderer.setGhost(null, false, [1, 1, 1]);
    this.render();
  }

  private doWait(silent = false): void {
    if (!this.g || this.g.end) return;
    const r = act(this.g, { type: 'wait' });
    if (r.error) return;
    if (!silent) this.audio.tick();
    this.commitState(r.state, r.fx);
  }

  private pickTech(tech: string): void {
    if (!this.g) return;
    const r = act(this.g, { type: 'research', tech });
    if (r.error) { this.hud.toast(t(r.error), 'bad'); return; }
    this.audio.ui();
    this.commitState(r.state, r.fx);
  }

  private resolveChoice(opt: number): void {
    if (!this.g || !this.g.pendingChoice) return;
    const evId = this.g.pendingChoice.eventId;
    const before = {
      res: { ...this.g.res },
      planet: { ...this.g.planet } as unknown as Record<string, number>,
      biomes: this.g.tiles.map((x) => x.biome),
    };
    const r = act(this.g, { type: 'choice', eventId: evId, option: opt });
    if (r.error) { this.hud.toast(t(r.error), 'bad'); return; }
    this.audio.decision();
    this.commitState(r.state, r.fx);
    // tell the player concretely what the decision changed
    const parts: string[] = [];
    const resIc: Record<string, string> = { water: '💧', minerals: '⛏', energy: '⚡', biomass: '🌿', research: '🔬' };
    for (const k of RES_IDS) {
      const d = r.state.res[k] - before.res[k];
      if (Math.abs(d) >= 0.5) parts.push(`${signed(d, 0)}${resIc[k]}`);
    }
    const plIc: [string, string][] = [
      ['temp', '🌡'], ['oxygen', '🫧'], ['humidity', '💦'], ['bio', '🌱'],
      ['pollution', '🏭'], ['stability', '⚖'], ['water', '💧'], ['pressure', '🌬'],
    ];
    const ap = r.state.planet as unknown as Record<string, number>;
    for (const [k, ic] of plIc) {
      const d = ap[k] - before.planet[k];
      if (Math.abs(d) >= 0.4) parts.push(`${signed(d, 1)}${ic}`);
    }
    let changedTiles = 0;
    r.state.tiles.forEach((x, i) => { if (x.biome !== before.biomes[i]) changedTiles++; });
    if (changedTiles > 0) parts.push(`↻ ${changedTiles} ${t('ui.tiles')}`);
    if (parts.length > 0) {
      const txt = `⚡ ${t(`ev.${evId}`)}: ${parts.join('  ')}`;
      this.hud.toast(txt, 'info', 4600);
      this.hud.logLine(r.state.cycle, txt, 'info');
    }
  }

  // -------------------------------------------------------------------------
  // commit
  // -------------------------------------------------------------------------

  private commitState(g: GameState, fx: Fx[], extra?: { name?: string; icon?: string; prev?: Derived }): void {
    this.g = g;
    this.derived = deriveAll(g, aggregateTechs(g));
    this.renderer.sync(g, this.derived);
    this.renderer.playFx(fx);
    this.playFxSounds(fx);
    this.playFxToasts(fx);
    if (extra?.prev && extra.name && this.derived) {
      const s = this.summarizeDelta(extra.prev, this.derived);
      const txt = `${extra.icon ?? ''} ${extra.name}${s ? `: ${s}` : ''}`;
      this.hud.toast(txt, 'good', 3400);
      this.hud.logLine(g.cycle, txt, 'good');
    }
    if (g.pendingChoice) {
      setTimeout(() => {
        if (this.g?.pendingChoice && this.modals.open === 'none') this.modals.showEvent(this.g);
      }, 700);
    }
    const p = g.planet;
    this.audio.setMood({ phase: g.phase, bio: p.bio, pollution: p.pollution, humidity: p.humidity, stability: p.stability });
    saveGame(g);
    if (g.end) this.onGameEnd();
    if (this.sel) this.selectAction(this.sel, true); // recompute validity (territory/costs changed)
    else this.render();
  }

  /** human-readable "what changed" line after a placement */
  private summarizeDelta(prev: Derived, next: Derived): string {
    const icons: Record<string, string> = { water: '💧', minerals: '⛏', energy: '⚡', biomass: '🌿', research: '🔬' };
    const parts: string[] = [];
    for (const k of RES_IDS) {
      const d = (next.totals.prod[k] - next.totals.use[k]) - (prev.totals.prod[k] - prev.totals.use[k]);
      if (Math.abs(d) >= 0.05) parts.push(`${signed(d, 1)}${icons[k]}`);
    }
    const pd: [string, number][] = [
      ['🫧', next.totals.dOxy - prev.totals.dOxy],
      ['🌡', next.totals.dTemp - prev.totals.dTemp],
      ['🏭', next.totals.dPoll - prev.totals.dPoll],
    ];
    for (const [ic, d] of pd) if (Math.abs(d) >= 0.005) parts.push(`${signed(d, 2)}${ic}/c`);
    const before = new Set(prev.combosFound.map((c) => `${c.id}:${c.tiles.join(',')}`));
    for (const c of next.combosFound) {
      if (!before.has(`${c.id}:${c.tiles.join(',')}`)) {
        parts.push(`✦ ${t(`combo.${c.id}`)}!`);
      }
    }
    return parts.slice(0, 6).join('  ');
  }

  private playFxSounds(fx: Fx[]): void {
    for (const f of fx) {
      switch (f.kind) {
        case 'transform': this.audio.transform(); break;
        case 'combo': this.audio.combo(); break;
        case 'unlock': this.audio.unlock(); break;
        case 'milestone': this.audio.milestone(); break;
        case 'event': this.audio.eventBad(); break;
        default: break;
      }
    }
  }

  private playFxToasts(fx: Fx[]): void {
    let n = 0;
    for (const f of fx) {
      if (f.kind === 'milestone') {
        const key = f.key;
        const tone = f.tone;
        setTimeout(() => this.hud.toast(t(key), tone), 300 + n * 520);
        n++;
      } else if (f.kind === 'unlock') {
        const name = f.what === 'tech' ? t(TECHS[f.id]?.descKey ?? '') : '';
        setTimeout(() => this.hud.toast(`${t('st.unlocked')} ${name}`, 'good'), 300 + n * 520);
        n++;
      }
    }
  }

  private onGameEnd(): void {
    const g = this.g!;
    const best = this.meta.bestScores[g.mode] ?? 0;
    if (g.score > best) {
      this.meta.bestScores[g.mode] = g.score;
      saveMeta(this.meta);
    }
    this.hud.show(false);
    setTimeout(() => {
      if (g.end?.type === 'victory') this.audio.win(); else this.audio.lose();
      this.report.show(g, Math.max(best, g.score));
    }, this.settings.reduceMotion ? 100 : 1200);
  }

  private replayFrame(c: number | null): void {
    if (!this.g) return;
    if (c === null) {
      this.renderer.setReplayFrame(null);
      this.renderer.sync(this.g, this.derived ?? undefined);
      this.renderer.autoRotate = false;
      this.hud.show(true);
      this.render();
    } else {
      this.renderer.autoRotate = true;
      this.renderer.setReplayFrame(snapshotAt(this.g, c));
    }
  }

  // -------------------------------------------------------------------------
  // render
  // -------------------------------------------------------------------------

  private render(): void {
    if (!this.g || !this.derived) return;
    const info: RenderInfo = {
      g: this.g,
      derived: this.derived,
      sel: this.sel,
      preview: this.preview,
      previewTile: this.previewTile,
      inspectTile: this.inspect,
      muted: this.muted,
    };
    this.hud.render(info);
  }

  private renderAll(): void {
    this.render();
    if (this.modals.open === 'settings') this.modals.showSettings(this.settings);
    else if (this.modals.open === 'tech' && this.g) this.modals.showTech(this.g);
  }

  // -------------------------------------------------------------------------
  // settings / language / keys
  // -------------------------------------------------------------------------

  private updateSettings(partial: Partial<Settings>): void {
    this.settings = { ...this.settings, ...partial };
    saveSettings(this.settings);
    this.applySettings(this.settings);
  }

  private applySettings(s: Settings, initial = false): void {
    document.documentElement.style.setProperty('--ui-scale', String(s.uiScale));
    this.root.classList.toggle('hc', s.highContrast);
    this.root.classList.toggle('cb', s.colorblind);
    this.renderer.reduceMotion = s.reduceMotion;
    this.report.reduceMotion = s.reduceMotion;
    this.audio.setMusic(s.music);
    this.audio.setSfx(s.sfx);
    this.audio.setVolume(s.volume);
    if (s.quality === 'auto') {
      this.renderer.fpsAuto = true;
      if (initial) this.renderer.setQuality(this.renderer.autoQuality);
    } else {
      this.renderer.fpsAuto = false;
      this.renderer.setQuality(s.quality);
    }
    this.debug.show(s.debug || location.search.includes('debug'));
    saveSettings(s);
  }

  setLang(lang: 'en' | 'ru'): void {
    setLang(lang);
    this.audio.ui();
    this.menu.rebuild();
    this.buildMenu();
    this.hud.refreshStatic();
    this.renderAll();
  }

  private toggleMute(): void {
    this.muted = !this.muted;
    this.audio.setMuted(this.muted);
    this.render();
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const code = e.code;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(code)) {
      this.keysDown.add(code.toLowerCase().replace('key', '').replace('arrow', ''));
      e.preventDefault();
      return;
    }
    if (code === 'KeyQ') this.keysDown.add('q');
    if (code === 'KeyE') this.keysDown.add('e');
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (code === 'Escape') {
      if (this.modals.open !== 'none') { this.modals.close(); return; }
      if (this.sel) { this.selectAction(null); return; }
      if (this.inMenu || this.report.visible) return;
      this.showMenu();
      return;
    }
    if (this.inMenu || this.report.visible) return;
    if (/^Digit[1-9]$/.test(code)) { this.hud.selectByHotkey(Number(code.slice(5))); return; }
    if (code === 'KeyT') { if (this.g) this.modals.showTech(this.g); return; }
    if (code === 'KeyO') { this.renderer.setNetworks(!this.netShown); this.netShown = !this.netShown; return; }
    if (code === 'KeyG') { this.gridShown = !this.gridShown; this.renderer.setGrid(this.gridShown); return; }
    if (code === 'KeyF') { this.renderer.focusHub(); return; }
    if (code === 'KeyM') { this.toggleMute(); return; }
    if (code === 'Space' || code === 'Enter') { e.preventDefault(); this.doWait(); return; }
    if (code === 'Equal' || code === 'NumpadAdd') { this.renderer.cam.zoomBy(1 / 1.15); return; }
    if (code === 'Minus' || code === 'NumpadSubtract') { this.renderer.cam.zoomBy(1.15); return; }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const code = e.code;
    this.keysDown.delete(code.toLowerCase().replace('key', '').replace('arrow', ''));
    if (code === 'KeyQ') this.keysDown.delete('q');
    if (code === 'KeyE') this.keysDown.delete('e');
  };
}

/**
 * Procedural audio: everything is synthesized in the browser (no assets).
 * Ambient layers grow with the biosphere; dark layers respond to crisis.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private pads: { osc: OscillatorNode; gain: GainNode }[] = [];
  private drone!: { osc: OscillatorNode; gain: GainNode; filt: BiquadFilterNode };
  private wind!: { src: AudioBufferSourceNode; gain: GainNode; filt: BiquadFilterNode };
  private shimmer!: { src: AudioBufferSourceNode; gain: GainNode; filt: BiquadFilterNode };
  private delay!: DelayNode;
  private scheduler: number | null = null;
  private nextBar = 0;
  private barIdx = 0;
  private lastHover = 0;
  private muted = false;
  volume = 1;
  musicVol = 0.7;
  sfxVol = 0.85;

  /** call from a user gesture */
  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const AC: typeof AudioContext = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    } catch {
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(c.destination);
    this.musicBus = c.createGain();
    this.musicBus.gain.value = 0.55 * this.musicVol;
    this.musicBus.connect(this.master);
    this.sfxBus = c.createGain();
    this.sfxBus.gain.value = this.sfxVol;
    this.sfxBus.connect(this.master);

    // noise buffer
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // echo for plucks
    this.delay = c.createDelay(2);
    this.delay.delayTime.value = 0.42;
    const fb = c.createGain();
    fb.gain.value = 0.32;
    const wet = c.createGain();
    wet.gain.value = 0.5;
    this.delay.connect(fb); fb.connect(this.delay);
    this.delay.connect(wet); wet.connect(this.musicBus);

    // pad voices
    for (let k = 0; k < 4; k++) {
      const osc = c.createOscillator();
      osc.type = k === 0 ? 'sawtooth' : k === 3 ? 'sine' : 'triangle';
      const filt = c.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 550;
      filt.Q.value = 0.7;
      const gain = c.createGain();
      gain.gain.value = 0.0001;
      osc.connect(filt); filt.connect(gain); gain.connect(this.musicBus);
      osc.start();
      this.pads.push({ osc, gain });
    }
    // sub drone (danger)
    {
      const osc = c.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 41;
      const filt = c.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = 90;
      const gain = c.createGain();
      gain.gain.value = 0.0001;
      osc.connect(filt); filt.connect(gain); gain.connect(this.musicBus);
      osc.start();
      this.drone = { osc, gain, filt };
    }
    // wind layer
    {
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const filt = c.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.value = 320;
      filt.Q.value = 0.5;
      const gain = c.createGain();
      gain.gain.value = 0.0001;
      src.connect(filt); filt.connect(gain); gain.connect(this.musicBus);
      src.start();
      this.wind = { src, gain, filt };
    }
    // airy shimmer (life)
    {
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const filt = c.createBiquadFilter();
      filt.type = 'highpass';
      filt.frequency.value = 4000;
      const gain = c.createGain();
      gain.gain.value = 0.0001;
      src.connect(filt); filt.connect(gain); gain.connect(this.musicBus);
      src.start();
      this.shimmer = { src, gain, filt };
    }
    this.scheduler = window.setInterval(() => this.schedule(), 600);
    this.applyMood();
  }

  dispose(): void {
    if (this.scheduler !== null) window.clearInterval(this.scheduler);
    this.scheduler = null;
    void this.ctx?.close();
    this.ctx = null;
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.ctx) this.master.gain.value = this.muted ? 0 : v;
  }
  setMusic(v: number): void {
    this.musicVol = v;
    if (this.ctx) this.musicBus.gain.value = 0.55 * v;
  }
  setSfx(v: number): void {
    this.sfxVol = v;
    if (this.ctx) this.sfxBus.gain.value = v;
  }
  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ctx) this.master.gain.value = m ? 0 : this.volume;
  }

  // -------------------------------------------------------------------------
  // mood
  // -------------------------------------------------------------------------
  private mood = { richness: 0, danger: 0, wet: 0.2 };

  setMood(g: { phase: number; bio: number; pollution: number; humidity: number; stability: number }): void {
    this.mood.richness = Math.max(0, Math.min(1, (g.bio / 70) * 0.55 + (g.phase - 1) / 5 * 0.45));
    this.mood.danger = Math.max(0, Math.min(1, (g.pollution / 90) * 0.6 + Math.max(0, 40 - g.stability) / 40 * 0.6));
    this.mood.wet = Math.max(0, Math.min(1, g.humidity / 90));
    this.applyMood();
  }

  setAmbientMenu(): void {
    this.mood = { richness: 0.25, danger: 0.15, wet: 0.1 };
    this.applyMood();
  }

  private applyMood(): void {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const { richness, danger, wet } = this.mood;
    this.pads.forEach((p, i) => {
      p.gain.gain.setTargetAtTime(i < 2 + Math.floor(richness * 2) ? 0.016 + richness * 0.02 : 0.0001, t, 3);
      p.osc.detune.setTargetAtTime((i - 1.5) * (4 + richness * 8), t, 2);
    });
    this.drone.gain.gain.setTargetAtTime(0.0001 + danger * 0.05, t, 2.5);
    this.wind.gain.gain.setTargetAtTime(0.004 + (1 - richness) * 0.012 + wet * 0.004, t, 3);
    this.shimmer.gain.gain.setTargetAtTime(0.0001 + richness * richness * 0.008, t, 4);
  }

  private schedule(): void {
    if (!this.ctx || this.muted) return;
    const c = this.ctx;
    if (this.nextBar < c.currentTime) this.nextBar = c.currentTime + 0.1;
    while (this.nextBar < c.currentTime + 1.5) {
      this.playBar(this.nextBar);
      this.nextBar += 6.2;
      this.barIdx++;
    }
  }

  private static midiToHz(m: number): number {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  private playBar(t0: number): void {
    const c = this.ctx;
    if (!c) return;
    const { richness } = this.mood;
    // progressions: barren (aeolian dark), middle (minor 7), living (major add9)
    const rootsBarren = [45, 41, 43, 40];
    const rootsMid = [45, 48, 50, 43];
    const rootsLife = [48, 53, 55, 50];
    const pick = (arr: number[]) => arr[this.barIdx % arr.length];
    const root = Math.round(pick(rootsBarren) * (1 - richness) + (richness > 0.55 ? pick(rootsLife) : pick(rootsMid)) * Math.min(1, richness < 0.55 ? 1 - (1 - richness * 1.6) * 0.5 : richness));
    const chord = [root, root + (richness > 0.5 ? 4 : 3), root + 7, root + (richness > 0.7 ? 11 : richness > 0.3 ? 10 : 12)];
    this.pads.forEach((p, i) => {
      p.osc.frequency.cancelScheduledValues(t0);
      p.osc.frequency.setTargetAtTime(AudioEngine.midiToHz(chord[i % chord.length] + (i === 3 ? 12 : 0)), t0, 2.4);
    });
    // pluck melody: pentatic, denser with life
    const scale = richness > 0.5 ? [0, 2, 4, 7, 9, 12, 16] : [0, 3, 5, 7, 10, 12];
    const nPlucks = Math.floor(richness * 3) + (Math.random() < 0.4 + richness * 0.3 ? 1 : 0);
    for (let k = 0; k < nPlucks; k++) {
      const when = t0 + 0.6 + Math.random() * 5;
      const note = root + 24 + scale[Math.floor(Math.random() * scale.length)];
      this.pluck(when, AudioEngine.midiToHz(note), 0.028 + richness * 0.02);
    }
  }

  private pluck(t0: number, hz: number, gain: number): void {
    const c = this.ctx;
    if (!c) return;
    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = hz;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.8);
    osc.connect(g);
    g.connect(this.musicBus);
    g.connect(this.delay);
    osc.start(t0);
    osc.stop(t0 + 2);
  }

  // -------------------------------------------------------------------------
  // sfx
  // -------------------------------------------------------------------------
  private tone(t0: number, hz: number, dur: number, type: OscillatorType, gain: number, glide = 0): void {
    const c = this.ctx;
    if (!c) return;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(hz, t0);
    if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, hz + glide), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(this.sfxBus);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }

  private noise(t0: number, dur: number, hz: number, q: number, gain: number): void {
    const c = this.ctx;
    if (!c) return;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = hz;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.sfxBus);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  private now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  ui(): void {
    if (!this.ctx) return;
    this.tone(this.now(), 880, 0.05, 'triangle', 0.05);
  }
  hover(): void {
    if (!this.ctx) return;
    const n = performance.now();
    if (n - this.lastHover < 60) return;
    this.lastHover = n;
    this.tone(this.now(), 1750, 0.025, 'sine', 0.012);
  }
  place(): void {
    if (!this.ctx) return;
    const t0 = this.now();
    this.tone(t0, 130, 0.16, 'sine', 0.18, -60);
    this.noise(t0 + 0.02, 0.12, 900, 1.2, 0.07);
  }
  transform(): void {
    if (!this.ctx) return;
    const t0 = this.now();
    this.tone(t0, 240, 0.5, 'triangle', 0.06, 460);
    this.noise(t0, 0.5, 500, 0.8, 0.05);
  }
  combo(): void {
    if (!this.ctx) return;
    const t0 = this.now();
    [523, 659, 784, 1046].forEach((f, i) => this.tone(t0 + i * 0.07, f, 0.28, 'triangle', 0.07));
  }
  unlock(): void {
    if (!this.ctx) return;
    const t0 = this.now();
    this.tone(t0, 1318, 0.8, 'sine', 0.06);
    this.tone(t0 + 0.001, 1975, 0.5, 'sine', 0.025);
  }
  eventBad(): void {
    if (!this.ctx) return;
    const t0 = this.now();
    this.tone(t0, 90, 0.5, 'square', 0.06, -40);
    this.noise(t0, 0.7, 220, 0.6, 0.08);
  }
  eventGood(): void {
    if (!this.ctx) return;
    const t0 = this.now();
    [392, 523, 659].forEach((f, i) => this.tone(t0 + i * 0.09, f, 0.4, 'sine', 0.05));
  }
  decision(): void {
    if (!this.ctx) return;
    const t0 = this.now();
    this.tone(t0, 196, 0.35, 'triangle', 0.07);
    this.tone(t0 + 0.14, 233, 0.4, 'triangle', 0.06);
  }
  milestone(): void {
    if (!this.ctx) return;
    const t0 = this.now();
    [262, 330, 392, 523].forEach((f, i) => this.tone(t0 + i * 0.05, f, 1.1, 'sine', 0.045));
  }
  error(): void {
    if (!this.ctx) return;
    this.tone(this.now(), 130, 0.14, 'square', 0.05, -30);
  }
  win(): void {
    if (!this.ctx) return;
    const t0 = this.now();
    [330, 392, 494, 587, 659, 784].forEach((f, i) => this.tone(t0 + i * 0.14, f, 0.9, 'triangle', 0.05));
  }
  lose(): void {
    if (!this.ctx) return;
    const t0 = this.now();
    [330, 294, 262, 196].forEach((f, i) => this.tone(t0 + i * 0.3, f, 1.2, 'sine', 0.05, -20));
  }
  tick(): void {
    if (!this.ctx) return;
    this.tone(this.now(), 660, 0.06, 'sine', 0.03);
  }
}

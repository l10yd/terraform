/**
 * Adaptive graphics quality: presets + runtime fps governor.
 */
export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra';

export interface QualityPreset {
  vegScale: number; // instance budget multiplier
  tufts: boolean;
  particles: number; // multiplier
  clouds: number;
  waterDetail: number;
  maxPixelRatio: number;
}

export const PRESETS: Record<QualityLevel, QualityPreset> = {
  low: { vegScale: 0.25, tufts: false, particles: 0.2, clouds: 4, waterDetail: 0, maxPixelRatio: 1 },
  medium: { vegScale: 0.5, tufts: true, particles: 0.5, clouds: 8, waterDetail: 1, maxPixelRatio: 1.25 },
  high: { vegScale: 1.0, tufts: true, particles: 1.0, clouds: 12, waterDetail: 2, maxPixelRatio: 1.6 },
  ultra: { vegScale: 1.6, tufts: true, particles: 1.6, clouds: 18, waterDetail: 2, maxPixelRatio: 2 },
};

export class FpsGovernor {
  private frames = 0;
  private acc = 0;
  fps = 60;
  private degraded = false;
  onAutoDrop: ((q: QualityLevel) => void) | null = null;
  private auto: QualityLevel = 'high';

  constructor() {
    const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8;
    const cores = navigator.hardwareConcurrency ?? 8;
    const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    this.auto = mobile ? 'medium' : cores >= 8 && mem >= 8 ? 'ultra' : cores >= 4 ? 'high' : 'medium';
  }

  get recommended(): QualityLevel {
    return this.auto;
  }

  tick(dt: number): void {
    this.frames++;
    this.acc += dt;
    if (this.acc >= 1) {
      this.fps = Math.round(this.frames / this.acc);
      this.frames = 0;
      this.acc = 0;
      if (!this.degraded && this.fps < 42 && this.auto !== 'low') {
        this.degraded = true;
        const order: QualityLevel[] = ['ultra', 'high', 'medium', 'low'];
        const next = order[Math.min(order.indexOf(this.auto) + 1, 3)] as QualityLevel;
        this.auto = next;
        this.onAutoDrop?.(next);
      }
    }
  }
}

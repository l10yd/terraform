/**
 * User settings — persisted separately from game state.
 */
import type { QualityLevel } from '../render/quality';

export interface Settings {
  quality: QualityLevel | 'auto';
  music: number; // 0..1
  sfx: number; // 0..1
  reduceMotion: boolean;
  highContrast: boolean;
  colorblind: boolean;
  uiScale: number; // 0.85..1.3
  debug: boolean;
  volume: number;
}

const KEY = 'terraform_settings_v1';

export const DEFAULT_SETTINGS: Settings = {
  quality: 'auto',
  music: 0.7,
  sfx: 0.85,
  reduceMotion: false,
  highContrast: false,
  colorblind: true,
  uiScale: 1,
  debug: false,
  volume: 1,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, reduceMotion: matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false };
    const s = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...s };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch { /* ignore */ }
}

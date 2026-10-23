import type { RobotSpec } from '../sim/types';
import { PRESETS } from '../sim/presets';

const KEY = 'sumo500.robots.v1';
const SETTINGS = 'sumo500.settings.v1';

/** Robôs customizados ficam no navegador (localStorage). */
export function loadCustomRobots(): RobotSpec[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as RobotSpec[]) : [];
    return Array.isArray(list) ? list.filter((r) => r && typeof r.length === 'number' && r.wheels && r.blade) : [];
  } catch {
    return [];
  }
}

export function saveCustomRobots(list: RobotSpec[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* modo privado / armazenamento bloqueado: só não persiste */
  }
}

export function allRobots(): RobotSpec[] {
  return [...PRESETS, ...loadCustomRobots()];
}

export function isPreset(id: string) {
  return PRESETS.some((p) => p.id === id);
}

export function loadSettings<T extends object>(defaults: T): T {
  try {
    const raw = localStorage.getItem(SETTINGS);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch {
    return defaults;
  }
}

export function saveSettings(s: object) {
  try {
    localStorage.setItem(SETTINGS, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function newRobotId() {
  return 'custom-' + Math.random().toString(36).slice(2, 9);
}

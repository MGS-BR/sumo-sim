import type { RobotSpec } from '../sim/types';
import { PRESETS } from '../sim/presets';
import { normalizeSpec } from '../sim/specs';

const KEY = 'sumo500.robots.v1';
const SETTINGS = 'sumo500.settings.v1';

/** Robôs customizados ficam no navegador (localStorage). */
export function loadCustomRobots(): RobotSpec[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(list)) return [];
    // dados do navegador podem estar antigos ou editados à mão: normaliza tudo (limite de 50 robôs)
    const out: RobotSpec[] = [];
    const ids = new Set(PRESETS.map((p) => p.id));
    for (const item of list.slice(0, 50)) {
      const s = normalizeSpec(item);
      if (s && !ids.has(s.id)) {
        ids.add(s.id);
        out.push(s);
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function saveCustomRobots(list: RobotSpec[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50)));
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
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return { ...defaults };
    // só aceita chaves conhecidas e com o mesmo tipo do padrão
    const out = { ...defaults } as Record<string, unknown>;
    for (const [k, v] of Object.entries(defaults)) {
      const pv = (parsed as Record<string, unknown>)[k];
      if (typeof pv === typeof v && (typeof pv !== 'number' || Number.isFinite(pv))) out[k] = pv;
    }
    return out as T;
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

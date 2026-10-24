/**
 * Ícones SVG próprios (traço 2 px, cor = currentColor), no lugar de emojis/símbolos de texto.
 * Strings estáticas: seguras para innerHTML.
 */
const P: Record<string, string> = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  left: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  right: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke-linejoin="round"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4.8h-4.8"/>',
  swap: '<path d="M5 8h13M14.5 4.5L18 8l-3.5 3.5M19 16H6M9.5 12.5L6 16l3.5 3.5"/>',
  home: '<path d="M4 11.5L12 5l8 6.5"/><path d="M6.5 10v9.5h11V10"/>',
  save: '<path d="M5 4.5h11l3 3v12H5z"/><path d="M8.5 4.5v4.5h6v-4.5M8 19.5v-5.5h8v5.5"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5"/>',
  spin: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4.5v4.5h-4.5"/>',
  flag: '<path d="M6 21V4M6 4.5h11l-2.5 4 2.5 4H6"/>',
  dot: '<circle cx="12" cy="12" r="5" fill="currentColor" stroke="none"/>',
  ring: '<circle cx="12" cy="12" r="5"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13"/>',
  mouse: '<rect x="7" y="3.5" width="10" height="17" rx="5"/><path d="M12 7.5v3"/>',
};

export type IconName = keyof typeof P;

export function icon(name: IconName, cls = ''): string {
  return `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name]}</svg>`;
}

/** Tecla de seta como ícone dentro de <kbd> */
export const kbdArrow = (dir: 'up' | 'down' | 'left' | 'right', label: string) =>
  `<kbd aria-label="${label}">${icon(dir)}</kbd>`;

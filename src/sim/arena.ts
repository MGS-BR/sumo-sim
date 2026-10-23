/**
 * Dimensões oficiais do Mini Sumô (500g) — Regulamento RoboCore v3.1, Art. 3.
 * Todas as unidades em SI (metros). O mundo é y-para-cima, centro do dohyo na origem.
 */
export const ARENA = {
  /** Diâmetro do dohyo incluindo a tawara: 77 cm */
  dohyoRadius: 0.77 / 2,
  /** Altura do dohyo: 2,5 cm */
  dohyoHeight: 0.025,
  /** Largura da tawara (faixa branca, conta como DENTRO do dohyo): 2,5 cm */
  tawaraWidth: 0.025,
  /** Shikiri-sen: 1 cm de largura x 10 cm de comprimento */
  shikiriWidth: 0.01,
  shikiriLength: 0.1,
  /** Borda interna de cada shikiri-sen a 5 cm do centro (Fig. 5: 100 mm entre as linhas) */
  shikiriInnerX: 0.05,
  /** Yochi: quadrado de 180 cm */
  yochiSize: 1.8,
} as const;

/** Borda externa da shikiri-sen (o robô não pode passar dela no posicionamento) */
export const SHIKIRI_OUTER_X = ARENA.shikiriInnerX + ARENA.shikiriWidth;
/** Metade do comprimento da linha: a faixa de posicionamento vai de -0,05 a +0,05 em z */
export const SHIKIRI_HALF_LEN = ARENA.shikiriLength / 2;

export const GRAVITY = 9.81;

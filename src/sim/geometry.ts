import type { RobotSpec } from './types';

/**
 * Geometria de um robô derivada da spec. É a ÚNICA fonte de forma usada
 * tanto pela física (colisores) quanto pelo render (malhas) — o que você vê é o que colide.
 *
 * Referencial local: origem no centro da base, chão em y = 0 (altura nominal),
 * x para frente, y para cima, z para a direita.
 */
export interface WheelGeom {
  x: number;
  y: number;
  z: number;
  radius: number;
  width: number;
  side: 'left' | 'right';
}

export interface RobotGeometry {
  /** Pontos (x,y,z) planos do casco convexo do chassi */
  bodyHull: number[];
  /** Pontos do casco convexo da lâmina */
  bladeHull: number[];
  wheels: WheelGeom[];
  /** x da parte de trás da lâmina (onde começa o chassi) */
  bladeBackX: number;
  /** Altura da face frontal no topo (para decalques) */
  topFrontX: number;
  bodyHalfWidth: number;
  bladeHalfWidth: number;
  /** Rodas embutidas: laterais da chassi com caixas de roda em arco */
  shell: SideShell | null;
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
  /** Problemas geométricos (não de regulamento) */
  issues: string[];
  /** Avisos que não reprovam (ex.: roda aparecendo pela frente inclinada) */
  notes: string[];
}

/**
 * Lateral da chassi que envolve as rodas. É a mesma forma (perfil lateral) extrudada
 * de `zInner` até `zOuter` nos dois lados, com um arco circular de folga em volta de cada roda.
 *  - `pieces`: polígonos (x, y) exatos, para o render;
 *  - `hulls`: fatias convexas da mesma forma, para a física (Rapier só colide convexos).
 */
export interface SideShell {
  zInner: number;
  zOuter: number;
  pieces: [number, number][][];
  hulls: number[][];
  /** raio do arco (roda + folga) */
  archRadius: number;
}

const WHEEL_INSET = 0.0005; // face externa da roda 0,5 mm para dentro da lateral

/**
 * Constrói a lateral com caixas de roda. A região é x-monótona:
 *   embaixo y = max(folga do chassi, arco das rodas), em cima o perfil do topo.
 * Onde o arco passa do topo, a lateral se divide (a roda aparece pela chassi).
 */
function buildSideShell(
  topY: (x: number) => number,
  x0: number,
  x1: number,
  gc: number,
  wheels: { x: number; r: number }[],
  gap: number,
  zInner: number,
  zOuter: number,
): SideShell {
  const R = (w: { r: number }) => w.r + gap;
  const cutY = (x: number) => {
    let y = -Infinity;
    for (const w of wheels) {
      const d = x - w.x;
      const RR = R(w);
      if (Math.abs(d) <= RR) y = Math.max(y, w.r + Math.sqrt(Math.max(0, RR * RR - d * d)));
    }
    return y;
  };
  const lowY = (x: number) => Math.max(gc, cutY(x));
  // amostras: passo fino + pontos exatos nas bordas dos arcos (dos dois lados da descontinuidade)
  const xs = new Set<number>([x0, x1]);
  const eps = 1e-6;
  for (let x = x0; x < x1; x += 0.0005) xs.add(x);
  for (const w of wheels) {
    const RR = R(w);
    for (const e of [w.x - RR, w.x + RR]) if (e > x0 && e < x1) [e - eps, e + eps].forEach((v) => xs.add(v));
    for (let k = 0; k <= 48; k++) {
      const x = w.x - RR + (2 * RR * k) / 48;
      if (x > x0 && x < x1) xs.add(x);
    }
  }
  const sorted = [...xs].sort((a, b) => a - b);
  const MIN = 0.0003;
  const pieces: [number, number][][] = [];
  let run: { x: number; lo: number; hi: number }[] = [];
  const flush = () => {
    if (run.length >= 2 && run[run.length - 1].x - run[0].x > 0.0005) {
      const poly: [number, number][] = run.map((p) => [p.x, p.hi]);
      for (let i = run.length - 1; i >= 0; i--) poly.push([run[i].x, run[i].lo]);
      pieces.push(poly);
    }
    run = [];
  };
  for (const x of sorted) {
    const hi = topY(x);
    const lo = lowY(x);
    if (hi - lo > MIN) run.push({ x, lo, hi });
    else flush();
  }
  flush();

  // Física: fatias convexas. Fora dos arcos (fundo reto, topo côncavo) cada trecho já é convexo;
  // sobre os arcos, fatias estreitas (o arco entre dois pontos vira corda: erro < 0,6 mm).
  const breaks = new Set<number>();
  for (const w of wheels) {
    const RR = R(w);
    for (let k = 0; k <= 6; k++) breaks.add(w.x - RR + (2 * RR * k) / 6);
  }
  const hulls: number[][] = [];
  for (const piece of pieces) {
    const px0 = piece[0][0];
    const px1 = piece[(piece.length >> 1) - 1]?.[0] ?? px0;
    const cuts = [px0, ...[...breaks].filter((b) => b > px0 + 1e-5 && b < px1 - 1e-5).sort((a, b) => a - b), px1];
    for (let k = 0; k < cuts.length - 1; k++) {
      const a = cuts[k];
      const b = cuts[k + 1];
      if (b - a < 0.0002) continue;
      const pts: number[] = [];
      for (const x of sorted) {
        if (x < a - 1e-9 || x > b + 1e-9) continue;
        const hi = topY(x);
        const lo = lowY(x);
        if (hi - lo <= MIN) continue;
        for (const z of [zInner, zOuter]) pts.push(x, hi, z, x, lo, z);
      }
      if (pts.length >= 24) {
        hulls.push(pts);
        hulls.push(pts.map((v, i) => (i % 3 === 2 ? -v : v)));
      }
    }
  }
  return { zInner, zOuter, pieces, hulls, archRadius: Math.max(...wheels.map(R)) };
}

const deg = (d: number) => (d * Math.PI) / 180;

function extrude(profile: [number, number][], halfZ: number): number[] {
  const pts: number[] = [];
  for (const [x, y] of profile) {
    pts.push(x, y, -halfZ, x, y, halfZ);
  }
  return pts;
}

export function buildRobotGeometry(spec: RobotSpec): RobotGeometry {
  if (spec.passive) return boxGeometry(spec);
  const issues: string[] = [];
  const L = spec.length;
  const W = spec.width;
  const H = spec.height;
  const gc = spec.groundClearance;
  const c = spec.blade.edgeClearance;
  const r = spec.wheels.radius;
  const ww = spec.wheels.width;

  const bladeAngle = deg(Math.min(80, Math.max(8, spec.blade.angleDeg)));
  const bladeTop = Math.max(c + spec.blade.length * Math.sin(bladeAngle), gc + 0.002);
  const bladeW = Math.max(0.01, spec.blade.width);
  const bladeH = bladeTop - c;
  const xFront = L / 2;
  const xBladeBack = xFront - bladeH / Math.tan(bladeAngle);

  // Lâmina: prisma triangular com aresta afiada na frente, fundo plano em y = c
  const bladeProfile: [number, number][] = [
    [xFront, c],
    [xBladeBack, bladeTop],
    [xBladeBack, c],
  ];
  const bladeHull = extrude(bladeProfile, bladeW / 2);

  // Chassi: começa atrás da lâmina e sobe pela face frontal até o topo
  const frontAngle = deg(Math.min(90, Math.max(10, spec.frontAngleDeg)));
  let topY = H;
  let xTop = xBladeBack - (H - bladeTop) / Math.tan(frontAngle);
  const xRear = -L / 2;
  if (xTop < xRear + 0.008) {
    // A rampa não cabe no comprimento: limita a altura
    xTop = xRear + 0.008;
    topY = bladeTop + (xBladeBack - xTop) * Math.tan(frontAngle);
    issues.push(
      `A face frontal a ${spec.frontAngleDeg}° não cabe no comprimento — altura efetiva ${(topY * 1000).toFixed(0)} mm`,
    );
  }
  if (xBladeBack - xRear < 0.03) issues.push('Lâmina longa demais: sobra pouco chassi atrás dela');
  if (bladeW < 0.03) issues.push('Lâmina estreita demais (mínimo 30 mm)');

  const covered = spec.wheels.covered !== false;
  const gap = Math.max(0.0005, spec.wheels.wellGap ?? 0.002);
  // embutidas: a roda fica dentro da lateral, com folga lateral `gap` até o núcleo da chassi
  const bodyHalfWidth = covered ? W / 2 - (WHEEL_INSET + ww + gap) : W / 2 - (ww + 0.001);
  if (bodyHalfWidth < 0.015) issues.push('Rodas largas demais para a largura do robô');

  const bodyProfile: [number, number][] = [
    [xRear, gc],
    [xRear, topY],
    [xTop, topY],
    [xBladeBack, bladeTop],
    [xBladeBack, gc],
  ];
  const bodyHull = extrude(bodyProfile, Math.max(0.01, bodyHalfWidth));

  const wheelZ = covered ? W / 2 - WHEEL_INSET - ww / 2 : W / 2 - ww / 2;
  const rearX = xRear + r + 0.002;
  const xs: number[] = [rearX];
  if (spec.wheels.count === 4) {
    const frontX = Math.min(xBladeBack - r * 0.6, xRear + L * 0.62);
    if (frontX - rearX < 2 * r + 0.002) issues.push('Não há espaço para 4 rodas — rodas se sobrepõem');
    xs.push(frontX);
  }
  const wheels: WheelGeom[] = [];
  for (const x of xs) {
    wheels.push({ x, y: r, z: -wheelZ, radius: r, width: ww, side: 'left' });
    wheels.push({ x, y: r, z: wheelZ, radius: r, width: ww, side: 'right' });
  }
  if (2 * r > H + 0.01) issues.push('Rodas maiores que o chassi');

  // topo do perfil lateral (cadeia superior do polígono do chassi)
  const topAt = (x: number) => {
    if (x <= xTop) return topY;
    if (x >= xBladeBack) return bladeTop;
    return topY + ((bladeTop - topY) * (x - xTop)) / (xBladeBack - xTop);
  };
  const notes: string[] = [];
  let shell: SideShell | null = null;
  if (covered && bodyHalfWidth >= 0.015) {
    shell = buildSideShell(topAt, xRear, xBladeBack, gc, xs.map((x) => ({ x, r })), gap, bodyHalfWidth, W / 2);
    xs.forEach((x, k) => {
      const apex = r + r + gap;
      if (apex > topAt(x) - 0.001) {
        const which = xs.length === 1 ? 'A roda' : k === 0 ? 'A roda traseira' : 'A roda dianteira';
        notes.push(`${which} é mais alta que a chassi nesse ponto e aparece por cima/pela frente`);
      }
    });
  }

  const maxY = Math.max(topY, 2 * r);
  return {
    bodyHull,
    bladeHull,
    wheels,
    bladeBackX: xBladeBack,
    topFrontX: xTop,
    bodyHalfWidth,
    bladeHalfWidth: bladeW / 2,
    shell,
    notes,
    // a largura que conta na caixa é a maior entre robô (com rodas) e lâmina
    bounds: { minX: xRear, maxX: xFront, minY: 0, maxY, minZ: -Math.max(W, bladeW) / 2, maxZ: Math.max(W, bladeW) / 2 },
    issues,
  };
}

/** Caixa do modo treino: um bloco L × A × W apoiado no chão, sem rodas nem lâmina */
function boxGeometry(spec: RobotSpec): RobotGeometry {
  const hl = spec.length / 2;
  const hw = spec.width / 2;
  const H = spec.height;
  const bodyHull: number[] = [];
  for (const x of [-hl, hl]) for (const y of [0, H]) for (const z of [-hw, hw]) bodyHull.push(x, y, z);
  return {
    bodyHull,
    bladeHull: [],
    wheels: [],
    bladeBackX: hl,
    topFrontX: hl,
    bodyHalfWidth: hw,
    bladeHalfWidth: hw,
    shell: null,
    bounds: { minX: -hl, maxX: hl, minY: 0, maxY: H, minZ: -hw, maxZ: hw },
    issues: [],
    notes: [],
  };
}

/** Distribuição estática do peso: fração sobre as rodas (o resto apoia na lâmina). */
export function staticWheelLoadFraction(spec: RobotSpec, geom = buildRobotGeometry(spec)): number {
  if (!geom.wheels.length) return 0;
  if (spec.blade.edgeClearance > 0.0004 || spec.wheels.count === 4) {
    // Com folga na lâmina (ou 4 rodas com o CG entre os eixos), o peso fica todo nas rodas
    const xs = geom.wheels.map((w) => w.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    if (spec.comX >= minX - 1e-6 && spec.comX <= maxX + 1e-6) return 1;
  }
  // 2 rodas (ou CG à frente do eixo dianteiro): o robô apoia na lâmina
  const wheelX = Math.max(...geom.wheels.map((w) => w.x));
  const bladeContactX = (geom.bladeBackX + spec.length / 2) / 2;
  if (spec.comX <= wheelX) return 1;
  return Math.max(0, Math.min(1, (bladeContactX - spec.comX) / (bladeContactX - wheelX)));
}

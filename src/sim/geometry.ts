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
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
  /** Problemas geométricos (não de regulamento) */
  issues: string[];
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
  const issues: string[] = [];
  const L = spec.length;
  const W = spec.width;
  const H = spec.height;
  const gc = spec.groundClearance;
  const c = spec.blade.edgeClearance;
  const r = spec.wheels.radius;
  const ww = spec.wheels.width;

  const bladeAngle = deg(Math.min(80, Math.max(8, spec.blade.angleDeg)));
  const bladeTop = Math.max(c + spec.blade.height, gc + 0.002);
  const bladeH = bladeTop - c;
  const xFront = L / 2;
  const xBladeBack = xFront - bladeH / Math.tan(bladeAngle);

  // Lâmina: prisma triangular com aresta afiada na frente, fundo plano em y = c
  const bladeProfile: [number, number][] = [
    [xFront, c],
    [xBladeBack, bladeTop],
    [xBladeBack, c],
  ];
  const bladeHull = extrude(bladeProfile, W / 2);

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

  const bodyHalfWidth = W / 2 - (ww + 0.001);
  if (bodyHalfWidth < 0.015) issues.push('Rodas largas demais para a largura do robô');

  const bodyProfile: [number, number][] = [
    [xRear, gc],
    [xRear, topY],
    [xTop, topY],
    [xBladeBack, bladeTop],
    [xBladeBack, gc],
  ];
  const bodyHull = extrude(bodyProfile, Math.max(0.01, bodyHalfWidth));

  // Rodas por fora do chassi, dentro da largura total
  const wheelZ = W / 2 - ww / 2;
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

  const maxY = Math.max(topY, 2 * r);
  return {
    bodyHull,
    bladeHull,
    wheels,
    bladeBackX: xBladeBack,
    topFrontX: xTop,
    bodyHalfWidth,
    bounds: { minX: xRear, maxX: xFront, minY: 0, maxY, minZ: -W / 2, maxZ: W / 2 },
    issues,
  };
}

/** Distribuição estática do peso: fração sobre as rodas (o resto apoia na lâmina). */
export function staticWheelLoadFraction(spec: RobotSpec, geom = buildRobotGeometry(spec)): number {
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

import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { buildRobotGeometry, type RobotGeometry } from '../sim/geometry';
import type { RobotSpec } from '../sim/types';

export const TEAM_COLORS = ['#e23b3b', '#2f7be0'] as const;

let metalEnv: THREE.Texture | null = null;
/** Mapa de ambiente compartilhado para lâminas e cubos metálicos */
export function setMetalEnv(t: THREE.Texture) {
  metalEnv = t;
}

function hullGeometry(flat: number[]): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < flat.length; i += 3) pts.push(new THREE.Vector3(flat[i], flat[i + 1], flat[i + 2]));
  const g = new ConvexGeometry(pts);
  g.computeVertexNormals();
  return g;
}

export interface RobotView {
  group: THREE.Group;
  wheels: THREE.Object3D[];
  geom: RobotGeometry;
  /** marcador do centro de massa (debug) */
  com: THREE.Mesh;
  dispose(): void;
}

/** Malha 3D gerada da MESMA geometria usada pelos colisores. */
export function buildRobotView(spec: RobotSpec, team: number | null): RobotView {
  const geom = buildRobotGeometry(spec);
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  const bodyMat = track(new THREE.MeshStandardMaterial({ color: spec.bodyColor, roughness: 0.55, metalness: 0.15, flatShading: true }));
  const body = new THREE.Mesh(track(hullGeometry(geom.bodyHull)), bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // arestas sutis para leitura da forma em telas pequenas
  const edges = new THREE.LineSegments(
    track(new THREE.EdgesGeometry(body.geometry, 25)),
    track(new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 })),
  );
  group.add(edges);

  const bladeMat = track(
    new THREE.MeshStandardMaterial({ color: 0xd8dde3, roughness: 0.25, metalness: 0.95, flatShading: true, envMap: metalEnv, envMapIntensity: 0.9 }),
  );
  const blade = new THREE.Mesh(track(hullGeometry(geom.bladeHull)), bladeMat);
  blade.castShadow = true;
  group.add(blade);

  // Rodas: pneu + cubo, eixo ao longo de z
  const tireMat = track(new THREE.MeshStandardMaterial({ color: spec.tireColor, roughness: 0.85 }));
  const hubMat = track(new THREE.MeshStandardMaterial({ color: 0xcfd3d8, roughness: 0.35, metalness: 0.8, envMap: metalEnv, envMapIntensity: 0.7 }));
  const markMat = track(new THREE.MeshBasicMaterial({ color: 0x111111 }));
  const wheels: THREE.Object3D[] = [];
  for (const w of geom.wheels) {
    const pivot = new THREE.Group();
    pivot.position.set(w.x, w.y, w.z);
    const tire = new THREE.Mesh(track(new THREE.CylinderGeometry(w.radius, w.radius, w.width, 28)), tireMat);
    tire.rotation.x = Math.PI / 2;
    tire.castShadow = true;
    const hub = new THREE.Mesh(track(new THREE.CylinderGeometry(w.radius * 0.45, w.radius * 0.45, w.width * 1.04, 16)), hubMat);
    hub.rotation.x = Math.PI / 2;
    // risco no cubo para ver a roda girar
    const mark = new THREE.Mesh(track(new THREE.BoxGeometry(w.radius * 0.8, w.radius * 0.12, w.width * 1.08)), markMat);
    mark.position.x = w.radius * 0.35;
    pivot.add(tire, hub, mark);
    group.add(pivot);
    wheels.push(pivot);
  }

  // Adesivo de identificação (Art. 23) — vermelho/azul no topo
  if (team !== null) {
    const topY = geom.bounds.maxY;
    const cx = (geom.bounds.minX + geom.topFrontX) / 2;
    const r = Math.min(0.016, (geom.topFrontX - geom.bounds.minX) / 2.4, geom.bodyHalfWidth * 0.8);
    const sticker = new THREE.Mesh(
      track(new THREE.CircleGeometry(Math.max(0.006, r), 32)),
      track(new THREE.MeshStandardMaterial({ color: TEAM_COLORS[team], roughness: 0.4, emissive: TEAM_COLORS[team], emissiveIntensity: 0.25 })),
    );
    sticker.rotation.x = -Math.PI / 2;
    sticker.position.set(cx, topY + 0.0004, 0);
    group.add(sticker);
    // seta indicando a frente
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0.006, 0);
    arrowShape.lineTo(-0.003, 0.004);
    arrowShape.lineTo(-0.003, -0.004);
    const arrow = new THREE.Mesh(track(new THREE.ShapeGeometry(arrowShape)), track(new THREE.MeshBasicMaterial({ color: 0xffffff })));
    arrow.rotation.x = -Math.PI / 2;
    arrow.position.set(cx, topY + 0.0008, 0);
    group.add(arrow);
  }

  const com = new THREE.Mesh(
    track(new THREE.SphereGeometry(0.003, 12, 8)),
    track(new THREE.MeshBasicMaterial({ color: 0xffd400, depthTest: false })),
  );
  com.position.set(spec.comX, spec.comY, 0);
  com.renderOrder = 10;
  com.visible = false;
  group.add(com);

  return {
    group,
    wheels,
    geom,
    com,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

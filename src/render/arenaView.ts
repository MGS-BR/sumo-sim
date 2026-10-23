import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ARENA, SHIKIRI_HALF_LEN } from '../sim/arena';
import { quatFromYaw } from '../sim/math';
import type { ReplayFrame } from '../sim/match';
import type { Pose2D, RobotSpec, SimSnapshot } from '../sim/types';
import { buildRobotView, setMetalEnv, type RobotView } from './robotMesh';

export type CameraMode = 'transmissao' | 'topo' | 'baixa' | 'livre';
export const CAMERA_LABELS: Record<CameraMode, string> = {
  transmissao: 'Transmissão',
  topo: 'Vista de cima',
  baixa: 'Rente ao dohyo',
  livre: 'Livre (mouse)',
};
const CAMERA_ORDER: CameraMode[] = ['transmissao', 'topo', 'baixa', 'livre'];

/**
 * Cena 3D em escala real (1 unidade = 1 metro). Só desenha — nunca altera a simulação.
 */
export class ArenaView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private robots: (RobotView | null)[] = [null, null];
  private debugGroup = new THREE.Group();
  private loadArrows: THREE.ArrowHelper[][] = [[], []];
  private tractionArrows: THREE.ArrowHelper[][] = [[], []];
  cameraMode: CameraMode = 'transmissao';
  private camTarget = new THREE.Vector3();
  private camGoal = new THREE.Vector3();
  private lookGoal = new THREE.Vector3();
  private orbit = { on: false, angle: 0, radius: 0.7, height: 0.35, speed: 0.12 };
  debug = false;

  constructor(private container: HTMLElement) {
    // ?gfx=low → sem sombras/antialias, para máquinas fracas
    const low = new URLSearchParams(location.search).get('gfx') === 'low';
    const r = new THREE.WebGLRenderer({ antialias: !low, alpha: false, preserveDrawingBuffer: false });
    r.setPixelRatio(low ? 1 : Math.min(2, window.devicePixelRatio || 1));
    r.shadowMap.enabled = !low;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    container.appendChild(r.domElement);
    this.renderer = r;

    this.scene.background = new THREE.Color('#0c0e12');
    // ambiente para os metais (lâminas, cubos) refletirem algo além de preto
    // (aplicado só nos materiais metálicos, para o dohyo continuar preto fosco)
    const pmrem = new THREE.PMREMGenerator(r);
    setMetalEnv(pmrem.fromScene(new RoomEnvironment(), 0.04).texture);
    pmrem.dispose();
    this.scene.fog = new THREE.Fog('#0c0e12', 2.2, 6);
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.005, 20);
    this.camera.position.set(0, 0.62, 0.86);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, ARENA.dohyoHeight, 0);
    this.controls.minDistance = 0.12;
    this.controls.maxDistance = 3;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.enabled = false;

    this.buildLights();
    this.buildArena();
    this.debugGroup.visible = false;
    this.scene.add(this.debugGroup);

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(container);
    this.resize();
  }

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight('#dfe8ff', '#20160f', 0.9));
    const key = new THREE.DirectionalLight('#ffffff', 2.2);
    key.position.set(0.6, 1.6, 0.8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = -0.6;
    sc.right = 0.6;
    sc.top = 0.6;
    sc.bottom = -0.6;
    sc.near = 0.5;
    sc.far = 3.5;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.002;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#7fa8ff', 0.6);
    rim.position.set(-1, 0.5, -1);
    this.scene.add(rim);
  }

  private buildArena() {
    const R = ARENA.dohyoRadius;
    const H = ARENA.dohyoHeight;
    // Chão de fora (dohyo jogai)
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 8),
      new THREE.MeshStandardMaterial({ color: '#1a1d22', roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.0005;
    floor.receiveShadow = true;
    this.scene.add(floor);
    // Yochi 180 x 180 cm, metade vermelha / metade azul como na Fig. 3
    const half = ARENA.yochiSize / 2;
    for (const [sign, color] of [
      [1, '#6b1f22'],
      [-1, '#1f3a66'],
    ] as const) {
      const y = new THREE.Mesh(
        new THREE.PlaneGeometry(half, ARENA.yochiSize),
        new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
      );
      y.rotation.x = -Math.PI / 2;
      y.position.set((sign * half) / 2, 0, 0);
      y.receiveShadow = true;
      this.scene.add(y);
    }
    const border = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(ARENA.yochiSize, 0.0001, ARENA.yochiSize)),
      new THREE.LineBasicMaterial({ color: '#000000' }),
    );
    border.position.y = 0.0005;
    this.scene.add(border);

    // Dohyo: madeira com fórmica preta
    const side = new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.8 });
    const top = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.42, metalness: 0.05 });
    const dohyo = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 128, 1), [side, top, side]);
    dohyo.position.y = H / 2;
    dohyo.receiveShadow = true;
    dohyo.castShadow = true;
    this.scene.add(dohyo);
    // Tawara: faixa branca de 2,5 cm na borda (conta como dentro)
    const tawara = new THREE.Mesh(
      new THREE.RingGeometry(R - ARENA.tawaraWidth, R, 128),
      new THREE.MeshStandardMaterial({ color: '#f1f1ee', roughness: 0.5 }),
    );
    tawara.rotation.x = -Math.PI / 2;
    tawara.position.y = H + 0.0002;
    tawara.receiveShadow = true;
    this.scene.add(tawara);
    // Shikiri-sen: duas linhas marrons de 1 x 10 cm
    const shMat = new THREE.MeshStandardMaterial({ color: '#7a4a2a', roughness: 0.7 });
    for (const sign of [1, -1]) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.shikiriWidth, ARENA.shikiriLength), shMat);
      l.rotation.x = -Math.PI / 2;
      l.position.set(sign * (ARENA.shikiriInnerX + ARENA.shikiriWidth / 2), H + 0.0002, 0);
      l.receiveShadow = true;
      this.scene.add(l);
    }
    // Faixa de posicionamento (só aparece na fase de shikiri)
    const zoneMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.06, depthWrite: false });
    this.zones = [1, -1].map((sign) => {
      const len = R - ARENA.shikiriInnerX - ARENA.shikiriWidth;
      const z = new THREE.Mesh(new THREE.PlaneGeometry(len, SHIKIRI_HALF_LEN * 2), zoneMat);
      z.rotation.x = -Math.PI / 2;
      z.position.set(sign * (ARENA.shikiriInnerX + ARENA.shikiriWidth + len / 2), H + 0.0003, 0);
      z.visible = false;
      this.scene.add(z);
      return z;
    });
  }
  private zones: THREE.Mesh[] = [];

  showPlacementZones(on: boolean) {
    for (const z of this.zones) z.visible = on;
  }

  setRobots(specs: [RobotSpec | null, RobotSpec | null], teams: [number | null, number | null] = [0, 1]) {
    for (let i = 0; i < 2; i++) {
      const old = this.robots[i];
      if (old) {
        this.scene.remove(old.group);
        old.dispose();
      }
      const s = specs[i];
      this.robots[i] = s ? buildRobotView(s, teams[i]) : null;
      if (this.robots[i]) this.scene.add(this.robots[i]!.group);
    }
    this.rebuildDebug();
  }

  private rebuildDebug() {
    this.debugGroup.clear();
    this.loadArrows = [[], []];
    this.tractionArrows = [[], []];
    for (let i = 0; i < 2; i++) {
      const rv = this.robots[i];
      if (!rv) continue;
      for (let k = 0; k < rv.geom.wheels.length; k++) {
        const a = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 0.02, 0x3ddc84, 0.006, 0.004);
        const t = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 0.02, 0xffb02e, 0.006, 0.004);
        this.debugGroup.add(a, t);
        this.loadArrows[i].push(a);
        this.tractionArrows[i].push(t);
      }
    }
  }

  setDebug(on: boolean) {
    this.debug = on;
    this.debugGroup.visible = on;
    for (const r of this.robots) if (r) r.com.visible = on;
  }

  /** Pose estática no chão do dohyo (menus/editor) */
  setStaticPose(i: number, pose: Pose2D, y = ARENA.dohyoHeight) {
    const rv = this.robots[i];
    if (!rv) return;
    rv.group.position.set(pose.x, y, pose.z);
    const q = quatFromYaw(pose.yaw);
    rv.group.quaternion.set(q.x, q.y, q.z, q.w);
  }

  applySnapshot(s: SimSnapshot) {
    for (let i = 0; i < 2; i++) {
      const rv = this.robots[i];
      if (!rv) continue;
      const st = s.robots[i];
      rv.group.position.set(st.position.x, st.position.y, st.position.z);
      rv.group.quaternion.set(st.rotation.x, st.rotation.y, st.rotation.z, st.rotation.w);
      st.wheels.forEach((w, k) => {
        if (rv.wheels[k]) rv.wheels[k].rotation.z = -w.spin;
      });
      if (this.debug) {
        st.wheels.forEach((w, k) => {
          const la = this.loadArrows[i][k];
          const ta = this.tractionArrows[i][k];
          if (!la || !ta) return;
          if (!w.contact) {
            la.visible = ta.visible = false;
            return;
          }
          la.visible = ta.visible = true;
          la.position.set(w.contact.x, w.contact.y, w.contact.z);
          la.setLength(Math.max(0.004, w.load * 0.025), 0.005, 0.004);
          la.setColor(w.slipping ? 0xff4d4d : 0x3ddc84);
          const f = new THREE.Vector3(Math.cos(st.yaw), 0, -Math.sin(st.yaw)).multiplyScalar(Math.sign(w.traction) || 1);
          ta.position.set(w.contact.x, w.contact.y + 0.001, w.contact.z);
          ta.setDirection(f);
          ta.setLength(Math.max(0.004, Math.abs(w.traction) * 0.025), 0.005, 0.004);
        });
      }
    }
  }

  applyReplay(f: ReplayFrame) {
    for (let i = 0; i < 2; i++) {
      const rv = this.robots[i];
      if (!rv) continue;
      rv.group.position.set(f.pos[i].x, f.pos[i].y, f.pos[i].z);
      rv.group.quaternion.set(f.rot[i].x, f.rot[i].y, f.rot[i].z, f.rot[i].w);
      f.spin[i].forEach((sp, k) => rv.wheels[k] && (rv.wheels[k].rotation.z = -sp));
    }
    this.debugGroup.visible = false;
  }

  cycleCamera(): CameraMode {
    const i = CAMERA_ORDER.indexOf(this.cameraMode);
    this.setCamera(CAMERA_ORDER[(i + 1) % CAMERA_ORDER.length]);
    return this.cameraMode;
  }

  setCamera(mode: CameraMode) {
    this.cameraMode = mode;
    this.controls.enabled = mode === 'livre';
    if (mode === 'livre') this.controls.target.copy(this.camTarget);
  }

  /** Órbita lenta (menus) */
  setOrbit(on: boolean, radius = 0.7, height = 0.35, speed = 0.12) {
    this.orbit = { ...this.orbit, on, radius, height, speed };
  }

  /** Atualiza a câmera; `focus` = ponto de interesse (centro dos robôs) */
  updateCamera(dt: number, focus?: { x: number; z: number }) {
    const H = ARENA.dohyoHeight;
    if (this.orbit.on) {
      this.orbit.angle += dt * this.orbit.speed;
      this.camGoal.set(Math.sin(this.orbit.angle) * this.orbit.radius, this.orbit.height, Math.cos(this.orbit.angle) * this.orbit.radius);
      this.lookGoal.set(0, H, 0);
    } else if (this.cameraMode === 'livre') {
      this.controls.update();
      return;
    } else {
      const fx = focus ? focus.x * 0.35 : 0;
      const fz = focus ? focus.z * 0.35 : 0;
      const aspect = this.camera.aspect;
      const back = aspect < 1 ? 1.6 / aspect : 1; // retrato (celular): afasta a câmera
      if (this.cameraMode === 'transmissao') {
        this.camGoal.set(fx * 0.5, 0.62 * back, 0.86 * back);
        this.lookGoal.set(fx, H, fz * 0.5);
      } else if (this.cameraMode === 'topo') {
        this.camGoal.set(0, 1.35 * back, 0.02);
        this.lookGoal.set(0, H, 0);
      } else {
        this.camGoal.set(fx, 0.085, 0.5 * back);
        this.lookGoal.set(fx, H + 0.02, fz);
      }
    }
    const k = 1 - Math.exp(-dt * 6);
    this.camera.position.lerp(this.camGoal, k);
    this.camTarget.lerp(this.lookGoal, k);
    this.camera.lookAt(this.camTarget);
  }

  snapCamera() {
    this.camera.position.copy(this.camGoal);
    this.camTarget.copy(this.lookGoal);
    this.camera.lookAt(this.camTarget);
  }

  /** Desloca o centro da imagem (fração da largura), p.ex. para abrir espaço para um painel */
  private frameOffset = 0;
  setFrameOffset(f: number) {
    this.frameOffset = f;
    this.resize();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    if (this.frameOffset) this.camera.setViewOffset(w, h, w * this.frameOffset, 0, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }
}

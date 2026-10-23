import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import { ARENA, GRAVITY } from './arena';
import { buildRobotGeometry, type RobotGeometry } from './geometry';
import { wheelForces } from './drive';
import { PHYSICS_DT } from './modes';
import { add, cross, dot, norm, quatFromYaw, rotate, scale, sub, v3, yawOf } from './math';
import type { DriveCommand, Pose2D, Quat, RobotSpec, RobotState, SimSnapshot, Vec3, WheelState } from './types';

type R = typeof RAPIER;
type World = InstanceType<R['World']>;
type RigidBody = ReturnType<World['createRigidBody']>;
type Collider = ReturnType<World['createCollider']>;

let rapierReady: Promise<R> | null = null;
/** Inicializa o WASM do Rapier uma única vez (navegador ou Node). */
export function loadRapier(): Promise<R> {
  if (!rapierReady) rapierReady = RAPIER.init().then(() => RAPIER);
  return rapierReady;
}

// Grupos de colisão (16 bits de pertencimento << 16 | 16 bits de filtro)
const G_GROUND = 0x0001;
const G_BODY = 0x0002;
const G_WHEEL = 0x0004;
const groups = (member: number, filter: number) => (member << 16) | filter;

/** Parâmetros físicos que não fazem parte da spec do robô */
export const PHYS = {
  /** Curso da "suspensão" (na prática a compressão do pneu de silicone) */
  suspensionTravel: 0.004,
  /** Rigidez do pneu/suspensão por roda (N/m) */
  suspensionK: 9000,
  suspensionZeta: 0.7,
  /** Atrito cinético = fração do estático */
  kineticRatio: 0.85,
  /** Atrito do dohyo (fórmica) e do chão */
  formicaFriction: 1.0,
  /** Tolerância para considerar dois corpos "encostando" */
  touchEps: 0.0006,
  spawnLift: 0.0004,
  /** Atrito interno da caixa de redução: com o motor em freio, a roda resiste a ser girada
   *  (fração do torque de travamento). Impede que o robô "escorregue" parado. */
  gearboxHold: 0.15,
};

interface WheelRuntime {
  prevCompression: number;
  spin: number;
  state: WheelState;
}

interface RobotRuntime {
  spec: RobotSpec;
  geom: RobotGeometry;
  body: RigidBody;
  colliders: Collider[];
  wheels: WheelRuntime[];
  freeOmega: number;
  command: DriveCommand;
  /** Pose do tick anterior: a velocidade nos contatos é medida pela variação de pose,
   *  imune à velocidade "residual" que o solver de contatos macios reporta em repouso */
  prevPos: Vec3;
  prevRot: Quat;
  hasPrev: boolean;
}

export class SumoWorld {
  readonly world: World;
  readonly robots: RobotRuntime[] = [];
  private ground: Collider;
  private dohyo: Collider;
  tick = 0;

  constructor(
    private readonly R: R,
    specs: [RobotSpec, RobotSpec],
  ) {
    const world = new R.World({ x: 0, y: -GRAVITY, z: 0 });
    world.timestep = PHYSICS_DT;
    // Objetos de 10 cm: trabalhar em "centímetros" reduz a penetração permitida para ~0,1 mm
    world.integrationParameters.lengthUnit = 0.01;
    world.integrationParameters.numSolverIterations = 8;
    this.world = world;

    const fixed = world.createRigidBody(R.RigidBodyDesc.fixed());
    // Chão (yochi + dohyo jogai): plano grande na altura 0
    this.ground = world.createCollider(
      R.ColliderDesc.cuboid(5, 0.05, 5)
        .setTranslation(0, -0.05, 0)
        .setFriction(PHYS.formicaFriction)
        .setFrictionCombineRule(R.CoefficientCombineRule.Min)
        .setCollisionGroups(groups(G_GROUND, G_BODY)),
      fixed,
    );
    // Dohyo: disco de 77 cm x 2,5 cm de fórmica
    this.dohyo = world.createCollider(
      R.ColliderDesc.cylinder(ARENA.dohyoHeight / 2, ARENA.dohyoRadius)
        .setTranslation(0, ARENA.dohyoHeight / 2, 0)
        .setFriction(PHYS.formicaFriction)
        .setFrictionCombineRule(R.CoefficientCombineRule.Min)
        .setCollisionGroups(groups(G_GROUND, G_BODY)),
      fixed,
    );

    specs.forEach((s, i) => this.robots.push(this.createRobot(s, i === 0 ? 0.15 : -0.15, i === 0 ? Math.PI : 0)));
  }

  private createRobot(spec: RobotSpec, x: number, yaw: number): RobotRuntime {
    const R = this.R;
    const geom = buildRobotGeometry(spec);
    const m = spec.mass;
    const L = spec.length,
      Hh = spec.height,
      W = spec.width;
    const inertia = { x: (m * (Hh * Hh + W * W)) / 12, y: (m * (L * L + W * W)) / 12, z: (m * (L * L + Hh * Hh)) / 12 };
    const q = quatFromYaw(yaw);
    const body = this.world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(x, ARENA.dohyoHeight + PHYS.spawnLift, 0)
        .setRotation(q)
        .setAdditionalMassProperties(m, { x: spec.comX, y: spec.comY, z: 0 }, inertia, { x: 0, y: 0, z: 0, w: 1 })
        .setCcdEnabled(true)
        .setCanSleep(false),
    );
    const colliders: Collider[] = [];
    const hull = (pts: number[], friction: number) => {
      const d = R.ColliderDesc.convexHull(new Float32Array(pts));
      if (!d) throw new Error('casco convexo inválido');
      return this.world.createCollider(
        d
          .setDensity(0)
          .setFriction(friction)
          .setFrictionCombineRule(R.CoefficientCombineRule.Min)
          .setRestitution(0)
          .setCollisionGroups(groups(G_BODY, G_GROUND | G_BODY | G_WHEEL)),
        body,
      );
    };
    colliders.push(hull(geom.bodyHull, spec.bodyFriction));
    colliders.push(hull(geom.bladeHull, spec.blade.friction));
    // Rodas: só colidem com o OUTRO robô. O contato com o chão é do modelo de pneu (raycast).
    const s45 = Math.SQRT1_2;
    for (const w of geom.wheels) {
      colliders.push(
        this.world.createCollider(
          R.ColliderDesc.cylinder(w.width / 2, w.radius)
            .setTranslation(w.x, w.y, w.z)
            .setRotation({ x: s45, y: 0, z: 0, w: s45 })
            .setDensity(0)
            .setFriction(0.3)
            .setFrictionCombineRule(R.CoefficientCombineRule.Min)
            .setCollisionGroups(groups(G_WHEEL, G_BODY)),
          body,
        ),
      );
    }
    const freeOmega = (spec.motor.freeRpm * 2 * Math.PI) / 60;
    return {
      spec,
      geom,
      body,
      colliders,
      freeOmega,
      command: { left: 0, right: 0 },
      prevPos: v3(),
      prevRot: { x: 0, y: 0, z: 0, w: 1 },
      hasPrev: false,
      wheels: geom.wheels.map(() => ({
        prevCompression: 0,
        spin: 0,
        state: { load: 0, traction: 0, lateral: 0, slipping: false, spin: 0, contact: null, onOutsideFloor: false, overEdge: false },
      })),
    };
  }

  setCommand(i: number, cmd: DriveCommand) {
    const c = this.robots[i].command;
    c.left = Math.max(-1, Math.min(1, cmd.left));
    c.right = Math.max(-1, Math.min(1, cmd.right));
  }

  /** Teleporta o robô para uma pose no dohyo, parado. */
  setPose(i: number, pose: Pose2D) {
    const r = this.robots[i];
    r.body.setTranslation({ x: pose.x, y: ARENA.dohyoHeight + PHYS.spawnLift, z: pose.z }, true);
    r.body.setRotation(quatFromYaw(pose.yaw), true);
    r.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    r.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    for (const w of r.wheels) w.prevCompression = 0;
    r.hasPrev = false;
  }

  getPose(i: number): Pose2D {
    const b = this.robots[i].body;
    const t = b.translation();
    return { x: t.x, z: t.z, yaw: yawOf(b.rotation()) };
  }

  /** Avança um passo fixo de física. */
  step() {
    const dt = PHYSICS_DT;
    for (const r of this.robots) this.applyWheels(r, dt);
    this.world.step();
    this.tick++;
  }

  private applyWheels(r: RobotRuntime, dt: number) {
    const R = this.R;
    const body = r.body;
    const pos = body.translation();
    const rot = body.rotation();
    const prevPos = r.hasPrev ? r.prevPos : pos;
    const prevRot = r.hasPrev ? r.prevRot : rot;
    const invRot = { x: -rot.x, y: -rot.y, z: -rot.z, w: rot.w };
    const pointVel = (p: Vec3): Vec3 => {
      const local = rotate(invRot, sub(p, pos));
      const before = add(prevPos, rotate(prevRot, local));
      return scale(sub(p, before), 1 / dt);
    };
    r.prevPos = { x: pos.x, y: pos.y, z: pos.z };
    r.prevRot = { x: rot.x, y: rot.y, z: rot.z, w: rot.w };
    r.hasPrev = true;
    const up = rotate(rot, v3(0, 1, 0));
    const fwdBody = rotate(rot, v3(1, 0, 0));
    const down = scale(up, -1);
    const travel = PHYS.suspensionTravel;
    const nWheels = r.wheels.length;
    const m = r.spec.mass;
    const k = PHYS.suspensionK;
    const c = 2 * PHYS.suspensionZeta * Math.sqrt((k * m) / nWheels);
    // Pré-carga: compensa a deflexão estática para que, parado, o "chão" local fique em y = 0
    // (assim a folga da lâmina da spec é a folga real em repouso)
    const sag = (m * GRAVITY) / (nWheels * k);

    // 1ª passada: carga em cada roda
    const hits: ({ point: Vec3; normal: Vec3; compression: number; collider: Collider } | null)[] = [];
    let contacts = 0;
    r.geom.wheels.forEach((wg, idx) => {
      const hubLocal = v3(wg.x, wg.y + travel, wg.z);
      const origin = add(pos, rotate(rot, hubLocal));
      const ray = new R.Ray(origin, down);
      const maxToi = travel + wg.radius + sag + 0.001;
      const hit = this.world.castRayAndGetNormal(ray, maxToi, true, R.QueryFilterFlags.EXCLUDE_DYNAMIC);
      const wr = r.wheels[idx];
      if (!hit) {
        hits.push(null);
        wr.prevCompression = 0;
        return;
      }
      const compression = travel + wg.radius + sag - hit.timeOfImpact;
      if (compression <= 0) {
        hits.push(null);
        wr.prevCompression = 0;
        return;
      }
      contacts++;
      hits.push({
        point: add(origin, scale(down, hit.timeOfImpact)),
        normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z },
        compression,
        collider: hit.collider,
      });
    });

    const effMass = m / Math.max(1, contacts);
    r.geom.wheels.forEach((wg, idx) => {
      const wr = r.wheels[idx];
      const st = wr.state;
      const h = hits[idx];
      const u = wg.side === 'left' ? r.command.left : r.command.right;
      if (!h) {
        st.load = 0;
        st.traction = 0;
        st.lateral = 0;
        st.slipping = true;
        st.contact = null;
        st.onOutsideFloor = false;
        st.overEdge = this.hubOverEdge(pos, rot, wg);
        wr.spin += u * r.freeOmega * dt;
        st.spin = wr.spin;
        return;
      }
      wr.prevCompression = h.compression;
      // Horizontal: velocidade pela variação de pose (sem o resíduo do solver → robô parado não escorrega)
      const v = pointVel(h.point);
      // Vertical: velocidade atual do corpo (sem atraso de um passo → amortecimento estável)
      const vb = body.velocityAtPoint(h.point);
      // Amortecimento pela velocidade do ponto ao longo do eixo da suspensão,
      // limitado para nunca inverter a velocidade num único passo (estável em passo explícito)
      const vn = vb.x * up.x + vb.y * up.y + vb.z * up.z;
      let fd = -c * vn;
      const fdMax = (effMass * Math.abs(vn)) / dt;
      if (Math.abs(fd) > fdMax) fd = Math.sign(fd) * fdMax;
      let fs = k * h.compression + fd;
      if (fs < 0) fs = 0;
      // Carga efetiva = componente normal ao chão
      const load = fs * Math.max(0, dot(up, h.normal));

      const fwd = norm(sub(fwdBody, scale(h.normal, dot(fwdBody, h.normal))));
      const lat = cross(h.normal, fwd);
      const out = wheelForces({
        u,
        load,
        vLong: dot(v, fwd),
        vLat: dot(v, lat),
        radius: wg.radius,
        freeOmega: r.freeOmega,
        stallTorque: r.spec.motor.stallTorque,
        muStatic: r.spec.wheels.friction,
        muKinetic: r.spec.wheels.friction * PHYS.kineticRatio,
        effMass,
        dt,
        holdForce: (PHYS.gearboxHold * r.spec.motor.stallTorque) / wg.radius,
      });
      const f = add(add(scale(up, fs), scale(fwd, out.fLong)), scale(lat, out.fLat));
      body.applyImpulseAtPoint(scale(f, dt), h.point, true);

      wr.spin += out.omega * dt;
      st.load = load;
      st.traction = out.fLong;
      st.lateral = out.fLat;
      st.slipping = out.slipping;
      st.spin = wr.spin;
      st.contact = h.point;
      st.onOutsideFloor = h.collider.handle !== this.dohyo.handle;
      st.overEdge = this.hubOverEdge(pos, rot, wg);
    });
  }

  /** Centro da roda além da borda do dohyo (vista de cima) — base do Shinitai */
  private hubOverEdge(pos: Vec3, rot: { x: number; y: number; z: number; w: number }, wg: { x: number; y: number; z: number }) {
    const p = add(pos, rotate(rot, v3(wg.x, wg.y, wg.z)));
    return Math.hypot(p.x, p.z) > ARENA.dohyoRadius;
  }

  private touching(a: Collider, b: Collider): boolean {
    let hit = false;
    this.world.contactPair(a, b, (manifold) => {
      if (hit) return;
      const n = manifold.numContacts();
      for (let i = 0; i < n; i++) {
        if (manifold.contactDist(i) <= PHYS.touchEps) {
          hit = true;
          return;
        }
      }
    });
    return hit;
  }

  robotState(i: number): RobotState {
    const r = this.robots[i];
    const b = r.body;
    const t = b.translation();
    const q = b.rotation();
    const lv = b.linvel();
    const av = b.angvel();
    let touchingOutside = false;
    for (const col of r.colliders) {
      if (this.touching(col, this.ground)) {
        touchingOutside = true;
        break;
      }
    }
    let loadSum = 0;
    for (const w of r.wheels) {
      loadSum += w.state.load;
      // roda apoiada no chão de fora do dohyo também conta como "tocar fora"
      if (w.state.contact && w.state.onOutsideFloor) touchingOutside = true;
    }
    const fallen = t.y < -0.1;
    return {
      position: { x: t.x, y: t.y, z: t.z },
      rotation: { x: q.x, y: q.y, z: q.z, w: q.w },
      linvel: { x: lv.x, y: lv.y, z: lv.z },
      angvel: { x: av.x, y: av.y, z: av.z },
      yaw: yawOf(q),
      wheels: r.wheels.map((w) => ({ ...w.state, contact: w.state.contact ? { ...w.state.contact } : null })),
      wheelLoadRatio: loadSum / (r.spec.mass * GRAVITY),
      touchingOutside: touchingOutside || fallen,
      fallen,
    };
  }

  robotsInContact(): boolean {
    const [a, b] = this.robots;
    for (const ca of a.colliders) for (const cb of b.colliders) if (this.touching(ca, cb)) return true;
    return false;
  }

  snapshot(): SimSnapshot {
    return {
      tick: this.tick,
      time: this.tick * PHYSICS_DT,
      robots: [this.robotState(0), this.robotState(1)],
      inContact: this.robotsInContact(),
    };
  }

  dispose() {
    this.world.free();
  }
}

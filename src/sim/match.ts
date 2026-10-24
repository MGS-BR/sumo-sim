import { SumoWorld, loadRapier } from './physics';
import { Referee, type RefEvent, type RefFacts, type RobotFact, type RulesConfig } from './referee';
import { constrainPlacement, defaultPlacement, nudgePlacement, randomPlacement } from './placement';
import { Rng, normalizeSeed } from './rng';
import { PHYSICS_DT } from './modes';
import type { ModeConfig } from './modes';
import { wrapAngle } from './math';
import type { ControlFrame, Pose2D, Quat, RobotSpec, SimSnapshot, Vec3 } from './types';

export interface ReplayFrame {
  t: number;
  pos: [Vec3, Vec3];
  rot: [Quat, Quat];
  spin: [number[], number[]];
}

export interface MatchOptions {
  specs: [RobotSpec, RobotSpec];
  mode: ModeConfig;
  rules?: Partial<RulesConfig>;
  /**
   * Sorteia posição e giro dos dois robôs a cada round (inclusive o bot) e trava os
   * ajustes: os jogadores só confirmam "Pronto".
   */
  randomPlacement?: boolean;
  /** Semente do sorteio. Mesma semente = mesmas posições (replay/online). */
  seed?: number;
}

const REPLAY_SECONDS = 4;

/** Primeiro toque fora do dohyo de cada robô no round atual (evidência para o replay) */
export interface OutTouch {
  t: number;
  point: Vec3;
}
const REPLAY_EVERY = 2; // grava 1 a cada 2 ticks (240 Hz)

const finite = (v: number) => (Number.isFinite(v) ? v : 0);
/** Entrada vinda de fora (teclado hoje, rede amanhã) nunca chega crua na física */
function sanitizePlace(p: ControlFrame['place']): ControlFrame['place'] {
  const lim = (v: number, m: number) => Math.max(-m, Math.min(m, finite(v)));
  return { forward: lim(p.forward, 0.2), side: lim(p.side, 0.2), yaw: lim(p.yaw, 4) };
}

/**
 * Partida = física + juiz + posicionamento. Avança em ticks fixos a partir de
 * ControlFrames — exatamente o que um servidor autoritativo faria no modo online.
 */
export class Match {
  readonly sim: SumoWorld;
  readonly ref: Referee;
  readonly specs: [RobotSpec, RobotSpec];
  readonly mode: ModeConfig;
  readonly randomPlacement: boolean;
  readonly seed: number;
  private rng: Rng;
  placements: [Pose2D, Pose2D];
  private startPoses: [Pose2D, Pose2D];
  private prevPose: [Pose2D, Pose2D];
  private speed: [number, number] = [0, 0];
  private angSpeed: [number, number] = [0, 0];
  private ready: [boolean, boolean] = [false, false];
  private prevDistance = 0;
  private distanceRate = 0;
  lastSnapshot: SimSnapshot;
  replay: ReplayFrame[] = [];
  outTouches: [OutTouch | null, OutTouch | null] = [null, null];
  tick = 0;

  static async create(opts: MatchOptions): Promise<Match> {
    const R = await loadRapier();
    return new Match(new SumoWorld(R, opts.specs), opts);
  }

  constructor(sim: SumoWorld, opts: MatchOptions) {
    this.sim = sim;
    this.specs = opts.specs;
    this.mode = opts.mode;
    this.ref = new Referee({ falseStartRule: opts.mode.falseStartRule, ...opts.rules });
    this.randomPlacement = opts.randomPlacement === true;
    this.seed = normalizeSeed(opts.seed ?? 1);
    this.rng = new Rng(this.seed);
    this.placements = this.randomPlacement
      ? this.drawPlacements()
      : [defaultPlacement(opts.specs[0], 0), defaultPlacement(opts.specs[1], 1)];
    this.startPoses = [{ ...this.placements[0] }, { ...this.placements[1] }];
    this.prevPose = [{ ...this.placements[0] }, { ...this.placements[1] }];
    this.applyPlacements();
    this.lastSnapshot = sim.snapshot();
  }

  /** Vermelho sorteia primeiro, depois o azul: a ordem faz parte do determinismo. */
  private drawPlacements(): [Pose2D, Pose2D] {
    return [randomPlacement(this.specs[0], 0, this.rng), randomPlacement(this.specs[1], 1, this.rng)];
  }

  private applyPlacements() {
    for (const i of [0, 1]) {
      this.sim.setPose(i, this.placements[i]);
      this.sim.setCommand(i, { left: 0, right: 0 });
      this.prevPose[i] = { ...this.placements[i] };
    }
    this.speed = [0, 0];
    this.angSpeed = [0, 0];
  }

  /** Um tick de física (PHYSICS_DT). */
  step(frames: [ControlFrame, ControlFrame]): RefEvent[] {
    const ref = this.ref;
    const phase = ref.s.phase;
    const dt = PHYSICS_DT;

    if (phase === 'placement') {
      for (const i of [0, 1]) {
        const f = frames[i];
        if (f.ready) this.ready[i] = true;
        if (!this.ready[i] && !this.randomPlacement) {
          if (f.placeTarget) this.placements[i] = constrainPlacement(this.specs[i], f.placeTarget, i) ?? this.placements[i];
          else this.placements[i] = nudgePlacement(this.specs[i], this.placements[i], i, sanitizePlace(f.place), dt);
        }
        this.sim.setPose(i, this.placements[i]);
        this.sim.setCommand(i, { left: 0, right: 0 });
      }
      this.prevPose = [{ ...this.placements[0] }, { ...this.placements[1] }];
    } else {
      const live = ref.motorsLive;
      for (const i of [0, 1]) this.sim.setCommand(i, live ? frames[i].drive : { left: 0, right: 0 });
    }

    this.sim.step();
    this.tick++;
    const snap = this.sim.snapshot();
    this.lastSnapshot = snap;
    if (phase !== 'placement') this.recordReplay(snap);
    if (phase === 'fight' || phase === 'deciding') {
      for (const i of [0, 1]) {
        const st = snap.robots[i];
        if (!this.outTouches[i] && st.touchingOutside && st.outsidePoint) this.outTouches[i] = { t: snap.time, point: { ...st.outsidePoint } };
      }
    }

    const facts = this.buildFacts(snap, dt);
    const events = ref.update(facts);
    for (const e of events) this.onEvent(e);
    return events;
  }

  private onEvent(e: RefEvent) {
    if (e.type !== 'phase') return;
    if (e.phase === 'placement') {
      this.ready = [false, false];
      if (this.randomPlacement) this.placements = this.drawPlacements();
      this.applyPlacements();
    } else if (e.phase === 'countdown') {
      this.startPoses = [{ ...this.placements[0] }, { ...this.placements[1] }];
    } else if (e.phase === 'fight') {
      this.replay = [];
      this.outTouches = [null, null];
    }
  }

  private recordReplay(snap: SimSnapshot) {
    if (this.tick % REPLAY_EVERY) return;
    const [a, b] = snap.robots;
    this.replay.push({
      t: snap.time,
      pos: [a.position, b.position],
      rot: [a.rotation, b.rotation],
      spin: [a.wheels.map((w) => w.spin), b.wheels.map((w) => w.spin)],
    });
    const max = (REPLAY_SECONDS / PHYSICS_DT / REPLAY_EVERY) | 0;
    if (this.replay.length > max) this.replay.splice(0, this.replay.length - max);
  }

  private buildFacts(snap: SimSnapshot, dt: number): RefFacts {
    const robots = [0, 1].map((i) => {
      const st = snap.robots[i];
      const pose = { x: st.position.x, z: st.position.z, yaw: st.yaw };
      const prev = this.prevPose[i];
      // velocidade pela variação de pose, suavizada (~30 ms)
      const v = Math.hypot(pose.x - prev.x, pose.z - prev.z) / dt;
      const w = Math.abs(wrapAngle(pose.yaw - prev.yaw)) / dt;
      const a = Math.min(1, dt / 0.03);
      this.speed[i] += (v - this.speed[i]) * a;
      this.angSpeed[i] += (w - this.angSpeed[i]) * a;
      this.prevPose[i] = pose;
      const start = this.startPoses[i];
      return {
        touchingOutside: st.touchingOutside,
        hangingWheels: st.wheels.filter((wh) => wh.overEdge).length,
        speed: this.speed[i],
        angSpeed: this.angSpeed[i],
        movedFromStart: Math.hypot(pose.x - start.x, pose.z - start.z),
        turnedFromStart: Math.abs(wrapAngle(pose.yaw - start.yaw)),
        pushing: false,
        driveEffort: Math.max(Math.abs(st.drive.left), Math.abs(st.drive.right)),
        radius: Math.hypot(pose.x, pose.z),
        ready: this.ready[i],
      } satisfies RobotFact;
    }) as [RobotFact, RobotFact];

    const pa = snap.robots[0].position;
    const pb = snap.robots[1].position;
    const dx = pb.x - pa.x;
    const dz = pb.z - pa.z;
    const dist = Math.hypot(dx, dz) || 1e-6;
    const ux = dx / dist;
    const uz = dz / dist;
    if (snap.inContact) {
      const va = snap.robots[0].linvel;
      const vb = snap.robots[1].linvel;
      const aToward = va.x * ux + va.z * uz; // A avançando sobre B
      const bToward = -(vb.x * ux + vb.z * uz); // B avançando sobre A
      robots[0].pushing = aToward > 0.02 && aToward >= bToward;
      robots[1].pushing = bToward > 0.02 && bToward > aToward;
    }
    const rate = this.tick > 1 ? (dist - this.prevDistance) / dt : 0;
    this.distanceRate += (rate - this.distanceRate) * Math.min(1, dt / 0.1);
    this.prevDistance = dist;
    return { dt, robots, inContact: snap.inContact, distanceRate: this.distanceRate };
  }

  dispose() {
    this.sim.dispose();
  }
}

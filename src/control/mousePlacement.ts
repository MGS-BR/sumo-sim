import type { ArenaView } from '../render/arenaView';
import type { ControlFrame, Pose2D } from '../sim/types';

export interface MousePlacementHooks {
  /** Fase de posicionamento ativa (e jogo não pausado) */
  active(): boolean;
  /** Este robô pode ser mexido pelo mouse? (humano e ainda não pronto) */
  canEdit(i: number): boolean;
  pose(i: number): Pose2D;
}

const ROT_STEP = (7.5 * Math.PI) / 180;
const ROT_FINE = (1 * Math.PI) / 180;

/**
 * Posicionamento com mouse (ou toque): arrastar move o robô, a roda do mouse gira.
 * Não mexe na física diretamente — só produz `placeTarget` nos ControlFrames;
 * quem valida e corrige a pose (Art. 10) é o Match. Assim o mesmo caminho serve
 * para o modo online.
 */
export class MousePlacement {
  private drag: { i: number; dx: number; dz: number; pointerId: number } | null = null;
  private hover: number | null = null;
  private targets: (Pose2D | null)[] = [null, null];
  private readyReq = [false, false];
  private host: HTMLElement;

  constructor(
    private view: ArenaView,
    private hooks: MousePlacementHooks,
  ) {
    this.host = view.canvas.parentElement ?? view.canvas;
    // captura no elemento pai: chega antes da câmera livre (OrbitControls) no canvas
    this.host.addEventListener('pointerdown', this.onDown, { capture: true });
    this.host.addEventListener('pointermove', this.onMove, { capture: true });
    this.host.addEventListener('pointerup', this.onUp, { capture: true });
    this.host.addEventListener('pointercancel', this.onUp, { capture: true });
    this.host.addEventListener('wheel', this.onWheel, { capture: true, passive: false });
    this.host.addEventListener('contextmenu', this.onContext, { capture: true });
  }

  private editable(i: number | null): i is number {
    return i !== null && this.hooks.active() && this.hooks.canEdit(i);
  }

  private onDown = (e: PointerEvent) => {
    if (!this.hooks.active() || e.button !== 0) return;
    const i = this.view.pickRobot(e.clientX, e.clientY);
    if (!this.editable(i)) return;
    const g = this.view.groundPoint(e.clientX, e.clientY);
    if (!g) return;
    const p = this.hooks.pose(i);
    this.drag = { i, dx: p.x - g.x, dz: p.z - g.z, pointerId: e.pointerId };
    try {
      this.host.setPointerCapture(e.pointerId);
    } catch {
      /* ponteiro sintético: segue sem captura */
    }
    this.view.suspendControls(true);
    e.preventDefault();
    e.stopPropagation();
    this.refresh();
  };

  private onMove = (e: PointerEvent) => {
    if (!this.hooks.active()) {
      if (this.hover !== null || this.drag) this.cancel();
      return;
    }
    if (this.drag && e.pointerId === this.drag.pointerId) {
      const g = this.view.groundPoint(e.clientX, e.clientY);
      if (g) {
        const i = this.drag.i;
        this.targets[i] = { x: g.x + this.drag.dx, z: g.z + this.drag.dz, yaw: this.hooks.pose(i).yaw };
      }
      e.stopPropagation();
    } else {
      const i = this.view.pickRobot(e.clientX, e.clientY);
      this.hover = this.editable(i) ? i : null;
    }
    this.refresh();
  };

  private onUp = (e: PointerEvent) => {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    try {
      this.host.releasePointerCapture(e.pointerId);
    } catch {
      /* já liberado */
    }
    this.drag = null;
    this.view.suspendControls(false);
    e.stopPropagation();
    this.refresh();
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.hooks.active()) return;
    const i = this.drag?.i ?? this.view.pickRobot(e.clientX, e.clientY);
    if (!this.editable(i)) return;
    e.preventDefault();
    e.stopPropagation();
    const base = this.targets[i] ?? this.hooks.pose(i);
    const step = (e.shiftKey ? ROT_FINE : ROT_STEP) * Math.sign(e.deltaY || e.deltaX);
    this.targets[i] = { ...base, yaw: base.yaw - step };
  };

  private onContext = (e: Event) => {
    if (this.hooks.active()) e.preventDefault();
  };

  private refresh() {
    const st: [number, number] = [0, 0];
    if (this.hover !== null) st[this.hover] = 1;
    if (this.drag) st[this.drag.i] = 2;
    this.view.setPlacementHighlight(st);
  }

  requestReady(i: number) {
    if (this.editable(i)) this.readyReq[i] = true;
  }

  get dragging(): number | null {
    return this.drag?.i ?? null;
  }

  /** Injeta as intenções do mouse nos quadros deste tick */
  apply(frames: [ControlFrame, ControlFrame]) {
    for (let i = 0; i < 2; i++) {
      const t = this.targets[i];
      if (t) {
        frames[i] = { ...frames[i], placeTarget: t };
        // enquanto arrasta, mantém o alvo; giro pela roda é aplicado uma vez
        if (this.drag?.i !== i) this.targets[i] = null;
      }
      if (this.readyReq[i]) {
        frames[i] = { ...frames[i], ready: true };
        this.readyReq[i] = false;
      }
    }
  }

  cancel() {
    if (this.drag) this.view.suspendControls(false);
    this.drag = null;
    this.hover = null;
    this.targets = [null, null];
    this.readyReq = [false, false];
    this.view.setPlacementHighlight([0, 0]);
  }

  dispose() {
    this.cancel();
    this.host.removeEventListener('pointerdown', this.onDown, { capture: true });
    this.host.removeEventListener('pointermove', this.onMove, { capture: true });
    this.host.removeEventListener('pointerup', this.onUp, { capture: true });
    this.host.removeEventListener('pointercancel', this.onUp, { capture: true });
    this.host.removeEventListener('wheel', this.onWheel, { capture: true });
    this.host.removeEventListener('contextmenu', this.onContext, { capture: true });
  }
}

import type { RobotSpec, SimSnapshot } from './sim/types';
import { effectiveMotor } from './sim/catalog';

/**
 * Sons sintetizados com WebAudio (sem arquivos):
 *  - efeitos: bip de largada RC, contagem, Yuko, Keikoku, Torinaoshi, interface;
 *  - contínuo: só o motor de cada robô (sem ruído de atrito/raspagem);
 *  - batida no início de cada contato, proporcional à velocidade de aproximação.
 *
 * Voz do motor (motor DC com redução, como os de mini sumô), em 4 camadas:
 *  1. zumbido do comutador: 2 dentes-de-serra levemente desafinados, filtrados (passa-banda + passa-baixa);
 *     o tom segue a ROTAÇÃO real das rodas;
 *  2. engrenagem: senoide no harmônico de engrenamento, cresce com a rotação;
 *  3. PWM do driver: apito agudo fixo que cresce com a CORRENTE — é o "iiii" do robô travado empurrando;
 *  4. escovas: ruído suave em alta frequência.
 * Um LFO lento dá uma leve oscilação, para não soar como um tom de teste.
 */
interface EngineVoice {
  saws: OscillatorNode[];
  lfo: OscillatorNode;
  band: BiquadFilterNode;
  low: BiquadFilterNode;
  body: GainNode;
  gear: OscillatorNode;
  gearGain: GainNode;
  pwm: OscillatorNode;
  pwmGain: GainNode;
  brushFilter: BiquadFilterNode;
  brushGain: GainNode;
  pan: StereoPannerNode;
}

type Ctx = BaseAudioContext;

export class Sfx {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private engines: EngineVoice[] | null = null;
  private _muted = false;
  private _volume = 0.8;

  /** `ctx` injetável (OfflineAudioContext nos testes de áudio) */
  constructor(ctx?: Ctx) {
    if (ctx) this.setup(ctx);
  }

  get muted() {
    return this._muted;
  }
  set muted(v: boolean) {
    this._muted = v;
    this.applyVolume();
  }
  get volume() {
    return this._volume;
  }
  set volume(v: number) {
    this._volume = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.8;
    this.applyVolume();
  }

  private applyVolume() {
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this._muted ? 0 : this._volume, this.ctx.currentTime, 0.03);
  }

  private setup(ctx: Ctx) {
    this.ctx = ctx;
    // limitador suave no fim da cadeia: vários sons juntos não estouram
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 8;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.15;
    this.master = ctx.createGain();
    this.master.gain.value = this._muted ? 0 : this._volume;
    this.master.connect(comp).connect(ctx.destination);
  }

  private ac(): Ctx | null {
    if (this._muted) return null;
    try {
      if (!this.ctx) this.setup(new AudioContext());
      // só contexto em tempo real precisa ser "acordado" após o gesto do usuário
      const c = this.ctx;
      if (typeof AudioContext !== 'undefined' && c instanceof AudioContext && c.state === 'suspended') c.resume().catch(() => {});
      return this.ctx;
    } catch {
      return null;
    }
  }

  private noiseBuffer(ac: Ctx): AudioBuffer {
    if (this.noise) return this.noise;
    const len = ac.sampleRate * 2;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.08 * white) / 1.08;
      d[i] = last * 3.2 + white * 0.25;
    }
    this.noise = buf;
    return buf;
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.15, delay = 0, slide?: number) {
    const ac = this.ac();
    if (!ac || !this.master) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  tick() {
    this.tone(660, 0.09, 'square', 0.05);
  }
  /** Som eletrônico padrão de início para RC (Art. 10) */
  start() {
    this.tone(1320, 0.45, 'square', 0.08);
  }
  yuko() {
    this.tone(180, 1.2, 'sine', 0.3, 0, 120);
    this.tone(360, 0.8, 'triangle', 0.08);
  }
  keikoku() {
    this.tone(140, 0.25, 'sawtooth', 0.08);
    this.tone(140, 0.25, 'sawtooth', 0.08, 0.3);
  }
  torinaoshi() {
    this.tone(520, 0.15, 'triangle', 0.1);
    this.tone(390, 0.25, 'triangle', 0.1, 0.17);
  }
  click() {
    this.tone(900, 0.04, 'square', 0.03);
  }

  /** Som de interface por tipo de botão */
  ui(kind: 'confirm' | 'back' | 'danger' | 'select' | 'toggle' | 'tick') {
    switch (kind) {
      case 'confirm':
        this.tone(660, 0.07, 'triangle', 0.09);
        this.tone(990, 0.1, 'triangle', 0.08, 0.06);
        break;
      case 'back':
        this.tone(620, 0.06, 'triangle', 0.07);
        this.tone(440, 0.09, 'triangle', 0.06, 0.05);
        break;
      case 'danger':
        this.tone(220, 0.16, 'sawtooth', 0.05, 0, 150);
        break;
      case 'toggle':
        this.tone(1250, 0.035, 'square', 0.025);
        this.tone(1650, 0.035, 'square', 0.02, 0.035);
        break;
      case 'tick':
        this.tone(1500, 0.02, 'square', 0.02);
        break;
      default:
        this.tone(880, 0.045, 'triangle', 0.07);
    }
  }

  /** Batida de metal: força 0..1 (velocidade de aproximação normalizada) */
  impact(strength: number) {
    const ac = this.ac();
    if (!ac || !this.master || !(strength > 0.03)) return;
    const k = Math.min(1, strength);
    const t = ac.currentTime;
    this.tone(150 + 90 * k, 0.16, 'sine', 0.12 + 0.35 * k, 0, 55);
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuffer(ac);
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2600 + 1800 * k;
    f.Q.value = 1.2;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25 + 0.5 * k, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09 + 0.08 * k);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + 0.25);
  }

  private noiseLoop(ac: Ctx, type: BiquadFilterType, freq: number, q: number, dest: AudioNode) {
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuffer(ac);
    src.loop = true;
    const filter = ac.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ac.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(dest);
    src.start(0, Math.random() * 1.5);
    return { filter, gain };
  }

  private ensureLoops(ac: Ctx) {
    if (this.engines || !this.master) return;
    const master = this.master;
    this.engines = [0, 1].map((i) => {
      const pan = ac.createStereoPanner();
      pan.connect(master);
      // 1) comutador
      const band = ac.createBiquadFilter();
      band.type = 'bandpass';
      band.Q.value = 1.4;
      const low = ac.createBiquadFilter();
      low.type = 'lowpass';
      low.Q.value = 0.7;
      const body = ac.createGain();
      body.gain.value = 0;
      band.connect(low).connect(body).connect(pan);
      const lfo = ac.createOscillator();
      lfo.frequency.value = 5.5 + i * 1.3;
      const lfoDepth = ac.createGain();
      lfoDepth.gain.value = 9; // cents
      lfo.connect(lfoDepth);
      const saws = [-7, 7].map((cents) => {
        const o = ac.createOscillator();
        o.type = 'sawtooth';
        o.detune.value = cents;
        lfoDepth.connect(o.detune);
        o.connect(band);
        o.start();
        return o;
      });
      lfo.start();
      // 2) engrenagem
      const gear = ac.createOscillator();
      gear.type = 'sine';
      const gearGain = ac.createGain();
      gearGain.gain.value = 0;
      gear.connect(gearGain).connect(pan);
      gear.start();
      // 3) PWM do driver (cada robô num tom diferente, para distinguir os dois)
      const pwm = ac.createOscillator();
      pwm.type = 'triangle';
      pwm.frequency.value = i === 0 ? 2350 : 2650;
      const pwmGain = ac.createGain();
      pwmGain.gain.value = 0;
      pwm.connect(pwmGain).connect(pan);
      pwm.start();
      // 4) escovas
      const brush = this.noiseLoop(ac, 'bandpass', 3800, 0.9, pan);
      return { saws, lfo, band, low, body, gear, gearGain, pwm, pwmGain, brushFilter: brush.filter, brushGain: brush.gain, pan };
    });
  }

  /**
   * Atualiza os sons contínuos. `snap = null` silencia (pausa, replay, posicionamento).
   * `timeScale` abaixa o tom no modo arcade, coerente com a câmera lenta.
   * `when` permite agendar no tempo do contexto (renderização offline nos testes).
   */
  updateLoops(snap: SimSnapshot | null, specs: [RobotSpec, RobotSpec] | null, timeScale = 1, when?: number) {
    const ac = snap ? this.ac() : this.ctx;
    if (!ac || this._muted) return;
    const t = when ?? ac.currentTime;
    if (!snap || !specs) {
      if (this.engines) {
        for (const e of this.engines) {
          e.body.gain.setTargetAtTime(0, t, 0.05);
          e.gearGain.gain.setTargetAtTime(0, t, 0.05);
          e.pwmGain.gain.setTargetAtTime(0, t, 0.05);
          e.brushGain.gain.setTargetAtTime(0, t, 0.05);
        }
      }
      return;
    }
    this.ensureLoops(ac);
    const pitch = Math.sqrt(Math.max(0.1, timeScale));
    snap.robots.forEach((r, i) => {
      const e = this.engines![i];
      const spec = specs[i];
      const m = engineMix(r, spec);
      const f = m.rotorHz * pitch;
      for (const o of e.saws) o.frequency.setTargetAtTime(f, t, 0.04);
      e.band.frequency.setTargetAtTime(Math.max(180, f * 2.2), t, 0.05);
      e.low.frequency.setTargetAtTime(650 + 1700 * m.ratio, t, 0.05);
      e.body.gain.setTargetAtTime(m.body, t, 0.05);
      e.gear.frequency.setTargetAtTime(f * 3.5, t, 0.04);
      e.gearGain.gain.setTargetAtTime(m.gear, t, 0.06);
      e.pwmGain.gain.setTargetAtTime(m.pwm, t, 0.04);
      e.brushFilter.frequency.setTargetAtTime((3000 + 2000 * m.ratio) * pitch, t, 0.06);
      e.brushGain.gain.setTargetAtTime(m.brush, t, 0.06);
      e.pan.pan.setTargetAtTime(Math.max(-0.8, Math.min(0.8, r.position.x / 0.45)), t, 0.05);
    });

  }
}

/** Mistura das camadas do motor a partir do estado do robô (função pura, testável) */
export function engineMix(r: SimSnapshot['robots'][number], spec: RobotSpec) {
  const freeRpm = effectiveMotor(spec).freeRpm;
  const freeOmega = (freeRpm * 2 * Math.PI) / 60;
  const n = r.wheels.length || 1;
  let speed = 0;
  for (const w of r.wheels) speed += Math.abs(w.omega);
  const ratio = Math.min(1.25, speed / n / freeOmega);
  const u = Math.min(1, (Math.abs(r.drive.left) + Math.abs(r.drive.right)) / 2);
  // corrente ∝ tensão aplicada − força contraeletromotriz (rotação)
  const current = Math.max(0, u - ratio);
  const on = u > 0.02 || ratio > 0.03 ? 1 : 0;
  // rotor: motores mais rápidos soam mais agudos; parado com tensão ainda "zune" baixo
  const rotorFree = 170 + freeRpm * 0.28;
  return {
    ratio,
    current,
    rotorHz: 55 + rotorFree * ratio + 30 * u,
    body: on * (0.012 + 0.055 * Math.min(1, ratio) + 0.02 * u),
    gear: on * 0.016 * Math.min(1, ratio) ** 1.5,
    pwm: u > 0.02 ? 0.003 + 0.02 * current : 0,
    brush: on * (0.0022 * ratio + 0.004 * current),
  };
}

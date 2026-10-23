import type { RobotSpec, SimSnapshot } from './sim/types';

/**
 * Sons sintetizados com WebAudio (sem arquivos):
 *  - efeitos: bip de largada RC, contagem, Yuko, Keikoku, Torinaoshi, clique;
 *  - contínuos: motor de cada robô (tom segue a rotação, volume segue a corrente),
 *    atrito/raspagem quando os robôs se encostam, chiado de pneu patinando;
 *  - batida no início de cada contato, proporcional à velocidade de aproximação.
 * Tudo passa por um volume geral; o mudo corta tudo.
 */
interface EngineVoice {
  saw: OscillatorNode;
  sq: OscillatorNode;
  whine: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  whineGain: GainNode;
  pan: StereoPannerNode;
}

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private engines: EngineVoice[] | null = null;
  private scrape: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private squeal: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private _muted = false;
  private _volume = 0.8;

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

  private ac(): AudioContext | null {
    if (this._muted) return null;
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = this._volume;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  private noiseBuffer(ac: AudioContext): AudioBuffer {
    if (this.noise) return this.noise;
    const len = ac.sampleRate * 2;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    // ruído "marrom" leve: mais grave que o branco, soa como metal raspando em fórmica
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

  /** Batida de metal: força 0..1 (velocidade de aproximação normalizada) */
  impact(strength: number) {
    const ac = this.ac();
    if (!ac || !this.master || !(strength > 0.03)) return;
    const k = Math.min(1, strength);
    const t = ac.currentTime;
    // corpo da batida
    this.tone(150 + 90 * k, 0.16, 'sine', 0.12 + 0.35 * k, 0, 55);
    // estalo metálico (ruído curto e agudo)
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

  private ensureLoops(ac: AudioContext) {
    if (this.engines || !this.master) return;
    const master = this.master;
    this.engines = [0, 1].map(() => {
      const saw = ac.createOscillator();
      saw.type = 'sawtooth';
      const sq = ac.createOscillator();
      sq.type = 'square';
      const whine = ac.createOscillator();
      whine.type = 'triangle';
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 4;
      const gain = ac.createGain();
      gain.gain.value = 0;
      const whineGain = ac.createGain();
      whineGain.gain.value = 0;
      const pan = ac.createStereoPanner();
      const sqGain = ac.createGain();
      sqGain.gain.value = 0.35;
      saw.connect(filter);
      sq.connect(sqGain).connect(filter);
      filter.connect(gain).connect(pan);
      whine.connect(whineGain).connect(pan);
      pan.connect(master);
      saw.start();
      sq.start();
      whine.start();
      return { saw, sq, whine, filter, gain, whineGain, pan };
    });
    const loop = (type: BiquadFilterType, freq: number, q: number) => {
      const src = ac.createBufferSource();
      src.buffer = this.noiseBuffer(ac);
      src.loop = true;
      const filter = ac.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ac.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(master);
      src.start();
      return { src, filter, gain };
    };
    this.scrape = loop('bandpass', 1400, 0.9);
    this.squeal = loop('highpass', 3200, 0.7);
  }

  /**
   * Atualiza os sons contínuos. `snap = null` silencia (pausa, replay, posicionamento).
   * `timeScale` abaixa o tom no modo arcade, coerente com a câmera lenta.
   */
  updateLoops(snap: SimSnapshot | null, specs: [RobotSpec, RobotSpec] | null, timeScale = 1) {
    const ac = snap ? this.ac() : this.ctx;
    if (!ac || this._muted) return;
    if (!snap || !specs) {
      if (this.engines) {
        const t = ac.currentTime;
        for (const e of this.engines) {
          e.gain.gain.setTargetAtTime(0, t, 0.05);
          e.whineGain.gain.setTargetAtTime(0, t, 0.05);
        }
        this.scrape?.gain.gain.setTargetAtTime(0, t, 0.05);
        this.squeal?.gain.gain.setTargetAtTime(0, t, 0.05);
      }
      return;
    }
    this.ensureLoops(ac);
    const t = ac.currentTime;
    const pitch = Math.sqrt(Math.max(0.1, timeScale));
    let slipMax = 0;
    snap.robots.forEach((r, i) => {
      const e = this.engines![i];
      const spec = specs[i];
      const freeOmega = (spec.motor.freeRpm * 2 * Math.PI) / 60;
      const n = r.wheels.length || 1;
      let speed = 0;
      let slip = 0;
      for (const w of r.wheels) {
        speed += Math.abs(w.omega);
        if (w.slipping && w.load > 0) slip += Math.min(1, Math.abs(w.omega * spec.wheels.radius) / 0.4);
      }
      const ratio = Math.min(1.3, speed / n / freeOmega);
      const u = (Math.abs(r.drive.left) + Math.abs(r.drive.right)) / 2;
      // corrente ∝ (tensão − força contraeletromotriz): motor travado empurrando = mais alto e grave
      const current = Math.max(0, u - ratio);
      const f = (95 + 520 * ratio) * pitch;
      e.saw.frequency.setTargetAtTime(f, t, 0.03);
      e.sq.frequency.setTargetAtTime(f * 2.01, t, 0.03);
      e.whine.frequency.setTargetAtTime(f * 3.3 + 300 * pitch, t, 0.03);
      e.filter.frequency.setTargetAtTime(500 + 2600 * ratio + 900 * current, t, 0.04);
      const vol = u > 0.02 || ratio > 0.05 ? 0.012 + 0.05 * Math.min(1, u) + 0.06 * current : 0;
      e.gain.gain.setTargetAtTime(vol, t, 0.04);
      e.whineGain.gain.setTargetAtTime(0.01 * ratio * (u > 0.02 ? 1 : 0.3), t, 0.05);
      e.pan.pan.setTargetAtTime(Math.max(-0.8, Math.min(0.8, r.position.x / 0.45)), t, 0.05);
      slipMax = Math.max(slipMax, slip / n);
    });

    // atrito entre os robôs: raspagem proporcional ao escorregamento + "moagem" quando travam empurrando
    let scrape = 0;
    if (snap.inContact) {
      const [a, b] = snap.robots;
      const rel = Math.hypot(a.linvel.x - b.linvel.x, a.linvel.z - b.linvel.z) + 0.03 * Math.abs(a.angvel.y - b.angvel.y);
      const pushing = Math.min(1, (Math.abs(a.drive.left + a.drive.right) + Math.abs(b.drive.left + b.drive.right)) / 4);
      scrape = Math.min(1, rel / 0.5) * 0.7 + pushing * 0.25;
      this.scrape!.filter.frequency.setTargetAtTime((900 + 2200 * Math.min(1, rel / 0.6)) * pitch, t, 0.04);
    }
    this.scrape!.gain.gain.setTargetAtTime(scrape * 0.22, t, scrape > 0 ? 0.02 : 0.06);
    this.squeal!.gain.gain.setTargetAtTime(Math.min(1, slipMax) * 0.05, t, 0.05);
  }
}

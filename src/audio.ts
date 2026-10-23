/** Sons sintetizados (sem arquivos): bip de largada RC, contagem, Yuko, Keikoku. */
export class Sfx {
  private ctx: AudioContext | null = null;
  muted = false;

  private ac(): AudioContext | null {
    if (this.muted) return null;
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.15, delay = 0, slide?: number) {
    const ac = this.ac();
    if (!ac) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination);
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
}

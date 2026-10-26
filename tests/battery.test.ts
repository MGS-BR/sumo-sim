/**
 * Baterias 2S/3S/4S e compatibilidade motor × bateria.
 * Cada teste monta os próprios robôs (cópias) e o próprio mundo: nada é compartilhado.
 */
import { describe, expect, it } from 'vitest';
import {
  BATTERIES,
  COMPAT_LIMITS,
  MOTOR_PRESETS,
  applyMotorPreset,
  compatibility,
  effectiveMotor,
  lineCompat,
  motorPresetOf,
  recommendedCells,
  voltageRatio,
  wheelInertia,
} from '../src/sim/catalog';
import { normalizeSpec } from '../src/sim/specs';
import { inspect } from '../src/sim/inspection';
import { loadRapier, SumoWorld } from '../src/sim/physics';
import { Match } from '../src/sim/match';
import { MODES, PHYSICS_HZ } from '../src/sim/modes';
import { PRESETS } from '../src/sim/presets';
import { robot, softStart } from './fixtures';
import type { BatteryCells, RobotSpec } from '../src/sim/types';

const withMotor = (id: string, cells: BatteryCells, body = 'tora'): RobotSpec => {
  const s = robot(body);
  expect(applyMotorPreset(s, id)).toBe(true);
  s.battery = { cells };
  return s;
};

describe('baterias LiPo', () => {
  it('2S, 3S e 4S: 3,7 V nominal e 4,2 V cheia por célula', () => {
    expect(BATTERIES.map((b) => [b.cells, b.nominal, b.full])).toEqual([
      [2, 7.4, 8.4],
      [3, 11.1, 12.6],
      [4, 14.8, 16.8],
    ]);
    expect(Object.isFrozen(BATTERIES)).toBe(true);
  });

  it('a lista não pode ser alterada em tempo de execução', () => {
    expect(() => (BATTERIES as unknown as unknown[]).push({})).toThrow();
  });
});

describe('catálogo revisto para as baterias', () => {
  it('toda linha do catálogo tem ao menos uma bateria com sobretensão no máximo moderada', () => {
    for (const m of MOTOR_PRESETS) {
      const best = Math.min(...BATTERIES.map((b) => b.full / m.voltage));
      expect(BATTERIES.some((b) => b.full / m.voltage <= COMPAT_LIMITS.moderate), m.id).toBe(true);
      expect(best, m.id).toBeGreaterThan(0);
    }
  });

  it('N30 5 V saiu (2S cheia já é 1,68×); entram N20 HPCB 12 V e JGA16-050 12 V', () => {
    expect(MOTOR_PRESETS.some((m) => m.voltage === 5)).toBe(false);
    expect(MOTOR_PRESETS.some((m) => m.id.startsWith('n30-5'))).toBe(false);
    expect(MOTOR_PRESETS.filter((m) => m.id.startsWith('n20hpcb12-')).length).toBe(8);
    expect(MOTOR_PRESETS.filter((m) => m.id.startsWith('jga16-12-')).length).toBe(7);
    expect(new Set(MOTOR_PRESETS.map((m) => m.id)).size).toBe(MOTOR_PRESETS.length);
  });

  it('bateria indicada: 6 V → 2S, 12 V → 3S', () => {
    expect(recommendedCells(6)).toBe(2);
    expect(recommendedCells(12)).toBe(3);
  });

  it('níveis das linhas do catálogo', () => {
    expect([2, 3, 4].map((c) => lineCompat(6, c as BatteryCells))).toEqual(['warn', 'critical', 'critical']);
    expect([2, 3, 4].map((c) => lineCompat(12, c as BatteryCells))).toEqual(['warn', 'ok', 'warn']);
    expect(lineCompat(5, 2)).toBe('high');
  });

  it('o editor reconhece a JGA16 de 6 V e a de 12 V (mesma rotação e torque) pela tensão', () => {
    expect(motorPresetOf(withMotor('jga16-6-32', 2))!.id).toBe('jga16-6-32');
    expect(motorPresetOf(withMotor('jga16-12-32', 3))!.id).toBe('jga16-12-32');
  });

  it('presets: motor de 12 V na 3S, todos compatíveis (escolha da análise de baterias)', () => {
    for (const p of PRESETS) {
      const c = compatibility(p);
      expect(c.level, p.id).toBe('ok');
      expect(p.battery?.cells, p.id).toBe(recommendedCells(p.motor.ratedVoltage!));
      expect(c.kFull, p.id).toBeLessThanOrEqual(COMPAT_LIMITS.ok);
    }
  });
});

describe('motor na bateria', () => {
  it('rotação, torque e corrente escalam com V_bateria/V_motor; τ e inércia não mudam', () => {
    const a = withMotor('n30-12-50', 3);
    const b = withMotor('n30-12-50', 4);
    const ea = effectiveMotor(a);
    const eb = effectiveMotor(b);
    expect(ea.k).toBeCloseTo(11.1 / 12, 10);
    expect(eb.k).toBeCloseTo(14.8 / 12, 10);
    expect(ea.freeRpm).toBeCloseTo(320 * ea.k, 6);
    expect(ea.stallTorque).toBeCloseTo(a.motor.stallTorque * ea.k, 10);
    expect(ea.stallCurrent!).toBeCloseTo(0.6 * ea.k, 10);
    expect(eb.timeConstant).toBe(ea.timeConstant);
    expect(wheelInertia(a).motor).toBeCloseTo(wheelInertia(b).motor, 12);
    // a spec guarda os valores da ficha: escolher a bateria não reescreve o motor
    expect(a.motor.freeRpm).toBe(320);
  });

  it('robô sem tensão do motor (antigo): razão 1, rende o que está escrito', () => {
    const s = robot('tora');
    delete s.motor.ratedVoltage;
    s.battery = { cells: 4 };
    expect(voltageRatio(s)).toBe(1);
    expect(effectiveMotor(s).freeRpm).toBe(s.motor.freeRpm);
    expect(compatibility(s).alerts[0].title).toMatch(/não informada/);
  });

  it('na física, a mesma N30 12 V na 4S anda mais rápido que na 2S, na proporção da tensão', async () => {
    const R = await loadRapier();
    const speed = (cells: BatteryCells) => {
      const s = withMotor('n30-12-50', cells);
      const w = new SumoWorld(R, [s, robot('bloco')]);
      w.setPose(0, { x: -0.3, z: 0, yaw: 0 });
      w.setPose(1, { x: 0.3, z: 0.35, yaw: 0 });
      for (let i = 0; i < 0.2 * PHYSICS_HZ; i++) w.step();
      const ramp = softStart();
      let sum = 0, n = 0;
      for (let i = 0; i < 0.5 * PHYSICS_HZ; i++) {
        const u = ramp(1);
        w.setCommand(0, { left: u, right: u });
        w.step();
        if (i > 0.35 * PHYSICS_HZ) {
          sum += w.robotState(0).linvel.x;
          n++;
        }
      }
      w.dispose();
      return sum / n;
    };
    const v2 = await speed(2);
    const v4 = await speed(4);
    expect(v4 / v2).toBeGreaterThan(1.8);
    expect(v4 / v2).toBeLessThan(2.1);
  });
});

describe('compatibilidade: avisa, nunca bloqueia', () => {
  it('níveis pela razão com a bateria cheia', () => {
    expect(compatibility(withMotor('n30-12-50', 3)).level).toBe('ok');
    expect(compatibility(withMotor('n30-12-50', 4)).level).toBe('warn');
    expect(compatibility(withMotor('n30-12-50', 2)).level).toBe('warn'); // subtensão
    expect(compatibility(withMotor('n20hp6-50', 2)).level).toBe('warn');
    expect(compatibility(withMotor('n20hp6-50', 3)).level).toBe('critical');
    const custom = withMotor('n30-12-50', 2);
    custom.motor.ratedVoltage = 5; // 8,4 / 5 = 1,68×
    expect(compatibility(custom).level).toBe('high');
    custom.motor.ratedVoltage = 14; // 7,4 / 14 = 53%
    expect(compatibility(custom).level).toBe('high');
  });

  it('sobretensão: alerta com a razão e o calor (k²)', () => {
    const c = compatibility(withMotor('n20hp6-50', 3));
    expect(c.kFull).toBeCloseTo(2.1, 6);
    expect(c.heat).toBeCloseTo(4.41, 6);
    expect(c.alerts[0].title).toMatch(/Sobretensão crítica: 2,10×/);
    expect(c.alerts[0].text).toMatch(/4,4×/);
  });

  it('ponte H: 2S cabe nas duas; 3S passa da DRV8833; 4S passa das duas', () => {
    const driver = (cells: BatteryCells) => compatibility(withMotor('n30-12-50', cells)).alerts.filter((a) => a.title === 'Ponte H');
    expect(driver(2)).toEqual([]);
    expect(driver(3)[0].text).toMatch(/TB6612FNG.*DRV8833/);
    expect(driver(4)[0].text).toMatch(/DRV8833.*TB6612FNG/);
    // nota informativa não rebaixa um motor compatível
    expect(compatibility(withMotor('n30-12-50', 3)).level).toBe('ok');
  });

  it('caixa N20: alerta acima de 2 kgf·cm instantâneos', () => {
    const strong = compatibility(withMotor('n20hp6-210', 2)); // 3,0 × 1,4 = 4,2 kgf·cm
    expect(strong.alerts.some((a) => a.title === 'Caixa de redução no limite')).toBe(true);
    const fuji = compatibility(withMotor('n20hp6-50', 2)); // 0,86 × 1,4 = 1,2 kgf·cm
    expect(fuji.alerts.some((a) => a.title === 'Caixa de redução no limite')).toBe(false);
  });

  it('corrente: avisa quando os motores travados puxam mais que o pack e quando passam da ponte H', () => {
    const s = withMotor('jga16-6-32', 2);
    s.wheels.count = 4;
    s.motor.stallCurrent = 9; // 9 × 1,4 × 4 = 50,4 A > 33,75 A
    const c = compatibility(s);
    expect(c.totalStallCurrentFull!).toBeCloseTo(50.4, 6);
    expect(c.alerts.some((a) => a.title === 'Corrente acima da bateria')).toBe(true);
    expect(c.alerts.some((a) => a.title === 'Corrente na ponte H')).toBe(true);
  });

  it('combinação crítica continua legal na inspeção e luta normalmente', async () => {
    const s = withMotor('n20hp6-50', 4, 'fuji'); // 16,8 / 6 = 2,8×
    expect(compatibility(s).level).toBe('critical');
    expect(inspect(s).ok).toBe(true);
    const m = await Match.create({ specs: [s, robot('kunai')], mode: MODES.realista, seed: 1 });
    const frame = (u: number) => ({ drive: { left: u, right: u }, place: { forward: 0, side: 0, yaw: 0 }, ready: true });
    for (let i = 0; i < 15 * PHYSICS_HZ && m.ref.s.phase !== 'fight'; i++) m.step([frame(0), frame(0)]);
    expect(m.ref.s.phase).toBe('fight');
    const x0 = m.lastSnapshot.robots[0].position.x;
    const ramp = softStart();
    for (let i = 0; i < 0.3 * PHYSICS_HZ; i++) m.step([frame(ramp(1)), frame(0)]);
    // o robô azul sai do lado −x e anda para +x
    expect(Math.abs(m.lastSnapshot.robots[0].position.x - x0)).toBeGreaterThan(0.02);
    m.dispose();
  });
});

describe('segurança: dados salvos ou importados', () => {
  it('células fora de 2/3/4 (texto, 1S, 6S, NaN, objeto) viram 2S', () => {
    for (const cells of ['3', 1, 6, NaN, -4, 3.5, {}, null, '<img src=x>'])
      expect(normalizeSpec({ ...robot('tora'), battery: { cells } })!.battery, String(cells)).toEqual({ cells: 2 });
    expect(normalizeSpec({ ...robot('tora'), battery: 'x' })!.battery).toEqual({ cells: 2 });
    expect(normalizeSpec({ ...robot('tora'), battery: { cells: 4 } })!.battery).toEqual({ cells: 4 });
  });

  it('tensão e corrente do motor limitadas a faixas físicas', () => {
    const n = (motor: Record<string, unknown>) => normalizeSpec({ ...robot('tora'), motor: { ...robot('tora').motor, ...motor } })!.motor;
    expect(n({ ratedVoltage: 1e9 }).ratedVoltage).toBe(24);
    expect(n({ ratedVoltage: -5 }).ratedVoltage).toBe(3);
    expect(n({ ratedVoltage: Infinity }).ratedVoltage).toBe(11.1); // inválido → a da bateria (3S)
    expect(n({ stallCurrent: 1e9 }).stallCurrent).toBe(10);
    expect(n({ stallCurrent: 'abc' }).stallCurrent).toBeUndefined();
  });

  it('chaves extras e __proto__ na bateria são descartadas', () => {
    const raw = JSON.parse('{"battery":{"__proto__":{"polluted":1},"cells":3,"evil":"<script>"}}');
    const s = normalizeSpec({ ...robot('tora'), ...raw })!;
    expect(s.battery).toEqual({ cells: 3 });
    expect(Object.keys(s.battery!)).toEqual(['cells']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('robô salvo antes das baterias: 2S e tensão do motor = 7,4 V, rende igual a antes', () => {
    const old = robot('tora');
    delete old.battery;
    delete old.motor.ratedVoltage;
    delete old.motor.stallCurrent;
    const s = normalizeSpec(JSON.parse(JSON.stringify(old)))!;
    expect(s.battery).toEqual({ cells: 2 });
    expect(s.motor.ratedVoltage).toBe(7.4);
    expect(effectiveMotor(s).k).toBe(1);
    expect(effectiveMotor(s).freeRpm).toBe(old.motor.freeRpm);
  });

  it('textos dos alertas só têm números e palavras fixas (nada vindo do usuário)', () => {
    const s = withMotor('n20hp6-50', 4);
    s.name = '<img src=x onerror=alert(1)>';
    for (const a of compatibility(s).alerts) expect(a.title + a.text).not.toMatch(/[<>]/);
  });
});

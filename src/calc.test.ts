import { describe, expect, it } from 'vitest';
import { estimativaTalhao, PARAMETROS_PADRAO, resumoColeta, statusMS, teorMS } from './calc';
import type { Amostra } from './db';

const amostra = (pesoVerdeKg: number | null, pesoUmidoG: number | null, pesoSecoG: number | null): Amostra => ({
  coletaId: 1,
  ponto: 1,
  pesoVerdeKg,
  pesoUmidoG,
  pesoSecoG,
});

describe('teorMS', () => {
  it('calcula MS e rejeita dados inválidos', () => {
    expect(teorMS({ pesoUmidoG: 200, pesoSecoG: 50 })).toBe(25);
    expect(teorMS({ pesoUmidoG: 0, pesoSecoG: 0 })).toBeNull();
    expect(teorMS({ pesoUmidoG: 100, pesoSecoG: 120 })).toBeNull();
    expect(teorMS({ pesoUmidoG: 100, pesoSecoG: null })).toBeNull();
  });
});

describe('resumoColeta', () => {
  it('converte kg/m² em t/ha e combina com MS', () => {
    const r = resumoColeta({ areaAmostralM2: 1 }, [
      amostra(5, 200, 60), // 30% MS
      amostra(7, 200, 60),
      amostra(6, null, null), // sem subamostra
    ]);
    expect(r.nPontos).toBe(3);
    expect(r.nPontosMS).toBe(2);
    expect(r.mvKgM2).toBeCloseTo(6);
    expect(r.tMVha).toBeCloseTo(60);
    expect(r.msPct).toBeCloseTo(30);
    expect(r.tMSha).toBeCloseTo(18);
    expect(r.cvPct).toBeCloseTo((1 / 6) * 100);
  });

  it('considera a área do quadro', () => {
    const r = resumoColeta({ areaAmostralM2: 0.25 }, [amostra(1.5, null, null)]);
    expect(r.tMVha).toBeCloseTo(60);
    expect(r.tMSha).toBeNull();
  });
});

describe('estimativaTalhao', () => {
  it('estima totais, silagem e volume', () => {
    const r = resumoColeta({ areaAmostralM2: 1 }, [amostra(6, 100, 30)]);
    const e = estimativaTalhao(10, r, { ...PARAMETROS_PADRAO, perdasPct: 10, densidadeKgM3: 600 });
    expect(e.tMVtotal).toBeCloseTo(600);
    expect(e.tMStotal).toBeCloseTo(180);
    expect(e.silagemT).toBeCloseTo(540);
    expect(e.volumeM3).toBeCloseTo(900);
  });

  it('não estima totais sem área informada', () => {
    const r = resumoColeta({ areaAmostralM2: 1 }, [amostra(6, 100, 30)]);
    expect(estimativaTalhao(0, r, PARAMETROS_PADRAO).tMVtotal).toBeNull();
  });
});

describe('statusMS', () => {
  it('classifica a faixa de MS', () => {
    expect(statusMS(22, PARAMETROS_PADRAO)).toBe('baixo');
    expect(statusMS(30, PARAMETROS_PADRAO)).toBe('ideal');
    expect(statusMS(40, PARAMETROS_PADRAO)).toBe('alto');
    expect(statusMS(null, PARAMETROS_PADRAO)).toBeNull();
  });
});

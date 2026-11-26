import { describe, expect, it } from 'vitest';
import { granulometriaMilho, msMilho, proximoCodigoMilho } from './milhoReidratado';

const pesos = (p6: number | null, p325: number, p2: number, p125: number, f: number) => ({
  peneira6G: p6, peneira325G: p325, peneira2G: p2, peneira125G: p125, fundoG: f,
});

describe('milho reidratado', () => {
  it('% por peneira e metas (6 mm = 0% · 3,25+2 ≥ 75% · 1,25+fundo ≤ 25%)', () => {
    const g = granulometriaMilho(pesos(0, 40, 40, 15, 5))!;
    expect(g.totalG).toBe(100);
    expect(g.pct).toEqual([0, 40, 40, 15, 5]);
    expect(g.metas.map((m) => [m.meta.chave, m.pct, m.ok])).toEqual([['p6', 0, true], ['medio', 80, true], ['fino', 20, true]]);
  });

  it('fora da meta: algo retido em 6 mm, médio abaixo de 75%, fino acima de 25%', () => {
    const g = granulometriaMilho(pesos(2, 30, 40, 20, 8))!;
    expect(g.metas.map((m) => m.ok)).toEqual([false, false, false]);
    // limites: exatamente 75% e 25% estão dentro
    expect(granulometriaMilho(pesos(0, 40, 35, 20, 5))!.metas.map((m) => m.ok)).toEqual([true, true, true]);
  });

  it('sem todos os pesos não calcula; MS e código do dia', () => {
    expect(granulometriaMilho(pesos(null, 40, 40, 15, 5))).toBeNull();
    expect(msMilho({ pesoUmidoG: 100, pesoSecoG: 64 })).toBe(64);
    expect(proximoCodigoMilho('2026-11-26T08:00', [{ codigo: 'MR-2611-1' }, { codigo: 'MR-2611-3' }, { codigo: 'MR-2511-9' }])).toBe('MR-2611-4');
    expect(proximoCodigoMilho('2026-11-27T08:00', [{ codigo: 'MR-2611-1' }])).toBe('MR-2711-1');
  });
});

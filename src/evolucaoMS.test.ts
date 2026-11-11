import { describe, expect, it } from 'vitest';
import { diaDe, faixaDias, faixaMS, seriesMS } from './evolucaoMS';
import type { Amostra, Coleta, Talhao } from './tipos';

const talhoes: Talhao[] = [
  { id: 't18', nome: 'Talhão 18 - PD', areaHa: 118, capim: 'Miyagi' },
  { id: 't21', nome: 'Talhão 21 - Conf', areaHa: 73, capim: 'Mombaça' },
  { id: 't20', nome: 'Talhão 20 - Conf', areaHa: 35, capim: 'Piatã' },
];
const coletas: Coleta[] = [
  { id: 'c2', talhaoId: 't21', data: '2026-11-13', responsavel: '', areaAmostralM2: 1 },
  { id: 'c1', talhaoId: 't21', data: '2026-11-06', responsavel: '', areaAmostralM2: 1 },
  { id: 'c3', talhaoId: 't18', data: '2026-11-07', responsavel: '', areaAmostralM2: 1 },
  { id: 'c4', talhaoId: 't20', data: '2026-11-08', responsavel: '', areaAmostralM2: 1 }, // sem MS
];
const am = (coletaId: string, ponto: number, seco: number | null): Amostra => ({
  id: `${coletaId}-${ponto}`, coletaId, ponto, pesoVerdeKg: 2, pesoUmidoG: seco == null ? null : 100, pesoSecoG: seco,
});
const amostras = [am('c1', 1, 22), am('c1', 2, 20), am('c2', 1, 30), am('c3', 1, 24), am('c3', 2, null), am('c4', 1, null)];

describe('evolução da MS', () => {
  it('monta uma série por talhão com coleta, em ordem de nome e de data; sem MS entra como a aferir', () => {
    const s = seriesMS(talhoes, coletas, amostras);
    expect(s.map((x) => x.talhao.id)).toEqual(['t18', 't20', 't21']);
    expect(s[2].pontos.map((p) => [p.data, p.msPct, p.nPontosMS])).toEqual([
      ['2026-11-06', 21, 2],
      ['2026-11-13', 30, 1],
    ]);
    expect(s[0].pontos).toEqual([{ coletaId: 'c3', data: '2026-11-07', msPct: 24, nPontos: 2, nPontosMS: 1 }]);
    expect(s[1].pontos).toEqual([{ coletaId: 'c4', data: '2026-11-08', msPct: null, nPontos: 1, nPontosMS: 0 }]); // só peso verde
    expect(seriesMS(talhoes, [], [])).toEqual([]);
  });

  it('faixas dos eixos', () => {
    const s = seriesMS(talhoes, coletas, amostras);
    expect(faixaDias(s)).toEqual([diaDe('2026-11-06'), diaDe('2026-11-13')]);
    expect(faixaDias([s[0]])).toEqual([diaDe('2026-11-07') - 3, diaDe('2026-11-07') + 3]);
    expect(faixaMS(s, 28, 35)).toEqual([10, 40]);
    expect(faixaMS([s[1]], 28, 35)).toEqual([10, 40]); // sem valor medido: só a faixa ideal
    expect(faixaMS([], 28, 35)).toEqual([10, 40]);
    expect(diaDe('2026-11-07') - diaDe('2026-11-06')).toBe(1);
  });
});

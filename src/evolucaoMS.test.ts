import { describe, expect, it } from 'vitest';
import { diaDe, faixaDias, faixaMS, seriesMS } from './evolucaoMS';
import type { Amostra, AmostraColheita, Carga, Coleta, Talhao } from './tipos';

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
    expect(s[0].pontos).toEqual([{ coletaId: 'c3', data: '2026-11-07', msPct: 24, nPontos: 2, nPontosMS: 1, origem: 'campo', link: '/coletas/c3' }]);
    expect(s[1].pontos).toEqual([{ coletaId: 'c4', data: '2026-11-08', msPct: null, nPontos: 1, nPontosMS: 0, origem: 'campo', link: '/coletas/c4' }]); // só peso de MN
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

  it('amostras de caminhão entram como pontos de colheita (média do dia, só com MS) e marcam o início da colheita', () => {
    const ac = (id: string, talhaoId: string, coletadaEm: string, seco: number | null): AmostraColheita =>
      ({ id, codigo: id, talhaoId, coletadaEm, placa: 'X', silo: 'Trincheira 1', peneira19G: null, peneira8G: null, peneira4G: null, fundoG: null, pesoUmidoG: seco == null ? null : 100, pesoSecoG: seco }) as AmostraColheita;
    const amostrasColheita = [ac('k1', 't18', '2026-11-15T08:00', 26), ac('k2', 't18', '2026-11-15T14:00', 28), ac('k3', 't18', '2026-11-16T08:00', null), ac('k4', 't99', '2026-11-15T08:00', 30)];
    const cargas = [{ id: 'g1', talhaoId: 't18', saidaEm: '2026-11-14T07:00' }, { id: 'g2', talhaoId: 't20', saidaEm: '2026-11-17T07:00' }] as Carga[];
    const s = seriesMS(talhoes, coletas, amostras, { amostrasColheita, cargas });
    const t18 = s.find((x) => x.talhao.id === 't18')!;
    expect(t18.inicioColheita).toBe('2026-11-14'); // a primeira carga veio antes da primeira amostra
    expect(t18.pontos.map((p) => [p.origem, p.data, p.msPct, p.nPontosMS])).toEqual([
      ['campo', '2026-11-07', 24, 1],
      ['colheita', '2026-11-15', 27, 2], // dia 16 sem MS: fica de fora
    ]);
    expect(t18.pontos[1].link).toBe('/coletas?colheita=k1');
    expect(s.find((x) => x.talhao.id === 't20')!.inicioColheita).toBe('2026-11-17');
    expect(s.find((x) => x.talhao.id === 't21')!.inicioColheita).toBeNull();
    expect(faixaDias(s)).toEqual([diaDe('2026-11-06'), diaDe('2026-11-17')]);
  });

  it('talhão só com amostras de caminhão também ganha série', () => {
    const k = { id: 'k1', codigo: 'k1', talhaoId: 't20', coletadaEm: '2026-11-15T08:00', placa: 'X', silo: '', pesoUmidoG: 100, pesoSecoG: 25 } as AmostraColheita;
    const s = seriesMS(talhoes, [], [], { amostrasColheita: [k] });
    expect(s.map((x) => [x.talhao.id, x.pontos.length, x.inicioColheita])).toEqual([['t20', 1, '2026-11-15']]);
  });
});
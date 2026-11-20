// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { PARAMETROS_PADRAO } from './calc';
import { coletasDoDia, datasComColeta } from './imagemColetasDia';
import type { Amostra, Coleta, Talhao } from './tipos';

const talhoes: Talhao[] = [
  { id: 't2', nome: 'Pivô 2', areaHa: 10, capim: 'Miyagi', fazenda: 'Confinamento' },
  { id: 't1', nome: 'Pivô 1', areaHa: 10, capim: 'Miyagi', fazenda: 'Confinamento' },
];
const coletas: Coleta[] = [
  { id: 'c1', talhaoId: 't1', data: '2026-11-19', responsavel: 'Ana', areaAmostralM2: 1 },
  { id: 'c2', talhaoId: 't2', data: '2026-11-19', responsavel: 'Ana', areaAmostralM2: 1 },
  { id: 'c3', talhaoId: 't1', data: '2026-11-20', responsavel: 'Ana', areaAmostralM2: 1 },
  { id: 'vazia', talhaoId: 't2', data: '2026-11-20', responsavel: 'Ana', areaAmostralM2: 1 },
];
const amostras: Amostra[] = [
  { id: 'a2', coletaId: 'c1', ponto: 2, pesoVerdeKg: 4, pesoUmidoG: 100, pesoSecoG: 30 },
  { id: 'a1', coletaId: 'c1', ponto: 1, pesoVerdeKg: 2, pesoUmidoG: 100, pesoSecoG: 20 },
  { id: 'b1', coletaId: 'c2', ponto: 1, pesoVerdeKg: 3, pesoUmidoG: null, pesoSecoG: null },
  { id: 'd1', coletaId: 'c3', ponto: 1, pesoVerdeKg: 1.7, pesoUmidoG: null, pesoSecoG: null },
];

describe('imagem das amostras de campo do dia', () => {
  it('datas com coleta, da mais recente', () => {
    expect(datasComColeta({ coletas })).toEqual(['2026-11-20', '2026-11-19']);
  });

  it('uma coleta por talhão, em ordem de nome, com resumo e pontos; coleta sem ponto fica de fora', () => {
    const dia = coletasDoDia('2026-11-19', { talhoes, coletas, amostras }, PARAMETROS_PADRAO);
    expect(dia.map((c) => c.talhao)).toEqual(['Pivô 1 - Conf', 'Pivô 2 - Conf']);
    expect(dia[0].pontos.map((p) => p.ponto)).toEqual([1, 2]);
    expect(dia[0].pontos[1].tMVha).toBeCloseTo(40);
    expect(dia[0].r.msPct).toBeCloseTo(25);
    expect(dia[0].status).toBe('baixo'); // abaixo de 26%
    expect(dia[1].pontos[0].msPct).toBeNull();
    expect(dia[1].status).toBeNull();
    expect(coletasDoDia('2026-11-20', { talhoes, coletas, amostras }, PARAMETROS_PADRAO).map((c) => c.talhao)).toEqual(['Pivô 1 - Conf']);
  });
});

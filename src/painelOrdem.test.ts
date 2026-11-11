// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { comparadorColuna } from './pages/Painel';
import type { ResumoColeta } from './calc';

const r = (msPct: number | null, nPontos = 2): ResumoColeta => ({ msPct, nPontos } as unknown as ResumoColeta);
const linhas = [
  { t: { id: '1', nome: 'Talhão 21 - Conf', areaHa: 73, capim: 'Mombaça' }, c: { id: 'c1', talhaoId: '1', data: '2026-11-06', responsavel: '', areaAmostralM2: 1 }, r: r(21) },
  { t: { id: '2', nome: 'Talhão 18 - PD', areaHa: 118, capim: 'Miyagi' }, c: { id: 'c2', talhaoId: '2', data: '2026-11-07', responsavel: '', areaAmostralM2: 1 }, r: r(23.7, 6) },
  { t: { id: '3', nome: 'Talhão 20 - Conf', areaHa: 35, capim: 'Piatã' }, c: undefined, r: null },
  { t: { id: '4', nome: 'Pivô 1 - Conf', areaHa: 110, capim: '' }, c: undefined, r: null },
];
const nomes = (ls: typeof linhas) => ls.map((l) => l.t.nome.replace(/ - .*/, ''));

describe('ordenação das colunas do Painel', () => {
  it('ordena números e textos, com "sem valor" sempre no fim', () => {
    expect(nomes([...linhas].sort(comparadorColuna('msPct', true)))).toEqual(['Talhão 21', 'Talhão 18', 'Pivô 1', 'Talhão 20']);
    expect(nomes([...linhas].sort(comparadorColuna('msPct', false)))).toEqual(['Talhão 18', 'Talhão 21', 'Pivô 1', 'Talhão 20']);
    expect(nomes([...linhas].sort(comparadorColuna('area', false)))).toEqual(['Talhão 18', 'Pivô 1', 'Talhão 21', 'Talhão 20']);
    expect(nomes([...linhas].sort(comparadorColuna('capim', true)))).toEqual(['Talhão 18', 'Talhão 21', 'Talhão 20', 'Pivô 1']);
    expect(nomes([...linhas].sort(comparadorColuna('data', false)))).toEqual(['Talhão 18', 'Talhão 21', 'Pivô 1', 'Talhão 20']);
    expect(nomes([...linhas].sort(comparadorColuna('nome', true)))).toEqual(['Pivô 1', 'Talhão 18', 'Talhão 20', 'Talhão 21']);
  });
});

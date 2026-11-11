// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { PARAMETROS_PADRAO } from './calc';
import { descreverDatas, montarRelatorio } from './relatorioPdf';
import type { Amostra, Dados } from './tipos';

const am = (coletaId: string, ponto: number, verde: number, seco: number | null): Amostra => ({
  id: `${coletaId}-${ponto}`, coletaId, ponto, pesoVerdeKg: verde, pesoUmidoG: seco == null ? null : 100, pesoSecoG: seco,
});
const dados: Dados = {
  talhoes: [
    { id: 't23', nome: 'Talhão 23 - Conf', areaHa: 49.9, capim: 'Mombaça', fazenda: 'Confinamento' },
    { id: 't21', nome: 'Talhão 21 - Conf', areaHa: 73, capim: 'Mombaça', fazenda: 'Confinamento', observacoes: 'Talhão desuniforme' },
    { id: 't18', nome: 'Talhão 18 - PD', areaHa: 118, capim: 'Miyagi', fazenda: 'Pedra' },
    { id: 't20', nome: 'Talhão 20 - Conf', areaHa: 35, capim: 'Piatã', fazenda: 'Confinamento' },
  ],
  coletas: [
    { id: 'c1', talhaoId: 't23', data: '2026-11-06', responsavel: '', areaAmostralM2: 1 },
    { id: 'c2', talhaoId: 't21', data: '2026-11-06', responsavel: '', areaAmostralM2: 1 },
    { id: 'c3', talhaoId: 't18', data: '2026-11-07', responsavel: '', areaAmostralM2: 1 },
    { id: 'c4', talhaoId: 't23', data: '2026-11-10', responsavel: '', areaAmostralM2: 1 },
  ],
  amostras: [
    am('c1', 1, 3.6, 22), am('c1', 2, 4.1, 24),
    am('c2', 1, 1.2, 22), am('c2', 2, 3.0, 20),
    am('c3', 1, 2.02, 22), am('c3', 2, 1.0, 26), am('c3', 3, 2.3, 24), am('c3', 4, 1.0, 26), am('c3', 5, 2.0, 22), am('c3', 6, 1.68, 22),
    am('c4', 1, 3.23, null), am('c4', 2, 2.4, null),
  ],
};

describe('relatório em PDF', () => {
  it('descreve as datas das coletas', () => {
    expect(descreverDatas(['2026-11-06'])).toBe('06/11/2026');
    expect(descreverDatas(['2026-11-07', '2026-11-06', '2026-11-06'])).toBe('06 e 07/11/2026');
    expect(descreverDatas(['2026-11-06', '2026-11-10', '2026-11-20'])).toBe('06/11/2026 a 20/11/2026');
    expect(descreverDatas([])).toBe('sem coletas');
  });

  it('reproduz as tabelas do relatório de 07/11 e lê os resultados', () => {
    const r = montarRelatorio(dados, PARAMETROS_PADRAO, new Date(2026, 10, 11, 10, 0));
    expect(r.subtitulo).toMatch(/^Fazenda Pedra \/ Confinamento · coletas de 06\/11\/2026 a 10\/11\/2026 · emitido em/);
    // 2. amostras: ordem por talhão e data; a coleta sem MS aparece "a aferir"
    expect(r.amostras.linhas[0]).toEqual(['TL 18', 'Miyagi', '07/11/2026', '1', '2,02', '20,2', '22', '4,4']);
    expect(r.amostras.linhas).toHaveLength(12);
    expect(r.amostras.linhas[r.amostras.linhas.length - 1]).toEqual(['TL 23', 'Mombaça', '10/11/2026', '2', '2,40', '24,0', 'a aferir', '—']);
    // 3. por talhão: última coleta; TL 23 de 10/11 ainda sem MS
    const t18 = r.talhoes.linhas.find((l) => l[0] === 'TL 18')!;
    expect(t18).toEqual(['TL 18', '118,0', '16,7', '33 %', '24', '3,9', '1.967', '465', '1.672', '2.786', 'MS baixa; CV alto']);
    const t21 = r.talhoes.linhas.find((l) => l[0] === 'TL 21')!;
    expect(t21.slice(0, 4)).toEqual(['TL 21', '73,0', '21,0', '61 %']);
    const t23 = r.talhoes.linhas.find((l) => l[0] === 'TL 23')!;
    expect(t23[2]).toBe('28,2');
    expect(t23[10]).toBe('MS a aferir');
    expect(r.talhoes.total[0]).toBe('Total');
    expect(r.talhoes.total[1]).toBe('240,9');
    expect(r.talhoes.notas).toEqual(['TL 21: Talhão desuniforme']);
    // 4 e 5
    expect(r.leitura.find((l) => l.startsWith('TL 18 — '))).toContain('16,7 t MV/ha em 6 pontos (CV 33 %, variação alta), MS média de 24 % (abaixo da faixa ideal), 3,9 t MS/ha e ~465 t de MS no talhão');
    expect(r.leitura.find((l) => l.startsWith('TL 23 — '))).toContain('MS ainda a aferir (coleta de 10/11/2026)');
    expect(r.leitura[r.leitura.length - 1]).toMatch(/^Todos os talhões com MS média entre 21 e 24 %, abaixo da faixa ideal/);
    expect(r.pendencias).toEqual([
      'Amostrar mais pontos em TL 21 (só 2 pontos), TL 23 (só 2 pontos): com menos de 3 pontos a estimativa não é confiável.',
      'Talhão desuniforme, estimativa com margem de erro: TL 18 (CV 33 % em 6 pontos).',
      'Aferir a MS no laboratório: TL 23 de 10/11/2026.',
      'Talhões ainda sem coleta: TL 20.',
    ]);
    expect(r.premissas[3]).toContain('15 % de perdas');
  });

  it('sem dados, não quebra', () => {
    const r = montarRelatorio({ talhoes: [], coletas: [], amostras: [] }, PARAMETROS_PADRAO);
    expect(r.amostras.linhas).toEqual([]);
    expect(r.talhoes.linhas).toEqual([]);
    expect(r.leitura).toEqual([]);
    expect(r.pendencias).toEqual(['Nenhuma pendência.']);
    expect(r.subtitulo).toMatch(/^coletas de sem coletas/);
  });
});

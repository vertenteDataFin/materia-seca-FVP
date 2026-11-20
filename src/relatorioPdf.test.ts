// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { PARAMETROS_PADRAO } from './calc';
import { descreverDatas, montarRelatorio } from './relatorioPdf';
import { montarPlanilhas } from './exportarExcel';
import type { Amostra, AmostraColheita, Dados } from './tipos';

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

describe('colheita nos relatórios (MS dos caminhões)', () => {
  const ac = (id: string, talhaoId: string, coletadaEm: string, seco: number | null, p: [number, number, number, number] | null = null): AmostraColheita => ({
    id, codigo: `X-${id}`, talhaoId, coletadaEm, placa: 'CPG0247', silo: 'Silo 1',
    peneira19G: p?.[0] ?? null, peneira8G: p?.[1] ?? null, peneira4G: p?.[2] ?? null, fundoG: p?.[3] ?? null,
    pesoUmidoG: seco == null ? null : 100, pesoSecoG: seco,
  });
  const comColheita: Dados = {
    ...dados,
    veiculos: [],
    amostrasColheita: [ac('a', 't18', '2026-11-14T08:00', 30, [20, 100, 60, 20]), ac('b', 't18', '2026-11-14T10:00', 34, [10, 110, 60, 20]), ac('c', 't21', '2026-11-14T09:00', null)],
    cargas: [
      { id: 'k1', talhaoId: 't18', saidaEm: '2026-11-14T07:30', placa: 'CPG0247', romaneio: '101', pesoBrutoKg: 40000, taraKg: 15000 }, // 25 t
      { id: 'k2', talhaoId: 't18', saidaEm: '2026-11-15T07:30', placa: 'CPG0247', romaneio: '102', pesoBrutoKg: 45000, taraKg: 15000 }, // 30 t
    ],
  };

  it('sem colheita, o PDF não tem a seção e o Excel não ganha abas', () => {
    expect(montarRelatorio(dados, PARAMETROS_PADRAO).colheita).toBeNull();
    expect(montarPlanilhas(dados, PARAMETROS_PADRAO).map((p) => p.nome)).toEqual(['Talhões', 'Coletas', 'Amostras', 'Parâmetros']);
  });

  it('PDF: por talhão, MS e Penn State dos caminhões, cargas e MS entregue', () => {
    const c = montarRelatorio(comColheita, PARAMETROS_PADRAO).colheita!;
    // TL 18 - PD: 2 amostras (32%); 55 t entregues × 32% = 17,6 t MS · TL 21 - Conf: só amostra sem MS
    expect(c.linhas).toEqual([
      ['TL 18 - PD', '2', '32,0', '8 · 53 · 30 · 10', '2', '55,0', '17,6', expect.any(String), expect.stringMatching(/%$/)],
      ['TL 21 - Conf', '1', '—', '—', '0', '—', '—', '—', '—'],
    ]);
    expect(c.total.slice(0, 3)).toEqual(['Total', '3', '32,0']);
  });

  it('Excel: abas de amostras de colheita, cargas e colheita por talhão', () => {
    const pl = montarPlanilhas(comColheita, PARAMETROS_PADRAO);
    expect(pl.map((p) => p.nome)).toEqual(['Talhões', 'Coletas', 'Amostras', 'Amostras de colheita', 'Cargas', 'Colheita por talhão', 'Parâmetros']);
    const amostrasCol = pl.find((p) => p.nome === 'Amostras de colheita')!;
    expect(amostrasCol.linhas[0].slice(0, 3)).toEqual(['X-a', new Date(2026, 10, 14, 8, 0), 'TL 18 - PD']);
    expect(amostrasCol.linhas[0][11]).toBeCloseTo(10); // 20 g de 200 g na peneira de 19 mm
    const cargasPl = pl.find((p) => p.nome === 'Cargas')!;
    expect(cargasPl.linhas.map((l) => [l[0], l[8]])).toEqual([['101', 25000], ['102', 30000]]);
    const porTalhao = pl.find((p) => p.nome === 'Colheita por talhão')!;
    expect(porTalhao.linhas[0][2]).toBeCloseTo(32);
    expect(porTalhao.linhas[0][9]).toBeCloseTo(17.6);
  });
});

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
    // 2. amostras: ordem por data da coleta (no mesmo dia, por talhão); a coleta sem MS aparece "a aferir"
    expect(r.amostras.linhas).toHaveLength(12);
    const iso = (d: string) => d.split('/').reverse().join('-');
    const datas = r.amostras.linhas.map((l) => iso(l[2]));
    expect(datas).toEqual([...datas].sort());
    expect(r.amostras.linhas).toContainEqual(['TL 18 - PD', 'Miyagi', '07/11/2026', '1', '2,02', '20,2', '22', '4,4']);
    expect(r.amostras.linhas[r.amostras.linhas.length - 1]).toEqual(['TL 23 - Conf', 'Mombaça', '10/11/2026', '2', '2,40', '24,0', 'a aferir', '—']);
    // 3. por talhão: última coleta; TL 23 - Conf de 10/11 ainda sem MS
    const t18 = r.talhoes.linhas.find((l) => l[0] === 'TL 18 - PD')!;
    expect(t18).toEqual(['TL 18 - PD', '118,0', '16,7', '33 %', '24', '3,9', '1.967', '465', '1.672', '2.786', 'MS baixa; CV alto']);
    const t21 = r.talhoes.linhas.find((l) => l[0] === 'TL 21 - Conf')!;
    expect(t21.slice(0, 4)).toEqual(['TL 21 - Conf', '73,0', '21,0', '61 %']);
    const t23 = r.talhoes.linhas.find((l) => l[0] === 'TL 23 - Conf')!;
    expect(t23[2]).toBe('28,2');
    expect(t23[10]).toBe('MS a aferir');
    expect(r.talhoes.total[0]).toBe('Total');
    expect(r.talhoes.total[1]).toBe('240,9');
    expect(r.talhoes.notas).toEqual(['TL 21 - Conf: Talhão desuniforme']);
    // 4 e 5
    expect(r.leitura.find((l) => l.startsWith('TL 18 - PD — '))).toContain('16,7 t MV/ha em 6 pontos (CV 33 %, variação alta), MS média de 24 % (abaixo da faixa ideal), 3,9 t MS/ha e ~465 t de MS no talhão');
    expect(r.leitura.find((l) => l.startsWith('TL 23 - Conf — '))).toContain('MS ainda a aferir (coleta de 10/11/2026)');
    expect(r.leitura[r.leitura.length - 1]).toMatch(/^Todos os talhões com MS média entre 21 e 24 %, abaixo da faixa ideal/);
    expect(r.pendencias).toEqual([
      'Amostrar mais pontos em TL 21 - Conf (só 2 pontos), TL 23 - Conf (só 2 pontos): com menos de 3 pontos a estimativa não é confiável.',
      'Talhão desuniforme, estimativa com margem de erro: TL 18 - PD (CV 33 % em 6 pontos).',
      'Aferir a MS no laboratório: TL 23 - Conf de 10/11/2026.',
      'Talhões ainda sem coleta: TL 20 - Conf.',
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

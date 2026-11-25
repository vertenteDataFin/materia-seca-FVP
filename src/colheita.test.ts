import { describe, expect, it } from 'vitest';
import { amostrasPorColeta } from './dados';
import {
  andamentoTalhao,
  camposAreaInformada,
  cargaPesada,
  liquidoKg,
  msColheitaPorTalhao,
  msDaCarga,
  referenciaDoTalhao,
  resumoColheita,
  sugestoes,
  tarasPorPlaca,
} from './colheita';
import type { Amostra, AmostraColheita, Carga, Coleta, Talhao } from './tipos';

const talhao: Talhao = { id: 't1', nome: 'Talhão 18 - PD', areaHa: 100, capim: 'Miyagi' };
// 2 pontos: 3 e 5 kg/m² → 40 t MV/ha; MS 25% → 10 t MS/ha
const coletas: Coleta[] = [
  { id: 'velha', talhaoId: 't1', data: '2026-10-01', responsavel: '', areaAmostralM2: 1 },
  { id: 'c1', talhaoId: 't1', data: '2026-11-07', responsavel: '', areaAmostralM2: 1 },
  { id: 'semms', talhaoId: 't1', data: '2026-11-10', responsavel: '', areaAmostralM2: 1 },
];
const amostras: Amostra[] = [
  { id: 'v1', coletaId: 'velha', ponto: 1, pesoVerdeKg: 1, pesoUmidoG: 100, pesoSecoG: 20 },
  { id: 'a1', coletaId: 'c1', ponto: 1, pesoVerdeKg: 3, pesoUmidoG: 100, pesoSecoG: 25 },
  { id: 'a2', coletaId: 'c1', ponto: 2, pesoVerdeKg: 5, pesoUmidoG: 100, pesoSecoG: 25 },
  { id: 's1', coletaId: 'semms', ponto: 1, pesoVerdeKg: 6, pesoUmidoG: null, pesoSecoG: null },
];
const carga = (id: string, saidaEm: string, bruto: number | null, tara: number | null, extra: Partial<Carga> = {}): Carga => ({
  id, talhaoId: 't1', saidaEm, pesoBrutoKg: bruto, taraKg: tara, ...extra,
});

describe('colheita', () => {
  it('tara é do caminhão: a da pesagem mais recente da placa, sem ligar para hífen ou caixa', () => {
    const taras = tarasPorPlaca([
      carga('a', '2026-11-14T07:00', 40000, 15000, { placa: 'abc-1d23', pesadoEm: '2026-11-14T10:00:00Z' }),
      carga('b', '2026-11-15T07:00', 41000, 15200, { placa: 'ABC1D23', pesadoEm: '2026-11-15T10:00:00Z' }),
      carga('c', '2026-11-15T08:00', null, null, { placa: 'XYZ9K88' }),
    ]);
    expect(taras.get('ABC1D23')).toBe(15200);
    expect(taras.has('XYZ9K88')).toBe(false);
  });

  it('peso líquido só com bruto e tara válidos', () => {
    expect(liquidoKg({ pesoBrutoKg: 40000, taraKg: 15000 })).toBe(25000);
    expect(liquidoKg({ pesoBrutoKg: 40000, taraKg: null })).toBeNull();
    expect(liquidoKg({ pesoBrutoKg: 10000, taraKg: 15000 })).toBeNull();
    expect(cargaPesada({ pesoBrutoKg: null, taraKg: null })).toBe(false);
  });

  it('referência: última amostragem com MS (a mais nova sem MS fica de lado)', () => {
    const ref = referenciaDoTalhao('t1', coletas, amostrasPorColeta(amostras))!;
    expect(ref.coletaId).toBe('c1');
    expect(ref.tMVha).toBeCloseTo(40);
    expect(ref.msPct).toBeCloseTo(25);
    expect(ref.tMSha).toBeCloseTo(10);
  });

  it('área colhida pela MS, ritmo, previsão e cargas pendentes', () => {
    const ref = referenciaDoTalhao('t1', coletas, amostrasPorColeta(amostras));
    const cargas = [
      carga('k1', '2026-11-14T07:00', 40000, 15000), // 25 t
      carga('k2', '2026-11-14T09:00', 39000, 14000), // 25 t
      carga('k3', '2026-11-15T07:00', 45000, 15000), // 30 t
      carga('k4', '2026-11-15T10:00', null, null), // aguardando pesagem
      { ...carga('outro', '2026-11-15T10:00', 40000, 10000), talhaoId: 't2' },
    ];
    const a = andamentoTalhao(talhao, cargas, ref);
    expect(a.pesadas).toBe(3);
    expect(a.pendentes).toBe(1);
    expect(a.tMV).toBeCloseTo(80);
    expect(a.tMS).toBeCloseTo(20); // 80 t × 25%
    expect(a.areaColhidaHa).toBeCloseTo(2); // 20 t MS ÷ 10 t MS/ha
    expect(a.pctColhida).toBeCloseTo(2);
    expect(a.diasAtivos).toBe(2);
    expect(a.ritmoTdia).toBeCloseTo(40);
    expect(a.diasRestantes).toBeCloseTo(98); // 1 ha/dia, faltam 98 ha
    expect(a.inicio).toBe('2026-11-14T07:00');
  });

  it('MS da carga (emurchecida) corrige a área colhida', () => {
    const ref = referenciaDoTalhao('t1', coletas, amostrasPorColeta(amostras));
    // 20 t de capim emurchecido a 50% MS = 10 t MS = 1 ha (pela MV daria só 0,5 ha)
    const a = andamentoTalhao(talhao, [carga('k1', '2026-11-14T07:00', 35000, 15000, { msPct: 50 })], ref);
    expect(a.tMS).toBeCloseTo(10);
    expect(a.areaColhidaHa).toBeCloseTo(1);
  });

  it('MS da produção vem dos caminhões: do mesmo dia, senão média do talhão; a de campo só na falta deles', () => {
    const ref = referenciaDoTalhao('t1', coletas, amostrasPorColeta(amostras)); // campo: 25% MS, 10 t MS/ha
    const ac = (id: string, coletadaEm: string, seco: number | null, talhaoId = 't1'): AmostraColheita => ({
      id, talhaoId, coletadaEm, placa: 'CPG0247', silo: 'Silo 1',
      peneira19G: null, peneira8G: null, peneira4G: null, fundoG: null, pesoUmidoG: seco == null ? null : 100, pesoSecoG: seco,
    });
    const msCol = msColheitaPorTalhao([
      ac('a', '2026-11-14T08:00', 30), ac('b', '2026-11-14T10:00', 34), // dia 14: média 32%
      ac('c', '2026-11-15T08:00', 38), // dia 15: 38%
      ac('d', '2026-11-15T09:00', null), // sem seco: não conta
      ac('e', '2026-11-14T08:00', 50, 't2'), // outro talhão
    ]).get('t1')!;
    expect(msCol.n).toBe(3);
    expect(msCol.media).toBeCloseTo(34);
    expect(msDaCarga({ saidaEm: '2026-11-14T07:00' }, msCol, ref)).toBeCloseTo(32);
    expect(msDaCarga({ saidaEm: '2026-11-16T07:00' }, msCol, ref)).toBeCloseTo(34); // dia sem caminhão amostrado
    expect(msDaCarga({ saidaEm: '2026-11-16T07:00' }, null, ref)).toBeCloseTo(25); // sem amostragem de colheita
    expect(msDaCarga({ saidaEm: '2026-11-14T07:00', msPct: 40 }, msCol, ref)).toBe(40); // informada na carga
    // 25 t no dia 14 (32%) + 30 t no dia 15 (38%) = 8 + 11,4 = 19,4 t MS; área = 19,4 ÷ 10 t MS/ha (campo)
    const a = andamentoTalhao(talhao, [carga('k1', '2026-11-14T07:00', 40000, 15000), carga('k2', '2026-11-15T07:00', 45000, 15000)], ref, msCol);
    expect(a.tMS).toBeCloseTo(19.4);
    expect(a.areaColhidaHa).toBeCloseTo(1.94);
    expect(a.tMVcomMSdoDia).toBeCloseTo(55);
    // dia 16 sem análise: entra com a média do talhão e não conta como "análise do dia"
    const b = andamentoTalhao(talhao, [carga('k1', '2026-11-14T07:00', 40000, 15000), carga('k3', '2026-11-16T07:00', 35000, 15000)], ref, msCol);
    expect(b.tMS).toBeCloseTo(25 * 0.32 + 20 * 0.34);
    expect(b.tMVcomMSdoDia).toBeCloseTo(25);
  });

  it('resumo: MS da colheita ponderada pelo peso; sem cargas, média das amostras de caminhão', () => {
    const ac = (id: string, seco: number): AmostraColheita => ({
      id, talhaoId: 't1', coletadaEm: '2026-11-14T08:00', placa: 'X', silo: 'S',
      peneira19G: null, peneira8G: null, peneira4G: null, fundoG: null, pesoUmidoG: 100, pesoSecoG: seco,
    });
    const porColeta = amostrasPorColeta(amostras);
    const semCargas = resumoColheita([talhao], [], coletas, porColeta, [ac('a', 30), ac('b', 36)]);
    expect(semCargas.msColheitaPct).toBeCloseTo(33);
    expect(semCargas.nAmostrasColheita).toBe(2);
    const comCargas = resumoColheita([talhao], [carga('k1', '2026-11-14T07:00', 40000, 15000)], coletas, porColeta, [ac('a', 30), ac('b', 36)]);
    expect(comCargas.tMS).toBeCloseTo(25 * 0.33);
    expect(comCargas.msColheitaPct).toBeCloseTo(33);
    expect(resumoColheita([talhao], [carga('k1', '2026-11-14T07:00', 40000, 15000)], coletas, porColeta, []).msColheitaPct).toBeNull();
  });

  it('sem amostragem não estima área; finalizada não prevê término', () => {
    expect(andamentoTalhao(talhao, [carga('k1', '2026-11-14T07:00', 40000, 15000)], null).areaColhidaHa).toBeNull();
    const ref = referenciaDoTalhao('t1', coletas, amostrasPorColeta(amostras));
    const fim = andamentoTalhao({ ...talhao, colheitaFinalizadaEm: '2026-11-20' }, [carga('k1', '2026-11-14T07:00', 40000, 15000)], ref);
    expect(fim.finalizada).toBe(true);
    expect(fim.diasRestantes).toBeNull();
    expect(fim.tMVhaReal).toBeCloseTo(0.25);
  });

  it('área colhida informada pelo agrícola: produtividade real, nova estimativa e teto da amostragem', () => {
    const ref = referenciaDoTalhao('t1', coletas, amostrasPorColeta(amostras)); // 40 t MV/ha
    const cargas = [
      carga('k1', '2026-11-14T07:00', 40000, 15000), // 25 t
      carga('k2', '2026-11-15T07:00', 40000, 15000), // 25 t (até 15/11: 50 t)
      carga('k3', '2026-11-16T07:00', 35000, 15000), // 20 t depois da data informada
    ];
    const semInfo = andamentoTalhao(talhao, cargas, ref);
    expect(semInfo.fonteArea).toBe('amostragem');
    expect(semInfo.producaoAmostragemT).toBeCloseTo(4000); // 40 t/ha × 100 ha
    expect(semInfo.producaoEstimadaT).toBeNull();

    const a = andamentoTalhao({ ...talhao, areaColhidaInformada: { ha: 2.5, data: '2026-11-15' } }, cargas, ref);
    expect(a.fonteArea).toBe('informada');
    expect(a.tMVateInformada).toBeCloseTo(50);
    expect(a.tMVhaColhido).toBeCloseTo(20); // 50 t ÷ 2,5 ha
    expect(a.areaColhidaHa).toBeCloseTo(3.5); // 2,5 ha + 20 t ÷ 20 t/ha
    expect(a.pctColhida).toBeCloseTo(3.5);
    expect(a.producaoEstimadaT).toBeCloseTo(2000); // 20 t/ha × 100 ha
    expect(a.producaoAmostragemT).toBeCloseTo(4000);

    // sem amostragem também funciona com a área informada
    const semRef = andamentoTalhao({ ...talhao, areaColhidaInformada: { ha: 2.5, data: '2026-11-15' } }, cargas, null);
    expect(semRef.areaColhidaHa).toBeCloseTo(3.5);
    expect(semRef.producaoAmostragemT).toBeNull();
  });

  it('histórico das áreas informadas: inclui, substitui a mesma data, remove; produtividade por período', () => {
    const ref = referenciaDoTalhao('t1', coletas, amostrasPorColeta(amostras));
    const cargas = [
      carga('k1', '2026-11-14T07:00', 40000, 15000), // 25 t
      carga('k2', '2026-11-15T07:00', 40000, 15000), // 25 t
      carga('k3', '2026-11-16T07:00', 35000, 15000), // 20 t
    ];
    // registro antigo (só a área atual, sem histórico) entra no histórico
    let t: Talhao = { ...talhao, areaColhidaInformada: { ha: 1, data: '2026-11-14' } };
    t = { ...t, ...camposAreaInformada(t, { incluir: { ha: 2, data: '2026-11-16' } }) };
    t = { ...t, ...camposAreaInformada(t, { incluir: { ha: 3, data: '2026-11-16' } }) }; // mesma data: substitui
    expect(t.historicoAreaColhida!.map((a) => a.ha)).toEqual([1, 3]);
    expect(t.areaColhidaInformada!.ha).toBe(3);

    const a = andamentoTalhao(t, cargas, ref);
    expect(a.historicoArea).toHaveLength(2);
    expect(a.historicoArea[0].tMVha).toBeCloseTo(25); // 25 t ÷ 1 ha
    expect(a.historicoArea[1].tMVha).toBeCloseTo(70 / 3);
    expect(a.historicoArea[1].haPeriodo).toBeCloseTo(2);
    expect(a.historicoArea[1].tMVhaPeriodo).toBeCloseTo(22.5); // 45 t ÷ 2 ha
    expect(a.areaColhidaHa).toBeCloseTo(3); // usa a mais recente

    // informação de data anterior à mais recente não vira a atual
    const t2 = { ...t, ...camposAreaInformada(t, { incluir: { ha: 2, data: '2026-11-15' } }) };
    expect(t2.areaColhidaInformada!.data).toBe('2026-11-16');
    const t3 = { ...t2, ...camposAreaInformada(t2, { remover: '2026-11-16' }) };
    expect(t3.areaColhidaInformada).toEqual({ ha: 2, data: '2026-11-15' });
    expect(camposAreaInformada({}, { remover: 'x' }).areaColhidaInformada).toBeNull();
  });

  it('sugere placas pelo uso', () => {
    expect(sugestoes([carga('a', 'x', null, null, { placa: 'ABC' }), carga('b', 'x', null, null, { placa: 'XYZ' }), carga('c', 'x', null, null, { placa: 'XYZ' })], 'placa')).toEqual(['XYZ', 'ABC']);
  });
});

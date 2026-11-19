import { resumoColeta, teorMS } from './calc';
import { amostrasPorColeta } from './dados';
import { compararNomes, type Amostra, type AmostraColheita, type Carga, type Coleta, type Talhao } from './tipos';

/**
 * Um ponto da evolução. Campo: uma coleta, com a MS média (null enquanto o laboratório não mediu).
 * Colheita: as amostras de caminhão do talhão num dia, com a MS média (só as que já têm MS).
 */
export interface PontoMS {
  /** Chave única do ponto (id da coleta; na colheita, "colheita:<talhão>:<dia>"). */
  coletaId: string;
  data: string; // AAAA-MM-DD
  msPct: number | null;
  nPontos: number;
  nPontosMS: number;
  origem: 'campo' | 'colheita';
  /** Para onde o toque no ponto leva. */
  link: string;
}

export interface SerieMS {
  talhao: Talhao;
  pontos: PontoMS[]; // em ordem de data
  /** Dia da primeira carga ou amostra de caminhão do talhão (AAAA-MM-DD); null se a colheita não começou. */
  inicioColheita: string | null;
}

/**
 * Uma série por talhão com coleta de campo ou amostra de caminhão com MS, em ordem natural de nome.
 * Coletas sem MS entram como "a aferir"; amostras de caminhão sem MS ficam de fora.
 */
export function seriesMS(
  talhoes: Talhao[],
  coletas: Coleta[],
  amostras: Amostra[],
  colheita: { amostrasColheita?: AmostraColheita[]; cargas?: Carga[] } = {},
): SerieMS[] {
  const porColeta = amostrasPorColeta(amostras);
  const porTalhao = new Map<string, PontoMS[]>();
  const add = (talhaoId: string, p: PontoMS) => porTalhao.set(talhaoId, [...(porTalhao.get(talhaoId) ?? []), p]);
  for (const c of coletas) {
    const r = resumoColeta(c, porColeta.get(c.id) ?? []);
    add(c.talhaoId, { coletaId: c.id, data: c.data, msPct: r.msPct, nPontos: r.nPontos, nPontosMS: r.nPontosMS, origem: 'campo', link: `/coletas/${c.id}` });
  }

  // Amostras de caminhão: um ponto por talhão e dia (média das que já têm MS).
  const inicio = new Map<string, string>();
  const marcarInicio = (talhaoId: string, dia: string) => {
    const atual = inicio.get(talhaoId);
    if (!atual || dia < atual) inicio.set(talhaoId, dia);
  };
  const dias = new Map<string, { talhaoId: string; dia: string; s: number; n: number; total: number; primeiroId: string }>();
  for (const a of colheita.amostrasColheita ?? []) {
    const dia = a.coletadaEm.slice(0, 10);
    marcarInicio(a.talhaoId, dia);
    const chave = `${a.talhaoId}:${dia}`;
    const g = dias.get(chave) ?? { talhaoId: a.talhaoId, dia, s: 0, n: 0, total: 0, primeiroId: a.id };
    g.total++;
    const ms = teorMS(a);
    if (ms != null) {
      g.s += ms;
      g.n++;
    }
    dias.set(chave, g);
  }
  for (const c of colheita.cargas ?? []) marcarInicio(c.talhaoId, c.saidaEm.slice(0, 10));
  for (const g of dias.values()) {
    if (!g.n) continue;
    add(g.talhaoId, {
      coletaId: `colheita:${g.talhaoId}:${g.dia}`,
      data: g.dia,
      msPct: g.s / g.n,
      nPontos: g.total,
      nPontosMS: g.n,
      origem: 'colheita',
      link: `/coletas?colheita=${g.primeiroId}`,
    });
  }

  return [...talhoes]
    .sort((a, b) => compararNomes(a.nome, b.nome))
    .filter((t) => porTalhao.has(t.id))
    .map((t) => ({
      talhao: t,
      pontos: porTalhao.get(t.id)!.sort((a, b) => a.data.localeCompare(b.data) || a.origem.localeCompare(b.origem) || a.coletaId.localeCompare(b.coletaId)),
      inicioColheita: inicio.get(t.id) ?? null,
    }));
}

/** Dia (número de dias desde 1970) de uma data AAAA-MM-DD, para o eixo do tempo. */
export function diaDe(iso: string): number {
  return Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000);
}

/** Faixa do eixo do tempo comum a todas as séries (inclui o início da colheita), com folga; um único dia vira uma janela de ±3 dias. */
export function faixaDias(series: SerieMS[]): [number, number] {
  const dias = series.flatMap((s) => [...s.pontos.map((p) => diaDe(p.data)), ...(s.inicioColheita ? [diaDe(s.inicioColheita)] : [])]);
  if (!dias.length) return [0, 1];
  const min = Math.min(...dias);
  const max = Math.max(...dias);
  return min === max ? [min - 3, max + 3] : [min, max];
}

/** Faixa do eixo de MS (%): sempre inclui a faixa ideal e os dados, em múltiplos de 10. */
export function faixaMS(series: SerieMS[], msMin: number, msMax: number): [number, number] {
  const valores = series.flatMap((s) => s.pontos.map((p) => p.msPct)).filter((v): v is number => v != null);
  const lo = Math.min(msMin, ...valores);
  const hi = Math.max(msMax, ...valores);
  return [Math.max(0, Math.floor(lo / 10) * 10 - 10), Math.min(100, Math.ceil(hi / 10) * 10)];
}

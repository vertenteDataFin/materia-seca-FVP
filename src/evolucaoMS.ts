import { resumoColeta } from './calc';
import { amostrasPorColeta } from './dados';
import { compararNomes, type Amostra, type Coleta, type Talhao } from './tipos';

/** Um ponto da evolução: uma coleta, com a MS média (null enquanto o laboratório não mediu). */
export interface PontoMS {
  coletaId: string;
  data: string; // AAAA-MM-DD
  msPct: number | null;
  nPontos: number;
  nPontosMS: number;
}

export interface SerieMS {
  talhao: Talhao;
  pontos: PontoMS[]; // em ordem de data
}

/** Uma série por talhão com pelo menos uma coleta, em ordem natural de nome. Coletas sem MS entram como "a aferir". */
export function seriesMS(talhoes: Talhao[], coletas: Coleta[], amostras: Amostra[]): SerieMS[] {
  const porColeta = amostrasPorColeta(amostras);
  const porTalhao = new Map<string, PontoMS[]>();
  for (const c of coletas) {
    const r = resumoColeta(c, porColeta.get(c.id) ?? []);
    const lista = porTalhao.get(c.talhaoId) ?? [];
    lista.push({ coletaId: c.id, data: c.data, msPct: r.msPct, nPontos: r.nPontos, nPontosMS: r.nPontosMS });
    porTalhao.set(c.talhaoId, lista);
  }
  return [...talhoes]
    .sort((a, b) => compararNomes(a.nome, b.nome))
    .filter((t) => porTalhao.has(t.id))
    .map((t) => ({
      talhao: t,
      pontos: porTalhao.get(t.id)!.sort((a, b) => a.data.localeCompare(b.data) || a.coletaId.localeCompare(b.coletaId)),
    }));
}

/** Dia (número de dias desde 1970) de uma data AAAA-MM-DD, para o eixo do tempo. */
export function diaDe(iso: string): number {
  return Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000);
}

/** Faixa do eixo do tempo comum a todas as séries, com folga; um único dia vira uma janela de ±3 dias. */
export function faixaDias(series: SerieMS[]): [number, number] {
  const dias = series.flatMap((s) => s.pontos.map((p) => diaDe(p.data)));
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

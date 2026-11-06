import type { Amostra, Coleta } from './db';

export interface Parametros {
  /** Perdas estimadas no processo (colheita, fermentação, desabastecimento), em %. */
  perdasPct: number;
  /** Densidade da silagem compactada, em kg de massa verde por m³. */
  densidadeKgM3: number;
  /** Faixa de MS considerada ideal para ensilar (%). */
  msMin: number;
  msMax: number;
}

export const PARAMETROS_PADRAO: Parametros = {
  perdasPct: 15,
  densidadeKgM3: 600,
  msMin: 28,
  msMax: 35,
};

/** Teor de matéria seca (%) de uma subamostra; null se os dados forem inválidos/incompletos. */
export function teorMS(a: Pick<Amostra, 'pesoUmidoG' | 'pesoSecoG'>): number | null {
  const u = a.pesoUmidoG;
  const s = a.pesoSecoG;
  if (u == null || s == null || u <= 0 || s < 0 || s > u) return null;
  return (s / u) * 100;
}

/** Teor de umidade (%) = 100 − MS. */
export function teorUmidade(a: Pick<Amostra, 'pesoUmidoG' | 'pesoSecoG'>): number | null {
  const ms = teorMS(a);
  return ms == null ? null : 100 - ms;
}

/** Produção de massa verde do ponto em kg/m². */
export function producaoPonto(a: Pick<Amostra, 'pesoVerdeKg'>, areaAmostralM2: number): number | null {
  if (a.pesoVerdeKg == null || a.pesoVerdeKg < 0 || !(areaAmostralM2 > 0)) return null;
  return a.pesoVerdeKg / areaAmostralM2;
}

export function media(xs: number[]): number | null {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
}

/** Desvio padrão amostral (n − 1). */
export function desvioPadrao(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = media(xs)!;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

export interface ResumoColeta {
  nPontos: number;
  nPontosMS: number;
  /** Massa verde média, kg/m². */
  mvKgM2: number | null;
  desvioKgM2: number | null;
  /** Coeficiente de variação da produção entre pontos, %. */
  cvPct: number | null;
  /** Massa verde, t/ha. */
  tMVha: number | null;
  msPct: number | null;
  umidadePct: number | null;
  /** Matéria seca, t/ha. */
  tMSha: number | null;
}

export function resumoColeta(coleta: Pick<Coleta, 'areaAmostralM2'>, amostras: Amostra[]): ResumoColeta {
  const prod = amostras
    .map((a) => producaoPonto(a, coleta.areaAmostralM2))
    .filter((x): x is number => x != null);
  const ms = amostras.map(teorMS).filter((x): x is number => x != null);

  const mvKgM2 = media(prod);
  const desvioKgM2 = desvioPadrao(prod);
  const msPct = media(ms);
  // kg/m² × 10.000 m²/ha ÷ 1.000 kg/t = kg/m² × 10
  const tMVha = mvKgM2 == null ? null : mvKgM2 * 10;
  const tMSha = tMVha == null || msPct == null ? null : (tMVha * msPct) / 100;

  return {
    nPontos: prod.length,
    nPontosMS: ms.length,
    mvKgM2,
    desvioKgM2,
    cvPct: mvKgM2 && desvioKgM2 != null ? (desvioKgM2 / mvKgM2) * 100 : null,
    tMVha,
    msPct,
    umidadePct: msPct == null ? null : 100 - msPct,
    tMSha,
  };
}

export interface EstimativaTalhao {
  /** Massa verde total no talhão, t. */
  tMVtotal: number | null;
  /** Matéria seca total no talhão, t. */
  tMStotal: number | null;
  /** Silagem estimada (massa verde descontadas as perdas), t. */
  silagemT: number | null;
  /** Volume de silo necessário, m³. */
  volumeM3: number | null;
}

export function estimativaTalhao(areaHa: number, r: ResumoColeta, p: Parametros): EstimativaTalhao {
  // Área ainda não informada: não há como estimar o total.
  if (!(areaHa > 0)) return { tMVtotal: null, tMStotal: null, silagemT: null, volumeM3: null };
  const tMVtotal = r.tMVha == null ? null : r.tMVha * areaHa;
  const tMStotal = r.tMSha == null ? null : r.tMSha * areaHa;
  const silagemT = tMVtotal == null ? null : tMVtotal * (1 - p.perdasPct / 100);
  const volumeM3 = silagemT == null || !(p.densidadeKgM3 > 0) ? null : (silagemT * 1000) / p.densidadeKgM3;
  return { tMVtotal, tMStotal, silagemT, volumeM3 };
}

export type StatusMS = 'baixo' | 'ideal' | 'alto';

export function statusMS(msPct: number | null, p: Parametros): StatusMS | null {
  if (msPct == null) return null;
  if (msPct < p.msMin) return 'baixo';
  if (msPct > p.msMax) return 'alto';
  return 'ideal';
}

export const ROTULO_STATUS: Record<StatusMS, string> = {
  baixo: 'MS baixa — aguardar/emurchecer',
  ideal: 'Ponto de ensilagem',
  alto: 'MS alta — risco de má compactação',
};

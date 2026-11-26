import { teorMS } from './calc';
import type { AmostraMilho } from './tipos';

/** Peneiras da granulometria do milho reidratado, da mais grossa para o fundo. */
export const PENEIRAS_MILHO = [
  { campo: 'peneira6G', rotulo: '6 mm', curto: '6' },
  { campo: 'peneira325G', rotulo: '3,25 mm', curto: '3,25' },
  { campo: 'peneira2G', rotulo: '2 mm', curto: '2' },
  { campo: 'peneira125G', rotulo: '1,25 mm', curto: '1,25' },
  { campo: 'fundoG', rotulo: 'Fundo', curto: 'F' },
] as const;

export type CampoPeneiraMilho = (typeof PENEIRAS_MILHO)[number]['campo'];

/**
 * Metas da fazenda (26/11/2026), em % retida: 6 mm = 0% · 3,25 + 2 mm ≥ 75% · 1,25 mm + fundo ≤ 25%.
 * Cada meta soma as peneiras indicadas (índices em PENEIRAS_MILHO).
 */
export const METAS_MILHO = [
  { chave: 'p6', rotulo: '6 mm', peneiras: [0], min: null, max: 0, texto: '0%' },
  { chave: 'medio', rotulo: '3,25 + 2 mm', peneiras: [1, 2], min: 75, max: null, texto: '≥ 75%' },
  { chave: 'fino', rotulo: '1,25 mm + fundo', peneiras: [3, 4], min: null, max: 25, texto: '≤ 25%' },
] as const;

export type MetaMilho = (typeof METAS_MILHO)[number];

export interface GranulometriaMilho {
  totalG: number;
  /** % retida em cada peneira, na ordem de PENEIRAS_MILHO. */
  pct: number[];
  /** % de cada meta (soma das peneiras) e se está dentro, na ordem de METAS_MILHO. */
  metas: { meta: MetaMilho; pct: number; ok: boolean }[];
}

/** Dentro da meta? (0% aceita o arredondamento: abaixo de 0,05%.) */
export function dentroMetaMilho(m: MetaMilho, pct: number): boolean {
  const tol = m.max === 0 ? 0.05 : 1e-9;
  return (m.min == null || pct >= m.min - 1e-9) && (m.max == null || (m.max === 0 ? pct < tol : pct <= m.max + tol));
}

/** % por peneira e por meta; null enquanto faltar algum peso ou o total for zero. */
export function granulometriaMilho(a: Pick<AmostraMilho, CampoPeneiraMilho>): GranulometriaMilho | null {
  const pesos = PENEIRAS_MILHO.map((p) => a[p.campo]);
  if (pesos.some((g) => g == null || g < 0)) return null;
  const totalG = (pesos as number[]).reduce((s, g) => s + g, 0);
  if (totalG <= 0) return null;
  const pct = (pesos as number[]).map((g) => (g / totalG) * 100);
  const metas = METAS_MILHO.map((meta) => {
    const p = (meta.peneiras as readonly number[]).reduce((s, i) => s + pct[i], 0);
    return { meta, pct: p, ok: dentroMetaMilho(meta, p) };
  });
  return { totalG, pct, metas };
}

/** Peso úmido padrão da aferição de MS do milho reidratado (g). */
export const UMIDO_PADRAO_MILHO_G = 200;

/** Campos a gravar ao lançar o peso seco: sem úmido ainda, usa o padrão de 200 g. */
export function lancarSecoMilho(a: Pick<AmostraMilho, 'pesoUmidoG'>, secoG: number | null): Partial<Pick<AmostraMilho, 'pesoUmidoG' | 'pesoSecoG'>> {
  return secoG != null && a.pesoUmidoG == null ? { pesoSecoG: secoG, pesoUmidoG: UMIDO_PADRAO_MILHO_G } : { pesoSecoG: secoG };
}

/** MS (%) da amostra: seco ÷ úmido. */
export function msMilho(a: Pick<AmostraMilho, 'pesoUmidoG' | 'pesoSecoG'>): number | null {
  return teorMS(a);
}

/** Próximo código do dia: "MR-2611-1", "MR-2611-2"… (segue o maior já usado). */
export function proximoCodigoMilho(coletadaEm: string, existentes: Pick<AmostraMilho, 'codigo'>[]): string {
  const [, m, d] = coletadaEm.slice(0, 10).split('-');
  const prefixo = `MR-${d ?? '??'}${m ?? '??'}-`;
  const maior = existentes.reduce((mx, a) => {
    if (!a.codigo?.startsWith(prefixo)) return mx;
    const n = Number(a.codigo.slice(prefixo.length));
    return Number.isInteger(n) && n > mx ? n : mx;
  }, 0);
  return `${prefixo}${maior + 1}`;
}

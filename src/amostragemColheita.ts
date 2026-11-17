import { teorMS } from './calc';
import type { AmostraColheita } from './tipos';

/** Peneiras do Penn State (4 peneiras), da mais grossa para o fundo. */
export const PENEIRAS = [
  { campo: 'peneira19G', rotulo: '19 mm', curto: '19' },
  { campo: 'peneira8G', rotulo: '8 mm', curto: '8' },
  { campo: 'peneira4G', rotulo: '4 mm', curto: '4' },
  { campo: 'fundoG', rotulo: 'Fundo', curto: 'F' },
] as const;

export type CampoPeneira = (typeof PENEIRAS)[number]['campo'];

export interface PennState {
  /** Peso total da amostra nas 4 peneiras (g). */
  totalG: number;
  /** % retida em cada peneira, na ordem de PENEIRAS. */
  pct: [number, number, number, number];
}

/** % retida em cada peneira; null enquanto faltar algum peso ou o total for zero. */
export function pennState(a: Pick<AmostraColheita, CampoPeneira>): PennState | null {
  const pesos = PENEIRAS.map((p) => a[p.campo]);
  if (pesos.some((g) => g == null || g < 0)) return null;
  const totalG = (pesos as number[]).reduce((s, g) => s + g, 0);
  if (totalG <= 0) return null;
  return { totalG, pct: (pesos as number[]).map((g) => (g / totalG) * 100) as PennState['pct'] };
}

/** MS (%) da amostra do caminhão (mesmo método do laboratório: seco ÷ úmido). */
export function msColheita(a: Pick<AmostraColheita, 'pesoUmidoG' | 'pesoSecoG'>): number | null {
  return teorMS(a);
}

/** Amostra ainda sem o peso seco: fica em "Aguardando MS". */
export function aguardandoMSColheita(a: Pick<AmostraColheita, 'pesoSecoG'>): boolean {
  return a.pesoSecoG == null;
}

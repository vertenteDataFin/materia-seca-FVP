import { teorMS } from './calc';
import { nomeCurto } from './MapaTalhoes';
import type { Amostra } from './tipos';

/** Código curto para etiquetar o saco da amostra em campo: "TL18-0711-P3". */
export function codigoAmostra(nomeTalhao: string, data: string, ponto: number): string {
  const tl = nomeCurto(nomeTalhao).replace(/\s+/g, '').toUpperCase();
  const [, m, d] = data.split('-');
  return `${tl}-${d ?? '??'}${m ?? '??'}-P${ponto}`;
}

/**
 * Situação de uma coleta no fluxo campo → laboratório.
 * - semPontos: nenhum ponto marcado
 * - campo: falta peso verde em algum ponto
 * - laboratorio: pesos verdes completos, falta MS (úmido/seco) em algum ponto
 * - completa: todos os pontos com MS
 */
export type StatusColeta = 'semPontos' | 'campo' | 'laboratorio' | 'completa';

export const ROTULO_STATUS_COLETA: Record<StatusColeta, string> = {
  semPontos: 'Sem pontos',
  campo: 'Em campo',
  laboratorio: 'Aguardando laboratório',
  completa: 'Completa',
};

export function statusColeta(amostras: Amostra[]): StatusColeta {
  if (!amostras.length) return 'semPontos';
  if (amostras.some((a) => a.pesoVerdeKg == null)) return 'campo';
  if (amostras.some((a) => teorMS(a) == null)) return 'laboratorio';
  return 'completa';
}

/** Amostra ainda sem MS válida (aguardando laboratório). */
export function pendenteLab(a: Amostra): boolean {
  return teorMS(a) == null;
}

/** Para onde o toque na coleta leva: etapa pendente em campo, laboratório (sem MS) ou o resultado. */
export function destinoColeta(id: string, status: StatusColeta): string {
  switch (status) {
    case 'semPontos': return `/coletas/${id}/pontos`;
    case 'campo': return `/coletas/${id}/pesos`;
    case 'laboratorio': return `/laboratorio?coleta=${id}`;
    default: return `/coletas/${id}`;
  }
}

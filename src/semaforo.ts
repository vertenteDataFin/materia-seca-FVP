import type { StatusMS } from './calc';

/**
 * Semáforo do talhão:
 * - verde: MS na faixa ideal → pronto para ensilar
 * - amarelo: sem coleta, ou coletado mas MS ainda não aferida
 * - vermelho: MS fora do ponto (baixa ou alta)
 */
export type Semaforo = 'verde' | 'amarelo' | 'vermelho';

export const COR_SEMAFORO: Record<Semaforo, string> = {
  verde: '#2e9e3f',
  amarelo: '#f2b705',
  vermelho: '#d64035',
};

export const ROTULO_SEMAFORO: Record<Semaforo, string> = {
  verde: 'Pronto para ensilar',
  amarelo: 'Sem coleta ou MS não aferida',
  vermelho: 'MS fora do ponto',
};

export function semaforoDe(status: StatusMS | null): Semaforo {
  if (status === 'ideal') return 'verde';
  if (status === 'baixo' || status === 'alto') return 'vermelho';
  return 'amarelo';
}

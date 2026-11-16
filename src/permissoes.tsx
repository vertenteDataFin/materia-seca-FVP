import { createContext, useContext } from 'react';
import type { Papel } from './membros';

export interface Permissoes {
  papel: Papel;
  /** Pode excluir coletas, pontos, cargas e talhões. */
  podeExcluir: boolean;
  /** Pode criar/editar talhões (cadastro) e restaurar backup. */
  podeEditarTalhoes: boolean;
  /** Pode lançar o peso da balança nas cargas da colheita (administrador e balanceiro). */
  podePesar: boolean;
  /** Pode incluir/remover pessoas. */
  admin: boolean;
}

export function permissoesDoPapel(papel: Papel): Permissoes {
  const gestor = papel === 'admin' || papel === 'membro';
  return {
    papel,
    podeExcluir: gestor,
    podeEditarTalhoes: gestor,
    podePesar: papel === 'admin' || papel === 'balanceiro',
    admin: papel === 'admin',
  };
}

/** Sem Firebase (modo local) todo mundo é administrador do próprio aparelho. */
export const PERMISSOES_LOCAL = permissoesDoPapel('admin');

export const PermissoesContext = createContext<Permissoes>(PERMISSOES_LOCAL);

export function usePermissoes(): Permissoes {
  return useContext(PermissoesContext);
}

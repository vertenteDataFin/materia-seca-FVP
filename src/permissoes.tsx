import { createContext, useContext } from 'react';
import type { Papel } from './membros';
import { ehExcluidorCargasPesadas, ehFinalizadorColheita, ehGestorVeiculos, ehImportadorBalanca } from './firebaseConfig';

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
  /** Pode cadastrar, editar e remover veículos da colheita (e-mails em GESTORES_VEICULOS). */
  podeCadastrarVeiculos: boolean;
  /** Pode importar o relatório da balança (e-mails em IMPORTADORES_BALANCA). */
  podeImportarBalanca: boolean;
  /** Pode finalizar e reabrir a colheita do talhão (e-mails em FINALIZADORES_COLHEITA). */
  podeFinalizarColheita: boolean;
  /** Pode excluir cargas já pesadas (e-mails em EXCLUIDORES_CARGAS_PESADAS). */
  podeExcluirCargasPesadas: boolean;
}

export function permissoesDoPapel(papel: Papel, email?: string | null): Permissoes {
  const gestor = papel === 'admin' || papel === 'membro';
  return {
    papel,
    podeExcluir: gestor,
    podeEditarTalhoes: gestor,
    podePesar: papel === 'admin' || papel === 'balanceiro',
    admin: papel === 'admin',
    podeCadastrarVeiculos: ehGestorVeiculos(email),
    // importar grava cargas já pesadas: além do e-mail, o papel precisa poder lançar peso (regras do Firestore)
    podeImportarBalanca: ehImportadorBalanca(email) && (papel === 'admin' || papel === 'balanceiro'),
    podeFinalizarColheita: ehFinalizadorColheita(email),
    // além do e-mail, o papel tem de poder excluir (regras do Firestore)
    podeExcluirCargasPesadas: ehExcluidorCargasPesadas(email) && gestor,
  };
}

/** Sem Firebase (modo local) todo mundo é administrador do próprio aparelho. */
export const PERMISSOES_LOCAL: Permissoes = {
  ...permissoesDoPapel('admin'),
  podeCadastrarVeiculos: true,
  podeImportarBalanca: true,
  podeFinalizarColheita: true,
  podeExcluirCargasPesadas: true,
};

export const PermissoesContext = createContext<Permissoes>(PERMISSOES_LOCAL);

export function usePermissoes(): Permissoes {
  return useContext(PermissoesContext);
}

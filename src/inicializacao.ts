import { importarColetasIniciais } from './coletasIniciais';
import { dadosAtuais, repositorio } from './dados';
import { importarTalhoesFazenda } from './importarFazenda';
import { migrarLegadoUmaVez } from './migracaoLegado';
import type { Permissoes } from './permissoes';

// Mude a versão para forçar uma nova sincronização com o KML embutido (edições do usuário são preservadas).
export const CHAVE_SEED = 'silagem-ms:talhoes-carregados-v7';
// Coletas já feitas em campo (fichas de 06, 07 e 10/11/2026) entram uma vez por aparelho; não duplicam.
export const CHAVE_COLETAS = 'silagem-ms:coletas-iniciais-v5';

/**
 * Depois que a fonte de dados confirmou o estado (servidor ou disco): migra o banco antigo do aparelho,
 * sincroniza os talhões do KML e lança as coletas da ficha. Tudo idempotente. Devolve mensagens para o usuário.
 * Operadores não gravam talhões, então para eles só a migração de coletas e a ficha rodam.
 */
export async function inicializarDados(p: Permissoes): Promise<string[]> {
  const msgs: string[] = [];
  await repositorio().aguardarPronto();

  try {
    const m = await migrarLegadoUmaVez({ permitirNovosTalhoes: p.podeEditarTalhoes });
    if (m && (m.talhoesNovos || m.coletasNovas)) {
      msgs.push(`Dados deste aparelho enviados: ${m.coletasNovas} coleta(s), ${m.amostras} amostra(s), ${m.talhoesNovos} talhão(ões) novo(s).`);
    }
    if (m?.coletasIgnoradas) msgs.push(`${m.coletasIgnoradas} coleta(s) de talhões não cadastrados ficaram de fora.`);
  } catch (e) {
    console.error('Falha ao migrar dados antigos', e);
  }

  if (p.podeEditarTalhoes && (localStorage.getItem(CHAVE_SEED) !== '1' || !dadosAtuais().talhoes.length)) {
    try {
      const r = await importarTalhoesFazenda();
      localStorage.setItem(CHAVE_SEED, '1');
      if (r.criados || r.removidos) {
        msgs.push(`Talhões sincronizados com o mapa da fazenda: ${r.criados} novo(s), ${r.removidos} removido(s), ${r.atualizados} atualizado(s).`);
      }
    } catch (e) {
      console.error('Falha ao carregar talhões iniciais', e);
    }
  }

  if (localStorage.getItem(CHAVE_COLETAS) !== '1' && dadosAtuais().talhoes.length) {
    try {
      importarColetasIniciais();
      localStorage.setItem(CHAVE_COLETAS, '1');
    } catch (e) {
      console.error('Falha ao carregar coletas iniciais', e);
    }
  }
  return msgs;
}

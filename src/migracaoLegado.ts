import { dadosAtuais, repositorio } from './dados';
import { chaveNome } from './kml';
import { lerLegado, type DadosLegados } from './legado';
import type { Operacao } from './repositorio';

export const CHAVE_MIGRADO = 'silagem-ms:legado-migrado-v1';

export interface ResultadoMigracao {
  talhoesNovos: number;
  talhoesReaproveitados: number;
  coletasNovas: number;
  coletasExistentes: number;
  /** Coletas de talhões que não puderam ser criados (perfil sem permissão). */
  coletasIgnoradas: number;
  amostras: number;
}

export interface OpcoesMigracao {
  /** false para perfis que não podem criar talhões: coletas de talhões desconhecidos ficam de fora. */
  permitirNovosTalhoes?: boolean;
}

/**
 * Leva os dados do banco antigo deste aparelho para a fonte de dados atual.
 * Talhões são casados pelo nome (não duplica os que já existem); coletas iguais
 * (mesmo talhão, data, responsável e observação) são puladas.
 */
export function migrarDados(legado: DadosLegados, { permitirNovosTalhoes = true }: OpcoesMigracao = {}): ResultadoMigracao {
  const r: ResultadoMigracao = { talhoesNovos: 0, talhoesReaproveitados: 0, coletasNovas: 0, coletasExistentes: 0, coletasIgnoradas: 0, amostras: 0 };
  const d = dadosAtuais();
  const repo = repositorio();
  const ops: Operacao[] = [];
  const idT = new Map<number, string>();
  for (const t of legado.talhoes) {
    const existente = d.talhoes.find((x) => chaveNome(x.nome) === chaveNome(t.nome));
    if (existente) {
      idT.set(t.id!, existente.id);
      r.talhoesReaproveitados++;
      continue;
    }
    if (!permitirNovosTalhoes) continue;
    const { id: _id, ...dados } = t;
    const id = repo.novoId();
    idT.set(t.id!, id);
    ops.push({ tipo: 'adicionar', colecao: 'talhoes', id, dados: dados as Record<string, unknown> });
    r.talhoesNovos++;
  }
  const idC = new Map<number, string>();
  for (const c of legado.coletas) {
    const talhaoId = idT.get(c.talhaoId);
    if (!talhaoId) {
      if (legado.talhoes.some((t) => t.id === c.talhaoId)) r.coletasIgnoradas++;
      continue; // coleta órfã ou de talhão que não pôde ser criado
    }
    const igual = d.coletas.some(
      (x) => x.talhaoId === talhaoId && x.data === c.data && x.responsavel === c.responsavel && (x.observacoes ?? '') === (c.observacoes ?? ''),
    );
    if (igual) {
      r.coletasExistentes++;
      continue;
    }
    const { id: _id, ...dados } = c;
    const id = repo.novoId();
    idC.set(c.id!, id);
    ops.push({ tipo: 'adicionar', colecao: 'coletas', id, dados: { ...dados, talhaoId, criadoEm: new Date().toISOString() } });
    r.coletasNovas++;
  }
  for (const a of legado.amostras) {
    const coletaId = idC.get(a.coletaId);
    if (!coletaId) continue;
    const { id: _id, ...dados } = a;
    ops.push({ tipo: 'adicionar', colecao: 'amostras', id: repo.novoId(), dados: { ...dados, coletaId } });
    r.amostras++;
  }
  if (ops.length) repo.lote(ops);
  return r;
}

/** Migra uma única vez por aparelho; null se não havia nada a migrar. */
export async function migrarLegadoUmaVez(opcoes: OpcoesMigracao = {}): Promise<ResultadoMigracao | null> {
  if (localStorage.getItem(CHAVE_MIGRADO) === '1') return null;
  const legado = await lerLegado();
  const r = legado && (legado.talhoes.length || legado.coletas.length) ? migrarDados(legado, opcoes) : null;
  localStorage.setItem(CHAVE_MIGRADO, '1');
  return r;
}

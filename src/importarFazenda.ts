import { dadosAtuais, repositorio } from './dados';
import { chaveNome, lerKml, sugerirCorrespondencias, type PoligonoKml } from './kml';
import type { Novo, Talhao } from './tipos';

export const KML_FAZENDA_URL = `${import.meta.env.BASE_URL}talhoes-fazenda.kml`;

/**
 * Funde talhões duplicados (mesmo nome normalizado): mantém o primeiro, move as coletas dos
 * outros para ele e preenche campos vazios. Retorna quantos foram removidos.
 */
export function fundirDuplicados(): number {
  const d = dadosAtuais();
  const todos = [...d.talhoes].sort((a, b) => a.id.localeCompare(b.id));
  const porChave = new Map<string, Talhao[]>();
  for (const t of todos) porChave.set(chaveNome(t.nome), [...(porChave.get(chaveNome(t.nome)) ?? []), t]);
  const ops: Parameters<ReturnType<typeof repositorio>['lote']>[0] = [];
  let removidos = 0;
  for (const grupo of porChave.values()) {
    if (grupo.length < 2) continue;
    const [principal, ...resto] = grupo;
    const mesclado: Partial<Novo<Talhao>> = {};
    for (const dup of resto) {
      for (const k of ['capim', 'capimKml', 'areaKmlHa', 'fazenda', 'geometria', 'observacoes'] as const) {
        if (!principal[k] && dup[k]) (mesclado as Record<string, unknown>)[k] = dup[k];
      }
      if (!(principal.areaHa > 0) && dup.areaHa > 0) mesclado.areaHa = dup.areaHa;
      for (const c of d.coletas.filter((c) => c.talhaoId === dup.id)) {
        ops.push({ tipo: 'atualizar', colecao: 'coletas', id: c.id, dados: { talhaoId: principal.id } });
      }
      ops.push({ tipo: 'remover', colecao: 'talhoes', id: dup.id });
      removidos++;
    }
    if (Object.keys(mesclado).length) ops.push({ tipo: 'atualizar', colecao: 'talhoes', id: principal.id, dados: mesclado as Record<string, unknown> });
  }
  if (ops.length) repositorio().lote(ops);
  return removidos;
}

/** O nome atual ainda é derivado do KML (mesma chave, sem personalização do usuário)? */
function nomeEhDoKml(nomeAtual: string, p: PoligonoKml): boolean {
  return chaveNome(nomeAtual) === chaveNome(p.nome);
}

let emAndamento: Promise<{ criados: number; atualizados: number }> | null = null;

/**
 * Carrega/atualiza os talhões com capim a partir do KML embutido no app.
 * Talhões existentes (pelo nome) recebem os dados do KML (capimKml, areaKmlHa, fazenda, contorno),
 * mas capim e área em uso só são preenchidos se estiverem vazios — edições do usuário são preservadas.
 * Chamadas simultâneas compartilham a mesma execução (evita duplicar no StrictMode).
 */
export function importarTalhoesFazenda(): Promise<{ criados: number; atualizados: number }> {
  if (!emAndamento) emAndamento = executar().finally(() => (emAndamento = null));
  return emAndamento;
}

async function executar() {
  const resp = await fetch(KML_FAZENDA_URL);
  if (!resp.ok) throw new Error('KML da fazenda não encontrado no app.');
  const polys = lerKml(await resp.text()).filter((p) => p.capim);
  fundirDuplicados();
  const existentes = dadosAtuais().talhoes;
  const corresp = sugerirCorrespondencias(polys, existentes);
  const ops: Parameters<ReturnType<typeof repositorio>['lote']>[0] = [];
  let criados = 0;
  let atualizados = 0;
  for (const [i, p] of polys.entries()) {
    const areaKml = p.areaDeclaradaHa ?? Math.round(p.areaCalculadaHa * 100) / 100;
    const doKml: Partial<Novo<Talhao>> = { capimKml: p.capim, areaKmlHa: areaKml, fazenda: p.fazenda, geometria: p.aneis };
    const id = corresp.get(i);
    if (id != null) {
      const atual = existentes.find((t) => t.id === id)!;
      // Renomeia para o padrão do app se o nome ainda for o do KML ou uma abreviação dele (ex.: "TL 18").
      const nome = nomeEhDoKml(atual.nome, p) ? p.nomeApp : atual.nome;
      ops.push({
        tipo: 'atualizar',
        colecao: 'talhoes',
        id,
        dados: { ...doKml, nome, capim: atual.capim || p.capim, areaHa: atual.areaHa > 0 ? atual.areaHa : areaKml } as Record<string, unknown>,
      });
      atualizados++;
    } else {
      const novo: Novo<Talhao> = { nome: p.nomeApp, capim: p.capim, areaHa: areaKml, observacoes: '', ...doKml };
      ops.push({ tipo: 'adicionar', colecao: 'talhoes', id: repositorio().novoId(), dados: novo as Record<string, unknown> });
      criados++;
    }
  }
  if (ops.length) repositorio().lote(ops);
  return { criados, atualizados };
}

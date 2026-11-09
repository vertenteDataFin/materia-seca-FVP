import { db, type Talhao } from './db';
import { chaveNome, lerKml, sugerirCorrespondencias, type PoligonoKml } from './kml';

export const KML_FAZENDA_URL = `${import.meta.env.BASE_URL}talhoes-fazenda.kml`;

/**
 * Funde talhões duplicados (mesmo nome normalizado): mantém o de menor id, move as coletas dos
 * outros para ele e preenche campos vazios. Retorna quantos foram removidos.
 */
export async function fundirDuplicados(): Promise<number> {
  return db.transaction('rw', db.talhoes, db.coletas, async () => {
    const todos = await db.talhoes.orderBy('id').toArray();
    const porChave = new Map<string, Talhao[]>();
    for (const t of todos) porChave.set(chaveNome(t.nome), [...(porChave.get(chaveNome(t.nome)) ?? []), t]);
    let removidos = 0;
    for (const grupo of porChave.values()) {
      if (grupo.length < 2) continue;
      const [principal, ...resto] = grupo;
      const mesclado: Partial<Talhao> = {};
      for (const d of resto) {
        for (const k of ['capim', 'capimKml', 'areaKmlHa', 'fazenda', 'geometria', 'observacoes'] as const) {
          if (!principal[k] && d[k]) (mesclado as Record<string, unknown>)[k] = d[k];
        }
        if (!(principal.areaHa > 0) && d.areaHa > 0) mesclado.areaHa = d.areaHa;
        await db.coletas.where('talhaoId').equals(d.id!).modify({ talhaoId: principal.id! });
        await db.talhoes.delete(d.id!);
        removidos++;
      }
      if (Object.keys(mesclado).length) await db.talhoes.update(principal.id!, mesclado);
    }
    return removidos;
  });
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
  await fundirDuplicados();
  let criados = 0;
  let atualizados = 0;
  await db.transaction('rw', db.talhoes, async () => {
    const existentes = await db.talhoes.toArray();
    const corresp = sugerirCorrespondencias(polys, existentes);
    for (const [i, p] of polys.entries()) {
      const areaKml = p.areaDeclaradaHa ?? Math.round(p.areaCalculadaHa * 100) / 100;
      const doKml: Partial<Talhao> = { capimKml: p.capim, areaKmlHa: areaKml, fazenda: p.fazenda, geometria: p.aneis };
      const id = corresp.get(i);
      if (id != null) {
        const atual = existentes.find((t) => t.id === id)!;
        // Renomeia para o padrão do app se o nome ainda for o do KML ou uma abreviação dele (ex.: "TL 18").
        const nome = nomeEhDoKml(atual.nome, p) ? p.nomeApp : atual.nome;
        await db.talhoes.update(id, { ...doKml, nome, capim: atual.capim || p.capim, areaHa: atual.areaHa > 0 ? atual.areaHa : areaKml });
        atualizados++;
      } else {
        await db.talhoes.add({ nome: p.nomeApp, capim: p.capim, areaHa: areaKml, observacoes: '', ...doKml } as Talhao);
        criados++;
      }
    }
  });
  return { criados, atualizados };
}

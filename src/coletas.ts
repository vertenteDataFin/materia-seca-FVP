import { db, type Amostra, type Coleta } from './db';
import { hoje, parseNum } from './util';

export const CHAVE_RESP = 'silagem-ms:ultimo-responsavel';
export const CHAVE_QUADRO = 'silagem-ms:ultimo-quadro';

/** Cria uma coleta para o talhão com data de hoje e os últimos responsável/quadro usados. Devolve o id. */
export async function criarColeta(talhaoId: number, extra: Partial<Coleta> = {}): Promise<number> {
  const quadro = parseNum(localStorage.getItem(CHAVE_QUADRO) ?? '') ?? 1;
  const id = await db.coletas.add({
    talhaoId,
    data: hoje(),
    responsavel: localStorage.getItem(CHAVE_RESP) ?? '',
    areaAmostralM2: quadro > 0 ? quadro : 1,
    observacoes: '',
    ...extra,
  });
  return id;
}

export function lembrarUltimos(responsavel: string, quadro: number) {
  localStorage.setItem(CHAVE_RESP, responsavel.trim());
  localStorage.setItem(CHAVE_QUADRO, String(quadro));
}

/** Adiciona um ponto (amostra) à coleta com o próximo número; posição opcional. Devolve o id. */
export async function adicionarPonto(coletaId: number, pos: Pick<Amostra, 'lat' | 'lng' | 'precisaoM' | 'capturadoEm'> = {}): Promise<number> {
  const existentes = await db.amostras.where('coletaId').equals(coletaId).toArray();
  const ponto = existentes.reduce((m, a) => Math.max(m, a.ponto), 0) + 1;
  return db.amostras.add({ coletaId, ponto, pesoVerdeKg: null, pesoUmidoG: null, pesoSecoG: null, ...pos });
}

/** Remove um ponto e renumera os restantes (1, 2, 3…) para não ficar buraco na sequência. */
export async function removerPonto(amostraId: number) {
  await db.transaction('rw', db.amostras, async () => {
    const a = await db.amostras.get(amostraId);
    if (!a) return;
    await db.amostras.delete(amostraId);
    const restantes = await db.amostras.where('coletaId').equals(a.coletaId).sortBy('ponto');
    await Promise.all(restantes.map((r, i) => (r.ponto === i + 1 ? null : db.amostras.update(r.id!, { ponto: i + 1 }))));
  });
}

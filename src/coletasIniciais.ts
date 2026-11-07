import { db } from './db';
import { chaveNome } from './kml';

/** Coletas já feitas na fazenda (fichas de campo de 06 e 07/11/2026), sem posição GPS. */
export const COLETAS_INICIAIS: {
  talhao: string;
  data: string;
  /** [peso verde kg, úmido g, seco g] — úmido/seco opcionais. */
  amostras: [number, number?, number?][];
}[] = [
  { talhao: 'TL 23', data: '2026-11-06', amostras: [[3.6, 100, 22], [4.1, 100, 24]] },
  { talhao: 'TL 21', data: '2026-11-06', amostras: [[1.2, 100, 22], [3.0, 100, 20]] },
  { talhao: 'TL 18', data: '2026-11-07', amostras: [[2.02, 100, 22], [1.0, 100, 26], [2.3], [1.0], [2.0], [1.68]] },
];

export const OBS_COLETA_INICIAL = 'Lançada da ficha de campo (sem GPS)';

export interface ResultadoImportacao {
  criadas: number;
  existentes: number;
  semTalhao: string[];
}

/**
 * Cria as coletas iniciais nos talhões correspondentes (pelo nome). Se já houver coleta do mesmo
 * talhão na mesma data, não cria de novo — pode ser chamada quantas vezes for preciso.
 */
export async function importarColetasIniciais(): Promise<ResultadoImportacao> {
  const r: ResultadoImportacao = { criadas: 0, existentes: 0, semTalhao: [] };
  await db.transaction('rw', db.talhoes, db.coletas, db.amostras, async () => {
    const talhoes = await db.talhoes.toArray();
    for (const c of COLETAS_INICIAIS) {
      const t = talhoes.find((x) => chaveNome(x.nome) === chaveNome(c.talhao));
      if (!t) {
        r.semTalhao.push(c.talhao);
        continue;
      }
      const jaTem = await db.coletas.where('talhaoId').equals(t.id!).filter((x) => x.data === c.data).count();
      if (jaTem) {
        r.existentes++;
        continue;
      }
      const coletaId = await db.coletas.add({ talhaoId: t.id!, data: c.data, responsavel: '', areaAmostralM2: 1, observacoes: OBS_COLETA_INICIAL });
      await db.amostras.bulkAdd(
        c.amostras.map(([verde, umido, seco], i) => ({ coletaId, ponto: i + 1, pesoVerdeKg: verde, pesoUmidoG: umido ?? null, pesoSecoG: seco ?? null })),
      );
      r.criadas++;
    }
  });
  return r;
}

import { dadosAtuais, repositorio } from './dados';
import { chaveNome } from './kml';
import type { Operacao } from './repositorio';

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
 * Cria as coletas iniciais nos talhões correspondentes (pelo nome). Se a coleta da ficha daquele
 * talhão/data já existir (identificada pela observação), não cria de novo — pode ser chamada
 * quantas vezes for preciso. Coletas feitas pelo usuário no mesmo dia não impedem a importação.
 */
export function importarColetasIniciais(): ResultadoImportacao {
  const r: ResultadoImportacao = { criadas: 0, existentes: 0, semTalhao: [] };
  const d = dadosAtuais();
  const repo = repositorio();
  const ops: Operacao[] = [];
  for (const c of COLETAS_INICIAIS) {
    const t = d.talhoes.find((x) => chaveNome(x.nome) === chaveNome(c.talhao));
    if (!t) {
      r.semTalhao.push(c.talhao);
      continue;
    }
    if (d.coletas.some((x) => x.talhaoId === t.id && x.data === c.data && x.observacoes === OBS_COLETA_INICIAL)) {
      r.existentes++;
      continue;
    }
    const coletaId = repo.novoId();
    ops.push({
      tipo: 'adicionar',
      colecao: 'coletas',
      id: coletaId,
      dados: { talhaoId: t.id, data: c.data, responsavel: '', areaAmostralM2: 1, observacoes: OBS_COLETA_INICIAL, criadoEm: new Date().toISOString() },
    });
    c.amostras.forEach(([verde, umido, seco], i) =>
      ops.push({
        tipo: 'adicionar',
        colecao: 'amostras',
        id: repo.novoId(),
        dados: { coletaId, ponto: i + 1, pesoVerdeKg: verde, pesoUmidoG: umido ?? null, pesoSecoG: seco ?? null },
      }),
    );
    r.criadas++;
  }
  if (ops.length) repo.lote(ops);
  return r;
}

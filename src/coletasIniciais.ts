import { dadosAtuais, repositorio } from './dados';
import { chaveNome } from './kml';
import type { Operacao } from './repositorio';
import type { Amostra } from './tipos';

/** Coletas já feitas na fazenda (fichas de campo de 06 e 07/11/2026), sem posição GPS. */
export const COLETAS_INICIAIS: {
  talhao: string;
  data: string;
  /** [peso verde kg, úmido g, seco g] — úmido/seco opcionais. */
  amostras: [number, number?, number?][];
}[] = [
  { talhao: 'TL 23', data: '2026-11-06', amostras: [[3.6, 100, 22], [4.1, 100, 24]] },
  { talhao: 'TL 21', data: '2026-11-06', amostras: [[1.2, 100, 22], [3.0, 100, 20]] },
  { talhao: 'TL 18', data: '2026-11-07', amostras: [[2.02, 100, 22], [1.0, 100, 26], [2.3, 100, 24], [1.0, 100, 26], [2.0, 100, 22], [1.68, 100, 22]] },
];

export const OBS_COLETA_INICIAL = 'Lançada da ficha de campo (sem GPS)';

export interface ResultadoImportacao {
  criadas: number;
  existentes: number;
  /** Amostras já existentes que receberam úmido/seco da ficha (estavam em branco). */
  completadas: number;
  /** Amostras da ficha que tinham sido excluídas e foram repostas. */
  repostas: number;
  semTalhao: string[];
}

/**
 * Cria as coletas iniciais nos talhões correspondentes (pelo nome). Se a coleta da ficha daquele
 * talhão/data já existir (identificada pela observação), não cria de novo: casa as amostras da ficha
 * com as existentes pelos valores, completa úmido/seco que estejam em branco e repõe amostras da ficha
 * que tenham sido excluídas (só enquanto a coleta tiver menos amostras que a ficha, para não duplicar
 * valores corrigidos à mão). Pode ser chamada quantas vezes for preciso. Coletas feitas pelo usuário
 * no mesmo dia não impedem a importação.
 */
export function importarColetasIniciais(): ResultadoImportacao {
  const r: ResultadoImportacao = { criadas: 0, existentes: 0, completadas: 0, repostas: 0, semTalhao: [] };
  const d = dadosAtuais();
  const repo = repositorio();
  const ops: Operacao[] = [];
  for (const c of COLETAS_INICIAIS) {
    const t = d.talhoes.find((x) => chaveNome(x.nome) === chaveNome(c.talhao));
    if (!t) {
      r.semTalhao.push(c.talhao);
      continue;
    }
    const existente = d.coletas.find((x) => x.talhaoId === t.id && x.data === c.data && x.observacoes === OBS_COLETA_INICIAL);
    if (existente) {
      r.existentes++;
      const amostras = d.amostras.filter((a) => a.coletaId === existente.id).sort((a, b) => a.ponto - b.ponto);
      const livres = new Set(amostras);
      // 1ª passada: amostra igual à ficha (verde e MS); 2ª: mesmo verde ainda sem MS (completa a MS)
      const casar = (verde: number, umido?: number, seco?: number) => {
        const exata = [...livres].find((a) => a.pesoVerdeKg === verde && a.pesoUmidoG == (umido ?? null) && a.pesoSecoG == (seco ?? null));
        if (exata) return { a: exata, completar: false };
        const semMS = [...livres].find((a) => a.pesoVerdeKg === verde && a.pesoUmidoG == null && a.pesoSecoG == null);
        return semMS ? { a: semMS, completar: umido != null && seco != null } : null;
      };
      const ordem: ({ a: Amostra } | { nova: [number, number?, number?] })[] = [];
      let podeRepor = Math.max(0, c.amostras.length - amostras.length);
      for (const f of c.amostras) {
        const m = casar(...f);
        if (m) {
          livres.delete(m.a);
          if (m.completar) {
            ops.push({ tipo: 'atualizar', colecao: 'amostras', id: m.a.id, dados: { pesoUmidoG: f[1], pesoSecoG: f[2] } });
            r.completadas++;
          }
          ordem.push({ a: m.a });
        } else if (podeRepor > 0) {
          podeRepor--;
          ordem.push({ nova: f });
        }
      }
      if (!ordem.some((o) => 'nova' in o)) continue;
      // Repõe as que faltam. Se todas as existentes casaram com a ficha, renumera na ordem da ficha;
      // senão, as repostas entram no fim.
      const renumerar = livres.size === 0;
      let n = renumerar ? 0 : amostras.reduce((m, a) => Math.max(m, a.ponto), 0);
      for (const o of renumerar ? ordem : ordem.filter((x) => 'nova' in x)) {
        n++;
        if ('nova' in o) {
          const [verde, umido, seco] = o.nova;
          ops.push({ tipo: 'adicionar', colecao: 'amostras', id: repo.novoId(), dados: { coletaId: existente.id, ponto: n, pesoVerdeKg: verde, pesoUmidoG: umido ?? null, pesoSecoG: seco ?? null } });
          r.repostas++;
        } else if (o.a.ponto !== n) {
          ops.push({ tipo: 'atualizar', colecao: 'amostras', id: o.a.id, dados: { ponto: n } });
        }
      }
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

import { teorMS } from './calc';
import { nomeCurto } from './MapaTalhoes';
import { amostrasPorColeta } from './dados';
import { msColheitaPorTalhao, progressoColheita, resumoColheita } from './colheita';
import { compararNomes, type AmostraColheita, type Dados, type Talhao } from './tipos';

/** Peneiras do Penn State (4 peneiras), da mais grossa para o fundo. */
export const PENEIRAS = [
  { campo: 'peneira19G', rotulo: '19 mm', curto: '19' },
  { campo: 'peneira8G', rotulo: '8 mm', curto: '8' },
  { campo: 'peneira4G', rotulo: '4 mm', curto: '4' },
  { campo: 'fundoG', rotulo: 'Fundo', curto: 'F' },
] as const;

export type CampoPeneira = (typeof PENEIRAS)[number]['campo'];

export interface PennState {
  /** Peso total da amostra nas 4 peneiras (g). */
  totalG: number;
  /** % retida em cada peneira, na ordem de PENEIRAS. */
  pct: [number, number, number, number];
}

/** % retida em cada peneira; null enquanto faltar algum peso ou o total for zero. */
export function pennState(a: Pick<AmostraColheita, CampoPeneira>): PennState | null {
  const pesos = PENEIRAS.map((p) => a[p.campo]);
  if (pesos.some((g) => g == null || g < 0)) return null;
  const totalG = (pesos as number[]).reduce((s, g) => s + g, 0);
  if (totalG <= 0) return null;
  return { totalG, pct: (pesos as number[]).map((g) => (g / totalG) * 100) as PennState['pct'] };
}

/** MS (%) da amostra do caminhão (mesmo método do laboratório: seco ÷ úmido). */
export function msColheita(a: Pick<AmostraColheita, 'pesoUmidoG' | 'pesoSecoG'>): number | null {
  return teorMS(a);
}

/** Início do código: talhão e dia/mês, como nas etiquetas de campo ("TL18-1711-C"). */
function prefixoCodigo(nomeTalhao: string, coletadaEm: string): string {
  const tl = nomeCurto(nomeTalhao).replace(/\s+/g, '').toUpperCase();
  const [, m, d] = coletadaEm.slice(0, 10).split('-');
  return `${tl}-${d ?? '??'}${m ?? '??'}-C`;
}

/**
 * Próximo código de amostra de caminhão: "TL18-1711-C1", "TL18-1711-C2"… (sequência do talhão no dia).
 * Segue o maior número já usado, então excluir uma amostra não repete o código de outra.
 */
export function proximoCodigoColheita(
  nomeTalhao: string,
  coletadaEm: string,
  existentes: Pick<AmostraColheita, 'codigo'>[],
): string {
  const prefixo = prefixoCodigo(nomeTalhao, coletadaEm);
  const maior = existentes.reduce((m, a) => {
    if (!a.codigo?.startsWith(prefixo)) return m;
    const n = Number(a.codigo.slice(prefixo.length));
    return Number.isInteger(n) && n > m ? n : m;
  }, 0);
  return `${prefixo}${maior + 1}`;
}

/** Linha de colheita de um talhão (relatórios): amostragem dos caminhões + cargas da balança. */
export interface ColheitaTalhao {
  talhao: Talhao;
  /** Amostras de caminhão (todas) e quantas já têm MS. */
  nAmostras: number;
  nComMS: number;
  /** MS média dos caminhões (%). */
  msColheita: number | null;
  /** Penn State médio das amostras completas (% por peneira: 19, 8, 4 mm e fundo). */
  pennMedio: PennState['pct'] | null;
  cargas: number;
  tMV: number;
  tMS: number | null;
  areaColhidaHa: number | null;
  /** % colhida (finalizada = 100). */
  progresso: number | null;
  finalizada: boolean;
}

/**
 * Colheita por talhão (talhões com carga ou com amostra de caminhão), com a MS dos caminhões na produção,
 * igual ao Painel e à página Colheita.
 */
export function colheitaPorTalhao(d: Pick<Dados, 'talhoes' | 'cargas' | 'coletas' | 'amostras' | 'amostrasColheita'>): ColheitaTalhao[] {
  const amostrasColheita = d.amostrasColheita ?? [];
  const resumo = resumoColheita(d.talhoes, d.cargas ?? [], d.coletas, amostrasPorColeta(d.amostras), amostrasColheita);
  const msPorTalhao = msColheitaPorTalhao(amostrasColheita);
  const comAmostra = new Set(amostrasColheita.map((a) => a.talhaoId));
  return [...d.talhoes]
    .filter((t) => resumo.porTalhao.has(t.id) || comAmostra.has(t.id))
    .sort((a, b) => compararNomes(a.nome, b.nome))
    .map((t) => {
      const doTalhao = amostrasColheita.filter((a) => a.talhaoId === t.id);
      const penns = doTalhao.map(pennState).filter((p): p is PennState => p != null);
      const pennMedio = penns.length
        ? ([0, 1, 2, 3].map((i) => penns.reduce((s, p) => s + p.pct[i], 0) / penns.length) as PennState['pct'])
        : null;
      const a = resumo.porTalhao.get(t.id);
      const ms = msPorTalhao.get(t.id);
      return {
        talhao: t,
        nAmostras: doTalhao.length,
        nComMS: ms?.n ?? 0,
        msColheita: ms?.media ?? null,
        pennMedio,
        cargas: a?.pesadas ?? 0,
        tMV: a?.tMV ?? 0,
        tMS: a?.tMS ?? null,
        areaColhidaHa: a ? (a.finalizada ? t.areaHa : a.areaColhidaHa) : null,
        progresso: a ? progressoColheita(a) : null,
        finalizada: !!t.colheitaFinalizadaEm,
      };
    });
}

/** Amostra ainda sem o peso seco: fica em "Aguardando MS". */
export function aguardandoMSColheita(a: Pick<AmostraColheita, 'pesoSecoG'>): boolean {
  return a.pesoSecoG == null;
}

import { resumoColeta } from './calc';
import { compararColetasDesc, type Amostra, type Carga, type Coleta, type Talhao } from './tipos';

/**
 * Acompanhamento da colheita: as cargas pesadas de cada talhão, convertidas em área colhida pela
 * estimativa da última amostragem disponível.
 *
 * Conta em matéria seca: t MS entregue = Σ peso líquido × MS da carga (ou, sem ela, a MS da última
 * amostragem); área colhida = t MS entregue ÷ t MS/ha da amostragem. Enquanto as cargas usam a MS da
 * própria amostragem, isso dá o mesmo que massa verde ÷ t MV/ha; a MS da carga (quando amostrada na
 * colheita) corrige o efeito do emurchecimento, que deixa a carga mais leve que o capim em pé.
 */

/** Peso líquido da carga (kg); null enquanto não foi pesada (ou pesos inválidos). */
export function liquidoKg(c: Pick<Carga, 'pesoBrutoKg' | 'taraKg'>): number | null {
  const { pesoBrutoKg: b, taraKg: t } = c;
  if (b == null || t == null || !(b > 0) || t < 0 || b <= t) return null;
  return b - t;
}

/** Carga já passou pela balança (com peso válido): está encerrada. */
export function cargaPesada(c: Pick<Carga, 'pesoBrutoKg' | 'taraKg'>): boolean {
  return liquidoKg(c) != null;
}

/** Estimativa usada para converter peso em área: a última coleta do talhão com produção (e, se houver, MS). */
export interface ReferenciaAmostragem {
  coletaId: string;
  data: string;
  tMVha: number;
  msPct: number | null;
  tMSha: number | null;
}

export function referenciaDoTalhao(talhaoId: string, coletas: Coleta[], porColeta: Map<string, Amostra[]>): ReferenciaAmostragem | null {
  const doTalhao = coletas.filter((c) => c.talhaoId === talhaoId).sort(compararColetasDesc);
  let semMS: ReferenciaAmostragem | null = null;
  for (const c of doTalhao) {
    const r = resumoColeta(c, porColeta.get(c.id) ?? []);
    if (r.tMVha == null || !(r.tMVha > 0)) continue;
    const ref = { coletaId: c.id, data: c.data, tMVha: r.tMVha, msPct: r.msPct, tMSha: r.tMSha };
    // prefere a última com MS aferida; se nenhuma tiver, usa a última com massa verde
    if (r.tMSha != null && r.tMSha > 0) return ref;
    semMS ??= ref;
  }
  return semMS;
}

export interface AndamentoTalhao {
  talhao: Talhao;
  cargas: Carga[];
  /** Cargas que saíram do campo e ainda não foram pesadas. */
  pendentes: number;
  pesadas: number;
  /** Massa verde entregue (t, peso líquido da balança). */
  tMV: number;
  /** Matéria seca entregue (t); null sem MS (nem da carga nem da amostragem). */
  tMS: number | null;
  ref: ReferenciaAmostragem | null;
  /** Área colhida estimada (ha); null sem amostragem de referência. */
  areaColhidaHa: number | null;
  /** % da área do talhão (pode passar de 100% se a amostragem subestimou). */
  pctColhida: number | null;
  /** Dias com carga pesada. */
  diasAtivos: number;
  /** Massa verde por dia de colheita (t/dia). */
  ritmoTdia: number | null;
  /** Dias de colheita que faltam, no ritmo atual. */
  diasRestantes: number | null;
  inicio: string | null;
  ultima: string | null;
  finalizada: boolean;
  /** Produtividade realizada (t MV/ha sobre a área do talhão): só faz sentido com a colheita finalizada. */
  tMVhaReal: number | null;
}

export function andamentoTalhao(talhao: Talhao, cargas: Carga[], ref: ReferenciaAmostragem | null): AndamentoTalhao {
  const minhas = cargas.filter((c) => c.talhaoId === talhao.id);
  const pesadas = minhas.filter(cargaPesada);
  const tMV = pesadas.reduce((s, c) => s + liquidoKg(c)! / 1000, 0);

  let tMS: number | null = 0;
  for (const c of pesadas) {
    const ms = c.msPct ?? ref?.msPct ?? null;
    if (ms == null) { tMS = null; break; }
    tMS += (liquidoKg(c)! / 1000) * (ms / 100);
  }

  let areaColhidaHa: number | null = null;
  if (ref && pesadas.length) areaColhidaHa = tMS != null && ref.tMSha ? tMS / ref.tMSha : tMV / ref.tMVha;
  else if (ref) areaColhidaHa = 0;
  const pctColhida = areaColhidaHa != null && talhao.areaHa > 0 ? (areaColhidaHa / talhao.areaHa) * 100 : null;

  const dias = new Set(pesadas.map((c) => c.saidaEm.slice(0, 10)));
  const diasAtivos = dias.size;
  const ritmoTdia = diasAtivos ? tMV / diasAtivos : null;
  const finalizada = !!talhao.colheitaFinalizadaEm;
  let diasRestantes: number | null = null;
  if (!finalizada && areaColhidaHa && diasAtivos && talhao.areaHa > 0) {
    const haPorDia = areaColhidaHa / diasAtivos;
    diasRestantes = Math.max(0, (talhao.areaHa - areaColhidaHa) / haPorDia);
  }
  const datas = minhas.map((c) => c.saidaEm).sort();

  return {
    talhao,
    cargas: minhas,
    pendentes: minhas.length - pesadas.length,
    pesadas: pesadas.length,
    tMV,
    tMS: pesadas.length ? tMS : null,
    ref,
    areaColhidaHa,
    pctColhida,
    diasAtivos,
    ritmoTdia,
    diasRestantes,
    inicio: datas[0] ?? null,
    ultima: datas[datas.length - 1] ?? null,
    finalizada,
    tMVhaReal: talhao.areaHa > 0 && pesadas.length ? tMV / talhao.areaHa : null,
  };
}

/** Data e hora local no formato do campo datetime-local ("AAAA-MM-DDTHH:mm"). */
export function agoraLocal(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "14/11 07:30" */
export function fmtSaida(iso: string): string {
  const [data, hora] = iso.split('T');
  const [, m, d] = data.split('-');
  return `${d}/${m}${hora ? ` ${hora.slice(0, 5)}` : ''}`;
}

/** Placas e silos já usados (para sugerir ao digitar), do mais usado ao menos. */
export function sugestoes(cargas: Carga[], campo: 'placa' | 'silo'): string[] {
  const n = new Map<string, number>();
  for (const c of cargas) {
    const v = c[campo]?.trim();
    if (v) n.set(v, (n.get(v) ?? 0) + 1);
  }
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([v]) => v);
}

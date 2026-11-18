import { resumoColeta, teorMS } from './calc';
import { compararColetasDesc, type Amostra, type AmostraColheita, type Carga, type Coleta, type Talhao } from './tipos';

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

/** MS das amostras de caminhão (amostragem de colheita) de um talhão: média geral e por dia. */
export interface MSColheitaTalhao {
  /** Média simples das amostras com MS (%). */
  media: number;
  n: number;
  /** Por dia ("AAAA-MM-DD"): média e nº de amostras. */
  porDia: Map<string, { media: number; n: number }>;
}

/** Agrupa a MS das amostras de caminhão por talhão (só as que já têm o peso seco). */
export function msColheitaPorTalhao(amostras: AmostraColheita[]): Map<string, MSColheitaTalhao> {
  const soma = new Map<string, { s: number; n: number; dias: Map<string, { s: number; n: number }> }>();
  for (const a of amostras) {
    const ms = teorMS(a);
    if (ms == null) continue;
    const t = soma.get(a.talhaoId) ?? { s: 0, n: 0, dias: new Map() };
    t.s += ms;
    t.n++;
    const dia = a.coletadaEm.slice(0, 10);
    const d = t.dias.get(dia) ?? { s: 0, n: 0 };
    d.s += ms;
    d.n++;
    t.dias.set(dia, d);
    soma.set(a.talhaoId, t);
  }
  const r = new Map<string, MSColheitaTalhao>();
  for (const [id, t] of soma) {
    r.set(id, {
      media: t.s / t.n,
      n: t.n,
      porDia: new Map([...t.dias].map(([dia, d]) => [dia, { media: d.s / d.n, n: d.n }])),
    });
  }
  return r;
}

/**
 * MS (%) usada para uma carga: a informada na carga; senão a dos caminhões amostrados do talhão no mesmo dia;
 * senão a média dos caminhões do talhão; senão a da amostragem de campo.
 */
export function msDaCarga(c: Pick<Carga, 'msPct' | 'saidaEm'>, msCol: MSColheitaTalhao | null | undefined, ref: ReferenciaAmostragem | null): number | null {
  return c.msPct ?? msCol?.porDia.get(c.saidaEm.slice(0, 10))?.media ?? msCol?.media ?? ref?.msPct ?? null;
}

export interface AndamentoTalhao {
  talhao: Talhao;
  /** MS das amostras de caminhão do talhão (null sem amostragem de colheita com MS). */
  msColheita: MSColheitaTalhao | null;
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

export function andamentoTalhao(
  talhao: Talhao,
  cargas: Carga[],
  ref: ReferenciaAmostragem | null,
  msColheita: MSColheitaTalhao | null = null,
): AndamentoTalhao {
  const minhas = cargas.filter((c) => c.talhaoId === talhao.id);
  const pesadas = minhas.filter(cargaPesada);
  const tMV = pesadas.reduce((s, c) => s + liquidoKg(c)! / 1000, 0);

  // MS entregue: MS dos caminhões amostrados (colheita); a amostragem de campo só na falta deles.
  let tMS: number | null = 0;
  for (const c of pesadas) {
    const ms = msDaCarga(c, msColheita, ref);
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
    msColheita,
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

/** Placa normalizada para comparar: maiúsculas, sem espaço nem hífen ("abc-1d23" = "ABC1D23"). */
export function normalizarPlaca(placa?: string | null): string {
  return (placa ?? '').toUpperCase().replace(/[\s-]/g, '');
}

/**
 * Tara de cada caminhão (pela placa): a da pesagem mais recente daquela placa.
 * A tara é do caminhão, então a próxima carga dele já vem com ela.
 */
export function tarasPorPlaca(cargas: Carga[]): Map<string, number> {
  const ordem = cargas
    .filter((c) => c.taraKg != null && normalizarPlaca(c.placa))
    .sort((a, b) => (a.pesadoEm ?? a.saidaEm).localeCompare(b.pesadoEm ?? b.saidaEm));
  const m = new Map<string, number>();
  for (const c of ordem) m.set(normalizarPlaca(c.placa), c.taraKg as number);
  return m;
}

/** % colhida para mostrar: talhão finalizado conta 100%; em colheita, a estimativa limitada a 100%. */
export function progressoColheita(a: AndamentoTalhao): number | null {
  if (a.finalizada) return 100;
  return a.pctColhida == null ? null : Math.min(100, a.pctColhida);
}

/** Texto curto do % colhido: "6%", "100% ✓" (finalizada) ou "—" (sem como estimar). */
export function textoProgresso(a: AndamentoTalhao): string {
  const pct = progressoColheita(a);
  return a.finalizada ? '100% ✓' : pct == null ? '—' : `${Math.round(pct)}%`;
}

/** Explicação do % colhido (dica ao passar o mouse). */
export function tituloProgresso(a: AndamentoTalhao): string {
  if (a.finalizada) return 'Colheita finalizada';
  if (a.areaColhidaHa != null) return `${a.areaColhidaHa.toFixed(1).replace('.', ',')} de ${a.talhao.areaHa.toFixed(1).replace('.', ',')} ha colhidos`;
  return 'Em colheita, sem amostragem para estimar a área';
}

export interface ResumoColheita {
  /** Andamento de cada talhão que já teve carga. */
  porTalhao: Map<string, AndamentoTalhao>;
  areaColhidaHa: number;
  /** Área dos talhões com carga sem amostragem de referência (não entra na área colhida). */
  semReferencia: number;
  tMV: number;
  tMS: number | null;
  emColheita: number;
  finalizados: number;
  pesadas: number;
  pendentes: number;
  diasAtivos: number;
  ritmoTdia: number | null;
  /**
   * MS da colheita (%): com cargas pesadas, MS entregue ÷ MV entregue (ponderada pelo peso);
   * sem cargas, a média das amostras de caminhão. null sem amostragem de colheita com MS.
   */
  msColheitaPct: number | null;
  /** Amostras de caminhão com MS. */
  nAmostrasColheita: number;
}

/** Totais da colheita na fazenda (para o Painel). A MS vem dos caminhões amostrados (amostragem de colheita). */
export function resumoColheita(
  talhoes: Talhao[],
  cargas: Carga[],
  coletas: Coleta[],
  porColeta: Map<string, Amostra[]>,
  amostrasColheita: AmostraColheita[] = [],
): ResumoColheita {
  const msPorTalhao = msColheitaPorTalhao(amostrasColheita);
  const comCarga = new Set(cargas.map((c) => c.talhaoId));
  const porTalhao = new Map<string, AndamentoTalhao>();
  for (const t of talhoes) {
    if (comCarga.has(t.id)) {
      porTalhao.set(t.id, andamentoTalhao(t, cargas, referenciaDoTalhao(t.id, coletas, porColeta), msPorTalhao.get(t.id) ?? null));
    }
  }
  let areaColhidaHa = 0;
  let semReferencia = 0;
  let tMV = 0;
  let tMS: number | null = 0;
  let emColheita = 0;
  let finalizados = 0;
  let pesadas = 0;
  let pendentes = 0;
  for (const a of porTalhao.values()) {
    const pct = progressoColheita(a);
    if (pct == null) semReferencia++;
    else areaColhidaHa += (pct / 100) * a.talhao.areaHa;
    tMV += a.tMV;
    if (a.pesadas) tMS = tMS != null && a.tMS != null ? tMS + a.tMS : null;
    if (a.finalizada) finalizados++;
    else emColheita++;
    pesadas += a.pesadas;
    pendentes += a.pendentes;
  }
  const dias = new Set(cargas.filter(cargaPesada).map((c) => c.saidaEm.slice(0, 10)));
  // Só caminhões amostrados entram na MS da colheita (a de campo fica no resumo de produtividade).
  let somaMS = 0;
  let nAmostrasColheita = 0;
  for (const m of msPorTalhao.values()) {
    somaMS += m.media * m.n;
    nAmostrasColheita += m.n;
  }
  const tMVcomMSColheita = [...porTalhao.values()].filter((a) => a.msColheita && a.tMS != null).reduce((s, a) => s + a.tMV, 0);
  const tMScomMSColheita = [...porTalhao.values()].filter((a) => a.msColheita && a.tMS != null).reduce((s, a) => s + (a.tMS ?? 0), 0);
  const msColheitaPct = tMVcomMSColheita > 0 ? (tMScomMSColheita / tMVcomMSColheita) * 100 : nAmostrasColheita ? somaMS / nAmostrasColheita : null;
  return {
    msColheitaPct,
    nAmostrasColheita,
    porTalhao,
    areaColhidaHa,
    semReferencia,
    tMV,
    tMS: pesadas ? tMS : null,
    emColheita,
    finalizados,
    pesadas,
    pendentes,
    diasAtivos: dias.size,
    ritmoTdia: dias.size ? tMV / dias.size : null,
  };
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

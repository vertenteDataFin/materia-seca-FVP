import { carregarModulo } from './carregarModulo';
import { chaveNome, semAcento, siglaFazenda } from './kml';
import { normalizarPlaca } from './colheita';
import type { Talhao } from './tipos';

/**
 * Relatório da balança ("Listagem de cargas", exportado em .xlsx): uma linha por romaneio.
 * PESO_TOTAL = caminhão cheio, PESO_TARA = vazio, PESO_LIQUIDO = carga. A observação (OBS) traz o
 * destino e a origem: "TRINCHEIRA 01-CAU TALHÃO 02" → silo "Trincheira 1", talhão "CAU TALHÃO 02".
 */
export interface LinhaBalanca {
  /** Nº do romaneio (NR_ROMANEIO): identifica a carga e evita importar duas vezes. */
  romaneio: string;
  /** Data e hora da pesagem com o caminhão cheio ("AAAA-MM-DDTHH:mm"). */
  pesadoEm: string;
  placa: string;
  /** Nome do transportador/motorista como veio no relatório (sem CPF). */
  motoristaRelatorio: string;
  item: string;
  totalKg: number | null;
  taraKg: number | null;
  liquidoKg: number | null;
  obs: string;
  /** Silo de destino lido da OBS ("Trincheira 1"); '' se não houver. */
  silo: string;
  /** Trecho da OBS que identifica o talhão ("CAU TALHÃO 02"); '' se não houver. */
  textoTalhao: string;
  /** Tem peso cheio e tara: a carga está completa. Sem isso, o caminhão ainda não voltou carregado. */
  completa: boolean;
}

type Celula = string | number | Date | null | undefined;

const num = (v: Celula): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const texto = (v: Celula): string => (v == null ? '' : v instanceof Date ? '' : String(v).trim());

const p2 = (n: number) => String(n).padStart(2, '0');

/** Data (célula de data) + hora (célula de hora do Excel) → "AAAA-MM-DDTHH:mm". As células chegam em UTC. */
function dataHora(data: Celula, hora: Celula): string | null {
  if (!(data instanceof Date)) return null;
  const d = `${data.getUTCFullYear()}-${p2(data.getUTCMonth() + 1)}-${p2(data.getUTCDate())}`;
  if (hora instanceof Date) return `${d}T${p2(hora.getUTCHours())}:${p2(hora.getUTCMinutes())}`;
  if (typeof hora === 'number') {
    // fração do dia
    const min = Math.round(hora * 24 * 60);
    return `${d}T${p2(Math.floor(min / 60) % 24)}:${p2(min % 60)}`;
  }
  const m = typeof hora === 'string' ? hora.match(/(\d{1,2}):(\d{2})/) : null;
  return m ? `${d}T${p2(Number(m[1]))}:${m[2]}` : `${d}T00:00`;
}

/** "TRINCHEIRA 01-CAU TALHÃO 02" → { silo: "Trincheira 1", talhao: "CAU TALHÃO 02" }. */
export function lerObs(obs: string): { silo: string; textoTalhao: string } {
  const o = obs.trim();
  const silo = o.match(/TRINCHEIRA\s*0*(\d+)/i);
  const tl = o.match(/([A-Z]{1,5})?\s*-?\s*(TALH[AÃ]O|TL)\s*([0-9]+\s*[A-Z]?)\b/i);
  return {
    silo: silo ? `Trincheira ${silo[1]}` : '',
    textoTalhao: tl ? `${tl[1] ? `${tl[1].toUpperCase()} ` : ''}TALHÃO ${tl[3].replace(/\s+/g, '').toUpperCase()}` : '',
  };
}

/** "TRINCHEIRA 01-CAU TALHÃO 02-MOTORISTA 4" → 4 (nº de cadastro do caminhão na relação de veículos). */
export function numeroMotoristaDaObs(obs?: string | null): number | null {
  const m = (obs ?? '').match(/MOTORISTA\s*0*(\d+)/i);
  return m ? Number(m[1]) : null;
}

/** "FERNANDO ALONSO 04161226128" → "Fernando Alonso" (sem CPF/números). */
export function nomeMotorista(bruto: string): string {
  const s = bruto.replace(/[\d.\-/]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s || /^SEM MOTORISTA$/i.test(s)) return '';
  const minusculas = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
  return s
    .toLowerCase()
    .split(' ')
    .map((p, i) => (i > 0 && minusculas.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

/**
 * Converte a planilha (cabeçalho + linhas) em cargas. Procura o cabeçalho pela coluna NR_ROMANEIO,
 * então funciona mesmo se o relatório vier com título ou colunas em outra ordem.
 */
export function lerLinhasBalanca(tabela: Celula[][]): LinhaBalanca[] {
  const iCab = tabela.findIndex((l) => l.some((c) => texto(c).toUpperCase() === 'NR_ROMANEIO'));
  if (iCab < 0) throw new Error('Não achei a coluna NR_ROMANEIO: este arquivo não parece ser a listagem de cargas da balança.');
  const cab = tabela[iCab].map((c) => texto(c).toUpperCase());
  const col = (nome: string) => cab.indexOf(nome);
  const v = (l: Celula[], nome: string): Celula => (col(nome) >= 0 ? l[col(nome)] : undefined);

  const resultado: LinhaBalanca[] = [];
  for (const l of tabela.slice(iCab + 1)) {
    const romaneio = texto(v(l, 'NR_ROMANEIO')) || String(num(v(l, 'NR_ROMANEIO')) ?? '');
    if (!romaneio) continue;
    const total = num(v(l, 'PESO_TOTAL'));
    const tara = num(v(l, 'PESO_TARA'));
    const liquido = num(v(l, 'PESO_LIQUIDO'));
    const obs = texto(v(l, 'OBS'));
    const { silo, textoTalhao } = lerObs(obs);
    const motorista = nomeMotorista(texto(v(l, 'MOTORISTA'))) || nomeMotorista(texto(v(l, 'NOMETRANSPORTADOR')));
    const pesadoEm =
      dataHora(v(l, 'DATA_ENTRADA'), v(l, 'HR_ENTRADA')) ?? dataHora(v(l, 'DATA_SAIDA'), v(l, 'HR_SAIDA')) ?? dataHora(v(l, 'DATA'), null) ?? '';
    resultado.push({
      romaneio,
      pesadoEm,
      placa: normalizarPlaca(texto(v(l, 'PLACATRANSPORTADOR'))),
      motoristaRelatorio: motorista,
      item: texto(v(l, 'ITEM')),
      totalKg: total,
      taraKg: tara,
      liquidoKg: liquido,
      obs,
      silo,
      textoTalhao,
      completa: total != null && tara != null && total > tara && (liquido ?? total - tara) > 0,
    });
  }
  return resultado;
}

/** Lê o .xlsx da balança escolhido pelo usuário. */
export async function lerArquivoBalanca(arquivo: File): Promise<LinhaBalanca[]> {
  return lerXlsxBalanca(await arquivo.arrayBuffer());
}

/** Lê o conteúdo de um .xlsx da balança (ExcelJS carregado sob demanda). */
export async function lerXlsxBalanca(conteudo: ArrayBuffer): Promise<LinhaBalanca[]> {
  const { Workbook } = (await carregarModulo(() => import('exceljs'))).default;
  const wb = new Workbook();
  await wb.xlsx.load(conteudo);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('A planilha está vazia.');
  const tabela: Celula[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const valores = (row.values as unknown[]).slice(1); // ExcelJS começa na coluna 1
    tabela.push(
      valores.map((c) => {
        if (c && typeof c === 'object' && !(c instanceof Date)) {
          const o = c as { result?: unknown; text?: unknown; richText?: { text: string }[] };
          if (o.result !== undefined) return o.result as Celula;
          if (o.richText) return o.richText.map((r) => r.text).join('');
          if (o.text !== undefined) return String(o.text);
        }
        return c as Celula;
      }),
    );
  });
  return lerLinhasBalanca(tabela);
}

export interface SugestaoTalhao {
  talhaoId: string;
  /** exata: mesmo local e mesmo número; conferir: só parecido (ex.: "TALHÃO 02" → "Talhão 2A"). */
  certeza: 'exata' | 'conferir';
}

/** Sugere o talhão do app para o texto da OBS ("CAU TALHÃO 02"). */
export function sugerirTalhao(textoTalhao: string, talhoes: Talhao[]): SugestaoTalhao | null {
  const m = semAcento(textoTalhao).toUpperCase().match(/^(?:([A-Z]{1,5})\s+)?TALHAO\s*0*([0-9]+[A-Z]?)$/);
  if (!m) return null;
  const [, sigla, numero] = m;
  // Mesmo local: sigla da fazenda do talhão ou sigla no fim do nome ("Talhão 2A - CAU").
  const local = (t: Talhao) => !sigla || siglaFazenda(t.fazenda ?? '', t.nome).toUpperCase() === sigla || new RegExp(`-\\s*${sigla}$`, 'i').test(t.nome.trim());
  const candidatos = talhoes.filter(local);
  const exata = candidatos.filter((t) => chaveNome(t.nome) === numero);
  if (exata.length === 1) return { talhaoId: exata[0].id, certeza: 'exata' };
  const parecidas = candidatos.filter((t) => chaveNome(t.nome).startsWith(numero) && /^[A-Z]?$/.test(chaveNome(t.nome).slice(numero.length)));
  if (parecidas.length === 1) return { talhaoId: parecidas[0].id, certeza: 'conferir' };
  return null;
}

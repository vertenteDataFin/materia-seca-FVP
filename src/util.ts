import { PARAMETROS_PADRAO, type Parametros } from './calc';

/** Converte texto digitado (aceita vírgula ou ponto decimal) em número; vazio → null. */
export function parseNum(s: string): number | null {
  const t = s.trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Formata número em pt-BR; null/NaN → "—". */
export function fmt(n: number | null | undefined, casas = 1): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** Número → texto editável (vírgula decimal). */
export function numParaTexto(n: number | null | undefined): string {
  return n == null ? '' : String(n).replace('.', ',');
}

export function hoje(): string {
  return new Date().toLocaleDateString('sv-SE'); // AAAA-MM-DD no fuso local
}

export function fmtData(iso: string): string {
  const [a, m, d] = iso.split('-');
  return d && m && a ? `${d}/${m}/${a}` : iso;
}

const CHAVE_PARAMETROS = 'silagem-ms:parametros';

export function lerParametros(): Parametros {
  try {
    const raw = localStorage.getItem(CHAVE_PARAMETROS);
    return raw ? { ...PARAMETROS_PADRAO, ...JSON.parse(raw) } : PARAMETROS_PADRAO;
  } catch {
    return PARAMETROS_PADRAO;
  }
}

export function salvarParametros(p: Parametros) {
  localStorage.setItem(CHAVE_PARAMETROS, JSON.stringify(p));
}

export function baixarArquivo(nome: string, conteudo: string, tipo: string) {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

export const CAPINS_COMUNS = [
  'Miyagi',
  'Mombaça',
  'Piatã',
  'Miyagi/Mombaça',
  'BRS Capiaçu',
  'Capim-elefante (Napier)',
  'Cameroon',
  'Tanzânia',
  'Zuri',
  'Massai',
  'Marandu',
  'Xaraés',
  'Tifton 85',
  'Sorgo forrageiro',
  'Milho',
];

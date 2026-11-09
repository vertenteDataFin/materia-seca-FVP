import type { Talhao } from './tipos';

export type Anel = [number, number][]; // [lng, lat]

export interface PoligonoKml {
  /** Nome original do Placemark. */
  nome: string;
  /** Nome sem o sufixo de atividade (" — CAPIM ..."). */
  nomeLimpo: string;
  /** Nome no padrão do app: "Talhão 18 - PD", "Pivô 1 - Conf". */
  nomeApp: string;
  fazenda: string;
  atividade: string;
  /** Capim derivado da atividade atual ('' se sem atividade). */
  capim: string;
  areaDeclaradaHa: number | null;
  areaCalculadaHa: number;
  aneis: Anel[];
}

const RAIO_TERRA = 6378137;
const rad = (g: number) => (g * Math.PI) / 180;

/** Área geodésica de um anel [lng, lat] em m² (mesmo método do Turf.js). */
export function areaAnelM2(anel: Anel): number {
  const n = anel.length;
  if (n < 3) return 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const p1 = anel[i];
    const p2 = anel[(i + 1) % n];
    const p3 = anel[(i + 2) % n];
    total += (rad(p3[0]) - rad(p1[0])) * Math.sin(rad(p2[1]));
  }
  return Math.abs((total * RAIO_TERRA * RAIO_TERRA) / 2);
}

function lerCoordenadas(texto: string | null | undefined): Anel {
  if (!texto) return [];
  return texto
    .trim()
    .split(/\s+/)
    .map((t) => t.split(',').map(Number))
    .filter((c) => c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]))
    .map((c) => [c[0], c[1]] as [number, number]);
}

const filho = (el: Element, nome: string) => Array.from(el.children).find((c) => c.localName === nome);

const PALAVRAS: Record<string, string> = {
  MIYAGI: 'Miyagi',
  MOMBACA: 'Mombaça',
  PIATA: 'Piatã',
  ZURI: 'Zuri',
  MASSAI: 'Massai',
  HUMIDICULA: 'Humidícola',
  MARANDU: 'Marandu',
  XARAES: 'Xaraés',
  TANZANIA: 'Tanzânia',
  CAPIACU: 'BRS Capiaçu',
};

/** Partes da atividade que não são capim (uso do solo junto ao capim) e saem do nome. */
const NAO_CAPIM = /COMPOSTAGEM/i;

export function semAcento(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** "CAPIM MOMBACA / COMPOSTAGEM" → "Mombaça" (compostagem não é capim); "SEM ATIVIDADE..." → "". */
export function capimDaAtividade(atividade: string): string {
  if (!atividade.trim() || /SEM ATIVIDADE/i.test(atividade)) return '';
  return atividade
    .split('/')
    .filter((parte) => !NAO_CAPIM.test(parte))
    .map((parte) => {
      const p = parte.replace(/CAPIM\s+/gi, '').trim();
      const chave = semAcento(p).toUpperCase();
      return PALAVRAS[chave] ?? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
    })
    .filter(Boolean)
    .join('/');
}

function numero(s: string): number | null {
  const t = s.includes('.') && s.includes(',') ? s.replace(/,/g, '') : s.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function lerKml(texto: string): PoligonoKml[] {
  const doc = new DOMParser().parseFromString(texto, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Arquivo KML inválido.');

  return Array.from(doc.getElementsByTagName('Placemark')).flatMap((pm) => {
    const nome = filho(pm, 'name')?.textContent?.trim() ?? '';
    const desc = filho(pm, 'description')?.textContent ?? '';
    let areaM2 = 0;
    const aneis: Anel[] = [];
    for (const pg of Array.from(pm.getElementsByTagName('Polygon'))) {
      const externo = lerCoordenadas(pg.getElementsByTagName('outerBoundaryIs')[0]?.getElementsByTagName('coordinates')[0]?.textContent);
      if (externo.length < 3) continue;
      aneis.push(externo);
      areaM2 += areaAnelM2(externo);
      for (const ib of Array.from(pg.getElementsByTagName('innerBoundaryIs'))) {
        areaM2 -= areaAnelM2(lerCoordenadas(ib.getElementsByTagName('coordinates')[0]?.textContent));
      }
    }
    if (!aneis.length) return [];

    const fazenda = (desc.match(/Fazenda:\s*([^<\n]+)/i)?.[1] ?? '').replace(/^Faz\.\s*/i, '').trim();
    const area = desc.match(/[ÁA]rea:\s*([\d.,]+)\s*ha/i)?.[1];
    const atividade = (desc.match(/Atividade hoje:\s*([^<\n]+)/i)?.[1] ?? '').trim();
    const nomeLimpo = nome.split(' — ')[0].trim();
    return [
      {
        nome,
        nomeLimpo,
        nomeApp: nomePadrao(nomeLimpo, fazenda),
        fazenda,
        atividade,
        capim: capimDaAtividade(atividade),
        areaDeclaradaHa: area ? numero(area) : null,
        areaCalculadaHa: areaM2 / 10000,
        aneis,
      },
    ];
  });
}

/** Siglas das fazendas usadas no sufixo do nome padrão. */
const SIGLA_FAZENDA: Record<string, string> = {
  PEDRA: 'PD',
  CONFINAMENTO: 'Conf',
  BRUMADO: 'BR',
  CASCATA: 'CA',
  CAUA: 'CAU',
  MARAJU: 'MA',
  'SANTA MARIA DO BRILHANTE': 'SMB',
  'SANTO ANTONIO': 'SA',
};

/** Sigla da fazenda: pelo nome da fazenda ou, na falta, pelo prefixo do nome do KML ("CONF - "). */
export function siglaFazenda(fazenda: string, nomeKml = ''): string {
  const porNome = SIGLA_FAZENDA[semAcento(fazenda).toUpperCase().replace(/\s+/g, ' ').trim()];
  if (porNome) return porNome;
  const prefixo = semAcento(nomeKml).toUpperCase().match(/^([A-Z]{1,5})\s*-\s*/)?.[1];
  if (prefixo) return prefixo.length <= 2 ? prefixo : prefixo.charAt(0) + prefixo.slice(1).toLowerCase();
  const f = fazenda.trim();
  return f ? f.slice(0, 2).toUpperCase() : '';
}

/**
 * Nome no padrão do app: "Talhão <número> - <sigla da fazenda>".
 * "PD - TALHAO 17 A" → "Talhão 17A - PD"; "PIVO 01" → "Pivô 1 - Conf"; "CONF - TALHAO C3" → "Talhão C3 - Conf".
 */
export function nomePadrao(nomeKml: string, fazenda: string): string {
  const sigla = siglaFazenda(fazenda, nomeKml);
  let s = semAcento(nomeKml).toUpperCase().split(' — ')[0].trim();
  s = s.replace(/^[A-Z]{1,5}\s*-\s*/, '').replace(/\s*-\s+[A-Z/ ]+$/, '').trim();
  let base: string;
  const pivo = s.match(/^PIVO\s*0*(\d+)$/);
  if (pivo) base = `Pivô ${pivo[1]}`;
  else {
    const corpo = s.replace(/^TALHAO\s*/, '').trim();
    const num = corpo.match(/^0*(\d+)\s*([A-Z])?$/);
    base = num ? `Talhão ${num[1]}${num[2] ?? ''}` : `Talhão ${corpo}`;
  }
  return sigla ? `${base} - ${sigla}` : base;
}

/**
 * Chave de comparação de nomes: remove prefixo de fazenda ("PD - ", "CONF - "), sufixos,
 * a palavra TALHÃO/TL e zeros à esquerda. "PD - TALHAO 17 A", "Talhão 17A - PD" e "TL 17A" → "17A"; "PIVO 01" e "Pivô 1 - Conf" → "PIVO1".
 */
export function chaveNome(nome: string): string {
  let s = semAcento(nome).toUpperCase().split(' — ')[0];
  s = s.replace(/^[A-Z]{1,5}\s*-\s*/, '');
  s = s.replace(/\s*-\s+.*$/, '');
  s = s.replace(/\b(TALHAO|TL)\b/g, '');
  s = s.replace(/\d+/g, (d) => String(Number(d)));
  return s.replace(/[^A-Z0-9]/g, '');
}

const normalizar = (s: string) => semAcento(s).toUpperCase().replace(/\s+/g, ' ').trim();

/** Sugere, para cada polígono (índice), o talhão existente correspondente. */
export function sugerirCorrespondencias(poligonos: PoligonoKml[], talhoes: Talhao[]): Map<number, string> {
  const resultado = new Map<number, string>();
  const usados = new Set<number>();
  for (const t of talhoes) {
    const livres = poligonos.map((p, i) => ({ p, i })).filter(({ i }) => !usados.has(i));
    let cand = livres.filter(({ p }) => normalizar(p.nomeLimpo) === normalizar(t.nome) || normalizar(p.nome) === normalizar(t.nome));
    if (cand.length !== 1) cand = livres.filter(({ p }) => chaveNome(p.nome) === chaveNome(t.nome));
    if (cand.length > 1) cand = cand.filter(({ p }) => p.capim !== ''); // desempate: talhão com atividade
    if (cand.length === 1) {
      resultado.set(cand[0].i, t.id);
      usados.add(cand[0].i);
    }
  }
  return resultado;
}

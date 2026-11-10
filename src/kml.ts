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

/** Palavras de capim que podem aparecer dentro do nome do Placemark ("TL 18 MIYAGI", "TL17A - MOMBAÇA"). */
const PALAVRAS_CAPIM = new RegExp(`\\b(CAPIM|${Object.keys(PALAVRAS).join('|')})\\b`, 'g');

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

/** Nome da pasta (Folder) que contém o Placemark, sem o resumo entre parênteses. */
function pastaDe(pm: Element): string {
  for (let el = pm.parentElement; el; el = el.parentElement) {
    if (el.localName === 'Folder') return (filho(el, 'name')?.textContent ?? '').replace(/\s*\(.*\)\s*$/, '').trim();
  }
  return '';
}

/**
 * Lê os polígonos do KML. A atividade vem, nesta ordem, do sufixo do nome ("… — CAPIM MIYAGI"), da pasta
 * ("CAPIM MOMBACA") ou da descrição ("Atividade hoje:") — polígonos desenhados à mão no Google Earth só têm
 * o nome e a pasta. Em seguida `consolidar` herda a fazenda de vizinhos, junta partes do mesmo talhão com o
 * mesmo capim e diferencia o nome quando um talhão foi dividido entre capins ("Talhão 17A Miyagi - PD").
 */
export function lerKml(texto: string): PoligonoKml[] {
  const doc = new DOMParser().parseFromString(texto, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Arquivo KML inválido.');

  const brutos = Array.from(doc.getElementsByTagName('Placemark')).flatMap((pm) => {
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
    const [nomeLimpo, ...sufixo] = nome.split(' — ').map((s) => s.trim());
    const pasta = pastaDe(pm);
    const atividade =
      sufixo.join(' — ') ||
      (/^(CAPIM|SEM ATIVIDADE)/i.test(pasta) ? pasta : '') ||
      (desc.match(/Atividade hoje:\s*([^<\n]+)/i)?.[1] ?? '').trim();
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
  return consolidar(brutos);
}

function centro(p: PoligonoKml): [number, number] {
  const pts = p.aneis.flat();
  return [pts.reduce((s, c) => s + c[0], 0) / pts.length, pts.reduce((s, c) => s + c[1], 0) / pts.length];
}

function consolidar(polys: PoligonoKml[]): PoligonoKml[] {
  // Polígono sem descrição (desenhado à mão): herda a fazenda do polígono mais próximo que tem uma.
  const comFazenda = polys.filter((p) => p.fazenda);
  for (const p of polys) {
    if (p.fazenda || !comFazenda.length) continue;
    const [x, y] = centro(p);
    const vizinho = comFazenda
      .map((q) => ({ q, d: Math.hypot(centro(q)[0] - x, centro(q)[1] - y) }))
      .sort((a, b) => a.d - b.d)[0].q;
    p.fazenda = vizinho.fazenda;
  }
  // Partes do mesmo talhão (mesma fazenda, mesmo número) com o mesmo capim viram um polígono só.
  const grupos = new Map<string, PoligonoKml>();
  for (const p of polys) {
    const chave = `${siglaFazenda(p.fazenda, p.nome)}|${chaveTalhao(p.nome)}|${p.capim}`;
    const g = grupos.get(chave);
    if (!g) grupos.set(chave, { ...p, aneis: [...p.aneis] });
    else {
      g.aneis.push(...p.aneis);
      g.areaCalculadaHa += p.areaCalculadaHa;
      g.areaDeclaradaHa ??= p.areaDeclaradaHa;
    }
  }
  // Mesmo talhão dividido entre capins diferentes: o capim entra no nome para distinguir as partes.
  const porTalhao = new Map<string, number>();
  for (const chave of grupos.keys()) {
    const t = chave.slice(0, chave.lastIndexOf('|'));
    porTalhao.set(t, (porTalhao.get(t) ?? 0) + 1);
  }
  return [...grupos.entries()].map(([chave, g]) => ({
    ...g,
    nomeApp: nomePadrao(g.nomeLimpo, g.fazenda, (porTalhao.get(chave.slice(0, chave.lastIndexOf('|'))) ?? 0) > 1 ? g.capim : ''),
  }));
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
 * Nome no padrão do app: "Talhão <número>[ <qualificador>] - <sigla da fazenda>".
 * "PD - TALHAO 17 A" → "Talhão 17A - PD"; "PIVO 01" → "Pivô 1 - Conf"; "CONF - TALHAO C3" → "Talhão C3 - Conf";
 * "TL17A - MOMBAÇA" com qualificador "Mombaça" → "Talhão 17A Mombaça - PD".
 */
export function nomePadrao(nomeKml: string, fazenda: string, qualificador = ''): string {
  const sigla = siglaFazenda(fazenda, nomeKml);
  let s = semAcento(nomeKml).toUpperCase().split(' — ')[0].trim();
  s = s
    .replace(/^[A-Z]{1,5}\s*-\s*/, '')
    .replace(PALAVRAS_CAPIM, ' ')
    .replace(/\s*-\s*[A-Z/][A-Z/ ]*$/, '')
    .replace(/[\s-]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  let base: string;
  const pivo = s.match(/^PIVO\s*0*(\d+)$/);
  if (pivo) base = `Pivô ${pivo[1]}`;
  else {
    const corpo = s.replace(/^(TALHAO|TL)\s*/, '').trim();
    const num = corpo.match(/^0*(\d+)\s*([A-Z])?$/);
    base = num ? `Talhão ${num[1]}${num[2] ?? ''}` : `Talhão ${corpo}`;
  }
  if (qualificador) base += ` ${qualificador}`;
  return sigla ? `${base} - ${sigla}` : base;
}

/**
 * Chave de comparação de nomes: remove prefixo de fazenda ("PD - ", "CONF - "), sufixos,
 * a palavra TALHÃO/TL e zeros à esquerda. "PD - TALHAO 17 A", "Talhão 17A - PD" e "TL 17A" → "17A"; "PIVO 01" e "Pivô 1 - Conf" → "PIVO1".
 * O capim no nome é mantido ("Talhão 17A Miyagi - PD" → "17AMIYAGI"), para partes do mesmo talhão não se confundirem.
 */
export function chaveNome(nome: string): string {
  let s = semAcento(nome).toUpperCase().split(' — ')[0];
  s = s.replace(/^[A-Z]{1,5}\s*-\s*/, '');
  s = s.replace(/\s*-\s*[A-Z/][A-Z/ ]*$/, '');
  s = s.replace(/\bTALHAO\b|\bTL(?=\s|\d|$)/g, ''); // "TL 17A" e "TL17A"
  s = s.replace(/\d+/g, (d) => String(Number(d)));
  return s.replace(/[^A-Z0-9]/g, '');
}

/** Como `chaveNome`, mas ignorando o capim: "TL 18 MIYAGI", "TL17A - MOMBAÇA" e "Talhão 17A Miyagi - PD" → "18", "17A", "17A". */
export function chaveTalhao(nome: string): string {
  return chaveNome(semAcento(nome).toUpperCase().replace(PALAVRAS_CAPIM, ' '));
}

const normalizar = (s: string) => semAcento(s).toUpperCase().replace(/\s+/g, ' ').trim();

const mesmoCapim = (a: string, b: string) => normalizar(a) === normalizar(b);

/** Sugere, para cada polígono (índice), o talhão existente correspondente. */
export function sugerirCorrespondencias(poligonos: PoligonoKml[], talhoes: Talhao[]): Map<number, string> {
  const resultado = new Map<number, string>();
  const usados = new Set<number>();
  for (const t of talhoes) {
    const livres = poligonos.map((p, i) => ({ p, i })).filter(({ i }) => !usados.has(i));
    let cand = livres.filter(({ p }) => normalizar(p.nomeApp) === normalizar(t.nome));
    if (cand.length !== 1) cand = livres.filter(({ p }) => normalizar(p.nomeLimpo) === normalizar(t.nome) || normalizar(p.nome) === normalizar(t.nome));
    if (cand.length !== 1) cand = livres.filter(({ p }) => chaveNome(p.nome) === chaveNome(t.nome));
    if (cand.length > 1) {
      // Talhão dividido entre capins: fica com a parte do mesmo capim do cadastro.
      const doCapim = cand.filter(({ p }) => p.capim && mesmoCapim(p.capim, t.capim));
      if (doCapim.length === 1) cand = doCapim;
    }
    if (cand.length > 1) cand = cand.filter(({ p }) => p.capim !== ''); // desempate: talhão com atividade
    if (cand.length === 1) {
      resultado.set(cand[0].i, t.id);
      usados.add(cand[0].i);
    }
  }
  return resultado;
}

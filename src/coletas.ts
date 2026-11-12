import { dadosAtuais, repositorio } from './dados';
import type { Amostra, Coleta, Novo } from './tipos';
import { hoje, parseNum } from './util';

export const CHAVE_RESP = 'silagem-ms:ultimo-responsavel';
export const CHAVE_QUADRO = 'silagem-ms:ultimo-quadro';

/** Cria uma coleta para o talhão com data de hoje e os últimos responsável/quadro usados. Devolve o id. */
export function criarColeta(talhaoId: string, extra: Partial<Novo<Coleta>> = {}): string {
  const quadro = parseNum(localStorage.getItem(CHAVE_QUADRO) ?? '') ?? 1;
  return repositorio().adicionar('coletas', {
    talhaoId,
    data: hoje(),
    responsavel: localStorage.getItem(CHAVE_RESP) ?? '',
    areaAmostralM2: quadro > 0 ? quadro : 1,
    observacoes: '',
    criadoEm: new Date().toISOString(),
    ...extra,
  });
}

export function lembrarUltimos(responsavel: string, quadro: number) {
  localStorage.setItem(CHAVE_RESP, responsavel.trim());
  localStorage.setItem(CHAVE_QUADRO, String(quadro));
}

/** Adiciona um ponto (amostra) à coleta com o próximo número; posição opcional. Devolve o id. */
export function adicionarPonto(coletaId: string, pos: Pick<Amostra, 'lat' | 'lng' | 'precisaoM' | 'capturadoEm' | 'origemPos'> = {}): string {
  const existentes = dadosAtuais().amostras.filter((a) => a.coletaId === coletaId);
  const ponto = existentes.reduce((m, a) => Math.max(m, a.ponto), 0) + 1;
  return repositorio().adicionar('amostras', { coletaId, ponto, pesoVerdeKg: null, pesoUmidoG: null, pesoSecoG: null, ...pos });
}

/** Define (ou corrige) a posição de um ponto já existente, registrando se veio do GPS ou de um toque no mapa. */
export function posicionarPonto(
  amostraId: string,
  pos: Pick<Amostra, 'lat' | 'lng'> & Partial<Pick<Amostra, 'precisaoM' | 'capturadoEm'>>,
  origem: NonNullable<Amostra['origemPos']>,
) {
  repositorio().atualizar('amostras', amostraId, {
    lat: pos.lat,
    lng: pos.lng,
    precisaoM: pos.precisaoM ?? null,
    capturadoEm: pos.capturadoEm ?? new Date().toISOString(),
    origemPos: origem,
  });
}

/** Remove um ponto e renumera os restantes (1, 2, 3…) para não ficar buraco na sequência. */
export function removerPonto(amostraId: string) {
  const d = dadosAtuais();
  const a = d.amostras.find((x) => x.id === amostraId);
  if (!a) return;
  const restantes = d.amostras.filter((x) => x.coletaId === a.coletaId && x.id !== amostraId).sort((x, y) => x.ponto - y.ponto);
  repositorio().lote([
    { tipo: 'remover', colecao: 'amostras', id: amostraId },
    ...restantes
      .map((r, i) => ({ r, n: i + 1 }))
      .filter(({ r, n }) => r.ponto !== n)
      .map(({ r, n }) => ({ tipo: 'atualizar' as const, colecao: 'amostras' as const, id: r.id, dados: { ponto: n } })),
  ]);
}

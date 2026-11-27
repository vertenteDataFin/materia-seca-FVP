import { dentroDaFaixa, FAIXAS_IDEAIS_PENN, PENEIRAS, msColheita, pennState } from './amostragemColheita';
import { fmtSaida } from './colheita';
import { textoFonteFdn, type FaixaPef, type PeFdn } from './fdn';
import type { AmostraColheita } from './tipos';

/**
 * "Print" de uma amostra de caminhão, em PNG, para mandar pelo WhatsApp:
 * os 4 cards do Penn State (% de cada peneira, verde dentro / vermelho fora da faixa ideal),
 * MS, FDN e FDN efetiva com o fator de efetividade física usado.
 */
export interface DadosImagemAmostra {
  amostra: AmostraColheita;
  talhao: string;
  capim: string;
  pe: PeFdn;
  pef: FaixaPef;
  /** Nº do caminhão no cadastro de veículos (aparece ao lado da placa). */
  numeroCaminhao?: number | null;
}

const LARGURA = 1080;
const MARGEM = 48;
const FONTE = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const COR = {
  fundo: '#f4f6f1',
  cartao: '#ffffff',
  verde: '#2e6b34',
  verdeClaro: '#e3f1de',
  vermelho: '#b3261e',
  vermelhoClaro: '#fbe4e1',
  texto: '#1d2a1f',
  mudo: '#66706a',
  borda: '#d9dfd5',
};
const ROTULOS_PENEIRA = ['P 19 mm', 'P 8 mm', 'P 4 mm', 'Fundo'];

const num = (v: number | null | undefined, casas = 1) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(casas).replace('.', ','));

function retangulo(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fundo: string, borda?: string, espessura = 2) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fundo;
  ctx.fill();
  if (borda) {
    ctx.lineWidth = espessura;
    ctx.strokeStyle = borda;
    ctx.stroke();
  }
}

function texto(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, tam: number, cor: string, peso = 400, alinhar: CanvasTextAlign = 'left', larguraMax?: number) {
  ctx.font = `${peso} ${tam}px ${FONTE}`;
  ctx.fillStyle = cor;
  ctx.textAlign = alinhar;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, y, larguraMax);
}

/** Desenha a imagem e devolve a altura usada (a 1ª passada só mede). */
function desenhar(ctx: CanvasRenderingContext2D, d: DadosImagemAmostra): number {
  const a = d.amostra;
  const ps = pennState(a);
  const ms = msColheita(a);
  const interno = LARGURA - 2 * MARGEM;

  ctx.fillStyle = COR.fundo;
  ctx.fillRect(0, 0, LARGURA, 4000);

  // Cabeçalho
  retangulo(ctx, 0, 0, LARGURA, 170, 0, COR.verde);
  texto(ctx, 'COLETA DE COLHEITA', MARGEM, 58, 26, '#cfe6cc', 600);
  texto(ctx, a.codigo ?? a.placa, MARGEM, 128, 60, '#ffffff', 700);
  texto(ctx, 'Silagem MS', LARGURA - MARGEM, 58, 26, '#cfe6cc', 600, 'right');
  texto(ctx, fmtSaida(a.coletadaEm), LARGURA - MARGEM, 128, 32, '#ffffff', 600, 'right');

  // Dados da coleta: quadro com rótulos, 2 colunas
  const [dataIso, horaIso] = a.coletadaEm.split('T');
  const [ano, mes, dia] = (dataIso ?? '').split('-');
  const info: [string, string][] = [
    ['Data da coleta', dia ? `${dia}/${mes}/${ano}` : '—'],
    ['Hora', horaIso ? horaIso.slice(0, 5) : '—'],
    ['Talhão', d.talhao],
    ['Capim', d.capim || '—'],
    ['Silo de destino', a.silo || '—'],
    [d.numeroCaminhao != null ? 'Caminhão (nº · placa)' : 'Caminhão (placa)', d.numeroCaminhao != null ? `${d.numeroCaminhao} · ${a.placa || '—'}` : a.placa || '—'],
    ['Motorista', a.motorista || '—'],
    ['Amostrado por', a.responsavel || '—'],
  ];
  let y = 206;
  const linhasInfo = Math.ceil(info.length / 2);
  const hLinha = 84;
  const hInfo = 24 + linhasInfo * hLinha + (a.observacoes ? 70 : 0);
  retangulo(ctx, MARGEM, y, interno, hInfo, 18, COR.cartao, COR.borda, 2);
  const wCol = (interno - 56) / 2;
  info.forEach(([rot, val], i) => {
    const x = MARGEM + 28 + (i % 2) * wCol;
    const yl = y + 24 + Math.floor(i / 2) * hLinha;
    texto(ctx, rot.toUpperCase(), x, yl + 26, 20, COR.mudo, 600, 'left', wCol - 20);
    texto(ctx, val, x, yl + 62, 30, COR.texto, 600, 'left', wCol - 20);
  });
  if (a.observacoes) {
    const yl = y + 24 + linhasInfo * hLinha;
    texto(ctx, 'OBSERVAÇÕES', MARGEM + 28, yl + 20, 20, COR.mudo, 600);
    texto(ctx, a.observacoes, MARGEM + 28, yl + 54, 26, COR.texto, 400, 'left', interno - 56);
  }
  y += hInfo;

  // Penn State: 4 cards
  y += 64;
  texto(ctx, 'PENN STATE — % RETIDA POR PENEIRA', MARGEM, y, 26, COR.mudo, 700);
  if (ps) texto(ctx, `total ${num(ps.totalG, 0)} g`, LARGURA - MARGEM, y, 26, COR.mudo, 400, 'right');
  y += 24;
  const gap = 20;
  const wc = (interno - 3 * gap) / 4;
  const hc = 250;
  PENEIRAS.forEach((p, i) => {
    const x = MARGEM + i * (wc + gap);
    const pct = ps ? ps.pct[i] : null;
    // sem meta (8 e 4 mm): card neutro, número em destaque na cor do texto
    const ok = pct == null ? null : dentroDaFaixa(i, pct);
    const cor = pct == null ? COR.mudo : ok == null ? COR.texto : ok ? COR.verde : COR.vermelho;
    const fundo = ok == null ? COR.cartao : ok ? COR.verdeClaro : COR.vermelhoClaro;
    retangulo(ctx, x, y, wc, hc, 18, fundo, ok == null ? COR.borda : cor, ok == null ? 2 : 3);
    const cx = x + wc / 2;
    texto(ctx, ROTULOS_PENEIRA[i], cx, y + 48, 28, COR.texto, 600, 'center', wc - 20);
    texto(ctx, pct == null ? '—' : `${num(pct)}%`, cx, y + 130, 62, cor, 800, 'center', wc - 16);
    const meta = FAIXAS_IDEAIS_PENN[i];
    texto(ctx, meta ? `meta ${meta.rotulo}` : 'sem meta', cx, y + 182, 26, COR.mudo, 600, 'center', wc - 16);
    const g = a[p.campo];
    texto(ctx, `${g == null ? '—' : num(g, 0)} g`, cx, y + 222, 24, COR.mudo, 400, 'center', wc - 16);
  });
  y += hc + 64;

  // MS, FDN e FDN efetiva
  texto(ctx, 'MATÉRIA SECA E FIBRA', MARGEM, y, 26, COR.mudo, 700);
  y += 24;
  const w3 = (interno - 2 * gap) / 3;
  const h3 = 210;
  const fonte = textoFonteFdn(d.pe, d.capim);
  const valores: { rotulo: string; valor: string; sub: string; destaque?: boolean }[] = [
    { rotulo: 'MS', valor: ms == null ? '—' : `${num(ms)}%`, sub: ms == null ? 'aguardando o laboratório' : `seco ${num(a.pesoSecoG, 0)} g de ${num(a.pesoUmidoG, 0)} g de MN` },
    { rotulo: 'FDN', valor: d.pe.fdnPct == null ? '—' : `${num(d.pe.fdnPct)}%`, sub: d.pe.fdnPct == null ? 'sem FDN' : `% da MS · ${fonte}` },
  ];
  const pef8 = d.pe.pef8 == null ? null : d.pe.pef8 * 100;
  const pef4 = d.pe.pef4 == null ? null : d.pe.pef4 * 100;
  if (d.pef === 'ambos') {
    valores.push({ rotulo: 'FDN efetiva (FDNfe)', valor: `${num(d.pe.peFdn8)} / ${num(d.pe.peFdn4)}%`, sub: '% da MS · > 8 mm / > 4 mm', destaque: true });
  } else {
    const v = d.pef === '8' ? d.pe.peFdn8 : d.pe.peFdn4;
    valores.push({ rotulo: 'FDN efetiva (FDNfe)', valor: v == null ? '—' : `${num(v)}%`, sub: '% da MS', destaque: true });
  }
  valores.forEach((v, i) => {
    const x = MARGEM + i * (w3 + gap);
    retangulo(ctx, x, y, w3, h3, 18, v.destaque ? COR.verde : COR.cartao, v.destaque ? COR.verde : COR.borda, 2);
    const cx = x + w3 / 2;
    texto(ctx, v.rotulo, cx, y + 50, 28, v.destaque ? '#cfe6cc' : COR.mudo, 600, 'center', w3 - 20);
    texto(ctx, v.valor, cx, y + 132, d.pef === 'ambos' && v.destaque ? 50 : 64, v.destaque ? '#ffffff' : COR.texto, 800, 'center', w3 - 20);
    texto(ctx, v.sub, cx, y + 180, 24, v.destaque ? '#cfe6cc' : COR.mudo, 400, 'center', w3 - 20);
  });
  y += h3 + 60;

  // Fator de efetividade física usado (uma linha)
  const partesPef: string[] = [];
  if (d.pef !== '4') partesPef.push(`pef > 8 mm = ${num(pef8)}%`);
  if (d.pef !== '8') partesPef.push(`pef > 4 mm = ${num(pef4)}%`);
  texto(ctx, `Fator de efetividade física considerado: ${partesPef.join(' · ')}`, MARGEM, y, 28, COR.texto, 600, 'left', interno);
  return y + MARGEM;
}

export async function gerarImagemAmostra(d: DadosImagemAmostra): Promise<Blob> {
  const medida = document.createElement('canvas').getContext('2d');
  if (!medida) throw new Error('Este navegador não gera imagens.');
  medida.canvas.width = LARGURA;
  medida.canvas.height = 4000;
  const altura = Math.ceil(desenhar(medida, d));
  const canvas = document.createElement('canvas');
  canvas.width = LARGURA;
  canvas.height = altura;
  desenhar(canvas.getContext('2d')!, d);
  return new Promise((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error('Falha ao gerar a imagem.'))), 'image/png'));
}

/** No celular abre o compartilhar (WhatsApp etc.); no computador (ou sem suporte) baixa o PNG. */
export async function compartilharOuBaixarImagem(blob: Blob, nome: string, titulo: string): Promise<void> {
  const arquivo = new File([blob], nome, { type: 'image/png' });
  const toque = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (toque && navigator.canShare?.({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], title: titulo });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return; // a pessoa fechou o compartilhar
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

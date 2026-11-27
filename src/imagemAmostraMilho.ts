import { fmtSaida } from './colheita';
import { granulometriaMilho, METAS_MILHO, msMilho, PENEIRAS_MILHO } from './milhoReidratado';
import type { AmostraMilho } from './tipos';

/**
 * "Print" de uma amostra de silagem de milho reidratado, em PNG, para mandar pelo WhatsApp.
 * Mesmo modelo do print da amostra de caminhão (capim), com o cabeçalho e o destaque em amarelo:
 * % retida em cada peneira, as 3 metas (verde dentro / vermelho fora) e a MS; as fotos escolhidas na hora vão ao lado.
 */
const LARGURA = 1080;
const MARGEM = 48;
const FONTE = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const COR = {
  fundo: '#f6f5ef',
  cartao: '#ffffff',
  amarelo: '#f2b705',
  amareloTexto: '#3b2c00',
  amareloSuave: '#6b5000',
  verde: '#2e6b34',
  verdeClaro: '#e3f1de',
  vermelho: '#b3261e',
  vermelhoClaro: '#fbe4e1',
  texto: '#1d2a1f',
  mudo: '#66706a',
  borda: '#ddd9cc',
};

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
function desenhar(ctx: CanvasRenderingContext2D, a: AmostraMilho): number {
  const g = granulometriaMilho(a);
  const ms = msMilho(a);
  const interno = LARGURA - 2 * MARGEM;
  const gap = 20;
  // Com fotos, a imagem é mais larga (fotos ao lado): fundo e cabeçalho ocupam a largura toda.
  const total = ctx.canvas.width;

  ctx.fillStyle = COR.fundo;
  ctx.fillRect(0, 0, total, ctx.canvas.height);

  // Cabeçalho amarelo
  retangulo(ctx, 0, 0, total, 170, 0, COR.amarelo);
  texto(ctx, 'SILAGEM DE MILHO REIDRATADO', MARGEM, 58, 26, COR.amareloSuave, 700);
  texto(ctx, a.codigo ?? a.silo, MARGEM, 128, 60, COR.amareloTexto, 800);
  texto(ctx, 'Silagem MS', total - MARGEM, 58, 26, COR.amareloSuave, 600, 'right');
  texto(ctx, fmtSaida(a.coletadaEm), total - MARGEM, 128, 32, COR.amareloTexto, 700, 'right');

  // Dados da amostra
  const [dataIso, horaIso] = a.coletadaEm.split('T');
  const [ano, mes, dia] = (dataIso ?? '').split('-');
  const info: [string, string][] = [
    ['Data da coleta', dia ? `${dia}/${mes}/${ano}` : '—'],
    ['Hora', horaIso ? horaIso.slice(0, 5) : '—'],
    ['Silo', a.silo || '—'],
    ['Amostrado por', a.responsavel || '—'],
  ];
  let y = 206;
  const hLinha = 84;
  const linhasInfo = Math.ceil(info.length / 2);
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

  // Granulometria: 5 cards (% e g de cada peneira)
  y += 64;
  texto(ctx, 'GRANULOMETRIA — % RETIDA POR PENEIRA', MARGEM, y, 26, COR.mudo, 700);
  if (g) texto(ctx, `total ${num(g.totalG, 0)} g`, LARGURA - MARGEM, y, 26, COR.mudo, 400, 'right');
  y += 24;
  const n = PENEIRAS_MILHO.length;
  const wc = (interno - (n - 1) * 16) / n;
  const hc = 200;
  PENEIRAS_MILHO.forEach((p, i) => {
    const x = MARGEM + i * (wc + 16);
    const pct = g ? g.pct[i] : null;
    retangulo(ctx, x, y, wc, hc, 18, COR.cartao, COR.borda, 2);
    const cx = x + wc / 2;
    texto(ctx, p.rotulo === 'Fundo' ? 'Fundo' : `P ${p.rotulo}`, cx, y + 46, 26, COR.texto, 600, 'center', wc - 16);
    texto(ctx, pct == null ? '—' : `${num(pct)}%`, cx, y + 124, 50, pct == null ? COR.mudo : COR.texto, 800, 'center', wc - 12);
    const peso = a[p.campo];
    texto(ctx, `${peso == null ? '—' : num(peso, 0)} g`, cx, y + 172, 24, COR.mudo, 400, 'center', wc - 12);
  });
  y += hc + 64;

  // Metas: 3 cards, verde dentro / vermelho fora
  texto(ctx, 'METAS', MARGEM, y, 26, COR.mudo, 700);
  y += 24;
  const w3 = (interno - 2 * gap) / 3;
  const h3 = 220;
  METAS_MILHO.forEach((meta, i) => {
    const r = g?.metas[i];
    const x = MARGEM + i * (w3 + gap);
    const cor = !r ? COR.mudo : r.ok ? COR.verde : COR.vermelho;
    retangulo(ctx, x, y, w3, h3, 18, !r ? COR.cartao : r.ok ? COR.verdeClaro : COR.vermelhoClaro, !r ? COR.borda : cor, !r ? 2 : 3);
    const cx = x + w3 / 2;
    texto(ctx, meta.rotulo, cx, y + 50, 28, COR.texto, 600, 'center', w3 - 20);
    texto(ctx, r ? `${num(r.pct)}%` : '—', cx, y + 134, 62, cor, 800, 'center', w3 - 20);
    texto(ctx, `meta ${meta.texto}`, cx, y + 186, 26, COR.mudo, 600, 'center', w3 - 20);
  });
  y += h3 + 64;

  // MS em destaque (amarelo)
  texto(ctx, 'MATÉRIA SECA', MARGEM, y, 26, COR.mudo, 700);
  y += 24;
  const hMs = 200;
  retangulo(ctx, MARGEM, y, interno, hMs, 18, COR.amarelo, COR.amarelo, 2);
  texto(ctx, 'MS', LARGURA / 2, y + 50, 28, COR.amareloSuave, 700, 'center');
  texto(ctx, ms == null ? '—' : `${num(ms)}%`, LARGURA / 2, y + 128, 64, COR.amareloTexto, 800, 'center');
  texto(
    ctx,
    ms == null ? 'aguardando a aferição' : `seco ${num(a.pesoSecoG, 0)} g de ${num(a.pesoUmidoG, 0)} g de MN`,
    LARGURA / 2,
    y + 172,
    24,
    COR.amareloSuave,
    500,
    'center',
  );
  return y + hMs + MARGEM;
}

/** Largura máxima da área de fotos ao lado do relatório. */
const LARGURA_MAX_FOTOS = 2400;
const TOPO_FOTOS = 206;
const GAP_FOTOS = 20;

interface Retangulo {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Arruma as fotos em linhas (cada uma com a sua proporção, sem sobra entre elas) na altura do relatório,
 * escolhendo quantas por linha deixa as fotos maiores. Posições relativas ao canto da área de fotos.
 */
function arrumarFotos(fotos: ImageBitmap[], alturaUtil: number): { rets: Retangulo[]; largura: number } {
  // Prefere arrumações em que nenhuma linha precisou encolher (sem faixa vazia em cima e embaixo); entre elas, a de fotos maiores.
  let melhor = { rets: [] as Retangulo[], largura: 0, area: -1, cabe: false };
  for (let porLinha = 1; porLinha <= fotos.length; porLinha++) {
    const linhas = Math.ceil(fotos.length / porLinha);
    const hLinha = (alturaUtil - (linhas - 1) * GAP_FOTOS) / linhas;
    const rets: Retangulo[] = [];
    let largura = 0;
    let area = 0;
    let cabe = true;
    for (let l = 0; l < linhas; l++) {
      const daLinha = fotos.slice(l * porLinha, (l + 1) * porLinha);
      const gaps = (daLinha.length - 1) * GAP_FOTOS;
      const natural = daLinha.reduce((s, f) => s + (hLinha * f.width) / f.height, 0);
      const e = Math.min(1, (LARGURA_MAX_FOTOS - gaps) / natural);
      if (e < 1) cabe = false;
      const h = hLinha * e;
      let x = 0;
      for (const f of daLinha) {
        const w = (h * f.width) / f.height;
        rets.push({ x, y: l * (hLinha + GAP_FOTOS) + (hLinha - h) / 2, w, h });
        x += w + GAP_FOTOS;
        area += w * h;
      }
      largura = Math.max(largura, x - GAP_FOTOS);
    }
    if ((cabe && !melhor.cabe) || (cabe === melhor.cabe && area > melhor.area)) melhor = { rets, largura, area, cabe };
  }
  return melhor;
}

/** Fotos ao lado do relatório, do cartão de dados até o fim. */
function desenharFotos(ctx: CanvasRenderingContext2D, fotos: ImageBitmap[], rets: Retangulo[], x0: number) {
  fotos.forEach((foto, i) => {
    const { w, h } = rets[i];
    const x = x0 + rets[i].x;
    const y = TOPO_FOTOS + rets[i].y;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 18);
    ctx.clip();
    ctx.drawImage(foto, x, y, w, h);
    ctx.restore();
  });
}

export async function gerarImagemAmostraMilho(a: AmostraMilho, fotos: ImageBitmap[] = []): Promise<Blob> {
  const medida = document.createElement('canvas').getContext('2d');
  if (!medida) throw new Error('Este navegador não gera imagens.');
  medida.canvas.width = LARGURA;
  medida.canvas.height = 4000;
  const altura = Math.ceil(desenhar(medida, a));
  // Fotos (só no print; não ficam gravadas) à direita, na altura do relatório.
  const arrumacao = fotos.length ? arrumarFotos(fotos, altura - TOPO_FOTOS - MARGEM) : null;
  const x0 = LARGURA - MARGEM + 32;
  const canvas = document.createElement('canvas');
  canvas.width = arrumacao ? Math.ceil(x0 + arrumacao.largura + MARGEM) : LARGURA;
  canvas.height = altura;
  const ctx = canvas.getContext('2d')!;
  desenhar(ctx, a);
  if (arrumacao) desenharFotos(ctx, fotos, arrumacao.rets, x0);
  return new Promise((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error('Falha ao gerar a imagem.'))), 'image/png'));
}

import { producaoPonto, resumoColeta, statusMS, teorMS, type Parametros, type ResumoColeta } from './calc';
import { amostrasPorColeta } from './dados';
import { nomeComSigla } from './MapaTalhoes';
import { compararNomes, type Dados } from './tipos';

/**
 * "Print" das amostragens de campo de um dia, em PNG, para mandar pelo WhatsApp:
 * um bloco por talhão amostrado (MV, MS, MS/ha e CV da coleta, com a MS na cor da faixa ideal)
 * e os pontos da coleta.
 */
export interface ColetaDoDia {
  talhao: string;
  capim: string;
  responsavel: string;
  quadroM2: number;
  r: ResumoColeta;
  status: ReturnType<typeof statusMS>;
  pontos: { ponto: number; kgM2: number | null; tMVha: number | null; msPct: number | null }[];
}

/** Datas (AAAA-MM-DD) com coleta de campo, da mais recente para a mais antiga. */
export function datasComColeta(d: Pick<Dados, 'coletas'>): string[] {
  return [...new Set(d.coletas.map((c) => c.data))].sort().reverse();
}

/** Coletas de campo do dia, uma por talhão (em ordem de nome), com o resumo e os pontos. */
export function coletasDoDia(data: string, d: Pick<Dados, 'talhoes' | 'coletas' | 'amostras'>, p: Parametros): ColetaDoDia[] {
  const porId = new Map(d.talhoes.map((t) => [t.id, t]));
  const porColeta = amostrasPorColeta(d.amostras);
  return d.coletas
    .filter((c) => c.data === data && porId.has(c.talhaoId))
    .sort((a, b) => compararNomes(porId.get(a.talhaoId)!.nome, porId.get(b.talhaoId)!.nome) || (a.criadoEm ?? '').localeCompare(b.criadoEm ?? ''))
    .map((c) => {
      const t = porId.get(c.talhaoId)!;
      const amostras = porColeta.get(c.id) ?? [];
      const r = resumoColeta(c, amostras);
      return {
        talhao: nomeComSigla(t.nome, t.fazenda),
        capim: t.capim,
        responsavel: c.responsavel,
        quadroM2: c.areaAmostralM2,
        r,
        status: statusMS(r.msPct, p),
        pontos: [...amostras]
          .sort((a, b) => a.ponto - b.ponto)
          .map((a) => {
            const kg = producaoPonto(a, c.areaAmostralM2);
            return { ponto: a.ponto, kgM2: kg, tMVha: kg == null ? null : kg * 10, msPct: teorMS(a) };
          }),
      };
    })
    .filter((x) => x.pontos.length > 0);
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
  amarelo: '#8a6100',
  amareloClaro: '#fdf3d6',
  texto: '#1d2a1f',
  mudo: '#66706a',
  borda: '#d9dfd5',
  linha: '#eef1ec',
};

const num = (v: number | null | undefined, casas = 1) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(casas).replace('.', ','));
const dataBr = (iso: string) => iso.split('-').reverse().join('/');

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
function desenhar(ctx: CanvasRenderingContext2D, data: string, coletas: ColetaDoDia[], p: Parametros): number {
  const interno = LARGURA - 2 * MARGEM;
  ctx.fillStyle = COR.fundo;
  ctx.fillRect(0, 0, LARGURA, ctx.canvas.height);

  // Cabeçalho
  retangulo(ctx, 0, 0, LARGURA, 170, 0, COR.verde);
  texto(ctx, 'AMOSTRAGEM DE CAMPO', MARGEM, 58, 26, '#cfe6cc', 600);
  texto(ctx, dataBr(data), MARGEM, 128, 60, '#ffffff', 700);
  texto(ctx, 'Silagem MS', LARGURA - MARGEM, 58, 26, '#cfe6cc', 600, 'right');
  const nPontos = coletas.reduce((s, c) => s + c.pontos.length, 0);
  texto(ctx, `${coletas.length} ${coletas.length === 1 ? 'talhão' : 'talhões'} · ${nPontos} ponto${nPontos === 1 ? '' : 's'}`, LARGURA - MARGEM, 128, 32, '#ffffff', 600, 'right');

  let y = 206;
  const gap = 16;
  for (const c of coletas) {
    const hKpi = 150;
    const hLinha = 46;
    const hTabela = 44 + c.pontos.length * hLinha;
    const hCartao = 118 + hKpi + 28 + hTabela + 24;
    retangulo(ctx, MARGEM, y, interno, hCartao, 18, COR.cartao, COR.borda, 2);
    const x0 = MARGEM + 28;
    const w0 = interno - 56;

    // Talhão
    texto(ctx, c.talhao, x0, y + 56, 40, COR.texto, 700, 'left', w0 * 0.62);
    texto(ctx, c.capim || '', x0 + w0, y + 56, 28, COR.mudo, 600, 'right', w0 * 0.36);
    const sub = [c.responsavel && `por ${c.responsavel}`, `${c.pontos.length} ponto${c.pontos.length === 1 ? '' : 's'}`, `quadro de ${num(c.quadroM2, 2)} m²`].filter(Boolean).join(' · ');
    texto(ctx, sub, x0, y + 96, 24, COR.mudo, 400, 'left', w0);

    // Números da coleta: MV, MS (na cor da faixa), MS/ha, CV
    const yk = y + 118;
    const wk = (w0 - 3 * gap) / 4;
    const msCor = c.status == null ? COR.amarelo : c.status === 'ideal' ? COR.verde : COR.vermelho;
    const msFundo = c.status == null ? COR.amareloClaro : c.status === 'ideal' ? COR.verdeClaro : COR.vermelhoClaro;
    const msSub = c.status == null ? 'a aferir' : c.status === 'ideal' ? 'na faixa ideal' : c.status === 'baixo' ? 'abaixo da faixa' : 'acima da faixa';
    const kpis: { rotulo: string; valor: string; sub: string; cor?: string; fundo?: string }[] = [
      { rotulo: 'Matéria natural', valor: num(c.r.tMVha), sub: 't MN/ha' },
      { rotulo: 'MS', valor: c.r.msPct == null ? '—' : `${num(c.r.msPct)}%`, sub: msSub, cor: msCor, fundo: msFundo },
      { rotulo: 'Matéria seca', valor: num(c.r.tMSha), sub: 't MS/ha' },
      { rotulo: 'CV entre pontos', valor: c.r.cvPct == null ? '—' : `${num(c.r.cvPct, 0)}%`, sub: c.r.cvPct == null ? 'só 1 ponto' : c.r.cvPct > 25 ? 'variação alta' : 'variação ok' },
    ];
    kpis.forEach((k, i) => {
      const x = x0 + i * (wk + gap);
      retangulo(ctx, x, yk, wk, hKpi, 14, k.fundo ?? COR.fundo, k.cor ?? COR.borda, k.cor ? 3 : 2);
      const cx = x + wk / 2;
      texto(ctx, k.rotulo, cx, yk + 38, 22, COR.mudo, 600, 'center', wk - 16);
      texto(ctx, k.valor, cx, yk + 96, 46, k.cor ?? COR.texto, 800, 'center', wk - 16);
      texto(ctx, k.sub, cx, yk + 130, 20, k.cor ?? COR.mudo, 600, 'center', wk - 16);
    });

    // Pontos
    const yt = yk + hKpi + 28;
    const cols = [x0 + 10, x0 + w0 * 0.36, x0 + w0 * 0.66, x0 + w0 - 10];
    const cab = ['Ponto', 'kg/m²', 't MN/ha', 'MS (%)'];
    cab.forEach((s, i) => texto(ctx, s, cols[i], yt + 26, 22, COR.mudo, 700, i ? 'right' : 'left'));
    c.pontos.forEach((pt, i) => {
      const yl = yt + 44 + i * hLinha;
      if (i % 2 === 0) retangulo(ctx, x0, yl, w0, hLinha, 8, COR.linha);
      const base = yl + 32;
      texto(ctx, String(pt.ponto), cols[0], base, 26, COR.texto, 600);
      texto(ctx, num(pt.kgM2, 2), cols[1], base, 26, COR.texto, 400, 'right');
      texto(ctx, num(pt.tMVha), cols[2], base, 26, COR.texto, 400, 'right');
      const s = statusMS(pt.msPct, p);
      texto(ctx, pt.msPct == null ? 'a aferir' : num(pt.msPct), cols[3], base, 26, s == null ? COR.amarelo : s === 'ideal' ? COR.verde : COR.vermelho, 700, 'right');
    });
    y += hCartao + 24;
  }

  // Rodapé
  y += 20;
  texto(ctx, `Faixa ideal de MS: ${num(p.msMin, 0)}–${num(p.msMax, 0)}% · t MN/ha = kg/m² × 10 · t MS/ha = t MN/ha × MS`, MARGEM, y, 22, COR.mudo, 400, 'left', interno);
  return y + MARGEM;
}

export async function gerarImagemColetasDia(data: string, coletas: ColetaDoDia[], p: Parametros): Promise<Blob> {
  const medida = document.createElement('canvas').getContext('2d');
  if (!medida) throw new Error('Este navegador não gera imagens.');
  medida.canvas.width = LARGURA;
  medida.canvas.height = 200;
  const altura = Math.ceil(desenhar(medida, data, coletas, p));
  const canvas = document.createElement('canvas');
  canvas.width = LARGURA;
  canvas.height = altura;
  desenhar(canvas.getContext('2d')!, data, coletas, p);
  return new Promise((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error('Falha ao gerar a imagem.'))), 'image/png'));
}

import { amostrasPorColeta, dadosAtuais, ultimaColetaPorTalhao } from './dados';
import { estimativaTalhao, producaoPonto, resumoColeta, statusMS, teorMS, type Parametros, type ResumoColeta } from './calc';
import { areaAnelM2 } from './kml';
import { nomeCurto } from './MapaTalhoes';
import { compararNomes, type Coleta, type Dados, type Talhao } from './tipos';
import { fmt, fmtData, hoje, lerParametros } from './util';

export const CV_LIMITE = 25;
const URL_APP = 'https://vertentedatafin.github.io/materia-seca-FVP/';

/** Conteúdo do relatório, já em texto, no mesmo modelo do relatório de 07/11/2026 (Relatorio_coletas_MS). */
export interface Relatorio {
  titulo: string;
  subtitulo: string;
  premissas: string[];
  amostras: { cabecalho: string[]; linhas: string[][] };
  talhoes: { cabecalho: string[]; linhas: string[][]; total: string[]; notas: string[] };
  leitura: string[];
  pendencias: string[];
  rodape: string;
}

const milhar = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : Math.round(v).toLocaleString('pt-BR'));
const pontos = (n: number) => `${n} ${n === 1 ? 'ponto' : 'pontos'}`;
const pct = (v: number | null | undefined, casas = 0) => (v == null ? '—' : `${fmt(v, casas)} %`);

/** "06/11/2026", "06 e 07/11/2026", "06/11/2026 a 20/11/2026". */
export function descreverDatas(datas: string[]): string {
  const d = [...new Set(datas)].sort();
  if (!d.length) return 'sem coletas';
  if (d.length === 1) return fmtData(d[0]);
  const [a, b] = [d[0], d[d.length - 1]];
  if (d.length === 2 && a.slice(0, 7) === b.slice(0, 7)) return `${a.slice(8, 10)} e ${fmtData(b)}`;
  return `${fmtData(a)} a ${fmtData(b)}`;
}

function situacao(r: ResumoColeta, p: Parametros): string {
  const s = statusMS(r.msPct, p);
  const ms = s === 'baixo' ? 'MS baixa' : s === 'alto' ? 'MS alta' : s === 'ideal' ? 'MS ideal' : 'MS a aferir';
  return r.cvPct != null && r.cvPct > CV_LIMITE ? `${ms}; CV alto` : ms;
}

function areaContornoHa(t: Talhao): number | null {
  if (!t.geometria?.length) return null;
  return Math.round((t.geometria.reduce((s, anel) => s + areaAnelM2(anel), 0) / 10000) * 10) / 10;
}

/** Monta o relatório (dados puros, testável) a partir do estado atual e dos parâmetros. */
export function montarRelatorio(d: Dados = dadosAtuais(), p: Parametros = lerParametros(), agora = new Date()): Relatorio {
  const talhoes = [...d.talhoes].sort((a, b) => compararNomes(a.nome, b.nome));
  const porId = new Map(talhoes.map((t) => [t.id, t]));
  const porColeta = amostrasPorColeta(d.amostras);
  const coletas = [...d.coletas]
    .filter((c) => porId.has(c.talhaoId))
    .sort((a, b) => compararNomes(porId.get(a.talhaoId)!.nome, porId.get(b.talhaoId)!.nome) || a.data.localeCompare(b.data) || (a.criadoEm ?? '').localeCompare(b.criadoEm ?? ''));
  const curto = (c: Coleta) => nomeCurto(porId.get(c.talhaoId)!.nome);
  const fazendas = [...new Set(coletas.map((c) => porId.get(c.talhaoId)!.fazenda).filter(Boolean))];
  const quadros = [...new Set(coletas.map((c) => c.areaAmostralM2))];

  // 2. amostras
  const linhasAmostras: string[][] = [];
  for (const c of coletas) {
    const t = porId.get(c.talhaoId)!;
    for (const a of (porColeta.get(c.id) ?? []).filter((a) => a.pesoVerdeKg != null)) {
      const mv = producaoPonto(a, c.areaAmostralM2)!;
      const ms = teorMS(a);
      linhasAmostras.push([
        nomeCurto(t.nome), t.capim || '—', fmtData(c.data), String(a.ponto), fmt(mv, 2), fmt(mv * 10, 1),
        ms == null ? 'a aferir' : fmt(ms, 0), ms == null ? '—' : fmt((mv * 10 * ms) / 100, 1),
      ]);
    }
  }

  // 3. por talhão (última coleta de cada um)
  const ultima = ultimaColetaPorTalhao(coletas);
  const resumos = talhoes
    .filter((t) => ultima.has(t.id))
    .map((t) => {
      const c = ultima.get(t.id)!;
      const r = resumoColeta(c, porColeta.get(c.id) ?? []);
      return { t, c, r, e: estimativaTalhao(t.areaHa, r, p) };
    })
    .filter((x) => x.r.nPontos > 0);
  const soma = (f: (x: (typeof resumos)[number]) => number | null | undefined) => resumos.reduce((s, x) => s + (f(x) ?? 0), 0);
  const linhasTalhoes = resumos.map(({ t, r, e }) => [
    nomeCurto(t.nome), fmt(t.areaHa, 1), fmt(r.tMVha, 1), pct(r.cvPct), r.msPct == null ? '—' : fmt(r.msPct, 0), fmt(r.tMSha, 1),
    milhar(e.tMVtotal), milhar(e.tMStotal), milhar(e.silagemT), milhar(e.volumeM3), situacao(r, p),
  ]);
  const total = ['Total', fmt(soma((x) => x.t.areaHa), 1), '', '', '', '', milhar(soma((x) => x.e.tMVtotal)), milhar(soma((x) => x.e.tMStotal)), milhar(soma((x) => x.e.silagemT)), milhar(soma((x) => x.e.volumeM3)), ''];
  const notas = resumos.filter(({ t }) => t.observacoes?.trim()).map(({ t }) => `${nomeCurto(t.nome)}: ${t.observacoes!.trim()}`);

  // 4. leitura automática
  const leitura: string[] = [];
  const melhor = [...resumos].filter((x) => x.r.tMSha != null).sort((a, b) => b.r.tMSha! - a.r.tMSha!)[0];
  for (const { t, c, r, e } of resumos) {
    const partes = [`${fmt(r.tMVha, 1)} t MV/ha em ${pontos(r.nPontos)}`];
    if (r.nPontos > 1 && r.cvPct != null) partes[0] += ` (CV ${fmt(r.cvPct, 0)} %${r.cvPct > CV_LIMITE ? ', variação alta' : r.cvPct <= 15 ? ', amostras consistentes' : ''})`;
    if (r.msPct != null) {
      const s = statusMS(r.msPct, p);
      partes.push(`MS média de ${fmt(r.msPct, 0)} % (${s === 'baixo' ? 'abaixo' : s === 'alto' ? 'acima' : 'dentro'} da faixa ideal)`);
      partes.push(`${fmt(r.tMSha, 1)} t MS/ha e ~${milhar(e.tMStotal)} t de MS no talhão`);
    } else {
      partes.push(`MS ainda a aferir (coleta de ${fmtData(c.data)})`);
    }
    let frase = `${nomeCurto(t.nome)} — ${partes.join(', ')}.`;
    if (melhor && melhor.t.id === t.id && resumos.length > 1) frase += ' Melhor talhão em MS por hectare.';
    const contorno = areaContornoHa(t);
    if (contorno && Math.abs(contorno / t.areaHa - 1) > 0.1) {
      const fator = contorno / t.areaHa;
      frase += ` Atenção à área: o contorno no mapa mede ${fmt(contorno, 1)} ha contra ${fmt(t.areaHa, 1)} ha em uso — com ${fmt(contorno, 1)} ha os totais ${fator < 1 ? 'caem' : 'sobem'} para ${milhar((e.tMVtotal ?? 0) * fator)} t MV e ~${milhar((e.tMStotal ?? 0) * fator)} t MS.`;
    }
    leitura.push(frase);
  }
  const comMS = resumos.filter((x) => x.r.msPct != null);
  if (comMS.length) {
    const mins = Math.min(...comMS.map((x) => x.r.msPct!));
    const maxs = Math.max(...comMS.map((x) => x.r.msPct!));
    const faixa = `${fmt(p.msMin, 0)}–${fmt(p.msMax, 0)} %`;
    if (maxs < p.msMin) {
      leitura.push(`Todos os talhões com MS média entre ${fmt(mins, 0)} e ${fmt(maxs, 0)} %, abaixo da faixa ideal para silagem (${faixa}). Ou se aguarda/emurchece até ~${fmt((p.msMin + p.msMax) / 2, 0)} %, ou se aceita maior perda por efluente. A MS por hectare não muda com o emurchecimento; diminuem a massa a transportar e o volume de silo.`);
    } else if (mins > p.msMax) {
      leitura.push(`Todos os talhões com MS média acima da faixa ideal (${faixa}): compactação mais difícil; ensilar sem demora.`);
    } else {
      const prontos = comMS.filter((x) => statusMS(x.r.msPct, p) === 'ideal').map((x) => nomeCurto(x.t.nome));
      leitura.push(`MS média entre ${fmt(mins, 0)} e ${fmt(maxs, 0)} %; faixa ideal ${faixa}.${prontos.length ? ` No ponto de ensilar: ${prontos.join(', ')}.` : ''}`);
    }
  }

  // 5. pendências
  const pendencias: string[] = [];
  const poucos = resumos.filter((x) => x.r.nPontos < 3).map((x) => `${nomeCurto(x.t.nome)} (só ${pontos(x.r.nPontos)})`);
  if (poucos.length) pendencias.push(`Amostrar mais pontos em ${poucos.join(', ')}: com menos de 3 pontos a estimativa não é confiável.`);
  const cvAlto = resumos.filter((x) => x.r.nPontos >= 3 && x.r.cvPct != null && x.r.cvPct > CV_LIMITE).map((x) => `${nomeCurto(x.t.nome)} (CV ${fmt(x.r.cvPct, 0)} % em ${x.r.nPontos} pontos)`);
  if (cvAlto.length) pendencias.push(`Talhão desuniforme, estimativa com margem de erro: ${cvAlto.join(', ')}.`);
  const semMS = coletas.filter((c) => {
    const r = resumoColeta(c, porColeta.get(c.id) ?? []);
    return r.nPontos > 0 && r.nPontosMS < r.nPontos;
  });
  if (semMS.length) pendencias.push(`Aferir a MS no laboratório: ${semMS.map((c) => `${curto(c)} de ${fmtData(c.data)}`).join(', ')}.`);
  const semColeta = talhoes.filter((t) => t.capim && !ultima.has(t.id)).map((t) => nomeCurto(t.nome));
  if (semColeta.length) pendencias.push(`Talhões ainda sem coleta: ${semColeta.join(', ')}.`);
  if (!pendencias.length) pendencias.push('Nenhuma pendência.');

  return {
    titulo: 'RELATÓRIO DE COLETAS — MATÉRIA SECA E PRODUÇÃO ESTIMADA',
    subtitulo: `${fazendas.length ? `Fazenda ${fazendas.join(' / ')} · ` : ''}coletas de ${descreverDatas(coletas.map((c) => c.data))} · emitido em ${fmtData(hoje())}`,
    premissas: [
      quadros.length === 1
        ? `Quadro de amostragem de ${fmt(quadros[0], 2)} m². Massa verde (MV) de cada amostra em kg/m².`
        : `Quadros de amostragem de ${quadros.map((q) => fmt(q, 2)).join(' e ')} m²; MV convertida para kg/m².`,
      'Teor de MS = massa seca ÷ massa úmida da subamostra × 100 (média das subamostras da coleta).',
      'Áreas: área em uso de cada talhão conforme o cadastro do app (conferir tamanhos).',
      // só caracteres do WinAnsi (fontes padrão do PDF): hífen no lugar do sinal de menos
      `Produção: t MV/ha = kg/m² × 10; t MS/ha = t MV/ha × MS ÷ 100. Silagem = MV total - ${fmt(p.perdasPct, 0)} % de perdas; volume de silo a ${fmt(p.densidadeKgM3, 0)} kg/m³. Faixa ideal de MS: ${fmt(p.msMin, 0)}–${fmt(p.msMax, 0)} %.`,
      'Resultados por talhão usam a coleta mais recente de cada talhão.',
    ],
    amostras: { cabecalho: ['Talhão', 'Capim', 'Data da coleta', 'Amostra', 'MV (kg/m²)', 'MV (t/ha)', 'MS (%)', 'MS (t/ha)'], linhas: linhasAmostras },
    talhoes: {
      cabecalho: ['Talhão', 'Área usada (ha)', 'MV média (t/ha)', 'CV entre pontos', 'MS média (%)', 'MS (t/ha)', 'MV total (t)', 'MS total (t)', 'Silagem est. (t)', 'Silo (m³)', 'Situação'],
      linhas: linhasTalhoes,
      total,
      notas,
    },
    leitura,
    pendencias,
    rodape: `Gerado pelo app Silagem MS em ${agora.toLocaleString('pt-BR')} a partir dos dados de campo informados; cálculos conforme as fórmulas do app (${URL_APP}).`,
  };
}

const VERDE: [number, number, number] = [47, 107, 58];
const TEXTO: [number, number, number] = [31, 42, 31];
const MUDO: [number, number, number] = [107, 118, 107];
const BORDA: [number, number, number] = [217, 226, 212];

/** Gera o PDF (jsPDF carregado sob demanda) e dispara o download. */
export async function gerarRelatorioPdf(rel: Relatorio = montarRelatorio()) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();
  const M = 14;
  let y = M;

  const quebra = (precisa: number) => {
    if (y + precisa > altura - M) {
      doc.addPage();
      y = M;
    }
  };
  const titulo = (txt: string, reservar = 14) => {
    quebra(reservar); // não deixa o título órfão no fim da página
    doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...VERDE);
    doc.text(txt, M + 4, y + 5);
    y += 9;
  };
  const marcadores = (itens: string[], negritoAte = 0) => {
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...TEXTO);
    for (const item of itens) {
      const linhas = doc.splitTextToSize(item, largura - 2 * M - 6) as string[];
      quebra(linhas.length * 4.2 + 1.5);
      doc.text('–', M, y + 3.4);
      if (negritoAte > 0) {
        // começo da frase em negrito (nome do talhão até o travessão)
        const corte = item.indexOf(' — ');
        if (corte > 0 && corte < negritoAte) {
          const prefixo = item.slice(0, corte + 2);
          doc.setFont('helvetica', 'bold');
          const larguraPrefixo = doc.getTextWidth(prefixo);
          doc.text(prefixo, M + 4, y + 3.4);
          doc.setFont('helvetica', 'normal');
          const restante = doc.splitTextToSize(item.slice(corte + 3), largura - 2 * M - 6 - larguraPrefixo - 1) as string[];
          doc.text(restante[0] ?? '', M + 4 + larguraPrefixo + 1, y + 3.4);
          const resto = restante.length > 1 ? (doc.splitTextToSize(restante.slice(1).join(' '), largura - 2 * M - 6) as string[]) : [];
          if (resto.length) doc.text(resto, M + 4, y + 3.4 + 4.2);
          y += (1 + resto.length) * 4.2 + 1.5;
          continue;
        }
      }
      doc.text(linhas, M + 4, y + 3.4);
      y += linhas.length * 4.2 + 1.5;
    }
    y += 2;
  };
  const tabela = (cabecalho: string[], linhas: string[][], opcoes: { total?: string[]; numericasDesde: number; larguras?: Record<number, number> }) => {
    autoTable(doc, {
      startY: y,
      margin: { left: M + 4, right: M },
      head: [cabecalho],
      body: linhas,
      foot: opcoes.total ? [opcoes.total] : undefined,
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 8.5, textColor: TEXTO, cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 }, lineColor: BORDA, lineWidth: { bottom: 0.2 } },
      headStyles: { fontStyle: 'bold', fillColor: [232, 243, 214], textColor: TEXTO, lineWidth: { bottom: 0.4 }, lineColor: VERDE },
      footStyles: { fontStyle: 'bold', fillColor: [244, 247, 242], textColor: TEXTO, lineWidth: { top: 0.4 }, lineColor: VERDE },
      columnStyles: Object.fromEntries([
        ...cabecalho.map((_, i) => [i, { halign: i >= opcoes.numericasDesde ? 'right' : 'left', fontStyle: i === 0 ? 'bold' : 'normal', cellWidth: opcoes.larguras?.[i] ?? 'auto' }]),
      ]),
      // cabeçalho e total seguem o alinhamento das colunas numéricas
      didParseCell: (dados) => {
        if (dados.section !== 'body' && dados.column.index >= opcoes.numericasDesde) dados.cell.styles.halign = 'right';
      },
      didDrawPage: (dados) => {
        y = dados.cursor?.y ?? y;
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  };

  // Cabeçalho
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...VERDE);
  doc.text(rel.titulo, M, y + 6);
  y += 11;
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(...MUDO);
  doc.text(rel.subtitulo, M, y + 3);
  y += 5;
  doc.setDrawColor(...BORDA).setLineWidth(0.3).line(M, y, largura - M, y);
  y += 6;

  titulo('1. Premissas');
  marcadores(rel.premissas);

  titulo('2. Resultados por amostra', 40);
  if (rel.amostras.linhas.length) tabela(rel.amostras.cabecalho, rel.amostras.linhas, { numericasDesde: 3 });
  else marcadores(['Nenhuma amostra registrada.']);

  titulo('3. Resultados por talhão (médias das amostras da coleta mais recente)', 40);
  if (rel.talhoes.linhas.length) {
    tabela(rel.talhoes.cabecalho, rel.talhoes.linhas, { total: rel.talhoes.total, numericasDesde: 1, larguras: { 10: 34 } });
    if (rel.talhoes.notas.length) {
      doc.setFont('helvetica', 'italic').setFontSize(8).setTextColor(...MUDO);
      for (const n of rel.talhoes.notas) {
        const linhas = doc.splitTextToSize(`Notas: ${n}`, largura - 2 * M - 4) as string[];
        quebra(linhas.length * 3.8);
        doc.text(linhas, M + 4, y);
        y += linhas.length * 3.8;
      }
      y += 3;
    }
  } else marcadores(['Nenhuma coleta registrada.']);

  titulo('4. Leitura dos resultados');
  marcadores(rel.leitura, 20);
  // (as pendências continuam em `rel.pendencias`, mas não vão para o PDF a pedido do usuário)

  // Rodapé em todas as páginas
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BORDA).setLineWidth(0.2).line(M, altura - M + 2, largura - M, altura - M + 2);
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(...MUDO);
    doc.text(rel.rodape, M, altura - M + 6, { maxWidth: largura - 2 * M - 20 });
    doc.text(`${i}/${paginas}`, largura - M, altura - M + 6, { align: 'right' });
  }

  doc.save(`Relatorio_coletas_MS_${hoje()}.pdf`);
}

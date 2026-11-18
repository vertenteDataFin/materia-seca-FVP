import type ExcelJS from 'exceljs';
import { amostrasPorColeta, dadosAtuais } from './dados';
import type { Coleta, Dados, Talhao } from './tipos';
import { estimativaTalhao, producaoPonto, resumoColeta, statusMS, teorMS, teorUmidade, type Parametros } from './calc';
import { areaAnelM2 } from './kml';
import { rotuloOrigem } from './geo';
import { hoje, lerParametros } from './util';
import { nomeComSigla } from './MapaTalhoes';
import { colheitaPorTalhao, msColheita, pennState } from './amostragemColheita';
import { liquidoKg } from './colheita';
import { configFdnAtual, peFdnDaAmostra, type ConfigFdn } from './fdn';

const VERDE = 'FF2F6B3A';
const CV_LIMITE = 25;

type Linha = (string | number | Date | null)[];

interface Planilha {
  nome: string;
  colunas: { titulo: string; largura: number; formato?: string }[];
  linhas: Linha[];
}

function dataLocal(iso: string): Date | null {
  const [a, m, d] = iso.split('-').map(Number);
  return a && m && d ? new Date(a, m - 1, d) : null;
}

const n = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null : v);

function situacao(msPct: number | null, cvPct: number | null, p: Parametros): string {
  const s = statusMS(msPct, p);
  const ms = s === 'baixo' ? 'MS baixa' : s === 'alto' ? 'MS alta' : s === 'ideal' ? 'MS ideal' : 'MS a aferir';
  return cvPct != null && cvPct > CV_LIMITE ? `${ms}; CV alto` : ms;
}

/** Monta as planilhas (dados puros) — separado da escrita para ser testável. */
export function montarPlanilhas(d: Dados = dadosAtuais(), p: Parametros = lerParametros(), cfgFdn: ConfigFdn = configFdnAtual()): Planilha[] {
  const talhoes = [...d.talhoes].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }));
  const coletas = [...d.coletas].sort((a, b) => a.data.localeCompare(b.data) || (a.criadoEm ?? '').localeCompare(b.criadoEm ?? '') || a.id.localeCompare(b.id));
  const talhaoPorId = new Map<string, Talhao>(talhoes.map((t) => [t.id, t]));
  const porColeta = amostrasPorColeta(d.amostras);
  const idColeta = new Map<string, string>(coletas.map((c, i) => [c.id, `C${String(i + 1).padStart(3, '0')}`]));
  const nome = (c: Coleta) => {
    const t = talhaoPorId.get(c.talhaoId);
    return t ? nomeComSigla(t.nome, t.fazenda) : '?';
  };

  const planTalhoes: Planilha = {
    nome: 'Talhões',
    colunas: [
      { titulo: 'Talhão', largura: 12 }, { titulo: 'Nome completo', largura: 24 }, { titulo: 'Fazenda', largura: 14 }, { titulo: 'Capim', largura: 20 },
      { titulo: 'Área usada (ha)', largura: 13, formato: '0.0' }, { titulo: 'Área declarada KML (ha)', largura: 14, formato: '0.0' },
      { titulo: 'Área contorno KML (ha)', largura: 14, formato: '0.0' }, { titulo: 'Observações', largura: 40 },
    ],
    linhas: talhoes.map((t) => [
      nomeComSigla(t.nome, t.fazenda), t.nome, t.fazenda ?? '', t.capim, n(t.areaHa), n(t.areaKmlHa),
      t.geometria?.length ? Math.round((t.geometria.reduce((s, anel) => s + areaAnelM2(anel), 0) / 10000) * 10) / 10 : null,
      t.observacoes ?? '',
    ]),
  };

  const planColetas: Planilha = {
    nome: 'Coletas',
    colunas: [
      { titulo: 'ID coleta', largura: 10 }, { titulo: 'Talhão', largura: 10 }, { titulo: 'Data', largura: 11, formato: 'dd/mm/yyyy' },
      { titulo: 'Responsável', largura: 16 }, { titulo: 'Quadro (m²)', largura: 9, formato: '0.00' }, { titulo: 'Observações', largura: 30 },
      { titulo: 'Nº amostras', largura: 9 }, { titulo: 'MV média (kg/m²)', largura: 10, formato: '0.00' }, { titulo: 'MV (t/ha)', largura: 9, formato: '0.0' },
      { titulo: 'Desvio padrão (kg/m²)', largura: 10, formato: '0.00' }, { titulo: 'CV (%)', largura: 8, formato: '0' },
      { titulo: 'MS média (%)', largura: 9, formato: '0.0' }, { titulo: 'MS (t/ha)', largura: 9, formato: '0.0' }, { titulo: 'Área (ha)', largura: 9, formato: '0.0' },
      { titulo: 'MV total (t)', largura: 10, formato: '#,##0' }, { titulo: 'MS total (t)', largura: 10, formato: '#,##0' },
      { titulo: 'Silagem est. (t)', largura: 10, formato: '#,##0' }, { titulo: 'Silo (m³)', largura: 10, formato: '#,##0' }, { titulo: 'Situação', largura: 24 },
    ],
    linhas: coletas.map((c) => {
      const r = resumoColeta(c, porColeta.get(c.id) ?? []);
      const t = talhaoPorId.get(c.talhaoId);
      const e = estimativaTalhao(t?.areaHa ?? 0, r, p);
      return [
        idColeta.get(c.id)!, nome(c), dataLocal(c.data), c.responsavel, c.areaAmostralM2, c.observacoes ?? '',
        r.nPontos, n(r.mvKgM2), n(r.tMVha), n(r.desvioKgM2), n(r.cvPct), n(r.msPct), n(r.tMSha), n(t?.areaHa),
        n(e.tMVtotal), n(e.tMStotal), n(e.silagemT), n(e.volumeM3), r.nPontos ? situacao(r.msPct, r.cvPct, p) : '',
      ];
    }),
  };

  const planAmostras: Planilha = {
    nome: 'Amostras',
    colunas: [
      { titulo: 'ID coleta', largura: 10 }, { titulo: 'Talhão', largura: 10 }, { titulo: 'Data', largura: 11, formato: 'dd/mm/yyyy' }, { titulo: 'Amostra nº', largura: 9 },
      { titulo: 'Peso verde do quadro (kg)', largura: 12, formato: '0.00' }, { titulo: 'Subamostra úmida (g)', largura: 11, formato: '0' },
      { titulo: 'Subamostra seca (g)', largura: 11, formato: '0' }, { titulo: 'Latitude', largura: 12, formato: '0.000000' }, { titulo: 'Longitude', largura: 12, formato: '0.000000' },
      { titulo: 'Precisão GPS (m)', largura: 10, formato: '0' }, { titulo: 'Origem da posição', largura: 16 }, { titulo: 'Capturado em', largura: 18 }, { titulo: 'Observações', largura: 28 },
      { titulo: 'Quadro (m²)', largura: 9, formato: '0.00' }, { titulo: 'MV (kg/m²)', largura: 9, formato: '0.00' }, { titulo: 'MV (t/ha)', largura: 9, formato: '0.0' },
      { titulo: 'MS (%)', largura: 8, formato: '0.0' }, { titulo: 'Umidade (%)', largura: 9, formato: '0.0' }, { titulo: 'MS (t/ha)', largura: 9, formato: '0.0' },
    ],
    linhas: coletas.flatMap((c) =>
      (porColeta.get(c.id) ?? []).map((a) => {
        const mv = producaoPonto(a, c.areaAmostralM2);
        const ms = teorMS(a);
        return [
          idColeta.get(c.id)!, nome(c), dataLocal(c.data), a.ponto, n(a.pesoVerdeKg), n(a.pesoUmidoG), n(a.pesoSecoG),
          n(a.lat), n(a.lng), n(a.precisaoM), rotuloOrigem(a), a.capturadoEm ? new Date(a.capturadoEm).toLocaleString('pt-BR') : '', a.observacoes ?? '',
          c.areaAmostralM2, n(mv), mv == null ? null : mv * 10, n(ms), n(teorUmidade(a)), mv == null || ms == null ? null : (mv * 10 * ms) / 100,
        ];
      }),
    ),
  };

  const planParametros: Planilha = {
    nome: 'Parâmetros',
    colunas: [{ titulo: 'Parâmetro', largura: 34 }, { titulo: 'Valor', largura: 10 }, { titulo: 'Unidade', largura: 10 }],
    linhas: [
      ['Perdas na ensilagem', p.perdasPct, '%'],
      ['Densidade da silagem no silo', p.densidadeKgM3, 'kg/m³'],
      ['MS mínima ideal', p.msMin, '%'],
      ['MS máxima ideal', p.msMax, '%'],
      ['CV máximo aceitável entre pontos', CV_LIMITE, '%'],
      ['Exportado em', new Date().toLocaleString('pt-BR'), ''],
    ],
  };

  // ---- Colheita (só entra quando há amostragem de colheita ou cargas) ----
  const amostrasColheita = [...(d.amostrasColheita ?? [])].sort((a, b) => a.coletadaEm.localeCompare(b.coletadaEm));
  const cargas = [...(d.cargas ?? [])].filter((c) => c.pesoBrutoKg != null).sort((a, b) => a.saidaEm.localeCompare(b.saidaEm));
  const nomeTalhao = (id: string) => {
    const t = talhaoPorId.get(id);
    return t ? nomeComSigla(t.nome, t.fazenda) : '?';
  };
  const extras: Planilha[] = [];
  if (amostrasColheita.length) {
    extras.push({
      nome: 'Amostras de colheita',
      colunas: [
        { titulo: 'Código', largura: 15 }, { titulo: 'Data e hora', largura: 16, formato: 'dd/mm/yyyy hh:mm' }, { titulo: 'Talhão', largura: 10 },
        { titulo: 'Placa', largura: 10 }, { titulo: 'Motorista', largura: 18 }, { titulo: 'Silo', largura: 10 }, { titulo: 'Responsável', largura: 14 },
        { titulo: 'Peneira 19 mm (g)', largura: 10, formato: '0' }, { titulo: 'Peneira 8 mm (g)', largura: 10, formato: '0' },
        { titulo: 'Peneira 4 mm (g)', largura: 10, formato: '0' }, { titulo: 'Fundo (g)', largura: 10, formato: '0' },
        { titulo: '19 mm (%)', largura: 8, formato: '0.0' }, { titulo: '8 mm (%)', largura: 8, formato: '0.0' }, { titulo: '4 mm (%)', largura: 8, formato: '0.0' },
        { titulo: 'Fundo (%)', largura: 8, formato: '0.0' }, { titulo: 'Subamostra úmida (g)', largura: 10, formato: '0' }, { titulo: 'Subamostra seca (g)', largura: 10, formato: '0' },
        { titulo: 'MS (%)', largura: 8, formato: '0.0' },
        { titulo: 'FDN usada (% MS)', largura: 10, formato: '0.0' }, { titulo: 'Origem da FDN', largura: 14 },
        { titulo: 'pef > 8 mm', largura: 8, formato: '0.00' }, { titulo: 'pef > 4 mm', largura: 8, formato: '0.00' },
        { titulo: 'FDNfe > 8 mm (% MS)', largura: 10, formato: '0.0' }, { titulo: 'FDNfe > 4 mm (% MS)', largura: 10, formato: '0.0' },
        { titulo: 'Observações', largura: 28 },
      ],
      linhas: amostrasColheita.map((a) => {
        const ps = pennState(a);
        const pe = peFdnDaAmostra(a, talhaoPorId.get(a.talhaoId)?.capim ?? '', cfgFdn);
        return [
          a.codigo ?? '', dataHoraLocal(a.coletadaEm), nomeTalhao(a.talhaoId), a.placa, a.motorista ?? '', a.silo, a.responsavel ?? '',
          n(a.peneira19G), n(a.peneira8G), n(a.peneira4G), n(a.fundoG),
          ps ? ps.pct[0] : null, ps ? ps.pct[1] : null, ps ? ps.pct[2] : null, ps ? ps.pct[3] : null,
          n(a.pesoUmidoG), n(a.pesoSecoG), n(msColheita(a)),
          n(pe.fdnPct), pe.fonte === 'laboratorio' ? 'laboratório' : pe.fonte === 'capim' ? 'referência do capim' : pe.fonte === 'padrao' ? 'padrão' : '',
          n(pe.pef8), n(pe.pef4), n(pe.peFdn8), n(pe.peFdn4),
          a.observacoes ?? '',
        ];
      }),
    });
  }
  if (cargas.length) {
    extras.push({
      nome: 'Cargas',
      colunas: [
        { titulo: 'Romaneio', largura: 11 }, { titulo: 'Data e hora', largura: 16, formato: 'dd/mm/yyyy hh:mm' }, { titulo: 'Talhão', largura: 10 },
        { titulo: 'Placa', largura: 10 }, { titulo: 'Motorista', largura: 18 }, { titulo: 'Silo', largura: 10 },
        { titulo: 'Bruto (kg)', largura: 11, formato: '#,##0' }, { titulo: 'Tara (kg)', largura: 11, formato: '#,##0' }, { titulo: 'Líquido (kg)', largura: 11, formato: '#,##0' },
        { titulo: 'MS informada na carga (%)', largura: 11, formato: '0.0' },
      ],
      linhas: cargas.map((c) => [
        c.romaneio ?? '', dataHoraLocal(c.saidaEm), nomeTalhao(c.talhaoId), c.placa ?? '', c.motorista ?? '', c.silo ?? '',
        n(c.pesoBrutoKg), n(c.taraKg), n(liquidoKg(c)), n(c.msPct),
      ]),
    });
  }
  const porTalhaoColheita = colheitaPorTalhao(d);
  if (porTalhaoColheita.length) {
    extras.push({
      nome: 'Colheita por talhão',
      colunas: [
        { titulo: 'Talhão', largura: 10 }, { titulo: 'Amostras de caminhão', largura: 10 }, { titulo: 'MS colheita (%)', largura: 10, formato: '0.0' },
        { titulo: 'Penn State 19 mm (%)', largura: 10, formato: '0.0' }, { titulo: 'Penn State 8 mm (%)', largura: 10, formato: '0.0' },
        { titulo: 'Penn State 4 mm (%)', largura: 10, formato: '0.0' }, { titulo: 'Penn State fundo (%)', largura: 10, formato: '0.0' },
        { titulo: 'Cargas', largura: 8 }, { titulo: 'MV entregue (t)', largura: 11, formato: '#,##0.0' }, { titulo: 'MS entregue (t)', largura: 11, formato: '#,##0.0' },
        { titulo: 'Área colhida (ha)', largura: 11, formato: '0.0' }, { titulo: 'Colhido (%)', largura: 9, formato: '0' }, { titulo: 'Situação', largura: 14 },
      ],
      linhas: porTalhaoColheita.map((l) => [
        nomeComSigla(l.talhao.nome, l.talhao.fazenda), l.nAmostras, n(l.msColheita),
        l.pennMedio ? l.pennMedio[0] : null, l.pennMedio ? l.pennMedio[1] : null, l.pennMedio ? l.pennMedio[2] : null, l.pennMedio ? l.pennMedio[3] : null,
        l.cargas, l.cargas ? l.tMV : null, n(l.tMS), n(l.areaColhidaHa), n(l.progresso),
        l.finalizada ? 'finalizada' : l.cargas ? 'em colheita' : 'só amostragem',
      ]),
    });
  }

  return [planTalhoes, planColetas, planAmostras, ...extras, planParametros];
}

/** "2026-11-17T08:30" → Date local (para a célula de data e hora). */
function dataHoraLocal(iso: string): Date | null {
  const [data, hora = '00:00'] = iso.split('T');
  const dia = dataLocal(data);
  if (!dia) return null;
  const [h, m] = hora.split(':').map(Number);
  dia.setHours(h || 0, m || 0);
  return dia;
}

/** Gera o .xlsx (ExcelJS carregado sob demanda) e dispara o download. */
export async function exportarExcel() {
  const planilhas = montarPlanilhas();
  const { Workbook } = (await import('exceljs')).default;
  const wb: ExcelJS.Workbook = new Workbook();
  wb.creator = 'Silagem MS';

  for (const pl of planilhas) {
    const ws = wb.addWorksheet(pl.nome, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = pl.colunas.map((c) => ({ width: c.largura }));
    const cab = ws.addRow(pl.colunas.map((c) => c.titulo));
    cab.height = 32;
    cab.eachCell((cel) => {
      cel.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
      cel.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    for (const l of pl.linhas) {
      const linha = ws.addRow(l);
      linha.eachCell({ includeEmpty: true }, (cel, i) => {
        cel.font = { name: 'Arial', size: 10 };
        const f = pl.colunas[i - 1]?.formato;
        if (f) cel.numFmt = f;
      });
    }
    if (pl.linhas.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: pl.linhas.length + 1, column: pl.colunas.length } };
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `silagem-ms-${hoje()}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

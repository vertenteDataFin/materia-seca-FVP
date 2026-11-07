import { useRef, useState } from 'react';
import { db } from '../db';
import { PARAMETROS_PADRAO, producaoPonto, teorMS, teorUmidade, type Parametros } from '../calc';
import { baixarArquivo, hoje, lerParametros, numParaTexto, parseNum, salvarParametros } from '../util';
import { exportarExcel } from '../exportarExcel';
import { COLETAS_INICIAIS, importarColetasIniciais } from '../coletasIniciais';

const CAMPOS: { chave: keyof Parametros; rotulo: string; ajuda: string }[] = [
  { chave: 'perdasPct', rotulo: 'Perdas estimadas (%)', ajuda: 'Colheita, fermentação e descarte. Típico: 10–20%.' },
  { chave: 'densidadeKgM3', rotulo: 'Densidade da silagem (kg MV/m³)', ajuda: 'Compactação esperada no silo. Típico: 550–700.' },
  { chave: 'msMin', rotulo: 'MS mínima ideal (%)', ajuda: 'Abaixo disso há risco de efluente e fermentação indesejada.' },
  { chave: 'msMax', rotulo: 'MS máxima ideal (%)', ajuda: 'Acima disso a compactação fica difícil.' },
];

export default function Config() {
  const [texto, setTexto] = useState(() => {
    const p = lerParametros();
    return Object.fromEntries(CAMPOS.map((c) => [c.chave, numParaTexto(p[c.chave])])) as Record<keyof Parametros, string>;
  });
  const [mensagem, setMensagem] = useState('');
  const [exportando, setExportando] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);

  async function carregarColetasIniciais() {
    const r = await importarColetasIniciais();
    const partes = [`${r.criadas} coleta(s) criada(s)`, `${r.existentes} já existia(m)`];
    if (r.semTalhao.length) partes.push(`talhão não encontrado: ${r.semTalhao.join(', ')}`);
    setMensagem(`Coletas da ficha de campo: ${partes.join(' · ')}.`);
  }

  async function exportarXlsx() {
    setExportando(true);
    setMensagem('');
    try {
      await exportarExcel();
    } catch (e) {
      setMensagem(`Falha ao gerar o Excel: ${(e as Error).message}`);
    } finally {
      setExportando(false);
    }
  }

  function salvar() {
    const p = { ...PARAMETROS_PADRAO };
    for (const c of CAMPOS) {
      const v = parseNum(texto[c.chave]);
      if (v == null || v < 0) return setMensagem(`Valor inválido em "${c.rotulo}".`);
      p[c.chave] = v;
    }
    if (p.perdasPct >= 100) return setMensagem('Perdas devem ser menores que 100%.');
    if (p.msMin > p.msMax) return setMensagem('MS mínima deve ser menor que a máxima.');
    salvarParametros(p);
    setMensagem('Parâmetros salvos.');
  }

  async function exportarJSON() {
    const [talhoes, coletas, amostras] = await Promise.all([db.talhoes.toArray(), db.coletas.toArray(), db.amostras.toArray()]);
    const backup = { app: 'silagem-ms', versao: 1, exportadoEm: new Date().toISOString(), parametros: lerParametros(), talhoes, coletas, amostras };
    baixarArquivo(`silagem-ms-backup-${hoje()}.json`, JSON.stringify(backup, null, 2), 'application/json');
  }

  async function exportarCSV() {
    const [talhoes, coletas, amostras] = await Promise.all([db.talhoes.toArray(), db.coletas.toArray(), db.amostras.toArray()]);
    const t = new Map(talhoes.map((x) => [x.id!, x]));
    const c = new Map(coletas.map((x) => [x.id!, x]));
    const n = (v: number | null | undefined) => (v == null ? '' : String(Math.round(v * 1000) / 1000).replace('.', ','));
    const s = (v: string | undefined) => `"${(v ?? '').replace(/"/g, '""')}"`;
    const linhas = [
      ['Talhão', 'Fazenda', 'Capim', 'Área talhão (ha)', 'Data', 'Responsável', 'Área quadro (m²)', 'Ponto', 'Peso verde (kg)', 'MV (kg/m²)', 'Peso úmido (g)', 'Peso seco (g)', 'MS (%)', 'Umidade (%)', 'Latitude', 'Longitude', 'Precisão GPS (m)', 'Capturado em'].join(';'),
    ];
    for (const a of amostras) {
      const col = c.get(a.coletaId);
      const tal = col && t.get(col.talhaoId);
      if (!col || !tal) continue;
      linhas.push(
        [s(tal.nome), s(tal.fazenda), s(tal.capim), n(tal.areaHa), col.data, s(col.responsavel), n(col.areaAmostralM2), a.ponto, n(a.pesoVerdeKg),
          n(producaoPonto(a, col.areaAmostralM2)), n(a.pesoUmidoG), n(a.pesoSecoG), n(teorMS(a)), n(teorUmidade(a)),
          a.lat != null ? String(a.lat.toFixed(6)).replace('.', ',') : '', a.lng != null ? String(a.lng.toFixed(6)).replace('.', ',') : '',
          n(a.precisaoM), a.capturadoEm ?? ''].join(';'),
      );
    }
    baixarArquivo(`silagem-ms-amostras-${hoje()}.csv`, '﻿' + linhas.join('\r\n'), 'text/csv;charset=utf-8');
  }

  async function importar(f: File) {
    try {
      const b = JSON.parse(await f.text());
      if (b.app !== 'silagem-ms' || !Array.isArray(b.talhoes) || !Array.isArray(b.coletas) || !Array.isArray(b.amostras)) {
        throw new Error('Arquivo não é um backup do Silagem MS.');
      }
      if (!confirm(`Restaurar ${b.talhoes.length} talhão(ões), ${b.coletas.length} coleta(s) e ${b.amostras.length} amostra(s)?\n\nOS DADOS ATUAIS SERÃO SUBSTITUÍDOS.`)) return;
      await db.transaction('rw', db.talhoes, db.coletas, db.amostras, async () => {
        await Promise.all([db.talhoes.clear(), db.coletas.clear(), db.amostras.clear()]);
        await db.talhoes.bulkAdd(b.talhoes);
        await db.coletas.bulkAdd(b.coletas);
        await db.amostras.bulkAdd(b.amostras);
      });
      if (b.parametros) salvarParametros({ ...PARAMETROS_PADRAO, ...b.parametros });
      setMensagem('Backup restaurado com sucesso.');
    } catch (e) {
      setMensagem(`Falha ao importar: ${(e as Error).message}`);
    } finally {
      if (arquivo.current) arquivo.current.value = '';
    }
  }

  return (
    <>
      <h1>Configurações</h1>
      <div className="cartao grade-form">
        <h2>Parâmetros da estimativa</h2>
        {CAMPOS.map((c) => (
          <label key={c.chave}>
            {c.rotulo}
            <input inputMode="decimal" value={texto[c.chave]} onChange={(e) => setTexto({ ...texto, [c.chave]: e.target.value })} />
            <small className="mudo">{c.ajuda}</small>
          </label>
        ))}
        <div className="acoes largo">
          <button className="primario" onClick={salvar}>Salvar parâmetros</button>
        </div>
      </div>

      <div className="cartao">
        <h2>Dados e backup</h2>
        <p className="dica">
          Os dados ficam salvos neste navegador/dispositivo. Faça backups regulares e use-os para transferir dados entre
          aparelhos (ex.: do celular usado em campo para o computador do escritório). O Excel traz as planilhas Talhões,
          Coletas (com os resultados calculados), Amostras e Parâmetros.
        </p>
        <div className="acoes">
          <button className="primario" onClick={exportarXlsx} disabled={exportando}>{exportando ? 'Gerando…' : 'Exportar Excel (.xlsx)'}</button>
          <button onClick={exportarCSV}>Exportar amostras (CSV)</button>
          <button onClick={exportarJSON}>Exportar backup (JSON)</button>
          <button onClick={() => arquivo.current?.click()}>Restaurar backup…</button>
          <input ref={arquivo} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importar(e.target.files[0])} />
        </div>
      </div>
      <div className="cartao">
        <h2>Coletas da ficha de campo</h2>
        <p className="dica">
          As coletas já feitas ({COLETAS_INICIAIS.map((c) => `${c.talhao} em ${c.data.split('-').reverse().join('/')}`).join(', ')}) entram
          automaticamente na primeira abertura do app, sem posição GPS. Use o botão se precisar recarregá-las — coletas que já existem não são duplicadas.
        </p>
        <div className="acoes">
          <button onClick={carregarColetasIniciais}>Carregar coletas da ficha</button>
        </div>
      </div>
      {mensagem && <p className="aviso">{mensagem}</p>}

      <div className="cartao">
        <h2>Como os cálculos são feitos</h2>
        <ul className="formulas">
          <li><strong>MV (kg/m²)</strong> = peso verde do ponto ÷ área do quadro</li>
          <li><strong>t MV/ha</strong> = média dos pontos (kg/m²) × 10</li>
          <li><strong>MS (%)</strong> = peso seco ÷ peso úmido × 100 (média das subamostras) · <strong>Umidade</strong> = 100 − MS</li>
          <li><strong>t MS/ha</strong> = t MV/ha × MS ÷ 100</li>
          <li><strong>Produção do talhão</strong> = t/ha × área do talhão (ha)</li>
          <li><strong>Silagem (t)</strong> = MV total × (1 − perdas) · <strong>Volume (m³)</strong> = silagem × 1000 ÷ densidade</li>
          <li><strong>CV (%)</strong> = desvio padrão ÷ média dos pontos × 100</li>
        </ul>
      </div>
    </>
  );
}

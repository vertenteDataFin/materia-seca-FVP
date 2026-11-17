import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Icone } from '../Icone';
import { Link } from 'react-router-dom';
import { amostrasPorColeta, ultimaColetaPorTalhao, useDados } from '../dados';
import { estimativaTalhao, resumoColeta, statusMS, type ResumoColeta } from '../calc';
import { compararNomes, type Coleta, type Talhao } from '../tipos';
import { Bolinha, Indicador } from '../components';
import { fmt, fmtData } from '../util';
import { useParametros } from '../parametros';
import { nomeComSigla } from '../MapaTalhoes';
import { COR_SEMAFORO, semaforoDe, type Semaforo } from '../semaforo';
import { seriesMS } from '../evolucaoMS';
import GraficoMS from '../GraficoMS';
import { progressoColheita, resumoColheita, type AndamentoTalhao } from '../colheita';

type Coluna = 'nome' | 'capim' | 'data' | 'area' | 'amostras' | 'mvKgM2' | 'tMVha' | 'msPct' | 'tMSha' | 'colheita';

/** Campos do filtro que cada coluna limpa (botão "Limpar" no filtro do título). */
const LIMPAR_FILTRO: Partial<Record<Coluna, Partial<{ busca: string; capim: string; data: string; semaforo: '' }>>> = {
  nome: { busca: '' },
  capim: { capim: '' },
  data: { data: '' },
  msPct: { semaforo: '' },
};

const ROTULO_COLUNA: Record<Coluna, string> = {
  nome: 'talhão', capim: 'capim', data: 'última coleta', area: 'área (ha)', amostras: 'amostras',
  mvKgM2: 'MV (kg/m²)', tMVha: 'MV (t/ha)', msPct: 'MS (%)', tMSha: 'MS (t/ha)', colheita: 'colheita (%)',
};

interface Linha {
  t: Talhao;
  c?: Coleta;
  r: ResumoColeta | null;
  /** Andamento da colheita (só talhões que já tiveram carga). */
  a?: AndamentoTalhao;
}

/** Valor da coluna para ordenar; null = sem valor (fica sempre no fim). */
function valorColuna(l: Linha, col: Coluna): string | number | null {
  switch (col) {
    case 'nome': return l.t.nome;
    case 'capim': return l.t.capim || null;
    case 'data': return l.c?.data ?? null;
    case 'area': return l.t.areaHa;
    case 'amostras': return l.r?.nPontos ?? null;
    case 'colheita': return l.a ? progressoColheita(l.a) : null;
    default: return l.r?.[col] ?? null;
  }
}

export function comparadorColuna(col: Coluna, asc: boolean) {
  return (a: Linha, b: Linha) => {
    const va = valorColuna(a, col);
    const vb = valorColuna(b, col);
    if (va == null && vb == null) return compararNomes(a.t.nome, b.t.nome);
    if (va == null) return 1;
    if (vb == null) return -1;
    const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : compararNomes(String(va), String(vb));
    return (asc ? r : -r) || compararNomes(a.t.nome, b.t.nome);
  };
}

/** Barrinha da colheita na tabela: % colhida, "finalizada" ou "—" se não começou. */
function ProgressoColheita({ a }: { a?: AndamentoTalhao }) {
  if (!a) return <span className="mudo">—</span>;
  const pct = progressoColheita(a);
  // texto curto para caber na coluna do celular; o detalhe vai no title
  const texto = a.finalizada ? '100% ✓' : pct == null ? '—' : `${fmt(pct, 0)}%`;
  const titulo = a.finalizada
    ? 'Colheita finalizada'
    : a.areaColhidaHa != null
      ? `${fmt(a.areaColhidaHa, 1)} de ${fmt(a.talhao.areaHa, 1)} ha colhidos`
      : 'Em colheita, sem amostragem para estimar a área';
  return (
    <Link to="/colheita" className={`progresso-mini${a.finalizada ? ' finalizado' : ''}`} title={titulo}>
      <span className="barra-progresso" aria-hidden="true"><span style={{ width: `${pct ?? 0}%` }} /></span>
      <span className="progresso-texto">{texto}</span>
    </Link>
  );
}

export default function Painel() {
  const parametros = useParametros();
  const dados = useDados();
  const FILTRO_VAZIO = { semaforo: '' as Semaforo | '', capim: '', busca: '', data: '' };
  const [filtro, setFiltro] = useState(FILTRO_VAZIO);
  const [ordem, setOrdem] = useState<{ col: Coluna; asc: boolean } | null>(null);
  // Filtro aberto no título da coluna (computador); fecha ao clicar fora.
  const [filtroAberto, setFiltroAberto] = useState<Coluna | null>(null);
  useEffect(() => {
    if (!filtroAberto) return;
    // leva o cursor para o campo do filtro que abriu
    document.querySelector<HTMLElement>('.popover-filtro input, .popover-filtro select')?.focus();
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Element;
      if (!alvo.closest('.popover-filtro') && !alvo.closest('.filtro-col')) setFiltroAberto(null);
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [filtroAberto]);

  const { linhas, colheita } = useMemo(() => {
    if (!dados) return { linhas: [], colheita: null };
    const ultima = ultimaColetaPorTalhao(dados.coletas);
    const porColeta = amostrasPorColeta(dados.amostras);
    const colheita = resumoColheita(dados.talhoes, dados.cargas, dados.coletas, porColeta, dados.amostrasColheita);
    const linhas = dados.talhoes.map((t) => {
      const c = ultima.get(t.id);
      const r = c ? resumoColeta(c, porColeta.get(c.id) ?? []) : null;
      const e = r ? estimativaTalhao(t.areaHa, r, parametros) : null;
      return { t, c, r, e, a: colheita.porTalhao.get(t.id) };
    });
    return { linhas, colheita };
  }, [dados, parametros]);

  if (!dados || !colheita) return null;

  const soma = (f: (l: (typeof linhas)[number]) => number | null | undefined) =>
    linhas.reduce((s, l) => s + (f(l) ?? 0), 0);
  const areaTotal = soma((l) => l.t.areaHa);
  const mvTotal = soma((l) => l.e?.tMVtotal);
  const msTotal = soma((l) => l.e?.tMStotal);
  const silagemTotal = soma((l) => l.e?.silagemT);
  const volumeTotal = soma((l) => l.e?.volumeM3);
  // MS média ponderada apenas sobre talhões que têm MV e MS
  const mvComMS = soma((l) => (l.e?.tMStotal != null ? l.e.tMVtotal : 0));
  const msPonderada = mvComMS > 0 ? (msTotal / mvComMS) * 100 : null;
  // Produtividade por hectare: média ponderada pela área, só sobre talhões que já têm a medida
  const areaComMV = soma((l) => (l.e?.tMVtotal != null ? l.t.areaHa : 0));
  const areaComMS = soma((l) => (l.e?.tMStotal != null ? l.t.areaHa : 0));
  const porHa = (totalT: number, area: number) => (area > 0 ? (totalT * 1000) / area : null);
  const mvKgHa = porHa(mvTotal, areaComMV);
  const msKgHa = porHa(msTotal, areaComMS);
  const silagemKgHa = porHa(silagemTotal, areaComMV);
  const pctColhidoFazenda = areaTotal > 0 ? (colheita.areaColhidaHa / areaTotal) * 100 : null;
  const contagem: Record<Semaforo, number> = { verde: 0, amarelo: 0, vermelho: 0 };
  for (const l of linhas) contagem[semaforoDe(statusMS(l.r?.msPct ?? null, parametros))]++;
  const capins = [...new Set(dados.talhoes.map((t) => t.capim).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const busca = normal(filtro.busca.trim());
  const filtradas = linhas.filter(
    (l) =>
      (!filtro.semaforo || semaforoDe(statusMS(l.r?.msPct ?? null, parametros)) === filtro.semaforo) &&
      (!filtro.capim || l.t.capim === filtro.capim) &&
      (!busca || normal(`${l.t.nome} ${nomeComSigla(l.t.nome, l.t.fazenda)} ${l.t.fazenda ?? ''}`).includes(busca)) &&
      // data exata da última coleta: talhões sem coleta saem quando há data informada
      (!filtro.data || l.c?.data === filtro.data),
  );
  const temFiltro = !!(filtro.semaforo || filtro.capim || filtro.busca || filtro.data);
  if (ordem) filtradas.sort(comparadorColuna(ordem.col, ordem.asc));

  function alternarOrdem(col: Coluna) {
    // 1º clique: crescente; 2º: decrescente; 3º: volta à ordem natural
    setOrdem(!ordem || ordem.col !== col ? { col, asc: true } : ordem.asc ? { col, asc: false } : null);
  }
  /**
   * Título da coluna: ordena ao tocar; colunas com filtro ganham o ícone de filtro, que abre o campo logo abaixo.
   * É uma função (não um componente) para o campo de busca não ser recriado a cada letra digitada.
   */
  const cab = (col: Coluna, rotulo: ReactNode, className = '', campo?: ReactNode, filtroAtivo = false) => {
    const ativa = ordem?.col === col;
    const aberto = filtroAberto === col;
    return (
      <th key={col} className={`${className} ordenavel${ativa ? ' ativa' : ''}${campo ? ' com-filtro' : ''}`} aria-sort={ativa ? (ordem!.asc ? 'ascending' : 'descending') : 'none'}>
        <div className="cab-col">
          <button type="button" className="ordenar-col" onClick={() => alternarOrdem(col)} title="Ordenar por esta coluna">
            {rotulo}
            <span className="seta" aria-hidden="true"><Icone nome={ativa ? (ordem!.asc ? 'subir' : 'descer') : 'ordenar'} /></span>
          </button>
          {campo && (
            <button
              type="button"
              className={`filtro-col${filtroAtivo ? ' ativo' : ''}`}
              aria-expanded={aberto}
              aria-label={`Filtrar ${ROTULO_COLUNA[col]}${filtroAtivo ? ' (filtro ativo)' : ''}`}
              title={filtroAtivo ? 'Filtro ativo: toque para alterar' : 'Filtrar'}
              onClick={() => setFiltroAberto(aberto ? null : col)}
            >
              <Icone nome="filtro" />
            </button>
          )}
        </div>
        {campo && aberto && (
          <div className="popover-filtro" onKeyDown={(e) => e.key === 'Escape' && setFiltroAberto(null)}>
            {campo}
            <div className="acoes-popover">
              {filtroAtivo && (
                <button type="button" className="link" onClick={() => { setFiltro({ ...filtro, ...LIMPAR_FILTRO[col] }); setFiltroAberto(null); }}>
                  Limpar
                </button>
              )}
              <button type="button" className="mini" onClick={() => setFiltroAberto(null)}>OK</button>
            </div>
          </div>
        )}
      </th>
    );
  };

  // Campos de busca/filtro: os mesmos elementos entram no cabeçalho da tabela (computador) e no bloco do celular
  const campoBusca = (
    <input type="search" value={filtro.busca} onChange={(e) => setFiltro({ ...filtro, busca: e.target.value })} placeholder="Buscar talhão…" aria-label="Buscar talhão" />
  );
  const campoCapim = (
    <select value={filtro.capim} onChange={(e) => setFiltro({ ...filtro, capim: e.target.value })} aria-label="Filtrar por capim">
      <option value="">Capim: todos</option>
      {capins.map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
    </select>
  );
  const campoData = (
    <input type="date" value={filtro.data} onChange={(e) => setFiltro({ ...filtro, data: e.target.value })} aria-label="Data da última coleta" title="Data da última coleta" />
  );
  const campoMS = (
    <select value={filtro.semaforo} onChange={(e) => setFiltro({ ...filtro, semaforo: e.target.value as Semaforo | '' })} aria-label="Filtrar por situação da MS">
      <option value="">MS: todas</option>
      <option value="verde">Pronto para ensilar</option>
      <option value="vermelho">Fora do ponto</option>
      <option value="amarelo">Sem coleta / sem MS</option>
    </select>
  );

  if (!dados.talhoes.length) {
    return (
      <>
        <h1>Painel de produção</h1>
        <div className="cartao">
          <p className="vazio">
            Nenhum talhão cadastrado. <Link to="/talhoes">Ir para Talhões →</Link>
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <h1>Painel de produção</h1>
      <div className="cartao">
        <h2>Resumo de produtividade</h2>
        {/* Grade 3×3: 1ª linha produtividade por hectare (destaque); 2ª e 3ª, totais estimados */}
        <div className="indicadores grade-kpi">
          <div className="kpi-ha"><Indicador rotulo="Massa verde" valor={fmt(mvKgHa, 0)} unidade="kg/ha" /></div>
          <div className="kpi-ha"><Indicador rotulo="Matéria seca" valor={fmt(msKgHa, 0)} unidade="kg MS/ha" /></div>
          <div className="kpi-ha"><Indicador rotulo="Silagem" valor={fmt(silagemKgHa, 0)} unidade="kg/ha" /></div>
          <Indicador rotulo="Massa verde total" valor={fmt(mvTotal)} unidade="t" />
          <Indicador rotulo="Matéria seca total" valor={fmt(msTotal)} unidade="t" />
          <Indicador rotulo="Silagem total" valor={fmt(silagemTotal)} unidade="t" />
          <Indicador rotulo="Área total" valor={fmt(areaTotal, 2)} unidade="ha" />
          <Indicador rotulo="MS média" valor={fmt(msPonderada)} unidade="%" />
          <Indicador rotulo="Volume de silo" valor={fmt(volumeTotal, 0)} unidade="m³" />
        </div>
        <p className="dica">
          Por hectare: média ponderada pela área dos talhões com coleta ({fmt(areaComMV, 2)} de {fmt(areaTotal, 2)} ha). Silagem = massa verde menos as perdas.
          Estimativas com base na coleta mais recente de cada talhão. Perdas: {fmt(parametros.perdasPct, 0)}% · Densidade:{' '}
          {fmt(parametros.densidadeKgM3, 0)} kg/m³ · Faixa ideal de MS: {fmt(parametros.msMin, 0)}–{fmt(parametros.msMax, 0)}% (
          <Link to="/config">alterar</Link>)
        </p>
      </div>

      <div className="cartao">
        <div className="cabecalho-cartao">
          <h2>Resumo de colheita</h2>
          <Link to="/colheita">Abrir colheita →</Link>
        </div>
        {!colheita.porTalhao.size && !colheita.nAmostrasColheita ? (
          <p className="vazio">Nenhuma carga nem amostra de caminhão ainda. A colheita aparece aqui com o relatório da balança e a amostragem de colheita.</p>
        ) : (
          <>
            <div className="indicadores grade-kpi">
              <div className="kpi-ha"><Indicador rotulo="Área colhida" valor={fmt(colheita.areaColhidaHa, 1)} unidade="ha" /></div>
              <div className="kpi-ha">
                <Indicador rotulo="Colhido" valor={fmt(pctColhidoFazenda, pctColhidoFazenda != null && pctColhidoFazenda < 10 ? 1 : 0)} unidade="% da área" />
              </div>
              <div className="kpi-ha"><Indicador rotulo="Ritmo" valor={fmt(colheita.ritmoTdia, 0)} unidade="t/dia" /></div>
              <Indicador rotulo="Massa verde entregue" valor={fmt(colheita.tMV)} unidade="t" />
              <Indicador rotulo="Matéria seca entregue" valor={fmt(colheita.tMS)} unidade="t" />
              <Indicador rotulo="MS da colheita" valor={fmt(colheita.msColheitaPct)} unidade="% (caminhões)" />
            </div>
            <p className="dica">
              {colheita.pesadas} carga{colheita.pesadas === 1 ? '' : 's'} pesada{colheita.pesadas === 1 ? '' : 's'} em {colheita.diasAtivos} dia
              {colheita.diasAtivos === 1 ? '' : 's'} · {colheita.emColheita} talhão(ões) em colheita, {colheita.finalizados} finalizado(s) ·{' '}
              {colheita.nAmostrasColheita} amostra(s) de caminhão com MS
              {colheita.pendentes > 0 && <> · <strong>{colheita.pendentes} aguardando pesagem</strong></>}. A MS da colheita vem dos caminhões amostrados
              (média do talhão no dia da carga); só na falta deles, da amostragem de campo. A massa verde por hectare vem sempre da amostragem de campo.
              Talhão com colheita finalizada conta a área toda.
              {colheita.semReferencia > 0 && <> {colheita.semReferencia} talhão(ões) com carga sem amostragem de campo ficam fora da área colhida.</>}
            </p>
          </>
        )}
      </div>

      <div className="cartao">
        <div className="cabecalho-cartao">
          <h2>Resumo por talhão</h2>
          <span className="semaforo-resumo">
            <span className="selo" style={{ background: COR_SEMAFORO.verde, color: '#fff' }}>{contagem.verde} pronto(s)</span>{' '}
            <span className="selo" style={{ background: COR_SEMAFORO.amarelo, color: '#3a2e00' }}>{contagem.amarelo} sem MS</span>{' '}
            <span className="selo" style={{ background: COR_SEMAFORO.vermelho, color: '#fff' }}>{contagem.vermelho} fora do ponto</span>
          </span>
        </div>
        <p className="dica">
          Última coleta de cada talhão. Toque no talhão para ver o cadastro ou na data para abrir a coleta.
          {temFiltro && (
            <>
              {' '}Mostrando <strong>{filtradas.length}</strong> de {linhas.length} talhões.{' '}
              <button type="button" className="link" onClick={() => setFiltro(FILTRO_VAZIO)}>limpar filtros</button>
            </>
          )}
        </p>
        {/* Celular: busca, depois ordenação, depois filtros (no computador ficam no cabeçalho da tabela) */}
        <div className="controles-cel so-cel">
          {campoBusca}
          <div className="ordenar-cel">
            <select
              value={ordem?.col ?? ''}
              onChange={(e) => setOrdem(e.target.value ? { col: e.target.value as Coluna, asc: ordem?.asc ?? true } : null)}
              aria-label="Ordenar por"
            >
              <option value="">Ordenar: ordem natural</option>
              {(Object.keys(ROTULO_COLUNA) as Coluna[]).map((c) => (
                <option key={c} value={c}>Ordenar por {ROTULO_COLUNA[c]}</option>
              ))}
            </select>
            {ordem && (
              <button type="button" className="mini" onClick={() => setOrdem({ ...ordem, asc: !ordem.asc })} aria-label={ordem.asc ? 'Crescente' : 'Decrescente'}>
                <Icone nome={ordem.asc ? 'subir' : 'descer'} />
              </button>
            )}
          </div>
          <div className="filtros-cel">
            {campoCapim}
            {campoData}
            {campoMS}
          </div>
        </div>
        <div className="rolagem">
          <table className="tabela-cartoes painel-lista">
            <thead className="com-filtros">
              <tr className="titulos">
                {cab('nome', 'Talhão', '', campoBusca, !!filtro.busca)}
                {cab('capim', 'Capim', 'oculta-cel', campoCapim, !!filtro.capim)}
                {cab('data', 'Última coleta', 'oculta-cel', campoData, !!filtro.data)}
                {cab('area', 'Área (ha)', 'n')}
                {cab('amostras', 'Amostras', 'n')}
                {cab('mvKgM2', 'MV (kg/m²)', 'n')}
                {cab('tMVha', 'MV (t/ha)', 'n')}
                {cab('msPct', 'MS (%)', 'n', campoMS, !!filtro.semaforo)}
                {cab('tMSha', 'MS (t/ha)', 'n')}
                {cab('colheita', 'Colheita', 'col-colheita')}
              </tr>
            </thead>
            <tbody>
              {!filtradas.length && (
                <tr>
                  <td colSpan={10} className="vazio largo-cel">Nenhum talhão com esses filtros.</td>
                </tr>
              )}
              {filtradas.map(({ t, c, r, a }) => (
                <tr key={t.id}>
                  <td className="nome-talhao largo-cel">
                    <Bolinha cor={semaforoDe(statusMS(r?.msPct ?? null, parametros))} />{' '}
                    <Link to={`/talhoes?talhao=${t.id}`} title={t.nome}><strong>{nomeComSigla(t.nome, t.fazenda)}</strong></Link>
                    <div className="mudo so-cel">
                      <small>
                        {t.capim || '—'}
                        {c ? <> · <Link to={`/coletas/${c.id}`}>{fmtData(c.data)}</Link></> : <> · sem coleta</>}
                        {c && r?.msPct == null && <> · MS a aferir</>}
                      </small>
                    </div>
                  </td>
                  <td className="oculta-cel">{t.capim || '—'}</td>
                  <td className="oculta-cel">{c ? <Link to={`/coletas/${c.id}`}>{fmtData(c.data)}</Link> : <span className="mudo">sem coleta</span>}</td>
                  <td className="n oculta-cel">{fmt(t.areaHa, 1)}</td>
                  <td className="n oculta-cel">{r ? r.nPontos : '—'}</td>
                  <td className="n oculta-cel">{fmt(r?.mvKgM2, 2)}</td>
                  <td className="n" data-rotulo="MV t/ha">{fmt(r?.tMVha)}</td>
                  <td className="n" data-rotulo="MS %">{fmt(r?.msPct)}</td>
                  <td className="n" data-rotulo="MS t/ha">{fmt(r?.tMSha)}</td>
                  <td className="n col-colheita" data-rotulo="Colheita">
                    <ProgressoColheita a={a} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="cartao">
        <h2>Evolução da MS por talhão</h2>
        <GraficoMS series={seriesMS(filtradas.map((l) => l.t), dados.coletas, dados.amostras)} parametros={parametros} />
      </div>
    </>
  );
}

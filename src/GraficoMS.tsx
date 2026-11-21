import { Fragment, useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import type { Parametros } from './calc';
import { diaDe, faixaDias, faixaMS, type PontoMS, type SerieMS } from './evolucaoMS';
import { Icone } from './Icone';
import { nomeComSigla } from './MapaTalhoes';
import { fmt, fmtData } from './util';

const L = 150; // largura lógica do desenho (viewBox); a largura real vem do CSS
const A = 96; // altura lógica (no gráfico ampliado, acompanha o formato da tela)
const M = { topo: 8, dir: 10, base: 18, esq: 26 };

interface Escalas {
  x: (dia: number) => number;
  y: (ms: number) => number;
  dias: [number, number];
  ms: [number, number];
}

function escalas(dias: [number, number], ms: [number, number], larg = L, alt = A): Escalas {
  const x = (d: number) => M.esq + ((d - dias[0]) / (dias[1] - dias[0])) * (larg - M.esq - M.dir);
  const y = (v: number) => M.topo + ((ms[1] - v) / (ms[1] - ms[0])) * (alt - M.topo - M.base);
  return { x, y, dias, ms };
}

/** Datas para marcar no eixo do tempo: primeira, última e, se couber, as do meio. */
function marcasTempo(dias: [number, number]): number[] {
  const [a, b] = dias;
  const n = b - a;
  if (n <= 0) return [a];
  const passo = n <= 14 ? Math.max(1, Math.ceil(n / 3)) : n <= 60 ? 7 : n <= 180 ? 30 : 90;
  const marcas: number[] = [];
  for (let d = a; d <= b; d += passo) marcas.push(d);
  if (marcas[marcas.length - 1] !== b) marcas.push(b);
  return marcas;
}

function dataDoDia(dia: number): string {
  return new Date(dia * 86400000).toISOString().slice(0, 10);
}

function dataCurta(iso: string): string {
  return fmtData(iso).slice(0, 5); // dd/mm
}

/**
 * Tamanho lógico do desenho ampliado: ocupa a tela (descontado o título) com cerca de 2,6 px por unidade,
 * para letras e pontos ficarem do mesmo tamanho no celular e no computador.
 */
function tamanhoTela(): { larg: number; alt: number } {
  const w = Math.max(240, window.innerWidth - 32);
  const h = Math.max(200, window.innerHeight - 90);
  const larg = Math.max(L, w / 2.6);
  return { larg, alt: Math.max(A * 0.8, (h * larg) / w) };
}

/** Pixels por unidade lógica no gráfico em linha: letras e pontos do mesmo tamanho em qualquer largura. */
const PX_POR_UNIDADE = 2.2;

/** Um painel: a MS média de cada coleta de um talhão ao longo do tempo, com a faixa ideal ao fundo. */
function PainelMS({ serie, faixa, p }: { serie: SerieMS; faixa: { dias: [number, number]; ms: [number, number] }; p: Parametros }) {
  const navigate = useNavigate();
  const [ativo, setAtivo] = useState<PontoMS | null>(null);
  const [expandido, setExpandido] = useState(false);
  const [tela, setTela] = useState({ larg: L, alt: A });
  // Um gráfico por linha: a largura lógica acompanha a largura do cartão; a altura fica fixa.
  const figRef = useRef<HTMLElement>(null);
  const [largLinha, setLargLinha] = useState(L);
  useEffect(() => {
    const el = figRef.current;
    if (!el || expandido) return;
    const medir = () => setLargLinha(Math.max(L, el.clientWidth / PX_POR_UNIDADE));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [expandido]);

  // Ampliado: acompanha o tamanho da tela, fecha com Esc e trava a rolagem da página por trás.
  useEffect(() => {
    if (!expandido) return;
    const medir = () => setTela(tamanhoTela());
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandido(false);
    };
    medir();
    window.addEventListener('resize', medir);
    window.addEventListener('keydown', tecla);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('resize', medir);
      window.removeEventListener('keydown', tecla);
      document.body.style.overflow = overflow;
    };
  }, [expandido]);

  const { larg, alt } = expandido ? tela : { larg: largLinha, alt: A };
  const esc = escalas(faixa.dias, faixa.ms, larg, alt);
  const pontos = serie.pontos;
  const medidos = pontos.filter((pt): pt is PontoMS & { msPct: number } => pt.msPct != null);
  const caminho = medidos.map((pt, i) => `${i ? 'L' : 'M'}${esc.x(diaDe(pt.data)).toFixed(1)},${esc.y(pt.msPct).toFixed(1)}`).join(' ');
  const ultimo = medidos[medidos.length - 1];
  const yBase = alt - M.base;
  const yDe = (pt: PontoMS) => (pt.msPct == null ? yBase : esc.y(pt.msPct));
  const yTicks: number[] = [];
  for (let v = esc.ms[0]; v <= esc.ms[1]; v += 10) yTicks.push(v);

  /** Ponto (coleta) mais perto do cursor/dedo na horizontal; null se longe de todos. */
  function pontoPerto(e: PointerEvent<SVGSVGElement> | MouseEvent<SVGSVGElement>): PontoMS | null {
    const r = e.currentTarget.getBoundingClientRect();
    const xl = ((e.clientX - r.left) / r.width) * larg;
    let melhor: PontoMS | null = null;
    let dist = Infinity;
    for (const pt of pontos) {
      const d = Math.abs(esc.x(diaDe(pt.data)) - xl);
      if (d < dist) {
        dist = d;
        melhor = pt;
      }
    }
    return dist <= 14 ? melhor : null;
  }

  function aoMover(e: PointerEvent<SVGSVGElement>) {
    setAtivo(pontoPerto(e));
  }

  // Pequeno: o toque amplia o gráfico. Ampliado: o toque no ponto abre a coleta com os resultados.
  function aoClicar(e: MouseEvent<SVGSVGElement>) {
    if (!expandido) {
      setAtivo(null);
      setExpandido(true);
      return;
    }
    const pt = pontoPerto(e);
    if (pt) navigate(pt.link);
  }

  const xInicio = serie.inicioColheita ? esc.x(diaDe(serie.inicioColheita)) : 0;
  const yFaixaTopo = esc.y(p.msMax);
  const yFaixaBase = esc.y(p.msMin);
  const xUltimo = ultimo ? esc.x(diaDe(ultimo.data)) : 0;
  const rotuloADireita = xUltimo < larg - M.dir - 22;
  const descricao = pontos.map((pt) => `${fmtData(pt.data)} ${pt.msPct == null ? 'a aferir' : `${fmt(pt.msPct)}%`}`).join(', ');

  const figura = (
    <figure ref={expandido ? undefined : figRef} className={`grafico-ms${expandido ? ' grafico-ms-tela' : ''}`}>
      <figcaption>
        <Link to={`/talhoes?talhao=${serie.talhao.id}`}><strong>{nomeComSigla(serie.talhao.nome, serie.talhao.fazenda)}</strong></Link>
        <span className="mudo"> {serie.talhao.capim}</span>
        {expandido && (
          <button type="button" className="icone-acao grafico-ms-fechar" onClick={() => setExpandido(false)} aria-label="Fechar o gráfico ampliado" title="Fechar (Esc)">
            <Icone nome="fechar" />
          </button>
        )}
      </figcaption>
      <div className="grafico-ms-area">
        <svg
          viewBox={`0 0 ${larg} ${alt}`}
          role="img"
          aria-label={`Evolução da MS de ${nomeComSigla(serie.talhao.nome, serie.talhao.fazenda)}: ${descricao}`}
          onPointerMove={aoMover}
          onPointerDown={aoMover}
          onPointerLeave={() => setAtivo(null)}
          onClick={aoClicar}
          style={{ cursor: !expandido ? 'zoom-in' : ativo ? 'pointer' : 'default' }}
        >
          <rect className="faixa-ideal" x={M.esq} y={yFaixaTopo} width={larg - M.esq - M.dir} height={Math.max(0, yFaixaBase - yFaixaTopo)} />
          {yTicks.map((v) => (
            <g key={v}>
              <line className="grade" x1={M.esq} x2={larg - M.dir} y1={esc.y(v)} y2={esc.y(v)} />
              <text className="eixo" x={M.esq - 3} y={esc.y(v) + 2.5} textAnchor="end">{v}</text>
            </g>
          ))}
          {marcasTempo(esc.dias).map((d) => (
            <text key={d} className="eixo" x={esc.x(d)} y={alt - 5} textAnchor={d === esc.dias[0] ? 'start' : d === esc.dias[1] ? 'end' : 'middle'}>
              {dataCurta(dataDoDia(d))}
            </text>
          ))}
          {serie.inicioColheita && (
            <g className="inicio-colheita">
              <line x1={xInicio} x2={xInicio} y1={M.topo} y2={yBase} />
              <text x={xInicio > larg - M.dir - 30 ? xInicio - 1.5 : xInicio + 1.5} y={M.topo + 4} textAnchor={xInicio > larg - M.dir - 30 ? 'end' : 'start'}>
                colheita
              </text>
            </g>
          )}
          {caminho && <path className="linha" d={caminho} />}
          {ativo && <line className="cursor" x1={esc.x(diaDe(ativo.data))} x2={esc.x(diaDe(ativo.data))} y1={M.topo} y2={yBase} />}
          {pontos.map((pt) => {
            const r = ativo?.coletaId === pt.coletaId ? 4.5 : 3.5;
            const cls = `ponto${pt.msPct == null ? ' pendente' : ''}${ativo?.coletaId === pt.coletaId ? ' ativo' : ''}`;
            const cx = esc.x(diaDe(pt.data));
            const cy = yDe(pt);
            // amostra de caminhão (colheita): quadrado; coleta de campo: redondo
            return pt.origem === 'colheita' ? (
              <rect key={pt.coletaId} className={cls} x={cx - r * 0.9} y={cy - r * 0.9} width={r * 1.8} height={r * 1.8} />
            ) : (
              <circle key={pt.coletaId} className={cls} cx={cx} cy={cy} r={r} />
            );
          })}
          {!ativo && ultimo && (
            // rótulo do último valor: à direita do ponto; se não couber, acima dele
            <text
              className="valor"
              x={rotuloADireita ? xUltimo + 6 : xUltimo + 3}
              y={rotuloADireita ? esc.y(ultimo.msPct) + 2.5 : esc.y(ultimo.msPct) - 6.5}
              textAnchor={rotuloADireita ? 'start' : 'end'}
            >
              {fmt(ultimo.msPct)}%
            </text>
          )}
        </svg>
        {ativo && (
          <div
            className={`grafico-ms-dica ${esc.x(diaDe(ativo.data)) < larg * 0.3 ? 'esq' : esc.x(diaDe(ativo.data)) > larg * 0.7 ? 'dir' : ''}`}
            style={{ left: `${(esc.x(diaDe(ativo.data)) / larg) * 100}%`, top: `${(yDe(ativo) / alt) * 100}%` }}
          >
            <strong>{ativo.msPct == null ? 'MS a aferir' : `${fmt(ativo.msPct)}% MS`}{ativo.origem === 'colheita' ? ' · colheita' : ''}</strong>
            <br />
            <Link to={ativo.link}>{fmtData(ativo.data)}</Link> · {ativo.msPct == null ? ativo.nPontos : ativo.nPontosMS} {ativo.origem === 'colheita' ? 'caminhão(ões)' : 'amostra(s)'}
          </div>
        )}
      </div>
    </figure>
  );

  // Ampliado: o gráfico vai para uma camada de tela cheia; no lugar dele fica um espaço vazio do mesmo tamanho.
  return expandido ? (
    <>
      <figure className="grafico-ms grafico-ms-reserva" aria-hidden="true" style={{ height: A * PX_POR_UNIDADE + 24 }} />
      {createPortal(
        <div className="grafico-ms-fundo" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && setExpandido(false)}>
          {figura}
        </div>,
        document.body,
      )}
    </>
  ) : (
    figura
  );
}

/** Tabela de MS por talhão e data (padrão); tocar no talhão abre o gráfico dele logo abaixo. Alterna para todos os gráficos. */
export default function GraficoMS({ series, parametros }: { series: SerieMS[]; parametros: Parametros }) {
  const [tabela, setTabela] = useState(true);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const alternar = (id: string) =>
    setAbertos((a) => {
      const n = new Set(a);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  if (!series.length) return <p className="vazio">Nenhuma coleta ainda.</p>;
  const faixa = { dias: faixaDias(series), ms: faixaMS(series, parametros.msMin, parametros.msMax) };
  const datas = [...new Set(series.flatMap((s) => s.pontos.map((pt) => pt.data)))].sort();

  return (
    <>
      <p className="dica">
        MS média de cada coleta, por talhão, ao longo do tempo: ● amostragem de campo, ■ amostras de caminhão na colheita (média do dia); a linha tracejada marca o início da colheita. A faixa verde é o ponto de ensilar ({fmt(parametros.msMin, 0)}–{fmt(parametros.msMax, 0)}%).
        Ponto vazio na base = coleta ainda sem MS (a aferir no laboratório). {tabela ? 'Toque no nome do talhão para ver o gráfico dele.' : ''} Toque num gráfico para ampliar; no ampliado, toque num ponto para abrir a coleta e ver os resultados.{' '}
        <button type="button" className="link" onClick={() => setTabela(!tabela)}>{tabela ? 'ver todos os gráficos' : 'ver tabela'}</button>
      </p>
      {tabela ? (
        <div className="rolagem">
          <table className="tabela-cartoes tabela-simples">
            <thead>
              <tr>
                <th>Talhão</th>
                {datas.map((d) => <th key={d} className="n">{dataCurta(d)}</th>)}
              </tr>
            </thead>
            <tbody>
              {series.map((s) => (
                <Fragment key={s.talhao.id}>
                <tr className={abertos.has(s.talhao.id) ? 'linha-sel' : ''}>
                  <td className="largo-cel">
                    <button type="button" className="link link-talhao-ms" aria-expanded={abertos.has(s.talhao.id)} onClick={() => alternar(s.talhao.id)} title="Ver o gráfico deste talhão">
                      <span className="seta-ms" aria-hidden="true">{abertos.has(s.talhao.id) ? '▾' : '▸'}</span> <strong>{nomeComSigla(s.talhao.nome, s.talhao.fazenda)}</strong>
                    </button>
                  </td>
                  {datas.map((d) => {
                    const pt = s.pontos.find((x) => x.data === d);
                    // No celular (cartões) ficam só as 4 últimas amostras do talhão
                    const recente = [...new Set(s.pontos.map((x) => x.data))].slice(-4).includes(d);
                    return (
                      <td key={d} className={recente ? 'n' : 'n oculta-cel'} data-rotulo={dataCurta(d)}>
                        {!pt ? '—' : <Link to={pt.link}>{pt.msPct == null ? 'a aferir' : `${fmt(pt.msPct)}%`}</Link>}
                      </td>
                    );
                  })}
                </tr>
                {abertos.has(s.talhao.id) && (
                  <tr className="linha-detalhe linha-grafico-ms">
                    <td colSpan={datas.length + 1}>
                      <PainelMS serie={s} faixa={faixa} p={parametros} />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="graficos-ms">
          {series.map((s) => <PainelMS key={s.talhao.id} serie={s} faixa={faixa} p={parametros} />)}
        </div>
      )}
    </>
  );
}

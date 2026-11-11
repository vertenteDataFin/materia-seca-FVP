import { useState, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Parametros } from './calc';
import { diaDe, faixaDias, faixaMS, type PontoMS, type SerieMS } from './evolucaoMS';
import { nomeCurto } from './MapaTalhoes';
import { fmt, fmtData } from './util';

const L = 150; // largura lógica do desenho (viewBox); a largura real vem do CSS
const A = 96; // altura lógica
const M = { topo: 8, dir: 10, base: 18, esq: 26 };

interface Escalas {
  x: (dia: number) => number;
  y: (ms: number) => number;
  dias: [number, number];
  ms: [number, number];
}

function escalas(series: SerieMS[], p: Parametros): Escalas {
  const dias = faixaDias(series);
  const ms = faixaMS(series, p.msMin, p.msMax);
  const x = (d: number) => M.esq + ((d - dias[0]) / (dias[1] - dias[0])) * (L - M.esq - M.dir);
  const y = (v: number) => M.topo + ((ms[1] - v) / (ms[1] - ms[0])) * (A - M.topo - M.base);
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

/** Um painel: a MS média de cada coleta de um talhão ao longo do tempo, com a faixa ideal ao fundo. */
function PainelMS({ serie, esc, p }: { serie: SerieMS; esc: Escalas; p: Parametros }) {
  const [ativo, setAtivo] = useState<PontoMS | null>(null);
  const pontos = serie.pontos;
  const medidos = pontos.filter((pt): pt is PontoMS & { msPct: number } => pt.msPct != null);
  const caminho = medidos.map((pt, i) => `${i ? 'L' : 'M'}${esc.x(diaDe(pt.data)).toFixed(1)},${esc.y(pt.msPct).toFixed(1)}`).join(' ');
  const ultimo = medidos[medidos.length - 1];
  const yBase = A - M.base;
  const yDe = (pt: PontoMS) => (pt.msPct == null ? yBase : esc.y(pt.msPct));
  const yTicks: number[] = [];
  for (let v = esc.ms[0]; v <= esc.ms[1]; v += 10) yTicks.push(v);

  function aoMover(e: PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const xl = ((e.clientX - r.left) / r.width) * L;
    let melhor: PontoMS | null = null;
    let dist = Infinity;
    for (const pt of pontos) {
      const d = Math.abs(esc.x(diaDe(pt.data)) - xl);
      if (d < dist) {
        dist = d;
        melhor = pt;
      }
    }
    setAtivo(dist <= 14 ? melhor : null);
  }

  const yFaixaTopo = esc.y(p.msMax);
  const yFaixaBase = esc.y(p.msMin);
  const xUltimo = ultimo ? esc.x(diaDe(ultimo.data)) : 0;
  const rotuloADireita = xUltimo < L - M.dir - 22;
  const descricao = pontos.map((pt) => `${fmtData(pt.data)} ${pt.msPct == null ? 'a aferir' : `${fmt(pt.msPct)}%`}`).join(', ');

  return (
    <figure className="grafico-ms">
      <figcaption>
        <Link to={`/talhoes?talhao=${serie.talhao.id}`}><strong>{nomeCurto(serie.talhao.nome)}</strong></Link>
        <span className="mudo"> {serie.talhao.capim}</span>
      </figcaption>
      <div className="grafico-ms-area">
        <svg
          viewBox={`0 0 ${L} ${A}`}
          role="img"
          aria-label={`Evolução da MS de ${nomeCurto(serie.talhao.nome)}: ${descricao}`}
          onPointerMove={aoMover}
          onPointerDown={aoMover}
          onPointerLeave={() => setAtivo(null)}
        >
          <rect className="faixa-ideal" x={M.esq} y={yFaixaTopo} width={L - M.esq - M.dir} height={Math.max(0, yFaixaBase - yFaixaTopo)} />
          {yTicks.map((v) => (
            <g key={v}>
              <line className="grade" x1={M.esq} x2={L - M.dir} y1={esc.y(v)} y2={esc.y(v)} />
              <text className="eixo" x={M.esq - 3} y={esc.y(v) + 2.5} textAnchor="end">{v}</text>
            </g>
          ))}
          {marcasTempo(esc.dias).map((d) => (
            <text key={d} className="eixo" x={esc.x(d)} y={A - 5} textAnchor={d === esc.dias[0] ? 'start' : d === esc.dias[1] ? 'end' : 'middle'}>
              {dataCurta(dataDoDia(d))}
            </text>
          ))}
          {caminho && <path className="linha" d={caminho} />}
          {ativo && <line className="cursor" x1={esc.x(diaDe(ativo.data))} x2={esc.x(diaDe(ativo.data))} y1={M.topo} y2={yBase} />}
          {pontos.map((pt) => (
            <circle
              key={pt.coletaId}
              className={`ponto${pt.msPct == null ? ' pendente' : ''}${ativo?.coletaId === pt.coletaId ? ' ativo' : ''}`}
              cx={esc.x(diaDe(pt.data))}
              cy={yDe(pt)}
              r={ativo?.coletaId === pt.coletaId ? 4.5 : 3.5}
            />
          ))}
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
            className={`grafico-ms-dica ${esc.x(diaDe(ativo.data)) < L * 0.3 ? 'esq' : esc.x(diaDe(ativo.data)) > L * 0.7 ? 'dir' : ''}`}
            style={{ left: `${(esc.x(diaDe(ativo.data)) / L) * 100}%`, top: `${(yDe(ativo) / A) * 100}%` }}
          >
            <strong>{ativo.msPct == null ? 'MS a aferir' : `${fmt(ativo.msPct)}% MS`}</strong>
            <br />
            <Link to={`/coletas/${ativo.coletaId}`}>{fmtData(ativo.data)}</Link> · {ativo.msPct == null ? ativo.nPontos : ativo.nPontosMS} amostra(s)
          </div>
        )}
      </div>
    </figure>
  );
}

/** Pequenos múltiplos: um painel por talhão, mesmas escalas de tempo e de MS. Alterna para tabela. */
export default function GraficoMS({ series, parametros }: { series: SerieMS[]; parametros: Parametros }) {
  const [tabela, setTabela] = useState(false);
  if (!series.length) return <p className="vazio">Nenhuma coleta ainda.</p>;
  const esc = escalas(series, parametros);
  const datas = [...new Set(series.flatMap((s) => s.pontos.map((pt) => pt.data)))].sort();

  return (
    <>
      <p className="dica">
        MS média de cada coleta, por talhão, ao longo do tempo. A faixa verde é o ponto de ensilar ({fmt(parametros.msMin, 0)}–{fmt(parametros.msMax, 0)}%).
        Ponto vazio na base = coleta ainda sem MS (a aferir no laboratório). Toque num ponto para ver a coleta.{' '}
        <button type="button" className="link" onClick={() => setTabela(!tabela)}>{tabela ? 'ver gráfico' : 'ver tabela'}</button>
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
                <tr key={s.talhao.id}>
                  <td className="largo-cel"><strong>{nomeCurto(s.talhao.nome)}</strong></td>
                  {datas.map((d) => {
                    const pt = s.pontos.find((x) => x.data === d);
                    return (
                      <td key={d} className="n" data-rotulo={dataCurta(d)}>
                        {!pt ? '—' : pt.msPct == null ? <span className="mudo">a aferir</span> : `${fmt(pt.msPct)}%`}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="graficos-ms">
          {series.map((s) => <PainelMS key={s.talhao.id} serie={s} esc={esc} p={parametros} />)}
        </div>
      )}
    </>
  );
}

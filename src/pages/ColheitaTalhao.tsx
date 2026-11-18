import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { amostrasPorColeta, useDados } from '../dados';
import {
  andamentoTalhao,
  cargaPesada,
  fmtSaida,
  liquidoKg,
  msColheitaPorTalhao,
  referenciaDoTalhao,
  textoProgresso,
  tituloProgresso,
} from '../colheita';
import { msColheita, pennState } from '../amostragemColheita';
import { fmt } from '../util';
import type { Talhao } from '../tipos';
import { peFdnDaAmostra, rotuloPeFdn, textoPeFdn, useConfigFdn } from '../fdn';
import { PercentuaisPenn } from '../PennState';

const MAX_CARGAS = 10;

/**
 * Colheita no detalhe do talhão: andamento (% colhido, entregue, MS dos caminhões), as amostras de
 * caminhão e as cargas da balança deste talhão. Mesmos cálculos da página Colheita e do Painel.
 */
export default function ColheitaTalhao({ talhao: t }: { talhao: Talhao }) {
  const dados = useDados();
  const cfgFdn = useConfigFdn();
  const info = useMemo(() => {
    if (!dados) return null;
    const cargas = dados.cargas.filter((c) => c.talhaoId === t.id);
    const amostras = dados.amostrasColheita.filter((a) => a.talhaoId === t.id); // já em ordem: mais recente primeiro
    const ref = referenciaDoTalhao(t.id, dados.coletas, amostrasPorColeta(dados.amostras));
    const msCol = msColheitaPorTalhao(dados.amostrasColheita).get(t.id) ?? null;
    return {
      andamento: cargas.length ? andamentoTalhao(t, dados.cargas, ref, msCol) : null,
      pesadas: cargas.filter(cargaPesada).sort((a, b) => b.saidaEm.localeCompare(a.saidaEm)),
      amostras,
      msCol,
    };
  }, [dados, t]);

  if (!info) return null;
  const { andamento: a, pesadas, amostras, msCol } = info;

  if (!a && !amostras.length) {
    return (
      <>
        <h3 className="titulo-secao-talhao">Colheita neste talhão</h3>
        <p className="vazio">Sem cargas nem amostras de caminhão ainda.</p>
      </>
    );
  }

  return (
    <div className="colheita-talhao">
      <div className="cabecalho-cartao">
        <h3 className="titulo-secao-talhao">
          Colheita neste talhão{' '}
          {a && (a.finalizada ? <span className="selo selo-ideal">finalizada</span> : <span className="selo selo-baixo">em colheita</span>)}
        </h3>
        <Link to="/colheita">Abrir colheita →</Link>
      </div>

      {a && (
        <div className="andamento-numeros">
          <div title={tituloProgresso(a)}>
            <span>Colhido</span>
            <strong>{textoProgresso(a)}</strong>
            {a.areaColhidaHa != null && !a.finalizada && <small className="mudo">{fmt(a.areaColhidaHa, 1)} de {fmt(t.areaHa, 1)} ha</small>}
          </div>
          <div><span>Entregue</span><strong>{fmt(a.tMV, 1)} t</strong></div>
          <div><span>MS entregue</span><strong>{a.tMS != null ? `${fmt(a.tMS, 1)} t` : '—'}</strong></div>
          <div><span>Cargas</span><strong>{a.pesadas}</strong></div>
          <div><span>Ritmo</span><strong>{a.ritmoTdia != null ? `${fmt(a.ritmoTdia, 0)} t/dia` : '—'}</strong></div>
          <div>
            <span>MS caminhões</span>
            <strong>{msCol ? `${fmt(msCol.media, 1)}%` : '—'}</strong>
            {msCol && <small className="mudo">{msCol.n} amostra{msCol.n === 1 ? '' : 's'}</small>}
          </div>
        </div>
      )}
      {!a && msCol && (
        <p className="dica">MS dos caminhões: <strong>{fmt(msCol.media, 1)}%</strong> em {msCol.n} amostra{msCol.n === 1 ? '' : 's'}. Ainda sem cargas da balança.</p>
      )}

      {amostras.length > 0 && (
        <>
          <h4>Amostras de caminhão</h4>
          <div className="rolagem">
            <table className="tabela-cartoes lista-compacta">
              <thead>
                <tr>
                  <th>Amostra</th>
                  <th className="oculta-cel">Silo</th>
                  <th className="n">MS %</th>
                  <th className="n oculta-cel">Penn State % <small className="mudo">(19·8·4·F)</small></th>
                  <th className="n th-fdnfe">{rotuloPeFdn(cfgFdn.pef)} %</th>
                </tr>
              </thead>
              <tbody>
                {amostras.map((x) => {
                  const ps = pennState(x);
                  const ms = msColheita(x);
                  return (
                    <tr key={x.id}>
                      <td className="nome-talhao largo-cel">
                        <strong className="sem-quebra">{x.codigo ?? x.placa}</strong>
                        <div className="mudo">
                          <small>
                            {fmtSaida(x.coletadaEm)} · {x.placa}
                            {x.motorista && <span className="oculta-cel"> · {x.motorista}</span>}
                          </small>
                        </div>
                        {ps && <div className="so-cel mudo"><small>Penn State: <PercentuaisPenn pct={ps.pct} /> %</small></div>}
                      </td>
                      <td className="oculta-cel">{x.silo}</td>
                      <td className="n" data-rotulo="MS %">{ms == null ? <span className="mudo">aguardando</span> : fmt(ms)}</td>
                      <td className="n oculta-cel" data-rotulo="Penn State %">{ps ? <PercentuaisPenn pct={ps.pct} /> : '—'}</td>
                      <td className="n" data-rotulo="FDNfe %">{textoPeFdn(peFdnDaAmostra(x, t.capim, cfgFdn), cfgFdn.pef) ?? <span className="mudo">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {pesadas.length > 0 && (
        <>
          <h4>Cargas da balança</h4>
          <div className="rolagem">
            <table className="tabela-cartoes lista-compacta">
              <thead>
                <tr>
                  <th>Romaneio</th>
                  <th>Pesagem</th>
                  <th className="oculta-cel">Caminhão</th>
                  <th className="oculta-cel">Silo</th>
                  <th className="n">Líquido t</th>
                </tr>
              </thead>
              <tbody>
                {pesadas.slice(0, MAX_CARGAS).map((c) => (
                  <tr key={c.id}>
                    <td className="nome-talhao largo-cel"><strong>{c.romaneio || '—'}</strong></td>
                    <td>{fmtSaida(c.saidaEm)}</td>
                    <td className="oculta-cel">{c.placa || '—'}{c.motorista ? <span className="mudo"><small> · {c.motorista}</small></span> : null}</td>
                    <td className="oculta-cel">{c.silo || '—'}</td>
                    <td className="n">{fmt((liquidoKg(c) ?? 0) / 1000, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pesadas.length > MAX_CARGAS && (
            <p className="dica">
              Mostrando as {MAX_CARGAS} mais recentes de {pesadas.length}. <Link to="/colheita">Ver todas na Colheita →</Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { amostrasPorColeta, atualizarTalhao, useDados } from '../dados';
import { compararColetasDesc, type Talhao } from '../tipos';
import { areaAnelM2 } from '../kml';
import { capimFoto, mesmoCapim } from '../capinsFoto';
import { resumoColeta, statusMS } from '../calc';
import { CampoNumero, SeloMS } from '../components';
import { fmt, fmtData, lerParametros } from '../util';
import { usePermissoes } from '../permissoes';

function Fonte({ rotulo, valor, confere }: { rotulo: string; valor: string; confere?: boolean | null }) {
  return (
    <tr>
      <th>{rotulo}</th>
      <td>
        {valor || <span className="mudo">—</span>}
        {confere === false && <span className="selo selo-alto" style={{ marginLeft: '0.5rem' }}>diverge</span>}
        {confere === true && <span className="selo selo-ideal" style={{ marginLeft: '0.5rem' }}>confere</span>}
      </td>
    </tr>
  );
}

export default function DetalheTalhao({ talhao: t, aoFechar, aoEditar }: { talhao: Talhao; aoFechar: () => void; aoEditar: (t: Talhao) => void }) {
  const parametros = lerParametros();
  const dados = useDados();
  const { podeEditarTalhoes } = usePermissoes();
  const coletas = useMemo(() => {
    if (!dados) return [];
    const porColeta = amostrasPorColeta(dados.amostras);
    return dados.coletas
      .filter((c) => c.talhaoId === t.id)
      .sort(compararColetasDesc)
      .map((c) => ({ c, r: resumoColeta(c, porColeta.get(c.id) ?? []) }));
  }, [dados, t.id]);

  const areaPoligono = useMemo(
    () => (t.geometria?.length ? t.geometria.reduce((s, anel) => s + areaAnelM2(anel), 0) / 10000 : null),
    [t.geometria],
  );
  const foto = capimFoto(t.nome);
  const kmlVsFoto = t.capimKml && foto ? mesmoCapim(t.capimKml, foto) : null;
  const difArea = t.areaKmlHa && areaPoligono ? (areaPoligono / t.areaKmlHa - 1) * 100 : null;

  const usarCapim = (c: string) => atualizarTalhao(t.id, { capim: c });
  const usarArea = (a: number) => atualizarTalhao(t.id, { areaHa: Math.round(a * 100) / 100 });

  return (
    <div className="cartao detalhe">
      <div className="cabecalho-cartao">
        <h2>
          {t.nome} {t.fazenda && <small className="mudo">· Faz. {t.fazenda}</small>}
        </h2>
        <div className="acoes">
          <Link className="botao" to={`/coletas/nova?talhao=${t.id}`}>+ Nova coleta</Link>
          {podeEditarTalhoes && <button onClick={() => aoEditar(t)}>Editar</button>}
          <button onClick={aoFechar} aria-label="Fechar">✕</button>
        </div>
      </div>

      <div className="colunas">
        <div>
          <h3>Capim</h3>
          <table className="tabela-fontes">
            <tbody>
              <Fonte rotulo="KML (atividade)" valor={t.capimKml ?? ''} />
              <Fonte rotulo="Mapa (foto)" valor={foto ?? ''} confere={kmlVsFoto} />
              <tr>
                <th>Em uso</th>
                <td>
                  <strong>{t.capim || '—'}</strong>
                  {podeEditarTalhoes && (
                    <div className="acoes" style={{ marginTop: '0.4rem' }}>
                      {t.capimKml && !mesmoCapim(t.capim, t.capimKml) && <button onClick={() => usarCapim(t.capimKml!)}>Usar do KML</button>}
                      {foto && !mesmoCapim(t.capim, foto) && <button onClick={() => usarCapim(foto)}>Usar da foto</button>}
                    </div>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
          {kmlVsFoto === false && (
            <p className="aviso">KML e foto discordam sobre o capim deste talhão. Confirme em campo e escolha acima.</p>
          )}
        </div>

        <div>
          <h3>Área (ha)</h3>
          <table className="tabela-fontes">
            <tbody>
              <Fonte rotulo="Declarada no KML" valor={fmt(t.areaKmlHa, 2)} />
              <Fonte
                rotulo="Polígono desenhado"
                valor={areaPoligono != null ? `${fmt(areaPoligono, 2)}${difArea != null ? ` (${difArea > 0 ? '+' : ''}${fmt(difArea, 0)}%)` : ''}` : ''}
                confere={difArea == null ? null : Math.abs(difArea) <= 5}
              />
              <tr>
                <th>Em uso</th>
                <td>
                  {podeEditarTalhoes ? (
                    <>
                      <CampoNumero valor={t.areaHa} ariaLabel="Área em uso" aoSalvar={(v) => v != null && v > 0 && usarArea(v)} />
                      <div className="acoes" style={{ marginTop: '0.4rem' }}>
                        {t.areaKmlHa && Math.abs(t.areaHa - t.areaKmlHa) > 0.01 && <button onClick={() => usarArea(t.areaKmlHa!)}>Usar declarada</button>}
                        {areaPoligono != null && Math.abs(t.areaHa - areaPoligono) > 0.01 && <button onClick={() => usarArea(areaPoligono)}>Usar polígono</button>}
                      </div>
                    </>
                  ) : (
                    <strong>{fmt(t.areaHa, 2)}</strong>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
          {difArea != null && Math.abs(difArea) > 5 && (
            <p className="aviso">O contorno desenhado difere {fmt(Math.abs(difArea), 0)}% da área declarada — confira qual é a área real.</p>
          )}
        </div>
      </div>

      <h3>Coletas neste talhão</h3>
      {!dados ? null : !coletas.length ? (
        <p className="vazio">Nenhuma coleta ainda.</p>
      ) : (
        <div className="rolagem">
          <table className="tabela-cartoes">
            <thead>
              <tr>
                <th>Data</th>
                <th>Responsável</th>
                <th className="n">Pontos</th>
                <th className="n">t MV/ha</th>
                <th className="n">MS %</th>
                <th className="n">t MS/ha</th>
                <th>Situação</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {coletas.map(({ c, r }) => (
                <tr key={c.id}>
                  <td className="largo-cel">
                    <strong>{fmtData(c.data)}</strong>
                    <span className="so-cel mudo"><small>{c.responsavel || 'sem responsável'} <SeloMS status={statusMS(r.msPct, parametros)} /></small></span>
                  </td>
                  <td className="oculta-cel">{c.responsavel || '—'}</td>
                  <td className="n" data-rotulo="Pontos">{r.nPontos}</td>
                  <td className="n" data-rotulo="t MV/ha">{fmt(r.tMVha)}</td>
                  <td className="n" data-rotulo="MS %">{fmt(r.msPct)}</td>
                  <td className="n" data-rotulo="t MS/ha">{fmt(r.tMSha)}</td>
                  <td className="oculta-cel"><SeloMS status={statusMS(r.msPct, parametros)} /></td>
                  <td className="acoes-linha"><Link className="botao" to={`/coletas/${c.id}`}>Abrir</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {t.observacoes && <p className="dica">Obs.: {t.observacoes}</p>}
    </div>
  );
}

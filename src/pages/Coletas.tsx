import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { amostrasPorColeta, useDados } from '../dados';
import { compararColetasDesc } from '../tipos';
import { resumoColeta } from '../calc';
import { fmt, fmtData } from '../util';

/** Histórico de coletas. A criação fica em /coletas/nova (talhão escolhido no Mapa). */
export default function Coletas() {
  const dados = useDados();
  const [filtro, setFiltro] = useState('');

  const linhas = useMemo(() => {
    if (!dados) return [];
    const porColeta = amostrasPorColeta(dados.amostras);
    const nomes = new Map(dados.talhoes.map((t) => [t.id, t.nome]));
    return dados.coletas
      .filter((c) => !filtro || c.talhaoId === filtro)
      .sort(compararColetasDesc)
      .map((c) => ({ c, talhao: nomes.get(c.talhaoId) ?? '?', r: resumoColeta(c, porColeta.get(c.id) ?? []) }));
  }, [dados, filtro]);

  if (!dados) return null;

  return (
    <>
      <div className="titulo-linha">
        <h1>Coletas</h1>
        <div className="acoes">
          <Link className="botao primario" to="/mapa">+ Nova coleta (pelo mapa)</Link>
          <Link className="botao" to="/coletas/nova">+ Nova coleta (pela lista)</Link>
        </div>
      </div>

      <div className="cartao">
        <div className="cabecalho-cartao">
          <h2>Histórico</h2>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar por talhão">
            <option value="">Todos os talhões</option>
            {dados.talhoes.map((t) => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
        </div>
        {!linhas.length ? (
          <p className="vazio">Nenhuma coleta registrada.</p>
        ) : (
          <div className="rolagem">
            <table className="tabela-cartoes">
              <thead>
                <tr>
                  <th>Talhão</th>
                  <th>Data</th>
                  <th className="oculta-cel">Responsável</th>
                  <th className="n">Pontos</th>
                  <th className="n">t MV/ha</th>
                  <th className="n">MS %</th>
                  <th className="n">t MS/ha</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {linhas.map(({ c, talhao, r }) => (
                  <tr key={c.id}>
                    <td className="nome-talhao largo-cel">
                      <strong>{talhao}</strong>
                      <span className="mudo so-cel"><small>{fmtData(c.data)}{c.responsavel ? ` · ${c.responsavel}` : ''}</small></span>
                    </td>
                    <td className="oculta-cel">{fmtData(c.data)}</td>
                    <td className="oculta-cel">{c.responsavel || '—'}</td>
                    <td className="n" data-rotulo="Pontos">{r.nPontos}</td>
                    <td className="n" data-rotulo="t MV/ha">{fmt(r.tMVha)}</td>
                    <td className="n" data-rotulo="MS %">{fmt(r.msPct)}</td>
                    <td className="n" data-rotulo="t MS/ha">{fmt(r.tMSha)}</td>
                    <td className="acoes-linha"><Link className="botao" to={`/coletas/${c.id}`}>Abrir</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

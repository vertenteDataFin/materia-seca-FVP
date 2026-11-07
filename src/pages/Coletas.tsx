import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Amostra } from '../db';
import { resumoColeta } from '../calc';
import { fmt, fmtData } from '../util';
import { nomeCurto } from '../MapaTalhoes';

/** Histórico de coletas. A criação fica em /coletas/nova (talhão escolhido no Mapa). */
export default function Coletas() {
  const dados = useLiveQuery(async () => {
    const [talhoes, coletas, amostras] = await Promise.all([
      db.talhoes.orderBy('nome').toArray(),
      db.coletas.toArray(),
      db.amostras.toArray(),
    ]);
    return { talhoes, coletas, amostras };
  }, []);
  const [filtro, setFiltro] = useState('');

  const linhas = useMemo(() => {
    if (!dados) return [];
    const porColeta = new Map<number, Amostra[]>();
    for (const a of dados.amostras) porColeta.set(a.coletaId, [...(porColeta.get(a.coletaId) ?? []), a]);
    const nomes = new Map(dados.talhoes.map((t) => [t.id!, t.nome]));
    return dados.coletas
      .filter((c) => !filtro || c.talhaoId === Number(filtro))
      .sort((a, b) => b.data.localeCompare(a.data) || b.id! - a.id!)
      .map((c) => ({ c, talhao: nomes.get(c.talhaoId) ?? '?', r: resumoColeta(c, porColeta.get(c.id!) ?? []) }));
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
              <option key={t.id} value={t.id}>{nomeCurto(t.nome)}</option>
            ))}
          </select>
        </div>
        {!linhas.length ? (
          <p className="vazio">Nenhuma coleta registrada.</p>
        ) : (
          <div className="rolagem">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Talhão</th>
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
                    <td>{fmtData(c.data)}</td>
                    <td className="nome-talhao"><strong>{nomeCurto(talhao)}</strong></td>
                    <td className="oculta-cel">{c.responsavel || '—'}</td>
                    <td className="n">{r.nPontos}</td>
                    <td className="n">{fmt(r.tMVha)}</td>
                    <td className="n">{fmt(r.msPct)}</td>
                    <td className="n">{fmt(r.tMSha)}</td>
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

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { amostrasPorColeta, useDados } from '../dados';
import { compararColetasDesc } from '../tipos';
import { resumoColeta } from '../calc';
import { ROTULO_STATUS_COLETA, statusColeta, type StatusColeta } from '../fluxo';
import { fmt, fmtData } from '../util';

const CLASSE_STATUS: Record<StatusColeta, string> = { semPontos: '', campo: 'selo-baixo', laboratorio: 'selo-alto', completa: 'selo-ideal' };

/** Módulo de campo: histórico de coletas e início de uma nova (talhão escolhido no Mapa). */
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
      .map((c) => {
        const amostras = porColeta.get(c.id) ?? [];
        return { c, talhao: nomes.get(c.talhaoId) ?? '?', r: resumoColeta(c, amostras), status: statusColeta(amostras), nPontos: amostras.length };
      });
  }, [dados, filtro]);

  if (!dados) return null;
  const aguardandoLab = linhas.filter((l) => l.status === 'laboratorio').length;

  return (
    <>
      <div className="titulo-linha">
        <h1>Campo</h1>
        <div className="acoes">
          <Link className="botao primario" to="/mapa">+ Nova coleta (pelo mapa)</Link>
          <Link className="botao" to="/coletas/nova">+ Nova coleta (pela lista)</Link>
        </div>
      </div>
      <p className="dica">
        Em campo: escolha o talhão, marque cada ponto pelo GPS e pese a massa verde do quadro. Etiquete o saco com o código do ponto; a MS é lançada depois em{' '}
        <Link to="/laboratorio">Laboratório</Link>{aguardandoLab ? ` (${aguardandoLab} coleta(s) aguardando)` : ''}.
      </p>

      <div className="cartao">
        <div className="cabecalho-cartao">
          <h2>Coletas</h2>
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
                  <th className="oculta-cel">Data</th>
                  <th className="oculta-cel">Responsável</th>
                  <th className="oculta-cel">Situação</th>
                  <th className="n">Pontos</th>
                  <th className="n">t MV/ha</th>
                  <th className="n">MS %</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {linhas.map(({ c, talhao, r, status, nPontos }) => (
                  <tr key={c.id}>
                    <td className="nome-talhao largo-cel">
                      <strong>{talhao}</strong>
                      <span className="mudo so-cel">
                        <small>{fmtData(c.data)}{c.responsavel ? ` · ${c.responsavel}` : ''}</small>{' '}
                        <span className={`selo ${CLASSE_STATUS[status]}`}>{ROTULO_STATUS_COLETA[status]}</span>
                      </span>
                    </td>
                    <td className="oculta-cel">{fmtData(c.data)}</td>
                    <td className="oculta-cel">{c.responsavel || '—'}</td>
                    <td className="oculta-cel"><span className={`selo status-coleta ${CLASSE_STATUS[status]}`}>{ROTULO_STATUS_COLETA[status]}</span></td>
                    <td className="n" data-rotulo="Pontos">{nPontos}</td>
                    <td className="n" data-rotulo="t MV/ha">{fmt(r.tMVha)}</td>
                    <td className="n" data-rotulo="MS %">{fmt(r.msPct)}</td>
                    <td className="acoes-linha">
                      {status === 'campo' || status === 'semPontos' ? (
                        <Link className="botao primario" to={`/coletas/${c.id}/${status === 'semPontos' ? 'pontos' : 'pesos'}`}>Continuar</Link>
                      ) : status === 'laboratorio' ? (
                        <Link className="botao" to={`/laboratorio?coleta=${c.id}`}>Lançar MS</Link>
                      ) : null}
                      <Link className="botao" to={`/coletas/${c.id}`}>Abrir</Link>
                    </td>
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

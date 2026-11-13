import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { amostrasPorColeta, useDados } from '../dados';
import { compararColetasDesc } from '../tipos';
import { resumoColeta, statusMS } from '../calc';
import { destinoColeta, ROTULO_STATUS_COLETA, statusColeta, type StatusColeta } from '../fluxo';
import { fmt, fmtData } from '../util';
import { SeloMS } from '../components';
import { useParametros } from '../parametros';

const CLASSE_STATUS: Record<StatusColeta, string> = { semPontos: '', campo: 'selo-baixo', laboratorio: 'selo-alto', completa: 'selo-ideal' };

/** Módulo de coletas: histórico e início de uma nova (talhão escolhido no Mapa). */
export default function Coletas() {
  const dados = useDados();
  const navigate = useNavigate();
  const parametros = useParametros();
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
        <h1>Coletas</h1>
        <div className="acoes">
          <Link className="botao primario" to="/mapa">+ Nova coleta (pelo mapa)</Link>
          <Link className="botao" to="/coletas/nova">+ Nova coleta (pela lista)</Link>
        </div>
      </div>
      <p className="dica">
        Em campo: escolha o talhão, marque cada ponto pelo GPS e pese a massa verde do quadro. Etiquete o saco com o código do ponto; a MS é lançada depois em{' '}
        <Link to="/laboratorio">Laboratório</Link>{aguardandoLab ? ` (${aguardandoLab} coleta(s) aguardando)` : ''}.
        Toque numa coleta para abrir: as que aguardam MS vão para o laboratório; as em andamento, para a etapa pendente.
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
            <table className="tabela-cartoes lista-compacta">
              <thead>
                <tr>
                  <th>Talhão</th>
                  <th className="oculta-cel">Data</th>
                  <th className="oculta-cel">Responsável</th>
                  <th className="oculta-cel">Situação</th>
                  <th className="n col-pts">Pts.</th>
                  <th className="n col-mv">MV t/ha</th>
                  <th className="n col-ms">% MS</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(({ c, talhao, r, status, nPontos }) => (
                  <tr
                    key={c.id}
                    className={`clicavel${r.msPct != null ? ' com-selo-ms' : ''}`}
                    tabIndex={0}
                    role="link"
                    aria-label={`Abrir coleta ${talhao} de ${fmtData(c.data)}`}
                    onClick={() => navigate(destinoColeta(c.id, status))}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(destinoColeta(c.id, status)); } }}
                  >
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
                    <td className="n col-pts" data-rotulo="Pts.">{nPontos}</td>
                    <td className="n col-mv" data-rotulo="MV t/ha">{fmt(r.tMVha)}</td>
                    <td className="n col-ms" data-rotulo="% MS">
                      {fmt(r.msPct)}
                      {r.msPct != null && <span className="so-cel selo-ms"><SeloMS status={statusMS(r.msPct, parametros)} curto /></span>}
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

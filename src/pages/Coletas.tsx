import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FilaMS } from './Laboratorio';
import { FilaPesagem } from './FilaPesagem';
import AmostrasColheitaCard from './AmostrasColheita';
import AmostrasMilhoCard from './AmostrasMilho';
import { amostrasPorColeta, useDados } from '../dados';
import { compararColetasDesc } from '../tipos';
import { resumoColeta, statusMS } from '../calc';
import { destinoColeta, ROTULO_STATUS_COLETA, statusColeta, type StatusColeta } from '../fluxo';
import { fmt, fmtData } from '../util';
import { SeloMS } from '../components';
import { Icone } from '../Icone';
import { useParametros } from '../parametros';
import ImagemDoDia from '../ImagemDoDia';

const CLASSE_STATUS: Record<StatusColeta, string> = { semPontos: '', campo: 'selo-baixo', laboratorio: 'selo-alto', completa: 'selo-ideal' };

/**
 * Amostragem: no topo, as amostras aguardando MS (laboratório); embaixo, as coletas.
 * Nova coleta começa pelo Mapa ou pela lista de talhões.
 */
export default function Coletas() {
  const dados = useDados();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const parametros = useParametros();
  const [filtro, setFiltro] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [escolhendo, setEscolhendo] = useState(false);
  const nFiltros = (filtro ? 1 : 0) + (de || ate ? 1 : 0);
  const limparFiltros = () => { setFiltro(''); setDe(''); setAte(''); };

  const [verTodas, setVerTodas] = useState(false);
  // Sem filtro: só os últimos 7 dias (hoje e os 6 anteriores), para a tela não ficar carregada.
  const recentes = !nFiltros && !verTodas;
  const desde = new Date(Date.now() - 6 * 86400000).toLocaleDateString('sv-SE');

  const { linhas, ocultas } = useMemo(() => {
    if (!dados) return { linhas: [], ocultas: 0 };
    const porColeta = amostrasPorColeta(dados.amostras);
    const nomes = new Map(dados.talhoes.map((t) => [t.id, t.nome]));
    const filtradas = dados.coletas.filter((c) => (!filtro || c.talhaoId === filtro) && (!de || c.data >= de) && (!ate || c.data <= ate));
    const visiveis = recentes ? filtradas.filter((c) => c.data >= desde) : filtradas;
    const linhas = visiveis
      .sort(compararColetasDesc)
      .map((c) => {
        const amostras = porColeta.get(c.id) ?? [];
        return { c, talhao: nomes.get(c.talhaoId) ?? '?', r: resumoColeta(c, amostras), status: statusColeta(amostras), nPontos: amostras.length };
      });
    return { linhas, ocultas: filtradas.length - visiveis.length };
  }, [dados, filtro, de, ate, recentes, desde]);

  if (!dados) return null;

  return (
    <>
      <div className="titulo-linha">
        <h1>Amostragem</h1>
        <button type="button" className="primario" aria-expanded={escolhendo} onClick={() => setEscolhendo((v) => !v)}>
          <Icone nome="adicionar" /> Nova coleta
        </button>
      </div>
      {escolhendo && (
        <div className="cartao escolha-coleta">
          <div className="opcao-coleta">
            <h2><Icone nome="campo" /> Amostragem de campo</h2>
            <p className="dica">
              Em campo, só marque os pontos no GPS e etiquete os sacos; o peso verde é lançado depois, em <strong>Aguardando pesagem</strong>.
            </p>
            <div className="acoes">
              <Link className="botao primario" to="/coletas/rapida"><Icone nome="gps" /> Começar pelo GPS</Link>
              <Link className="botao" to="/mapa?nova=coleta">Pelo mapa</Link>
            </div>
          </div>
          <div className="opcao-coleta">
            <h2><Icone nome="caminhao" /> Amostragem de colheita</h2>
            <p className="dica">Amostra do caminhão: talhão de origem, silo de destino, Penn State na hora e MS depois.</p>
            <div className="acoes">
              <Link className="botao primario" to="/coletas/colheita/nova">Amostrar caminhão</Link>
            </div>
          </div>
          <div className="opcao-coleta">
            <h2><Icone nome="lab" /> Milho reidratado</h2>
            <p className="dica">Amostra da silagem de milho reidratado: silo, granulometria (6 · 3,25 · 2 · 1,25 mm e fundo) e MS.</p>
            <div className="acoes">
              <Link className="botao primario" to="/coletas/milho/nova">Amostrar milho</Link>
            </div>
          </div>
        </div>
      )}
      <p className="dica">
        A MS das amostras (de campo e dos caminhões) é lançada depois, no quadro <strong>Aguardando MS</strong> aqui no topo. Toque numa coleta para
        abrir a etapa pendente ou o resultado.
      </p>

      <FilaPesagem destaque={params.get('pesagem')} />
      <FilaMS destaque={params.get('coleta')} destaqueColheita={params.get('colheita')} />

      <div className="cartao">
        <div className="cabecalho-cartao cabecalho-filtro">
          <h2>Amostragem de campo</h2>
          <ImagemDoDia dados={dados} parametros={parametros} />
          <button
            type="button"
            className={`icone-acao botao-filtro${nFiltros ? ' ativo' : ''}`}
            aria-expanded={mostrarFiltros}
            aria-label={nFiltros ? `Filtros (${nFiltros} ativo${nFiltros > 1 ? 's' : ''})` : 'Filtrar por talhão ou data'}
            title="Filtrar por talhão ou data"
            onClick={() => setMostrarFiltros((v) => !v)}
          >
            <Icone nome="filtro" />
            {nFiltros > 0 && <span className="contador-filtro">{nFiltros}</span>}
          </button>
        </div>
        {mostrarFiltros && (
          <div className="painel-filtros">
            <label>
              Talhão
              <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
                <option value="">Todos os talhões</option>
                {dados.talhoes.map((t) => (
                  <option key={t.id} value={t.id}>{t.nome}</option>
                ))}
              </select>
            </label>
            <label>
              De
              <input type="date" value={de} max={ate || undefined} onChange={(e) => setDe(e.target.value)} />
            </label>
            <label>
              Até
              <input type="date" value={ate} min={de || undefined} onChange={(e) => setAte(e.target.value)} />
            </label>
            {nFiltros > 0 && <button type="button" className="link" onClick={limparFiltros}>Limpar filtros</button>}
          </div>
        )}
        {!linhas.length ? (
          <p className="vazio">{nFiltros ? 'Nenhuma coleta com esses filtros.' : ocultas ? 'Nenhuma coleta nos últimos 7 dias.' : 'Nenhuma coleta registrada.'}</p>
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
        {recentes && ocultas > 0 && (
          <p className="dica ver-todas">
            Mostrando os últimos 7 dias.{' '}
            <button type="button" className="link" onClick={() => setVerTodas(true)}>Ver todas ({ocultas} mais antiga{ocultas === 1 ? '' : 's'})</button>
          </p>
        )}
        {verTodas && !nFiltros && (
          <p className="dica ver-todas">
            <button type="button" className="link" onClick={() => setVerTodas(false)}>Mostrar só os últimos 7 dias</button>
          </p>
        )}
      </div>

      <AmostrasColheitaCard destaque={params.get('colheita')} />
      <AmostrasMilhoCard destaque={params.get('milho')} />
    </>
  );
}

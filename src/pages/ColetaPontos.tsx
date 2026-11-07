import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Amostra } from '../db';
import { adicionarPonto, removerPonto } from '../coletas';
import { PassosColeta } from '../components';
import { capturarPosicao, dentroDoTalhao, fmtCoord } from '../geo';
import MapaTalhoes, { nomeCurto, type Marcador } from '../MapaTalhoes';
import { fmtData } from '../util';

/** Etapa 2: marcar no mapa do talhão onde cada ponto foi coletado (cada ponto = uma amostra). */
export default function ColetaPontos() {
  const coletaId = Number(useParams().id);
  const coleta = useLiveQuery(async () => (await db.coletas.get(coletaId)) ?? null, [coletaId]);
  const amostras = useLiveQuery(() => db.amostras.where('coletaId').equals(coletaId).sortBy('ponto'), [coletaId]);
  const talhao = useLiveQuery(async () => (coleta ? await db.talhoes.get(coleta.talhaoId) : undefined), [coleta?.talhaoId]);
  const [capturando, setCapturando] = useState(false);
  const [erro, setErro] = useState('');

  if (coleta === null) {
    return (
      <div className="cartao">
        <p className="vazio">Coleta não encontrada. <Link to="/coletas">Voltar</Link></p>
      </div>
    );
  }
  if (!coleta || !amostras) return null;

  const fora = (a: Amostra) => (a.lat != null && a.lng != null ? dentroDoTalhao(a.lng, a.lat, talhao?.geometria) === false : false);
  const comPosicao = amostras.filter((a) => a.lat != null && a.lng != null);
  const marcadores: Marcador[] = comPosicao.map((a) => ({ lat: a.lat!, lng: a.lng!, rotulo: String(a.ponto), alerta: fora(a), titulo: fmtCoord(a.lat!, a.lng!) }));
  const nFora = amostras.filter(fora).length;

  async function porGps() {
    setCapturando(true);
    setErro('');
    try {
      const p = await capturarPosicao();
      await adicionarPonto(coletaId, { lat: p.lat, lng: p.lng, precisaoM: p.precisaoM, capturadoEm: p.capturadoEm });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCapturando(false);
    }
  }

  function remover(a: Amostra) {
    if (confirm(`Remover o ponto ${a.ponto}?`)) void removerPonto(a.id!);
  }

  return (
    <>
      <div className="titulo-linha">
        <h1>Coleta — {talhao ? nomeCurto(talhao.nome) : '…'} · {fmtData(coleta.data)}</h1>
        <Link to="/mapa">← Mapa</Link>
      </div>
      <PassosColeta coletaId={coletaId} atual={2} />

      <div className="cartao">
        <h2>Onde foram coletados os pontos</h2>
        <p className="dica">
          Toque no mapa no lugar de cada ponto coletado — cada toque cria uma amostra numerada. Em campo, use <strong>Ponto no meu GPS</strong> para marcar
          onde você está. Toque num ponto para removê-lo.
        </p>
        {talhao?.geometria?.length ? (
          <MapaTalhoes
            talhoes={[talhao]}
            marcadores={marcadores}
            aoClicarMapa={(lat, lng) => void adicionarPonto(coletaId, { lat, lng })}
            aoClicarMarcador={(i) => remover(comPosicao[i])}
            altura="min(55vh, 520px)"
            zoomMax={17}
          />
        ) : (
          <p className="aviso">Este talhão não tem contorno no mapa; marque os pontos pelo GPS.</p>
        )}
        <div className="acoes" style={{ marginTop: '0.75rem' }}>
          <button className="primario" onClick={porGps} disabled={capturando}>{capturando ? 'Lendo GPS…' : '📍 Ponto no meu GPS'}</button>
        </div>
        {erro && <p className="aviso">{erro}</p>}
        {nFora > 0 && <p className="aviso">{nFora} ponto(s) fora do contorno do talhão (em vermelho). Confira se o talhão da coleta está certo.</p>}
      </div>

      <div className="cartao">
        <div className="cabecalho-cartao">
          <h2>Pontos marcados ({amostras.length})</h2>
        </div>
        {!amostras.length ? (
          <p className="vazio">Nenhum ponto ainda. Toque no mapa ou use o GPS.</p>
        ) : (
          <ul className="lista-pontos">
            {amostras.map((a) => (
              <li key={a.id} className={fora(a) ? 'fora' : ''}>
                <strong>Ponto {a.ponto}</strong>
                <span className="mudo">
                  {a.lat != null && a.lng != null ? (
                    <>
                      {fmtCoord(a.lat, a.lng)}
                      {a.precisaoM != null && ` · GPS ±${a.precisaoM} m`}
                      {fora(a) && <span className="gps-fora"> · fora do talhão</span>}
                    </>
                  ) : (
                    'sem posição'
                  )}
                </span>
                <span className="espaco" />
                <button className="perigo mini" aria-label={`Remover ponto ${a.ponto}`} onClick={() => remover(a)}>✕</button>
              </li>
            ))}
          </ul>
        )}
        <div className="acoes" style={{ marginTop: '0.75rem' }}>
          <Link className="botao primario" to={`/coletas/${coletaId}/pesos`}>Continuar → pesos{amostras.length ? ` (${amostras.length})` : ''}</Link>
        </div>
      </div>
    </>
  );
}

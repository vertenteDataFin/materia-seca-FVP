import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useDados } from '../dados';
import type { Amostra } from '../tipos';
import { adicionarPonto, posicionarPonto, removerPonto } from '../coletas';
import { PassosColeta } from '../components';
import { capturarPosicao, dentroDoTalhao, fmtCoord, origemPosicao, ROTULO_ORIGEM, type OrigemPosicao, type Posicao } from '../geo';
import MapaTalhoes, { type Marcador } from '../MapaTalhoes';
import { fmtData } from '../util';
import { usePermissoes } from '../permissoes';
import { Icone } from '../Icone';

/**
 * Etapa 2: marcar no mapa do talhão onde cada ponto foi coletado (cada ponto = uma amostra).
 * Enquanto houver amostras sem posição (ex.: lançadas da ficha), o toque no mapa posiciona a próxima delas,
 * em vez de criar um ponto novo. Qualquer ponto pode ser escolhido na lista para (re)posicionar.
 */
export default function ColetaPontos() {
  const coletaId = useParams().id!;
  const dados = useDados();
  const [capturando, setCapturando] = useState(false);
  const [erro, setErro] = useState('');
  const [alvoId, setAlvoId] = useState<string | null>(null);
  const { podeExcluir } = usePermissoes();

  if (!dados) return null;
  const coleta = dados.coletas.find((c) => c.id === coletaId);
  if (!coleta) {
    return (
      <div className="cartao">
        <p className="vazio">Coleta não encontrada. <Link to="/coletas">Voltar</Link></p>
      </div>
    );
  }
  const amostras = dados.amostras.filter((a) => a.coletaId === coletaId).sort((a, b) => a.ponto - b.ponto);
  const talhao = dados.talhoes.find((t) => t.id === coleta.talhaoId);

  const temPosicao = (a: Amostra) => a.lat != null && a.lng != null;
  const fora = (a: Amostra) => (temPosicao(a) ? dentroDoTalhao(a.lng!, a.lat!, talhao?.geometria) === false : false);
  const comPosicao = amostras.filter(temPosicao);
  const semPosicao = amostras.filter((a) => !temPosicao(a));
  // Quem recebe o próximo toque/GPS: o ponto escolhido na lista ou, senão, o primeiro ainda sem posição.
  const alvo = (alvoId && amostras.find((a) => a.id === alvoId)) || semPosicao[0] || null;

  const marcadores: Marcador[] = comPosicao.map((a) => ({
    lat: a.lat!,
    lng: a.lng!,
    rotulo: String(a.ponto),
    alerta: fora(a),
    origem: origemPosicao(a) ?? undefined,
    titulo: `Ponto ${a.ponto} · ${fmtCoord(a.lat!, a.lng!)} · ${ROTULO_ORIGEM[origemPosicao(a)!]}`,
  }));
  const nFora = amostras.filter(fora).length;
  const nMapa = amostras.filter((a) => origemPosicao(a) === 'mapa').length;
  const nGps = amostras.filter((a) => origemPosicao(a) === 'gps').length;

  function aplicar(pos: Pick<Posicao, 'lat' | 'lng'> & Partial<Posicao>, origem: OrigemPosicao) {
    if (alvo) {
      posicionarPonto(alvo.id, pos, origem);
      setAlvoId(null); // segue para o próximo sem posição
    } else {
      adicionarPonto(coletaId, { lat: pos.lat, lng: pos.lng, precisaoM: pos.precisaoM ?? null, capturadoEm: pos.capturadoEm ?? null, origemPos: origem });
    }
  }

  async function porGps() {
    setCapturando(true);
    setErro('');
    try {
      aplicar(await capturarPosicao(), 'gps');
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCapturando(false);
    }
  }

  function remover(a: Amostra) {
    if (confirm(`Remover o ponto ${a.ponto}?`)) removerPonto(a.id);
  }

  const acaoDoToque = alvo ? `posiciona o ponto ${alvo.ponto}${alvoId ? '' : ' (próximo sem posição)'}` : 'cria um ponto novo';

  return (
    <>
      <div className="titulo-linha">
        <h1>Coleta — {talhao ? talhao.nome : '…'} · {fmtData(coleta.data)}</h1>
        <Link to="/mapa">← Mapa</Link>
      </div>
      <PassosColeta coletaId={coletaId} atual={2} />

      <div className="cartao">
        <h2>Onde foram coletados os pontos</h2>
        <p className="dica">
          Toque no mapa no lugar onde o ponto foi coletado, ou use <strong>Ponto no meu GPS</strong> estando no local.{' '}
          {semPosicao.length > 0 && (
            <>
              Esta coleta tem <strong>{semPosicao.length}</strong> ponto(s) sem posição: cada toque posiciona um deles, em ordem.{' '}
            </>
          )}
          Para corrigir um ponto, escolha <em>Marcar no mapa</em> na lista abaixo e toque no lugar certo.
          {podeExcluir && ' Toque num marcador do mapa para removê-lo.'}
        </p>
        <p className="aviso alvo-ponto">
          Próximo toque no mapa: <strong>{acaoDoToque}</strong>
          {alvoId && (
            <>
              {' '}
              <button type="button" className="link" onClick={() => setAlvoId(null)}>cancelar</button>
            </>
          )}
        </p>
        {talhao?.geometria?.length ? (
          <MapaTalhoes
            talhoes={[talhao]}
            marcadores={marcadores}
            aoClicarMapa={(lat, lng) => aplicar({ lat, lng }, 'mapa')}
            aoClicarMarcador={podeExcluir ? (i) => remover(comPosicao[i]) : undefined}
            altura="min(55vh, 520px)"
            zoomMax={17}
          />
        ) : (
          <p className="aviso">Este talhão não tem contorno no mapa; marque os pontos pelo GPS.</p>
        )}
        <div className="acoes" style={{ marginTop: '0.75rem' }}>
          <button className="primario" onClick={porGps} disabled={capturando}>{capturando ? 'Lendo GPS…' : <><Icone nome="gps" /> Ponto no meu GPS</>}</button>
        </div>
        {erro && <p className="aviso">{erro}</p>}
        {comPosicao.length > 0 && (
          <p className="dica legenda-origem">
            <span className="ponto-legenda gps" aria-hidden="true" /> GPS do celular ({nGps}){' '}
            <span className="ponto-legenda mapa" aria-hidden="true" /> marcado no mapa ({nMapa})
          </p>
        )}
        {nFora > 0 &&<p className="aviso">{nFora} ponto(s) fora do contorno do talhão (em vermelho). Confira se o talhão da coleta está certo.</p>}
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
              <li key={a.id} className={`${fora(a) ? 'fora' : ''}${alvo?.id === a.id ? ' alvo' : ''}`}>
                <strong>Ponto {a.ponto}</strong>
                <span className="mudo">
                  {temPosicao(a) ? (
                    <>
                      {fmtCoord(a.lat!, a.lng!)}
                      {origemPosicao(a) === 'gps' ? ` · GPS do celular${a.precisaoM != null ? ` ±${a.precisaoM} m` : ''}` : ' · marcado no mapa'}
                      {fora(a) && <span className="gps-fora"> · fora do talhão</span>}
                    </>
                  ) : (
                    'sem posição'
                  )}
                </span>
                <span className="espaco" />
                {alvo?.id === a.id ? (
                  <span className="selo selo-alto">← toque no mapa</span>
                ) : (
                  <button type="button" className="mini" onClick={() => setAlvoId(a.id)}>{temPosicao(a) ? 'Mover' : 'Marcar no mapa'}</button>
                )}
                {podeExcluir && <button className="perigo mini" aria-label={`Remover ponto ${a.ponto}`} title="Remover ponto" onClick={() => remover(a)}><Icone nome="excluir" /></button>}
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

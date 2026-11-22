import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDados } from '../dados';
import type { Amostra } from '../tipos';
import { adicionarPonto, posicionarPonto, removerPonto } from '../coletas';
import { producaoPonto } from '../calc';
import { capturarPosicao, dentroDoTalhao, fmtCoord, origemPosicao, ROTULO_ORIGEM, type OrigemPosicao, type Posicao } from '../geo';
import MapaTalhoes, { type Marcador } from '../MapaTalhoes';
import { codigoAmostra } from '../fluxo';
import { fmt, fmtData } from '../util';
import { podeRemoverPonto, usePermissoes } from '../permissoes';
import { Icone } from '../Icone';

/**
 * Coleta pelo mapa: mesma tela da coleta de campo (sem a barra de etapas), mas o mapa é a ferramenta principal.
 * Cada toque no mapa cria um ponto (com o código da etiqueta do saco); o peso verde é lançado depois,
 * em "Aguardando pesagem". Enquanto houver pontos sem posição (ex.: lançados da ficha), o toque posiciona
 * o próximo deles; qualquer ponto pode ser escolhido na lista para ser movido.
 */
export default function ColetaPontos() {
  const coletaId = useParams().id!;
  const dados = useDados();
  const navigate = useNavigate();
  const permissoes = usePermissoes();
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState('');
  const [alvoId, setAlvoId] = useState<string | null>(null);

  if (!dados) return null;
  const coleta = dados.coletas.find((c) => c.id === coletaId);
  if (!coleta) {
    return (
      <div className="cartao">
        <p className="vazio">Coleta não encontrada. <Link to="/coletas">Voltar</Link></p>
      </div>
    );
  }
  const talhao = dados.talhoes.find((t) => t.id === coleta.talhaoId);
  const amostras = dados.amostras.filter((a) => a.coletaId === coletaId).sort((a, b) => b.ponto - a.ponto); // o último ponto em cima

  const temPosicao = (a: Amostra) => a.lat != null && a.lng != null;
  const fora = (a: Amostra) => (temPosicao(a) ? dentroDoTalhao(a.lng!, a.lat!, talhao?.geometria) === false : false);
  const comPosicao = amostras.filter(temPosicao);
  const semPosicao = amostras.filter((a) => !temPosicao(a)).sort((a, b) => a.ponto - b.ponto);
  // Quem recebe o próximo toque/GPS: o ponto escolhido na lista ou, senão, o primeiro ainda sem posição.
  const alvo = (alvoId && amostras.find((a) => a.id === alvoId)) || semPosicao[0] || null;
  const semPeso = amostras.filter((a) => a.pesoVerdeKg == null).length;
  const nFora = amostras.filter(fora).length;

  const marcadores: Marcador[] = comPosicao.map((a) => ({
    lat: a.lat!,
    lng: a.lng!,
    rotulo: String(a.ponto),
    alerta: fora(a),
    origem: origemPosicao(a) ?? undefined,
    titulo: `Ponto ${a.ponto} · ${fmtCoord(a.lat!, a.lng!)} · ${ROTULO_ORIGEM[origemPosicao(a)!]}`,
  }));

  function aplicar(pos: Pick<Posicao, 'lat' | 'lng'> & Partial<Posicao>, origem: OrigemPosicao) {
    if (alvo) {
      posicionarPonto(alvo.id, pos, origem);
      setAlvoId(null); // segue para o próximo sem posição
    } else {
      adicionarPonto(coletaId, {
        lat: pos.lat,
        lng: pos.lng,
        precisaoM: pos.precisaoM ?? null,
        capturadoEm: pos.capturadoEm ?? new Date().toISOString(),
        origemPos: origem,
      });
    }
  }

  async function pontoGps() {
    setLendo(true);
    setErro('');
    try {
      aplicar(await capturarPosicao(), 'gps');
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setLendo(false);
    }
  }

  function remover(a: Amostra) {
    if (confirm(`Remover o ponto ${a.ponto}?`)) {
      removerPonto(a.id);
      if (alvoId === a.id) setAlvoId(null);
    }
  }

  const acaoDoToque = alvo ? (
    <>Toque no mapa para <strong>{temPosicao(alvo) ? 'mover' : 'posicionar'} o ponto {alvo.ponto}</strong></>
  ) : (
    <>Toque no mapa onde cortou o quadro para <strong>criar o ponto {amostras.reduce((m, a) => Math.max(m, a.ponto), 0) + 1}</strong></>
  );

  return (
    <div className="coleta-campo">
      <div className="cabecalho-campo">
        <div>
          <h1>{talhao?.nome ?? '…'}</h1>
          <small className="mudo">{fmtData(coleta.data)}{coleta.responsavel ? ` · ${coleta.responsavel}` : ''} · quadro 1 m² · pontos pelo mapa</small>
        </div>
        <Link to={`/coletas/${coletaId}`}>Ver coleta</Link>
      </div>

      <div className="resumo-campo" aria-live="polite">
        <div><strong>{amostras.length}</strong><small>pontos</small></div>
        <div><strong>{semPeso}</strong><small>a pesar</small></div>
        <div className={nFora ? 'alerta' : ''}><strong>{nFora}</strong><small>fora do talhão</small></div>
      </div>
      {nFora > 0 && <p className="aviso">Ponto fora do contorno do talhão (em vermelho): use <em>Mover</em> e toque no lugar certo, ou remova.</p>}

      {talhao?.geometria?.length ? (
        <div className="cartao mapa-campo">
          <p className={`alvo-ponto${alvo ? ' alvo-ativo' : ''}`}>
            {acaoDoToque}
            {alvoId && (
              <>
                {' '}
                <button type="button" className="link" onClick={() => setAlvoId(null)}>cancelar</button>
              </>
            )}
          </p>
          <MapaTalhoes
            talhoes={[talhao]}
            marcadores={marcadores}
            aoClicarMapa={(lat, lng) => aplicar({ lat, lng }, 'mapa')}
            aoClicarMarcador={(i) => podeRemoverPonto(permissoes, comPosicao[i]) && remover(comPosicao[i])}
            altura="min(55vh, 480px)"
            zoomMax={17}
          />
          <small className="mudo">
            <span className="ponto-legenda gps" aria-hidden="true" /> GPS do celular{' '}
            <span className="ponto-legenda mapa" aria-hidden="true" /> marcado no mapa · toque num marcador para removê-lo
          </small>
        </div>
      ) : (
        <p className="aviso">Este talhão não tem contorno no mapa; marque os pontos pelo GPS.</p>
      )}

      {erro && <p className="aviso">{erro}</p>}

      {!amostras.length ? (
        <p className="vazio cartao">
          Toque no mapa no lugar de cada ponto coletado (ou use <strong>Ponto no meu GPS</strong> estando no local). Escreva na etiqueta do saco o
          código que aparecer: o peso é lançado depois, em <strong>Aguardando pesagem</strong>.
        </p>
      ) : (
        <div className="pontos-campo">
          {amostras.map((a) => (
            <div key={a.id} className={`ponto-campo${fora(a) ? ' fora' : ''}${a.pesoVerdeKg == null ? ' sem-peso' : ''}${alvo?.id === a.id ? ' alvo' : ''}`}>
              <div className="ponto-n">{a.ponto}</div>
              <div className="ponto-info">
                <code className="codigo">{codigoAmostra(talhao?.nome ?? '', coleta.data, a.ponto)}</code>
                <small className="mudo">
                  {!temPosicao(a) ? 'sem posição' : origemPosicao(a) === 'gps' ? `GPS${a.precisaoM != null ? ` ±${a.precisaoM} m` : ''}` : 'no mapa'}
                  {fora(a) ? ' · fora do talhão' : ''}
                  {producaoPonto(a, coleta.areaAmostralM2) != null ? ` · ${fmt(producaoPonto(a, coleta.areaAmostralM2), 2)} kg/m²` : ''}
                </small>
              </div>
              {alvo?.id === a.id ? (
                <span className="ponto-peso-status pendente">toque no mapa</span>
              ) : (
                <button type="button" className="mini" onClick={() => setAlvoId(a.id)}>{temPosicao(a) ? 'Mover' : 'Marcar'}</button>
              )}
              <span className={`ponto-peso-status${a.pesoVerdeKg == null ? ' pendente' : ''}`}>
                {a.pesoVerdeKg == null ? 'pesar depois' : `${fmt(a.pesoVerdeKg, 2)} kg`}
              </span>
              {podeRemoverPonto(permissoes, a) && (
                <button type="button" className="icone-acao perigo" aria-label={`Remover ponto ${a.ponto}`} onClick={() => remover(a)}>
                  <Icone nome="excluir" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="barra-campo">
        <button type="button" className="primario botao-grande" onClick={pontoGps} disabled={lendo}>
          {lendo ? 'Lendo GPS…' : <><Icone nome="gps" /> Ponto no meu GPS</>}
        </button>
        <button
          type="button"
          className="botao-grande"
          disabled={!amostras.length}
          onClick={() => navigate(semPeso ? `/coletas?pesagem=${coletaId}` : `/coletas/${coletaId}`)}
          title={semPeso ? `${semPeso} ponto(s) para pesar depois` : undefined}
        >
          <Icone nome="ok" /> Terminei
        </button>
      </div>
    </div>
  );
}

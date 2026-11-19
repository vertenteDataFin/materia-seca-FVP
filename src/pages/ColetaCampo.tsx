import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { atualizarAmostra, useDados } from '../dados';
import type { Amostra } from '../tipos';
import { adicionarPonto, removerPonto } from '../coletas';
import { producaoPonto, resumoColeta } from '../calc';
import { CampoNumero } from '../components';
import { capturarPosicao, dentroDoTalhao, origemPosicao, type OrigemPosicao, type Posicao } from '../geo';
import MapaTalhoes, { type Marcador } from '../MapaTalhoes';
import { codigoAmostra } from '../fluxo';
import { fmt, fmtData } from '../util';
import { usePermissoes } from '../permissoes';
import { Icone } from '../Icone';

/**
 * PROTÓTIPO — coleta de campo com menos toques, passo 2: pontos e pesos na mesma tela.
 * "Ponto aqui" lê o GPS, cria o ponto e já abre o campo do peso; o resumo atualiza na hora.
 */
export default function ColetaCampo() {
  const coletaId = useParams().id!;
  const dados = useDados();
  const navigate = useNavigate();
  const { podeExcluir } = usePermissoes();
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState('');
  const [focoId, setFocoId] = useState<string | null>(null);
  const [verMapa, setVerMapa] = useState(true);

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
  const r = resumoColeta(coleta, amostras);
  const fora = (a: Amostra) => (a.lat != null && a.lng != null ? dentroDoTalhao(a.lng, a.lat, talhao?.geometria) === false : false);
  const semPeso = amostras.filter((a) => a.pesoVerdeKg == null).length;

  function novo(pos?: Pick<Posicao, 'lat' | 'lng'> & Partial<Posicao>, origem?: OrigemPosicao) {
    const id = adicionarPonto(
      coletaId,
      pos ? { lat: pos.lat, lng: pos.lng, precisaoM: pos.precisaoM ?? null, capturadoEm: pos.capturadoEm ?? new Date().toISOString(), origemPos: origem } : {},
    );
    setFocoId(id);
  }

  async function pontoAqui() {
    setLendo(true);
    setErro('');
    try {
      novo(await capturarPosicao(), 'gps');
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setLendo(false);
    }
  }

  const comPosicao = amostras.filter((a) => a.lat != null && a.lng != null);
  const marcadores: Marcador[] = comPosicao.map((a) => ({
    lat: a.lat!,
    lng: a.lng!,
    rotulo: String(a.ponto),
    alerta: fora(a),
    origem: origemPosicao(a) ?? undefined,
  }));

  return (
    <div className="coleta-campo">
      <div className="cabecalho-campo">
        <div>
          <h1>{talhao?.nome ?? '…'}</h1>
          <small className="mudo">{fmtData(coleta.data)}{coleta.responsavel ? ` · ${coleta.responsavel}` : ''} · quadro 1 m²</small>
        </div>
        <span className="selo selo-alto">protótipo</span>
      </div>

      <div className="resumo-campo" aria-live="polite">
        <div><strong>{r.nPontos}</strong><small>pesados</small></div>
        <div><strong>{fmt(r.tMVha)}</strong><small>t MV/ha</small></div>
        <div className={r.cvPct != null && r.cvPct > 25 ? 'alerta' : ''}><strong>{r.cvPct == null ? '—' : `${fmt(r.cvPct, 0)}%`}</strong><small>CV</small></div>
      </div>
      {r.cvPct != null && r.cvPct > 25 && <p className="aviso">Variação alta entre pontos: vale pesar mais um ou dois.</p>}

      {talhao?.geometria?.length ? (
        <div className="cartao mapa-campo">
          <button type="button" className="link" onClick={() => setVerMapa((v) => !v)}>
            <Icone nome={verMapa ? 'expandir' : 'recolher'} /> Mapa ({comPosicao.length} ponto{comPosicao.length === 1 ? '' : 's'})
          </button>
          {verMapa && (
            <>
              <MapaTalhoes talhoes={[talhao]} marcadores={marcadores} aoClicarMapa={(lat, lng) => novo({ lat, lng }, 'mapa')} altura={220} zoomMax={17} />
              <small className="mudo">Sem GPS? Toque no mapa onde cortou o quadro.</small>
            </>
          )}
        </div>
      ) : null}

      {erro && (
        <p className="aviso">
          {erro}{' '}
          <button type="button" className="link" onClick={() => novo()}>Lançar ponto sem posição</button>
        </p>
      )}

      {!amostras.length ? (
        <p className="vazio cartao">Vá até o primeiro ponto, corte o quadro e toque em <strong>Ponto aqui</strong>.</p>
      ) : (
        <div className="pontos-campo">
          {amostras.map((a) => (
            <div key={a.id} className={`ponto-campo${fora(a) ? ' fora' : ''}${a.pesoVerdeKg == null ? ' sem-peso' : ''}`}>
              <div className="ponto-n">{a.ponto}</div>
              <div className="ponto-info">
                <code className="codigo">{codigoAmostra(talhao?.nome ?? '', coleta.data, a.ponto)}</code>
                <small className="mudo">
                  {a.lat == null ? 'sem posição' : origemPosicao(a) === 'gps' ? `GPS${a.precisaoM != null ? ` ±${a.precisaoM} m` : ''}` : 'no mapa'}
                  {fora(a) ? ' · fora do talhão' : ''}
                  {producaoPonto(a, coleta.areaAmostralM2) != null ? ` · ${fmt(producaoPonto(a, coleta.areaAmostralM2), 2)} kg/m²` : ''}
                </small>
              </div>
              <label className="ponto-peso">
                <span>kg</span>
                <CampoNumero
                  valor={a.pesoVerdeKg}
                  ariaLabel={`Peso verde ponto ${a.ponto}`}
                  placeholder="peso"
                  autoFocus={focoId === a.id}
                  aoSalvar={(v) => atualizarAmostra(a.id, { pesoVerdeKg: v })}
                />
              </label>
              {podeExcluir && (
                <button type="button" className="icone-acao perigo" aria-label={`Remover ponto ${a.ponto}`} onClick={() => confirm(`Remover o ponto ${a.ponto}?`) && removerPonto(a.id)}>
                  <Icone nome="excluir" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="barra-campo">
        <button type="button" className="primario botao-grande" onClick={pontoAqui} disabled={lendo}>
          {lendo ? 'Lendo GPS…' : <><Icone nome="gps" /> Ponto aqui</>}
        </button>
        <button type="button" className="botao-grande" disabled={!r.nPontos} onClick={() => navigate(`/coletas/${coletaId}`)} title={semPeso ? `${semPeso} ponto(s) sem peso` : undefined}>
          <Icone nome="ok" /> Concluir
        </button>
      </div>
    </div>
  );
}

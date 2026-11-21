import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { amostrasPorColeta, useDados } from '../dados';
import { compararColetasDesc, type Coleta } from '../tipos';
import { resumoColeta, statusMS } from '../calc';
import { MenuTalhao } from '../components';
import { fmt } from '../util';
import { useParametros } from '../parametros';
import MapaTalhoes from '../MapaTalhoes';
import { COR_SEMAFORO, semaforoDe } from '../semaforo';
import { progressoColheita, resumoColheita, type AndamentoTalhao } from '../colheita';
import { Icone } from '../Icone';
import { capturarPosicao, type Posicao } from '../geo';
import { talhoesPorPosicao } from '../talhaoPorGps';

/**
 * Mapa dos talhões. Pela navegação, tocar no talhão abre as informações dele (página Talhões).
 * Vindo de "Nova coleta → Pelo mapa" (?nova=coleta), tocar no talhão abre o menu para iniciar a coleta.
 */
/** Cores do mapa de colheita: azul mais forte conforme avança; finalizada em azul-escuro. */
const COR_COLHEITA = {
  semCarga: '#9aa0a6',
  semEstimativa: '#b07cc6',
  faixas: [
    { ate: 25, cor: '#9ecae1', rotulo: 'até 25%' },
    { ate: 50, cor: '#6baed6', rotulo: '25–50%' },
    { ate: 75, cor: '#3182bd', rotulo: '50–75%' },
    { ate: 100, cor: '#08519c', rotulo: '75–99%' },
  ],
  finalizada: '#0b2a5e',
};

function corDaColheita(a: AndamentoTalhao | undefined): { cor: string; tracejado: boolean; rotuloExtra: string } {
  if (!a) return { cor: COR_COLHEITA.semCarga, tracejado: true, rotuloExtra: 'sem colheita' };
  if (a.finalizada) return { cor: COR_COLHEITA.finalizada, tracejado: false, rotuloExtra: 'finalizada ✓' };
  const pct = progressoColheita(a);
  if (pct == null) return { cor: COR_COLHEITA.semEstimativa, tracejado: true, rotuloExtra: 'em colheita' };
  const faixa = COR_COLHEITA.faixas.find((f) => pct < f.ate) ?? COR_COLHEITA.faixas[COR_COLHEITA.faixas.length - 1];
  return { cor: faixa.cor, tracejado: false, rotuloExtra: `${Math.round(pct)}% colhido` };
}

export default function Mapa() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const paraColeta = params.get('nova') === 'coleta';
  // Mapa de amostragem (MS) ou de colheita (% colhido); fica na URL para o voltar do navegador manter a escolha.
  const visao: 'amostragem' | 'colheita' = !paraColeta && params.get('visao') === 'colheita' ? 'colheita' : 'amostragem';
  const trocarVisao = (v: 'amostragem' | 'colheita') => setParams(v === 'colheita' ? { visao: 'colheita' } : {}, { replace: true });
  const parametros = useParametros();
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const dados = useDados();
  // "Cadê eu?": só mostra onde a pessoa está e em que talhão (não cria coleta)
  const [posicao, setPosicao] = useState<Posicao | null>(null);
  const [lendoGps, setLendoGps] = useState(false);
  const [erroGps, setErroGps] = useState('');
  async function cadeEu() {
    setLendoGps(true);
    setErroGps('');
    try {
      setPosicao(await capturarPosicao());
    } catch (e) {
      setErroGps((e as Error).message);
    } finally {
      setLendoGps(false);
    }
  }

  // Por talhão: a última coleta com MS aferida; se nenhuma tem MS ainda, a última coleta (MS pendente).
  const ultimaPorTalhao = useMemo(() => {
    const m = new Map<string, { c: Coleta; msPct: number | null }>();
    if (!dados) return m;
    const porColeta = amostrasPorColeta(dados.amostras);
    for (const c of [...dados.coletas].sort(compararColetasDesc)) {
      const atual = m.get(c.talhaoId);
      if (atual?.msPct != null) continue; // já achou a mais recente com MS
      const msPct = resumoColeta(c, porColeta.get(c.id) ?? []).msPct;
      if (!atual || msPct != null) m.set(c.talhaoId, { c, msPct });
    }
    return m;
  }, [dados]);

  // Andamento da colheita por talhão (mesmo cálculo do Painel e da página Colheita)
  const colheita = useMemo(
    () => (dados ? resumoColheita(dados.talhoes, dados.cargas, dados.coletas, amostrasPorColeta(dados.amostras), dados.amostrasColheita) : null),
    [dados],
  );

  if (!dados) return null;
  const selecionado = paraColeta ? (dados.talhoes.find((t) => t.id === selecionadoId) ?? null) : null;
  const proximos = posicao ? talhoesPorPosicao(dados.talhoes, posicao) : [];
  const ondeEstou = proximos[0]?.dentro ? proximos[0].talhao : null;
  const maisPerto = !ondeEstou ? proximos[0] : null;
  const distancia = (m: number) => (m < 1000 ? `${fmt(m, 0)} m` : `${fmt(m / 1000, 1)} km`);

  if (selecionado) {
    const u = ultimaPorTalhao.get(selecionado.id);
    return (
      <>
        <h1>Talhão escolhido</h1>
        <div className="cartao">
          <MenuTalhao talhao={selecionado} aoRegistros={() => navigate(`/talhoes?talhao=${selecionado.id}`)} />
          <p className="dica" style={{ marginTop: '0.75rem' }}>
            {u
              ? u.msPct != null
                ? `Última coleta com MS: ${new Date(u.c.data + 'T00:00').toLocaleDateString('pt-BR')} · MS ${fmt(u.msPct, 1)}%`
                : `Última coleta: ${new Date(u.c.data + 'T00:00').toLocaleDateString('pt-BR')} · MS pendente`
              : 'Sem coleta registrada ainda.'}
          </p>
          <div className="acoes">
            <button onClick={() => setSelecionadoId(null)}>← Voltar ao mapa</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="pagina-mapa">
      <div className="titulo-linha">
        <h1>{paraColeta ? 'Nova coleta — escolha o talhão' : visao === 'colheita' ? 'Mapa da colheita' : 'Mapa da amostragem'}</h1>
        {!paraColeta && (
          <div className={`seletor-mapa${visao === 'colheita' ? ' na-direita' : ''}`} role="radiogroup" aria-label="Qual mapa">
            <span className="seletor-mapa-trilho" aria-hidden="true" />
            <button type="button" role="radio" aria-checked={visao === 'amostragem'} onClick={() => trocarVisao('amostragem')}>
              <Icone nome="lab" /> Amostragem
            </button>
            <button type="button" role="radio" aria-checked={visao === 'colheita'} onClick={() => trocarVisao('colheita')}>
              <Icone nome="colheita" /> Colheita
            </button>
          </div>
        )}
      </div>
      <div className="cartao">
        <div className="mapa-com-botao">
        <button type="button" className="botao-cade-eu" onClick={cadeEu} disabled={lendoGps} title="Mostrar onde estou no mapa (não inicia coleta)">
          <Icone nome="gps" /> {lendoGps ? 'Procurando…' : 'Cadê eu?'}
        </button>
        <MapaTalhoes
          posicaoUsuario={posicao}
          talhoes={dados.talhoes}
          selecionadoId={selecionadoId}
          aoSelecionar={(t) => (paraColeta ? setSelecionadoId(t.id) : navigate(`/talhoes?talhao=${t.id}`))}
          altura="min(70vh, 640px)"
          className="mapa-principal"
          estilo={(t) => {
            if (visao === 'colheita') return corDaColheita(colheita?.porTalhao.get(t.id));
            const u = ultimaPorTalhao.get(t.id);
            const s = u ? statusMS(u.msPct, parametros) : null;
            return {
              cor: COR_SEMAFORO[semaforoDe(s)],
              tracejado: !u || u.msPct == null,
              rotuloExtra: u?.msPct != null ? `${fmt(u.msPct, 0)}% MS` : u ? 'MS pendente' : 'sem coleta',
            };
          }}
        />
        </div>
        {erroGps && (
          <p className="aviso">
            {erroGps}{' '}
            <button type="button" className="link" onClick={cadeEu}>Tentar de novo</button>
          </p>
        )}
        {posicao && (
          <div className="onde-estou" aria-live="polite">
            <Icone nome="gps" />
            <span className="onde-estou-texto">
              {ondeEstou ? (
                <>
                  Você está no <strong>{ondeEstou.nome}</strong>
                  {ondeEstou.capim ? <span className="mudo"> · {ondeEstou.capim}</span> : null}
                </>
              ) : maisPerto ? (
                <>
                  Você está fora dos talhões do mapa. Mais perto: <strong>{maisPerto.talhao.nome}</strong>, a {distancia(maisPerto.distanciaM)}.
                </>
              ) : (
                'Nenhum talhão com contorno para comparar.'
              )}
              {posicao.precisaoM != null && <small className="mudo"> (GPS ±{fmt(posicao.precisaoM, 0)} m)</small>}
            </span>
            <span className="onde-estou-acoes">
              {ondeEstou &&
                (paraColeta ? (
                  <button type="button" className="primario" onClick={() => setSelecionadoId(ondeEstou.id)}>Escolher este talhão</button>
                ) : (
                  <button type="button" onClick={() => navigate(`/talhoes?talhao=${ondeEstou.id}`)}>Ver talhão</button>
                ))}
              <button type="button" className="icone-acao" aria-label="Esconder minha posição" title="Esconder minha posição" onClick={() => setPosicao(null)}>
                <Icone nome="fechar" />
              </button>
            </span>
          </div>
        )}
        <p className="dica oculta-cel">
          {paraColeta ? 'Toque no talhão para iniciar a coleta.' : 'Toque no talhão para ver as informações dele (área, capim, coletas e colheita).'}
          {visao === 'amostragem' && ' A cor e a MS de cada talhão são da última coleta com MS aferida.'}
        </p>
        {visao === 'colheita' ? (
          <p className="dica legenda-mapa legenda-colheita">
            {COR_COLHEITA.faixas.map((f) => (
              <span key={f.rotulo} className="selo" style={{ background: f.cor, color: f.ate <= 50 ? '#0b2a5e' : '#fff' }}>{f.rotulo}</span>
            ))}{' '}
            <span className="selo" style={{ background: COR_COLHEITA.finalizada, color: '#fff' }}>finalizada</span>{' '}
            <span className="selo" style={{ background: COR_COLHEITA.semEstimativa, color: '#fff' }}>em colheita, sem amostragem</span>{' '}
            <span className="selo" style={{ background: COR_COLHEITA.semCarga, color: '#fff' }}>sem colheita</span>
            {colheita && colheita.porTalhao.size > 0 && (
              <span className="resumo-mapa-colheita">
                {' '}· {fmt(colheita.areaColhidaHa, 1)} ha colhidos em {colheita.emColheita + colheita.finalizados} talhão(ões)
              </span>
            )}
          </p>
        ) : (
        <p className="dica legenda-mapa">
          <span className="selo" style={{ background: COR_SEMAFORO.verde, color: '#fff' }}>
            <span className="rotulo-longo">verde: pronto para ensilar (MS {fmt(parametros.msMin, 0)}–{fmt(parametros.msMax, 0)} %)</span>
            <span className="rotulo-curto">pronto ({fmt(parametros.msMin, 0)}–{fmt(parametros.msMax, 0)} %)</span>
          </span>{' '}
          <span className="selo" style={{ background: COR_SEMAFORO.amarelo, color: '#3a2e00' }}>
            <span className="rotulo-longo">amarelo: sem coleta ou MS não aferida</span>
            <span className="rotulo-curto">sem MS</span>
          </span>{' '}
          <span className="selo" style={{ background: COR_SEMAFORO.vermelho, color: '#fff' }}>
            <span className="rotulo-longo">vermelho: MS fora do ponto (baixa ou alta)</span>
            <span className="rotulo-curto">fora do ponto</span>
          </span>
        </p>
        )}
      </div>
    </div>
  );
}

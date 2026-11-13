import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { amostrasPorColeta, ultimaColetaPorTalhao, useDados } from '../dados';
import type { Coleta } from '../tipos';
import { resumoColeta, statusMS } from '../calc';
import { MenuTalhao } from '../components';
import { fmt } from '../util';
import { useParametros } from '../parametros';
import MapaTalhoes from '../MapaTalhoes';
import { COR_SEMAFORO, semaforoDe } from '../semaforo';

export default function Mapa() {
  const navigate = useNavigate();
  const parametros = useParametros();
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const dados = useDados();

  const ultimaPorTalhao = useMemo(() => {
    const m = new Map<string, { c: Coleta; msPct: number | null }>();
    if (!dados) return m;
    const porColeta = amostrasPorColeta(dados.amostras);
    for (const [talhaoId, c] of ultimaColetaPorTalhao(dados.coletas)) {
      m.set(talhaoId, { c, msPct: resumoColeta(c, porColeta.get(c.id) ?? []).msPct });
    }
    return m;
  }, [dados]);

  if (!dados) return null;
  const selecionado = dados.talhoes.find((t) => t.id === selecionadoId) ?? null;

  if (selecionado) {
    const u = ultimaPorTalhao.get(selecionado.id);
    return (
      <>
        <h1>Talhão escolhido</h1>
        <div className="cartao">
          <MenuTalhao talhao={selecionado} aoRegistros={() => navigate(`/talhoes?talhao=${selecionado.id}`)} />
          <p className="dica" style={{ marginTop: '0.75rem' }}>
            {u ? `Última coleta: ${new Date(u.c.data + 'T00:00').toLocaleDateString('pt-BR')}${u.msPct != null ? ` · MS ${fmt(u.msPct, 1)}%` : ''}` : 'Sem coleta registrada ainda.'}
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
      <h1>Mapa — escolha o talhão</h1>
      <div className="cartao">
        <MapaTalhoes
          talhoes={dados.talhoes}
          selecionadoId={selecionadoId}
          aoSelecionar={(t) => setSelecionadoId(t.id)}
          altura="min(70vh, 640px)"
          className="mapa-principal"
          estilo={(t) => {
            const u = ultimaPorTalhao.get(t.id);
            const s = u ? statusMS(u.msPct, parametros) : null;
            return {
              cor: COR_SEMAFORO[semaforoDe(s)],
              tracejado: !u || u.msPct == null,
              rotuloExtra: u?.msPct != null ? `${fmt(u.msPct, 0)}% MS` : u ? 'MS pendente' : 'sem coleta',
            };
          }}
        />
        <p className="dica oculta-cel">Toque no talhão para ver os registros ou iniciar uma nova coleta.</p>
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
      </div>
    </div>
  );
}

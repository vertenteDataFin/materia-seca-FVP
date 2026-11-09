import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { amostrasPorColeta, ultimaColetaPorTalhao, useDados } from '../dados';
import type { Coleta } from '../tipos';
import { resumoColeta, statusMS } from '../calc';
import { MenuTalhao } from '../components';
import { fmt, lerParametros } from '../util';
import MapaTalhoes from '../MapaTalhoes';

export const COR_STATUS = { baixo: '#4aa3ff', ideal: '#39d353', alto: '#ffb020' } as const;

export default function Mapa() {
  const navigate = useNavigate();
  const [parametros] = useState(lerParametros);
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
    <>
      <h1>Mapa — escolha o talhão</h1>
      <div className="cartao">
        <MapaTalhoes
          talhoes={dados.talhoes}
          selecionadoId={selecionadoId}
          aoSelecionar={(t) => setSelecionadoId(t.id)}
          altura="min(70vh, 640px)"
          estilo={(t) => {
            const u = ultimaPorTalhao.get(t.id);
            const s = u ? statusMS(u.msPct, parametros) : null;
            return { cor: s ? COR_STATUS[s] : u ? '#9aa59a' : undefined, rotuloExtra: u?.msPct != null ? `${fmt(u.msPct, 0)}% MS` : t.capim };
          }}
        />
        <p className="dica">Toque no talhão para ver os registros ou iniciar uma nova coleta.</p>
        <p className="dica">
          <span className="selo" style={{ background: COR_STATUS.baixo, color: '#fff' }}>MS baixa</span>{' '}
          <span className="selo" style={{ background: COR_STATUS.ideal, color: '#fff' }}>ponto de ensilagem</span>{' '}
          <span className="selo" style={{ background: COR_STATUS.alto, color: '#fff' }}>MS alta</span>{' '}
          <span className="selo" style={{ background: '#9aa59a', color: '#fff' }}>coletado, aguardando laboratório</span>{' '}
          <span className="selo" style={{ background: '#2e9e3f', color: '#fff' }}>sem coleta</span>
        </p>
      </div>
    </>
  );
}

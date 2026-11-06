import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Amostra, type Coleta } from '../db';
import { resumoColeta, statusMS } from '../calc';
import { MenuTalhao } from '../components';
import { fmt, lerParametros } from '../util';
import MapaTalhoes from '../MapaTalhoes';

export const COR_STATUS = { baixo: '#4aa3ff', ideal: '#39d353', alto: '#ffb020' } as const;

export default function Mapa() {
  const navigate = useNavigate();
  const [parametros] = useState(lerParametros);
  const [selecionadoId, setSelecionadoId] = useState<number | null>(null);
  const dados = useLiveQuery(async () => {
    const [talhoes, coletas, amostras] = await Promise.all([db.talhoes.orderBy('nome').toArray(), db.coletas.toArray(), db.amostras.toArray()]);
    return { talhoes, coletas, amostras };
  }, []);

  const ultimaPorTalhao = useMemo(() => {
    const m = new Map<number, { c: Coleta; msPct: number | null }>();
    if (!dados) return m;
    const porColeta = new Map<number, Amostra[]>();
    for (const a of dados.amostras) porColeta.set(a.coletaId, [...(porColeta.get(a.coletaId) ?? []), a]);
    for (const c of dados.coletas) {
      const atual = m.get(c.talhaoId);
      if (!atual || c.data > atual.c.data || (c.data === atual.c.data && c.id! > atual.c.id!)) {
        m.set(c.talhaoId, { c, msPct: resumoColeta(c, porColeta.get(c.id!) ?? []).msPct });
      }
    }
    return m;
  }, [dados]);

  if (!dados) return null;
  const selecionado = dados.talhoes.find((t) => t.id === selecionadoId) ?? null;

  return (
    <>
      <h1>Mapa — escolha o talhão</h1>
      <div className="cartao">
        <MapaTalhoes
          talhoes={dados.talhoes}
          selecionadoId={selecionadoId}
          aoSelecionar={(t) => setSelecionadoId(t.id!)}
          altura="min(70vh, 640px)"
          estilo={(t) => {
            const u = ultimaPorTalhao.get(t.id!);
            const s = u ? statusMS(u.msPct, parametros) : null;
            return { cor: s ? COR_STATUS[s] : u ? '#9aa59a' : undefined, rotuloExtra: u?.msPct != null ? `${fmt(u.msPct, 0)}% MS` : t.capim };
          }}
        />
        {selecionado ? (
          <MenuTalhao talhao={selecionado} aoRegistros={() => navigate(`/talhoes?talhao=${selecionado.id}`)} aoFechar={() => setSelecionadoId(null)} />
        ) : (
          <p className="dica">Toque no talhão para ver os registros ou iniciar uma nova coleta.</p>
        )}
        <p className="dica">
          <span className="selo" style={{ background: COR_STATUS.baixo, color: '#fff' }}>MS baixa</span>{' '}
          <span className="selo" style={{ background: COR_STATUS.ideal, color: '#fff' }}>ponto de ensilagem</span>{' '}
          <span className="selo" style={{ background: COR_STATUS.alto, color: '#fff' }}>MS alta</span>{' '}
          <span className="selo" style={{ background: '#9aa59a', color: '#fff' }}>coletado, sem MS</span>{' '}
          <span className="selo" style={{ background: '#2e9e3f', color: '#fff' }}>sem coleta</span>
        </p>
      </div>
    </>
  );
}

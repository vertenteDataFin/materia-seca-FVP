import { METAS_MILHO, PENEIRAS_MILHO, type GranulometriaMilho } from './milhoReidratado';
import { fmt } from './util';

/** Meta que cobre só esta peneira (6 mm); nas outras a meta é da soma, mostrada em MetasMilho. */
function metaSo(i: number) {
  return METAS_MILHO.find((m) => m.peneiras.length === 1 && m.peneiras[0] === i);
}

/** % da peneira, com a cor da meta quando a peneira tem meta própria. */
export function PctPeneiraMilho({ i, pct }: { i: number; pct: number | null }) {
  if (pct == null) return <small className="mudo pct-peneira">—</small>;
  const m = metaSo(i);
  const classe = !m ? '' : m.max === 0 ? (pct < 0.05 ? 'penn-ok' : 'penn-fora') : '';
  return (
    <small className={`pct-peneira ${classe}`}>
      {fmt(pct, 1)}%{m && <span className="mudo"> (meta {m.texto})</span>}
    </small>
  );
}

/** As 3 metas (6 mm · 3,25 + 2 mm · 1,25 mm + fundo), verdes dentro e vermelhas fora. */
export function MetasMilho({ g }: { g: GranulometriaMilho }) {
  return (
    <span className="metas-milho">
      {g.metas.map(({ meta, pct, ok }, k) => (
        <span key={meta.chave}>
          {k > 0 && <span className="mudo"> · </span>}
          <span className="mudo">{meta.rotulo} </span>
          <span className={ok ? 'penn-ok' : 'penn-fora'} title={`meta ${meta.texto}`}>{fmt(pct, 1)}%</span>
        </span>
      ))}
    </span>
  );
}

/** Legenda das metas do milho reidratado. */
export function LegendaMilho() {
  return (
    <span className="legenda-penn">
      Peneiras {PENEIRAS_MILHO.map((p) => p.curto).join(' · ')}. Meta: {METAS_MILHO.map((m) => `${m.rotulo} ${m.texto}`).join(' · ')}.{' '}
      <span className="penn-ok">verde</span> = dentro, <span className="penn-fora">vermelho</span> = fora.
    </span>
  );
}

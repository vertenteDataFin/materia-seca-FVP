import { classePenn, FAIXAS_IDEAIS_PENN, PENEIRAS } from './amostragemColheita';
import { fmt } from './util';

const metaTexto = (i: number) => (FAIXAS_IDEAIS_PENN[i] ? `meta ${FAIXAS_IDEAIS_PENN[i]!.rotulo}` : 'sem meta');

/**
 * Percentuais do Penn State (19 · 8 · 4 · fundo): verde dentro da meta, vermelho fora, neutro nas peneiras sem meta,
 * com a meta no "title" (passar o mouse).
 */
export function PercentuaisPenn({ pct }: { pct: [number, number, number, number] }) {
  return (
    <span className="penn-pct">
      {pct.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="mudo"> · </span>}
          <span className={classePenn(i, p)} title={`${PENEIRAS[i].rotulo}: ${fmt(p, 1)}% (${metaTexto(i)})`}>
            {fmt(p, 1)}
          </span>
        </span>
      ))}
    </span>
  );
}

/** Legenda das metas (só as peneiras que têm meta). */
export function LegendaPenn() {
  const metas = PENEIRAS.map((p, i) => (FAIXAS_IDEAIS_PENN[i] ? `${p.rotulo === 'Fundo' ? 'fundo' : p.rotulo} ${FAIXAS_IDEAIS_PENN[i]!.rotulo}` : null)).filter(Boolean);
  return (
    <span className="legenda-penn">
      Meta: {metas.join(' · ')} (8 mm sem meta). <span className="penn-ok">verde</span> = dentro, <span className="penn-fora">vermelho</span> = fora.
    </span>
  );
}

/** "10,0% (meta < 12%)" com a cor da meta, para o detalhe da amostra e o formulário. */
export function PctPeneira({ i, pct }: { i: number; pct: number | null }) {
  if (pct == null) return <small className="mudo pct-peneira">—</small>;
  return (
    <small className={`pct-peneira ${classePenn(i, pct)}`}>
      {fmt(pct, 1)}% <span className="mudo">({metaTexto(i)})</span>
    </small>
  );
}

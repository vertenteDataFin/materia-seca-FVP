import { dentroDaFaixa, FAIXAS_IDEAIS_PENN, PENEIRAS } from './amostragemColheita';
import { fmt } from './util';

/**
 * Percentuais do Penn State (19 · 8 · 4 · fundo), cada um verde se estiver na faixa ideal e vermelho se estiver fora,
 * com a faixa no "title" (passar o mouse).
 */
export function PercentuaisPenn({ pct }: { pct: [number, number, number, number] }) {
  return (
    <span className="penn-pct">
      {pct.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="mudo"> · </span>}
          <span
            className={dentroDaFaixa(i, p) ? 'penn-ok' : 'penn-fora'}
            title={`${PENEIRAS[i].rotulo}: ${fmt(p, 1)}% (ideal ${FAIXAS_IDEAIS_PENN[i].rotulo})`}
          >
            {fmt(p, 1)}
          </span>
        </span>
      ))}
    </span>
  );
}

/** Legenda das faixas ideais (mesmas da planilha da fazenda). */
export function LegendaPenn() {
  return (
    <span className="legenda-penn">
      Ideal: {PENEIRAS.map((p, i) => `${p.rotulo === 'Fundo' ? 'fundo' : p.rotulo === '19 mm' ? '>19 mm' : p.rotulo === '8 mm' ? '8–19 mm' : '4–8 mm'} ${FAIXAS_IDEAIS_PENN[i].rotulo}`).join(' · ')}.{' '}
      <span className="penn-ok">verde</span> = dentro, <span className="penn-fora">vermelho</span> = fora.
    </span>
  );
}

/** "10,0% (ideal 3–8%)" com a cor da faixa, para o detalhe da amostra e o formulário. */
export function PctPeneira({ i, pct }: { i: number; pct: number | null }) {
  if (pct == null) return <small className="mudo pct-peneira">—</small>;
  return (
    <small className={`pct-peneira ${dentroDaFaixa(i, pct) ? 'penn-ok' : 'penn-fora'}`}>
      {fmt(pct, 1)}% <span className="mudo">(ideal {FAIXAS_IDEAIS_PENN[i].rotulo})</span>
    </small>
  );
}

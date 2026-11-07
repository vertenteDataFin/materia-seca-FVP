import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ROTULO_STATUS, type StatusMS } from './calc';
import { numParaTexto, parseNum } from './util';

/** true quando a tela é estreita (celular). Acompanha rotação/redimensionamento. */
export function useCelular(maxPx = 700) {
  const consulta = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(`(max-width: ${maxPx}px)`) : null);
  const [cel, setCel] = useState(() => consulta()?.matches ?? false);
  useEffect(() => {
    const mq = consulta();
    if (!mq) return;
    const f = (e: MediaQueryListEvent) => setCel(e.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxPx]);
  return cel;
}

/** Campo numérico que aceita vírgula e só grava ao sair do campo. */
export function CampoNumero({
  valor,
  aoSalvar,
  placeholder,
  ariaLabel,
}: {
  valor: number | null;
  aoSalvar: (v: number | null) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [texto, setTexto] = useState(numParaTexto(valor));
  useEffect(() => setTexto(numParaTexto(valor)), [valor]);
  return (
    <input
      className="num"
      inputMode="decimal"
      value={texto}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => setTexto(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => {
        const v = parseNum(texto);
        if (v !== valor) aoSalvar(v);
        else setTexto(numParaTexto(valor));
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

/** Menu que aparece ao tocar num talhão do mapa: Registros ou Nova coleta. */
export function MenuTalhao({
  talhao,
  aoRegistros,
  aoFechar,
}: {
  talhao: { id?: number; nome: string; capim: string; areaHa: number; fazenda?: string };
  aoRegistros: () => void;
  aoFechar?: () => void;
}) {
  return (
    <div className="menu-talhao" role="dialog" aria-label={`Talhão ${talhao.nome}`}>
      <div>
        <strong>{talhao.nome}</strong>
        <div className="mudo">
          <small>
            {talhao.capim || 'capim não informado'} · {talhao.areaHa > 0 ? `${talhao.areaHa.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ha` : 'área não informada'}
            {talhao.fazenda ? ` · Faz. ${talhao.fazenda}` : ''}
          </small>
        </div>
      </div>
      <div className="acoes">
        <button onClick={aoRegistros}>Registros</button>
        <Link className="botao primario" to={`/coletas/nova?talhao=${talhao.id}`}>Nova coleta</Link>
        {aoFechar && <button onClick={aoFechar} aria-label="Fechar">✕</button>}
      </div>
    </div>
  );
}

export function SeloMS({ status }: { status: StatusMS | null }) {
  if (!status) return <span className="selo">sem MS</span>;
  return <span className={`selo selo-${status}`}>{ROTULO_STATUS[status]}</span>;
}

export function Indicador({ rotulo, valor, unidade }: { rotulo: string; valor: string; unidade?: string }) {
  return (
    <div className="indicador">
      <div className="indicador-rotulo">{rotulo}</div>
      <div className="indicador-valor">
        {valor}
        {unidade && valor !== '—' && <small> {unidade}</small>}
      </div>
    </div>
  );
}

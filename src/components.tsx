import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { QUADRO_M2, ROTULO_STATUS, type StatusMS } from './calc';
import { atualizarColeta } from './dados';
import type { Coleta } from './tipos';
import { fmt } from './util';
import { ROTULO_SEMAFORO, semaforoDe, type Semaforo } from './semaforo';
import { criarColeta } from './coletas';
import { numParaTexto, parseNum } from './util';
import { Icone } from './Icone';

/** Barra de etapas da coleta: Talhão → Pontos → Pesos → Resultado. */
export function PassosColeta({ coletaId, atual }: { coletaId: string; atual: 1 | 2 | 3 | 4 }) {
  const passos: [number, string, string][] = [
    [1, 'Talhão', '/mapa'],
    [2, 'Pontos', `/coletas/${coletaId}/pontos`],
    [3, 'Pesos', `/coletas/${coletaId}/pesos`],
    [4, 'Resultado', `/coletas/${coletaId}`],
  ];
  return (
    <nav className="passos" aria-label="Etapas da coleta">
      {passos.map(([n, rotulo, to]) => (
        <Link key={n} to={to} className={n === atual ? 'ativo' : n < atual ? 'feito' : ''} aria-current={n === atual ? 'step' : undefined}>
          <span className="passo-n">{n}</span>
          {rotulo}
        </Link>
      ))}
    </nav>
  );
}

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
  talhao: { id: string; nome: string; capim: string; areaHa: number; fazenda?: string };
  aoRegistros: () => void;
  aoFechar?: () => void;
}) {
  const navigate = useNavigate();
  const [criando, setCriando] = useState(false);
  async function novaColeta() {
    setCriando(true);
    try {
      const id = criarColeta(talhao.id);
      navigate(`/coletas/${id}/pontos`);
    } finally {
      setCriando(false);
    }
  }
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
        <button className="primario" onClick={novaColeta} disabled={criando}>{criando ? 'Criando…' : 'Nova coleta'}</button>
        {aoFechar && <button className="icone-acao" onClick={aoFechar} aria-label="Fechar" title="Fechar"><Icone nome="fechar" /></button>}
      </div>
    </div>
  );
}

/** Selo de situação da MS nas cores do semáforo (verde pronto, vermelho fora do ponto, amarelo sem MS). */
/** Coleta antiga gravada com quadro diferente de 1 m²: avisa e oferece corrigir (o quadro agora é sempre 1 m²). */
export function AvisoQuadro({ coleta }: { coleta: Pick<Coleta, 'id' | 'areaAmostralM2'> }) {
  if (coleta.areaAmostralM2 === QUADRO_M2) return null;
  return (
    <p className="aviso largo">
      Esta coleta foi registrada com quadro de {fmt(coleta.areaAmostralM2, 2)} m², mas o quadro usado é sempre de {QUADRO_M2} m².{' '}
      <button type="button" onClick={() => atualizarColeta(coleta.id, { areaAmostralM2: QUADRO_M2 })}>Corrigir para {QUADRO_M2} m²</button>
    </p>
  );
}

export function SeloMS({ status, semColeta = false }: { status: StatusMS | null; semColeta?: boolean }) {
  const cor = semaforoDe(status);
  const texto = status ? ROTULO_STATUS[status] : semColeta ? 'sem coleta' : 'MS não aferida';
  return <span className={`selo selo-${cor}`}>{texto}</span>;
}

/** Bolinha do semáforo (para listas e mapa). */
export function Bolinha({ cor, titulo }: { cor: Semaforo; titulo?: string }) {
  return <span className={`bolinha bolinha-${cor}`} title={titulo ?? ROTULO_SEMAFORO[cor]} aria-label={titulo ?? ROTULO_SEMAFORO[cor]} />;
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

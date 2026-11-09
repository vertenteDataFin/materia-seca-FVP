import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { amostrasPorColeta, atualizarAmostra, useDados } from '../dados';
import { compararColetasDesc, type Amostra, type Coleta, type Talhao } from '../tipos';
import { resumoColeta, teorMS } from '../calc';
import { CampoNumero } from '../components';
import { codigoAmostra, pendenteLab, statusColeta } from '../fluxo';
import { fmt, fmtData } from '../util';

interface Grupo {
  c: Coleta;
  t: Talhao | undefined;
  amostras: Amostra[];
  pendentes: number;
}

/** Módulo de laboratório: amostras vindas do campo aguardando peso úmido/seco (MS). */
export default function Laboratorio() {
  const dados = useDados();
  const [params] = useSearchParams();
  const destaque = params.get('coleta');
  const [mostrarConcluidas, setMostrarConcluidas] = useState(false);
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set(destaque ? [destaque] : []));

  const grupos = useMemo(() => {
    if (!dados) return { pendentes: [] as Grupo[], concluidas: [] as Grupo[] };
    const porColeta = amostrasPorColeta(dados.amostras);
    const talhoes = new Map(dados.talhoes.map((t) => [t.id, t]));
    const todos: Grupo[] = [...dados.coletas].sort(compararColetasDesc).map((c) => {
      const amostras = porColeta.get(c.id) ?? [];
      return { c, t: talhoes.get(c.talhaoId), amostras, pendentes: amostras.filter(pendenteLab).length };
    });
    return {
      // Só entram na fila coletas com o campo concluído (todos os pontos com peso verde).
      pendentes: todos.filter((g) => statusColeta(g.amostras) === 'laboratorio'),
      concluidas: todos.filter((g) => g.amostras.length && statusColeta(g.amostras) === 'completa'),
    };
  }, [dados]);

  useEffect(() => {
    if (!destaque) return;
    document.getElementById(`lab-${destaque}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [destaque, dados]);

  if (!dados) return null;
  const alternar = (id: string) =>
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const totalPendentes = grupos.pendentes.reduce((s, g) => s + g.pendentes, 0);

  return (
    <>
      <div className="titulo-linha">
        <h1>Laboratório</h1>
        <Link to="/coletas">Campo →</Link>
      </div>
      <p className="dica">
        Para cada amostra que veio do campo, lance a subamostra de umidade: peso <strong>úmido</strong> e peso <strong>seco</strong> (g, já sem a tara).
        A MS aparece na hora e a coleta sai desta fila quando todos os pontos estiverem aferidos. Confira o código da etiqueta do saco.
      </p>

      <div className="cartao">
        <div className="cabecalho-cartao">
          <h2>Aguardando MS</h2>
          <span className={`selo ${totalPendentes ? 'selo-alto' : 'selo-ideal'}`}>{totalPendentes} amostra(s)</span>
        </div>
        {!grupos.pendentes.length ? (
          <p className="vazio">Nenhuma amostra pendente. Coletas ainda em campo (sem todos os pesos verdes) aparecem em <Link to="/coletas">Campo</Link>.</p>
        ) : (
          grupos.pendentes.map((g) => <GrupoLab key={g.c.id} g={g} aberto={abertos.has(g.c.id) || grupos.pendentes.length === 1} alternar={() => alternar(g.c.id)} />)
        )}
      </div>

      {grupos.concluidas.length > 0 && (
        <div className="cartao">
          <div className="cabecalho-cartao">
            <h2>Concluídas ({grupos.concluidas.length})</h2>
            <button onClick={() => setMostrarConcluidas((v) => !v)}>{mostrarConcluidas ? 'Ocultar' : 'Mostrar'}</button>
          </div>
          {mostrarConcluidas && grupos.concluidas.map((g) => <GrupoLab key={g.c.id} g={g} aberto={abertos.has(g.c.id)} alternar={() => alternar(g.c.id)} />)}
        </div>
      )}
    </>
  );
}

function GrupoLab({ g, aberto, alternar }: { g: Grupo; aberto: boolean; alternar: () => void }) {
  const { c, t, amostras } = g;
  const r = resumoColeta(c, amostras);
  const nome = t?.nome ?? 'talhão removido';
  return (
    <div className="lab-grupo" id={`lab-${c.id}`}>
      <button className="lab-cabecalho" onClick={alternar} aria-expanded={aberto}>
        <span className="lab-seta" aria-hidden>{aberto ? '▾' : '▸'}</span>
        <strong>{nome}</strong>
        <span className="mudo">{fmtData(c.data)}{c.responsavel ? ` · ${c.responsavel}` : ''}</span>
        <span className="espaco" />
        {g.pendentes ? <span className="selo selo-alto">{g.pendentes} de {amostras.length} sem MS</span> : <span className="selo selo-ideal">MS {fmt(r.msPct)} %</span>}
      </button>
      {aberto && (
        <>
          <div className="lab-linhas">
            <div className="lab-linha lab-titulo">
              <span>Amostra</span>
              <span className="n">Verde (kg)</span>
              <span>Úmido (g)</span>
              <span>Seco (g)</span>
              <span className="n">MS %</span>
            </div>
            {amostras.map((a) => {
              const ms = teorMS(a);
              const invalido = a.pesoUmidoG != null && a.pesoSecoG != null && ms == null;
              return (
                <div key={a.id} className={`lab-linha ${pendenteLab(a) ? 'pendente' : ''}`}>
                  <span>
                    <strong>P{a.ponto}</strong> <code className="codigo">{codigoAmostra(nome, c.data, a.ponto)}</code>
                  </span>
                  <span className="n">{fmt(a.pesoVerdeKg, 2)}</span>
                  <CampoNumero valor={a.pesoUmidoG} ariaLabel={`Peso úmido ponto ${a.ponto}`} placeholder="úmido" aoSalvar={(v) => atualizarAmostra(a.id, { pesoUmidoG: v })} />
                  <CampoNumero valor={a.pesoSecoG} ariaLabel={`Peso seco ponto ${a.ponto}`} placeholder="seco" aoSalvar={(v) => atualizarAmostra(a.id, { pesoSecoG: v })} />
                  <span className={`n ${invalido ? 'erro' : ''}`}>{invalido ? 'seco > úmido' : ms == null ? '—' : fmt(ms)}</span>
                </div>
              );
            })}
          </div>
          <div className="acoes" style={{ marginTop: '0.5rem' }}>
            <Link className="botao" to={`/coletas/${c.id}`}>Ver resultado da coleta</Link>
          </div>
        </>
      )}
    </div>
  );
}

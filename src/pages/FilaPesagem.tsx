import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { amostrasPorColeta, atualizarAmostra, useDados } from '../dados';
import { producaoPonto } from '../calc';
import { CampoNumero } from '../components';
import { codigoAmostra, statusColeta } from '../fluxo';
import { origemPosicao } from '../geo';
import { Icone } from '../Icone';
import { compararColetasDesc, type Amostra, type Coleta, type Talhao } from '../tipos';
import { fmt, fmtData } from '../util';

interface Grupo {
  c: Coleta;
  t: Talhao | undefined;
  amostras: Amostra[];
  semPeso: number;
}

/** Ponto marcado em campo ainda sem o peso verde. */
export const semPesoVerde = (a: Amostra) => a.pesoVerdeKg == null;

/**
 * PROTÓTIPO — "stand by" da pesagem (topo da página Amostragem): em campo só se marcam os pontos no GPS;
 * os sacos são pesados depois e o peso verde é lançado aqui, pelo código da etiqueta.
 * Com todos os pontos pesados, a coleta sai daqui e entra em "Aguardando MS".
 */
export function FilaPesagem({ destaque }: { destaque: string | null }) {
  const dados = useDados();
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set(destaque ? [destaque] : []));

  const grupos = useMemo(() => {
    if (!dados) return [] as Grupo[];
    const porColeta = amostrasPorColeta(dados.amostras);
    const talhoes = new Map(dados.talhoes.map((t) => [t.id, t]));
    return [...dados.coletas]
      .sort(compararColetasDesc)
      .map((c) => {
        const amostras = porColeta.get(c.id) ?? [];
        return { c, t: talhoes.get(c.talhaoId), amostras, semPeso: amostras.filter(semPesoVerde).length };
      })
      .filter((g) => statusColeta(g.amostras) === 'campo');
  }, [dados]);

  useEffect(() => {
    if (!destaque) return;
    setAbertos((s) => (s.has(destaque) ? s : new Set([...s, destaque])));
    document.getElementById(`pesagem-${destaque}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [destaque, dados != null]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!dados || !grupos.length) return null;
  const alternar = (id: string) =>
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const total = grupos.reduce((s, g) => s + g.semPeso, 0);

  return (
    <div className="cartao fila-ms fila-pesagem">
      <div className="cabecalho-cartao">
        <h2>Aguardando pesagem <span className="selo selo-baixo">em teste</span></h2>
        <span className="selo selo-alto">{total} ponto{total === 1 ? '' : 's'}</span>
      </div>
      <p className="dica">
        Pontos marcados em campo, ainda sem o peso verde. Pese cada saco (kg, quadro inteiro) e lance pelo código da etiqueta.
        A coleta sai daqui quando todos os pontos estiverem pesados e vai para <strong>Aguardando MS</strong>.
      </p>
      {grupos.map((g) => (
        <GrupoPesagem key={g.c.id} g={g} aberto={abertos.has(g.c.id) || grupos.length === 1} alternar={() => alternar(g.c.id)} />
      ))}
    </div>
  );
}

function GrupoPesagem({ g, aberto, alternar }: { g: Grupo; aberto: boolean; alternar: () => void }) {
  const { c, t, amostras } = g;
  const nome = t?.nome ?? 'talhão removido';
  return (
    <div className="lab-grupo" id={`pesagem-${c.id}`}>
      <button className="lab-cabecalho" onClick={alternar} aria-expanded={aberto}>
        <span className="lab-seta" aria-hidden><Icone nome={aberto ? 'expandir' : 'recolher'} /></span>
        <strong>{nome}</strong>
        <span className="mudo">{fmtData(c.data)}{c.responsavel ? ` · ${c.responsavel}` : ''}</span>
        <span className="espaco" />
        <span className="selo selo-alto">{g.semPeso} de {amostras.length} sem peso</span>
      </button>
      {aberto && (
        <>
          <div className="lab-linhas">
            <div className="lab-linha lab-titulo">
              <span>Amostra</span>
              <span>Posição</span>
              <span>Peso verde (kg)</span>
              <span className="n">kg/m²</span>
            </div>
            {amostras.map((a) => {
              const kg = producaoPonto(a, c.areaAmostralM2);
              return (
                <div key={a.id} className={`lab-linha ${semPesoVerde(a) ? 'pendente' : ''}`}>
                  <span>
                    <strong>P{a.ponto}</strong> <code className="codigo">{codigoAmostra(nome, c.data, a.ponto)}</code>
                  </span>
                  <span className="mv mudo" data-rotulo="Posição">
                    <small>{a.lat == null ? 'sem posição' : origemPosicao(a) === 'gps' ? `GPS${a.precisaoM != null ? ` ±${a.precisaoM} m` : ''}` : 'no mapa'}</small>
                  </span>
                  <CampoNumero valor={a.pesoVerdeKg} ariaLabel={`Peso verde ponto ${a.ponto}`} placeholder="peso (kg)" aoSalvar={(v) => atualizarAmostra(a.id, { pesoVerdeKg: v })} />
                  <span className="n ms" data-rotulo="kg/m²">{kg == null ? '—' : fmt(kg, 2)}</span>
                </div>
              );
            })}
          </div>
          <div className="acoes" style={{ marginTop: '0.5rem' }}>
            <Link className="botao" to={`/coletas/${c.id}/campo`}>Voltar aos pontos (mapa)</Link>
          </div>
        </>
      )}
    </div>
  );
}

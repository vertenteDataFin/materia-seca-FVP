import { useMemo, useState, type FormEvent } from 'react';
import { amostrasPorColeta, atualizarCarga, atualizarTalhao, excluirCarga, useDados } from '../dados';
import {
  agoraLocal,
  andamentoTalhao,
  cargaPesada,
  fmtSaida,
  liquidoKg,
  msColheitaPorTalhao,
  normalizarPlaca,
  referenciaDoTalhao,
  tarasPorPlaca,
  type AndamentoTalhao,
  type MSColheitaTalhao,
} from '../colheita';
import type { Carga } from '../tipos';
import { CampoNumero } from '../components';
import { Icone } from '../Icone';
import { usePermissoes } from '../permissoes';
import { fmt, fmtData, hoje, parseNum } from '../util';

/**
 * Colheita: andamento por talhão e as cargas pesadas, que entram pelo relatório da balança.
 * A área colhida de cada talhão vem do peso das cargas ÷ estimativa da última amostragem (em MS).
 */
export default function Colheita() {
  const dados = useDados();
  const { podePesar, podeExcluir } = usePermissoes();
  const [editando, setEditando] = useState<string | null>(null);
  const [mostrarFinalizados, setMostrarFinalizados] = useState(false);

  const calc = useMemo(() => {
    if (!dados) return null;
    const porColeta = amostrasPorColeta(dados.amostras);
    const nomes = new Map(dados.talhoes.map((t) => [t.id, t.nome]));
    const comCarga = new Set(dados.cargas.map((c) => c.talhaoId));
    // MS da produção: caminhões amostrados (amostragem de colheita); a de campo só na falta deles.
    const msPorTalhao = msColheitaPorTalhao(dados.amostrasColheita);
    const andamentos = dados.talhoes
      .filter((t) => comCarga.has(t.id))
      .map((t) => andamentoTalhao(t, dados.cargas, referenciaDoTalhao(t.id, dados.coletas, porColeta), msPorTalhao.get(t.id) ?? null))
      // em colheita primeiro, pela carga mais recente
      .sort((a, b) => Number(a.finalizada) - Number(b.finalizada) || (b.ultima ?? '').localeCompare(a.ultima ?? ''));
    return {
      nomes,
      andamentos,
      pendentes: dados.cargas.filter((c) => !cargaPesada(c)).sort((a, b) => a.saidaEm.localeCompare(b.saidaEm)),
      pesadas: dados.cargas.filter(cargaPesada),
      taras: tarasPorPlaca(dados.cargas),
      msPorTalhao,
    };
  }, [dados]);

  if (!dados || !calc) return null;
  const nome = (id: string) => calc.nomes.get(id) ?? 'talhão removido';
  const emColheita = calc.andamentos.filter((a) => !a.finalizada);
  const andamentoDe = new Map(calc.andamentos.map((a) => [a.talhao.id, a]));
  const finalizados = calc.andamentos.filter((a) => a.finalizada);

  // A tara é do caminhão: vem da última pesagem da mesma placa.
  const taraDaPlaca = (placa?: string) => calc.taras.get(normalizarPlaca(placa)) ?? null;

  return (
    <>
      <h1>Colheita</h1>
      <p className="dica">
        As cargas da colheita entram pelo <strong>relatório da balança</strong> (pesagens completas, com romaneio). A área colhida de cada
        talhão é estimada pela matéria seca entregue e pela última amostragem do talhão.
      </p>

      {/* Só cargas antigas, registradas no campo antes de a colheita passar a vir do relatório da balança. */}
      {calc.pendentes.length > 0 && (
        <div className="cartao">
          <div className="cabecalho-cartao">
            <h2>Aguardando pesagem</h2>
            <span className="selo selo-alto">
              {calc.pendentes.length} carga{calc.pendentes.length === 1 ? '' : 's'}
            </span>
          </div>
          <p className="dica">Cargas registradas no campo antes da mudança. Lance o peso ou exclua.</p>
          <div className="lista-cargas">
            {calc.pendentes.map((c) => (
              <CargaPendente key={c.id} c={c} nomeTalhao={nome(c.talhaoId)} podePesar={podePesar} podeExcluir={podeExcluir} taraDoCaminhao={taraDaPlaca(c.placa)} />
            ))}
          </div>
        </div>
      )}

      <div className="cartao">
        <div className="cabecalho-cartao">
          <h2>Andamento por talhão</h2>
        </div>
        {!emColheita.length ? (
          <p className="vazio">Nenhum talhão em colheita. O talhão aparece aqui quando o relatório da balança trouxer a primeira carga dele.</p>
        ) : (
          emColheita.map((a) => <CartaoAndamento key={a.talhao.id} a={a} />)
        )}
        {finalizados.length > 0 && (
          <>
            <button type="button" className="link mostrar-finalizados" onClick={() => setMostrarFinalizados((v) => !v)}>
              {mostrarFinalizados ? 'Ocultar' : 'Mostrar'} talhões com colheita finalizada ({finalizados.length})
            </button>
            {mostrarFinalizados && finalizados.map((a) => <CartaoAndamento key={a.talhao.id} a={a} />)}
          </>
        )}
      </div>

      <div className="cartao">
        <div className="cabecalho-cartao">
          <h2>Cargas pesadas</h2>
          <span className="mudo">{calc.pesadas.length}</span>
        </div>
        {!calc.pesadas.length ? (
          <p className="vazio">Nenhuma carga pesada ainda.</p>
        ) : (
          <div className="rolagem">
            <table className="tabela-cartoes lista-compacta tabela-pesadas">
              <thead>
                <tr>
                  <th>Saída</th>
                  <th>Talhão</th>
                  <th className="oculta-cel">Placa</th>
                  <th className="oculta-cel">Silo</th>
                  <th className="n">Líquido t</th>
                </tr>
              </thead>
              <tbody>
                {calc.pesadas.slice(0, 60).map((c) => (
                  <LinhaPesada
                    key={c.id}
                    c={c}
                    nomeTalhao={nome(c.talhaoId)}
                    aberta={editando === c.id}
                    alternar={() => setEditando(editando === c.id ? null : c.id)}
                    podePesar={podePesar}
                    podeExcluir={podeExcluir}
                    msAuto={msAutomatica(c, andamentoDe.get(c.talhaoId), calc.msPorTalhao.get(c.talhaoId))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Carga aguardando pesagem: balanceiro ou administrador lança o bruto ali mesmo.
 * A tara é do caminhão: se a placa já foi pesada, vem pronta (dá para alterar); se é a primeira vez, digita-se.
 */
function CargaPendente({ c, nomeTalhao, podePesar, podeExcluir, taraDoCaminhao }: { c: Carga; nomeTalhao: string; podePesar: boolean; podeExcluir: boolean; taraDoCaminhao: number | null }) {
  const [bruto, setBruto] = useState('');
  const [tara, setTara] = useState('');
  const [alterarTara, setAlterarTara] = useState(false);
  const [erro, setErro] = useState('');
  const usaTaraDoCaminhao = taraDoCaminhao != null && !alterarTara;
  const b = parseNum(bruto);
  const t = usaTaraDoCaminhao ? taraDoCaminhao : parseNum(tara);
  const liquido = b != null && t != null && b > t ? b - t : null;

  function pesar(e: FormEvent) {
    e.preventDefault();
    if (b == null) return setErro('Informe o peso bruto.');
    if (t == null) return setErro('Informe a tara do caminhão.');
    if (!(b > t)) return setErro('O peso bruto tem de ser maior que a tara.');
    // O romaneio não é digitado: vem do relatório da balança.
    atualizarCarga(c.id, { pesoBrutoKg: b, taraKg: t, pesadoEm: new Date().toISOString() });
  }

  return (
    <form className="carga-pendente" onSubmit={pesar}>
      <div className="carga-topo">
        <div>
          <strong>{nomeTalhao}</strong>
          <div className="mudo"><small>Saiu {fmtSaida(c.saidaEm)}{c.placa ? ` · ${c.placa}` : ''}{c.motorista ? ` · ${c.motorista}` : ''}{c.silo ? ` · ${c.silo}` : ''}</small></div>
        </div>
        {podeExcluir && (
          <button type="button" className="icone-acao perigo" aria-label="Excluir carga" title="Excluir carga" onClick={() => confirm(`Excluir a carga de ${nomeTalhao} (${fmtSaida(c.saidaEm)})?`) && excluirCarga(c.id)}>
            <Icone nome="excluir" />
          </button>
        )}
      </div>
      {podePesar && (
        <div className="carga-pesos">
          <label>
            Bruto (kg)
            <input inputMode="decimal" value={bruto} onChange={(e) => setBruto(e.target.value)} />
          </label>
          {usaTaraDoCaminhao ? (
            <div className="carga-tara">
              <span className="mudo"><small>Tara do caminhão</small></span>
              <strong>{fmt(taraDoCaminhao, 0)} kg</strong>
              <button type="button" className="link" onClick={() => { setTara(String(taraDoCaminhao)); setAlterarTara(true); }}>alterar</button>
            </div>
          ) : (
            <label>
              {taraDoCaminhao == null ? 'Tara (1ª pesagem do caminhão)' : 'Nova tara do caminhão (kg)'}
              <input inputMode="decimal" value={tara} onChange={(e) => setTara(e.target.value)} />
            </label>
          )}
          <div className="carga-liquido">
            <span className="mudo"><small>Líquido</small></span>
            <strong>{liquido != null ? `${fmt(liquido / 1000, 2)} t` : '—'}</strong>
          </div>
          <button type="submit" className="primario"><Icone nome="balanca" /> Lançar peso</button>
          {erro && <p className="erro">{erro}</p>}
        </div>
      )}
    </form>
  );
}

function CartaoAndamento({ a }: { a: AndamentoTalhao }) {
  const pct = a.pctColhida;
  const barra = pct == null ? 0 : Math.min(100, pct);
  const desvio = a.finalizada && a.tMVhaReal != null && a.ref ? (a.tMVhaReal / a.ref.tMVha - 1) * 100 : null;
  return (
    <div className={`andamento${a.finalizada ? ' finalizado' : ''}`}>
      <div className="andamento-topo">
        <strong>{a.talhao.nome}</strong>
        {a.finalizada ? (
          <span className="selo selo-ideal">Finalizada {a.talhao.colheitaFinalizadaEm ? fmtData(a.talhao.colheitaFinalizadaEm).slice(0, 5) : ''}</span>
        ) : (
          <span className="selo selo-baixo">Em colheita</span>
        )}
      </div>
      <div className="barra-progresso" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct == null ? undefined : Math.round(pct)}>
        <span style={{ width: `${barra}%` }} />
      </div>
      <p className="andamento-area">
        {a.areaColhidaHa == null ? (
          <span className="mudo">Sem amostragem com produção neste talhão: não dá para estimar a área colhida.</span>
        ) : (
          <>
            <strong>{fmt(pct, 0)}%</strong> colhido · {fmt(a.areaColhidaHa, 1)} de {fmt(a.talhao.areaHa, 1)} ha
          </>
        )}
      </p>
      <div className="andamento-numeros">
        <div><span>Entregue</span><strong>{fmt(a.tMV, 1)} t</strong></div>
        <div><span>Cargas</span><strong>{a.pesadas}{a.pendentes ? <small> +{a.pendentes} na balança</small> : null}</strong></div>
        <div><span>Ritmo</span><strong>{a.ritmoTdia != null ? `${fmt(a.ritmoTdia, 0)} t/dia` : '—'}</strong></div>
        {a.finalizada ? (
          <div><span>Real</span><strong>{fmt(a.tMVhaReal, 1)} t/ha</strong></div>
        ) : (
          <div><span>Faltam</span><strong>{a.diasRestantes != null ? `~${fmt(Math.ceil(a.diasRestantes), 0)} dia${Math.ceil(a.diasRestantes) === 1 ? '' : 's'}` : '—'}</strong></div>
        )}
      </div>
      <p className="dica andamento-ref">
        {a.ref ? (
          <>
            Estimativa da amostragem de {fmtData(a.ref.data)}: {fmt(a.ref.tMVha, 1)} t MV/ha
            {a.ref.msPct != null ? ` · MS ${fmt(a.ref.msPct, 1)}% (${fmt(a.ref.tMSha, 1)} t MS/ha)` : ' · sem MS aferida'}
            {desvio != null && ` · real ${desvio >= 0 ? '+' : ''}${fmt(desvio, 0)}% em relação à estimativa`}
          </>
        ) : (
          'Faça uma amostragem neste talhão para estimar a área colhida.'
        )}
        <br />
        {a.msColheita ? (
          <>
            MS da colheita (caminhões): <strong>{fmt(a.msColheita.media, 1)}%</strong> em {a.msColheita.n} amostra{a.msColheita.n === 1 ? '' : 's'}; é a
            usada na MS entregue{a.tMS != null && a.tMV > 0 ? ` (${fmt(a.tMS, 1)} t MS)` : ''}.
          </>
        ) : (
          'Sem amostra de caminhão com MS neste talhão: a MS entregue usa a da amostragem de campo.'
        )}
      </p>
      <div className="acoes">
        {a.finalizada ? (
          <button type="button" onClick={() => atualizarTalhao(a.talhao.id, { colheitaFinalizadaEm: null })}>Reabrir colheita</button>
        ) : (
          <button type="button" onClick={() => confirm(`Marcar a colheita de ${a.talhao.nome} como finalizada?`) && atualizarTalhao(a.talhao.id, { colheitaFinalizadaEm: hoje() })}>
            <Icone nome="ok" /> Finalizar colheita do talhão
          </button>
        )}
      </div>
    </div>
  );
}

/** MS que a carga usa sem valor próprio, e de onde ela vem. */
function msAutomatica(c: Carga, a: AndamentoTalhao | undefined, msCol: MSColheitaTalhao | undefined): { ms: number | null; fonte: string } {
  const doDia = msCol?.porDia.get(c.saidaEm.slice(0, 10));
  if (doDia) return { ms: doDia.media, fonte: `caminhões amostrados no dia (${doDia.n})` };
  if (msCol) return { ms: msCol.media, fonte: `média dos caminhões do talhão (${msCol.n})` };
  if (a?.ref?.msPct != null) return { ms: a.ref.msPct, fonte: 'amostragem de campo' };
  return { ms: null, fonte: 'sem MS' };
}

function LinhaPesada({
  c,
  nomeTalhao,
  aberta,
  alternar,
  podePesar,
  podeExcluir,
  msAuto,
}: {
  c: Carga;
  nomeTalhao: string;
  aberta: boolean;
  alternar: () => void;
  podePesar: boolean;
  podeExcluir: boolean;
  msAuto: { ms: number | null; fonte: string };
}) {
  return (
    <>
      <tr className="clicavel" tabIndex={0} aria-expanded={aberta} onClick={alternar} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(); } }}>
        <td className="nome-talhao">
          <strong>{fmtSaida(c.saidaEm)}</strong>
          {c.placa && <span className="so-cel mudo"><small>{c.placa}</small></span>}
        </td>
        <td>{nomeTalhao}</td>
        <td className="oculta-cel">{c.placa || '—'}{c.motorista && <div className="mudo"><small>{c.motorista}</small></div>}</td>
        <td className="oculta-cel">{c.silo || '—'}</td>
        <td className="n">{fmt((liquidoKg(c) ?? 0) / 1000, 2)}</td>
      </tr>
      {aberta && (
        <tr className="linha-edicao-carga">
          <td colSpan={5}>
            <div className="carga-edicao">
              <label>
                Bruto (kg)
                {podePesar ? <CampoNumero valor={c.pesoBrutoKg} ariaLabel="Peso bruto" aoSalvar={(v) => v != null && atualizarCarga(c.id, { pesoBrutoKg: v })} /> : <strong>{fmt(c.pesoBrutoKg, 0)}</strong>}
              </label>
              <label>
                Tara (kg)
                {podePesar ? <CampoNumero valor={c.taraKg} ariaLabel="Tara" aoSalvar={(v) => v != null && atualizarCarga(c.id, { taraKg: v })} /> : <strong>{fmt(c.taraKg, 0)}</strong>}
              </label>
              <label>
                MS da carga (%)
                <CampoNumero
                  valor={c.msPct ?? null}
                  ariaLabel="MS da carga"
                  placeholder={msAuto.ms != null ? fmt(msAuto.ms, 1) : '—'}
                  aoSalvar={(v) => atualizarCarga(c.id, { msPct: v })}
                />
              </label>
              <p className="mudo largo">
                <small>
                  {c.romaneio ? `Romaneio ${c.romaneio} · ` : ''}
                  {c.pesadoEm ? `pesada ${fmtSaida(agoraLocal(new Date(c.pesadoEm)))} · ` : ''}
                  {c.msPct != null
                    ? 'MS informada nesta carga (apague para voltar à automática).'
                    : `MS usada: ${msAuto.ms != null ? `${fmt(msAuto.ms, 1)}%` : '—'}, ${msAuto.fonte}.`}
                </small>
              </p>
              {podeExcluir && (
                <button type="button" className="perigo" onClick={() => confirm(`Excluir a carga de ${nomeTalhao} (${fmtSaida(c.saidaEm)})?`) && excluirCarga(c.id)}>
                  Excluir carga
                </button>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { amostrasPorColeta, atualizarCarga, atualizarTalhao, excluirCarga, useDados } from '../dados';
import {
  agoraLocal,
  andamentoTalhao,
  camposAreaInformada,
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
import VeiculosCard from '../VeiculosCard';
import { veiculoDaPlaca } from '../veiculos';
import { SILOS } from '../silos';
import ImportarBalanca from './ImportarBalanca';
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
  const { podePesar, podeExcluir, podeImportarBalanca, podeExcluirCargasPesadas } = usePermissoes();
  const [editando, setEditando] = useState<string | null>(null);
  const [mostrarFinalizados, setMostrarFinalizados] = useState(false);
  const [importando, setImportando] = useState(false);
  // cargas pesadas: só as de hoje; as anteriores aparecem pelo botão, em blocos de 60
  const [anteriores, setAnteriores] = useState(0);
  // filtro das cargas pesadas por caminhão (placa normalizada); '' = todos
  const [caminhao, setCaminhao] = useState('');

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

  const diaHoje = hoje();
  const pesadasHoje = calc.pesadas.filter((c) => c.saidaEm.startsWith(diaHoje));
  const pesadasAntes = calc.pesadas.filter((c) => !c.saidaEm.startsWith(diaHoje));
  // Caminhões com carga pesada, pelo nº do cadastro (sem nº, no fim, pela placa)
  const caminhoes = [...new Set(calc.pesadas.map((c) => normalizarPlaca(c.placa)).filter(Boolean))]
    .map((p) => ({ placa: p, v: veiculoDaPlaca(dados.veiculos, p), n: calc.pesadas.filter((c) => normalizarPlaca(c.placa) === p).length }))
    .sort((a, b) => (a.v?.numero ?? Infinity) - (b.v?.numero ?? Infinity) || a.placa.localeCompare(b.placa));
  // Com caminhão escolhido: todas as cargas dele (de todos os dias)
  const doCaminhao = caminhao ? calc.pesadas.filter((c) => normalizarPlaca(c.placa) === caminhao) : [];
  const tDoCaminhao = doCaminhao.reduce((s, c) => s + (liquidoKg(c) ?? 0), 0) / 1000;
  // Média do peso líquido por carga (t), só das cargas com líquido
  const mediaT = (cs: typeof calc.pesadas) => {
    const l = cs.map((c) => liquidoKg(c)).filter((x): x is number => x != null);
    return l.length ? l.reduce((s, x) => s + x, 0) / l.length / 1000 : null;
  };
  const mediaCaminhao = caminhao ? mediaT(doCaminhao) : null;
  const mediaGeral = mediaT(calc.pesadas);
  const tGeral = calc.pesadas.reduce((s, c) => s + (liquidoKg(c) ?? 0), 0) / 1000;
  // Tabela por caminhão: cargas, total e média do líquido por carga
  const porCaminhao = caminhoes.map((k) => {
    const cs = calc.pesadas.filter((c) => normalizarPlaca(c.placa) === k.placa);
    return { ...k, t: cs.reduce((s, c) => s + (liquidoKg(c) ?? 0), 0) / 1000, media: mediaT(cs) };
  });
  const visiveis = caminhao ? doCaminhao : [...pesadasHoje, ...pesadasAntes.slice(0, anteriores)];
  const faltam = caminhao ? 0 : Math.max(0, pesadasAntes.length - anteriores);

  return (
    <>
      <div className="titulo-linha">
        <h1>Colheita</h1>
        {podeImportarBalanca && !importando && (
          <button type="button" className="primario" onClick={() => setImportando(true)}>
            <Icone nome="balanca" /> Importar relatório da balança
          </button>
        )}
      </div>
      <p className="dica">
        As cargas da colheita entram pelo <strong>relatório da balança</strong> (pesagens completas, com romaneio). A área colhida de cada
        talhão é estimada pela matéria seca entregue e pela última amostragem do talhão.
        {!podeImportarBalanca && ' O relatório da balança é importado pela Maria Laura.'}
      </p>

      {importando && podeImportarBalanca && <ImportarBalanca aoFechar={() => setImportando(false)} />}

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

      <div className="cartao" id="cargas-pesadas">
        <div className="cabecalho-cartao cabecalho-cargas">
          <h2>Cargas pesadas</h2>
          {caminhoes.length > 1 && (
            <label className="filtro-caminhao">
              <span>Caminhão</span>
              <select value={caminhao} onChange={(e) => setCaminhao(e.target.value)}>
                <option value="">Todos</option>
                {caminhoes.map(({ placa, v, n }) => (
                  <option key={placa} value={placa}>
                    {v?.numero != null ? `${v.numero} – ` : ''}{placa}{v?.motorista ? ` · ${v.motorista}` : ''} ({n})
                  </option>
                ))}
              </select>
            </label>
          )}
          <span className="mudo contagem-cargas">{pesadasHoje.length} hoje · {calc.pesadas.length} no total{mediaGeral != null && !caminhao ? ` · média ${fmt(mediaGeral, 1)} t` : ''}</span>
        </div>
        {caminhao && (
          <p className="dica resumo-caminhao">
            {doCaminhao.length} carga{doCaminhao.length === 1 ? '' : 's'} deste caminhão · {fmt(tDoCaminhao, 1)} t
            {mediaCaminhao != null && <> · média <strong>{fmt(mediaCaminhao, 1)} t</strong>/carga</>}
            {mediaGeral != null && <span className="mudo"> (geral {fmt(mediaGeral, 1)} t)</span>}{' '}
            <button type="button" className="link" onClick={() => setCaminhao('')}>limpar filtro</button>
          </p>
        )}
        {!calc.pesadas.length ? (
          <p className="vazio">Nenhuma carga pesada ainda.</p>
        ) : (
          <>
            {!visiveis.length && <p className="vazio">{caminhao ? 'Nenhuma carga deste caminhão.' : 'Nenhuma carga pesada hoje.'}</p>}
            {visiveis.length > 0 && (
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
                    {visiveis.map((c) => (
                      <LinhaPesada
                        key={c.id}
                        c={c}
                        nomeTalhao={nome(c.talhaoId)}
                        aberta={editando === c.id}
                        alternar={() => setEditando(editando === c.id ? null : c.id)}
                        podePesar={podePesar}
                        podeExcluir={podeExcluirCargasPesadas}
                        msAuto={msAutomatica(c, andamentoDe.get(c.talhaoId), calc.msPorTalhao.get(c.talhaoId))}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!caminhao && (faltam > 0 || anteriores > 0) && (
              <div className="acoes">
                {faltam > 0 && (
                  <button type="button" onClick={() => setAnteriores((n) => n + 60)}>
                    {anteriores ? 'Ver mais' : 'Ver cargas anteriores'} ({faltam})
                  </button>
                )}
                {anteriores > 0 && (
                  <button type="button" className="link" onClick={() => setAnteriores(0)}>Mostrar só as de hoje</button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {porCaminhao.length > 0 && (
        <div className="cartao">
          <div className="cabecalho-cartao">
            <h2>Peso líquido por caminhão</h2>
            <span className="mudo">média por carga</span>
          </div>
          <div className="rolagem">
            <table className="lista-compacta tabela-caminhoes">
              <thead>
                <tr>
                  <th>Caminhão</th>
                  <th className="oculta-cel">Motorista</th>
                  <th className="n">Cargas</th>
                  <th className="n">Total t</th>
                  <th className="n">Média t</th>
                </tr>
              </thead>
              <tbody>
                {porCaminhao.map(({ placa, v, n, t, media }) => (
                  <tr key={placa} className={caminhao === placa ? 'selecionada' : undefined}>
                    <td>
                      <button
                        type="button"
                        className="link"
                        title="Ver as cargas deste caminhão"
                        onClick={() => {
                          const escolher = caminhao !== placa;
                          setCaminhao(escolher ? placa : '');
                          if (escolher) document.getElementById('cargas-pesadas')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                      >
                        {v?.numero != null ? `${v.numero} · ` : ''}{placa}
                      </button>
                    </td>
                    <td className="oculta-cel">{v?.motorista ?? '—'}</td>
                    <td className="n">{n}</td>
                    <td className="n">{fmt(t, 1)}</td>
                    <td className="n"><strong>{media != null ? fmt(media, 1) : '—'}</strong></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Todos</td>
                  <td className="oculta-cel" />
                  <td className="n">{calc.pesadas.length}</td>
                  <td className="n">{fmt(tGeral, 1)}</td>
                  <td className="n"><strong>{mediaGeral != null ? fmt(mediaGeral, 1) : '—'}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="dica">Toque no caminhão para ver as cargas dele acima. Cargas sem peso líquido ficam fora da média.</p>
        </div>
      )}

      <VeiculosCard />
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
  const { podeFinalizarColheita, podeEditarTalhoes } = usePermissoes();
  const pct = a.pctColhida;
  // Barra em toneladas: verde = entregue; amarelo = nova estimativa (produtividade real da colheita);
  // vermelho = teto (estimativa da amostragem de campo). Sem nenhuma estimativa, a barra é o % da área.
  const teto = a.producaoAmostragemT;
  const nova = a.finalizada ? null : a.producaoEstimadaT;
  const escala = Math.max(teto ?? 0, nova ?? 0, a.tMV);
  const emToneladas = escala > 0 && (teto != null || nova != null);
  const posicao = (t: number) => Math.min(100, (t / escala) * 100);
  const barra = emToneladas ? posicao(a.tMV) : pct == null ? 0 : Math.min(100, pct);
  const [haInformado, setHaInformado] = useState(a.informada ? String(a.informada.ha).replace('.', ',') : '');
  const [dataInformada, setDataInformada] = useState(a.informada?.data ?? hoje());
  const salvarArea = (e: FormEvent) => {
    e.preventDefault();
    const ha = parseNum(haInformado);
    if (ha == null || ha <= 0) return;
    atualizarTalhao(a.talhao.id, camposAreaInformada(a.talhao, { incluir: { ha, data: dataInformada, registradoEm: new Date().toISOString() } }));
    setMenuAberto(false);
  };
  const removerArea = (data: string) => {
    if (!confirm(`Apagar a área informada em ${fmtData(data)}?`)) return;
    const campos = camposAreaInformada(a.talhao, { remover: data });
    atualizarTalhao(a.talhao.id, campos);
    if (!campos.areaColhidaInformada) setHaInformado('');
  };
  const desvio = a.finalizada && a.tMVhaReal != null && a.ref ? (a.tMVhaReal / a.ref.tMVha - 1) * 100 : null;
  const [menuAberto, setMenuAberto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Fecha o menu ao tocar fora ou apertar Esc
  useEffect(() => {
    if (!menuAberto) return;
    const fora = (e: MouseEvent | TouchEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAberto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuAberto(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('touchstart', fora);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('touchstart', fora);
      document.removeEventListener('keydown', tecla);
    };
  }, [menuAberto]);

  return (
    <div className={`andamento${a.finalizada ? ' finalizado' : ''}`}>
      <div className="andamento-topo">
        <div className="andamento-nome">
          <div className="menu-acoes" ref={menuRef}>
            <button type="button" className="icone-acao" aria-haspopup="menu" aria-expanded={menuAberto} aria-label="Estimativas e ações" title="Estimativas e ações" onClick={() => setMenuAberto((v) => !v)}>
              <Icone nome="mais" />
            </button>
            {menuAberto && (
              <div className="menu-lista menu-andamento" role="menu">
                <div className="dica andamento-ref">
                  {a.ref ? (
                    <p>
                      <strong>Estimativa da amostragem de {fmtData(a.ref.data)}:</strong>
                      <br />
                      {fmt(a.ref.tMVha, 1)} t MV/ha
                      {a.ref.msPct != null ? ` · MS ${fmt(a.ref.msPct, 1)}% (${fmt(a.ref.tMSha, 1)} t MS/ha)` : ' · sem MS aferida'}
                      {desvio != null && ` · real ${desvio >= 0 ? '+' : ''}${fmt(desvio, 0)}% em relação à estimativa`}
                    </p>
                  ) : (
                    <p>Faça uma amostragem neste talhão para estimar a área colhida.</p>
                  )}
                  {a.msColheita ? (
                    <p>
                      <strong>MS da colheita (caminhões):</strong>
                      <br />
                      {fmt(a.msColheita.media, 1)}% em {a.msColheita.n} amostra{a.msColheita.n === 1 ? '' : 's'}
                      {a.tMS != null && a.tMV > 0 ? `; MS entregue = ${fmt(a.tMS, 1)} t MS.` : '.'}
                    </p>
                  ) : (
                    <p>Sem amostra de caminhão com MS neste talhão: a MS entregue usa a da amostragem de campo.</p>
                  )}
                  {a.historicoArea.length ? (
                    <div>
                      <strong>Área colhida informada (setor agrícola):</strong>
                      <ul className="historico-area">
                        {[...a.historicoArea].reverse().map((h) => (
                          <li key={h.data}>
                            <span>
                              <strong>{fmtData(h.data).slice(0, 5)}</strong> · {fmt(h.ha, 1)} ha · {fmt(h.tMVate, 0)} t
                              {h.tMVha != null ? ` = ${fmt(h.tMVha, 1)} t/ha` : ' · sem carga pesada até a data'}
                              {h.haPeriodo != null && (
                                <small className="mudo">
                                  <br />
                                  desde a anterior: {h.haPeriodo >= 0 ? '+' : ''}{fmt(h.haPeriodo, 1)} ha, {fmt(h.tPeriodo, 0)} t
                                  {h.tMVhaPeriodo != null ? ` = ${fmt(h.tMVhaPeriodo, 1)} t/ha` : ''}
                                </small>
                              )}
                            </span>
                            {podeEditarTalhoes && (
                              <button type="button" className="icone-acao" aria-label={`Apagar a área de ${fmtData(h.data)}`} title="Apagar" onClick={() => removerArea(h.data)}>
                                <Icone nome="excluir" />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                      <small className="mudo">A estimativa usa a mais recente.</small>
                    </div>
                  ) : (
                    !a.finalizada && <p>A área colhida é estimada pela amostragem. Se o setor agrícola informar a área, registre abaixo para refazer a estimativa de produção.</p>
                  )}
                </div>
                {podeEditarTalhoes && !a.finalizada && (
                  <form className="form-area-colhida" onSubmit={salvarArea}>
                    <label>
                      Área colhida (ha)
                      <input className="num" inputMode="decimal" value={haInformado} onChange={(e) => setHaInformado(e.target.value)} placeholder="ex.: 30" />
                    </label>
                    <label>
                      Até o dia
                      <input type="date" value={dataInformada} max={hoje()} onChange={(e) => setDataInformada(e.target.value)} />
                    </label>
                    <div className="form-area-botoes">
                      <button type="submit" className="primario" disabled={!(parseNum(haInformado) ?? 0)}>Salvar área</button>
                      {a.informada && (
                        <button
                          type="button"
                          onClick={() => {
                            if (!confirm('Apagar todas as áreas informadas deste talhão e voltar à estimativa da amostragem?')) return;
                            setMenuAberto(false);
                            setHaInformado('');
                            atualizarTalhao(a.talhao.id, { areaColhidaInformada: null, historicoAreaColhida: [] });
                          }}
                        >
                          Voltar à estimativa
                        </button>
                      )}
                    </div>
                  </form>
                )}
                {podeFinalizarColheita &&
                  (a.finalizada ? (
                    <button type="button" role="menuitem" onClick={() => { setMenuAberto(false); atualizarTalhao(a.talhao.id, { colheitaFinalizadaEm: null }); }}>
                      <Icone nome="atualizar" /> Reabrir colheita
                    </button>
                  ) : (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setMenuAberto(false); if (confirm(`Marcar a colheita de ${a.talhao.nome} como finalizada?`)) atualizarTalhao(a.talhao.id, { colheitaFinalizadaEm: hoje() }); }}
                    >
                      <Icone nome="ok" /> Finalizar colheita do talhão
                    </button>
                  ))}
              </div>
            )}
          </div>
          <strong>{a.talhao.nome}</strong>
        </div>
        {a.finalizada ? (
          <span className="selo selo-ideal">Finalizada {a.talhao.colheitaFinalizadaEm ? fmtData(a.talhao.colheitaFinalizadaEm).slice(0, 5) : ''}</span>
        ) : (
          <span className="selo selo-baixo">Em colheita</span>
        )}
      </div>
      <div className="barra-andamento">
        <div className="barra-progresso" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct == null ? undefined : Math.round(pct)}>
          <span style={{ width: `${barra}%` }} />
        </div>
        {emToneladas && nova != null && <i className="marca-barra estimada" style={{ left: `${posicao(nova)}%` }} title={`Nova estimativa: ${fmt(nova, 0)} t`} />}
        {emToneladas && teto != null && <i className="marca-barra teto" style={{ left: `${posicao(teto)}%` }} title={`Amostragem de campo: ${fmt(teto, 0)} t`} />}
      </div>
      {emToneladas && (
        <p className="andamento-legenda">
          <span><i className="leg entregue" />Entregue {fmt(a.tMV, 0)} t</span>
          {nova != null && <span><i className="leg estimada" />Nova estimativa {fmt(nova, 0)} t ({fmt(a.tMVhaColhido, 1)} t/ha)</span>}
          {teto != null && a.ref && <span><i className="leg teto" />Amostragem {fmt(teto, 0)} t ({fmt(a.ref.tMVha, 1)} t/ha)</span>}
        </p>
      )}
      <p className="andamento-area">
        {a.areaColhidaHa == null ? (
          <span className="mudo">Sem amostragem com produção neste talhão: não dá para estimar a área colhida.</span>
        ) : (
          <>
            <strong>{fmt(pct, 0)}%</strong> colhido · {fmt(a.areaColhidaHa, 1)} de {fmt(a.talhao.areaHa, 1)} ha
            {a.informada && (
              <span className="mudo">
                {' '}· {fmt(a.informada.ha, 1)} ha informados pelo agrícola em {fmtData(a.informada.data).slice(0, 5)}
                {a.areaColhidaHa - a.informada.ha > 0.05 ? ' + entregas depois' : ''}
              </span>
            )}
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
              <label>
                Silo
                <select value={c.silo ?? ''} aria-label="Silo da carga" onChange={(e) => atualizarCarga(c.id, { silo: e.target.value })}>
                  <option value="">— sem silo</option>
                  {[...SILOS, ...(c.silo && !SILOS.includes(c.silo) ? [c.silo] : [])].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
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

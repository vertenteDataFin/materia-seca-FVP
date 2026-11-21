import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { amostrasPorColeta, atualizarTalhao, excluirTalhao, useDados } from '../dados';
import { cargaPesada, resumoColheita, textoProgresso, tituloProgresso, type AndamentoTalhao } from '../colheita';
import type { Talhao } from '../tipos';
import { CAPINS_COMUNS, fmt, numParaTexto, parseNum } from '../util';
import { usePermissoes } from '../permissoes';
import { Icone } from '../Icone';
import DetalheTalhao from './DetalheTalhao';
import { capimFoto, mesmoCapim } from '../capinsFoto';

const vazio = { nome: '', fazenda: '', area: '', capim: '', observacoes: '' };

export default function Talhoes() {
  const dados = useDados();
  const { podeEditarTalhoes, podeExcluir, podeExcluirCargasPesadas } = usePermissoes();
  const [form, setForm] = useState(vazio);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [params] = useSearchParams();
  const inicial = params.get('talhao');
  const [selecionadoId, setSelecionadoId] = useState<string | null>(inicial);
  const [mostrarRegistros, setMostrarRegistros] = useState(inicial != null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [erro, setErro] = useState('');
  const carregado = dados != null;
  // Andamento da colheita de cada talhão (MS dos caminhões, cargas da balança), para a coluna Colheita.
  const colheita = useMemo(
    () => (dados ? resumoColheita(dados.talhoes, dados.cargas, dados.coletas, amostrasPorColeta(dados.amostras), dados.amostrasColheita).porTalhao : new Map<string, AndamentoTalhao>()),
    [dados],
  );

  // Vindo do mapa (?talhao=id): rola até o card, que já abre com o detalhe embaixo
  useEffect(() => {
    if (inicial && carregado) document.getElementById(`talhao-${inicial}`)?.scrollIntoView({ block: 'start' });
  }, [inicial, carregado]);

  function fecharForm() {
    setEditandoId(null);
    setForm(vazio);
    setErro('');
    setMostrarForm(false);
  }

  function salvar(e: FormEvent) {
    e.preventDefault();
    const areaHa = parseNum(form.area);
    if (!form.nome.trim()) return setErro('Informe o nome do talhão.');
    if (areaHa == null || areaHa <= 0) return setErro('Informe uma área válida (ha).');
    const campos = {
      nome: form.nome.trim(),
      fazenda: form.fazenda.trim(),
      areaHa,
      capim: form.capim.trim(),
      observacoes: form.observacoes.trim(),
    };
    // Só edição: talhão novo não se cria pelo app (vem do mapa da fazenda, KML).
    // atualizar preserva os demais campos (ex.: contorno importado do KML)
    if (editandoId != null) atualizarTalhao(editandoId, campos);
    fecharForm();
  }

  function editar(t: Talhao) {
    setEditandoId(t.id);
    setForm({ nome: t.nome, fazenda: t.fazenda ?? '', area: numParaTexto(t.areaHa), capim: t.capim, observacoes: t.observacoes ?? '' });
    setMostrarForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Abre o detalhe logo abaixo do card clicado (ou fecha, se já estava aberto). */
  function abrirOuFechar(id: string) {
    if (id === selecionadoId && mostrarRegistros) return setMostrarRegistros(false);
    setSelecionadoId(id);
    setMostrarRegistros(true);
    // mantém o card clicado no lugar: o detalhe que fecha acima dele não pode empurrar a tela
    requestAnimationFrame(() => document.getElementById(`talhao-${id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }

  function excluir(t: Talhao) {
    const n = dados?.coletas.filter((c) => c.talhaoId === t.id).length ?? 0;
    // excluir o talhão apaga as cargas dele; carga pesada só quem pode excluí-la (regras do Firestore)
    const pesadas = dados?.cargas.filter((c) => c.talhaoId === t.id && cargaPesada(c)).length ?? 0;
    if (pesadas && !podeExcluirCargasPesadas) {
      return alert(`O talhão "${t.nome}" tem ${pesadas} carga(s) pesada(s) da balança. Só a Maria Laura pode excluí-lo.`);
    }
    const aviso = n || pesadas ? `\n\nIsso também excluirá ${n} coleta(s) e suas amostras${pesadas ? ` e ${pesadas} carga(s) pesada(s)` : ''}.` : '';
    if (confirm(`Excluir o talhão "${t.nome}"?${aviso}`)) excluirTalhao(t.id);
  }

  if (!dados) return null;
  const talhoes = dados.talhoes;
  const semArea = talhoes.filter((t) => !(t.areaHa > 0)).length;
  const nColetas = new Map<string, number>();
  for (const c of dados.coletas) nColetas.set(c.talhaoId, (nColetas.get(c.talhaoId) ?? 0) + 1);
  // Amostras do talhão = coletas de campo + amostras de caminhão na colheita
  const nColheita = new Map<string, number>();
  for (const a of dados.amostrasColheita) nColheita.set(a.talhaoId, (nColheita.get(a.talhaoId) ?? 0) + 1);
  const selecionado = talhoes.find((t) => t.id === selecionadoId) ?? null;
  const diverge = (t: Talhao) => {
    const f = capimFoto(t.nome);
    return !!(t.capimKml && f && !mesmoCapim(t.capimKml, f));
  };
  const nDiverge = talhoes.filter(diverge).length;

  return (
    <>
      <div className="titulo-linha">
        <h1>Talhões</h1>
      </div>

      {nDiverge > 0 && (
        <p className="aviso">
          {nDiverge} talhão(ões) com capim divergente entre KML e foto — clique no nome para conferir e escolher.
        </p>
      )}

      {mostrarForm && editandoId != null && (
      <form className="cartao grade-form" onSubmit={salvar}>
        <h2>Editar talhão</h2>
        <label>
          Nome / identificação
          <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Talhão 17A - PD" />
        </label>
        <label>
          Fazenda
          <input value={form.fazenda} onChange={(e) => setForm({ ...form, fazenda: e.target.value })} placeholder="Ex.: Pedra" />
        </label>
        <label>
          Área (ha)
          <input inputMode="decimal" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="Ex.: 12,5" />
        </label>
        <label>
          Capim / cultura
          <input list="capins" value={form.capim} onChange={(e) => setForm({ ...form, capim: e.target.value })} placeholder="Ex.: Mombaça" />
          <datalist id="capins">
            {CAPINS_COMUNS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="largo">
          Observações
          <input value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
        </label>
        {erro && <p className="erro largo">{erro}</p>}
        <div className="acoes largo">
          <button type="submit" className="primario">Salvar alterações</button>
          <button type="button" onClick={fecharForm}>Cancelar</button>
        </div>
      </form>
      )}

      <div className="cartao">
        {semArea > 0 && <p className="aviso">{semArea} talhão(ões) sem área informada — a estimativa de produção total depende da área.</p>}
        {!talhoes.length ? (
          <p className="vazio">Nenhum talhão cadastrado. Os talhões vêm do mapa da fazenda (KML).</p>
        ) : (
          <div className="rolagem">
            <table className="tabela-cartoes com-icones">
              <thead>
                <tr>
                  <th>Talhão</th>
                  <th>Fazenda</th>
                  <th className="n">Área (ha)</th>
                  <th>Capim</th>
                  <th className="n">Amostras</th>
                  <th className="n">Colheita</th>
                  <th>Contorno</th>
                  <th>Obs.</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {talhoes.map((t) => {
                  const aberto = t.id === selecionado?.id && mostrarRegistros;
                  return (
                  <Fragment key={t.id}>
                  <tr id={`talhao-${t.id}`} className={t.id === selecionadoId ? 'linha-sel' : ''}>
                    <td className="largo-cel nome-talhao">
                      <button className="link" aria-expanded={aberto} onClick={() => abrirOuFechar(t.id)}><strong>{t.nome}</strong></button>
                      <span className="so-cel mudo"><small>{t.fazenda ? `Faz. ${t.fazenda} · ` : ''}{t.geometria?.length ? 'contorno do KML' : 'sem contorno'}</small></span>
                    </td>
                    <td className="oculta-cel">{t.fazenda || '—'}</td>
                    <td className="n" data-rotulo="Área (ha)">{t.areaHa > 0 ? fmt(t.areaHa, 2) : <span className="selo selo-alto">informar</span>}</td>
                    <td data-rotulo="Capim">{t.capim || '—'}{diverge(t) && <span className="selo selo-alto" style={{ marginLeft: '0.4rem' }}>KML≠foto</span>}</td>
                    <td
                      className="n"
                      data-rotulo="Amostras"
                      title={`${nColetas.get(t.id) ?? 0} de campo + ${nColheita.get(t.id) ?? 0} de colheita (caminhão)`}
                    >
                      {(nColetas.get(t.id) ?? 0) + (nColheita.get(t.id) ?? 0)}
                    </td>
                    <td className="n" data-rotulo="Colheita">
                      {colheita.get(t.id) ? (
                        <span className={colheita.get(t.id)!.finalizada ? 'progresso-mini finalizado' : 'progresso-mini'} title={tituloProgresso(colheita.get(t.id)!)}>
                          <span className="progresso-texto">{textoProgresso(colheita.get(t.id)!)}</span>
                        </span>
                      ) : (
                        <span className="mudo">—</span>
                      )}
                    </td>
                    <td className="oculta-cel">{t.geometria?.length ? <span className="selo selo-ideal">KML</span> : <span className="mudo">—</span>}</td>
                    <td className="obs largo-cel">{t.observacoes}</td>
                    <td className="acoes-linha acoes-icones">
                      {podeEditarTalhoes && (
                        <button className="icone-acao" onClick={() => editar(t)} aria-label={`Editar ${t.nome}`} title="Editar"><Icone nome="editar" /></button>
                      )}
                      {podeExcluir && podeEditarTalhoes && (
                        <button className="icone-acao perigo" onClick={() => excluir(t)} aria-label={`Excluir ${t.nome}`} title="Excluir"><Icone nome="excluir" /></button>
                      )}
                    </td>
                  </tr>
                  {aberto && (
                    <tr className="linha-detalhe">
                      <td colSpan={9}>
                        <DetalheTalhao talhao={t} aoFechar={() => setMostrarRegistros(false)} aoEditar={editar} embutido />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

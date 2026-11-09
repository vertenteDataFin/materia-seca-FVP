import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adicionarTalhao, atualizarTalhao, excluirTalhao, useDados } from '../dados';
import type { Talhao } from '../tipos';
import { CAPINS_COMUNS, fmt, numParaTexto, parseNum } from '../util';
import DetalheTalhao from './DetalheTalhao';
import { capimFoto, mesmoCapim } from '../capinsFoto';

const vazio = { nome: '', fazenda: '', area: '', capim: '', observacoes: '' };

export default function Talhoes() {
  const dados = useDados();
  const [form, setForm] = useState(vazio);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [params] = useSearchParams();
  const inicial = params.get('talhao');
  const [selecionadoId, setSelecionadoId] = useState<string | null>(inicial);
  const [mostrarRegistros, setMostrarRegistros] = useState(inicial != null);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [erro, setErro] = useState('');

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
    // atualizar preserva os demais campos (ex.: contorno importado do KML)
    if (editandoId != null) atualizarTalhao(editandoId, campos);
    else adicionarTalhao(campos);
    fecharForm();
  }

  function editar(t: Talhao) {
    setEditandoId(t.id);
    setForm({ nome: t.nome, fazenda: t.fazenda ?? '', area: numParaTexto(t.areaHa), capim: t.capim, observacoes: t.observacoes ?? '' });
    setMostrarForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function excluir(t: Talhao) {
    const n = dados?.coletas.filter((c) => c.talhaoId === t.id).length ?? 0;
    const aviso = n ? `\n\nIsso também excluirá ${n} coleta(s) e suas amostras.` : '';
    if (confirm(`Excluir o talhão "${t.nome}"?${aviso}`)) excluirTalhao(t.id);
  }

  if (!dados) return null;
  const talhoes = dados.talhoes;
  const semArea = talhoes.filter((t) => !(t.areaHa > 0)).length;
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
        {!mostrarForm && <button onClick={() => setMostrarForm(true)}>+ Novo talhão</button>}
      </div>

      {nDiverge > 0 && (
        <p className="aviso">
          {nDiverge} talhão(ões) com capim divergente entre KML e foto — clique no nome para conferir e escolher.
        </p>
      )}

      {selecionado && mostrarRegistros && (
        <DetalheTalhao talhao={selecionado} aoFechar={() => setMostrarRegistros(false)} aoEditar={editar} />
      )}

      {mostrarForm && (
      <form className="cartao grade-form" onSubmit={salvar}>
        <h2>{editandoId != null ? 'Editar talhão' : 'Novo talhão'}</h2>
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
          <button type="submit" className="primario">{editandoId != null ? 'Salvar alterações' : 'Adicionar talhão'}</button>
          <button type="button" onClick={fecharForm}>Cancelar</button>
        </div>
      </form>
      )}

      <div className="cartao">
        {semArea > 0 && <p className="aviso">{semArea} talhão(ões) sem área informada — a estimativa de produção total depende da área.</p>}
        {!talhoes.length ? (
          <p className="vazio">Nenhum talhão cadastrado.</p>
        ) : (
          <div className="rolagem">
            <table className="tabela-cartoes cartoes-2">
              <thead>
                <tr>
                  <th>Talhão</th>
                  <th>Fazenda</th>
                  <th className="n">Área (ha)</th>
                  <th>Capim</th>
                  <th>Contorno</th>
                  <th>Obs.</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {talhoes.map((t) => (
                  <tr key={t.id} className={t.id === selecionadoId ? 'linha-sel' : ''}>
                    <td className="largo-cel nome-talhao">
                      <button className="link" onClick={() => { setSelecionadoId(t.id); setMostrarRegistros(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><strong>{t.nome}</strong></button>
                      <span className="so-cel mudo"><small>{t.fazenda ? `Faz. ${t.fazenda} · ` : ''}{t.geometria?.length ? 'contorno do KML' : 'sem contorno'}</small></span>
                    </td>
                    <td className="oculta-cel">{t.fazenda || '—'}</td>
                    <td className="n" data-rotulo="Área (ha)">{t.areaHa > 0 ? fmt(t.areaHa, 2) : <span className="selo selo-alto">informar</span>}</td>
                    <td data-rotulo="Capim">{t.capim || '—'}{diverge(t) && <span className="selo selo-alto" style={{ marginLeft: '0.4rem' }}>KML≠foto</span>}</td>
                    <td className="oculta-cel">{t.geometria?.length ? <span className="selo selo-ideal">KML</span> : <span className="mudo">—</span>}</td>
                    <td className="obs largo-cel">{t.observacoes}</td>
                    <td className="acoes-linha">
                      <button onClick={() => editar(t)}>Editar</button>
                      <button className="perigo" onClick={() => excluir(t)}>Excluir</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

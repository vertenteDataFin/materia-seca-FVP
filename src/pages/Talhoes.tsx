import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSearchParams } from 'react-router-dom';
import { db, excluirTalhao, type Talhao } from '../db';
import { CAPINS_COMUNS, fmt, numParaTexto, parseNum } from '../util';
import DetalheTalhao from './DetalheTalhao';
import { capimFoto, mesmoCapim } from '../capinsFoto';

const vazio = { nome: '', fazenda: '', area: '', capim: '', observacoes: '' };

export default function Talhoes() {
  const talhoes = useLiveQuery(() => db.talhoes.orderBy('nome').toArray(), []);
  const [form, setForm] = useState(vazio);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [params] = useSearchParams();
  const inicial = params.get('talhao') ? Number(params.get('talhao')) : null;
  const [selecionadoId, setSelecionadoId] = useState<number | null>(inicial);
  const [mostrarRegistros, setMostrarRegistros] = useState(inicial != null);
  const [erro, setErro] = useState('');

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const areaHa = parseNum(form.area);
    if (!form.nome.trim()) return setErro('Informe o nome do talhão.');
    if (areaHa == null || areaHa <= 0) return setErro('Informe uma área válida (ha).');
    const dados = {
      nome: form.nome.trim(),
      fazenda: form.fazenda.trim(),
      areaHa,
      capim: form.capim.trim(),
      observacoes: form.observacoes.trim(),
    };
    // update preserva os demais campos (ex.: contorno importado do KML)
    if (editandoId != null) await db.talhoes.update(editandoId, dados);
    else await db.talhoes.add(dados);
    setForm(vazio);
    setEditandoId(null);
    setErro('');
  }

  function editar(t: Talhao) {
    setEditandoId(t.id!);
    setForm({ nome: t.nome, fazenda: t.fazenda ?? '', area: numParaTexto(t.areaHa), capim: t.capim, observacoes: t.observacoes ?? '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function excluir(t: Talhao) {
    const n = await db.coletas.where('talhaoId').equals(t.id!).count();
    const aviso = n ? `\n\nIsso também excluirá ${n} coleta(s) e suas amostras.` : '';
    if (confirm(`Excluir o talhão "${t.nome}"?${aviso}`)) await excluirTalhao(t.id!);
  }

  if (!talhoes) return null;
  const semArea = talhoes.filter((t) => !(t.areaHa > 0)).length;
  const selecionado = talhoes.find((t) => t.id === selecionadoId) ?? null;
  const diverge = (t: Talhao) => {
    const f = capimFoto(t.nome);
    return !!(t.capimKml && f && !mesmoCapim(t.capimKml, f));
  };
  const nDiverge = talhoes.filter(diverge).length;

  return (
    <>
      <h1>Talhões</h1>

      {nDiverge > 0 && (
        <p className="aviso">
          {nDiverge} talhão(ões) com capim divergente entre KML e foto — clique no nome para conferir e escolher.
        </p>
      )}

      {selecionado && mostrarRegistros && (
        <DetalheTalhao talhao={selecionado} aoFechar={() => setMostrarRegistros(false)} aoEditar={editar} />
      )}

      <form className="cartao grade-form" onSubmit={salvar}>
        <h2>{editandoId != null ? 'Editar talhão' : 'Novo talhão'}</h2>
        <label>
          Nome / identificação
          <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: PD - TALHAO 17 A" />
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
          {editandoId != null && (
            <button type="button" onClick={() => { setEditandoId(null); setForm(vazio); setErro(''); }}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="cartao">
        {semArea > 0 && <p className="aviso">{semArea} talhão(ões) sem área informada — a estimativa de produção total depende da área.</p>}
        {!talhoes.length ? (
          <p className="vazio">Nenhum talhão cadastrado.</p>
        ) : (
          <div className="rolagem">
            <table>
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
                    <td><button className="link" onClick={() => { setSelecionadoId(t.id!); setMostrarRegistros(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><strong>{t.nome}</strong></button></td>
                    <td>{t.fazenda || '—'}</td>
                    <td className="n">{t.areaHa > 0 ? fmt(t.areaHa, 2) : <span className="selo selo-alto">informar</span>}</td>
                    <td>{t.capim || '—'}{diverge(t) && <span className="selo selo-alto" style={{ marginLeft: '0.4rem' }}>KML≠foto</span>}</td>
                    <td>{t.geometria?.length ? <span className="selo selo-ideal">KML</span> : <span className="mudo">—</span>}</td>
                    <td className="obs">{t.observacoes}</td>
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

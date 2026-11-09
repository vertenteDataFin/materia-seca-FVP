import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { listarTalhoes } from '../db';
import { CHAVE_QUADRO, CHAVE_RESP, criarColeta, lembrarUltimos } from '../coletas';
import { fmt, hoje, parseNum } from '../util';

/** Registro de uma nova coleta pela lista (sem mapa). Depois segue para a etapa de pontos. */
export default function NovaColeta() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const talhoes = useLiveQuery(() => listarTalhoes(), []);
  const [form, setForm] = useState({
    talhaoId: params.get('talhao') ?? '',
    data: hoje(),
    responsavel: localStorage.getItem(CHAVE_RESP) ?? '',
    area: localStorage.getItem(CHAVE_QUADRO) ?? '1',
  });
  const [erro, setErro] = useState('');

  async function criar(e: FormEvent) {
    e.preventDefault();
    const areaAmostralM2 = parseNum(form.area);
    if (!form.talhaoId) return setErro('Selecione o talhão.');
    if (!form.data) return setErro('Informe a data.');
    if (areaAmostralM2 == null || areaAmostralM2 <= 0) return setErro('Informe a área do quadro amostral (m²).');
    lembrarUltimos(form.responsavel, areaAmostralM2);
    const id = await criarColeta(Number(form.talhaoId), { data: form.data, responsavel: form.responsavel.trim(), areaAmostralM2 });
    navigate(`/coletas/${id}/pontos`, { replace: true });
  }

  if (!talhoes) return null;
  const talhao = talhoes.find((t) => String(t.id) === form.talhaoId);

  if (!talhoes.length) {
    return (
      <div className="cartao">
        <p className="vazio">Cadastre um talhão antes de registrar coletas. <Link to="/talhoes">Ir para Talhões →</Link></p>
      </div>
    );
  }

  return (
    <>
      <div className="titulo-linha">
        <h1>Nova coleta{talhao ? ` — ${talhao.nome}` : ''}</h1>
        <Link to="/mapa">← Mapa</Link>
      </div>

      {talhao && (
        <div className="cartao resumo-talhao">
          <div><span className="mudo">Talhão</span><br /><strong>{talhao.nome}</strong></div>
          <div><span className="mudo">Capim</span><br /><strong>{talhao.capim || '—'}</strong></div>
          <div><span className="mudo">Área</span><br /><strong>{talhao.areaHa > 0 ? `${fmt(talhao.areaHa, 1)} ha` : '—'}</strong></div>
          {talhao.fazenda && <div><span className="mudo">Fazenda</span><br /><strong>{talhao.fazenda}</strong></div>}
        </div>
      )}

      <form className="cartao grade-form" onSubmit={criar}>
        <label>
          Talhão
          <select value={form.talhaoId} onChange={(e) => { setForm({ ...form, talhaoId: e.target.value }); setErro(''); }}>
            <option value="">Selecione…</option>
            {talhoes.map((t) => (
              <option key={t.id} value={t.id}>{t.nome}{t.capim ? ` — ${t.capim}` : ''}</option>
            ))}
          </select>
          {!talhao && <small className="mudo">Ou escolha pelo <Link to="/mapa">mapa</Link>.</small>}
        </label>
        <label>
          Data
          <input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
        </label>
        <label>
          Responsável
          <input value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} />
        </label>
        <label>
          Área do quadro amostral (m²)
          <input inputMode="decimal" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />
        </label>
        {erro && <p className="erro largo">{erro}</p>}
        <div className="acoes largo">
          <button type="submit" className="primario">Iniciar coleta → marcar pontos</button>
          <Link className="botao" to="/mapa">Cancelar</Link>
        </div>
      </form>
    </>
  );
}

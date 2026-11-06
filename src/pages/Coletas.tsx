import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Amostra } from '../db';
import { resumoColeta } from '../calc';
import { fmt, fmtData, hoje, parseNum } from '../util';
import MapaTalhoes from '../MapaTalhoes';

export default function Coletas() {
  const navigate = useNavigate();
  const dados = useLiveQuery(async () => {
    const [talhoes, coletas, amostras] = await Promise.all([
      db.talhoes.orderBy('nome').toArray(),
      db.coletas.toArray(),
      db.amostras.toArray(),
    ]);
    return { talhoes, coletas, amostras };
  }, []);

  const [filtro, setFiltro] = useState('');
  const [params] = useSearchParams();
  const [form, setForm] = useState({ talhaoId: params.get('talhao') ?? '', data: hoje(), responsavel: '', area: '1', pontos: '0' });
  const [erro, setErro] = useState('');

  const linhas = useMemo(() => {
    if (!dados) return [];
    const porColeta = new Map<number, Amostra[]>();
    for (const a of dados.amostras) {
      const l = porColeta.get(a.coletaId) ?? [];
      l.push(a);
      porColeta.set(a.coletaId, l);
    }
    const nomes = new Map(dados.talhoes.map((t) => [t.id!, t.nome]));
    return dados.coletas
      .filter((c) => !filtro || c.talhaoId === Number(filtro))
      .sort((a, b) => b.data.localeCompare(a.data) || b.id! - a.id!)
      .map((c) => ({ c, talhao: nomes.get(c.talhaoId) ?? '?', r: resumoColeta(c, porColeta.get(c.id!) ?? []) }));
  }, [dados, filtro]);

  async function criar(e: FormEvent) {
    e.preventDefault();
    const areaAmostralM2 = parseNum(form.area);
    const nPontos = Math.max(0, Math.min(100, Math.round(parseNum(form.pontos) ?? 0)));
    if (!form.talhaoId) return setErro('Selecione o talhão.');
    if (!form.data) return setErro('Informe a data.');
    if (areaAmostralM2 == null || areaAmostralM2 <= 0) return setErro('Informe a área do quadro amostral (m²).');
    const id = await db.transaction('rw', db.coletas, db.amostras, async () => {
      const id = await db.coletas.add({
        talhaoId: Number(form.talhaoId),
        data: form.data,
        responsavel: form.responsavel.trim(),
        areaAmostralM2,
        observacoes: '',
      });
      await db.amostras.bulkAdd(
        Array.from({ length: nPontos }, (_, i) => ({ coletaId: id, ponto: i + 1, pesoVerdeKg: null, pesoUmidoG: null, pesoSecoG: null })),
      );
      return id;
    });
    navigate(`/coletas/${id}`);
  }

  if (!dados) return null;
  const talhaoEscolhido = dados.talhoes.find((t) => String(t.id) === form.talhaoId);

  return (
    <>
      <h1>Coletas</h1>
      {dados.talhoes.length === 0 ? (
        <div className="cartao">
          <p className="vazio">
            Cadastre um talhão antes de registrar coletas. <Link to="/talhoes">Ir para Talhões →</Link>
          </p>
        </div>
      ) : (
        <form className="cartao grade-form" onSubmit={criar} ref={(el) => { if (el && params.get('talhao')) el.scrollIntoView({ block: 'start' }); }}>
          <h2>Nova coleta{talhaoEscolhido ? ` — ${talhaoEscolhido.nome}` : ''}</h2>
          {dados.talhoes.some((t) => t.geometria?.length) && (
            <div className="largo">
              <p className="dica">Toque no talhão do mapa que será amostrado (ou escolha na lista abaixo).</p>
              <MapaTalhoes
                talhoes={dados.talhoes}
                selecionadoId={form.talhaoId ? Number(form.talhaoId) : null}
                aoSelecionar={(t) => { setForm({ ...form, talhaoId: String(t.id) }); setErro(''); }}
              />
            </div>
          )}
          <label>
            Talhão
            <select value={form.talhaoId} onChange={(e) => setForm({ ...form, talhaoId: e.target.value })}>
              <option value="">Selecione…</option>
              {dados.talhoes.map((t) => (
                <option key={t.id} value={t.id}>{t.nome}{t.capim ? ` — ${t.capim}` : ''}</option>
              ))}
            </select>
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
          <label>
            Pontos pré-criados (opcional)
            <input inputMode="numeric" value={form.pontos} onChange={(e) => setForm({ ...form, pontos: e.target.value })} />
            <small className="mudo">Deixe 0 para criar cada ponto em campo com o GPS ("Novo ponto aqui").</small>
          </label>
          {erro && <p className="erro largo">{erro}</p>}
          <div className="acoes largo">
            <button type="submit" className="primario">Iniciar coleta</button>
          </div>
        </form>
      )}

      <div className="cartao">
        <div className="cabecalho-cartao">
          <h2>Histórico</h2>
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar por talhão">
            <option value="">Todos os talhões</option>
            {dados.talhoes.map((t) => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
        </div>
        {!linhas.length ? (
          <p className="vazio">Nenhuma coleta registrada.</p>
        ) : (
          <div className="rolagem">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Talhão</th>
                  <th>Responsável</th>
                  <th className="n">Pontos</th>
                  <th className="n">t MV/ha</th>
                  <th className="n">MS %</th>
                  <th className="n">t MS/ha</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {linhas.map(({ c, talhao, r }) => (
                  <tr key={c.id}>
                    <td>{fmtData(c.data)}</td>
                    <td><strong>{talhao}</strong></td>
                    <td>{c.responsavel || '—'}</td>
                    <td className="n">{r.nPontos}</td>
                    <td className="n">{fmt(r.tMVha)}</td>
                    <td className="n">{fmt(r.msPct)}</td>
                    <td className="n">{fmt(r.tMSha)}</td>
                    <td className="acoes-linha"><Link className="botao" to={`/coletas/${c.id}`}>Abrir</Link></td>
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

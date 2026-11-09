import { useRef, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { dadosAtuais, restaurarBackup, type Backup } from '../dados';
import { PARAMETROS_PADRAO, producaoPonto, teorMS, teorUmidade, type Parametros } from '../calc';
import { baixarArquivo, hoje, lerParametros, numParaTexto, parseNum, salvarParametros } from '../util';
import { exportarExcel } from '../exportarExcel';
import { COLETAS_INICIAIS, importarColetasIniciais } from '../coletasIniciais';
import { FIREBASE_ATIVO } from '../firebase';
import { sair } from '../sessao';
import { adicionarMembro, papelDe, removerMembro, ROTULO_PAPEL, useMembros, type Papel } from '../membros';
import { usePermissoes } from '../permissoes';

const CAMPOS: { chave: keyof Parametros; rotulo: string; ajuda: string }[] = [
  { chave: 'perdasPct', rotulo: 'Perdas estimadas (%)', ajuda: 'Colheita, fermentação e descarte. Típico: 10–20%.' },
  { chave: 'densidadeKgM3', rotulo: 'Densidade da silagem (kg MV/m³)', ajuda: 'Compactação esperada no silo. Típico: 550–700.' },
  { chave: 'msMin', rotulo: 'MS mínima ideal (%)', ajuda: 'Abaixo disso há risco de efluente e fermentação indesejada.' },
  { chave: 'msMax', rotulo: 'MS máxima ideal (%)', ajuda: 'Acima disso a compactação fica difícil.' },
];

export default function Config({ usuario }: { usuario?: User }) {
  const [texto, setTexto] = useState(() => {
    const p = lerParametros();
    return Object.fromEntries(CAMPOS.map((c) => [c.chave, numParaTexto(p[c.chave])])) as Record<keyof Parametros, string>;
  });
  const [mensagem, setMensagem] = useState('');
  const [exportando, setExportando] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);
  const { podeEditarTalhoes } = usePermissoes();

  function carregarColetasIniciais() {
    const r = importarColetasIniciais();
    const partes = [`${r.criadas} coleta(s) criada(s)`, `${r.existentes} já existia(m)`];
    if (r.semTalhao.length) partes.push(`talhão não encontrado: ${r.semTalhao.join(', ')}`);
    setMensagem(`Coletas da ficha de campo: ${partes.join(' · ')}.`);
  }

  async function exportarXlsx() {
    setExportando(true);
    setMensagem('');
    try {
      await exportarExcel();
    } catch (e) {
      setMensagem(`Falha ao gerar o Excel: ${(e as Error).message}`);
    } finally {
      setExportando(false);
    }
  }

  function salvar() {
    const p = { ...PARAMETROS_PADRAO };
    for (const c of CAMPOS) {
      const v = parseNum(texto[c.chave]);
      if (v == null || v < 0) return setMensagem(`Valor inválido em "${c.rotulo}".`);
      p[c.chave] = v;
    }
    if (p.perdasPct >= 100) return setMensagem('Perdas devem ser menores que 100%.');
    if (p.msMin > p.msMax) return setMensagem('MS mínima deve ser menor que a máxima.');
    salvarParametros(p);
    setMensagem('Parâmetros salvos.');
  }

  function exportarJSON() {
    const { talhoes, coletas, amostras } = dadosAtuais();
    const backup: Backup = { app: 'silagem-ms', versao: 2, exportadoEm: new Date().toISOString(), parametros: lerParametros(), talhoes, coletas, amostras };
    baixarArquivo(`silagem-ms-backup-${hoje()}.json`, JSON.stringify(backup, null, 2), 'application/json');
  }

  function exportarCSV() {
    const { talhoes, coletas, amostras } = dadosAtuais();
    const t = new Map(talhoes.map((x) => [x.id, x]));
    const c = new Map(coletas.map((x) => [x.id, x]));
    const n = (v: number | null | undefined) => (v == null ? '' : String(Math.round(v * 1000) / 1000).replace('.', ','));
    const s = (v: string | undefined) => `"${(v ?? '').replace(/"/g, '""')}"`;
    const linhas = [
      ['Talhão', 'Fazenda', 'Capim', 'Área talhão (ha)', 'Data', 'Responsável', 'Área quadro (m²)', 'Ponto', 'Peso verde (kg)', 'MV (kg/m²)', 'Peso úmido (g)', 'Peso seco (g)', 'MS (%)', 'Umidade (%)', 'Latitude', 'Longitude', 'Precisão GPS (m)', 'Capturado em'].join(';'),
    ];
    for (const a of amostras) {
      const col = c.get(a.coletaId);
      const tal = col && t.get(col.talhaoId);
      if (!col || !tal) continue;
      linhas.push(
        [s(tal.nome), s(tal.fazenda), s(tal.capim), n(tal.areaHa), col.data, s(col.responsavel), n(col.areaAmostralM2), a.ponto, n(a.pesoVerdeKg),
          n(producaoPonto(a, col.areaAmostralM2)), n(a.pesoUmidoG), n(a.pesoSecoG), n(teorMS(a)), n(teorUmidade(a)),
          a.lat != null ? String(a.lat.toFixed(6)).replace('.', ',') : '', a.lng != null ? String(a.lng.toFixed(6)).replace('.', ',') : '',
          n(a.precisaoM), a.capturadoEm ?? ''].join(';'),
      );
    }
    baixarArquivo(`silagem-ms-amostras-${hoje()}.csv`, '﻿' + linhas.join('\r\n'), 'text/csv;charset=utf-8');
  }

  async function importar(f: File) {
    try {
      const b = JSON.parse(await f.text()) as Backup;
      if (b.app !== 'silagem-ms' || !Array.isArray(b.talhoes) || !Array.isArray(b.coletas) || !Array.isArray(b.amostras)) {
        throw new Error('Arquivo não é um backup do Silagem MS.');
      }
      const onde = FIREBASE_ATIVO ? 'EM TODOS OS APARELHOS' : 'NESTE APARELHO';
      if (!confirm(`Restaurar ${b.talhoes.length} talhão(ões), ${b.coletas.length} coleta(s) e ${b.amostras.length} amostra(s)?\n\nOS DADOS ATUAIS SERÃO SUBSTITUÍDOS ${onde}.`)) return;
      restaurarBackup(b);
      if (b.parametros) salvarParametros({ ...PARAMETROS_PADRAO, ...(b.parametros as Partial<Parametros>) });
      setMensagem('Backup restaurado com sucesso.');
    } catch (e) {
      setMensagem(`Falha ao importar: ${(e as Error).message}`);
    } finally {
      if (arquivo.current) arquivo.current.value = '';
    }
  }

  return (
    <>
      <h1>Configurações</h1>

      {FIREBASE_ATIVO && usuario && <Conta usuario={usuario} />}

      <div className="cartao grade-form">
        <h2>Parâmetros da estimativa</h2>
        {CAMPOS.map((c) => (
          <label key={c.chave}>
            {c.rotulo}
            <input inputMode="decimal" value={texto[c.chave]} onChange={(e) => setTexto({ ...texto, [c.chave]: e.target.value })} />
            <small className="mudo">{c.ajuda}</small>
          </label>
        ))}
        <div className="acoes largo">
          <button className="primario" onClick={salvar}>Salvar parâmetros</button>
        </div>
      </div>

      <div className="cartao">
        <h2>Dados e backup</h2>
        <p className="dica">
          {FIREBASE_ATIVO
            ? 'Os dados ficam na nuvem (Firebase) e sincronizam entre os aparelhos logados; sem sinal, o app segue funcionando e envia quando a conexão volta. '
            : 'Os dados ficam salvos neste navegador/dispositivo. Faça backups regulares e use-os para transferir dados entre aparelhos. '}
          O Excel traz as planilhas Talhões, Coletas (com os resultados calculados), Amostras e Parâmetros.
        </p>
        <div className="acoes">
          <button className="primario" onClick={exportarXlsx} disabled={exportando}>{exportando ? 'Gerando…' : 'Exportar Excel (.xlsx)'}</button>
          <button onClick={exportarCSV}>Exportar amostras (CSV)</button>
          <button onClick={exportarJSON}>Exportar backup (JSON)</button>
          {podeEditarTalhoes && <button onClick={() => arquivo.current?.click()}>Restaurar backup…</button>}
          <input ref={arquivo} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importar(e.target.files[0])} />
        </div>
      </div>
      <div className="cartao">
        <h2>Coletas da ficha de campo</h2>
        <p className="dica">
          As coletas já feitas ({COLETAS_INICIAIS.map((c) => `${c.talhao} em ${c.data.split('-').reverse().join('/')}`).join(', ')}) entram
          automaticamente na primeira abertura do app, sem posição GPS. Use o botão se precisar recarregá-las — as que já estão lançadas não são duplicadas.
        </p>
        <div className="acoes">
          <button onClick={carregarColetasIniciais}>Carregar coletas da ficha</button>
        </div>
      </div>
      {mensagem && <p className="aviso">{mensagem}</p>}

      <div className="cartao">
        <h2>Como os cálculos são feitos</h2>
        <ul className="formulas">
          <li><strong>MV (kg/m²)</strong> = peso verde do ponto ÷ área do quadro</li>
          <li><strong>t MV/ha</strong> = média dos pontos (kg/m²) × 10</li>
          <li><strong>MS (%)</strong> = peso seco ÷ peso úmido × 100 (média das subamostras) · <strong>Umidade</strong> = 100 − MS</li>
          <li><strong>t MS/ha</strong> = t MV/ha × MS ÷ 100</li>
          <li><strong>Produção do talhão</strong> = t/ha × área do talhão (ha)</li>
          <li><strong>Silagem (t)</strong> = MV total × (1 − perdas) · <strong>Volume (m³)</strong> = silagem × 1000 ÷ densidade</li>
          <li><strong>CV (%)</strong> = desvio padrão ÷ média dos pontos × 100</li>
        </ul>
      </div>
    </>
  );
}

/** Conta logada e, para administradores, a lista de pessoas com acesso. */
function Conta({ usuario }: { usuario: User }) {
  const membros = useMembros();
  const meuPapel = papelDe(usuario.email, membros);
  const admin = meuPapel === 'admin';
  const [email, setEmail] = useState('');
  const [nome, setNome] = useState('');
  const [papel, setPapel] = useState<Papel>('operador');
  const [msg, setMsg] = useState('');

  async function incluir(e: FormEvent) {
    e.preventDefault();
    setMsg('');
    try {
      await adicionarMembro(email, nome, papel, usuario.email ?? '');
      setEmail('');
      setNome('');
      setMsg(`${email.trim().toLowerCase()} incluído(a).`);
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  return (
    <div className="cartao">
      <div className="cabecalho-cartao">
        <h2>Conta</h2>
        <button onClick={() => void sair()}>Sair</button>
      </div>
      <p>
        Logado como <strong>{usuario.email}</strong>
        <span className={`selo ${admin ? 'selo-ideal' : ''}`} style={{ marginLeft: '0.5rem' }}>{ROTULO_PAPEL[meuPapel].split(' (')[0].toLowerCase()}</span>
      </p>
      {meuPapel === 'operador' && <p className="dica">Perfil de operador: consulta e registra coletas, mas não exclui registros nem altera o cadastro de talhões.</p>}

      {admin && (
        <>
          <h3>Pessoas com acesso</h3>
          {membros === undefined ? null : membros === null ? (
            <p className="mudo">Sem permissão para ver a lista.</p>
          ) : (
            <ul className="lista-pontos">
              {membros.map((m) => (
                <li key={m.email}>
                  <strong>{m.email}</strong>
                  <span className="mudo">{m.nome} · {ROTULO_PAPEL[m.papel]?.split(' (')[0].toLowerCase() ?? m.papel}</span>
                  <span className="espaco" />
                  {m.email !== usuario.email?.toLowerCase() && (
                    <button className="perigo mini" aria-label={`Remover ${m.email}`} onClick={() => confirm(`Remover o acesso de ${m.email}?`) && removerMembro(m.email).catch((e) => setMsg(e.message))}>✕</button>
                  )}
                </li>
              ))}
              {!membros.length && <li className="mudo">Só os administradores fixos têm acesso por enquanto.</li>}
            </ul>
          )}
          <form className="grade-form" onSubmit={incluir}>
            <label>
              E-mail (o mesmo cadastrado em Authentication → Usuários)
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@fazendavertente.com.br" />
            </label>
            <label>
              Nome
              <input value={nome} onChange={(e) => setNome(e.target.value)} />
            </label>
            <label>
              Papel
              <select value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
                {(Object.keys(ROTULO_PAPEL) as Papel[]).map((p) => (
                  <option key={p} value={p}>{ROTULO_PAPEL[p]}</option>
                ))}
              </select>
            </label>
            <div className="acoes largo">
              <button type="submit" className="primario" disabled={!email.trim()}>Incluir pessoa</button>
            </div>
          </form>
        </>
      )}
      {msg && <p className="aviso">{msg}</p>}
    </div>
  );
}

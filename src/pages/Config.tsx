import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import { dadosAtuais, restaurarBackup, type Backup } from '../dados';
import { PARAMETROS_PADRAO, producaoPonto, teorMS, teorUmidade, type Parametros } from '../calc';
import { baixarArquivo, hoje, numParaTexto, parseNum } from '../util';
import { salvarParametrosNuvem, useParametros } from '../parametros';
import { exportarExcel } from '../exportarExcel';
import { rotuloOrigem } from '../geo';
import { COLETAS_INICIAIS, importarColetasIniciais } from '../coletasIniciais';
import { FIREBASE_ATIVO } from '../firebase';
import { sair } from '../sessao';
import { adicionarMembro, alterarPapel, papelDe, removerMembro, ROTULO_PAPEL, useMembros, type Papel } from '../membros';
import { gerarRelatorioPdf } from '../relatorioPdf';
import { usePermissoes } from '../permissoes';
import { Icone } from '../Icone';
import { liberarSolicitacao, recusarSolicitacao, useSolicitacoes } from '../solicitacoes';
import Historico from '../HistoricoCard';

const CAMPOS: { chave: keyof Parametros; rotulo: string; ajuda: string }[] = [
  { chave: 'perdasPct', rotulo: 'Perdas estimadas (%)', ajuda: 'Colheita, fermentação e descarte. Típico: 10–20%.' },
  { chave: 'densidadeKgM3', rotulo: 'Densidade da silagem (kg MV/m³)', ajuda: 'Compactação esperada no silo. Típico: 550–700.' },
  { chave: 'msMin', rotulo: 'MS mínima ideal (%)', ajuda: 'Abaixo disso há risco de efluente e fermentação indesejada.' },
  { chave: 'msMax', rotulo: 'MS máxima ideal (%)', ajuda: 'Acima disso a compactação fica difícil.' },
];

const textoDe = (p: Parametros) => Object.fromEntries(CAMPOS.map((c) => [c.chave, numParaTexto(p[c.chave])])) as Record<keyof Parametros, string>;

export default function Config({ usuario }: { usuario?: User }) {
  const parametros = useParametros();
  const [texto, setTexto] = useState(() => textoDe(parametros));
  const [mensagem, setMensagem] = useState('');
  const [exportando, setExportando] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);
  const { podeEditarTalhoes, admin } = usePermissoes();

  // Parâmetros mudados em outro aparelho (ou chegando da nuvem) atualizam o formulário.
  useEffect(() => setTexto(textoDe(parametros)), [parametros]);

  function carregarColetasIniciais() {
    const r = importarColetasIniciais();
    const partes = [`${r.criadas} coleta(s) criada(s)`, `${r.existentes} já existia(m)`];
    if (r.completadas) partes.push(`${r.completadas} amostra(s) receberam a MS da ficha`);
    if (r.repostas) partes.push(`${r.repostas} amostra(s) excluída(s) foram repostas`);
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

  async function gerarPdf() {
    setExportando(true);
    setMensagem('');
    try {
      await gerarRelatorioPdf();
    } catch (e) {
      setMensagem(`Falha ao gerar o relatório: ${(e as Error).message}`);
    } finally {
      setExportando(false);
    }
  }

  async function salvar() {
    const p = { ...PARAMETROS_PADRAO };
    for (const c of CAMPOS) {
      const v = parseNum(texto[c.chave]);
      if (v == null || v < 0) return setMensagem(`Valor inválido em "${c.rotulo}".`);
      p[c.chave] = v;
    }
    if (p.perdasPct >= 100) return setMensagem('Perdas devem ser menores que 100%.');
    if (p.msMin > p.msMax) return setMensagem('MS mínima deve ser menor que a máxima.');
    try {
      await salvarParametrosNuvem(p, usuario?.email ?? '');
      setMensagem(FIREBASE_ATIVO ? 'Parâmetros salvos para todos os aparelhos.' : 'Parâmetros salvos.');
    } catch (e) {
      setMensagem(`Falha ao salvar na nuvem: ${(e as Error).message}`);
    }
  }

  function exportarJSON() {
    const { talhoes, coletas, amostras } = dadosAtuais();
    const backup: Backup = { app: 'silagem-ms', versao: 2, exportadoEm: new Date().toISOString(), parametros, talhoes, coletas, amostras };
    baixarArquivo(`silagem-ms-backup-${hoje()}.json`, JSON.stringify(backup, null, 2), 'application/json');
  }

  function exportarCSV() {
    const { talhoes, coletas, amostras } = dadosAtuais();
    const t = new Map(talhoes.map((x) => [x.id, x]));
    const c = new Map(coletas.map((x) => [x.id, x]));
    const n = (v: number | null | undefined) => (v == null ? '' : String(Math.round(v * 1000) / 1000).replace('.', ','));
    const s = (v: string | undefined) => `"${(v ?? '').replace(/"/g, '""')}"`;
    const linhas = [
      ['Talhão', 'Fazenda', 'Capim', 'Área talhão (ha)', 'Data', 'Responsável', 'Área quadro (m²)', 'Ponto', 'Peso verde (kg)', 'MV (kg/m²)', 'Peso úmido (g)', 'Peso seco (g)', 'MS (%)', 'Umidade (%)', 'Latitude', 'Longitude', 'Precisão GPS (m)', 'Origem da posição', 'Capturado em'].join(';'),
    ];
    for (const a of amostras) {
      const col = c.get(a.coletaId);
      const tal = col && t.get(col.talhaoId);
      if (!col || !tal) continue;
      linhas.push(
        [s(tal.nome), s(tal.fazenda), s(tal.capim), n(tal.areaHa), col.data, s(col.responsavel), n(col.areaAmostralM2), a.ponto, n(a.pesoVerdeKg),
          n(producaoPonto(a, col.areaAmostralM2)), n(a.pesoUmidoG), n(a.pesoSecoG), n(teorMS(a)), n(teorUmidade(a)),
          a.lat != null ? String(a.lat.toFixed(6)).replace('.', ',') : '', a.lng != null ? String(a.lng.toFixed(6)).replace('.', ',') : '',
          n(a.precisaoM), rotuloOrigem(a), a.capturadoEm ?? ''].join(';'),
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
      if (b.parametros && admin) await salvarParametrosNuvem({ ...PARAMETROS_PADRAO, ...(b.parametros as Partial<Parametros>) }, usuario?.email ?? '');
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
      {FIREBASE_ATIVO && usuario && <Historico meuEmail={usuario.email ?? ''} />}

      <div className="cartao grade-form">
        <h2>Parâmetros da estimativa</h2>
        <p className="dica largo">
          {FIREBASE_ATIVO
            ? admin
              ? 'Valem para todos os aparelhos e pessoas: ao salvar, o Painel, o mapa e os relatórios de todo mundo passam a usar os novos valores.'
              : 'Definidos pelos administradores e iguais para todo mundo. Só administradores alteram.'
            : 'Valem só neste aparelho.'}
        </p>
        {CAMPOS.map((c) => (
          <label key={c.chave}>
            {c.rotulo}
            <input inputMode="decimal" value={texto[c.chave]} onChange={(e) => setTexto({ ...texto, [c.chave]: e.target.value })} disabled={FIREBASE_ATIVO && !admin} />
            <small className="mudo">{c.ajuda}</small>
          </label>
        ))}
        {(admin || !FIREBASE_ATIVO) && (
          <div className="acoes largo">
            <button className="primario" onClick={salvar}>Salvar parâmetros</button>
          </div>
        )}
      </div>

      <div className="cartao">
        <h2>Dados e backup</h2>
        <p className="dica">
          {FIREBASE_ATIVO
            ? 'Os dados ficam na nuvem (Firebase) e sincronizam entre os aparelhos logados; sem sinal, o app segue funcionando e envia quando a conexão volta. '
            : 'Os dados ficam salvos neste navegador/dispositivo. Faça backups regulares e use-os para transferir dados entre aparelhos. '}
          O relatório em PDF segue o modelo do relatório de coletas (premissas, resultados por amostra e por talhão e leitura dos resultados).
          O Excel traz as planilhas Talhões, Coletas (com os resultados calculados), Amostras e Parâmetros.
        </p>
        <div className="acoes">
          <button className="primario" onClick={gerarPdf} disabled={exportando}>{exportando ? 'Gerando…' : 'Gerar relatório (PDF)'}</button>
          <button onClick={exportarXlsx} disabled={exportando}>Exportar Excel (.xlsx)</button>
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

/** Contas criadas na tela de login que aguardam liberação (só administradores veem). */
function PedidosDeAcesso({ porQuem, aoMensagem }: { porQuem: string; aoMensagem: (m: string) => void }) {
  const pedidos = useSolicitacoes(true);
  const [papeis, setPapeis] = useState<Record<string, Papel>>({});
  if (pedidos === null) {
    return (
      <p className="erro">
        Não foi possível ler os pedidos de acesso: o banco recusou a leitura. As regras do Firestore publicadas estão desatualizadas —
        publique o arquivo <code>firestore.rules</code> do app (console do Firebase → Firestore → Regras, ou <code>npm run regras</code>).
        Enquanto isso, inclua as pessoas pelo formulário abaixo.
      </p>
    );
  }
  if (!pedidos || !pedidos.length) return null;
  const papelDe = (email: string) => papeis[email] ?? 'operador';
  return (
    <>
      <h3>
        Pedidos de acesso <span className="selo selo-alto">{pedidos.length}</span>
      </h3>
      <ul className="lista-pontos">
        {pedidos.map((s) => (
          <li key={s.email} className="pedido">
            <div>
              <strong>{s.nome || s.email}</strong>
              <div className="mudo"><small>{s.email} · pediu em {new Date(s.em).toLocaleDateString('pt-BR')}</small></div>
            </div>
            <span className="espaco" />
            <select value={papelDe(s.email)} onChange={(e) => setPapeis({ ...papeis, [s.email]: e.target.value as Papel })} aria-label={`Papel de ${s.email}`}>
              {(Object.keys(ROTULO_PAPEL) as Papel[]).map((p) => (
                <option key={p} value={p}>{ROTULO_PAPEL[p].split(' (')[0]}</option>
              ))}
            </select>
            <button
              className="primario"
              onClick={() =>
                liberarSolicitacao(s, papelDe(s.email), porQuem)
                  .then(() => aoMensagem(`${s.email} liberado(a) como ${ROTULO_PAPEL[papelDe(s.email)].split(' (')[0].toLowerCase()}.`))
                  .catch((e) => aoMensagem(e.message))
              }
            >
              Liberar
            </button>
            <button className="perigo mini" aria-label={`Recusar ${s.email}`} title="Recusar" onClick={() => confirm(`Recusar o pedido de ${s.email}?`) && recusarSolicitacao(s.email).catch((e) => aoMensagem(e.message))}><Icone nome="fechar" /></button>
          </li>
        ))}
      </ul>
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

      {admin && <PedidosDeAcesso porQuem={usuario.email ?? ''} aoMensagem={setMsg} />}

      {admin && (
        <>
          <h3>Pessoas com acesso</h3>
          {membros === undefined ? null : membros === null ? (
            <p className="mudo">Sem permissão para ver a lista.</p>
          ) : (
            <ul className="lista-pontos">
              {membros.map((m) => {
                const euMesmo = m.email === usuario.email?.toLowerCase();
                return (
                  <li key={m.email}>
                    <strong>{m.email}</strong>
                    <span className="mudo">{m.nome}</span>
                    <span className="espaco" />
                    {euMesmo ? (
                      <span className="mudo">{ROTULO_PAPEL[m.papel]?.split(' (')[0].toLowerCase() ?? m.papel} (você)</span>
                    ) : (
                      <select
                        value={m.papel}
                        aria-label={`Papel de ${m.email}`}
                        title={ROTULO_PAPEL[m.papel]}
                        onChange={(e) => {
                          const papel = e.target.value as Papel;
                          if (!confirm(`Mudar ${m.email} para ${ROTULO_PAPEL[papel]}?`)) return;
                          alterarPapel(m.email, papel)
                            .then(() => setMsg(`${m.email} agora é ${ROTULO_PAPEL[papel].split(' (')[0].toLowerCase()}.`))
                            .catch((err) => setMsg(err.message));
                        }}
                      >
                        {(Object.keys(ROTULO_PAPEL) as Papel[]).map((p) => (
                          <option key={p} value={p}>{ROTULO_PAPEL[p].split(' (')[0]}</option>
                        ))}
                      </select>
                    )}
                    {!euMesmo && (
                      <button className="perigo mini" aria-label={`Remover ${m.email}`} title="Remover acesso" onClick={() => confirm(`Remover o acesso de ${m.email}?`) && removerMembro(m.email).catch((e) => setMsg(e.message))}><Icone nome="excluir" /></button>
                    )}
                  </li>
                );
              })}
              {!membros.length && <li className="mudo">Só os administradores fixos têm acesso por enquanto.</li>}
            </ul>
          )}
          <p className="dica">
            Para mudar o papel de alguém, escolha na lista ao lado do nome (ninguém muda o próprio papel). O caminho normal é a pessoa criar a
            conta na tela de login e você liberar o pedido acima. O formulário abaixo serve para liberar um e-mail antes mesmo de a conta existir.
          </p>
          <form className="grade-form" onSubmit={incluir}>
            <label>
              E-mail
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

/**
 * Partes pesadas do app (Excel, PDF) são baixadas só quando usadas. Se o app foi atualizado enquanto
 * a página estava aberta, o arquivo da versão antiga some do site e o download falha
 * ("Failed to fetch dynamically imported module"). Nesse caso a página recarrega na versão nova.
 */

const CHAVE = 'silagem-ms:recarregou-versao';

/** Erro de módulo da versão antiga que não existe mais no site. */
export function ehFalhaDeVersao(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|Unable to preload CSS/i.test(msg);
}

/** Recarrega a página (no máximo uma vez a cada minuto, para não entrar em laço). Devolve false se não recarregou. */
export function recarregarVersaoNova(): boolean {
  if (typeof window === 'undefined' || !navigator.onLine) return false;
  try {
    const ultima = Number(sessionStorage.getItem(CHAVE) ?? 0);
    if (Date.now() - ultima < 60_000) return false;
    sessionStorage.setItem(CHAVE, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/** Baixa um módulo sob demanda; se for de uma versão antiga do app, recarrega na versão nova. */
export async function carregarModulo<T>(importar: () => Promise<T>): Promise<T> {
  try {
    return await importar();
  } catch (e) {
    if (!ehFalhaDeVersao(e)) throw e;
    if (recarregarVersaoNova()) return new Promise<T>(() => {}); // a página vai recarregar
    throw new Error(
      navigator.onLine
        ? 'O app foi atualizado. Recarregue a página (F5 ou puxe a tela para baixo) e tente de novo.'
        : 'Sem internet para baixar esta parte do app. Tente de novo quando estiver conectado.',
    );
  }
}

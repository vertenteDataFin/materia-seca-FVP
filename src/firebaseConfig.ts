/**
 * Configuração do projeto Firebase (console → Configurações do projeto → Seus apps → Web).
 * Estes valores são públicos por natureza: a proteção dos dados vem das regras em firestore.rules.
 * Se projectId estiver vazio, o app funciona só neste aparelho (IndexedDB), sem login.
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyBOaZyHukCN5qzSE-UU3jVptiC776O52u8',
  authDomain: 'silagem-ms.firebaseapp.com',
  projectId: 'silagem-ms',
  storageBucket: 'silagem-ms.firebasestorage.app',
  messagingSenderId: '1076252828874',
  appId: '1:1076252828874:web:703502fd6f3c7f3a014033',
};

/** Id do documento da fazenda no Firestore (fazendas/<id>/…). */
export const FAZENDA_ID = 'vertente';

/**
 * E-mails administradores: sempre têm acesso e podem incluir outras pessoas (Config → Pessoas com acesso).
 * Mantenha igual à lista admins() em firestore.rules.
 */
export const ADMINS: string[] = ['marialauragcardoso@gmail.com', 'maria.mesquita@fazendavertente.com.br'];

/**
 * Quem vê o histórico de alterações (Config → Histórico) e pode desfazer exclusões/edições.
 * Mantenha igual à lista auditores() em firestore.rules.
 */
export const AUDITORES: string[] = ['marialauragcardoso@gmail.com'];

export function ehAuditor(email: string | null | undefined): boolean {
  return !!email && AUDITORES.includes(email.trim().toLowerCase());
}

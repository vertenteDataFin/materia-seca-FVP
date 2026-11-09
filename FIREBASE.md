# Silagem MS — dados na nuvem (Firebase)

Os dados do app (talhões, coletas, amostras) ficam no **Cloud Firestore** do projeto `silagem-ms`,
com cache offline no aparelho. Só entra quem fizer login com um e-mail autorizado.

## Onde cada coisa fica

| O quê | Onde |
|---|---|
| Dados da fazenda | Firestore → `fazendas/vertente/{talhoes,coletas,amostras}` |
| Pessoas com acesso | Firestore → `fazendas/vertente/membros/<e-mail em minúsculas>` com `{ nome, papel: 'admin' \| 'membro' }` |
| Administradores fixos | `src/firebaseConfig.ts` (`ADMINS`) **e** `firestore.rules` (`admins()`) — manter iguais |
| Configuração do app web | `src/firebaseConfig.ts` (valores públicos; a proteção são as regras) |
| Regras de segurança | `firestore.rules` |
| Parâmetros da estimativa, último responsável/quadro | localStorage do navegador (por aparelho) |

O login é por e-mail e senha. Na primeira entrada o app pede para confirmar o e-mail (link enviado pelo Firebase);
só depois disso as regras liberam os dados.

## Primeira configuração (console.firebase.google.com)

1. Firestore Database → Criar banco (região `southamerica-east1`, modo de produção).
2. Authentication → Método de login → ativar **E-mail/senha**.
3. Authentication → Usuários → **Adicionar usuário** para cada pessoa (e-mail + senha inicial). A pessoa pode trocar a senha
   pelo "Esqueci a senha" na tela de login.
4. Authentication → Configurações → Domínios autorizados → adicionar `vertentedatafin.github.io`.
5. Publicar as regras (abaixo). Até isso ser feito, ninguém consegue ler nem gravar.

## Publicar as regras de segurança

Opção A (console): Firestore Database → aba **Regras** → colar o conteúdo de `firestore.rules` → **Publicar**.

Opção B (terminal, uma vez por máquina):

```powershell
npx firebase login
npm run regras
```

## Incluir ou remover pessoas

Dois passos: criar o usuário em Authentication → Usuários e, no app, logado como administrador, incluir o mesmo
e-mail em **Config → Pessoas com acesso**. Para promover alguém a administrador
fixo (não removível pelo app), edite `ADMINS` e `admins()` e publique as regras de novo.

## Migração de aparelhos antigos

Na primeira abertura após a atualização, o app lê o banco local antigo (Dexie, `silagem-ms`) e envia para a
nuvem: talhões são casados pelo nome e coletas iguais não são duplicadas. Isso acontece uma vez por aparelho
(`localStorage` `silagem-ms:legado-migrado-v1`). Se o Firebase não estiver configurado (`projectId` vazio),
o app volta a funcionar só no aparelho, sem login.

## Desenvolvimento com emuladores

Exige JDK 21 ou superior no PATH (`JAVA_HOME`).

```powershell
npm run emuladores        # Auth em :9099, Firestore em :8080, projeto demo-silagem
npm run dev:emulador      # app em https://localhost:5180 apontando para os emuladores
npx vitest run src/firestore.emulador.test.ts   # regras + sincronização (pulado se o emulador não estiver no ar)
```

No emulador, crie um usuário pelo app ("E-mail/senha") ou pela API do emulador; a lista de administradores
fixos vale também lá.

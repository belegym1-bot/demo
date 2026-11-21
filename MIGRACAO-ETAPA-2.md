# Etapa 2 — base de autenticação Supabase

Foi adicionado `supabase-auth.js` como camada pequena e isolada para:
- obter a sessão atual;
- entrar com e-mail e senha via Supabase Auth;
- encerrar a sessão;
- carregar o perfil associado ao mesmo UUID do usuário autenticado;
- observar mudanças de sessão.

## Limite desta etapa

Este módulo ainda não foi conectado ao formulário do `app.js`. O restante do aplicativo ainda usa `/api/state` e `/api/action` do `server.mjs`, portanto ligar o login isoladamente deixaria a autenticação e os dados em sistemas diferentes. A conexão será feita junto com o adaptador de estado e as operações server-side.

Cadastro público também não foi habilitado: o fluxo existente depende de convite/ativação da academia. O provisionamento de `profiles`, a autorização de responsável e a validação da idade devem ocorrer por operação confiável no servidor, não por uma gravação aberta no navegador.

A data de nascimento deve ser coletada no cadastro e não exposta em formulários de edição. O banco já teve revogada a permissão de UPDATE de `birth_date` e `guardian_authorized` para `authenticated`; ainda será necessário verificar as políticas e os fluxos privilegiados que escrevem esses campos.

## Próximo passo técnico

Implementar e testar uma Edge Function de convite/ativação que:
1. valide o código de convite sem expô-lo ao cliente;
2. crie/ative a identidade no Supabase Auth;
3. crie o perfil com `birth_date` e autorização inicial do responsável;
4. impeça alterações posteriores de `birth_date`, `role`, `active` e `guardian_authorized`;
5. nunca retorne segredos administrativos ao navegador.

Depois, substituir `/api/state` e `/api/action` gradualmente, mantendo os contratos esperados pelas telas.

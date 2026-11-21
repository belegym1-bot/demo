# Belê GYM — estado da migração

## Decisões mantidas

- Frontend existente em HTML, CSS e JavaScript, preservando a aparência.
- Supabase como destino de banco, autenticação e armazenamento.
- Cloudflare Pages como destino de hospedagem do frontend; não usar Vercel.

## Revisão aplicada nesta cópia

A versão local foi otimizada sem trocar o visual: a introdução deixou de bloquear o carregamento, a navegação interna deixou de refazer consultas completas a cada clique, imagens carregam sob demanda, recursos estáticos usam cache e as gravações do Node.js são assíncronas e serializadas.

## O que falta para produção

A aplicação ainda usa `server.mjs`, `domain.mjs`, `.bele-data/state.json` e as rotas `/api/state`, `/api/action` e `/api/photo`. Não foi feita uma migração automática para Supabase porque ainda é necessário criar o projeto, definir as credenciais públicas e portar e testar as regras de acesso.

A migração deverá manter as regras de visibilidade, compartilhamento, moderação, ativação, convites, responsáveis e autorização de fotos. As permissões devem ser aplicadas com RLS e funções server-side, não apenas escondendo botões no navegador.

**Não publique a versão atual como produção.** A configuração de cabeçalhos está preparada, mas as rotas de API ainda são locais. Consulte `README-DEPLOY.md` e `supabase/README.md`.

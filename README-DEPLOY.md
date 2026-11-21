# Publicação — etapa pendente

A interface estática pode ser hospedada na Vercel, mas a aplicação ainda depende das rotas `/api/state`, `/api/action` e `/api/photo` do servidor Node.js local. Não publique esta versão como se estivesse pronta: o frontend será servido, mas essas rotas não existirão na Vercel.

Antes do deploy público, é necessário concluir a migração do backend para Supabase:

1. Criar o projeto Supabase e guardar a URL e a chave publishable.
2. Criar tabelas, índices, constraints e políticas RLS para perfis, grupos, membros, check-ins, comentários, curtidas, denúncias e treinos.
3. Migrar login, ativação e recuperação para Supabase Auth.
4. Migrar fotos para buckets privados do Supabase Storage.
5. Substituir as chamadas `/api/*` no frontend por operações Supabase, mantendo as regras de autorização no banco/Edge Functions.
6. Testar as permissões com contas separadas de aluno e equipe.
7. Só então publicar os arquivos estáticos na Vercel.

A chave `service_role` nunca deve ser colocada no HTML, JavaScript do navegador ou em repositório público.

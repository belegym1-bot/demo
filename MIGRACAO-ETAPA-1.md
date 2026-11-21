# Belê GYM — Etapa 1 da migração: auditoria do código

Data: 20/11/2026  
Base analisada: `Bele-GYM-teste-conexao-sem-RLS.zip`

## Resultado desta etapa

O código foi extraído e inspecionado. O comando `npm run check` foi executado com sucesso nos arquivos `server.mjs`, `domain.mjs`, `app.js`, `views.js` e `intro.js`. Isso valida sintaxe, não comportamento funcional nem segurança de produção.

**Não foi feita alteração no frontend nem no banco nesta etapa.** A migração não deve avançar para consultas reais até confirmar o DDL atual do Supabase (colunas, tipos, constraints, índices e políticas), pois o ZIP não contém os SQLs de criação/alteração do banco.

## 1. Arquitetura atual confirmada no código

- `index.html` carrega `app.js` como módulo ES.
- `app.js` carrega estado por `GET /api/state`.
- `app.js` envia comandos por `POST /api/action`.
- `server.mjs` mantém estado em `.bele-data/state.json`.
- `server.mjs` implementa sessão própria em cookie `bele_sessao`, com duração de 12 horas.
- `server.mjs` entrega fotos por `GET /api/photo/:id`.
- `domain.mjs` contém as regras de negócio e a autenticação local.
- `supabase-client.js` instancia `createClient` usando `supabase-config.js`, mas ainda não é usado pelo fluxo principal do aplicativo.
- `supabase-config.js` contém URL e publishable key. A publishable key é própria para o navegador; nenhuma `service_role` foi identificada no frontend.

## 2. Inventário das ações que precisam ser migradas

| Área | Ações encontradas no código |
|---|---|
| Autenticação | `login`, `logout`, `demo`, `activate`, `recover`, `reset` |
| Perfil | `profile.update` |
| Alunos/equipe | `student.invite`, `student.update`, `student.active` |
| Grupos | `group.create`, `group.join`, `group.cancel`, `group.leave`, `group.review`, `group.renew`, `group.transfer`, `group.member` |
| Publicações | `post.create`, `post.update`, `post.delete`, `post.removeGroup`, `post.like`, `post.report` |
| Comentários | `post.comment`, `comment.delete`, `comment.report` |
| Moderação | `report.review` |
| Exercícios | `exercise.create`, `exercise.update`, `exercise.delete` |

O `app.js` envia o nome da ação e os dados para `/api/action`. A substituição precisa preservar os contratos esperados pela interface ou adaptar a interface de forma coordenada.

## 3. Regras de negócio identificadas

### Contas e autenticação
- Conta precisa estar ativa e ativada para autenticar.
- A ativação exige código temporário e, quando aplicável, autorização de responsável para menor de idade.
- A recuperação local gera código temporário de uma hora.
- A redefinição invalida sessões anteriores.
- Há perfis de aluno e equipe (`student` e `admin`).
- As contas `demo` são apenas demonstração local e não podem ser levadas à produção.

### Grupos
- Limite de cinco grupos/pedidos por aluno.
- Limite de quinze membros por grupo.
- Convite por código.
- Entrada depende de aprovação.
- Papéis: `owner`, `admin`, `member`.
- Apenas o dono transfere a propriedade ou renova código.
- Remover/sair pode exigir transferência automática da propriedade.
- Grupos sem membros são arquivados.

### Publicações, comentários e fotos
- Publicação pode pertencer a vários grupos.
- Visibilidade depende de autoria, associação ao grupo, estado oculto e equipe.
- Há compartilhamento opcional dos dados do treino.
- Curtidas são únicas por usuário/publicação.
- Comentários têm limite de 500 caracteres.
- Denúncias podem ser sobre publicação ou comentário.
- Remover uma publicação em moderação preserva o treino, mas oculta o conteúdo social.
- Fotos atuais podem ser Base64 ou caminhos locais; precisam virar objetos do Storage com autorização.

### Exercícios e treinos
- Há exercícios-base e exercícios personalizados por aluno.
- Exercício personalizado não pode ser excluído/alterado quando está vinculado a treino, conforme validação atual.
- Treinos têm modalidades de força e cardio e precisam de validação de estrutura.

## 4. Mapeamento inicial para as tabelas Supabase já mencionadas

| Conceito atual | Destino esperado |
|---|---|
| `users` + credenciais | Supabase Auth + `profiles` |
| `groups` | `groups` |
| `group.members` | `group_members` |
| `group.requests` | `group_join_requests` |
| `posts` | `posts` |
| `post.likes` | `post_likes` |
| `post.comments` | `comments` |
| `reports` | `reports` |
| `exercises` | `exercises` |
| fotos | Supabase Storage; banco guarda caminho/metadata, não Base64 |

Este é um mapeamento conceitual, não uma afirmação sobre as colunas existentes. A representação dos treinos (JSONB ou tabelas relacionais) também depende do DDL e das operações reais.

## 5. Bloqueios antes de escrever a integração

1. **DDL atual do Supabase:** o ZIP não contém os SQLs executados. Precisamos confirmar as colunas e constraints reais das dez tabelas.
2. **Políticas RLS completas:** o resumo anterior confirma que existem políticas, mas não fornece o texto integral delas nem os grants das tabelas.
3. **Ativação e convites:** o fluxo atual depende de códigos emitidos/guardados no servidor. Em produção isso exige fluxo confiável server-side (por exemplo, Edge Function com segredo somente no ambiente da função) e não pode ser simulado no navegador.
4. **Recuperação:** deve usar o fluxo oficial do Supabase Auth; não expor códigos de recuperação no cliente.
5. **Fotos privadas:** definir bucket, convenção de caminhos, políticas Storage e como a interface obtém URLs autorizadas.
6. **Demonstração:** retirar os botões/rotas `demo` da versão pública ou substituí-los por ambiente de teste separado.
7. **Sessões:** eliminar o cookie e o armazenamento de sessão próprios do `server.mjs`, passando a usar a sessão do Supabase Auth.

## 6. Ordem segura de implementação

1. Confirmar o DDL e as políticas atuais do Supabase.
2. Definir contrato de dados entre as tabelas e o formato de estado que `app.js` consome.
3. Implementar autenticação Supabase e perfil, incluindo recuperação e ativação.
4. Implementar leitura do estado por consultas Supabase respeitando RLS.
5. Implementar grupos e solicitações.
6. Implementar publicações, curtidas, comentários e denúncias.
7. Implementar exercícios e treinos.
8. Migrar upload/visualização de fotos para Storage.
9. Testar com contas separadas (aluno, dono/admin de grupo e equipe da academia).
10. Remover `/api/*`, `server.mjs` e `domain.mjs` do caminho de produção somente depois dos testes.
11. Preparar Cloudflare Pages e testar o site publicado.

## 7. Próximo passo necessário no Supabase

No SQL Editor do projeto `bele-gym`, execute uma consulta somente de leitura para exportar a estrutura das dez tabelas:

```sql
select
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default,
  ordinal_position
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'profiles', 'groups', 'group_members', 'group_join_requests', 'posts',
    'post_groups', 'post_likes', 'comments', 'exercises', 'reports'
  )
order by table_name, ordinal_position;
```

Envie o resultado em CSV. Em seguida, vamos conferir constraints, índices, funções e políticas antes de produzir o primeiro código integrado. Não execute SQL de alteração nesta etapa.

## Observação de segurança

O arquivo `.bele-data/state.json` é uma base local de demonstração e contém usuários/dados fictícios e hashes de senha da demonstração. Não importar esse arquivo nem as credenciais de demonstração para produção. Não compartilhe a `service_role` ou qualquer segredo administrativo.

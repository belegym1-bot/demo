# Belê GYM — etapa 3: nascimento imutável

## O que foi alterado nesta etapa

- O formulário de edição do aluno não oferece mais campo para alterar a data de nascimento.
- A operação `student.update` do modo local ignora qualquer `birthDate` enviado por clientes antigos e não modifica o nascimento armazenado.
- Foi criada a migração SQL `supabase/migrations/202611210001_birth_date_immutable.sql`, que instala um trigger no PostgreSQL para rejeitar alterações de `profiles.birth_date`.
- O SQL também mantém a função do trigger sem execução direta por `anon` e `authenticated`.
- A documentação foi alinhada à arquitetura Cloudflare Pages + Supabase.

## Aplicação da migração no Supabase

No SQL Editor do projeto Supabase, execute o conteúdo do arquivo SQL acima. Depois, rode:

```sql
update public.profiles
set birth_date = birth_date
where false;

select tgname, tgenabled
from pg_trigger
where tgrelid = 'public.profiles'::regclass
  and tgname = 'profiles_birth_date_immutable'
  and not tgisinternal;
```

A consulta deve retornar `profiles_birth_date_immutable` com estado `O`.

## Testes desta etapa

- A sintaxe dos módulos JavaScript será verificada com `npm run check`.
- O fluxo local será testado para garantir que `student.update` não altera `birthDate` mesmo quando recebe um valor diferente.
- A migração SQL precisa ser executada no Supabase do projeto e confirmada pela consulta acima; não foi executada remotamente por esta entrega.

## Ainda não é produção

A autenticação principal ainda está ligada às rotas locais `/api/state` e `/api/action`. A etapa de ativação por convite via Supabase Edge Function e o adaptador de dados Supabase continuam pendentes. Não remova `server.mjs` nem publique como versão de produção ainda.

# Belê GYM

O Belê aproxima alunos que treinam na mesma academia. Cada pessoa pode registrar check-ins com foto e treino opcional, guardar registros privados e escolher com quais grupos compartilhar.

## Executar no Windows

1. Instale o Node.js 22 ou mais recente.
2. Extraia esta pasta para um local de sua preferência.
3. Abra o PowerShell dentro da pasta do projeto.
4. Execute `npm start` ou dê dois cliques em `iniciar.ps1`.
5. Acesse `http://localhost:4173`.

O projeto não precisa instalar dependências externas. Para verificar a sintaxe dos arquivos, execute `npm run check`. Para desenvolvimento com reinício automático, use `npm run dev`.

### Abrir em outro dispositivo na mesma rede Wi-Fi

O servidor, por segurança, escuta apenas o próprio computador por padrão. Para permitir testes em outro dispositivo na mesma rede, execute no PowerShell:

```powershell
$env:HOST = '0.0.0.0'
npm start
```

Depois, no celular, abra `http://IP-DO-COMPUTADOR:4173`. O computador e o celular precisam estar na mesma rede. Não encaminhe essa porta para a internet: este modo é apenas para testes locais.

## O que foi melhorado nesta revisão

- A introdução em vídeo deixou de bloquear o carregamento do aplicativo. Ela começa somente depois que a primeira tela está pronta, não é repetida a cada navegação e tem duração máxima curta.
- O vídeo não é pré-carregado automaticamente. Isso evita baixar mídia antes de o usuário precisar dela.
- A navegação interna não faz mais uma consulta completa ao servidor a cada clique. O estado é atualizado depois das ações e quando o usuário retorna à aba.
- Imagens de feed e avatares usam carregamento tardio e decodificação assíncrona.
- A fonte principal é pré-carregada e os arquivos estáticos recebem cache de navegador.
- Gravações do Node.js agora usam operações assíncronas e atômicas. Uma fila serializa as alterações para impedir que ações simultâneas sobrescrevam dados umas das outras.
- O servidor permite configurar a interface de rede e mantém `127.0.0.1` como padrão seguro.
- Cabeçalhos básicos de segurança e limites de tamanho das requisições continuam ativos.

## Dados e limitações atuais

Esta versão ainda usa o backend Node.js e o arquivo `.bele-data/state.json`. É uma versão local/de testes, de instância única. O arquivo JSON não deve ser usado como banco de produção para vários usuários simultâneos ou múltiplas instâncias.

A configuração `vercel.json` prepara cabeçalhos e cache, mas **não significa que a API local já foi migrada para Vercel/Supabase**. O deploy público só deve ser feito depois de migrar autenticação, dados, fotos e regras de acesso para Supabase (PostgreSQL, Auth, Storage e RLS) e substituir as rotas `/api/*` por chamadas seguras ao serviço. Não coloque uma chave `service_role` no navegador.

As contas e as fotos iniciais são fictícias. Convites e recuperações ainda são fluxos locais de demonstração e não enviam e-mail real. Não use dados pessoais de alunos nesta versão.

## Referências do projeto

- [Definição do produto](https://docs.google.com/document/d/1lFri2XfT41uazcPs6DFEEnAuHGkJwRyw6jC2ELRaksk/edit)
- [Decisões consolidadas em novembro](https://drive.google.com/file/d/16ou9sY9yVe9ZFoM5JmZBiCZugeyOfZ0b/view)
- [Especificações de frontend](https://drive.google.com/file/d/1AlVTJBoDKlVPqYMUP7t_VY-ptraf_VWA/view) e [backend](https://drive.google.com/file/d/1iblrFiPWsgyxGtlwQs8XjycFHti1zpzA/view)
- [Manual de marca](https://drive.google.com/file/d/1N2heHovvnDZHDc1DzzCwEOccQ_fbN3HZ/view) e [introdução oficial](https://drive.google.com/file/d/1A6pDFveTAQ97OpVXz3I6IJhkOQybuT-s/view)

A fonte League Spartan é distribuída com a [licença OFL](assets/league-spartan-OFL.txt).

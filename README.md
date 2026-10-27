# Auto Brilho Web v2 — PWA + Supabase

Versão progressiva instalável (PWA), adaptada ao celular, com login do administrador, banco de dados na nuvem Supabase, sincronização Realtime, exportação Excel com seis abas e backup completo JSON.

## O que contém
- Clientes
- Veículos
- Serviços realizados
- Agendamentos
- Receitas e pagamentos
- Despesas
- Login por e-mail e senha (sem cadastro público)
- Sincronização de alterações via Supabase Realtime
- Exportação `.xlsx` com as seis abas
- Backup JSON baixável para guardar os registros
- PWA instalável em HTTPS

## Segurança — leia antes de inserir dados reais
- Use uma conta de administrador única. Não habilite cadastro público.
- O arquivo `config.js` deve conter somente a URL do projeto e a chave `anon/public` do Supabase. **Nunca** coloque `service_role` ou segredo privado no site.
- O SQL restringe o acesso às linhas ao e-mail definido na política. Substitua `ADMIN_EMAIL_AQUI` em `schema_supabase.sql` pelo e-mail exato que usará para entrar, antes de executar o SQL.
- A chave pública do Supabase não é uma senha; a proteção depende do login e das políticas RLS.
- O backup JSON é manual: baixe-o periodicamente e guarde uma cópia em local seguro. Configure também backups do banco no painel Supabase conforme o plano disponível.
- Não use dados reais até concluir a configuração, testar o login e conferir as permissões.

## Parte 1 — Criar o banco na nuvem pelo celular
1. Abra https://supabase.com no navegador do celular e crie uma conta.
2. Crie um projeto novo chamado `auto-brilho` e defina uma senha forte para o banco. Guarde-a em local seguro.
3. Espere o projeto terminar de provisionar.
4. Abra **SQL Editor** no painel Supabase. Abra o arquivo `schema_supabase.sql` deste projeto, copie o conteúdo, substitua todas as ocorrências de `ADMIN_EMAIL_AQUI` pelo e-mail do administrador e execute o SQL.
5. Abra **Authentication → Users** e use **Add user / Create new user** para criar o usuário administrador com o mesmo e-mail e uma senha forte. Não crie usuários adicionais.
6. Em **Authentication → Settings / Signups**, desative os novos cadastros públicos (Allow new users to sign up).
7. Nas configurações/API do projeto, copie a **Project URL** e a chave **anon/public** (não a service_role).

## Parte 2 — Configurar o site
1. Abra `config.js` e substitua `COLE_AQUI_A_URL_DO_PROJETO` pela Project URL e `COLE_AQUI_A_CHAVE_ANON_PUBLIC` pela chave anon/public.
2. Salve o arquivo. Não compartilhe a URL do projeto com a service_role key; essa chave não deve estar no frontend.
3. Faça upload de todos os arquivos e pastas para a raiz de um repositório GitHub chamado `auto-brilho-web`.
4. No GitHub, abra **Settings → Pages**, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)` e salve.
5. Aguarde o endereço HTTPS do GitHub Pages. Abra-o no Chrome Android, entre com o e-mail/senha do administrador e teste criando registros fictícios.
6. Para instalar, menu ⋮ do Chrome → **Instalar app** ou **Adicionar à tela inicial**.

## Atualizações e sincronização
Quando o aparelho estiver online, as alterações são gravadas no Supabase. A assinatura Realtime tenta atualizar a tela quando outro cliente altera os dados. O service worker mantém arquivos da interface em cache, mas as operações do banco e login precisam de internet.

## Se algo der errado
- Mensagem de configuração pendente: confirme `config.js` e publique o site novamente.
- Falha no login: confirme que o usuário foi criado no Supabase e que a URL/chave são as corretas.
- Erro de permissão: confirme que o e-mail do login é igual ao e-mail colocado nas políticas SQL.
- Sincronização sem atualização: confirme que as seis tabelas foram adicionadas à publicação `supabase_realtime` no SQL Editor.

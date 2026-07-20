# Deploy & DNS Quick Guide

Este documento resume passos práticos para publicar este site estático e apontar o domínio `arusuperguia.com.br`.

1) Escolher um provedor (recomendado)
- Netlify — fácil, suporta `_redirects`, SSL automático e variáveis de ambiente.
- Vercel — integração Git, `vercel.json` já incluído para SPA.
- Cloudflare Pages — rápido e CDN global.
- GitHub Pages — possível, porém gerencia HTTPS/DNS de forma diferente.

2) Arquivos incluídos neste repositório
- `_redirects`: regra para Netlify (serve `index.html` para todas as rotas SPA).
- `netlify.toml`: configuração mínima para Netlify.
- `vercel.json`: rewrite para Vercel servir `index.html`.
- `.env.example`: exemplo de variáveis `SUPABASE_URL` e `SUPABASE_ANON_KEY`.

3) Passo-a-passo (Netlify - exemplo rápido)
- Acesse https://app.netlify.com/ e crie um site a partir do repositório (GitHub/GitLab/Bitbucket) ou arraste os arquivos.
- Configure `Build command` vazio (é um site estático) e `Publish directory` como `/` (ou `.` se solicitado).
- Em Settings → Domain management, adicione `arusuperguia.com.br` como Custom domain.
- Siga as instruções de DNS fornecidas pelo Netlify: normalmente adicionar registros A para os IPs do Netlify ou alterar Nameservers.
- Em Site settings → Build & deploy → Environment, adicione `SUPABASE_URL` e `SUPABASE_ANON_KEY` (use as chaves da sua instância Supabase).

4) Passo-a-passo (Vercel - resumo)
- Crie um projeto no Vercel e aponte para o repositório ou envie os arquivos.
- Escolha `Framework Preset` como `Other` (static) e `Output Directory` como `/`.
- Em Settings → Domains, adicione `arusuperguia.com.br` e siga as instruções DNS.
- Em Environment Variables, adicione `SUPABASE_URL` e `SUPABASE_ANON_KEY`.

5) Cloudflare Pages / GitHub Pages (resumo)
- Cloudflare Pages: crie projeto, conecte repo, defina build settings (none/static), adicione domínio e configure DNS na Cloudflare.
- GitHub Pages: faça push do branch `gh-pages` ou configure Actions; para SPA você precisará garantir que rotas sejam reescritas para `index.html` (mais trabalhoso).

6) DNS e SSL
- Para domínio gerenciado por registrador (ex: Registro.br), atualize os registros conforme o provedor escolhido:
  - Netlify/Vercel/Cloudflare Pages: normalmente adicionam Nameservers ou pedem um `A`/`CNAME` específico.
  - Exemplo mínimo (quando pedido por CNAME): `www -> CNAME -> <provider>` e adicionar um redirecionamento no provedor para raiz (`arusuperguia.com.br`).
- Provedor cuidará do SSL (Let's Encrypt automático). Aguarde propagação (pode levar minutos/hours).

7) Supabase — ajustes importantes
- Em Supabase console → Authentication → Settings, configure `Site URL` para `https://arusuperguia.com.br`.
- Em Authentication → Providers, habilite o provedor OAuth (Google) se usar, e adicione o redirect URI:
  `https://arusuperguia.com.br/auth/v1/callback`
- Se optar por magic link (recomendado), não precisará configurar Google Cloud.

8) Google Cloud (se usar Google OAuth)
- Em Google Cloud Console → APIs & Credentials, edite seu OAuth client e adicione `https://arusuperguia.com.br/auth/v1/callback` em Authorized redirect URIs.

9) Variáveis de ambiente para frontend
- Não comitar chaves secretas. No serviço de hospedagem, defina as env vars públicas:
  - `SUPABASE_URL` = `https://...supabase.co`
  - `SUPABASE_ANON_KEY` = `public anon key`

10) Testes finais
- Limpe cache do navegador e abra `https://arusuperguia.com.br`.
- Teste upload, curadoria e votação (verifique CORS/Storage se houver erro 403).

11) Checklist rápido
- [ ] Domínio registrado e apontado
- [ ] Site publicado no provedor
- [ ] Variáveis de ambiente configuradas
- [ ] `Site URL` e redirect URIs atualizados no Supabase
- [ ] (Opcional) Redirect URI atualizado no Google Cloud

Se quiser, eu posso: (A) gerar um arquivo `README-deploy.txt` com instruções específicas para o registrador que você usa, (B) preparar um commit com mudanças em `app.js` para ler variáveis de ambiente em tempo de build, ou (C) iniciar o deploy no Netlify usando a CLI (você precisa me fornecer acesso via terminal). Qual prefere?

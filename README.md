# AruSuperGuia

Site estático (HTML + JS puro + Tailwind via CDN) com backend em Supabase, feito
para o **Concurso Cultural Belinzoni Dino Parque**: visitantes enviam fotos,
uma curadoria aprova, o público vota, e ao final o concurso é encerrado e
entra para o histórico de edições.

Para o *porquê* das decisões de arquitetura (RLS, thumbnails, fluxo de
"concurso ativo", etc.), veja **[ARQUITETURA.md](ARQUITETURA.md)**. Este
README cobre só "o que existe" e "como rodar".

## Estrutura das páginas

| Página | Público | O que faz |
|---|---|---|
| `index.html` | visitante | Landing page: explica o concurso, mostra prazo, link pra enviar foto e votar |
| `enviar.html` | visitante | Formulário de envio de foto (compressão + thumbnail no navegador, CAPTCHA, upload) |
| `votacao.html` | visitante | Grade de fotos aprovadas do concurso ativo; login Google pra votar; vira "fotos campeãs" quando o concurso encerra |
| `historico.html` | visitante | Pódio de cada concurso já encerrado (edições anteriores) |
| `status.html` | visitante | Consulta o status da foto enviada (em análise/aprovada/reprovada) por código, sem login |
| `curadoria.html` + `app.js` | admin | Painel: modera fotos, e faz CRUD de concursos, patrocinadores e premiações |
| `privacy.html` / `terms.html` | visitante | Páginas legais |

## Stack

- **Frontend**: HTML + JavaScript vanilla (sem framework/bundler) + [Tailwind CSS via CDN](https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19) + `styles.css` próprio (identidade visual "ticket de expedição").
- **Backend**: [Supabase](https://supabase.com) — Postgres (com Row Level Security), Auth (Google OAuth), Storage (fotos e thumbnails), e uma Edge Function.
- **CAPTCHA**: Cloudflare Turnstile, validado servidor-a-servidor na Edge Function.
- **Hospedagem**: Netlify, com deploy automático a partir do GitHub (`git push` já publica).

Não há build step: os arquivos `.html`/`.js`/`.css` são servidos como estão.

## Rodando localmente

1. Abra a pasta no VSCode e use a extensão **Live Server** (porta padrão `5500`).
   `http://127.0.0.1:5500` e `http://localhost:5500` já estão liberados no CORS
   da Edge Function (veja `supabase/functions/enviar-foto/index.ts`) e nas
   configurações do Supabase Auth — não precisa de nenhum servidor além disso.
2. `supabase-client.js` já aponta para o projeto Supabase real (a `anon key` é
   pública por natureza; a segurança vem das policies de RLS, não do sigilo
   dela). Não há `.env` para configurar no frontend.
3. Para testar o fluxo de curadoria, você precisa de um usuário cadastrado na
   tabela `public.admins` (veja `sql/014_admins_e_rls.sql`).

## Banco de dados

Todas as migrações ficam em [`sql/`](sql/), numeradas e aplicadas manualmente
no SQL Editor do Supabase (não há CLI/migração automatizada configurada).
Rode-as **em ordem** ao subir um ambiente novo — cada arquivo comenta o que
faz e de qual migração anterior depende. Elas também servem como changelog
técnico do banco: em vez de manter uma doc de schema separada (que ficaria
desatualizada), o próprio nome + comentário de cada arquivo documenta a
evolução da estrutura.

## Edge Function

`supabase/functions/enviar-foto` é o único caminho para inserir uma linha em
`fotos_concurso` (o insert direto pela API é bloqueado por RLS — ver
`sql/002_bloquear_insert_direto.sql`). Ela valida o CAPTCHA direto com a
Cloudflare e descobre o concurso ativo no momento do envio.

Após qualquer alteração no `index.ts`, é preciso reimplantar manualmente:

```bash
supabase functions deploy enviar-foto
```

## Outros documentos deste repositório

- `DEPLOY.md` / `GITHUB-PAGES.md` — notas de hospedagem/DNS.
- `LEIA-ME-THUMBNAIL.md`, `LEIA-ME-CORRECOES.md` — checklists de passos
  manuais (rodar migração X, redeploy Y) de mudanças pontuais já aplicadas;
  ficam como registro histórico, não precisam ser lidos para entender o
  projeto hoje.

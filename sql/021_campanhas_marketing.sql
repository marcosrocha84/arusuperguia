-- Execute este script no SQL Editor do Supabase (Dashboard > SQL Editor).
-- Cria o disparo de campanhas de e-mail marketing para patrocinadores
-- (curadoria.html > menu "Campanhas"), usando o Resend como provedor de envio.
--
-- Decisão de design: uma campanha pode mirar "toda a base opt-in"
-- (preferencias_marketing.optin_email_marketing = true) ou só quem votou
-- num concurso específico. Por isso concurso_id é NULLABLE em vez de duas
-- tabelas/fluxos separados — null significa "toda a base", preenchido
-- restringe aos votantes daquele concurso (join com votos_realizados e
-- fotos_concurso). Isso é uma escolha de produto, não só de schema: o
-- admin decide isso por campanha, na hora de criar.
--
-- eventos_email é uma tabela própria (não uma coluna de status na campanha)
-- porque o Resend manda um evento de lifecycle por vez via webhook
-- (sent/delivered/opened/clicked/bounced/complained), várias vezes por
-- campanha (um por destinatário, por evento) — precisa de granularidade de
-- linha pra dar pra fazer o "count(*) group by tipo" do relatório.

-- 1) Campanhas de e-mail marketing.
create table if not exists public.campanhas_marketing (
    id uuid primary key default gen_random_uuid(),
    patrocinador_id uuid not null references public.patrocinadores(id),
    concurso_id uuid references public.concursos(id),
    assunto text not null,
    corpo_html text not null,
    status text not null default 'rascunho'
        check (status in ('rascunho', 'enviando', 'concluida', 'erro')),
    criado_por uuid references auth.users(id),
    criado_em timestamptz not null default now(),
    enviado_em timestamptz
);

alter table public.campanhas_marketing enable row level security;

-- Só admins acessam — nenhum acesso público/anônimo. O disparo em si roda
-- na Edge Function disparar-campanha com Service Role (ignora RLS), então
-- não precisa de policy liberando update para o status 'enviando'/'concluida'
-- pro client autenticado comum.
create policy "Admins podem ler campanhas de marketing"
    on public.campanhas_marketing for select
    to authenticated
    using (is_admin());

create policy "Admins podem inserir campanhas de marketing"
    on public.campanhas_marketing for insert
    to authenticated
    with check (is_admin());

create policy "Admins podem atualizar campanhas de marketing"
    on public.campanhas_marketing for update
    to authenticated
    using (is_admin())
    with check (is_admin());

-- 2) Eventos de lifecycle de cada e-mail enviado (grava o histórico bruto
--    que alimenta o relatório de entregues/abertos/clicados/rejeitados).
create table if not exists public.eventos_email (
    id uuid primary key default gen_random_uuid(),
    campanha_id uuid not null references public.campanhas_marketing(id) on delete cascade,
    resend_email_id text not null,
    destinatario_user_id uuid references auth.users(id),
    tipo text not null
        check (tipo in ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained')),
    criado_em timestamptz not null default now()
);

-- Acelera o "count(*) group by tipo" do relatório por campanha.
create index if not exists idx_eventos_email_campanha_tipo
    on public.eventos_email (campanha_id, tipo);

-- Usado pelo webhook do Resend pra casar o evento recebido com a linha
-- "sent" gravada no disparo original.
create index if not exists idx_eventos_email_resend_email_id
    on public.eventos_email (resend_email_id);

alter table public.eventos_email enable row level security;

-- Só admins leem o relatório. Não existe policy de insert/update/delete
-- para authenticated/anon: quem grava é sempre a Edge Function (disparar-
-- campanha e resend-webhook), usando a Service Role Key, que ignora RLS.
create policy "Admins podem ler eventos de email"
    on public.eventos_email for select
    to authenticated
    using (is_admin());

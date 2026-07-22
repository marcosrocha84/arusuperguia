-- Execute este script no SQL Editor do Supabase (Dashboard > SQL Editor).
-- Adiciona o opt-in de e-mail marketing/novidades para usuários autenticados
-- na tela de votação (votacao.html).
--
-- Regra de negócio (definida em conversa com o time): o CONCURSO decide se
-- o banner de opt-in é exibido ou não (campo abaixo); o USUÁRIO decide a
-- resposta, e essa resposta vale independente de qual concurso estava ativo
-- quando foi dada — por isso a resposta fica numa tabela própria, ligada por
-- user_id, e não em concursos nem em fotos_concurso.

-- 1) Liga/desliga a exibição do banner por concurso. Default false: um
--    concurso novo não oferece opt-in até o curador habilitar explicitamente
--    (ex: até ter autorização do parceiro do concurso para envio de marketing).
alter table public.concursos
    add column if not exists mostrar_optin_marketing boolean not null default false;

-- 2) Preferência do usuário — 1 linha por pessoa, independente de concurso.
create table if not exists public.preferencias_marketing (
    user_id uuid primary key references auth.users(id) on delete cascade,
    optin_email_marketing boolean not null default false,
    optin_em timestamptz,
    optin_versao_termo text,
    atualizado_em timestamptz not null default now()
);

alter table public.preferencias_marketing enable row level security;

-- Cada usuário autenticado só lê/grava a própria linha (auth.uid() = user_id).
-- Não existe acesso público/anônimo, nem de um usuário à preferência de outro.
create policy "Usuario le a propria preferencia de marketing"
    on public.preferencias_marketing for select
    to authenticated
    using (auth.uid() = user_id);

create policy "Usuario insere a propria preferencia de marketing"
    on public.preferencias_marketing for insert
    to authenticated
    with check (auth.uid() = user_id);

create policy "Usuario atualiza a propria preferencia de marketing"
    on public.preferencias_marketing for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- Execute este script no SQL Editor do Supabase (Dashboard > SQL Editor).
-- Cria a tabela "premiacoes" usada pela nova tela de cadastro de premiações
-- no painel de curadoria (curadoria.html > menu "Premiações").

create table if not exists public.premiacoes (
    id uuid primary key default gen_random_uuid(),
    descricao varchar(100) not null,
    ativo boolean not null default true,
    criado_em timestamptz not null default now()
);

alter table public.premiacoes enable row level security;

-- Somente administradores autenticados (mesmo login usado em curadoria.html)
-- podem ler/gravar. Não existe acesso público/anônimo a esta tabela.
create policy "Admins podem ler premiacoes"
    on public.premiacoes for select
    to authenticated
    using (true);

create policy "Admins podem inserir premiacoes"
    on public.premiacoes for insert
    to authenticated
    with check (true);

create policy "Admins podem atualizar premiacoes"
    on public.premiacoes for update
    to authenticated
    using (true)
    with check (true);

create policy "Admins podem excluir premiacoes"
    on public.premiacoes for delete
    to authenticated
    using (true);

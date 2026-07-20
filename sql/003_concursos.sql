-- Execute este script no SQL Editor do Supabase (Dashboard > SQL Editor).
-- Cria a tabela "concursos" usada pela nova tela de cadastro de concursos
-- culturais no painel de curadoria (curadoria.html > menu "Concursos").

create table if not exists public.concursos (
    id uuid primary key default gen_random_uuid(),
    descricao text not null,
    data date not null,
    ativo boolean not null default true,
    criado_em timestamptz not null default now()
);

alter table public.concursos enable row level security;

-- Somente administradores autenticados (mesmo login usado em curadoria.html)
-- podem ler/gravar. Não existe acesso público/anônimo a esta tabela.
create policy "Admins podem ler concursos"
    on public.concursos for select
    to authenticated
    using (true);

create policy "Admins podem inserir concursos"
    on public.concursos for insert
    to authenticated
    with check (true);

create policy "Admins podem atualizar concursos"
    on public.concursos for update
    to authenticated
    using (true)
    with check (true);

create policy "Admins podem excluir concursos"
    on public.concursos for delete
    to authenticated
    using (true);

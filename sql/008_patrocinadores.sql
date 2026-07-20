-- Execute este script no SQL Editor do Supabase (Dashboard > SQL Editor).
-- Cria a tabela "patrocinadores" usada pela nova tela de cadastro de
-- patrocinadores no painel de curadoria (curadoria.html > menu "Patrocinadores").

create table if not exists public.patrocinadores (
    id uuid primary key default gen_random_uuid(),
    nome varchar(100) not null,
    logotipo_url text,
    ativo boolean not null default true,
    criado_em timestamptz not null default now()
);

alter table public.patrocinadores enable row level security;

-- Somente administradores autenticados (mesmo login usado em curadoria.html)
-- podem ler/gravar. Não existe acesso público/anônimo a esta tabela.
create policy "Admins podem ler patrocinadores"
    on public.patrocinadores for select
    to authenticated
    using (true);

create policy "Admins podem inserir patrocinadores"
    on public.patrocinadores for insert
    to authenticated
    with check (true);

create policy "Admins podem atualizar patrocinadores"
    on public.patrocinadores for update
    to authenticated
    using (true)
    with check (true);

create policy "Admins podem excluir patrocinadores"
    on public.patrocinadores for delete
    to authenticated
    using (true);

-- Bucket de storage onde os logotipos ficam armazenados (público para
-- leitura, já que os logos tendem a ser exibidos futuramente no site).
insert into storage.buckets (id, name, public)
values ('arusuperguia-patrocinadores', 'arusuperguia-patrocinadores', true)
on conflict (id) do nothing;

create policy "Admins podem enviar logotipos"
    on storage.objects for insert
    to authenticated
    with check (bucket_id = 'arusuperguia-patrocinadores');

create policy "Admins podem atualizar logotipos"
    on storage.objects for update
    to authenticated
    using (bucket_id = 'arusuperguia-patrocinadores');

create policy "Admins podem excluir logotipos"
    on storage.objects for delete
    to authenticated
    using (bucket_id = 'arusuperguia-patrocinadores');

create policy "Público pode ler logotipos"
    on storage.objects for select
    to public
    using (bucket_id = 'arusuperguia-patrocinadores');

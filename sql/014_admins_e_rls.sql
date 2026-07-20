-- Execute este script no SQL Editor do Supabase.
--
-- PROBLEMA: hoje qualquer pessoa que faz login com o Google em votacao.html
-- (só pra votar) também consegue abrir o painel de curadoria.html. Isso
-- acontece porque:
--   1) curadoria.html só checava "existe uma sessão?" (supabase.auth
--      getSession/onAuthStateChange), sem validar se essa sessão pertence a
--      um admin de verdade — qualquer usuário autenticado passava.
--   2) Pior: as policies de RLS das tabelas administrativas (concursos,
--      patrocinadores, premiacoes e as tabelas de vínculo) usavam
--      "to authenticated using (true)" — ou seja, QUALQUER usuário
--      autenticado (inclusive um voter logado via Google) já conseguia
--      ler/gravar essas tabelas direto pela API do Supabase, mesmo sem
--      passar pela tela de curadoria. O front-end escondia o painel, mas o
--      banco não impedia o acesso.
--
-- SOLUÇÃO: uma tabela "admins" com a lista de usuários autorizados, mais
-- uma função is_admin() que os dois lados (front-end e RLS) usam pra
-- validar de verdade quem pode entrar.

-- 1) Tabela de administradores autorizados.
create table if not exists public.admins (
    user_id uuid primary key references auth.users(id) on delete cascade,
    email text,
    criado_em timestamptz not null default now()
);

alter table public.admins enable row level security;
-- Ninguém lê/grava esta tabela direto pela API (nem os próprios admins) —
-- o cadastro de novos admins é feito manualmente aqui no SQL Editor
-- (ver INSERT de exemplo no fim do arquivo), e a checagem de permissão é
-- sempre feita através da função is_admin() abaixo, nunca lendo a tabela.

-- 2) Função que diz se o usuário autenticado atual é um admin.
--    security definer = consegue ler a tabela "admins" (que não tem
--    nenhuma policy de select) mesmo rodando com o papel do usuário comum.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1 from public.admins where user_id = auth.uid()
    );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated, anon;

-- 3) Substitui "to authenticated using (true)" por "using (is_admin())" em
--    todas as policies administrativas que eu (assistente) criei nas
--    migrações anteriores. Cada DROP usa o nome exato da policy original.

-- concursos (sql/003_concursos.sql)
drop policy if exists "Admins podem ler concursos" on public.concursos;
create policy "Admins podem ler concursos"
    on public.concursos for select
    to authenticated
    using (is_admin());

drop policy if exists "Admins podem inserir concursos" on public.concursos;
create policy "Admins podem inserir concursos"
    on public.concursos for insert
    to authenticated
    with check (is_admin());

drop policy if exists "Admins podem atualizar concursos" on public.concursos;
create policy "Admins podem atualizar concursos"
    on public.concursos for update
    to authenticated
    using (is_admin())
    with check (is_admin());

drop policy if exists "Admins podem excluir concursos" on public.concursos;
create policy "Admins podem excluir concursos"
    on public.concursos for delete
    to authenticated
    using (is_admin());

-- patrocinadores (sql/008_patrocinadores.sql)
drop policy if exists "Admins podem ler patrocinadores" on public.patrocinadores;
create policy "Admins podem ler patrocinadores"
    on public.patrocinadores for select
    to authenticated
    using (is_admin());

drop policy if exists "Admins podem inserir patrocinadores" on public.patrocinadores;
create policy "Admins podem inserir patrocinadores"
    on public.patrocinadores for insert
    to authenticated
    with check (is_admin());

drop policy if exists "Admins podem atualizar patrocinadores" on public.patrocinadores;
create policy "Admins podem atualizar patrocinadores"
    on public.patrocinadores for update
    to authenticated
    using (is_admin())
    with check (is_admin());

drop policy if exists "Admins podem excluir patrocinadores" on public.patrocinadores;
create policy "Admins podem excluir patrocinadores"
    on public.patrocinadores for delete
    to authenticated
    using (is_admin());

-- storage do logotipo de patrocinadores (sql/008_patrocinadores.sql)
drop policy if exists "Admins podem enviar logotipos" on storage.objects;
create policy "Admins podem enviar logotipos"
    on storage.objects for insert
    to authenticated
    with check (bucket_id = 'arusuperguia-patrocinadores' and is_admin());

drop policy if exists "Admins podem atualizar logotipos" on storage.objects;
create policy "Admins podem atualizar logotipos"
    on storage.objects for update
    to authenticated
    using (bucket_id = 'arusuperguia-patrocinadores' and is_admin());

drop policy if exists "Admins podem excluir logotipos" on storage.objects;
create policy "Admins podem excluir logotipos"
    on storage.objects for delete
    to authenticated
    using (bucket_id = 'arusuperguia-patrocinadores' and is_admin());

-- storage do PDF de regulamento (sql/006_concursos_regulamento.sql)
drop policy if exists "Admins podem enviar regulamentos" on storage.objects;
create policy "Admins podem enviar regulamentos"
    on storage.objects for insert
    to authenticated
    with check (bucket_id = 'arusuperguia-regulamentos' and is_admin());

drop policy if exists "Admins podem atualizar regulamentos" on storage.objects;
create policy "Admins podem atualizar regulamentos"
    on storage.objects for update
    to authenticated
    using (bucket_id = 'arusuperguia-regulamentos' and is_admin());

drop policy if exists "Admins podem excluir regulamentos" on storage.objects;
create policy "Admins podem excluir regulamentos"
    on storage.objects for delete
    to authenticated
    using (bucket_id = 'arusuperguia-regulamentos' and is_admin());

-- premiacoes (sql/009_premiacoes.sql)
drop policy if exists "Admins podem ler premiacoes" on public.premiacoes;
create policy "Admins podem ler premiacoes"
    on public.premiacoes for select
    to authenticated
    using (is_admin());

drop policy if exists "Admins podem inserir premiacoes" on public.premiacoes;
create policy "Admins podem inserir premiacoes"
    on public.premiacoes for insert
    to authenticated
    with check (is_admin());

drop policy if exists "Admins podem atualizar premiacoes" on public.premiacoes;
create policy "Admins podem atualizar premiacoes"
    on public.premiacoes for update
    to authenticated
    using (is_admin())
    with check (is_admin());

drop policy if exists "Admins podem excluir premiacoes" on public.premiacoes;
create policy "Admins podem excluir premiacoes"
    on public.premiacoes for delete
    to authenticated
    using (is_admin());

-- vínculos concurso <-> patrocinador/premiação (sql/010_concursos_patrocinadores_premiacoes.sql)
drop policy if exists "Admins podem ler vinculos de patrocinadores" on public.concursos_patrocinadores;
create policy "Admins podem ler vinculos de patrocinadores"
    on public.concursos_patrocinadores for select
    to authenticated
    using (is_admin());

drop policy if exists "Admins podem gravar vinculos de patrocinadores" on public.concursos_patrocinadores;
create policy "Admins podem gravar vinculos de patrocinadores"
    on public.concursos_patrocinadores for insert
    to authenticated
    with check (is_admin());

drop policy if exists "Admins podem excluir vinculos de patrocinadores" on public.concursos_patrocinadores;
create policy "Admins podem excluir vinculos de patrocinadores"
    on public.concursos_patrocinadores for delete
    to authenticated
    using (is_admin());

drop policy if exists "Admins podem ler vinculos de premiacoes" on public.concursos_premiacoes;
create policy "Admins podem ler vinculos de premiacoes"
    on public.concursos_premiacoes for select
    to authenticated
    using (is_admin());

drop policy if exists "Admins podem gravar vinculos de premiacoes" on public.concursos_premiacoes;
create policy "Admins podem gravar vinculos de premiacoes"
    on public.concursos_premiacoes for insert
    to authenticated
    with check (is_admin());

drop policy if exists "Admins podem excluir vinculos de premiacoes" on public.concursos_premiacoes;
create policy "Admins podem excluir vinculos de premiacoes"
    on public.concursos_premiacoes for delete
    to authenticated
    using (is_admin());

-- 4) IMPORTANTE — fotos_concurso: as policies de moderação (que permitem
--    ao admin ver/aprovar/rejeitar fotos pendentes) foram criadas fora
--    destas migrações numeradas (direto no dashboard, antes deste
--    histórico), então eu não sei o nome exato delas daqui. Rode:
--      select policyname, cmd, roles, qual, with_check
--      from pg_policies where tablename = 'fotos_concurso';
--    Para cada policy que hoje usa "to authenticated" com "using (true)"
--    (ou equivalente) para fins de MODERAÇÃO administrativa — NÃO mexa na
--    policy que permite votar (fora do escopo, ver sql/001_votar_em_foto.sql)
--    nem na leitura pública de fotos aprovadas — troque o "true" por
--    "is_admin()", assim:
--      drop policy if exists "nome_real_da_policy" on public.fotos_concurso;
--      create policy "nome_real_da_policy"
--          on public.fotos_concurso for select -- ou update/delete, conforme o caso
--          to authenticated
--          using (is_admin());

-- 5) Cadastre aqui o(s) e-mail(s) autorizado(s) a acessar o painel de
--    curadoria (troque pelo e-mail real de cada admin; a conta já precisa
--    existir em Authentication > Users no Supabase):
--
--    insert into public.admins (user_id, email)
--    select id, email from auth.users where email = 'seuemail@exemplo.com';

-- Execute este script no SQL Editor do Supabase, depois de
-- sql/003_concursos.sql, sql/008_patrocinadores.sql e sql/009_premiacoes.sql
-- já terem sido aplicados.
--
-- Cria os vínculos N:N entre concursos e patrocinadores/premiações, usados
-- na tela de curadoria.html > menu "Concursos" para o admin selecionar quais
-- patrocinadores e premiações valem para cada concurso.

create table if not exists public.concursos_patrocinadores (
    concurso_id uuid not null references public.concursos(id) on delete cascade,
    patrocinador_id uuid not null references public.patrocinadores(id) on delete cascade,
    primary key (concurso_id, patrocinador_id)
);

create table if not exists public.concursos_premiacoes (
    concurso_id uuid not null references public.concursos(id) on delete cascade,
    premiacao_id uuid not null references public.premiacoes(id) on delete cascade,
    primary key (concurso_id, premiacao_id)
);

alter table public.concursos_patrocinadores enable row level security;
alter table public.concursos_premiacoes enable row level security;

-- Mesmo padrão das demais tabelas administrativas: só admins autenticados
-- leem/gravam, sem acesso público/anônimo às tabelas de vínculo.
create policy "Admins podem ler vinculos de patrocinadores"
    on public.concursos_patrocinadores for select
    to authenticated
    using (true);

create policy "Admins podem gravar vinculos de patrocinadores"
    on public.concursos_patrocinadores for insert
    to authenticated
    with check (true);

create policy "Admins podem excluir vinculos de patrocinadores"
    on public.concursos_patrocinadores for delete
    to authenticated
    using (true);

create policy "Admins podem ler vinculos de premiacoes"
    on public.concursos_premiacoes for select
    to authenticated
    using (true);

create policy "Admins podem gravar vinculos de premiacoes"
    on public.concursos_premiacoes for insert
    to authenticated
    with check (true);

create policy "Admins podem excluir vinculos de premiacoes"
    on public.concursos_premiacoes for delete
    to authenticated
    using (true);

-- Observação sobre a logo dos patrocinadores para usuários anônimos:
-- sql/008_patrocinadores.sql já cria o bucket "arusuperguia-patrocinadores"
-- como público (public = true) e a policy "Público pode ler logotipos"
-- (for select, to public), que cobre o papel "anon". Não é necessária
-- nenhuma policy adicional para a logo ser visualizada por visitantes sem
-- login — este comentário só documenta que o requisito já está atendido.

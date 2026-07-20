-- Execute este script no SQL Editor do Supabase, depois de
-- sql/008_patrocinadores.sql, sql/009_premiacoes.sql e
-- sql/010_concursos_patrocinadores_premiacoes.sql já terem sido aplicados.
--
-- Libera leitura pública (papel "anon") das premiações e patrocinadores
-- ativos, e dos vínculos com o concurso — necessário porque index.html
-- agora exibe essa seção para qualquer visitante, sem exigir login (mesmo
-- motivo da policy "Público pode ler concursos" em
-- sql/004_concursos_fotos_fk.sql).

create policy "Público pode ler patrocinadores ativos"
    on public.patrocinadores for select
    to anon
    using (ativo = true);

create policy "Público pode ler premiacoes ativas"
    on public.premiacoes for select
    to anon
    using (ativo = true);

create policy "Público pode ler vinculos de patrocinadores"
    on public.concursos_patrocinadores for select
    to anon
    using (true);

create policy "Público pode ler vinculos de premiacoes"
    on public.concursos_premiacoes for select
    to anon
    using (true);

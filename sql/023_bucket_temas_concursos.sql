-- Execute este script no SQL Editor do Supabase, depois de
-- sql/014_admins_e_rls.sql (precisa da função is_admin()) e
-- sql/022_concursos_multiplos_ativos.sql (que criou theme_config).
--
-- Até aqui, logo/favicon/mascote do tema de cada concurso eram só campos de
-- texto na curadoria — o próprio curador precisava hospedar a imagem em
-- algum lugar e colar a URL. Isso é uma barreira real pra vender a
-- plataforma pra um patrocinador novo (ele não vai saber "hospedar uma
-- imagem e me passar a URL"). Este bucket permite que o curador faça
-- upload do arquivo direto pela tela de Concursos, do mesmo jeito que já
-- funciona pro regulamento em PDF (ver sql/006_concursos_regulamento.sql).

-- Bucket público (as imagens de tema são exibidas no site pra qualquer
-- visitante, sem login).
insert into storage.buckets (id, name, public)
values ('arusuperguia-temas', 'arusuperguia-temas', true)
on conflict (id) do nothing;

create policy "Admins podem enviar imagens de tema"
    on storage.objects for insert
    to authenticated
    with check (bucket_id = 'arusuperguia-temas' and is_admin());

create policy "Admins podem atualizar imagens de tema"
    on storage.objects for update
    to authenticated
    using (bucket_id = 'arusuperguia-temas' and is_admin());

create policy "Admins podem excluir imagens de tema"
    on storage.objects for delete
    to authenticated
    using (bucket_id = 'arusuperguia-temas' and is_admin());

create policy "Público pode ler imagens de tema"
    on storage.objects for select
    to public
    using (bucket_id = 'arusuperguia-temas');

-- Execute este script no SQL Editor do Supabase, depois de
-- sql/014_admins_e_rls.sql (precisa da função is_admin()) já ter sido
-- aplicado.
--
-- Fase 1 da migração de marca "AruSuperGuia" -> "Órbita": cria os 4 buckets
-- novos (orbita-fotos, orbita-regulamentos, orbita-patrocinadores,
-- orbita-temas), replicando as mesmas policies de RLS dos buckets antigos
-- (arusuperguia-*). Isso só cria os buckets vazios — a cópia dos arquivos
-- que já existem nos buckets antigos é um passo separado (não dá pra fazer
-- só com SQL, precisa da Storage API; ver script de migração de objetos).
--
-- IMPORTANTE: os buckets antigos e o código do site continuam funcionando
-- normalmente depois de rodar este script — ele só adiciona os novos, não
-- mexe nos antigos. A troca de fato (enviar.html, app.js apontarem pro
-- bucket novo) só deve acontecer depois que os arquivos existentes forem
-- copiados (fase seguinte) e as URLs já salvas no banco forem atualizadas.

-- ============================================================
-- 1) orbita-regulamentos (equivalente a arusuperguia-regulamentos,
--    ver sql/006_concursos_regulamento.sql)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('orbita-regulamentos', 'orbita-regulamentos', true)
on conflict (id) do nothing;

create policy "Admins podem enviar regulamentos (orbita)"
    on storage.objects for insert
    to authenticated
    with check (bucket_id = 'orbita-regulamentos' and is_admin());

create policy "Admins podem atualizar regulamentos (orbita)"
    on storage.objects for update
    to authenticated
    using (bucket_id = 'orbita-regulamentos' and is_admin());

create policy "Admins podem excluir regulamentos (orbita)"
    on storage.objects for delete
    to authenticated
    using (bucket_id = 'orbita-regulamentos' and is_admin());

create policy "Público pode ler regulamentos (orbita)"
    on storage.objects for select
    to public
    using (bucket_id = 'orbita-regulamentos');

-- ============================================================
-- 2) orbita-patrocinadores (equivalente a arusuperguia-patrocinadores,
--    ver sql/008_patrocinadores.sql + sql/014_admins_e_rls.sql)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('orbita-patrocinadores', 'orbita-patrocinadores', true)
on conflict (id) do nothing;

create policy "Admins podem enviar logotipos (orbita)"
    on storage.objects for insert
    to authenticated
    with check (bucket_id = 'orbita-patrocinadores' and is_admin());

create policy "Admins podem atualizar logotipos (orbita)"
    on storage.objects for update
    to authenticated
    using (bucket_id = 'orbita-patrocinadores' and is_admin());

create policy "Admins podem excluir logotipos (orbita)"
    on storage.objects for delete
    to authenticated
    using (bucket_id = 'orbita-patrocinadores' and is_admin());

create policy "Público pode ler logotipos (orbita)"
    on storage.objects for select
    to public
    using (bucket_id = 'orbita-patrocinadores');

-- ============================================================
-- 3) orbita-temas (equivalente a arusuperguia-temas,
--    ver sql/023_bucket_temas_concursos.sql)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('orbita-temas', 'orbita-temas', true)
on conflict (id) do nothing;

create policy "Admins podem enviar imagens de tema (orbita)"
    on storage.objects for insert
    to authenticated
    with check (bucket_id = 'orbita-temas' and is_admin());

create policy "Admins podem atualizar imagens de tema (orbita)"
    on storage.objects for update
    to authenticated
    using (bucket_id = 'orbita-temas' and is_admin());

create policy "Admins podem excluir imagens de tema (orbita)"
    on storage.objects for delete
    to authenticated
    using (bucket_id = 'orbita-temas' and is_admin());

create policy "Público pode ler imagens de tema (orbita)"
    on storage.objects for select
    to public
    using (bucket_id = 'orbita-temas');

-- ============================================================
-- 4) orbita-fotos (equivalente a arusuperguia-fotos)
-- ============================================================
-- Policies atuais do bucket antigo, conferidas via pg_policies (o bucket e
-- a policy de INSERT foram criados direto no painel do Supabase, fora do
-- histórico de migrações numeradas; só a de DELETE veio de
-- sql/019_storage_fotos_admin_delete.sql). Não existe policy de SELECT: o
-- bucket é público, e leitura de arquivo de bucket público é servida pela
-- URL pública direto, sem passar por RLS — por isso as fotos aparecem em
-- votacao.html/historico.html/index.html sem precisar de policy nenhuma.
insert into storage.buckets (id, name, public)
values ('orbita-fotos', 'orbita-fotos', true)
on conflict (id) do nothing;

-- Envio de foto em enviar.html não exige login — por isso "anon" também
-- está liberado, não só "authenticated".
create policy "Permitir envio de fotos (orbita)"
    on storage.objects for insert
    to anon, authenticated
    with check (bucket_id = 'orbita-fotos');

create policy "Admins podem excluir fotos do concurso (orbita)"
    on storage.objects for delete
    to authenticated
    using (bucket_id = 'orbita-fotos' and is_admin());

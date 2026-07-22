-- Execute este script no SQL Editor do Supabase, depois de
-- sql/014_admins_e_rls.sql já ter sido aplicado (precisa da função
-- is_admin() definida lá).
--
-- Necessário pro botão "Reprovar" da curadoria remover o arquivo do
-- Storage (bucket arusuperguia-fotos) ao reprovar uma foto — hoje esse
-- bucket só tem policy de INSERT (usada por enviar.html; criada direto no
-- painel do Supabase, fora das migrações numeradas), sem nenhuma de DELETE.
-- Sem essa policy, a chamada storage.remove() feita pelo admin seria
-- bloqueada pela RLS.

create policy "Admins podem excluir fotos do concurso"
    on storage.objects for delete
    to authenticated
    using (bucket_id = 'arusuperguia-fotos' and is_admin());

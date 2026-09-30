-- Execute este script no SQL Editor do Supabase (Dashboard > SQL Editor).
-- Permite ao curador marcar um concurso pra aparecer como "case" de sucesso
-- na página institucional criadores.html, com um comentário do
-- patrocinador. Sem RLS nova: a leitura pública de concursos já é
-- irrestrita por coluna (sql/004_concursos_fotos_fk.sql), então essas duas
-- colunas já ficam visíveis pra criadores.html (que roda sem login) assim
-- que existirem.

alter table public.concursos
    add column if not exists mostrar_case boolean not null default false;

alter table public.concursos
    add column if not exists comentario_patrocinador text;

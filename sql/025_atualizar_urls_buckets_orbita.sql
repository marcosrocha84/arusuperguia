-- Execute este script no SQL Editor do Supabase, depois de confirmar que
-- todos os arquivos já foram copiados dos buckets antigos pros novos
-- (scripts/migrar-buckets-orbita.mjs — Fase 1.5, já concluída).
--
-- Fase 1.6 da migração de marca: as URLs já salvas no banco (fotos
-- enviadas, PDFs de regulamento, logos de patrocinador, imagens de tema)
-- ainda apontam pro caminho do bucket antigo dentro da URL pública, ex:
--   https://xxx.supabase.co/storage/v1/object/public/arusuperguia-fotos/123.jpg
-- Este script troca só o segmento do nome do bucket dentro da URL, sem
-- mexer no resto do caminho/nome de arquivo.
--
-- Rode as consultas de contagem (comentadas) antes e depois de cada UPDATE
-- pra conferir quantas linhas foram afetadas.

-- ============================================================
-- 1) fotos_concurso.url_foto / url_thumb
-- ============================================================
-- select count(*) from public.fotos_concurso where url_foto like '%/arusuperguia-fotos/%' or url_thumb like '%/arusuperguia-fotos/%';

update public.fotos_concurso
set url_foto = replace(url_foto, '/arusuperguia-fotos/', '/orbita-fotos/')
where url_foto like '%/arusuperguia-fotos/%';

update public.fotos_concurso
set url_thumb = replace(url_thumb, '/arusuperguia-fotos/', '/orbita-fotos/')
where url_thumb like '%/arusuperguia-fotos/%';

-- ============================================================
-- 2) concursos.regulamento_pdf_url
-- ============================================================
-- select count(*) from public.concursos where regulamento_pdf_url like '%/arusuperguia-regulamentos/%';

update public.concursos
set regulamento_pdf_url = replace(regulamento_pdf_url, '/arusuperguia-regulamentos/', '/orbita-regulamentos/')
where regulamento_pdf_url like '%/arusuperguia-regulamentos/%';

-- ============================================================
-- 3) patrocinadores.logotipo_url
-- ============================================================
-- select count(*) from public.patrocinadores where logotipo_url like '%/arusuperguia-patrocinadores/%';

update public.patrocinadores
set logotipo_url = replace(logotipo_url, '/arusuperguia-patrocinadores/', '/orbita-patrocinadores/')
where logotipo_url like '%/arusuperguia-patrocinadores/%';

-- ============================================================
-- 4) concursos.theme_config (jsonb) — icones.logo/favicon/mascote
-- ============================================================
-- Concursos sem tema customizado usam o default relativo ("./logo-medio.jpg"
-- etc, ver sql/022) e não têm nada a trocar aqui — o "where" abaixo já
-- ignora essas linhas.
-- select count(*) from public.concursos where theme_config::text like '%/arusuperguia-temas/%';

update public.concursos
set theme_config = replace(theme_config::text, '/arusuperguia-temas/', '/orbita-temas/')::jsonb
where theme_config::text like '%/arusuperguia-temas/%';

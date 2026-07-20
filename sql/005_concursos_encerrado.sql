-- Execute este script no SQL Editor do Supabase, depois do
-- sql/003_concursos.sql já ter sido aplicado.
--
-- Adiciona um status manual "Encerrado" ao concurso, controlado pelo
-- curador na tela de Concursos (independente do campo "Ativo" e da data
-- de encerramento — por enquanto é só um campo informativo/de listagem,
-- não afeta a lógica de votacao.html nem o envio de fotos).

alter table public.concursos
    add column if not exists encerrado boolean not null default false;

-- Execute este script no SQL Editor do Supabase, depois do
-- sql/003_concursos.sql já ter sido aplicado.
--
-- Permite ao curador escolher, por concurso, quantas fotos são premiadas
-- (1, 2 ou 3), na tela de curadoria.html > menu "Concursos". Esse número
-- controla quantos selos de pódio (🥇🥈🥉) votacao.html exibe para o
-- concurso.

alter table public.concursos
    add column if not exists qtd_vencedores smallint not null default 3;

alter table public.concursos
    add constraint if not exists concursos_qtd_vencedores_check check (qtd_vencedores in (1, 2, 3));

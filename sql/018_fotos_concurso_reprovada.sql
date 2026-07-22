-- Execute este script no SQL Editor do Supabase, depois de
-- sql/015_fotos_concurso_rls.sql já ter sido aplicado.
--
-- Até agora, reprovar uma foto na curadoria excluía a linha inteira da
-- tabela (ver deletarFoto em app.js) — não sobrava registro nenhum. Isso
-- impedia o participante de saber, pelo código de acompanhamento
-- (status.html), que a foto dele foi reprovada: a consulta simplesmente não
-- encontrava nada, ficando indistinguível de "código inválido/nunca existiu".
--
-- Esta migração troca reprovação por soft-delete: a linha continua
-- existindo (com aprovada=false), só ganha a marca reprovada=true.
-- deletarFoto (app.js) passa a fazer UPDATE em vez de DELETE.

alter table public.fotos_concurso
    add column if not exists reprovada boolean not null default false;

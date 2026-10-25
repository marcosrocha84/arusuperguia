-- Execute este script no SQL Editor do Supabase (Dashboard > SQL Editor).
-- Depende de sql/033_arena.sql já ter sido aplicado.
--
-- Campo "ativo" em arena_campeonatos: controla se o campeonato aparece com
-- um link na página inicial da Órbita (index.html). Diferente de `status`
-- (inscricoes/em_andamento/encerrado, que descreve a FASE do campeonato),
-- `ativo` é uma escolha manual e independente do organizador sobre o que
-- está sendo divulgado agora — um campeonato pode estar em qualquer status
-- e mesmo assim não estar marcado como ativo (ex: edição antiga encerrada
-- que não deve mais aparecer na home).
--
-- Só um campeonato ativo por vez, reforçado no próprio banco (mesmo padrão
-- de concursos_unico_ativo em sql/004_concursos_fotos_fk.sql) — o curador é
-- barrado na tela da Arena ao tentar ativar um segundo campeonato, em vez
-- de só descobrir o problema quando o link errado aparecer na home.

alter table public.arena_campeonatos
    add column if not exists ativo boolean not null default false;

create unique index if not exists arena_campeonatos_unico_ativo
    on public.arena_campeonatos ((ativo))
    where ativo = true;

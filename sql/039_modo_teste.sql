-- Execute este script no SQL Editor do Supabase (Dashboard > SQL Editor).
--
-- "Modo teste": um jeito de cadastrar um concurso/campeonato real no banco
-- de produção (pra testar algo, gravar uma demonstração, ou mostrar pro
-- organizador numa apresentação) sem ele aparecer pras páginas públicas que
-- qualquer visitante vê. Motivado por um caso real: um concurso de teste
-- ("Café Dona Maria") precisou ser cadastrado direto em produção pra uma
-- apresentação, e ficou visível na home até ser limpo manualmente depois.
--
-- Continua acessível por link direto (concurso.html?c=slug, votacao.html,
-- arena.html?arena=slug) — de propósito: é exatamente isso que permite
-- mostrar pro organizador sem exigir uma segunda infraestrutura de
-- staging. O que muda é só sumir das LISTAGENS públicas (index.html,
-- historico.html, o link da Arena no rodapé) e ganhar um selo visível na
-- curadoria, pra não ser esquecido lá por engano.
--
-- Sem RLS nova: leitura pública de concursos e arena_campeonatos já é
-- irrestrita (sql/004, sql/033) — a coluna nova já sai no mesmo select de
-- sempre, e quem filtra é cada página pública, não o banco.

alter table public.concursos
    add column if not exists modo_teste boolean not null default false;

alter table public.arena_campeonatos
    add column if not exists modo_teste boolean not null default false;

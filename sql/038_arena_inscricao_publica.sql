-- Execute este script no SQL Editor do Supabase (Dashboard > SQL Editor).
-- Depende de sql/033_arena.sql já ter sido aplicado.
--
-- Até aqui, só admin conseguia inserir em arena_participantes/
-- arena_participantes_contato (ver sql/033) — o único jeito de alistar um
-- combatente era o admin fazer isso manualmente em curadoria.html. Agora
-- arena.html também deixa o próprio competidor se inscrever (busca o
-- personagem na API da Blizzard, confere os dados, confirma) — então
-- precisa de uma policy de INSERT pro papel público.
--
-- A única trava mantida é a fase do campeonato: só aceita inserir enquanto
-- `arena_campeonatos.status = 'inscricoes'` (mesma fase em que a seção de
-- inscrição aparece em arena.html) — depois que o chaveamento foi sorteado,
-- um novo participante nunca apareceria em partida nenhuma mesmo assim, só
-- ficaria uma linha solta. Fora isso, nenhuma validação adicional de
-- propósito (sem checar duplicidade, nível mínimo, etc.) — mesmo princípio
-- de "o curador decide o que fazer com quem se inscreveu" já usado em
-- fotos_concurso (toda foto enviada entra como pendente, a curadoria decide
-- depois).

drop policy if exists "Publico se inscreve durante inscricoes" on public.arena_participantes;
create policy "Publico se inscreve durante inscricoes"
    on public.arena_participantes for insert
    to anon, authenticated
    with check (
        exists (
            select 1 from public.arena_campeonatos c
            where c.id = campeonato_id and c.status = 'inscricoes'
        )
    );

-- O Discord continua sem leitura pública nenhuma (ver sql/033) — só grava.
drop policy if exists "Publico grava proprio contato ao se inscrever" on public.arena_participantes_contato;
create policy "Publico grava proprio contato ao se inscrever"
    on public.arena_participantes_contato for insert
    to anon, authenticated
    with check (true);

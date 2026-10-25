-- Execute este script no SQL Editor do Supabase (Dashboard > SQL Editor).
-- Depende de sql/033_arena.sql já ter sido aplicado (substitui só a função
-- arena_sortear_chaveamento, criada lá).
--
-- PROBLEMA: a versão original distribuía os "byes" (folgas, quando o nº de
-- inscritos não é potência de 2) empilhando-os nas primeiras partidas da
-- rodada 1, em vez de espalhar pelo chaveamento inteiro. Com poucos
-- inscritos num chaveamento grande — ex: 17 inscritos (chaveamento de 32,
-- 15 folgas) — isso deixava a rodada 1 quase inteira vazia de um lado só,
-- um visual bem torto e nada parecido com um chaveamento de torneio de
-- verdade.
--
-- SOLUÇÃO: gerar a ordem de semeadura clássica de chaveamento (o mesmo
-- algoritmo usado em torneios reais — ex: pra 8 vagas, a ordem é
-- 1,8,4,5,2,7,3,6: seed 1 vs seed 8 na partida 1, seed 4 vs seed 5 na
-- partida 2, etc.) e tratar os "byes" como se fossem os seeds mais altos
-- (os "últimos colocados"). Como essa ordem já é matematicamente desenhada
-- pra espalhar os extremos pelo chaveamento inteiro, os byes saem
-- naturalmente distribuídos entre as partidas, não empilhados nas
-- primeiras.

create or replace function public.arena_sortear_chaveamento(campeonato_id_input uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    ja_iniciado boolean;
    total_participantes int;
    tamanho_chave int;
    total_rodadas int;
    ids_ordenados uuid[];
    rodada_atual int;
    partidas_na_rodada int;
    i int;
    id_partida_atual uuid;
    posicao_atual int;
    id_partida_proxima uuid;
    slot_destino text;
    -- Ordem de semeadura clássica (array de nº de seed, na ordem dos
    -- slots do chaveamento) — gerada abaixo por duplicação recursiva.
    ordem_seed int[];
    nova_ordem int[];
    soma int;
    s int;
    seed_a int;
    seed_b int;
    part_a uuid;
    part_b uuid;
begin
    if not is_admin() then
        raise exception 'Apenas administradores podem sortear o chaveamento.';
    end if;

    select exists (
        select 1 from arena_partidas
        where campeonato_id = campeonato_id_input
          and (vitorias_a > 0 or vitorias_b > 0 or status in ('ao_vivo', 'encerrada'))
    ) into ja_iniciado;

    if ja_iniciado then
        raise exception 'Já existem resultados lançados neste campeonato — não é possível sortear de novo.';
    end if;

    delete from arena_partidas where campeonato_id = campeonato_id_input;

    select count(*) into total_participantes
    from arena_participantes
    where campeonato_id = campeonato_id_input;

    if total_participantes < 2 then
        raise exception 'É preciso de pelo menos 2 participantes pra sortear o chaveamento.';
    end if;

    -- Menor potência de 2 >= total_participantes, calculado em loop (em
    -- vez de log()/ceil() em numeric, que pode ter imprecisão de
    -- arredondamento bem em cima de uma potência exata).
    tamanho_chave := 1;
    total_rodadas := 0;
    while tamanho_chave < total_participantes loop
        tamanho_chave := tamanho_chave * 2;
        total_rodadas := total_rodadas + 1;
    end loop;

    -- Ordena: quem tem seed vem primeiro (menor seed primeiro — prioridade
    -- de semeadura, os "melhores seeds"), o resto embaralhado por
    -- random(). ids_ordenados[N] = participante com o Nº seed.
    select array_agg(id order by (seed is null), seed, random())
    into ids_ordenados
    from arena_participantes
    where campeonato_id = campeonato_id_input;

    -- Gera a ordem de semeadura clássica (duplicação recursiva): começa
    -- com [1], e a cada rodada intercala a lista atual com o "espelho"
    -- dela (soma = 2*tamanho_atual + 1, cada seed s vira par com soma-s).
    -- Pra tamanho_chave=8 dá [1,8,4,5,2,7,3,6].
    ordem_seed := array[1];
    while array_length(ordem_seed, 1) < tamanho_chave loop
        nova_ordem := array[]::int[];
        soma := array_length(ordem_seed, 1) * 2 + 1;
        foreach s in array ordem_seed loop
            nova_ordem := nova_ordem || s || (soma - s);
        end loop;
        ordem_seed := nova_ordem;
    end loop;

    -- Monta o esqueleto de todas as rodadas, ligando cada partida à sua
    -- sucessora (rodada+1, posição = ceil(posição_atual / 2)).
    for rodada_atual in 1..total_rodadas loop
        partidas_na_rodada := tamanho_chave / (2 ^ rodada_atual);
        for i in 1..partidas_na_rodada loop
            insert into arena_partidas (campeonato_id, rodada, posicao, status)
            values (campeonato_id_input, rodada_atual, i, 'bloqueada');
        end loop;
    end loop;

    -- Liga cada partida (exceto as da rodada final) à próxima.
    for rodada_atual in 1..(total_rodadas - 1) loop
        partidas_na_rodada := tamanho_chave / (2 ^ rodada_atual);
        for i in 1..partidas_na_rodada loop
            select id into id_partida_atual
                from arena_partidas
                where campeonato_id = campeonato_id_input and rodada = rodada_atual and posicao = i;
            select id into id_partida_proxima
                from arena_partidas
                where campeonato_id = campeonato_id_input and rodada = rodada_atual + 1 and posicao = ceil(i / 2.0);

            update arena_partidas
            set proxima_partida_id = id_partida_proxima,
                slot_na_proxima = case when i % 2 = 1 then 'a' else 'b' end
            where id = id_partida_atual;
        end loop;
    end loop;

    -- Preenche a rodada 1 a partir da ordem de semeadura: a partida de
    -- posição p ocupa os slots (2p-1, 2p) dessa ordem. Um "seed" acima do
    -- total de participantes reais é uma folga (null) — e como a ordem já
    -- é desenhada pra espalhar os extremos, as folgas saem distribuídas
    -- pelo chaveamento inteiro, não empilhadas nas primeiras partidas.
    for id_partida_atual, posicao_atual in
        select id, posicao from arena_partidas
        where campeonato_id = campeonato_id_input and rodada = 1
        order by posicao
    loop
        seed_a := ordem_seed[2 * posicao_atual - 1];
        seed_b := ordem_seed[2 * posicao_atual];
        part_a := case when seed_a <= total_participantes then ids_ordenados[seed_a] else null end;
        part_b := case when seed_b <= total_participantes then ids_ordenados[seed_b] else null end;

        if part_a is not null and part_b is not null then
            update arena_partidas
            set participante_a_id = part_a, participante_b_id = part_b, status = 'aguardando'
            where id = id_partida_atual;
        else
            -- Pelo menos um lado é folga (ou, no limite, os dois — só
            -- aconteceria se total_participantes fosse menor que
            -- tamanho_chave/2, impossível dado como tamanho_chave é
            -- calculado). coalesce garante que o participante real (se
            -- houver) sempre cai no slot A.
            update arena_partidas
            set participante_a_id = coalesce(part_a, part_b), participante_b_id = null, status = 'bloqueada'
            where id = id_partida_atual;
        end if;
    end loop;

    -- Resolve as folgas: quem ficou sozinho na partida já "vence" sem
    -- jogar, e avança pro slot certo da rodada 2 (toda folga acontece na
    -- rodada 1, então nunca é a final — proxima_partida_id sempre existe
    -- aqui).
    for id_partida_atual, id_partida_proxima, slot_destino in
        select id, proxima_partida_id, slot_na_proxima from arena_partidas
        where campeonato_id = campeonato_id_input and rodada = 1
          and participante_a_id is not null and participante_b_id is null
    loop
        update arena_partidas
        set status = 'encerrada',
            vencedor_id = (select participante_a_id from arena_partidas where id = id_partida_atual)
        where id = id_partida_atual;

        if slot_destino = 'a' then
            update arena_partidas
            set participante_a_id = (select vencedor_id from arena_partidas where id = id_partida_atual)
            where id = id_partida_proxima;
        else
            update arena_partidas
            set participante_b_id = (select vencedor_id from arena_partidas where id = id_partida_atual)
            where id = id_partida_proxima;
        end if;

        update arena_partidas
        set status = 'aguardando'
        where id = id_partida_proxima
          and participante_a_id is not null
          and participante_b_id is not null
          and status = 'bloqueada';
    end loop;

    update arena_campeonatos set status = 'em_andamento' where id = campeonato_id_input;
end;
$$;

revoke all on function public.arena_sortear_chaveamento(uuid) from public;
grant execute on function public.arena_sortear_chaveamento(uuid) to authenticated;

-- ============================================================
-- Verificação
-- ============================================================
-- 1) Com um campeonato de 17 participantes (chaveamento de 32, 15
--    folgas), rodar select arena_sortear_chaveamento('<id>') de novo
--    (precisa primeiro apagar/resetar as partidas desse campeonato se já
--    tinha sorteado antes com a versão velha — só funciona se nada foi
--    jogado ainda).
-- 2) Conferir visualmente em arena.html: as folgas devem aparecer
--    espalhadas pela rodada 1 inteira, não todas empilhadas num canto —
--    cada "bloco" de confrontos reais vs. folgas deve se repetir de forma
--    parecida ao longo da rodada, não só nas primeiras partidas.
-- 3) Repetir com um número bem pequeno (ex: 3 participantes, chaveamento
--    de 4, 1 folga) e conferir que ainda funciona normal.

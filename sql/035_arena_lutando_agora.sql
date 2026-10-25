-- Execute este script no SQL Editor do Supabase (Dashboard > SQL Editor).
-- Depende de sql/033_arena.sql já ter sido aplicado.
--
-- Adiciona um sinalizador manual "Lutando agora" (em_destaque) em
-- arena_partidas, independente do status 'ao_vivo' — esse já existia mas
-- só liga sozinho depois que alguém marca o primeiro ponto (um placar
-- parcial > 0 já indica "tá rolando"); em_destaque é pro admin marcar o
-- card como "isso aqui é o combate que a galera devia estar vendo agora"
-- mesmo em 0-0, ex: anunciou na live que a luta começou mas ninguém
-- pontuou ainda. Pode ter várias partidas com em_destaque = true ao mesmo
-- tempo (sem exclusividade, de propósito — múltiplas mesas/streams).
--
-- Sem RLS nova: a policy "Admins gerenciam partidas" (sql/033) já é
-- `for all`, então o admin já pode marcar/desmarcar direto da tela, sem
-- precisar de função nova. A leitura pública também já é liberada.

alter table public.arena_partidas
    add column if not exists em_destaque boolean not null default false;

-- Ajuste em arena_registrar_resultado: ao fechar uma partida com
-- vencedor definido, desliga em_destaque automaticamente (a luta acabou,
-- não faz mais sentido continuar "em destaque"). O resto da função é
-- idêntico ao de sql/033 — só essa UPDATE ganhou um campo a mais.
create or replace function public.arena_registrar_resultado(
    partida_id_input uuid,
    vitorias_a_input int,
    vitorias_b_input int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    partida record;
    campeonato record;
    vitorias_necessarias int;
    vencedor_novo uuid;
    vencedor_antigo uuid;
    perdedor_novo uuid;
    perdedor_antigo uuid;
    eh_final boolean;
    proxima record;
begin
    if not is_admin() then
        raise exception 'Apenas administradores podem lançar resultados.';
    end if;

    if vitorias_a_input < 0 or vitorias_b_input < 0 then
        raise exception 'Vitórias não podem ser negativas.';
    end if;

    select * into partida from arena_partidas where id = partida_id_input for update;
    if partida is null then
        raise exception 'Partida não encontrada.';
    end if;

    if partida.participante_a_id is null or partida.participante_b_id is null then
        raise exception 'Esta partida ainda não tem os dois combatentes definidos.';
    end if;

    select * into campeonato from arena_campeonatos where id = partida.campeonato_id;
    vitorias_necessarias := ceil(campeonato.melhor_de / 2.0);

    if vitorias_a_input >= vitorias_necessarias then
        vencedor_novo := partida.participante_a_id;
    elsif vitorias_b_input >= vitorias_necessarias then
        vencedor_novo := partida.participante_b_id;
    else
        vencedor_novo := null;
    end if;

    vencedor_antigo := partida.vencedor_id;
    eh_final := partida.proxima_partida_id is null;

    if vencedor_antigo is not null and vencedor_antigo is distinct from vencedor_novo then
        if partida.proxima_partida_id is not null then
            select * into proxima from arena_partidas where id = partida.proxima_partida_id for update;

            if proxima.status in ('ao_vivo', 'encerrada') then
                raise exception 'Não é possível corrigir: a próxima partida já começou.';
            end if;

            if partida.slot_na_proxima = 'a' then
                update arena_partidas set participante_a_id = null, status = 'bloqueada', atualizado_em = now()
                    where id = proxima.id;
            else
                update arena_partidas set participante_b_id = null, status = 'bloqueada', atualizado_em = now()
                    where id = proxima.id;
            end if;
        end if;

        perdedor_antigo := case
            when vencedor_antigo = partida.participante_a_id then partida.participante_b_id
            else partida.participante_a_id
        end;

        update arena_participantes set status = 'na_disputa'
            where id in (vencedor_antigo, perdedor_antigo);
    end if;

    update arena_partidas
    set vitorias_a = vitorias_a_input,
        vitorias_b = vitorias_b_input,
        vencedor_id = vencedor_novo,
        status = case when vencedor_novo is not null then 'encerrada' else 'ao_vivo' end,
        -- Luta decidida: desliga "Lutando agora" sozinho. Enquanto ainda
        -- não tem vencedor, não mexe no valor (deixa o admin controlar).
        em_destaque = case when vencedor_novo is not null then false else em_destaque end,
        atualizado_em = now()
    where id = partida_id_input;

    if vencedor_novo is not null then
        perdedor_novo := case
            when vencedor_novo = partida.participante_a_id then partida.participante_b_id
            else partida.participante_a_id
        end;

        if eh_final then
            update arena_participantes set status = 'campeao' where id = vencedor_novo;
            update arena_participantes set status = 'vice' where id = perdedor_novo;
            update arena_campeonatos set status = 'encerrado' where id = partida.campeonato_id;
        else
            update arena_participantes set status = 'eliminado' where id = perdedor_novo;

            if partida.proxima_partida_id is not null then
                if partida.slot_na_proxima = 'a' then
                    update arena_partidas set participante_a_id = vencedor_novo, atualizado_em = now()
                        where id = partida.proxima_partida_id;
                else
                    update arena_partidas set participante_b_id = vencedor_novo, atualizado_em = now()
                        where id = partida.proxima_partida_id;
                end if;

                update arena_partidas
                set status = 'aguardando'
                where id = partida.proxima_partida_id
                  and participante_a_id is not null
                  and participante_b_id is not null
                  and status = 'bloqueada';
            end if;
        end if;
    end if;
end;
$$;

revoke all on function public.arena_registrar_resultado(uuid, int, int) from public;
grant execute on function public.arena_registrar_resultado(uuid, int, int) to authenticated;

-- Execute este script no SQL Editor do Supabase (Dashboard > SQL Editor).
--
-- Módulo "Arena": campeonatos PvP 1v1 de WoW Classic, dentro da Órbita.
-- Multi-campeonato desde o início (não é um caso especial hardcoded pro
-- campeonato da guilda BraZug, mesmo sendo o primeiro uso). Três tabelas
-- novas (campeonatos, participantes, partidas) + uma tabela separada só
-- pro contato de Discord dos participantes (ver PROBLEMA/SOLUÇÃO abaixo) +
-- duas funções SQL (sorteio de chaveamento e lançamento de resultado) +
-- Realtime habilitado em `arena_partidas`/`arena_participantes` (primeiro
-- uso de Realtime neste projeto — não havia precedente a seguir aqui).
--
-- PROBLEMA (discord não pode ser público): `arena_participantes` precisa
-- de leitura pública (anon) pra alimentar a página /arena/:slug sem login,
-- mas o campo de contato (Discord) do combatente não deveria sair nessa
-- leitura pública. Em vez de uma view (que em Postgres roda com os
-- privilégios do DONO da view sobre a tabela base, não necessariamente
-- aplicando RLS do jeito esperado sem cuidado extra com security_invoker),
-- a solução mais simples e no mesmo estilo de policy direta já usado no
-- resto do projeto (ex: "Publico le fotos aprovadas") é uma tabela
-- separada `arena_participantes_contato`, 1:1 com `arena_participantes`,
-- só legível/gravável por admin. `arena_participantes` em si não tem
-- nenhuma coluna de contato.

-- ============================================================
-- 1) arena_campeonatos
-- ============================================================
create table if not exists public.arena_campeonatos (
    id uuid primary key default gen_random_uuid(),
    slug text not null,
    nome text not null,
    organizador text,
    regiao text,
    reino_padrao text,
    -- Namespace da API da Blizzard a usar pra esse campeonato (ex:
    -- "dynamic-classic1x-us") — deliberadamente configurável por campeonato
    -- em vez de uma constante fixa no código, porque a versão do Classic
    -- (Era, Hardcore, temporada de descoberta, etc.) muda o namespace.
    namespace_blizzard text,
    -- "Melhor de N" — o N aqui (ex: 3), não a quantidade de vitórias
    -- necessárias (que é ceil(N/2), calculado em arena_registrar_resultado).
    melhor_de int not null default 3 check (melhor_de > 0 and melhor_de % 2 = 1),
    status text not null default 'inscricoes'
        check (status in ('inscricoes', 'em_andamento', 'encerrado')),
    data_final date,
    premio text,
    max_participantes int,
    link_live text,
    criado_em timestamptz not null default now()
);

-- Mesmo padrão de slug único de concursos.slug (sql/022): coluna texto
-- comum + índice único separado, não um "unique" inline na coluna.
create unique index if not exists arena_campeonatos_slug_idx
    on public.arena_campeonatos (slug);

alter table public.arena_campeonatos enable row level security;

drop policy if exists "Publico le campeonatos" on public.arena_campeonatos;
create policy "Publico le campeonatos"
    on public.arena_campeonatos for select
    to anon, authenticated
    using (true);

drop policy if exists "Admins gerenciam campeonatos" on public.arena_campeonatos;
create policy "Admins gerenciam campeonatos"
    on public.arena_campeonatos for all
    to authenticated
    using (is_admin())
    with check (is_admin());

-- ============================================================
-- 2) arena_participantes (sem campo de contato — ver arena_participantes_contato)
-- ============================================================
create table if not exists public.arena_participantes (
    id uuid primary key default gen_random_uuid(),
    campeonato_id uuid not null references public.arena_campeonatos(id) on delete cascade,
    personagem text not null,
    reino text not null,
    regiao text,
    faccao text check (faccao in ('horda', 'alianca')),
    raca text,
    classe text,
    nivel int,
    guilda text,
    ilvl_medio numeric,
    avatar_url text,
    -- Resultado bruto da Edge Function blizzard-personagem, guardado pra
    -- não precisar rechamar a API só pra reexibir dado já buscado — e pra
    -- auditoria, se a API mudar de resposta entre uma sincronização e outra.
    dados_blizzard jsonb,
    sincronizado_em timestamptz,
    -- Posição de semeadura no chaveamento (menor = prioridade pra folga/
    -- "bye" quando o número de inscritos não é potência de 2). Null =
    -- participante entra no sorteio aleatório puro, sem posição fixa.
    seed int,
    status text not null default 'na_disputa'
        check (status in ('na_disputa', 'eliminado', 'campeao', 'vice')),
    criado_em timestamptz not null default now()
);

create index if not exists arena_participantes_campeonato_idx
    on public.arena_participantes (campeonato_id);

alter table public.arena_participantes enable row level security;

drop policy if exists "Publico le participantes" on public.arena_participantes;
create policy "Publico le participantes"
    on public.arena_participantes for select
    to anon, authenticated
    using (true);

drop policy if exists "Admins gerenciam participantes" on public.arena_participantes;
create policy "Admins gerenciam participantes"
    on public.arena_participantes for all
    to authenticated
    using (is_admin())
    with check (is_admin());

-- 2b) Contato — 1:1 com arena_participantes, só admin lê/escreve.
create table if not exists public.arena_participantes_contato (
    participante_id uuid primary key references public.arena_participantes(id) on delete cascade,
    discord text
);

alter table public.arena_participantes_contato enable row level security;

drop policy if exists "Admins leem contato" on public.arena_participantes_contato;
create policy "Admins leem contato"
    on public.arena_participantes_contato for select
    to authenticated
    using (is_admin());

drop policy if exists "Admins gravam contato" on public.arena_participantes_contato;
create policy "Admins gravam contato"
    on public.arena_participantes_contato for all
    to authenticated
    using (is_admin())
    with check (is_admin());

-- ============================================================
-- 3) arena_partidas
-- ============================================================
create table if not exists public.arena_partidas (
    id uuid primary key default gen_random_uuid(),
    campeonato_id uuid not null references public.arena_campeonatos(id) on delete cascade,
    -- 1 = primeira rodada (ex: "quartas"), crescente até a final.
    rodada int not null,
    -- Posição da partida dentro da própria rodada (1, 2, 3...) — junto com
    -- `rodada`, endereça a partida no desenho do chaveamento.
    posicao int not null,
    participante_a_id uuid references public.arena_participantes(id),
    participante_b_id uuid references public.arena_participantes(id),
    vitorias_a int not null default 0,
    vitorias_b int not null default 0,
    vencedor_id uuid references public.arena_participantes(id),
    status text not null default 'bloqueada'
        check (status in ('bloqueada', 'aguardando', 'ao_vivo', 'encerrada')),
    -- Pra onde o vencedor desta partida avança. Null na partida final.
    proxima_partida_id uuid references public.arena_partidas(id),
    slot_na_proxima text check (slot_na_proxima in ('a', 'b')),
    atualizado_em timestamptz not null default now()
);

create unique index if not exists arena_partidas_posicao_idx
    on public.arena_partidas (campeonato_id, rodada, posicao);
create index if not exists arena_partidas_proxima_idx
    on public.arena_partidas (proxima_partida_id);

alter table public.arena_partidas enable row level security;

drop policy if exists "Publico le partidas" on public.arena_partidas;
create policy "Publico le partidas"
    on public.arena_partidas for select
    to anon, authenticated
    using (true);

-- Admin pode mexer direto na tabela (ex: marcar "ao_vivo" manualmente),
-- mas o LANÇAMENTO DE RESULTADO deve passar por
-- arena_registrar_resultado() — é ela que mantém o chaveamento consistente
-- (propagação de vencedor, eliminação, campeão/vice). Mexer direto em
-- vitorias_a/vitorias_b/vencedor_id pela RLS funciona, mas não propaga
-- nada sozinho.
drop policy if exists "Admins gerenciam partidas" on public.arena_partidas;
create policy "Admins gerenciam partidas"
    on public.arena_partidas for all
    to authenticated
    using (is_admin())
    with check (is_admin());

-- ============================================================
-- 4) Realtime — primeiro uso neste projeto, sem convenção prévia a seguir.
--    Idempotente: só adiciona a tabela à publication se ainda não estiver.
-- ============================================================
do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'arena_partidas'
    ) then
        alter publication supabase_realtime add table public.arena_partidas;
    end if;

    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'arena_participantes'
    ) then
        alter publication supabase_realtime add table public.arena_participantes;
    end if;
end $$;

-- ============================================================
-- 5) arena_registrar_resultado(partida_id, vitorias_a, vitorias_b)
--
-- Atualiza o placar de uma partida numa única transação:
--   - se ninguém atingiu o nº de vitórias necessário pro "melhor de N" do
--     campeonato, só grava o placar parcial (partida "ao_vivo");
--   - se alguém atingiu, fecha a partida, marca o perdedor como eliminado
--     (ou vice-campeão, se for a final), marca o vencedor como campeão se
--     for a final, e preenche o slot certo da próxima partida;
--   - permite CORRIGIR um resultado já lançado: se o vencedor calculado
--     agora é diferente do que já estava gravado, desfaz a propagação
--     anterior (limpa o slot que tinha sido preenchido na próxima partida,
--     e devolve os dois participantes pro status "na_disputa") antes de
--     aplicar o resultado novo — mas SÓ se a próxima partida ainda não
--     começou (sem placar e sem status ao_vivo/encerrada); se já começou,
--     recusa a correção com uma mensagem clara, pra não precisar desfazer
--     em cascata partidas que já aconteceram.
-- ============================================================
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

    -- Correção: o vencedor mudou (inclusive pra "ninguém ainda", se o
    -- placar foi reduzido abaixo do necessário) em cima de um resultado
    -- que já tinha sido gravado antes.
    if vencedor_antigo is not null and vencedor_antigo is distinct from vencedor_novo then
        if partida.proxima_partida_id is not null then
            select * into proxima from arena_partidas where id = partida.proxima_partida_id for update;

            if proxima.status in ('ao_vivo', 'encerrada') then
                raise exception 'Não é possível corrigir: a próxima partida já começou.';
            end if;

            -- Limpa o slot que esta partida tinha preenchido na próxima.
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

        -- Devolve os dois pro estado "na disputa", desfazendo eliminação/
        -- campeão/vice que o resultado antigo tinha causado.
        update arena_participantes set status = 'na_disputa'
            where id in (vencedor_antigo, perdedor_antigo);
    end if;

    update arena_partidas
    set vitorias_a = vitorias_a_input,
        vitorias_b = vitorias_b_input,
        vencedor_id = vencedor_novo,
        status = case when vencedor_novo is not null then 'encerrada' else 'ao_vivo' end,
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

-- ============================================================
-- 6) arena_sortear_chaveamento(campeonato_id)
--
-- Gera o chaveamento inteiro de um campeonato: monta o "esqueleto" de
-- todas as rodadas (até a final), distribui os participantes na primeira
-- rodada (por seed quando houver, aleatório pro resto) e completa com
-- "bye" (folga) quando o nº de inscritos não é potência de 2 — quem tira
-- bye já avança pra 2ª rodada sem jogar a 1ª.
--
-- Bloqueia novo sorteio se já existe alguma partida com placar lançado ou
-- em andamento/encerrada — nesse caso o chaveamento já está "em uso" e
-- resortear destruiria resultado real. Antes disso (campeonato ainda só
-- com o esqueleto de um sorteio anterior, nada jogado), permite resortear
-- — apaga o chaveamento velho e gera outro.
-- ============================================================
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
    qtd_byes int;
    ids_ordenados uuid[];
    rodada_atual int;
    partidas_na_rodada int;
    i int;
    ponteiro int;
    id_partida_atual uuid;
    posicao_atual int;
    id_partida_proxima uuid;
    slot_destino text;
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
    qtd_byes := tamanho_chave - total_participantes;

    -- Ordena: quem tem seed vem primeiro (menor seed primeiro — prioridade
    -- pra folga), o resto embaralhado por random().
    select array_agg(id order by (seed is null), seed, random())
    into ids_ordenados
    from arena_participantes
    where campeonato_id = campeonato_id_input;

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

    -- Preenche a rodada 1: as primeiras `qtd_byes` partidas (na ordem de
    -- posição) recebem só 1 participante (o resto fica null = folga); os
    -- primeiros da lista ordenada são quem tira a folga (prioridade de
    -- seed/sorteio). As partidas restantes recebem 2 participantes cada,
    -- confronto normal.
    ponteiro := 1;
    for id_partida_atual, posicao_atual in
        select id, posicao from arena_partidas
        where campeonato_id = campeonato_id_input and rodada = 1
        order by posicao
    loop
        if posicao_atual <= qtd_byes then
            update arena_partidas
            set participante_a_id = ids_ordenados[ponteiro],
                participante_b_id = null,
                status = 'bloqueada'
            where id = id_partida_atual;
            ponteiro := ponteiro + 1;
        else
            update arena_partidas
            set participante_a_id = ids_ordenados[ponteiro],
                participante_b_id = ids_ordenados[ponteiro + 1],
                status = 'aguardando'
            where id = id_partida_atual;
            ponteiro := ponteiro + 2;
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
-- Verificação (rodar manualmente depois de aplicar este script)
-- ============================================================
-- 1) Criar 1 campeonato de teste e 5 participantes nele (INSERT manual).
-- 2) select arena_sortear_chaveamento('<id do campeonato>');
--    Conferir: 3 rodadas (8→4→2→1 vira 8/4/2/1 partidas, mas com 5
--    participantes é 4/2/1), 3 "byes" resolvidos automaticamente na
--    rodada 1 (status 'encerrada' sem ninguém jogar), e os vencedores das
--    folgas já aparecendo como participante_a_id/b_id na rodada 2.
-- 3) select arena_registrar_resultado('<id de uma partida aguardando>', 2, 1);
--    Com melhor_de=3 (padrão), 2 vitórias já fecha a partida — conferir
--    status='encerrada', vencedor_id certo, perdedor virou 'eliminado', e
--    o slot certo da próxima partida foi preenchido.
-- 4) Repetir o passo 3 na mesma partida com um vencedor DIFERENTE (ex: 1, 2
--    em vez de 2, 1) — conferir que corrige: o slot da próxima partida que
--    tinha sido preenchido volta pra null, e os dois voltam pra
--    'na_disputa' antes do novo resultado ser aplicado.
-- 5) Tentar select arena_sortear_chaveamento(...) de novo no mesmo
--    campeonato — deve recusar com "Já existem resultados lançados...".

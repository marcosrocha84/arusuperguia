-- Execute este script no SQL Editor do Supabase.
--
-- Hoje o botão "Excluir" de um concurso (curadoria.html > Concursos) existe
-- na tela, mas falha com erro de foreign key pra qualquer concurso que já
-- tenha foto enviada — fotos_concurso.concurso_id referencia concursos(id)
-- sem "on delete cascade" (criado direto no painel, fora do histórico de
-- migrations, por isso o nome exato da constraint é desconhecido; este
-- script descobre o nome sozinho via information_schema antes de recriar).
--
-- Mudanças:
--   1) fotos_concurso.concurso_id -> concursos(id): CASCADE (apagar o
--      concurso apaga as fotos vinculadas)
--   2) votos_realizados.foto_id -> fotos_concurso(id): CASCADE (senão o
--      cascade acima esbarraria nos votos ao tentar apagar uma foto)
--   3) campanhas_marketing.concurso_id -> concursos(id): SET NULL (em vez
--      de apagar o histórico de campanhas já enviadas, só desvincula do
--      concurso removido — o próprio código já trata concurso_id null como
--      "campanha pra toda a base opt-in", então isso não quebra nada)
--
-- IMPORTANTE: apagar as linhas de fotos_concurso no banco NÃO apaga os
-- arquivos de imagem no Storage (bucket orbita-fotos) — isso é feito à
-- parte, pelo front-end, antes de chamar o delete do concurso (ver
-- mudança em app.js, função excluirConcurso).

do $$
declare
    nome_constraint text;
begin
    -- 1) fotos_concurso.concurso_id -> concursos(id)
    select tc.constraint_name into nome_constraint
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name
        and tc.table_schema = kcu.table_schema
    where tc.table_schema = 'public'
        and tc.table_name = 'fotos_concurso'
        and tc.constraint_type = 'FOREIGN KEY'
        and kcu.column_name = 'concurso_id';

    if nome_constraint is not null then
        execute format('alter table public.fotos_concurso drop constraint %I', nome_constraint);
    end if;

    alter table public.fotos_concurso
        add constraint fotos_concurso_concurso_id_fkey
        foreign key (concurso_id) references public.concursos(id) on delete cascade;

    -- 2) votos_realizados.foto_id -> fotos_concurso(id)
    select tc.constraint_name into nome_constraint
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name
        and tc.table_schema = kcu.table_schema
    where tc.table_schema = 'public'
        and tc.table_name = 'votos_realizados'
        and tc.constraint_type = 'FOREIGN KEY'
        and kcu.column_name = 'foto_id';

    if nome_constraint is not null then
        execute format('alter table public.votos_realizados drop constraint %I', nome_constraint);
    end if;

    alter table public.votos_realizados
        add constraint votos_realizados_foto_id_fkey
        foreign key (foto_id) references public.fotos_concurso(id) on delete cascade;

    -- 3) campanhas_marketing.concurso_id -> concursos(id)
    select tc.constraint_name into nome_constraint
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name
        and tc.table_schema = kcu.table_schema
    where tc.table_schema = 'public'
        and tc.table_name = 'campanhas_marketing'
        and tc.constraint_type = 'FOREIGN KEY'
        and kcu.column_name = 'concurso_id';

    if nome_constraint is not null then
        execute format('alter table public.campanhas_marketing drop constraint %I', nome_constraint);
    end if;

    alter table public.campanhas_marketing
        add constraint campanhas_marketing_concurso_id_fkey
        foreign key (concurso_id) references public.concursos(id) on delete set null;
end $$;

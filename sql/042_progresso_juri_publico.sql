-- Execute este script no SQL Editor do Supabase, depois do
-- sql/041_concursos_criterios_leitura_jurado.sql já ter sido aplicado.
--
-- Concursos em modo júri não têm votação pública, então votacao.html
-- precisa de uma forma alternativa de "acompanhar" o concurso: em vez de
-- votar, o público vê quantos jurados já avaliaram cada foto — sem nunca
-- expor a nota em si nem o ranking (decisão do organizador: só progresso,
-- nenhuma nota enquanto o concurso está em andamento, pra não pressionar
-- os jurados nem gerar contestação nota a nota).
--
-- fotos_notas tem RLS que só libera leitura pro próprio jurado ou pra
-- admin (sql/040) — de propósito, pra não vazar notas. Por isso essa
-- contagem não pode vir de uma view comum lida direto pelo público: ela
-- sempre voltaria vazia pra quem não é jurado/admin. A solução é uma
-- função security definer que calcula só a CONTAGEM de jurados que
-- avaliaram cada foto (nunca a nota), e essa sim pode ser liberada pra
-- anon/authenticated.
create or replace function public.progresso_juri(p_concurso_id uuid)
returns table(foto_id uuid, jurados_avaliaram int, total_jurados int)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
    v_total_criterios int;
    v_total_jurados int;
begin
    select count(*) into v_total_criterios
    from public.concursos_criterios c
    where c.concurso_id = p_concurso_id;

    select count(*) into v_total_jurados
    from public.concursos_jurados j
    where j.concurso_id = p_concurso_id;

    return query
    with notas_por_foto_jurado as (
        select n.foto_id, n.jurado_email, count(*) as qtd_criterios_feitos
        from public.fotos_notas n
        join public.concursos_criterios c on c.id = n.criterio_id
        where c.concurso_id = p_concurso_id
        group by n.foto_id, n.jurado_email
    )
    select
        f.id as foto_id,
        -- só conta um jurado como "avaliou essa foto" quando ele já deu
        -- nota em TODOS os critérios do concurso pra ela, não em parte.
        coalesce(count(npj.jurado_email) filter (where npj.qtd_criterios_feitos = v_total_criterios), 0)::int as jurados_avaliaram,
        v_total_jurados as total_jurados
    from public.fotos_concurso f
    left join notas_por_foto_jurado npj on npj.foto_id = f.id
    where f.concurso_id = p_concurso_id
      and f.aprovada = true
    group by f.id;
end;
$$;

revoke all on function public.progresso_juri(uuid) from public;
grant execute on function public.progresso_juri(uuid) to anon, authenticated;

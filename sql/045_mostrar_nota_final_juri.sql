-- Novo parâmetro por concurso: exibir ou não a média final do júri na
-- página pública de votação, depois do concurso encerrado. Por padrão
-- fica desligado (mantém o comportamento atual: só progresso, sem nota —
-- decisão já tomada antes). O curador liga isso concurso a concurso.
alter table public.concursos
    add column if not exists mostrar_nota_final_juri boolean not null default false;

-- Função pública (security definer) que só devolve a nota final de cada
-- foto quando as DUAS condições valem pro concurso: já está encerrado E
-- o curador ligou "mostrar_nota_final_juri". Checagem feita dentro da
-- própria função (não só no front) — chamar isso direto, sem as duas
-- condições, devolve conjunto vazio. Reaproveita vw_resultado_juri, que
-- por sua vez roda com os privilégios de quem definiu a function (mesmo
-- padrão de progresso_juri, sql/042), então bypassa a RLS de fotos_notas
-- sem expor nota nenhuma crua.
create or replace function public.resultado_juri_publico(p_concurso_id uuid)
returns table(foto_id uuid, nota_final numeric)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
    v_pode_exibir boolean;
begin
    select (c.encerrado and c.mostrar_nota_final_juri)
      into v_pode_exibir
      from public.concursos c
      where c.id = p_concurso_id;

    if not coalesce(v_pode_exibir, false) then
        return;
    end if;

    return query
    select v.foto_id, v.nota_final
    from public.vw_resultado_juri v
    where v.concurso_id = p_concurso_id;
end;
$$;

revoke all on function public.resultado_juri_publico(uuid) from public;
grant execute on function public.resultado_juri_publico(uuid) to anon, authenticated;

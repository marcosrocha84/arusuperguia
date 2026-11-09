-- Conta quantas fotos de concursos de júri (aprovadas, fora de modo_teste)
-- já receberam pelo menos uma nota de algum jurado, em qualquer critério.
-- Usado só pela barra de números de criadores.html, pra substituir "votos
-- registrados" por uma métrica equivalente no modo júri, sem expor nenhuma
-- nota individual (fotos_notas tem RLS restrita por jurado/admin) — mesmo
-- cuidado de design já aplicado em progresso_juri (sql/042).
create or replace function public.stat_fotos_avaliadas_juri()
returns integer
language sql
security definer
set search_path = public
stable
as $$
    select count(distinct n.foto_id)::int
    from public.fotos_notas n
    join public.fotos_concurso f on f.id = n.foto_id
    join public.concursos c on c.id = f.concurso_id
    where f.aprovada = true
      and c.modo_teste = false
      and c.modo_votacao = 'juri';
$$;

revoke all on function public.stat_fotos_avaliadas_juri() from public;
grant execute on function public.stat_fotos_avaliadas_juri() to anon, authenticated;

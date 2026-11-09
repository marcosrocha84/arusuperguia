-- Execute este script no SQL Editor do Supabase, depois do
-- sql/040_concursos_jurados.sql já ter sido aplicado.
--
-- BUG: concursos_criterios só tinha a policy "Admins gerenciam criterios"
-- (restrita a is_admin()) — não existia nenhuma policy de SELECT para
-- jurados. Resultado: jurado.html consultava a tabela sem erro nenhum,
-- mas a RLS filtrava tudo silenciosamente e devolvia lista vazia, fazendo
-- a tela mostrar "Este concurso ainda não tem critérios de avaliação
-- cadastrados." mesmo com os critérios cadastrados certinho na curadoria.
--
-- Mesmo princípio das outras policies de jurado em sql/040: só pode ler
-- os critérios de um concurso em que o próprio e-mail está convidado
-- (is_jurado(concurso_id)), nunca os de outro concurso qualquer.

drop policy if exists "Jurado le criterios do seu concurso" on public.concursos_criterios;
create policy "Jurado le criterios do seu concurso"
    on public.concursos_criterios for select
    to authenticated
    using (public.is_jurado(concurso_id));

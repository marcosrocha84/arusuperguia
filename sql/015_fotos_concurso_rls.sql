-- Execute este script no SQL Editor do Supabase, depois de
-- sql/014_admins_e_rls.sql já ter sido aplicado (precisa da função
-- is_admin() definida lá).
--
-- fotos_concurso não tinha nenhuma policy própria — o que quase certamente
-- significa que Row Level Security nunca foi habilitado nessa tabela. Sem
-- RLS, a tabela fica 100% aberta pela API: qualquer pessoa com a chave
-- anônima (pública, embutida em supabase-client.js) consegue ler, atualizar
-- "aprovada" ou até excluir fotos direto do DevTools, sem login nenhum. Este
-- script fecha isso.
--
-- Rode primeiro, se quiser confirmar o diagnóstico:
--   select relrowsecurity from pg_class where relname = 'fotos_concurso';
--   (false = RLS desligado = tabela aberta hoje)

alter table public.fotos_concurso enable row level security;

-- Leitura pública: só fotos já aprovadas (usado por index.html e
-- votacao.html, tanto por visitantes anônimos quanto logados).
drop policy if exists "Publico le fotos aprovadas" on public.fotos_concurso;
create policy "Publico le fotos aprovadas"
    on public.fotos_concurso for select
    to anon, authenticated
    using (aprovada = true);

-- Leitura administrativa: admin vê tudo, inclusive pendentes (tela de
-- moderação em curadoria.html). Como o Postgres combina policies
-- permissivas do mesmo comando com OR, isso soma com a policy pública
-- acima em vez de substituí-la.
drop policy if exists "Admins leem todas as fotos" on public.fotos_concurso;
create policy "Admins leem todas as fotos"
    on public.fotos_concurso for select
    to authenticated
    using (is_admin());

-- Aprovar/desaprovar (alterarStatusFoto em app.js).
drop policy if exists "Admins atualizam fotos" on public.fotos_concurso;
create policy "Admins atualizam fotos"
    on public.fotos_concurso for update
    to authenticated
    using (is_admin())
    with check (is_admin());

-- Reprovar/excluir (deletarFoto em app.js).
drop policy if exists "Admins excluem fotos" on public.fotos_concurso;
create policy "Admins excluem fotos"
    on public.fotos_concurso for delete
    to authenticated
    using (is_admin());

-- Nenhuma policy de INSERT é criada de propósito: o único caminho para
-- inserir uma foto continua sendo a Edge Function "enviar-foto", que usa a
-- Service Role Key (ignora RLS) só depois de validar o captcha — ver
-- sql/002_bloquear_insert_direto.sql.

-- IMPORTANTE: a função votar_em_foto (sql/001_votar_em_foto.sql) roda como
-- "security definer", então o UPDATE que ela faz na coluna "votos" continua
-- funcionando normalmente mesmo com RLS habilitado agora — ela não passa
-- pelas policies acima.

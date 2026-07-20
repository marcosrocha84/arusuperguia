-- Execute este script no SQL Editor do Supabase, depois do
-- sql/003_concursos.sql já ter sido aplicado.
--
-- Cria o vínculo entre fotos_concurso e concursos: cada foto enviada passa
-- a pertencer a um concurso cultural específico (a Edge Function
-- "enviar-foto" grava o concurso ativo no momento do envio — ver
-- supabase/functions/enviar-foto/index.ts).

alter table public.fotos_concurso
    add column if not exists concurso_id uuid references public.concursos(id);

create index if not exists fotos_concurso_concurso_id_idx
    on public.fotos_concurso (concurso_id);

-- Garante, no próprio banco, que só pode existir 1 concurso ativo por vez.
-- Reforça a mesma regra que a Edge Function "enviar-foto" já valida — assim
-- o admin já é barrado na tela de Concursos ao tentar ativar um segundo
-- concurso, em vez de só descobrir o problema quando alguém tenta enviar
-- uma foto.
create unique index if not exists concursos_unico_ativo
    on public.concursos ((ativo))
    where ativo = true;

-- Permite leitura pública (papel "anon") da tabela concursos.
-- Necessário porque votacao.html precisa descobrir qual é o concurso ativo
-- e filtrar as fotos por ele mesmo para visitantes que ainda não fizeram
-- login com o Google (a política de leitura criada em 003_concursos.sql
-- só cobria o papel "authenticated", usado no painel de curadoria).
create policy "Público pode ler concursos"
    on public.concursos for select
    to anon
    using (true);

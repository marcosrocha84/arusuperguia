-- Execute este script no SQL Editor do Supabase (Dashboard > SQL Editor).
-- Substitui o sentido do banner de opt-in em votacao.html: de "marketing
-- global" (preferencias_marketing, sql/020) para "quero saber o resultado
-- DESTE concurso" — que precisa de uma resposta por (usuário, concurso), não
-- mais uma resposta única e válida para sempre.

create table if not exists public.preferencias_resultado_concurso (
    user_id uuid not null references auth.users(id) on delete cascade,
    concurso_id uuid not null references public.concursos(id) on delete cascade,
    quer_resultado boolean not null default false,
    respondido_em timestamptz not null default now(),
    primary key (user_id, concurso_id)
);

alter table public.preferencias_resultado_concurso enable row level security;

-- Mesmo padrão de preferencias_marketing (sql/020): cada usuário autenticado
-- só lê/grava a própria linha. Não existe acesso público/anônimo, nem de um
-- usuário à preferência de outro.
create policy "Usuario le a propria preferencia de resultado"
    on public.preferencias_resultado_concurso for select
    to authenticated
    using (auth.uid() = user_id);

create policy "Usuario grava a propria preferencia de resultado"
    on public.preferencias_resultado_concurso for insert
    to authenticated
    with check (auth.uid() = user_id);

create policy "Usuario atualiza a propria preferencia de resultado"
    on public.preferencias_resultado_concurso for update
    to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

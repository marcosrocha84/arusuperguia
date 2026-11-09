-- Execute este script no SQL Editor do Supabase, depois do
-- sql/014_admins_e_rls.sql e sql/022_concursos_multiplos_ativos.sql já
-- terem sido aplicados (precisa da função is_admin() e da coluna
-- concursos.nome).
--
-- Cria a estrutura de "concurso com júri": um modo alternativo de concurso
-- onde, em vez da votação pública (historico.html/votacao.html), uma lista
-- fechada de jurados dá nota a cada foto aprovada, por critério com peso.
-- Decisões já confirmadas com o organizador:
--   - Critério com peso (não é uma nota única por jurado).
--   - Todas as fotos aprovadas precisam ser avaliadas por todos os
--     jurados (sem corte/shortlist por rodada).
--   - Só o júri decide o resultado — não existe votação pública paralela
--     num concurso em modo "juri".
--   - Acesso do jurado NÃO é exclusivo por Google: login por código
--     enviado por e-mail (Supabase Auth signInWithOtp/verifyOtp), e o
--     "convite" de jurado é por e-mail (tabela concursos_jurados), igual
--     ao padrão já usado para admins (sql/014) — ter uma sessão válida não
--     basta, o e-mail precisa estar cadastrado para aquele concurso.

-- 1) Concursos passam a ter um "modo de votação": "publico" (como sempre
--    foi, default, não quebra nenhum concurso existente) ou "juri".
alter table public.concursos
    add column if not exists modo_votacao text not null default 'publico';

alter table public.concursos
    add constraint if not exists concursos_modo_votacao_check
    check (modo_votacao in ('publico', 'juri'));

-- 2) Critérios de avaliação de um concurso em modo júri (ex: "Técnica" peso
--    3, "Originalidade" peso 2, "Aderência ao tema" peso 5). "peso" é
--    relativo entre critérios do mesmo concurso, não precisa somar 10/100.
create table if not exists public.concursos_criterios (
    id uuid primary key default gen_random_uuid(),
    concurso_id uuid not null references public.concursos(id) on delete cascade,
    nome text not null,
    peso numeric not null check (peso > 0),
    ordem smallint not null default 0,
    criado_em timestamptz not null default now()
);

create index if not exists concursos_criterios_concurso_idx
    on public.concursos_criterios (concurso_id);

alter table public.concursos_criterios enable row level security;

drop policy if exists "Admins gerenciam criterios" on public.concursos_criterios;
create policy "Admins gerenciam criterios"
    on public.concursos_criterios for all
    to authenticated
    using (is_admin())
    with check (is_admin());

-- 3) Lista de jurados convidados por concurso, pelo e-mail — igual ao
--    padrão de "admins" (sql/014): não exige que o jurado já tenha conta,
--    o cadastro aqui é que dá acesso, verificado contra o e-mail da sessão
--    atual (seja essa sessão vinda de login por código ou por Google).
create table if not exists public.concursos_jurados (
    concurso_id uuid not null references public.concursos(id) on delete cascade,
    email text not null,
    nome text,
    criado_em timestamptz not null default now(),
    primary key (concurso_id, email)
);

create index if not exists concursos_jurados_email_idx
    on public.concursos_jurados (lower(email));

alter table public.concursos_jurados enable row level security;

drop policy if exists "Admins gerenciam jurados" on public.concursos_jurados;
create policy "Admins gerenciam jurados"
    on public.concursos_jurados for all
    to authenticated
    using (is_admin())
    with check (is_admin());

-- Um jurado logado precisa conseguir ver em quais concursos ele próprio
-- está convidado (pra montar a lista "meus concursos" em jurado.html) —
-- mas só a própria linha, nunca a lista completa de jurados de outros.
drop policy if exists "Jurado ve seu proprio convite" on public.concursos_jurados;
create policy "Jurado ve seu proprio convite"
    on public.concursos_jurados for select
    to authenticated
    using (lower(email) = lower(auth.jwt()->>'email'));

-- 4) Função que diz se o usuário autenticado atual é jurado de um
--    concurso específico. security definer para poder ler
--    concursos_jurados mesmo sem a policy de "admin" acima dar acesso.
create or replace function public.is_jurado(p_concurso_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1 from public.concursos_jurados
        where concurso_id = p_concurso_id
          and lower(email) = lower(auth.jwt()->>'email')
    );
$$;

revoke all on function public.is_jurado(uuid) from public;
grant execute on function public.is_jurado(uuid) to authenticated;

-- 5) Notas: uma linha por (foto, critério, jurado). O jurado só enxerga e
--    só grava as PRÓPRIAS notas — nunca as de outro jurado (RLS, não só
--    esconder na tela). Nota de 0 a 10, com uma casa decimal de precisão
--    prática.
create table if not exists public.fotos_notas (
    id uuid primary key default gen_random_uuid(),
    foto_id uuid not null references public.fotos_concurso(id) on delete cascade,
    criterio_id uuid not null references public.concursos_criterios(id) on delete cascade,
    jurado_email text not null,
    nota numeric not null check (nota >= 0 and nota <= 10),
    criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),
    unique (foto_id, criterio_id, jurado_email)
);

create index if not exists fotos_notas_foto_idx on public.fotos_notas (foto_id);
create index if not exists fotos_notas_jurado_idx on public.fotos_notas (lower(jurado_email));

alter table public.fotos_notas enable row level security;

-- Jurado só lê as próprias notas, e só de fotos de concursos em que é
-- jurado convidado (dupla checagem: e-mail da nota E is_jurado do
-- concurso da foto — evita que um jurado "adivinhe" foto_id de outro
-- concurso e insira nota nela).
drop policy if exists "Jurado le suas notas" on public.fotos_notas;
create policy "Jurado le suas notas"
    on public.fotos_notas for select
    to authenticated
    using (
        lower(jurado_email) = lower(auth.jwt()->>'email')
        and exists (
            select 1 from public.fotos_concurso f
            where f.id = fotos_notas.foto_id
              and public.is_jurado(f.concurso_id)
        )
    );

drop policy if exists "Jurado grava suas notas" on public.fotos_notas;
create policy "Jurado grava suas notas"
    on public.fotos_notas for insert
    to authenticated
    with check (
        lower(jurado_email) = lower(auth.jwt()->>'email')
        and exists (
            select 1 from public.fotos_concurso f
            where f.id = fotos_notas.foto_id
              and f.aprovada = true
              and public.is_jurado(f.concurso_id)
        )
    );

drop policy if exists "Jurado atualiza suas notas" on public.fotos_notas;
create policy "Jurado atualiza suas notas"
    on public.fotos_notas for update
    to authenticated
    using (lower(jurado_email) = lower(auth.jwt()->>'email'))
    with check (
        lower(jurado_email) = lower(auth.jwt()->>'email')
        and exists (
            select 1 from public.fotos_concurso f
            where f.id = fotos_notas.foto_id
              and f.aprovada = true
              and public.is_jurado(f.concurso_id)
        )
    );

-- Leitura administrativa de todas as notas, só para exibir o resultado
-- agregado na curadoria — sem policy de update/delete para admin: a nota
-- em si é sempre do jurado, o admin só consulta.
drop policy if exists "Admins leem todas as notas" on public.fotos_notas;
create policy "Admins leem todas as notas"
    on public.fotos_notas for select
    to authenticated
    using (is_admin());

-- 6) View de resultado: nota final de cada foto = média, entre os
--    jurados que já avaliaram, da média ponderada dos critérios daquele
--    jurado para aquela foto. Cada jurado pesa igual entre si; dentro de
--    cada jurado, cada critério pesa conforme concursos_criterios.peso.
create or replace view public.vw_resultado_juri as
with nota_por_jurado as (
    select
        n.foto_id,
        n.jurado_email,
        sum(n.nota * c.peso) / sum(c.peso) as nota_ponderada
    from public.fotos_notas n
    join public.concursos_criterios c on c.id = n.criterio_id
    group by n.foto_id, n.jurado_email
)
select
    f.id as foto_id,
    f.concurso_id,
    f.nome_participante,
    count(npj.jurado_email) as jurados_avaliaram,
    avg(npj.nota_ponderada) as nota_final
from public.fotos_concurso f
left join nota_por_jurado npj on npj.foto_id = f.id
where f.aprovada = true
group by f.id, f.concurso_id, f.nome_participante;

-- A view roda com as permissões de quem a consulta (sem security_barrier
-- nem security definer), então continua respeitando a RLS de fotos_notas
-- acima: um admin autenticado vê a agregação de todo mundo (via "Admins
-- leem todas as notas"), e qualquer outra sessão não vê nota nenhuma de
-- ninguém e a view sai com jurados_avaliaram = 0 / nota_final = null para
-- todas as fotos. Não expor esta view a "anon" por engano é só não criar
-- policy nenhuma de leitura pública — RLS de fotos_notas já cobre o caso.
grant select on public.vw_resultado_juri to authenticated;

-- 7) Cadastro de jurados é manual aqui no SQL Editor (ou numa tela futura
--    de curadoria), igual ao fluxo de admins:
--
--    insert into public.concursos_jurados (concurso_id, email, nome)
--    values ('<id-do-concurso>', 'jurado@exemplo.com', 'Nome do Jurado');

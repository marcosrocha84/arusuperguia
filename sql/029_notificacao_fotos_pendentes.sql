-- Execute este script no SQL Editor do Supabase (Dashboard > SQL Editor),
-- DEPOIS de cadastrar o secret no Vault (passo obrigatório, ver comentário
-- antes do cron.schedule mais abaixo).
--
-- Agenda um aviso por e-mail de hora em hora (pg_cron), avisando os admins
-- quando há fotos pendentes de moderação (Edge Function
-- notificar-fotos-pendentes decide sozinha: só notifica dentro do horário
-- comercial e só quando o total pendente mudou desde o último aviso — ver
-- comentários no index.ts da function).

-- 1) Tabela de controle (1 linha só) — guarda o último total notificado,
--    pra função não mandar o mesmo aviso repetido enquanto nada muda.
create table if not exists public.controle_notificacao_pendentes (
    id smallint primary key default 1,
    ultimo_total_notificado integer not null default -1,
    notificado_em timestamptz,
    constraint controle_notificacao_pendentes_singleton check (id = 1)
);

insert into public.controle_notificacao_pendentes (id)
values (1)
on conflict (id) do nothing;

alter table public.controle_notificacao_pendentes enable row level security;
-- Sem nenhuma policy: só a Edge Function (Service Role Key, ignora RLS) lê
-- e escreve aqui. Nenhum usuário comum, nem admin autenticado no navegador,
-- precisa tocar nessa tabela.

-- 2) Habilita as extensões de cron/HTTP do Postgres (primeira vez que esse
--    projeto usa agendamento no banco).
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- 3) ANTES de rodar o cron.schedule abaixo, cadastre a Service Role Key no
--    Vault (uma vez só, direto no SQL Editor — NUNCA commite a chave real
--    num arquivo versionado, por isso ela não está aqui):
--
--    select vault.create_secret('<cole a Service Role Key aqui>', 'service_role_key');
--
--    Isso é o mesmo espírito de "supabase secrets set RESEND_API_KEY=..."
--    documentado nas outras Edge Functions: a chave fica só no ambiente do
--    Supabase, nunca no git.

-- 4) Agenda a chamada da function a cada hora, na hora exata (minuto 0).
--    A function decide sozinha se é hora de notificar (janela de silêncio
--    22h-8h e "só se mudou" são checados dentro dela, não aqui).
--    Troque <project-ref> pela referência real do projeto antes de rodar.
select cron.schedule(
    'notificar-fotos-pendentes-hora-em-hora',
    '0 * * * *',
    $$
    select net.http_post(
        url := 'https://<project-ref>.supabase.co/functions/v1/notificar-fotos-pendentes',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
        ),
        body := '{}'::jsonb
    );
    $$
);

-- Execute este script no SQL Editor do Supabase (Dashboard > SQL Editor).
--
-- Objetivo: dar à Auditoria de votos (curadoria.html) um sinal pra detectar
-- quando uma mesma pessoa está inflando o voto de UMA foto específica
-- usando várias contas Google diferentes. O login com Google já impede
-- voto duplicado DA MESMA conta (sql/001_votar_em_foto.sql), mas não
-- impede alguém trocar de conta e votar de novo na mesma foto.
--
-- Esta migration só REGISTRA o IP de origem de cada voto (como hash, nunca
-- em texto puro — serve só pra comparar "é a mesma origem de rede ou não",
-- nunca pra identificar a pessoa). Não bloqueia nem limita nenhum voto —
-- a decisão de agir fica inteiramente com quem revisa a Auditoria.
--
-- Nota de privacidade: o hash usa um salt fixo só pra evitar que ele seja
-- revertido com uma tabela pré-computada de IPs comuns. Não é proteção
-- forte de segurança — é suficiente pro que a coluna faz (agrupamento
-- interno, nunca exposta fora da curadoria/auditoria).
--
-- O IP vem do cabeçalho x-forwarded-for, que só existe dentro de uma
-- function chamada via PostgREST (não existe rodando a função a mão no SQL
-- Editor) — é injetado automaticamente pelo proxy do Supabase em toda
-- chamada de RPC feita pelo navegador (supabase.rpc(...)).

create extension if not exists pgcrypto with schema extensions;

alter table public.votos_realizados
    add column if not exists ip_hash text;

create index if not exists votos_realizados_foto_ip_idx
    on public.votos_realizados (foto_id, ip_hash, criado_em);

create or replace function public.votar_em_foto(foto_id_input uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    ip_origem text;
    hash_origem text;
begin
    if auth.uid() is null then
        raise exception 'É necessário estar autenticado para votar.';
    end if;

    -- x-forwarded-for pode vir como "ip_cliente, proxy1, proxy2" — o
    -- primeiro item é o IP de origem mais próximo do cliente real.
    ip_origem := trim(split_part(
        coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''),
        ',', 1
    ));

    hash_origem := case
        when ip_origem = '' then null
        else encode(extensions.digest(ip_origem || 'orbita-voto-salt-fixo', 'sha256'), 'hex')
    end;

    -- Se o usuário já votou nesta foto, a constraint única existente faz
    -- esse INSERT falhar, abortando a função inteira ANTES do UPDATE abaixo
    -- (nada fica incrementado em caso de voto duplicado).
    insert into votos_realizados (user_id, foto_id, ip_hash)
    values (auth.uid(), foto_id_input, hash_origem);

    update fotos_concurso
    set votos = votos + 1
    where id = foto_id_input
      and aprovada = true; -- só permite votar em fotos já aprovadas
end;
$$;

revoke all on function public.votar_em_foto(uuid) from public;
grant execute on function public.votar_em_foto(uuid) to authenticated;

-- Execute este script no SQL Editor do Supabase (Dashboard > SQL Editor).
-- Ele resolve dois problemas de segurança do fluxo de votação:
--   1) Um usuário conseguia votar mais de uma vez na mesma foto.
--   2) O contador de votos era calculado no navegador e podia ser
--      manipulado via DevTools (ex: chamar computarVoto('id', 999999)).
--
-- Depois de rodar este script, TODO incremento de voto passa a acontecer
-- dentro do banco, numa única transação atômica.

-- 1) Garante que cada usuário só pode votar 1x em cada foto.
--    Se já existir alguma duplicata na tabela, rode antes:
--    delete from votos_realizados a using votos_realizados b
--      where a.ctid < b.ctid and a.user_id = b.user_id and a.foto_id = b.foto_id;
alter table votos_realizados
    add constraint votos_realizados_user_foto_unique unique (user_id, foto_id);

-- 2) Função que registra o voto e incrementa o contador de forma atômica.
--    security definer = roda com privilégio do dono da função, o que permite
--    fazer o UPDATE em fotos_concurso mesmo que o usuário anônimo/autenticado
--    não tenha permissão de UPDATE direta na tabela (ver passo 3).
create or replace function public.votar_em_foto(foto_id_input uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is null then
        raise exception 'É necessário estar autenticado para votar.';
    end if;

    -- Se o usuário já votou nesta foto, a constraint única acima faz esse
    -- INSERT falhar, o que aborta a função inteira ANTES do UPDATE abaixo
    -- (nada fica incrementado em caso de voto duplicado).
    insert into votos_realizados (user_id, foto_id)
    values (auth.uid(), foto_id_input);

    update fotos_concurso
    set votos = votos + 1
    where id = foto_id_input
      and aprovada = true; -- só permite votar em fotos já aprovadas
end;
$$;

-- Só usuários autenticados podem chamar a função (o Google Auth garante isso).
revoke all on function public.votar_em_foto(uuid) from public;
grant execute on function public.votar_em_foto(uuid) to authenticated;

-- 3) Trava o UPDATE direto na coluna "votos" por parte do cliente.
--    IMPORTANTE: ajuste esta policy para bater com as policies que você já
--    tem hoje em fotos_concurso. O objetivo aqui é: ninguém (nem usuário
--    autenticado comum) deve poder rodar `.update({votos: ...})` direto do
--    navegador — só a função acima (que roda como security definer) pode.
--    Rode antes: select * from pg_policies where tablename = 'fotos_concurso';
--    para ver o que já existe, e adapte/remova a policy de UPDATE pública
--    que hoje permite `.update({ votos: ... })` vindo do votacao.html antigo.

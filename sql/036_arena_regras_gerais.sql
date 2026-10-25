-- Execute este script no SQL Editor do Supabase (Dashboard > SQL Editor).
-- Depende de sql/033_arena.sql já ter sido aplicado.
--
-- Campo de texto livre pro organizador escrever as regras gerais do
-- campeonato (ex: horários, desempate, conduta, o que quiser) — não tem
-- relação com os campos estruturados que já existiam (melhor_de, premio,
-- data_final), que continuam gerando as linhas automáticas da seção
-- Regras. `text` em vez de `varchar(N)`: Postgres não tem diferença de
-- performance entre os dois, e o limite de tamanho fica só no
-- `maxlength` da textarea no admin (bem generoso, não é pra travar o
-- organizador por um texto longo).

alter table public.arena_campeonatos
    add column if not exists regras_gerais text;

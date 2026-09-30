-- Execute este script no SQL Editor do Supabase (Dashboard > SQL Editor).
-- Adiciona data/hora do voto em votos_realizados — hoje a tabela só tem
-- (user_id, foto_id), sem nenhum registro de QUANDO o voto aconteceu. Isso
-- limita a Auditoria de votos (curadoria.html) a sinais que não dependem de
-- tempo (votante de foto única, cluster de 1º login) — o sinal mais forte
-- de fraude, uma rajada de votos numa janela curta, fica invisível sem essa
-- coluna.
--
-- Aditivo e retroativo: linhas já existentes recebem `now()` no momento em
-- que este script roda (não é a hora real em que o voto antigo aconteceu —
-- só os votos daqui pra frente terão a hora real). Nada quebra: a função
-- votar_em_foto() continua funcionando sem alteração, já que a coluna tem
-- default e não é referenciada no INSERT dela.

alter table public.votos_realizados
    add column if not exists criado_em timestamptz not null default now();

-- Execute este script no SQL Editor do Supabase.
--
-- As grades de votação e de curadoria carregavam a foto em tamanho cheio
-- (até 1600px) em todos os cards, mesmo sem o usuário ampliar nenhuma —
-- num evento com milhares de visitantes isso estoura o limite de egress do
-- plano free do Supabase rapidinho. A partir de agora, `enviar.html` faz
-- upload de uma segunda versão bem menor (thumbnail, ~400px) e essa coluna
-- guarda a URL dela.
--
-- Nullable de propósito: fotos enviadas antes dessa mudança não têm
-- thumbnail, e o front-end já sabe cair para `url_foto` nesse caso.

alter table public.fotos_concurso
    add column if not exists url_thumb text;

-- Execute este script no SQL Editor do Supabase (Dashboard > SQL Editor).
-- Carimbo de controle para o e-mail de resultado (vencedores) de cada
-- concurso, disparado pela Edge Function enviar-resultado-concurso a partir
-- de curadoria.html > Concursos. Não precisa de tabela própria: um envio =
-- um carimbo; reenviar ("Reenviar mesmo assim") apenas sobrescreve a data.

alter table public.concursos
    add column if not exists resultado_enviado_em timestamptz;

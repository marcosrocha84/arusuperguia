-- Execute este script no SQL Editor do Supabase, depois de
-- sql/010_concursos_patrocinadores_premiacoes.sql já ter sido aplicado.
--
-- Adiciona a posição (1º, 2º ou 3º lugar) a cada premiação vinculada a um
-- concurso, para o admin classificar qual premiação vale para qual colocação
-- na tela de curadoria.html > menu "Concursos". O limite de 1 a 3 acompanha
-- o mesmo teto de qtd_vencedores (sql/007_concursos_qtd_vencedores.sql), e a
-- constraint de unicidade impede duas premiações na mesma posição dentro do
-- mesmo concurso.

-- removida a syntaxe "if not exists" porque no Supabase ocorre erro de syntax

alter table public.concursos_premiacoes
    add column if not exists posicao smallint not null default 1;

alter table public.concursos_premiacoes
    add constraint if not exists concursos_premiacoes_posicao_check check (posicao between 1 and 3);

alter table public.concursos_premiacoes
    add constraint if not exists concursos_premiacoes_posicao_unica unique (concurso_id, posicao);

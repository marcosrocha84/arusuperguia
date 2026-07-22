-- Consulta só de LEITURA — não altera nada no banco.
-- Mostra as foreign keys da tabela votos_realizados e qual regra elas usam
-- ao excluir a linha referenciada (delete_rule): CASCADE, RESTRICT, NO
-- ACTION, SET NULL, etc. Rode isso antes de apagar fotos direto do banco,
-- pra saber se precisa apagar os votos primeiro.

select
    tc.constraint_name as nome_da_constraint,
    tc.table_name as tabela_de_origem,
    kcu.column_name as coluna,
    ccu.table_name as tabela_referenciada,
    ccu.column_name as coluna_referenciada,
    rc.delete_rule as regra_ao_excluir
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
    on tc.constraint_name = kcu.constraint_name
    and tc.table_schema = kcu.table_schema
join information_schema.constraint_column_usage ccu
    on tc.constraint_name = ccu.constraint_name
    and tc.table_schema = ccu.table_schema
join information_schema.referential_constraints rc
    on tc.constraint_name = rc.constraint_name
    and tc.table_schema = rc.constraint_schema
where tc.constraint_type = 'FOREIGN KEY'
    and tc.table_name = 'votos_realizados';

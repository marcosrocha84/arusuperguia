-- Execute este script no SQL Editor do Supabase, depois do
-- sql/021_campanhas_marketing.sql já ter sido aplicado.
--
-- Até aqui o sistema assumia que só existe 1 concurso "ativo = true" por
-- vez (índice único criado em 004_concursos_fotos_fk.sql, replicado em
-- validações na Edge Function "enviar-foto" e em votacao.html). A partir de
-- agora o Dino Parque deixa de ser o único patrocinador fixo do site e
-- passamos a suportar múltiplos concursos culturais ativos ao mesmo tempo,
-- cada um com sua própria URL e identidade visual — por isso a trava de
-- unicidade cai e o concurso passa a precisar de um identificador estável
-- (slug) e de um tema próprio (theme_config).
--
-- Esta migração é só o banco. A Edge Function "enviar-foto" e as páginas
-- index.html/concurso.html/enviar.html/votacao.html foram ajustadas em
-- commits separados, na sequência, para pararem de descobrir sozinhas "o"
-- concurso ativo e passarem a receber o concurso explicitamente (por id na
-- Edge Function, por slug na URL no frontend). Rodar só esta migração sem
-- esses ajustes faria dois concursos ativos colidirem silenciosamente na
-- descoberta automática que esse código antigo fazia.

-- 1) Remove a trava de "só 1 concurso ativo por vez". Continua existindo
--    um índice comum (não único) sobre "ativo", porque toda tela de
--    curadoria/frontend segue filtrando por esse campo o tempo todo — só
--    não pode mais ser único.
drop index if exists public.concursos_unico_ativo;

create index if not exists concursos_ativo_idx
    on public.concursos (ativo);

-- 2) "nome" é o nome de exibição do concurso (ex: "Dino Parque Fotográfico",
--    "Festival de Inverno"), desvinculado da identidade fixa do Belinzoni
--    Dino Parque. "descricao" continua existindo e passa a servir de
--    subtítulo/tema, sem migração de dado: quem cadastrar um concurso novo
--    já preenche os dois campos separadamente.
alter table public.concursos
    add column if not exists nome text;

-- 3) "slug" é o identificador estável usado na URL de detalhe do concurso
--    (ex: concurso.html?c=festival-de-inverno). Gerado a partir do nome (ou
--    da descrição, para concursos já cadastrados sem nome) para os
--    registros existentes, com um sufixo do id para garantir unicidade sem
--    intervenção manual; daqui pra frente o cadastro exige o preenchimento
--    explícito.
alter table public.concursos
    add column if not exists slug text;

update public.concursos
set slug = lower(
        regexp_replace(
            regexp_replace(coalesce(nome, descricao), '[^a-zA-Z0-9]+', '-', 'g'),
            '(^-+|-+$)', '', 'g'
        )
    ) || '-' || substr(id::text, 1, 8)
where slug is null;

alter table public.concursos
    alter column slug set not null;

create unique index if not exists concursos_slug_idx
    on public.concursos (slug);

-- 4) "theme_config" carrega cores, ícones e textos próprios de cada
--    concurso, aplicados via CSS custom properties na página de detalhe
--    (ver concurso.html, a ser criado no frontend). O default abaixo é o
--    tema atual do site (--fern/--ember/--canopy do styles.css) — assim
--    concursos já cadastrados, e qualquer concurso novo que ainda não teve
--    o tema configurado pelo curador, continuam renderizando exatamente
--    como hoje em vez de quebrar visualmente com campos ausentes.
alter table public.concursos
    add column if not exists theme_config jsonb not null default '{
        "cores": {
            "primaria": "#3C8156",
            "secundaria": "#C1452C",
            "fundo": "#152A20"
        },
        "icones": {
            "logo": "./logo-medio.jpg",
            "favicon": "./mini-logo.jpg",
            "mascote": "./logo-medio.jpg"
        },
        "textos": {
            "titulo": "Concurso Cultural",
            "subtitulo": "Participe e concorra a prêmios!",
            "cta_participar": "Quero participar"
        }
    }'::jsonb;

-- Execute este script no SQL Editor do Supabase, depois de
-- sql/008_patrocinadores.sql já ter sido aplicado.
--
-- Permite ao admin informar a URL da rede social ou site do patrocinador
-- (Instagram, Facebook, site institucional etc.) na tela de curadoria.html
-- > menu "Patrocinadores".

alter table public.patrocinadores
    add column if not exists url_rede_social text;

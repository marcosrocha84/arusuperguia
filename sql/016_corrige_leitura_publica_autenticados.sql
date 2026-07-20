-- Execute este script no SQL Editor do Supabase, depois de
-- sql/014_admins_e_rls.sql e sql/015_fotos_concurso_rls.sql já terem sido
-- aplicados.
--
-- BUG introduzido por sql/014: as policies "Público pode ler ..." (criadas
-- em sql/004 e sql/011) só cobrem o papel "anon". Antes de sql/014, um
-- usuário LOGADO (role "authenticated") conseguia ler essas mesmas tabelas
-- só por acidente — porque as policies administrativas antigas usavam
-- "using (true)" sem checar se era admin de verdade. Ao trocar isso por
-- is_admin() em sql/014, quem faz login com o Google só pra votar em
-- votacao.html perdeu acesso de leitura a concursos/patrocinadores/
-- premiacoes/vinculos, e a tela parou de mostrar o concurso e as fotos.
--
-- Correção: as policies "Público pode ler ..." passam a valer também para
-- "authenticated", já que essa informação é pública por natureza — o login
-- em votacao.html só deveria restringir o VOTO em si (isso já é validado
-- dentro da função votar_em_foto, ver sql/001), nunca a visualização.

alter policy "Público pode ler concursos"
    on public.concursos
    to anon, authenticated;

alter policy "Público pode ler patrocinadores ativos"
    on public.patrocinadores
    to anon, authenticated;

alter policy "Público pode ler premiacoes ativas"
    on public.premiacoes
    to anon, authenticated;

alter policy "Público pode ler vinculos de patrocinadores"
    on public.concursos_patrocinadores
    to anon, authenticated;

alter policy "Público pode ler vinculos de premiacoes"
    on public.concursos_premiacoes
    to anon, authenticated;

-- fotos_concurso não precisa de ajuste: a policy "Publico le fotos
-- aprovadas" criada em sql/015 já foi definida "to anon, authenticated"
-- desde o início.

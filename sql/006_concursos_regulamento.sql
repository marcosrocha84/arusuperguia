-- Execute este script no SQL Editor do Supabase, depois do
-- sql/003_concursos.sql já ter sido aplicado.
--
-- Permite ao curador anexar o PDF do regulamento a cada concurso (tela de
-- curadoria.html > menu "Concursos"). O link, quando existir, aparece no
-- rodapé de index.html, enviar.html e votacao.html para o concurso ativo.

alter table public.concursos
    add column if not exists regulamento_pdf_url text;

-- Bucket de storage onde os PDFs de regulamento ficam armazenados
-- (público para leitura, já que o link fica exposto no rodapé do site).
insert into storage.buckets (id, name, public)
values ('arusuperguia-regulamentos', 'arusuperguia-regulamentos', true)
on conflict (id) do nothing;

-- Só administradores autenticados (mesmo login usado em curadoria.html)
-- podem enviar/substituir/remover o PDF do regulamento.
create policy "Admins podem enviar regulamentos"
    on storage.objects for insert
    to authenticated
    with check (bucket_id = 'arusuperguia-regulamentos');

create policy "Admins podem atualizar regulamentos"
    on storage.objects for update
    to authenticated
    using (bucket_id = 'arusuperguia-regulamentos');

create policy "Admins podem excluir regulamentos"
    on storage.objects for delete
    to authenticated
    using (bucket_id = 'arusuperguia-regulamentos');

-- Leitura pública, para o link funcionar no rodapé para qualquer visitante.
create policy "Público pode ler regulamentos"
    on storage.objects for select
    to public
    using (bucket_id = 'arusuperguia-regulamentos');

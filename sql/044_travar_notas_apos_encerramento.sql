-- Até aqui, nada impedia um jurado de continuar gravando/alterando notas
-- depois do concurso encerrado — nem a RLS de fotos_notas (sql/040), nem o
-- front (jurado.html). Um jurado podia mudar o resultado depois que o
-- admin já tinha conferido/anunciado o vencedor. Esta migração trava isso
-- na própria RLS (não só escondendo botão na tela): insert/update de nota
-- só é permitido enquanto o concurso da foto ainda não está encerrado.

drop policy if exists "Jurado grava suas notas" on public.fotos_notas;
create policy "Jurado grava suas notas"
    on public.fotos_notas for insert
    to authenticated
    with check (
        lower(jurado_email) = lower(auth.jwt()->>'email')
        and exists (
            select 1 from public.fotos_concurso f
            join public.concursos c on c.id = f.concurso_id
            where f.id = fotos_notas.foto_id
              and f.aprovada = true
              and c.encerrado = false
              and public.is_jurado(f.concurso_id)
        )
    );

drop policy if exists "Jurado atualiza suas notas" on public.fotos_notas;
create policy "Jurado atualiza suas notas"
    on public.fotos_notas for update
    to authenticated
    using (lower(jurado_email) = lower(auth.jwt()->>'email'))
    with check (
        lower(jurado_email) = lower(auth.jwt()->>'email')
        and exists (
            select 1 from public.fotos_concurso f
            join public.concursos c on c.id = f.concurso_id
            where f.id = fotos_notas.foto_id
              and f.aprovada = true
              and c.encerrado = false
              and public.is_jurado(f.concurso_id)
        )
    );

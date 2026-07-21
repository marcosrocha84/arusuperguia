# Thumbnails para a grade de fotos (redução de egress do Supabase)

## O que mudou no código (já pronto)

1. **`enviar.html`**: além da versão comprimida cheia (até 1600px, JPEG 80%),
   agora também gera uma thumbnail (até 400px, JPEG 70%) e sobe as duas para
   o bucket `arusuperguia-fotos` — a cheia com o nome original e a thumbnail
   com o sufixo `-thumb.jpg`. As duas URLs são enviadas para a Edge Function
   `enviar-foto` (`url_foto` e `url_thumb`).
2. **`supabase/functions/enviar-foto/index.ts`**: passou a exigir e validar
   `url_thumb` também, gravando as duas colunas em `fotos_concurso`.
3. **`votacao.html`** e **`app.js`**: as grades (cards de votação e de
   moderação) agora carregam `foto.url_thumb` (caindo para `foto.url_foto`
   se for uma foto antiga sem thumbnail) com `loading="lazy"`. O modal
   ampliado de `votacao.html` continua usando `url_foto` (a versão cheia),
   carregada só quando o usuário clica para ampliar.

## O que ainda depende de você (passos manuais)

### 1. Rodar a migração no Supabase
No Dashboard → SQL Editor, rode `sql/017_fotos_concurso_thumb.sql`. Ele
adiciona a coluna `url_thumb` (nullable) em `fotos_concurso` — sem isso a
Edge Function vai falhar ao tentar gravar esse campo.

### 2. Deploy da Edge Function `enviar-foto`
```bash
supabase functions deploy enviar-foto
```
A function mudou (agora exige `url_thumb` no body). Sem esse redeploy, o
`enviar.html` novo vai passar a receber erro "Campos obrigatórios ausentes."
em todo envio.

### 3. Ordem recomendada de teste
1. Rode a migração do passo 1.
2. Faça o redeploy da Edge Function.
3. Envie uma foto nova em `enviar.html` e confira no Storage que os dois
   arquivos (cheio e `-thumb.jpg`) foram criados.
4. Abra `votacao.html` e confirme que a grade carrega rápido (thumbnails) e
   que clicar numa foto abre a versão cheia na modal.
5. Fotos antigas (enviadas antes dessa mudança) continuam aparecendo
   normalmente na grade — sem thumbnail, elas caem para `url_foto`.

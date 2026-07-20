# O que foi corrigido no código (já pronto)

1. **XSS armazenado** (`app.js`, `votacao.html`): nome do participante agora
   passa por `escapeHTML()` antes de ir para o HTML.
2. **Contador de votos manipulável**: `votacao.html` agora chama
   `supabase.rpc('votar_em_foto', ...)` em vez de calcular o `+1` no
   navegador.
3. **Banner de erro exposto a qualquer visitante**: só aparece agora com
   `?debug=1` na URL.
4. **Config do Supabase duplicada em 4 arquivos**: centralizada em
   `supabase-client.js`.
5. **Link do painel admin em destaque na home**: movido para um link
   discreto no rodapé.
6. **Fotos enviadas sem compressão**: `enviar.html` agora redimensiona/
   comprime a imagem no navegador antes do upload (até 1600px, JPEG 80%).
7. **Meta tags para compartilhamento** (Open Graph) e favicon adicionados
   em `index.html`.

# O que ainda depende de você (passos manuais)

Nenhum desses eu consigo fazer por aqui, porque exigem acesso ao seu
projeto Supabase/Cloudflare (contas, chaves secretas, CLI):

### 1. Rodar os SQLs no Supabase
No Dashboard → SQL Editor, rode nesta ordem:
- `sql/001_votar_em_foto.sql` — cria a função atômica de votação e a trava
  de voto duplicado. **Sem isso, o `votacao.html` novo vai dar erro**,
  porque a função `votar_em_foto` ainda não existe no banco.
- `sql/002_bloquear_insert_direto.sql` — tem instruções para você conferir
  as policies atuais de `fotos_concurso` e travar o INSERT direto pela
  chave anônima (a leitura do script explica passo a passo).

### 2. Deploy da Edge Function `enviar-foto`
```bash
supabase functions deploy enviar-foto
supabase secrets set TURNSTILE_SECRET_KEY=<secret key do Cloudflare Turnstile>
```
A secret key fica em Cloudflare Dashboard → Turnstile → seu site → "Secret
Key" (diferente da Site Key que já está no HTML). **Sem isso, o envio de
fotos vai parar de funcionar**, porque `enviar.html` agora chama essa
function em vez de inserir direto na tabela.

### 3. Conferir as policies de RLS de `fotos_concurso` e `votos_realizados`
Rode `select * from pg_policies where tablename = 'fotos_concurso';` e
`select * from pg_policies where tablename = 'votos_realizados';` para
confirmar que:
- usuário anônimo/autenticado comum não pode mais dar `UPDATE` na coluna
  `votos` nem `INSERT` direto em `fotos_concurso`;
- o admin (você) ainda consegue `UPDATE`/`DELETE` em `fotos_concurso` a
  partir da tela de curadoria.

### 4. Ordem recomendada de teste
1. Rode os dois SQLs.
2. Faça o deploy da Edge Function e configure a secret.
3. Teste o envio de uma foto em `enviar.html`.
4. Teste votar em `votacao.html` com duas contas Google diferentes.
5. Tente votar duas vezes na mesma foto com a mesma conta — deve dar erro
   "Erro ao computar o voto" (esperado, é a trava funcionando).

# Acompanhamento de status da foto (sem login)

## O que mudou no código (já pronto)

1. **`sql/018_fotos_concurso_reprovada.sql`** (novo): adiciona a coluna
   `reprovada` (boolean, default `false`) em `fotos_concurso`. Reprovar uma
   foto deixou de excluir a linha — agora só marca `aprovada=false,
   reprovada=true` (soft-delete), pra sobrar registro suficiente pra
   responder "sua foto foi reprovada" pelo código de acompanhamento.
2. **`app.js`**: `deletarFoto` (botão "Reprovar" da curadoria) agora faz
   `UPDATE` em vez de `DELETE`. `alterarStatusFoto` limpa `reprovada` ao
   aprovar (caso o moderador reverta uma reprovação). O filtro "Pendentes"
   da moderação passou a excluir fotos já reprovadas (senão elas nunca
   sairiam da fila). O card de cada foto agora mostra um selo "Reprovada"
   quando for o caso.
3. **`supabase/functions/enviar-foto/index.ts`**: a resposta de sucesso
   passou a incluir `codigo` (o próprio `id` da foto) — usado pelo
   front-end como código de acompanhamento. Não foi criada nenhuma coluna
   nova só pra isso; é o id que já existia.
4. **`supabase/functions/status-foto/index.ts`** (nova função): recebe
   `{ codigo }` e devolve o status público da foto (`pendente`, `aprovada`
   + `url_thumb`, `reprovada`, ou `nao_encontrado`). Roda com a Service Role
   Key de propósito — a RLS pública continua só liberando leitura de fotos
   `aprovada=true` (sql/015), então essa consulta por status teria que
   passar por aqui de qualquer forma, sem precisar afrouxar a RLS pra
   qualquer visitante conseguir listar todas as fotos pendentes.
5. **`enviar.html`**: a tela de sucesso agora mostra o código de
   acompanhamento com um botão "Copiar", e um link direto pra
   `status.html`.
6. **`status.html`** (nova página): campo pra colar o código, botão
   "Verificar status", e os 4 resultados possíveis (em análise / aprovada
   com miniatura / reprovada / código não encontrado).
7. **`votacao.html`** e **`index.html`**: link discreto "🔎 Acompanhar
   minha foto" no rodapé, ao lado do link de histórico.
8. **`sql/019_storage_fotos_admin_delete.sql`** (novo) + **`app.js`**:
   reprovar agora também apaga o arquivo (cheio + thumbnail) do Storage,
   além de marcar `reprovada=true` — a linha continua na tabela, só as
   colunas `url_foto`/`url_thumb` ficam vazias. O card da foto reprovada na
   moderação mostra um 🗑️ no lugar da imagem.

## O que ainda depende de você (passos manuais)

### 1. Rodar as migrações no Supabase
No Dashboard → SQL Editor, rode, nessa ordem:
1. `sql/018_fotos_concurso_reprovada.sql`
2. `sql/019_storage_fotos_admin_delete.sql`

### 2. Deploy das Edge Functions
Duas functions mudaram/foram criadas — **as duas** precisam de deploy:

```bash
supabase functions deploy enviar-foto
supabase functions deploy status-foto
```

(Diferente do que se poderia supor por essa mudança parecer só de resposta
JSON: `status-foto` é uma função nova, então ela simplesmente não existe no
Supabase até você rodar o deploy dela pela primeira vez.)

### 3. Ordem recomendada de teste
1. Rode as duas migrações do passo 1.
2. Faça o deploy das duas functions do passo 2.
3. Envie uma foto em `enviar.html` e guarde o código mostrado na tela de
   sucesso (ou use o botão "Copiar").
4. Abra `status.html`, cole o código, clique em "Verificar status" — deve
   aparecer "Em análise".
5. Na curadoria (`curadoria.html` → Moderação de fotos), aprove essa foto.
6. Volte em `status.html`, cole o mesmo código de novo — deve aparecer
   "Aprovada", com a miniatura da foto.
7. Repita o teste com outra foto, mas reprovando em vez de aprovar — confira
   que o card na moderação passa a mostrar 🗑️ no lugar da imagem, e que os
   dois arquivos (cheio + thumbnail) somem do bucket `arusuperguia-fotos` no
   Storage. Em `status.html`, o mesmo código deve mostrar "Reprovada".
8. Teste também um código inválido (ex: qualquer texto aleatório) — deve
   aparecer "Código não encontrado", sem erro técnico na tela.

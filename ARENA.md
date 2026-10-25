# Órbita Arena — runbook

Módulo de campeonatos PvP 1v1 de WoW Classic dentro da Órbita: chaveamento
eliminatório, integração com a API da Blizzard pra puxar dados do
personagem, e atualização ao vivo via Realtime na página pública. Para o
*porquê* das decisões não-óbvias (não o "o que"), veja a seção
[Órbita Arena em ARQUITETURA.md](ARQUITETURA.md#órbita-arena-arenahtml--view-arena-em-curadoriahtml).

## Peças do módulo

| Peça | Papel |
|---|---|
| `arena.html` | Página pública, uma por campeonato: `/arena/:slug` (redirect Netlify em `netlify.toml`) |
| `curadoria.html` (view "Arena") + `app.js` (seção Arena) | Painel admin: CRUD de campeonato, alistamento de combatentes, sorteio, lançamento de resultado |
| `supabase/functions/blizzard-personagem` | Edge Function: busca personagem na API da Blizzard e normaliza os dados |
| `assets/arena/*.svg` | Emblemas decorativos do hero (machados/espadas cruzados) |
| `sql/033` a `sql/036` | Schema, RLS, funções e evoluções da Arena (ver tabela abaixo) |

## Schema

Três tabelas principais + uma de contato, todas com RLS habilitado:

- **`arena_campeonatos`** — um campeonato. Campos relevantes: `slug` (único,
  vira a URL pública), `regiao`/`namespace_blizzard` (config da API da
  Blizzard, por campeonato — ver ARQUITETURA.md), `melhor_de` (N, ímpar),
  `status` (`inscricoes` → `em_andamento` → `encerrado`), `max_participantes`,
  `premio`, `data_final`, `link_live`, `regras_gerais` (texto livre), `ativo`
  (controla o link na home — ver seção "Link na página inicial" abaixo).
  Leitura pública; escrita só admin.
- **`arena_participantes`** — um combatente inscrito num campeonato. Dados
  vêm normalizados da Blizzard (`personagem`, `reino`, `faccao`, `raca`,
  `classe`, `nivel`, `guilda`, `ilvl_medio`, `avatar_url`,
  `dados_blizzard` jsonb) + `status` (`na_disputa` / `eliminado` /
  `campeao` / `vice`) + `seed` (prioridade de semeadura no sorteio, opcional).
  Leitura pública; escrita só admin.
- **`arena_participantes_contato`** — Discord de cada participante, 1:1 com
  `arena_participantes`. Tabela separada de propósito (ver ARQUITETURA.md) —
  **nunca** fica legível por `anon`.
- **`arena_partidas`** — uma partida do chaveamento: `rodada`, `posicao`,
  `participante_a_id`/`participante_b_id` (null = ainda não definido/bye),
  `vitorias_a`/`vitorias_b`, `vencedor_id`, `status` (`bloqueada` →
  `aguardando` → `ao_vivo` → `encerrada`), `proxima_partida_id` +
  `slot_na_proxima` (`a`/`b`, pra onde o vencedor avança), `em_destaque`
  (sinalizador manual "Lutando agora", ver ARQUITETURA.md). Leitura pública;
  escrita só admin. Realtime habilitado (`arena_partidas` e
  `arena_participantes` estão na publication `supabase_realtime`).

Funções `security definer` (as únicas formas de mudar o chaveamento):

- **`arena_sortear_chaveamento(campeonato_id)`** — apaga as partidas
  existentes do campeonato e gera o chaveamento do zero, usando semeadura
  clássica de torneio (ver ARQUITETURA.md). Recusa rodar se já existir
  qualquer resultado lançado (`vitorias_a > 0 or vitorias_b > 0 or status in
  ('ao_vivo','encerrada')`) — sortear de novo depois que a disputa começou
  destruiria resultados já jogados.
- **`arena_registrar_resultado(partida_id, vitorias_a, vitorias_b)`** —
  único caminho pra lançar/corrigir um placar. Calcula o vencedor a partir de
  `melhor_de`, atualiza status da partida, avança o vencedor pra
  `proxima_partida_id`/`slot_na_proxima`, marca `eliminado`/`campeao`/`vice`
  nos participantes, e fecha o campeonato (`status = 'encerrado'`) quando a
  final é decidida. Suporta **corrigir** um resultado já lançado: se o
  vencedor mudar e a próxima partida ainda não começou, desfaz o avanço
  anterior; se a próxima partida já começou (`ao_vivo`/`encerrada`), recusa a
  correção.

Ordem de migrações (`sql/`), aplicadas manualmente no SQL Editor do Supabase:

| Arquivo | O que adiciona |
|---|---|
| `033_arena.sql` | Schema inicial completo (tabelas, RLS, Realtime, as duas funções) |
| `034_arena_sorteio_seeding.sql` | Substitui `arena_sortear_chaveamento` pela semeadura clássica (distribuição de byes) |
| `035_arena_lutando_agora.sql` | Coluna `em_destaque` + ajuste em `arena_registrar_resultado` pra desligá-la ao decidir a partida |
| `036_arena_regras_gerais.sql` | Coluna `regras_gerais` (texto livre) em `arena_campeonatos` |
| `037_arena_campeonato_ativo.sql` | Coluna `ativo` + índice único parcial (só 1 campeonato ativo por vez) |

## Edge Function `blizzard-personagem`

Busca perfil + equipamento (pra calcular iLvl médio) + mídia (avatar) de um
personagem na API oficial da Blizzard e devolve um objeto normalizado. Não
usa Service Role Key (ver ARQUITETURA.md) — autentica com o JWT de quem
chamou e confere `is_admin()` via RPC antes de qualquer coisa.

Dois modos, via campo `acao` no corpo da requisição:

- **Padrão** (sem `acao`): recebe `{ campeonato_id, personagem, reino }`,
  busca 1 personagem e devolve os dados normalizados pra pré-visualização —
  **não grava nada**. Quem grava em `arena_participantes` é o painel admin,
  só depois que o admin clicar em "Confirmar inscrição".
- **`acao: "ressincronizar_todos"`**: recebe só `{ campeonato_id }`, busca de
  novo TODOS os participantes já inscritos nesse campeonato e atualiza os
  dados de cada um (sequencial, não em paralelo — evita rate limit da
  Blizzard). Devolve `{ sucesso, falhas: [{ personagem, motivo }] }`.

Deploy (toda vez que `index.ts` mudar):

```bash
supabase functions deploy blizzard-personagem
```

Segredos necessários (configurados uma vez, já feito em produção):

```bash
supabase secrets set BLIZZARD_CLIENT_ID=<client id do app Blizzard>
supabase secrets set BLIZZARD_CLIENT_SECRET=<client secret>
```

(`SUPABASE_URL`/`SUPABASE_ANON_KEY` já existem automaticamente no ambiente de
toda Edge Function do Supabase.)

### Namespace da API da Blizzard

A Blizzard mantém 3 famílias de Classic em paralelo — confirme qual usar
antes de criar um campeonato (muda com o tempo, conforme a Blizzard lança
novas fases/progressões):

| Versão | Namespace |
|---|---|
| Classic Era (vanilla 1.x) | `profile-classic1x-{regiao}` |
| Classic progressão atual | `profile-classic-{regiao}` |
| Burning Crusade Anniversary | `profile-classicann-{regiao}` |

`{regiao}` é `us`, `eu`, `kr` ou `tw` (mesmo valor do campo "Região" do
campeonato). Personagens **abaixo do nível 10 não são indexados** pela API
da Blizzard — um 404 nesse caso é esperado, não um bug (a Edge Function já
inclui esse aviso na mensagem de erro).

## Fluxo de uso (ponta a ponta)

1. **Criar o campeonato** em curadoria.html > view Arena: nome, slug, região,
   namespace da Blizzard, melhor de N, máx. participantes, prêmio, data da
   final, regras gerais. Status começa em `inscricoes`.
2. **Alistar combatentes**: busca por personagem + reino (chama a Edge
   Function em modo padrão), confere o preview normalizado, clica em
   "Confirmar inscrição" (grava em `arena_participantes` + Discord em
   `arena_participantes_contato`). Botão "+ Completar com participantes de
   teste" gera combatentes fake (`Lutador1`, `Lutador2`...) sem chamar a API,
   útil pra testar o chaveamento com volumes grandes.
3. **Sortear o chaveamento**: `arena_sortear_chaveamento` — só pode ser
   refeito enquanto nenhum resultado foi lançado. Campeonato passa pra
   `em_andamento`.
4. **Lançar resultados** rodada a rodada, em curadoria.html >
   "Chaveamento" (dividido em accordeons por rodada — rodadas 100% encerradas
   ficam recolhidas por padrão). Cada lançamento chama
   `arena_registrar_resultado`, que propaga o vencedor pra próxima partida
   automaticamente.
5. **Acompanhar ao vivo**: `arena.html` (`/arena/:slug`) assina Realtime em
   `arena_partidas`/`arena_participantes` e atualiza o chaveamento, placar
   por facção, faixa de "último resultado" e nome do campeão sem reload.
   Confete cobre a página quando a final é decidida.
6. **Corrigir um resultado**: lançar de novo na mesma partida com placar
   diferente — só funciona se a próxima partida ainda não começou.

## Decisões de design visual (`arena.html`)

- Tema escuro obsidiana, cores de facção (`--horda-*`/`--alianca-*`
  no `:root`), fontes Cinzel (display) + Manrope (corpo).
- Cantos chanfrados via `clip-path` (classe `.chanfro`) em vez de
  `border-radius`, em todo elemento de destaque — identidade visual da Arena
  inteira. Ver ARQUITETURA.md pro cuidado necessário com `outline`/
  `box-shadow` em elementos chanfrados.
- Chaveamento em formato clássico (esquerda → direita, final na última
  coluna) — mais compacto que um formato espelhado pra mesma quantidade de
  rodadas, e é o formato que a maioria já reconhece.
- `prefers-reduced-motion: reduce` desliga todas as animações (pisca de
  ponto, giro de placar, pulsar do hero, slide-in de avanço, brilho do
  campeão, confete) — a atualização de dado em si continua acontecendo, só
  não anima.
- Emblemas (`assets/arena/emblema-horda.svg` / `emblema-alianca.svg`) são
  só decorativos — não usam os logos oficiais da Horda/Aliança (marca
  registrada da Blizzard), são artes próprias (machados/espadas cruzados
  genéricos). Somem abaixo de 1240px de largura pra não cobrir o título.

## Rota pública

`netlify.toml` redireciona `/arena/:slug` → `/arena.html?arena=:slug`
(status 200, mesmo padrão de `/c/:slug` → `/concurso.html?c=:slug`). Links
internos (ex: o da home) apontam direto pra forma com query string
(`./arena.html?arena=slug`) — a rota bonita é só pra compartilhamento
externo, seguindo o mesmo padrão já usado pelos links de concurso.

## Link na página inicial (`index.html`)

O rodapé de `index.html` mostra um link "⚔️ Arena WoW ⚔️" logo depois do
link "Para criadores e marcas" — mas só quando existe um campeonato marcado
como `ativo = true`. Como só pode haver 1 campeonato ativo por vez (índice
único parcial, `sql/037`), o curador marca o campeonato correspondente na
view Arena de curadoria.html (checkbox "Ativo"); o formulário desativa
qualquer outro campeonato ativo automaticamente ao salvar, então não existe
fluxo manual de "desmarcar o anterior antes de marcar o novo". Sem nenhum
campeonato ativo, o link simplesmente não aparece (não existe um estado de
link quebrado/apontando pra URL vazia).

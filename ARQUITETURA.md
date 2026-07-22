# Arquitetura

Este documento explica o **porquê** das decisões não-óbvias do projeto — o
que o código sozinho não deixa claro. Para a lista de páginas e como rodar,
veja [README.md](README.md); para o histórico de mudanças no schema, veja os
comentários em [`sql/`](sql/).

## Ciclo de vida de um concurso

```
[curadoria cria o concurso]
        │
        ▼
  ativo = true  ──► enviar.html grava fotos nesse concurso
        │              (Edge Function descobre o concurso ativo
        │               no momento do envio, não no navegador)
        ▼
  votacao.html mostra a grade e permite votar
        │
        ▼
  data do concurso já passou OU marcado "encerrado" manualmente
        │
        ▼
  votacao.html vira "fotos campeãs" (só o pódio, sem voto)
        │
        ▼
  historico.html lista esse concurso entre os encerrados, pra sempre
```

Só pode existir **um concurso `ativo = true` por vez** — reforçado tanto por
um índice único no banco (`concursos_unico_ativo`, em
`sql/004_concursos_fotos_fk.sql`) quanto pela Edge Function, que rejeita o
envio se encontrar zero ou mais de um concurso ativo. Isso existe porque, sem
essa trava, um erro no painel de curadoria (esquecer de desativar o concurso
anterior antes de ativar um novo) misturaria fotos de duas edições diferentes
sob o mesmo "concurso ativo".

### Duas noções distintas de "encerrado"

Existem **dois campos diferentes** que decidem se um concurso já acabou, e
eles não se comunicam:

1. **`concursos.encerrado`** (boolean, checkbox manual na curadoria) — hoje
   só é lido/exibido dentro do próprio painel administrativo (selo na lista
   de concursos). Não é o que decide a experiência do visitante.
2. **Data calculada** (`concursos.data` comparada com "hoje") — é o que
   `votacao.html` e `index.html` realmente usam para decidir se mostram o
   fluxo de votação ou o pódio de encerrado.

`historico.html`, ao buscar concursos encerrados, combina os dois com um
`OR` (`encerrado = true OU data < hoje`) — assim um concurso marcado
manualmente como encerrado *antes* da data prevista (ex: encerramento
antecipado) também aparece no histórico, mesmo que a data ainda não tenha
chegado.

## RLS (Row Level Security) — quem pode ler o quê

Toda tabela sensível tem RLS habilitado; o padrão do projeto é:

- **Tabelas administrativas** (`concursos`, `patrocinadores`, `premiacoes` e
  as tabelas de vínculo N:N) só podem ser lidas/gravadas por usuários
  autenticados que passam em `is_admin()` — uma função `security definer`
  que consulta a tabela `public.admins` (ver `sql/014_admins_e_rls.sql`).
  Isso existe porque, antes dessa migração, qualquer usuário logado via
  Google só para votar também conseguia ler/gravar essas tabelas direto pela
  API, mesmo sem acessar `curadoria.html` — o front-end escondia o painel,
  mas o banco não impedia nada.
- **Leitura pública (`anon`)** é liberada seletivamente onde o site precisa
  mostrar algo a um visitante sem login: `concursos` (todas as linhas, não só
  as ativas — necessário para `historico.html`), `fotos_concurso` (só
  `aprovada = true`), `patrocinadores`/`premiacoes` (só `ativo = true`), e os
  vínculos N:N (sempre, já que o filtro por "ativo" acontece no registro
  vinculado, não no vínculo em si).
- **Escrita em `fotos_concurso`** não tem policy de INSERT nenhuma para
  `anon`/`authenticated` — o único caminho é a Edge Function `enviar-foto`,
  que usa a Service Role Key (ignora RLS) só depois de validar o CAPTCHA.
- **`votar_em_foto`** é uma função `security definer` (não uma policy) que
  insere em `votos_realizados` e incrementa `fotos_concurso.votos` na mesma
  transação — o contador de votos nunca é calculado no navegador, evitando
  manipulação via DevTools.

Consequência prática: se uma foto/patrocinador/premiação "some" do site
para o público mas aparece normalmente na curadoria, o motivo quase sempre é
uma policy de leitura pública faltando ou um campo `ativo`/`aprovada`
desmarcado — não um bug de código (já aconteceu: um patrocinador linkado a
um concurso não aparecia porque estava com `ativo = false`).

## Otimização de egress: fotos vs. thumbnails

O plano free do Supabase Storage tem um limite de egress (dados baixados por
mês), e o evento espera ~8 mil visitantes num fim de semana — cada abertura
de `votacao.html` sem otimização baixaria a grade inteira em tamanho cheio
(até 1600px) para todo mundo.

Solução: `enviar.html` gera **dois arquivos** no navegador antes do upload —
a versão cheia (até 1600px, JPEG 80%) e uma thumbnail (até 300px, JPEG 65%) —
e sobe as duas para o Storage. As grades (`votacao.html`, `curadoria.html`,
`historico.html`) sempre carregam a thumbnail com `loading="lazy"`; a versão
cheia só é buscada quando o visitante clica para ampliar a foto (modal). Fotos
enviadas antes dessa mudança não têm `url_thumb` — o código sempre cai para
`url_foto` nesse caso (`foto.url_thumb || foto.url_foto`).

Além disso, os dois uploads em `enviar.html` passam `cacheControl: '31536000'`
(1 ano). Isso é seguro porque cada arquivo tem nome único (timestamp +
random) e nunca é sobrescrito — sem essa opção, o Supabase aplica o padrão de
1h, e qualquer visita a uma foto já vista há mais de 1h volta a gastar
egress do zero, mesmo o arquivo nunca mudando. Num evento de fim de semana
inteiro, isso faz diferença real: a mesma foto popular sendo revisitada por
parte dos ~8 mil visitantes passa a vir do cache do navegador/CDN em vez do
Supabase depois do primeiro carregamento.

## Processamento de imagem no navegador (`enviar.html`)

Esta é a parte mais frágil do projeto, fruto de um bug real em produção com
fotos de Android/Samsung. Vale entender antes de mexer:

- **HEIC → JPEG**: iPhones enviam fotos em HEIC; `heic2any` converte no
  navegador. Antes de tentar a conversão (que pode levar ~30s), o código
  checa a assinatura de bytes real do arquivo (`pareceBytesHeic`) para não
  desperdiçar esse tempo em arquivos que só têm extensão `.heic` por engano.
- **Remoção de metadados EXIF**: o parser lê os segmentos JPEG manualmente
  (SOI/APPn/SOS/EOI) e remove todos os segmentos proprietários (EXIF, ICC,
  segmentos de fabricante como o `APP4` da Samsung, comentários) — não só o
  EXIF. Isso existe porque foi encontrado um caso real de uma foto Samsung com
  "Foto em Movimento" que tinha ~23KB de dados de fabricante embutidos, e
  outro caso (Pixel Motion Photo) com um vídeo anexado *depois* do fim real
  da imagem (EOI) — `encontrarFimDaImagemJpeg` localiza o EOI de verdade
  (ignorando bytes de stuffing e marcadores de restart dentro dos dados
  entrópicos) para truncar esse lixo.
- **Leitura do arquivo em memória uma única vez**: o bug raiz que motivou
  boa parte dessa complexidade foi um `NotReadableError` do Android/Chrome —
  arquivos vindos de `content://` URIs falham se lidos mais de uma vez (uma
  leitura para checar HEIC, outra para EXIF, outra para decodificar...). A
  correção foi ler o arquivo **uma vez** logo no início
  (`lerArquivoComFallback`, com fallback para `FileReader` se
  `.arrayBuffer()` falhar) e reusar esse buffer em todo o resto do pipeline.
- **Degradação graciosa**: se mesmo assim a leitura falhar nas duas
  tentativas, o código desiste de processar e sobe o arquivo original sem
  compressão/conversão para os dois slots (cheio e thumb) — prioriza "o envio
  aconteceu" sobre "a foto ficou otimizada", porque numa fila com milhares de
  envios um erro bloqueante é pior que uma foto maior.
- **Diagnóstico automático em caso de erro**: se o envio falhar por qualquer
  motivo, o arquivo original é enviado para `diagnostico/` no Storage e o link
  público é mostrado como texto selecionável na tela — isso substituiu um
  link de download de blob que falhava silenciosamente ("Erro na rede") no
  Chrome Android para arquivos grandes.
- **`<meta name="color-scheme" content="light">`** em todas as páginas: sem
  essa tag, o site não avisa o navegador que já controla suas próprias
  cores — vários navegadores/WebViews Android têm um recurso de "escurecer
  sites automaticamente" que reprocessa as cores de páginas sem esse aviso, o
  que foi confirmado visualmente (cores diferentes entre o navegador padrão
  de um Android e o Chrome). Investigado como possível causa também do
  "canvas em branco" acima — o canvas de compressão nunca é inserido no DOM,
  então em teoria não deveria ser afetado por um filtro de recoloração
  visual, mas esse recurso de "forçar modo escuro" de WebViews Android já
  teve bugs documentados que corrompiam conteúdo de canvas mesmo fora de
  tela. A tag resolve o problema de cor de qualquer forma; se também reduzir
  os casos de foto em branco, foi bônus.
- **Detecção de canvas em branco**: descoberto ao investigar uma foto real
  cujo zoom (`url_foto`) abria completamente preto na votação, enquanto a
  miniatura (`url_thumb`) da mesma foto estava normal. A imagem no Storage
  era um JPEG válido — o problema foi no navegador de quem enviou: sob
  pressão de memória, desenhar a versão cheia (maior, mais pesada de
  codificar) no `<canvas>` falhou silenciosamente e devolveu um retângulo
  vazio, sem erro nenhum, que o `toBlob()` exportou como se fosse sucesso; a
  versão pequena, desenhada logo depois com menos memória exigida, saiu
  certa. `comprimirAPartirDaFonte` agora amostra alguns pixels do canvas
  depois de desenhar (`canvasPareceEmBranco`) e, se todos vierem
  praticamente idênticos, tenta desenhar de novo (até 3 vezes, com uma
  pequena pausa entre tentativas). Reaconteceu mesmo depois desse fix (com
  outra pessoa, outro aparelho), então foi confirmado que a causa real é o
  "forçar modo escuro" de alguns navegadores/WebViews Android (ver item
  acima) — uma limitação do aparelho, não algo que uma nova tentativa
  resolve sozinha. Por isso, se as 3 tentativas ainda falharem,
  `comprimirAPartirDaFonte` rejeita com um erro marcado
  (`erro.canvasEmBranco = true`) e o código que chama (dentro do envio, em
  `enviar.html`) cai para o arquivo original **só naquele slot** (cheia ou
  thumb, cada um tratado de forma independente) em vez de bloquear o envio
  inteiro — mesma filosofia de degradação graciosa usada no caso de leitura
  de arquivo falhar: melhor uma foto sem otimização do que nenhuma foto.

## Acompanhamento de status sem login (`status.html`)

Depois de enviar, o participante não tinha nenhuma forma de saber se a foto
foi aprovada ou reprovada sem entrar em contato — a única pista era abrir
`votacao.html` e procurar a própria foto na grade. `status.html` resolve
isso com um código de acompanhamento, sem exigir login/e-mail/dado extra
nenhum.

- **O código é o próprio `id` (uuid) da foto** em `fotos_concurso`, devolvido
  pela Edge Function `enviar-foto` na resposta de sucesso. Não existe tabela
  ou coluna nova só pra isso — é único e não-adivinhável por natureza (é um
  uuid v4 gerado pelo Postgres), então reaproveitar é mais simples e mais
  seguro do que inventar um código curto derivado.
- **Por que a consulta de status passa por uma Edge Function
  (`status-foto`) em vez de uma query direta do navegador**: a RLS pública
  hoje só libera leitura de fotos com `aprovada = true` (sql/015) — de
  propósito, pra ninguém conseguir listar nome e foto de todo mundo que
  ainda está em análise. Se `status.html` consultasse a tabela direto, a
  única forma de também mostrar "pendente"/"reprovada" seria afrouxar essa
  policy pra cobrir todas as linhas — o que abriria exatamente essa brecha
  (qualquer pessoa poderia listar todas as fotos pendentes via API, não só
  consultar a sua pelo código). Rodando com a Service Role Key numa Edge
  Function, a busca é sempre por um `id` exato vindo do corpo da requisição
  — não tem como listar todas por essa rota — e a resposta só inclui o
  mínimo necessário (status + `url_thumb` quando aprovada).
- **Reprovar virou soft-delete**: até essa mudança, o botão "Reprovar" da
  curadoria excluía a linha inteira da tabela (`deletarFoto` fazia
  `.delete()`). Isso tornava "reprovada" e "código nunca existiu"
  indistinguíveis pra quem consultasse o status depois. A coluna
  `reprovada` (sql/018) resolve isso: reprovar agora marca
  `aprovada=false, reprovada=true` e mantém a linha. Como consequência, o
  filtro "Pendentes" da moderação (`app.js`) precisou passar a excluir
  `reprovada=true` explicitamente — senão fotos já reprovadas nunca mais
  sairiam da fila de moderação, já que a linha não desaparece mais.
- **Mas o arquivo em si é excluído do Storage ao reprovar**: manter a linha
  na tabela não significa manter a foto ocupando espaço — `deletarFoto`
  (app.js) extrai o caminho do arquivo a partir da URL salva, chama
  `storage.remove()` pra apagar a versão cheia e a thumbnail, e só depois
  limpa `url_foto`/`url_thumb` (string vazia, não `null`, pra não esbarrar
  em possível constraint `NOT NULL`) no mesmo update que marca
  `reprovada=true`. Precisou de uma policy de DELETE nova em
  `storage.objects` pro bucket `arusuperguia-fotos`
  (sql/019_storage_fotos_admin_delete.sql) — esse bucket só tinha policy de
  INSERT (pública, usada por `enviar.html`) até então. Se a exclusão do
  arquivo falhar por qualquer motivo, a foto é marcada como reprovada mesmo
  assim (só fica um arquivo órfão no Storage) — o registro da decisão de
  moderação não pode ficar bloqueado por uma falha no Storage. O card da
  foto reprovada na grade de moderação mostra um placeholder (🗑️) em vez de
  tentar carregar um `<img>` com URL vazia.

## Login e votação (`votacao.html`)

- Login é via Google OAuth. Duas formas de abrir: navegação normal
  (`signInWithOAuth` na própria aba) ou popup (`entrarComGooglePopup`),
  usada quando alguém abre um link de foto compartilhado (`?foto=<id>`) e
  clica direto em "Entrar para votar" — a popup evita perder a modal aberta
  e completa o voto automaticamente assim que o login termina.
- O contador de votos exibido localmente é sempre reconferido no banco após
  votar (nunca incrementado "otimisticamente" sem confirmação), porque o
  incremento real acontece dentro da função `votar_em_foto` no Postgres.

## Painel de curadoria (`curadoria.html` + `app.js`)

- Padrão **cache + render separado**: `carregarConcursos()` /
  `carregarPatrocinadores()` / `carregarPremiacoes()` buscam do banco uma vez
  e guardam em variáveis de módulo (`concursosCache`, etc.); trocar o filtro
  Ativo/Inativo/Todos chama só `renderizarX()`, que filtra o cache em memória
  — sem round-trip de rede a cada clique no filtro. O mesmo padrão foi usado
  no filtro de concurso da tela de moderação.
- **Filtro de concurso na moderação** lembra a última seleção do moderador
  entre trocas de tela, mas define automaticamente o concurso ativo como
  padrão na primeira vez que a tela é aberta na sessão.
- **Paginação na moderação**: diferente das telas de Concursos/Patrocinadores/
  Premiações (que carregam tudo de uma vez e filtram em memória, por serem
  listas pequenas), a grade de fotos usa `.range()` no Supabase e busca só a
  página atual, com `count: 'exact'` pra saber o total de páginas — porque o
  volume de fotos pendentes num evento grande pode ser bem maior do que o de
  concursos/patrocinadores cadastrados, e carregar todas de uma vez pesaria
  no navegador do moderador. Trocar filtro de status, concurso ou o tamanho
  da página sempre volta para a página 1; só os botões Anterior/Próxima
  mudam a página sem resetar os filtros. Se a página atual ficar vazia (ex:
  era a última e a única foto dela foi reprovada), a função busca a última
  página válida de novo automaticamente.
- `is_admin()` é checado tanto no front-end (esconder o painel de quem não é
  admin) quanto no banco via RLS — o front-end é só UX, a segurança real está
  nas policies.

# GitHub Pages Deploy

## 1) Preparar o site estático
Este projeto já é estático e não precisa de build. Ele inclui:
- `index.html`
- `enviar.html`
- `curadoria.html`
- `votacao.html`
- `app.js`
- `404.html` (adicionado para suportar SPA no GitHub Pages)

## 2) Criar o repositório GitHub
1. Crie um repositório em `https://github.com/`.
2. Escolha um nome, por exemplo: `arusuperguia-admin`.
3. Inicialize sem README se quiser empurrar tudo do local.

## 3) Subir os arquivos para o GitHub
No terminal, rode:
```bash
cd "c:/Users/Marcos/OneDrive/Documentos/AruSuperGuia/arusuperguia-admin"
git init
git add .
git commit -m "Deploy inicial GitHub Pages"
git branch -M main
git remote add origin https://github.com/<seu-usuario>/<seu-repositorio>.git
git push -u origin main
```

## 4) Ativar GitHub Pages
1. No GitHub, abra o repositório.
2. Vá em `Settings` → `Pages`.
3. Em `Source`, selecione `Deploy from a branch`.
4. Escolha branch `main` e diretório `/ (root)`.
5. Clique em `Save`.

## 5) Aguardar o deploy
- O GitHub Pages publicará em `https://<seu-usuario>.github.io/<seu-repositorio>/`.
- Quando estiver pronto, acesse essa URL.

## 6) Usar domínio customizado
1. Em `Settings` → `Pages`, na seção `Custom domain`, adicione:
   - `arusuperguia.com.br`
2. GitHub Pages criará um arquivo `CNAME` automaticamente ou você pode criar um manual:
   - `CNAME` contendo apenas `arusuperguia.com.br`

## 7) Atualizar DNS no Registro.br
No Registro.br, adicione os registros DNS do GitHub Pages:
- `@` → `A` → `185.199.108.153`
- `@` → `A` → `185.199.109.153`
- `@` → `A` → `185.199.110.153`
- `@` → `A` → `185.199.111.153`
- `www` → `CNAME` → `<seu-usuario>.github.io.`

## 8) HTTPS automático
Após o DNS propagar, volte em `Settings` → `Pages` e habilite `Enforce HTTPS`.

## 9) Observações
- GitHub Pages não permite backend, mas seu site usa apenas JavaScript e Supabase, então está compatível.
- Rotas internas funcionam melhor com `404.html` que redireciona para `index.html`.
- Se você quiser, posso gerar também o arquivo `CNAME` automaticamente.

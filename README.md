# Dumblo — Bot de RPG para Discord

Um bot focado em RPG, com integração a Firestore, Groq e cache opcional via Redis. Este repositório está pronto para ser publicado no GitHub com higiene de segredos e instruções claras de setup.

## Requisitos
- Node.js 18+
- Uma aplicação do Discord com permissões de bot
- Conta no Groq (API Key)
- Firebase (Service Account)
- Opcional: Redis (para cache externo)

## Configuração
1. Copie o arquivo `.env.example` para `.env` e preencha os valores:
   - `DISCORD_TOKEN`: Token do bot
   - `CLIENT_ID`: ID do aplicativo do Discord
   - `GROQ_API_KEY`: Chave da API do Groq
   - `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`: Credenciais do Firebase
   - `REDIS_URL` (opcional), `HOST_NAME` (opcional), `VOTE_URL` (opcional), `BOT_THUMBNAIL_URL` (opcional)

2. Sobre a `FIREBASE_PRIVATE_KEY`:
   - Use o formato com `\n` nas quebras de linha.
   - Exemplo: `"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"`

3. Instale as dependências:
   ```bash
   npm install
   ```

4. Execute em desenvolvimento:
   ```bash
   npm run dev
   ```

## Cuidados com Segredos
- `.env` e variações locais estão ignoradas pelo Git.
- `credenciais.json` e outras credenciais (`*.pem`, `*.key`, `*.pfx`) estão ignoradas.
- Não commit suas chaves ou tokens. Use sempre variáveis de ambiente.

## Publicar no GitHub (exemplo)
Crie o repositório no GitHub e rode:
```bash
git init
git add .
git commit -m "chore: inicializa projeto Dumblo"
git branch -M main
git remote add origin https://github.com/<seu-usuario>/<seu-repo>.git
git push -u origin main
```

Antes de dar `git add .`, confirme que nada sensível será versionado:
```bash
git status
git grep -I -n "DISCORD_TOKEN\|GROQ_API_KEY\|FIREBASE_PRIVATE_KEY" -- . ':(exclude).env'
```

## Deploy (Discloud)
O arquivo `discloud.config` está pronto para uso e não contém segredos. Configure variáveis de ambiente diretamente na plataforma.

## Créditos
- Criado por Dog — https://github.com/vitordogmm


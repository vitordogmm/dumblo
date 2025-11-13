## Objetivo
Adicionar o comando `\/tutorial` que envia uma embed de boas‑vindas com dois botões de link: um para o tutorial oficial (`https://dumblo.netlify.app/doc`) e outro para o servidor de suporte.

## Comportamento
- Ao executar `\/tutorial`, o bot responde com:
  - Embed com título, descrição curta e cor padrão.
  - Botões (Link) para: Tutorial (doc) e Servidor de Suporte.
  - Resposta pública (não ephemeral), alinhada ao `\/help` e `\/botinfo`.

## Detalhes da UI
- Título: "Tutorial do Dumblo 📘".
- Descrição: texto curto direcionando para o guia completo.
- Botões:
  - "📘 Abrir Tutorial" → `https://dumblo.netlify.app/doc`
  - "🛟 Servidor de Suporte" → `https://discord.gg/6daVxgAudS`

## Implementação Técnica
- Novo arquivo: `src\/commands\/utility\/tutorial.js` seguindo o padrão dos comandos utilitários (`data`, `category`, `cooldown`, `permissions`, `execute`).
- Reusar `EmbedBuilder`, `ActionRowBuilder`, `ButtonBuilder`, `ButtonStyle.Link`.
- Cores e texto via `config`.
- Logging com `logger.info`.
- Tratamento de erros com `ErrorHandler.handleCommandError`.

## Integração
- O roteamento de slash já existe em `interactionCreate` (busca `client.commands`); não requer alterações extras.
- Registro de comandos permanece sob o fluxo padrão de `ready.js` (dev vs global).

## Validação
- Verificar execução do comando e aparência dos botões.
- Confirmar funcionamento dos links.
- Conferir logs no terminal.

## Observações
- Podemos tornar a resposta `ephemeral` caso deseje evitar mensagens públicas; por padrão manteremos pública para facilitar descoberta pelos usuários.

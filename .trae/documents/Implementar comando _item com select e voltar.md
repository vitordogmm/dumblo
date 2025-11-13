## Objetivo

Criar o comando `/item` que exibe uma embed de boas‑vindas com um select menu listando os itens do usuário. Ao selecionar um item, a embed é atualizada com os detalhes do item, o select desaparece e aparece o botão "Voltar" para retornar à tela inicial.

## Arquitetura atual (referências)

* Cliente e roteamento de interações: `src/events/interactionCreate.js:27–60` e `src/index.js:44–55`

* Carregamento/registro de comandos: `src/handlers/commandHandler.js:17–48`

* Deploy dos comandos via REST: `src/events/ready.js:57–78`

* Utilitários de DB (Firestore): `src/database/queries.js:181–198` (`getInventory`, `setInventory`) e `src/database/queries.js:30–98` (`getPlayer`)

* Definições de itens: `src/data/world_1_data.json` (chave `items`)

* Padrões de componentes: handlers em `src/events/interactionCreate.js:68–190+`

* Utilize os novos componentes v2 do discord.\
  Versão: `discord.js` v14 (builders e componentes v14)

## Design do Comando `/item`

* Arquivo: `src/commands/rpg/item.js`

* Estrutura:

  * `data`: `new SlashCommandBuilder().setName('item').setDescription('Veja seus itens e detalhes')`

  * `category: 'rpg'`, `cooldown`, `permissions: []`

  * `execute(interaction, client)`: busca inventário do usuário, monta embed de boas‑vindas e `StringSelectMenu` com itens possuídos; responde de forma `ephemeral`.

## Componentes e IDs

* Select Menu: `customId`=`item_select_${userId}`

  * `options`: até 25 itens (limite Discord). `label`= `${emoji} ${name}`; `value`=`itemId`; `description` com raridade/nível.

* Botão Voltar: `customId`=`item_back_${userId}` com `ButtonStyle.Secondary` e label `Voltar`.

* Validação: sempre garantir que `interaction.user.id` corresponde ao `userId` nos `customId`.

## Estrutura dos Dados

* Itens: adicionar os "Novos itens" ao mapa `items` em `src/data/world_1_data.json` mantendo IDs únicos fornecidos.

* Inventário: usar `getInventory(userId)` para obter `{ items: [{ itemId, quantity }] }`; cruzar com `items` para montar o select e calcular quantidade.

## Fluxo de Interações

1. Usuário executa `/item`:

   * Busca inventário

   * Responde com embed de boas‑vindas e `StringSelectMenu` (`ephemeral`).
2. Usuário escolhe um item no select (`interaction.isStringSelectMenu()`):

   * Carrega metadados do item pelo `itemId`

   * Monta embed detalhando: nome, tipo, raridade, nível, stats, requisitos, efeitos especiais, preço de venda, stackable e quantidade possuída

   * Edita a mensagem: substitui componentes para esconder o select e mostrar o botão `Voltar`.
3. Usuário pressiona `Voltar` (`interaction.isButton()`):

   * Reconstrói a embed de boas‑vindas e o select

   * Edita a mensagem para retornar ao estado inicial.

## Implementação dos Handlers

* Adicionar blocos em `src/events/interactionCreate.js` seguindo o padrão existente:

  * Select: `if (interaction.isStringSelectMenu() && interaction.customId.startsWith('item_select_')) { ... }`

  * Botão: `if (interaction.isButton() && interaction.customId.startsWith('item_back_')) { ... }`

* Operações dentro dos blocos:

  * Extrair `userId` do `customId` e validar com `interaction.user.id`

  * `interaction.update({ embeds: [...], components: [...] })` para editar a resposta

## UI/Embeds

* Boas‑vindas: título "Seus Itens", descrição com instruções rápidas; cor padrão do bot e footer.

* Detalhes: título com `${emoji} ${name}`; campos para tipo/raridade/nível, stats, requisitos, efeitos especiais e `Quantidade`.

* Idioma: pt‑BR, sem sistema de i18n.

## Limites e Edge Cases

* Inventário vazio: mostrar embed informando que não há itens e não renderizar o select.

* Mais de 25 itens: renderizar apenas 25 primeiros; planejar paginação futura se necessário.

* Itens inexistentes no mapa: ignorar ou marcar como "desconhecido"; preferir ignorar.

## Passos de Implementação

1. Atualizar `src/data/world_1_data.json` adicionando os itens fornecidos.
2. Criar `src/commands/rpg/item.js` com o comando `/item` e a resposta inicial (embed + select).
3. Implementar handlers de `item_select_*` e `item_back_*` em `src/events/interactionCreate.js`.
4. Validar atualização da mensagem com `interaction.update` e manter respostas como `ephemeral`.

## Validação

* Testar localmente executando `/item` com usuário que possua itens; verificar:

  * Select lista corretamente com emoji/nomes

  * Seleção atualiza embed e oculta select; botão `Voltar` aparece

  * `Voltar` retorna ao estado inicial

* Conferir inexistência de erros no console.

## Observações

* Não adicionar botões de ações (equipar/usar/vender) por ora; foco apenas em exibir informações do item conforme solicitado.

* Seguir o estilo de código e padrões de `interactionCreate.js` já usados.


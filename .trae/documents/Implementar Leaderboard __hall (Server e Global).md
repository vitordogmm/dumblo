## Objetivo
Criar o comando de leaderboard com dois modos: `\/hall server` (apenas membros do servidor atual) e `\/hall global` (todos os jogadores), calculando uma pontuação de força e exibindo ranking com paginação, tratamento de erros e logs. Os três primeiros lugares recebem ícones 🥇🥈🥉.

## Estrutura de Comandos
- Um único comando `\/hall` com subcomandos:
  - `server` — ranking dos membros do servidor atual
  - `global` — ranking global de todos os jogadores
- Padrão do projeto (discord.js v14): arquivo em `src\/commands\/rpg\/hall.js` exportando `data`, `category`, `cooldown`, `permissions`, `execute`

## Cálculo de Pontuação (Power Score)
- Campos do Firestore em `players`: `level`, `stats` e `gear` já existem
- Fórmula proposta (rápida e equilibrada):
  - `weaponPower = max(gear.weapon.physicalDamage, gear.weapon.magicDamage)`
  - `armorPower = gear.armor.defense + (gear.armor.magicDefense || 0)`
  - `statsSum = strength + intelligence + agility + vitality + luck`
  - `score = level * 1000 + statsSum * 100 + weaponPower * 50 + armorPower * 30`
- Racional:
  - Level pesa mais (progressão)
  - Atributos têm impacto consistente
  - Equipamentos influenciam sem dominar
- Futuro: poderemos ajustar pesos via `config` ou armazenar `score` pré-calculado

## Coleta de Dados
- `global`: ler documentos de `players` em lotes (paginado) selecionando apenas campos necessários: `level`, `stats`, `gear`
- `server`: obter `guild.members` e filtrar players pelo `id` dos membros (melhor: montar set de `memberIds` e intersectar com resultados de players)
- Função utilitária:
  - `fetchPlayersPaged(limit, lastDoc)` para varrer toda a coleção com `startAfter` (cursor)
  - `computeScore(player)` para aplicar a fórmula

## UI e Paginação
- Embed por página com até 10 entradas
- Layout:
  - Título: `Hall — Server` ou `Hall — Global`
  - Descrição: linhas do tipo `#<rank> <emoji> <nome> — Score: <valor> • Lv <level>`
  - Campos: `Página x\/y`, `Total` jogadores
- Ícones top 3:
  - Rank 1: 🥇, Rank 2: 🥈, Rank 3: 🥉 (aplicados independentemente da página)
- Componentes v2 (duas linhas):
  - Navegação: `⏮️`, `◀️`, `Página`, `▶️`, `⏭️` (baseado em padrão de `historico` e `help`)
  - Troca de modo: botões `Global` e `Server` (um desabilitado indicando modo atual)
- IDs de componentes:
  - Navegação: `hall_nav_<userId>_<mode>_<page>`
  - Troca de modo: `hall_mode_<userId>_<mode>`

## Tratamento de Erros
- Try\/catch com `ErrorHandler.handleCommandError` (padrão do projeto)
- Mensagens amigáveis para:
  - Sem jogadores suficientes
  - Falha de conexão Firestore
  - Falha ao carregar membros do servidor
- Ephemeral: por padrão respostas públicas; se preferir, podemos tornar ephemeral ao detectar canal lotado

## Logs
- Uso de `utils\/logger` para info\/warn\/error
- Logs administrativos opcionais no canal padrão (seguindo padrão de `messageCreate.js:38` e `ready.js`):
  - Acesso ao comando, modo escolhido, página navegada
  - Erros críticos de coleta

## Handlers de Interação
- `src\/events\/interactionCreate.js` adicionará roteamento:
  - `hall_nav_...` para paginação (segue padrão `econ_hist_nav_` em `interactionCreate.js:2098`)
  - `hall_mode_...` para alternar entre `server` e `global`
- Construção e reedição de embed com `interaction.editReply`

## Performance
- Lotes de leitura (ex.: 1000 por vez) com seleção de campos
- Cache leve no `client.cache` por 60–120s para rankings global e por guilda
- Evitar custo alto em servidores enormes; limitar a `MAX_SCAN_PLAYERS` (configurável) e avisar “rank parcial” se excedido

## Segurança e Permissões
- `\/hall server` requer contexto de guild (não funciona em DM)
- Apenas quem invocou navega os componentes (validação de `userId` no `customId`)

## Passos de Implementação
1. Criar `src\/commands\/rpg\/hall.js` com subcomandos `server` e `global`
2. Implementar utilitários de coleta e pontuação dentro do comando (ou helpers internos)
3. Adicionar handlers em `src\/events\/interactionCreate.js` para `hall_nav_...` e `hall_mode_...`
4. Implementar cache opcional para rankings
5. Adicionar logs informativos em execuções e navegações
6. Testar paginação e alternância de modo

## Validação
- Cenários de teste:
  - Sem jogadores: mensagens de vazio
  - Poucos jogadores: top 3 com 🥇🥈🥉
  - Server vs Global: filtros corretos
  - Botões: navegação de páginas e alternância de modo
  - Erros: simular falha de Firestore
- Conferência manual: executar `\/hall server` e `\/hall global` em um servidor com dados reais

## Referências de Padrões Existentes
- Paginação com botões: `src\/events\/interactionCreate.js:2179` (ajuda), `src\/events\/interactionCreate.js:2098` (histórico)
- Tratamento de erro centralizado: `src\/utils\/errorHandler.js:1`
- Logger: `src\/utils\/logger.js`

## Observações
- Podemos ajustar os pesos da fórmula após ver resultados em produção
- Se o dataset global ficar muito grande, planejamos uma coleção `leaderboards` com atualização periódica

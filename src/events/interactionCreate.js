const { MessageFlags, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, time, TimestampStyles } = require('discord.js');
const logger = require('../utils/logger');
const ErrorHandler = require('../utils/errorHandler');
const config = require('../config/config');
const classes = require('../data/classes.json');
const worldData = require('../data/world_1_data.json');
const { createPlayer, getPlayer, updatePlayer, isAdmin, setInventory } = require('../database/queries');
const { isProhibited } = require('../utils/profanity');
const COLOR = config.colors?.primary || '#5865F2';

// Wrapper para buscar canal com timeout e evitar queda por ConnectTimeout
async function _safeFetchChannel(client, channelId, timeoutMs = 5000) {
  try {
    if (!channelId || !/^\d{17,}$/.test(channelId)) return null;
    const cached = client.channels.cache.get(channelId);
    if (cached) return cached;
    const fetchPromise = client.channels.fetch(channelId).catch(() => null);
    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs));
    const ch = await Promise.race([fetchPromise, timeoutPromise]);
    return ch || null;
  } catch (_) {
    return null;
  }
}

module.exports = {
  name: 'interactionCreate',
  once: false,
  async execute(client, interaction) {
    try {
      // Chat Input Commands
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        // Check permissões
        if (command.permissions && command.permissions.length) {
          const memberPerms = interaction.memberPermissions;
          const has = command.permissions.every((p) => memberPerms?.has?.(p));
          if (!has) {
            return interaction.reply({ content: 'Você não tem permissão para este comando.', flags: MessageFlags.Ephemeral });
          }
        }

        // Cooldown
        const cd = typeof command.cooldown === 'number' ? command.cooldown : config.cooldowns.default;
        if (cd && cd > 0) {
          const key = `${interaction.user.id}:${interaction.commandName}`;
          const now = Date.now();
          const expire = client.cooldowns.get(key) || 0;
          if (now < expire) {
            const remain = Math.ceil((expire - now) / 1000);
            return interaction.reply({ content: `Aguarde ${remain}s para usar novamente.`, flags: MessageFlags.Ephemeral });
          }
          client.cooldowns.set(key, now + cd * 1000);
        }

        logger.info(`Executando comando: /${interaction.commandName} por ${interaction.user.tag}`);
        return command.execute(interaction, client);
      }

      // Kaori Router: tenta tratar interações de componentes/modais
      if (client.kaori) {
        const handled = await client.kaori.router.handle(interaction);
        if (handled) return;
      }

      // Help: seleção de categoria
      if (interaction.isStringSelectMenu() && interaction.customId.startsWith('help_select_')) {
        const { handleHelpSelect } = module.exports;
        return handleHelpSelect(interaction, client);
      }

      // Inventário: seleção para equipar (consumível/arma/armadura)
      if (interaction.isStringSelectMenu() && (
        interaction.customId.startsWith('inv_equip_consumable_') ||
        interaction.customId.startsWith('inv_equip_weapon_') ||
        interaction.customId.startsWith('inv_equip_armor_')
      )) {
        const {
          handleInventoryEquipConsumableSelect,
          handleInventoryEquipWeaponSelect,
          handleInventoryEquipArmorSelect,
        } = module.exports;
        if (interaction.customId.startsWith('inv_equip_consumable_')) {
          return handleInventoryEquipConsumableSelect(interaction, client);
        }
        if (interaction.customId.startsWith('inv_equip_weapon_')) {
          return handleInventoryEquipWeaponSelect(interaction, client);
        }
        if (interaction.customId.startsWith('inv_equip_armor_')) {
          return handleInventoryEquipArmorSelect(interaction, client);
        }
      }

      // Help: navegação de páginas
      if (interaction.isButton() && interaction.customId.startsWith('help_nav_')) {
        const { handleHelpNav } = module.exports;
        return handleHelpNav(interaction, client);
      }

      // Help: voltar para boas-vindas
      if (interaction.isButton() && interaction.customId.startsWith('help_back_')) {
        const { handleHelpBack } = module.exports;
        return handleHelpBack(interaction, client);
      }

      // Modal Submit: Nome do Personagem
      if (interaction.isModalSubmit() && interaction.customId.startsWith('create_character_')) {
        return handleCharacterNameSubmit(interaction, client);
      }

      // Modal Submit: Distribuição de Atributos
      if (interaction.isModalSubmit() && interaction.customId.startsWith('attributes_modal_')) {
        const { handleAttributesModalSubmit } = module.exports;
        return handleAttributesModalSubmit(interaction, client);
      }

      // Modal Submit: Distribuição de Status (/status)
      if (interaction.isModalSubmit() && interaction.customId.startsWith('status_modal_')) {
        const { handleStatusModalSubmit } = module.exports;
        return handleStatusModalSubmit(interaction, client);
      }

      // Select Menu: Escolher Classe
      if (interaction.isStringSelectMenu() && interaction.customId.startsWith('class_select_')) {
        return handleClassSelection(interaction, client);
      }

      // Buttons: Confirmar Classe / Voltar
      if (interaction.isButton()) {
        if (interaction.customId.startsWith('confirm_class_')) {
          return handleConfirmClass(interaction, client);
        }
        if (interaction.customId.startsWith('back_class_select_')) {
          return handleBackToSelect(interaction, client);
        }
        if (interaction.customId.startsWith('allocate_status_')) {
          return handleAllocateStatusButton(interaction, client);
        }
        // Economia: confirmações
        if (interaction.customId.startsWith('econ_deposit_confirm_') || interaction.customId.startsWith('econ_deposit_cancel_')) {
          const { handleDepositConfirmOrCancel } = module.exports;
          return handleDepositConfirmOrCancel(interaction, client);
        }
        if (interaction.customId.startsWith('econ_withdraw_confirm_') || interaction.customId.startsWith('econ_withdraw_cancel_')) {
          const { handleWithdrawConfirmOrCancel } = module.exports;
          return handleWithdrawConfirmOrCancel(interaction, client);
        }
        if (interaction.customId.startsWith('econ_transfer_confirm_') || interaction.customId.startsWith('econ_transfer_cancel_')) {
          const { handleTransferConfirmOrCancel } = module.exports;
          return handleTransferConfirmOrCancel(interaction, client);
        }
        // Economia: navegação do histórico
        if (interaction.customId.startsWith('econ_hist_nav_')) {
          const { handleHistoryNav } = module.exports;
          return handleHistoryNav(interaction, client);
        }
      // Aventura: combate, baú e NPC
      if (interaction.isButton() && interaction.customId.startsWith('adv_combat_use_consumable_')) {
        const { handleAdventureCombatUseConsumable } = module.exports;
        return handleAdventureCombatUseConsumable(interaction, client);
      }
      if (interaction.customId.startsWith('adv_combat_')) {
        const { handleAdventureCombatAction } = module.exports;
        return handleAdventureCombatAction(interaction, client);
      }
        if (interaction.customId.startsWith('adv_chest_open_')) {
          const { handleAdventureChestOpen } = module.exports;
          return handleAdventureChestOpen(interaction, client);
        }
        if (interaction.customId.startsWith('adv_npc_talk_')) {
          const { handleAdventureNpcTalk } = module.exports;
          return handleAdventureNpcTalk(interaction, client);
        }
        if (interaction.customId.startsWith('aventura_view_inv_') || interaction.customId.startsWith('adv_inv_view_')) {
          const { handleAdventureInventoryView } = module.exports;
          return handleAdventureInventoryView(interaction, client);
        }
        if (interaction.customId.startsWith('adv_use_item_')) {
          const { handleAdventureUseItem } = module.exports;
          return handleAdventureUseItem(interaction, client);
        }

        // Inventário: botões de desequipar e atualizar
        if (interaction.customId.startsWith('inv_unequip_') || interaction.customId.startsWith('inv_refresh_')) {
          const { handleInventoryUnequipOrRefresh } = module.exports;
          return handleInventoryUnequipOrRefresh(interaction, client);
        }
      }
    } catch (error) {
      await ErrorHandler.handleCommandError(error, interaction);
    }
  },
};

// Helpers
function validateCharacterName(name) {
  if (!name || name.length === 0) {
    return { valid: false, reason: 'Nome não pode ser vazio.' };
  }
  if (name.length < 3) {
    return { valid: false, reason: 'Nome muito curto (mínimo 3 caracteres).' };
  }
  if (name.length > 20) {
    return { valid: false, reason: 'Nome muito longo (máximo 20 caracteres).' };
  }
  const regex = /^[a-zA-ZÀ-ÿ0-9\s]+$/;
  if (!regex.test(name)) {
    return { valid: false, reason: 'Nome contém caracteres inválidos. Use apenas letras, números e espaços.' };
  }
  // Filtro de palavras proibidas (inclui variações leet e com acentos)
  if (isProhibited(name)) {
    return { valid: false, reason: 'Nome contém palavras proibidas.' };
  }
  return { valid: true };
}

async function handleCharacterNameSubmit(interaction, client) {
  try {
    await interaction.deferReply({ ephemeral: true });
    const name = interaction.fields.getTextInputValue('character_name').trim();
    const userId = interaction.user.id;
    logger.info(`${interaction.user.tag} escolheu nome: ${name}`);

    const validation = validateCharacterName(name);
    if (!validation.valid) {
      const embed = new EmbedBuilder()
        .setColor(config.colors.error)
        .setTitle('❌ Nome Inválido')
        .setDescription(validation.reason)
        .setFooter({ text: 'Tente novamente com /start' })
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    await client.cache.set(`temp_character_${userId}`, { name }, 600);
    return showClassSelection(interaction, client, name);
  } catch (error) {
    return ErrorHandler.handleCommandError(error, interaction);
  }
}

// Exporta helpers para uso via Kaori
module.exports.validateCharacterName = validateCharacterName;
module.exports.handleCharacterNameSubmit = handleCharacterNameSubmit;
module.exports.showClassSelection = showClassSelection;
module.exports.handleClassSelection = handleClassSelection;
module.exports.handleBackToSelect = handleBackToSelect;
module.exports.handleConfirmClass = handleConfirmClass;

async function showClassSelection(interaction, client, characterName) {
  const embed = new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle(`📋 Escolha sua Classe, ${characterName}!`)
    .setDescription('Cada classe possui atributos e equipamentos únicos.\n\nEscolha com sabedoria, aventureiro!')
    .addFields(
      { name: '⚔️ Guerreiro', value: 'Combate corpo a corpo • Alto HP e defesa', inline: true },
      { name: '🔮 Mago', value: 'Magia arcana • Alto dano mágico', inline: true },
      { name: '🏹 Arqueiro', value: 'Ataques à distância • Alta precisão', inline: true },
      { name: '🗡️ Ladino', value: 'Furtividade • Alto dano crítico', inline: true },
      { name: '✨ Paladino', value: 'Guerreiro sagrado • Cura e ataque', inline: true }
    )
    .setFooter({ text: 'Selecione abaixo para ver detalhes' })
    .setTimestamp();

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`class_select_${interaction.user.id}`)
    .setPlaceholder('Escolha sua classe...')
    .addOptions(
      Object.values(classes).map((c) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(c.name)
          .setDescription(c.description)
          .setValue(c.id)
          .setEmoji(c.emoji)
      )
    );

  const row = new ActionRowBuilder().addComponents(selectMenu);
  return interaction.editReply({ embeds: [embed], components: [row] });
}

async function handleClassSelection(interaction, client) {
  try {
    await interaction.deferUpdate();
    const classId = interaction.values[0];
    const userId = interaction.user.id;
    const selectedClass = classes[classId];
    if (!selectedClass) return;

    const tempData = (await client.cache.get(`temp_character_${userId}`)) || {};
    tempData.classId = classId;
    await client.cache.set(`temp_character_${userId}`, tempData, 600);

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(`${selectedClass.emoji} ${selectedClass.name.toUpperCase()}`)
      .setDescription(`━━━━━━━━━━━━━━━━━━━\n${selectedClass.description}\n━━━━━━━━━━━━━━━━━━━`)
      .addFields(
        {
          name: '📊 Atributos Base',
          value:
            `💪 Força: **${selectedClass.baseStats.strength}**\n` +
            `🧠 Inteligência: **${selectedClass.baseStats.intelligence}**\n` +
            `⚡ Agilidade: **${selectedClass.baseStats.agility}**\n` +
            `❤️ Vitalidade: **${selectedClass.baseStats.vitality}**\n` +
            `🍀 Sorte: **${selectedClass.baseStats.luck}**\n` +
            `💬 Carisma: **${selectedClass.baseStats.charisma}**`,
          inline: true,
        },
        { name: '⚡ Habilidade Passiva', value: `**${selectedClass.passive.name}**\n${selectedClass.passive.description}`, inline: true },
        { name: '\u200b', value: '\u200b', inline: false },
        {
          name: '🎒 Equipamento Inicial',
          value:
            `**Arma:** ${selectedClass.startingGear.weapon.name}\n${selectedClass.startingGear.weapon.description}\n\n` +
            `**Armadura:** ${selectedClass.startingGear.armor.name}\n${selectedClass.startingGear.armor.description}\n\n` +
            `**Consumível:** ${selectedClass.startingGear.consumable.quantity}x ${selectedClass.startingGear.consumable.name}`,
          inline: false,
        },
        { name: '💡 Dicas', value: selectedClass.tips.map((t) => `• ${t}`).join('\n'), inline: false }
      )
      .setFooter({ text: 'Você terá 10 pontos extras para distribuir após confirmar' })
      .setTimestamp();

    const confirmButton = new ButtonBuilder()
      .setCustomId(`confirm_class_${userId}`)
      .setLabel('Confirmar Classe')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅');

    const backButton = new ButtonBuilder()
      .setCustomId(`back_class_select_${userId}`)
      .setLabel('Voltar')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('◀️');

    const row = new ActionRowBuilder().addComponents(confirmButton, backButton);
    return interaction.editReply({ embeds: [embed], components: [row] });
  } catch (error) {
    return ErrorHandler.handleCommandError(error, interaction);
  }
}

async function handleBackToSelect(interaction, client) {
  try {
    await interaction.deferUpdate();
    const temp = await client.cache.get(`temp_character_${interaction.user.id}`);
    const name = temp?.name || interaction.user.username;
    return showClassSelection(interaction, client, name);
  } catch (error) {
    return ErrorHandler.handleCommandError(error, interaction);
  }
}

async function handleConfirmClass(interaction, client) {
  try {
    // Abrir modal para distribuir atributos (10 pontos)
    const userId = interaction.user.id;
    const temp = await client.cache.get(`temp_character_${userId}`);
    const selectedClass = temp?.classId ? classes[temp.classId] : null;
    const base = selectedClass?.baseStats || { strength: 0, intelligence: 0, agility: 0, vitality: 0, luck: 0 };
    const modal = new ModalBuilder()
      .setCustomId(`attributes_modal_${userId}`)
      .setTitle('🧮 Distribuir Atributos (10 pontos)');

    // Limite de 5 componentes por modal. Carisma será calculado com o restante.
    const inputs = [
      { id: 'attr_strength', label: 'Força', placeholder: `Atual: ${base.strength}` },
      { id: 'attr_intelligence', label: 'Inteligência', placeholder: `Atual: ${base.intelligence}` },
      { id: 'attr_agility', label: 'Agilidade', placeholder: `Atual: ${base.agility}` },
      { id: 'attr_vitality', label: 'Vitalidade', placeholder: `Atual: ${base.vitality}` },
      { id: 'attr_luck', label: 'Sorte', placeholder: `Atual: ${base.luck}` },
    ];

    for (const inp of inputs) {
      const ti = new TextInputBuilder()
        .setCustomId(inp.id)
        .setLabel(inp.label)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(inp.placeholder)
        .setRequired(false);
      modal.addComponents(new ActionRowBuilder().addComponents(ti));
    }

    await interaction.showModal(modal);
  } catch (error) {
    return ErrorHandler.handleCommandError(error, interaction);
  }
}

// Atributos Modal Submit
module.exports.handleAttributesModalSubmit = async function handleAttributesModalSubmit(interaction, client) {
  try {
    await interaction.deferReply({ ephemeral: true });
    const userId = interaction.user.id;
    const temp = await client.cache.get(`temp_character_${userId}`);
    if (!temp?.name || !temp?.classId) {
      const embed = new EmbedBuilder()
        .setColor(config.colors.error)
        .setTitle('❌ Sessão Expirada')
        .setDescription('Reinicie com `/start`.')
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    const getNum = (id) => {
      const raw = interaction.fields.getTextInputValue(id)?.trim() || '0';
      const n = Number(raw);
      if (Number.isNaN(n) || n < 0) return 0;
      return Math.floor(n);
    };

    const alloc = {
      strength: getNum('attr_strength'),
      intelligence: getNum('attr_intelligence'),
      agility: getNum('attr_agility'),
      vitality: getNum('attr_vitality'),
      luck: getNum('attr_luck'),
    };

    const partialTotal = Object.values(alloc).reduce((a, b) => a + b, 0);
    if (partialTotal > 10) {
      const embed = new EmbedBuilder()
        .setColor(config.colors.error)
        .setTitle('❌ Pontos Excedidos')
        .setDescription(`Você distribuiu ${partialTotal} pontos. O máximo é 10.`)
        .setFooter({ text: 'Tente novamente com /start' })
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    // Carisma é calculado com os pontos restantes
    const charismaAlloc = 10 - partialTotal;

    const selectedClass = classes[temp.classId];
    const base = selectedClass.baseStats;
    const finalStats = {
      strength: base.strength + alloc.strength,
      intelligence: base.intelligence + alloc.intelligence,
      agility: base.agility + alloc.agility,
      vitality: base.vitality + alloc.vitality,
      luck: base.luck + alloc.luck,
      charisma: base.charisma + charismaAlloc,
    };

    // Persistir jogador
    await createPlayer(userId, {
      name: temp.name,
      classId: temp.classId,
      stats: finalStats,
      gear: selectedClass.startingGear,
      passive: selectedClass.passive,
      level: 0,
      xp: 0,
      statusPoints: 0,
      inventoryCapacity: config.game.maxInventorySize,
      hp: config.game.startingHP,
      meta: { createdAtUnix: Math.floor(Date.now() / 1000) },
      economy: {
        wallet: { lupins: Number(config.game.startingLupins || 0) },
        bank: { lupins: 0 },
        history: [],
      },
    });

    // Inicializar inventário na coleção dedicada com os itens iniciais da classe
    try {
      const sg = selectedClass.startingGear || {};
      const initialItems = [];
      if (sg.weapon?.id) initialItems.push({ itemId: sg.weapon.id, quantity: 1 });
      if (sg.armor?.id) initialItems.push({ itemId: sg.armor.id, quantity: 1 });
      if (sg.consumable?.id) initialItems.push({ itemId: sg.consumable.id, quantity: Number(sg.consumable.quantity || 1) });
      await setInventory(userId, initialItems);
    } catch (e) {
      logger.warn(`Falha ao inicializar inventário para ${userId}: ${logger.formatError(e)}`);
    }

    await client.cache.delete(`temp_character_${userId}`);

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(`✅ Personagem Criado: ${selectedClass.emoji} ${temp.name}`)
      .setDescription(`Bem-vindo a Dumblo! Sua jornada começa agora.
      
      Observação: Carisma foi calculado com os ${charismaAlloc} pontos restantes.`)
      .addFields(
        { name: '🏷️ Classe', value: `**${selectedClass.name}**`, inline: true },
        { name: '📊 Atributos', value: `💪 ${finalStats.strength} • 🧠 ${finalStats.intelligence} • ⚡ ${finalStats.agility} • ❤️ ${finalStats.vitality} • 🍀 ${finalStats.luck} • 💬 ${finalStats.charisma}`, inline: false },
        { name: '🎒 Equipamento', value: `Arma: ${selectedClass.startingGear.weapon.name}\nArmadura: ${selectedClass.startingGear.armor.name}\nConsumível: ${selectedClass.startingGear.consumable.quantity}x ${selectedClass.startingGear.consumable.name}`, inline: false },
      )
      .setFooter({ text: 'Dumblo RPG' })
      .setTimestamp();

    const result = await interaction.editReply({ embeds: [embed], components: [] });

    // Log administrativo com ID e thumbnail
    try {
      const LOG_CHANNEL_ID = '1437270397518090250';
      const ch = await _safeFetchChannel(client, LOG_CHANNEL_ID);
      if (ch) {
        const log = new EmbedBuilder()
          .setColor(config.colors.primary)
          .setTitle('📣 Log: Personagem Criado')
          .setDescription('Criação de personagem concluída')
          .addFields(
            { name: 'Usuário (ID)', value: `${userId}`, inline: true },
            { name: 'Classe', value: `${selectedClass.name}`, inline: true },
            { name: 'Quando', value: time(Math.floor(Date.now()/1000), TimestampStyles.ShortDateTime), inline: true },
          )
          .setThumbnail(interaction.user.displayAvatarURL({ size: 128 }))
          .setTimestamp();
        await ch.send({ embeds: [log] });
      }
    } catch (e) {
      logger.warn(`Falha ao enviar log de criação: ${logger.formatError(e)}`);
    }

    return result;
  } catch (error) {
    return ErrorHandler.handleCommandError(error, interaction);
  }
};

// ===== Status Allocation (/status) =====
module.exports.handleAllocateStatusButton = async function handleAllocateStatusButton(interaction, client) {
  try {
    const userId = interaction.user.id;
    const player = await getPlayer(userId);
    if (!player) {
      const embed = new EmbedBuilder()
        .setColor(config.colors.error)
        .setTitle('❌ Perfil não encontrado')
        .setDescription('Você ainda não criou um personagem. Use `/start`.')
        .setTimestamp();
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const available = Number(player.statusPoints || 0);
    if (available <= 0) {
      const embed = new EmbedBuilder()
        .setColor(config.colors.error)
        .setTitle('⚠️ Sem Pontos Disponíveis')
        .setDescription('Você não possui pontos de status para distribuir.')
        .setTimestamp();
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const stats = player.stats || {};
    const modal = new ModalBuilder()
      .setCustomId(`status_modal_${userId}`)
      .setTitle(`➕ Distribuir Pontos (${available})`);

    const fields = [
      { id: 'inc_strength', label: 'Força (+)', placeholder: `Atual: ${stats.strength ?? 0}` },
      { id: 'inc_intelligence', label: 'Inteligência (+)', placeholder: `Atual: ${stats.intelligence ?? 0}` },
      { id: 'inc_agility', label: 'Agilidade (+)', placeholder: `Atual: ${stats.agility ?? 0}` },
      { id: 'inc_vitality', label: 'Vitalidade (+)', placeholder: `Atual: ${stats.vitality ?? 0}` },
      { id: 'inc_luck', label: 'Sorte (+)', placeholder: `Atual: ${stats.luck ?? 0}` },
    ];
    for (const f of fields) {
      const ti = new TextInputBuilder()
        .setCustomId(f.id)
        .setLabel(f.label)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(f.placeholder)
        .setRequired(false);
      modal.addComponents(new ActionRowBuilder().addComponents(ti));
    }
    await interaction.showModal(modal);
  } catch (error) {
    return ErrorHandler.handleCommandError(error, interaction);
  }
};

module.exports.handleStatusModalSubmit = async function handleStatusModalSubmit(interaction, client) {
  try {
    await interaction.deferReply({ ephemeral: true });
    const userId = interaction.user.id;
    const player = await getPlayer(userId);
    if (!player) {
      const embed = new EmbedBuilder()
        .setColor(config.colors.error)
        .setTitle('❌ Perfil não encontrado')
        .setDescription('Você ainda não criou um personagem. Use `/start`.')
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    const stats = player.stats || {};
    const available = Number(player.statusPoints || 0);
    if (available <= 0) {
      const embed = new EmbedBuilder()
        .setColor(config.colors.error)
        .setTitle('⚠️ Sem Pontos Disponíveis')
        .setDescription('Você não possui pontos de status para distribuir.')
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    const readInt = (id) => {
      const raw = (interaction.fields.getTextInputValue(id) || '').trim();
      if (!raw) return 0;
      if (!/^\d+$/.test(raw)) return NaN; // apenas inteiros não negativos
      return Math.floor(Number(raw));
    };

    const inc = {
      strength: readInt('inc_strength'),
      intelligence: readInt('inc_intelligence'),
      agility: readInt('inc_agility'),
      vitality: readInt('inc_vitality'),
      luck: readInt('inc_luck'),
    };

    // validação de entradas
    const invalid = Object.entries(inc).find(([, v]) => Number.isNaN(v));
    if (invalid) {
      const embed = new EmbedBuilder()
        .setColor(config.colors.error)
        .setTitle('❌ Valores inválidos')
        .setDescription('Digite apenas números inteiros não negativos (0–9).')
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    const total = Object.values(inc).reduce((a, b) => a + b, 0);
    if (total > available) {
      const embed = new EmbedBuilder()
        .setColor(config.colors.error)
        .setTitle('❌ Distribuição inválida')
        .setDescription(`Você distribuiu **${total}** pontos, mas possui **${available}** disponíveis. Não exceda o limite de ${available}.`)
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    const prev = stats;
    const next = {
      strength: (prev.strength || 0) + inc.strength,
      intelligence: (prev.intelligence || 0) + inc.intelligence,
      agility: (prev.agility || 0) + inc.agility,
      vitality: (prev.vitality || 0) + inc.vitality,
      luck: (prev.luck || 0) + inc.luck,
      charisma: prev.charisma || 0, // inalterado
    };

    const remaining = available - total;
    await updatePlayer(userId, {
      stats: next,
      statusPoints: remaining,
      meta: { ...(player.meta || {}), lastStatusAllocAtUnix: Math.floor(Date.now() / 1000) },
    });

    const pct = (incVal, prevVal) => {
      if (!incVal) return 0;
      if (prevVal > 0) return Math.round((incVal / prevVal) * 100);
      return 100; // de 0 para algo — tratar como 100%
    };
    const increases = [
      `• Força: **${next.strength}** (+${inc.strength} | +${pct(inc.strength, prev.strength || 0)}%)`,
      `• Inteligência: **${next.intelligence}** (+${inc.intelligence} | +${pct(inc.intelligence, prev.intelligence || 0)}%)`,
      `• Agilidade: **${next.agility}** (+${inc.agility} | +${pct(inc.agility, prev.agility || 0)}%)`,
      `• Vitalidade: **${next.vitality}** (+${inc.vitality} | +${pct(inc.vitality, prev.vitality || 0)}%)`,
      `• Sorte: **${next.luck}** (+${inc.luck} | +${pct(inc.luck, prev.luck || 0)}%)`,
    ].join('\n');

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('✅ Status Atualizados')
      .setDescription(`Distribuição concluída.\n\n${increases}\n\n> Carisma permanece inalterado.`)
      .addFields(
        { name: 'Pontos Restantes', value: `**${remaining}**`, inline: true },
      )
      .setFooter({ text: 'Dumblo RPG' })
      .setTimestamp();

    const allocBtn = new ButtonBuilder()
      .setCustomId(`allocate_status_${userId}`)
      .setLabel(`Distribuir Pontos (${remaining})`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(remaining === 0);
    const row = new ActionRowBuilder().addComponents(allocBtn);

    const reply = await interaction.editReply({ embeds: [embed], components: [row] });

    // Log administrativo com ID e thumbnail
    try {
      const LOG_CHANNEL_ID = '1437270397518090250';
      const ch = await _safeFetchChannel(client, LOG_CHANNEL_ID);
      if (ch) {
        const log = new EmbedBuilder()
          .setColor(config.colors.primary)
          .setTitle('📣 Log: Status Atualizados')
          .setDescription('Distribuição de pontos de status concluída')
          .addFields(
            { name: 'Usuário (ID)', value: `${userId}`, inline: true },
            { name: 'Distribuídos', value: `${total}`, inline: true },
            { name: 'Restantes', value: `${remaining}`, inline: true },
            { name: 'Quando', value: time(Math.floor(Date.now()/1000), TimestampStyles.ShortDateTime), inline: true },
          )
          .setThumbnail(interaction.user.displayAvatarURL({ size: 128 }))
          .setTimestamp();
        await ch.send({ embeds: [log] });
      }
    } catch (e) {
      logger.warn(`Falha ao enviar log de status: ${logger.formatError(e)}`);
    }

    return reply;
  } catch (error) {
    return ErrorHandler.handleCommandError(error, interaction);
  }
};

// ===== Aventura: Combate =====
module.exports.handleAdventureCombatAction = async function handleAdventureCombatAction(interaction, client) {
  try {
    await interaction.deferUpdate();
    const cid = interaction.customId;
    const m = cid.match(/^adv_combat_(attack|defend|flee)_(.+)$/);
    if (!m) return;
    const action = m[1];
    const sid = m[2];
    const state = await client.cache.get(`adv_state_${sid}`);
    if (!state || state.type !== 'combat') {
      return interaction.followUp({ content: 'Sessão de combate expirada. Use `/aventura` novamente.', flags: MessageFlags.Ephemeral });
    }
    if (interaction.user.id !== state.userId) {
      return interaction.followUp({ content: 'Apenas quem iniciou a aventura pode agir.', flags: MessageFlags.Ephemeral });
    }

    const playerDb = await getPlayer(state.userId);
    if (!playerDb) {
      return interaction.followUp({ content: 'Perfil não encontrado.', flags: MessageFlags.Ephemeral });
    }

    // Sincroniza HP atual do jogador a partir do banco
    state.player.hp = Number(playerDb.hp ?? state.player.hp ?? config.game.startingHP);

    const enemy = state.enemy;
    const location = worldData.locations?.[state.locationId] || { name: 'Local desconhecido', emoji: '🗺️' };

    const stats = state.player.stats || {};
    const classId = playerDb.classId || null;
    const gear = state.player.gear || {};
    const weapon = gear.weapon || {};
    const armor = gear.armor || {};
    let baseWeapon = Number(weapon.physicalDamage || weapon.magicDamage || config.game.startingAttack);
    const isMagic = !!weapon.magicDamage;
    let scale = isMagic ? Number(stats.intelligence || 0) * 0.6 : Number(stats.strength || 0) * 0.6;
    const luck = Number(stats.luck || 0);
    let playerDefense = Number(armor.defense || config.game.startingDefense);

    let critChance = Math.min(0.3, 0.05 + luck * 0.005);
    const nextCritBonus = Math.max(0, Number(state.nextCritBonus || 0));
    const randVar = () => 0.9 + Math.random() * 0.2; // 0.9–1.1
    const toInt = (n) => Math.max(0, Math.round(n));

    // Passivas de classe
    if (classId === 'mage' && isMagic) {
      baseWeapon *= 1.15; // +15% dano mágico
      scale *= 1.15;
    }
    if (classId === 'warrior') {
      playerDefense = Math.round(playerDefense * 1.10); // +10% defesa
    }
    if (classId === 'archer') {
      critChance = Math.min(0.4, critChance * 1.2); // +20% relativo de crítico
    }

    const computePlayerDamage = () => {
      let dmg = (baseWeapon + scale) * randVar();
      const effectiveCritChance = Math.min(0.5, critChance + nextCritBonus);
      if (Math.random() < effectiveCritChance) dmg *= 1.5;
      dmg = dmg - Number(enemy.stats?.defense || 0);
      return Math.max(1, toInt(dmg));
    };

    const computeEnemyDamage = (defending = false) => {
      let dmg = (Number(enemy.stats?.attack || 5) * randVar()) - playerDefense;
      dmg = Math.max(1, toInt(dmg));
      if (defending) dmg = toInt(dmg * 0.5);
      return dmg;
    };

    let logLines = [];
    let concluded = false;

    if (action === 'flee') {
      const agility = Number(stats.agility || 0);
      const enemySpeed = Number(enemy.stats?.speed || 0);
      const fleeChance = Math.min(0.9, Math.max(0.1, 0.4 + (agility - enemySpeed) / 20));
      const fled = Math.random() < fleeChance;
      if (fled) {
        logLines.push('🏃 Você conseguiu fugir do combate.');
        concluded = true;
      } else {
        logLines.push('⚠️ Você tentou fugir, mas não conseguiu!');
        const taken = computeEnemyDamage(false);
        state.player.hp = Math.max(0, state.player.hp - taken);
        logLines.push(`💥 ${enemy.name} golpeou você causando **${taken}** de dano.`);
      }
    } else if (action === 'attack') {
      // Ataque: usa bônus de crítico e consome-o
      const dealt = computePlayerDamage();
      enemy.hp = Math.max(0, enemy.hp - dealt);
      logLines.push(`🗡️ Você causou **${dealt}** de dano em ${enemy.name}.`);
      // Consome bônus de crítico acumulado
      state.nextCritBonus = 0;
      if (enemy.hp <= 0) {
        logLines.push(`✅ ${enemy.name} foi derrotado!`);
        concluded = true;
      } else {
        const taken = computeEnemyDamage(false);
        state.player.hp = Math.max(0, state.player.hp - taken);
        logLines.push(`💥 ${enemy.name} atacou causando **${taken}** de dano.`);
        if (state.player.hp <= 0) {
          logLines.push('☠️ Você foi derrotado.');
          concluded = true;
        }
        // Passiva Paladino: A benção divina só funciona no primeiro ataque
        if (!concluded && classId === 'paladin' && !state.paladinBlessingUsed) {
          const regen = Math.max(1, Math.floor(state.player.maxHp * 0.05));
          const before = state.player.hp;
          state.player.hp = Math.min(state.player.maxHp, state.player.hp + regen);
          const healed = state.player.hp - before;
          if (healed > 0) logLines.push(`✨ Benção Divina: você regenerou **${healed} HP**.`);
          state.paladinBlessingUsed = true;
        }
      }
    } else if (action === 'defend') {
      // Defender: não causa dano ao inimigo, reduz dano recebido e concede bônus de crítico para o próximo ataque
      const taken = computeEnemyDamage(true);
      state.player.hp = Math.max(0, state.player.hp - taken);
      logLines.push(`🛡️ Você se defendeu e recebeu **${taken}** de dano reduzido.`);
      // Bônus leve de crítico para o próximo ataque (+5% absoluto, acumula até +20%)
      const newBonus = Math.min(0.2, nextCritBonus + 0.05);
      state.nextCritBonus = newBonus;
      logLines.push('🎯 Sua chance de crítico aumentou um pouco para o próximo ataque.');
      if (state.player.hp <= 0) {
        logLines.push('☠️ Você foi derrotado.');
        concluded = true;
      }
      // Paladino: benção não ativa em "Defender"; apenas no primeiro ataque
    }

    // Atualiza persistência de HP após a ação
    await updatePlayer(state.userId, { hp: state.player.hp });

    const embed = new EmbedBuilder()
      .setColor(concluded ? (state.player.hp <= 0 ? config.colors.error : COLOR) : COLOR)
      .setTitle(`${location.emoji || '🗺️'} ${location.name} — Combate (Turno ${state.turn})`)
      .setDescription(logLines.join('\n'))
      .addFields(
        { name: 'Seu HP', value: `**${state.player.hp}**`, inline: true },
        { name: `${enemy.name} HP`, value: `**${enemy.hp}**`, inline: true },
      )
      .setFooter({ text: 'Dumblo RPG — Combate' })
      .setTimestamp();

    let components = [];
    if (!concluded) {
      state.turn += 1;
      await client.cache.set(`adv_state_${sid}`, state, 900);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`adv_combat_attack_${sid}`).setLabel('Atacar').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`adv_combat_defend_${sid}`).setLabel('Defender').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`adv_combat_flee_${sid}`).setLabel('Fugir').setStyle(ButtonStyle.Primary),
      );
      // Botão para usar consumível equipado, se disponível
      const inv = Array.isArray(playerDb.inventory) ? playerDb.inventory : [];
      const eqCons = playerDb.gear?.consumable || null;
      let canUseConsumable = false;
      if (eqCons?.id) {
        const idx = inv.findIndex(i => i.itemId === eqCons.id && Number(i.quantity || 0) > 0);
        canUseConsumable = idx >= 0;
      }
      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`adv_combat_use_consumable_${sid}`)
          .setLabel(eqCons?.name ? `Usar ${eqCons.name}` : 'Usar consumível')
          .setStyle(ButtonStyle.Success)
          .setEmoji(eqCons?.emoji || '🧪')
          .setDisabled(!canUseConsumable)
      );
      components = [row, row2];
    } else {
      // Conclusão: vitórias concedem lupins e XP
      if (state.player.hp > 0 && enemy.hp <= 0) {
        const rewards = enemy.rewards || {};
        const xpGain = Number(rewards.xp || 0);
        // Usa campos goldMin/goldMax do worldData como lupins
        const lpMin = Number(rewards.goldMin || 0);
        const lpMax = Number(rewards.goldMax || lpMin);
        const lupinsGain = Math.max(0, Math.floor(lpMin + Math.random() * Math.max(0, lpMax - lpMin)));
        const currentWallet = Number(playerDb?.economy?.wallet?.lupins || 0);
        const newWallet = currentWallet + lupinsGain;
        let newXp = Number(playerDb.xp || 0) + xpGain;

        // Processa level-up: requisito (level+1) * 1000
        let curLevel = Number(playerDb.level || 0);
        let statusPoints = Number(playerDb.statusPoints || 0);
        let leveled = false;
        while (newXp >= (curLevel + 1) * 1000) {
          newXp -= (curLevel + 1) * 1000;
          curLevel += 1;
          statusPoints += 5; // +5 pontos por nível
          leveled = true;
        }
        const updateData = { xp: newXp, level: curLevel, statusPoints, 'economy.wallet.lupins': newWallet };
        await updatePlayer(state.userId, updateData);
        embed.addFields(
          { name: 'Recompensas', value: `💰 Lupins: **${lupinsGain}** • ⭐ XP: **${xpGain}**${leveled ? `\n🎉 Level UP! Agora você é nível **${curLevel}** (+5 pontos de status)` : ''}`, inline: false }
        );
      }
      // Desabilita
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`adv_combat_attack_${sid}`).setLabel('Atacar').setStyle(ButtonStyle.Danger).setDisabled(true),
        new ButtonBuilder().setCustomId(`adv_combat_defend_${sid}`).setLabel('Defender').setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId(`adv_combat_flee_${sid}`).setLabel('Fugir').setStyle(ButtonStyle.Primary).setDisabled(true),
      );
      components = [row];
      await client.cache.delete(`adv_state_${sid}`);
      // Limpa referência de sessão de aventura em progresso
      try { await client.cache.delete(`adv_current_${state.userId}`); } catch {}
    }

    return interaction.editReply({ embeds: [embed], components });
  } catch (error) {
    return ErrorHandler.handleCommandError(error, interaction);
  }
};

// ===== Aventura: Combate — Usar Consumível Equipado =====
module.exports.handleAdventureCombatUseConsumable = async function handleAdventureCombatUseConsumable(interaction, client) {
  try {
    await interaction.deferUpdate();
    const m = interaction.customId.match(/^adv_combat_use_consumable_(.+)$/);
    if (!m) return;
    const sid = m[1];
    const state = await client.cache.get(`adv_state_${sid}`);
    if (!state || state.type !== 'combat') {
      return interaction.followUp({ content: 'Sessão de combate expirada. Use `/aventura` novamente.', flags: MessageFlags.Ephemeral });
    }
    if (interaction.user.id !== state.userId) {
      return interaction.followUp({ content: 'Apenas quem iniciou a aventura pode agir.', flags: MessageFlags.Ephemeral });
    }

    const playerDb = await getPlayer(state.userId);
    if (!playerDb) {
      return interaction.followUp({ content: 'Perfil não encontrado.', flags: MessageFlags.Ephemeral });
    }

    const itemsMap = worldData.items || {};
    const eqCons = playerDb.gear?.consumable || null;
    if (!eqCons?.id) {
      return interaction.followUp({ content: 'Nenhum consumível equipado.', flags: MessageFlags.Ephemeral });
    }
    const item = itemsMap[eqCons.id];
    if (!item || item.type !== 'consumable') {
      return interaction.followUp({ content: 'Consumível equipado inválido.', flags: MessageFlags.Ephemeral });
    }

    // Verifica inventário e consome 1
    const inv = Array.isArray(playerDb.inventory) ? [...playerDb.inventory] : [];
    const idx = inv.findIndex(i => i.itemId === eqCons.id && Number(i.quantity || 0) > 0);
    if (idx < 0) {
      return interaction.followUp({ content: 'Você não possui unidades deste consumível.', flags: MessageFlags.Ephemeral });
    }

    // Cura
    const vit = Number(playerDb.stats?.vitality || 0);
    const maxHp = Number(state.player?.maxHp || (config.game.startingHP + vit * 2));
    const healVal = Number(item.effect?.value || item.effects?.heal || 0);
    const before = Number(playerDb.hp ?? config.game.startingHP);
    const after = Math.min(maxHp, before + Math.max(0, healVal));

    // Consome 1 unidade do inventário
    inv[idx].quantity = Number(inv[idx].quantity || 1) - 1;
    if (inv[idx].quantity <= 0) inv.splice(idx, 1);

    // Atualiza gear.consumable.quantity refletindo inventário
    const newTotalQty = inv.filter((i) => i.itemId === eqCons.id).reduce((acc, i) => acc + Number(i.quantity || 0), 0);
    const newGear = Object.assign({}, playerDb.gear || {});
    if (newTotalQty > 0) {
      newGear.consumable = { ...eqCons, quantity: newTotalQty };
    } else {
      // Remove consumível do slot se acabou
      const g = { ...newGear };
      delete g.consumable;
      Object.assign(newGear, g);
    }

    // Aplica atualização
    await updatePlayer(state.userId, { hp: after, inventory: inv, gear: newGear });
    state.player.hp = after; // sincroniza estado

    const enemy = state.enemy;
    const location = worldData.locations?.[state.locationId] || { name: 'Local desconhecido', emoji: '🗺️' };
    const armor = (state.player.gear?.armor) || {};
    const playerDefense = Number(armor.defense || config.game.startingDefense);

    const randVar = () => 0.9 + Math.random() * 0.2;
    const toInt = (n) => Math.max(0, Math.round(n));
    const computeEnemyDamage = () => {
      let dmg = (Number(enemy.stats?.attack || 5) * randVar()) - playerDefense;
      dmg = Math.max(1, toInt(dmg));
      return dmg;
    };

    // Após usar consumível, o inimigo ataca
    let logLines = [];
    logLines.push(`${item.emoji || '🧪'} Você usou **${item.name}** e recuperou **${after - before} HP**.`);

    let concluded = false;
    const taken = computeEnemyDamage();
    state.player.hp = Math.max(0, state.player.hp - taken);
    logLines.push(`💥 ${enemy.name} atacou causando **${taken}** de dano.`);
    if (state.player.hp <= 0) {
      logLines.push('☠️ Você foi derrotado.');
      concluded = true;
    }

    // Paladino: benção não ativa ao usar consumível; apenas no primeiro ataque

    // Persiste HP após ação
    await updatePlayer(state.userId, { hp: state.player.hp });

    const embed = new EmbedBuilder()
      .setColor(concluded ? (state.player.hp <= 0 ? config.colors.error : COLOR) : COLOR)
      .setTitle(`${location.emoji || '🗺️'} ${location.name} — Combate (Turno ${state.turn})`)
      .setDescription(logLines.join('\n'))
      .addFields(
        { name: 'Seu HP', value: `**${state.player.hp}**`, inline: true },
        { name: `${enemy.name} HP`, value: `**${enemy.hp}**`, inline: true },
      )
      .setFooter({ text: 'Dumblo RPG — Combate' })
      .setTimestamp();

    let components = [];
    if (!concluded) {
      state.turn += 1;
      await client.cache.set(`adv_state_${sid}`, state, 900);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`adv_combat_attack_${sid}`).setLabel('Atacar').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`adv_combat_defend_${sid}`).setLabel('Defender').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`adv_combat_flee_${sid}`).setLabel('Fugir').setStyle(ButtonStyle.Primary),
      );
      // Botão de consumível novamente (pode ter acabado)
      const eqAfter = (newGear?.consumable) || null;
      const hasQty = !!eqAfter?.quantity && Number(eqAfter.quantity) > 0;
      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`adv_combat_use_consumable_${sid}`)
          .setLabel(eqAfter?.name ? `Usar ${eqAfter.name}` : 'Usar consumível')
          .setStyle(ButtonStyle.Success)
          .setEmoji(eqAfter?.emoji || '🧪')
          .setDisabled(!hasQty)
      );
      components = [row, row2];
    } else {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`adv_combat_attack_${sid}`).setLabel('Atacar').setStyle(ButtonStyle.Danger).setDisabled(true),
        new ButtonBuilder().setCustomId(`adv_combat_defend_${sid}`).setLabel('Defender').setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId(`adv_combat_flee_${sid}`).setLabel('Fugir').setStyle(ButtonStyle.Primary).setDisabled(true),
      );
      components = [row];
      await client.cache.delete(`adv_state_${sid}`);
      try { await client.cache.delete(`adv_current_${state.userId}`); } catch {}
    }

    return interaction.editReply({ embeds: [embed], components });
  } catch (error) {
    return ErrorHandler.handleCommandError(error, interaction);
  }
};

// ===== Aventura: Baú =====
module.exports.handleAdventureChestOpen = async function handleAdventureChestOpen(interaction, client) {
  try {
    await interaction.deferUpdate();
    const m = interaction.customId.match(/^adv_chest_open_(.+)$/);
    if (!m) return;
    const sid = m[1];
    const state = await client.cache.get(`adv_state_${sid}`);
    if (!state || state.type !== 'chest') {
      return interaction.followUp({ content: 'Sessão de baú expirada. Use `/aventura` novamente.', flags: MessageFlags.Ephemeral });
    }
    if (interaction.user.id !== state.userId) {
      return interaction.followUp({ content: 'Apenas quem iniciou a aventura pode abrir.', flags: MessageFlags.Ephemeral });
    }
    const playerDb = await getPlayer(state.userId);
    if (!playerDb) return;
    const chest = state.chest;
    const location = worldData.locations?.[state.locationId] || { name: 'Local', emoji: '🗺️' };

    // Armadilha
    let notes = [];
    let newHp = Number(playerDb.hp ?? config.game.startingHP);
    if (Math.random() < Number(chest.trapChance || 0)) {
      const dmg = Number(chest.trapDamage || 10);
      newHp = Math.max(0, newHp - dmg);
      notes.push(`⚠️ Armadilha acionada! Você perdeu **${dmg} HP**.`);
    }

    // Loot com inventário persistente
    let lupinsGain = 0;
    const lootRolls = chest.lootTable || [];
    const itemsMap = worldData.items || {};
    const inv = Array.isArray(playerDb.inventory) ? [...playerDb.inventory] : [];
    const capacity = Number(playerDb.inventoryCapacity || config.game.maxInventorySize || 50);
    const playerClass = playerDb.classId || null;
    for (const entry of lootRolls) {
      let chance = Number(entry.chance || 0);
      if (entry.itemId) {
        const itemMeta = itemsMap[entry.itemId];
        const rarity = itemMeta?.rarity || 'common';
        // Passiva Ladino: +30% chance para itens raros ou acima
        if (playerClass === 'rogue' && (rarity === 'rare' || rarity === 'epic' || rarity === 'legendary')) {
          chance = Math.min(1, chance * 1.3);
        }
      }
      if (Math.random() < chance) {
        if (entry.gold) {
          const min = Number(entry.gold.min || 0);
          const max = Number(entry.gold.max || min);
          const g = Math.max(0, Math.floor(min + Math.random() * Math.max(0, max - min)));
          lupinsGain += g;
          notes.push(`💰 Encontrou **${g} lupins** no baú.`);
        } else if (entry.itemId) {
          const item = itemsMap[entry.itemId];
          if (!item) continue;
          // Tentar adicionar ao inventário
          const qty = Number(entry.quantity || 1);
          let added = false;
          if (item.stackable) {
            const existing = inv.find(i => i.itemId === entry.itemId);
            if (existing) {
              existing.quantity = Number(existing.quantity || 0) + qty;
              added = true;
            } else if (inv.length < capacity) {
              inv.push({ itemId: entry.itemId, quantity: qty });
              added = true;
            }
          } else {
            const neededSlots = qty;
            if (inv.length + neededSlots <= capacity) {
              for (let k = 0; k < neededSlots; k++) inv.push({ itemId: entry.itemId, quantity: 1 });
              added = true;
            }
          }
          if (added) {
            notes.push(`${item.emoji || '📦'} Adicionou **${item.name} x${qty}** ao inventário.`);
          } else {
            const sell = Number(item.sellPrice || 10) * qty;
            lupinsGain += sell;
            notes.push(`${item.emoji || '📦'} Inventário cheio: **${item.name} x${qty}** convertido em **${sell} lupins**.`);
          }
        }
      }
    }

    // Persistir
    const currentWallet = Number(playerDb?.economy?.wallet?.lupins || 0);
    const newWallet = currentWallet + lupinsGain;
    await updatePlayer(state.userId, { hp: newHp, inventory: inv, 'economy.wallet.lupins': newWallet });

    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle(`${location.emoji || '🗺️'} ${location.name} — Baú Aberto`)
      .setDescription(notes.length ? notes.join('\n') : 'O baú estava vazio...')
      .addFields({ name: 'Seu HP', value: `**${newHp}**`, inline: true }, { name: 'Lupins (Carteira)', value: `**${newWallet}**`, inline: true })
      .setFooter({ text: 'Dumblo RPG — Tesouro' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`adv_chest_open_${sid}`).setLabel('Abrir Baú').setStyle(ButtonStyle.Primary).setDisabled(true),
    );
    const invRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`aventura_view_inv_${sid}`).setLabel('Ver Inventário').setEmoji('🧳').setStyle(ButtonStyle.Secondary).setDisabled(false),
    );
    await client.cache.delete(`adv_state_${sid}`);
    try { await client.cache.delete(`adv_current_${state.userId}`); } catch {}
    return interaction.editReply({ embeds: [embed], components: [row, invRow] });
  } catch (error) {
    return ErrorHandler.handleCommandError(error, interaction);
  }
};

// ===== Aventura: NPC =====
module.exports.handleAdventureNpcTalk = async function handleAdventureNpcTalk(interaction, client) {
  try {
    await interaction.deferUpdate();
    const m = interaction.customId.match(/^adv_npc_talk_(.+)$/);
    if (!m) return;
    const sid = m[1];
    const state = await client.cache.get(`adv_state_${sid}`);
    if (!state || state.type !== 'npc') {
      return interaction.followUp({ content: 'Sessão com NPC expirada. Use `/aventura` novamente.', flags: MessageFlags.Ephemeral });
    }
    if (interaction.user.id !== state.userId) {
      return interaction.followUp({ content: 'Apenas quem iniciou a aventura pode conversar.', flags: MessageFlags.Ephemeral });
    }
    const playerDb = await getPlayer(state.userId);
    if (!playerDb) return;
    const npc = state.npc;
    const location = worldData.locations?.[state.locationId] || { name: 'Local', emoji: '🗺️' };

    // Recompensa simples de conversa: XP, e chance pequena de lupins
    const xpGain = 20 + Math.floor(Math.random() * 40);
    const lupinsGain = Math.random() < 0.25 ? (10 + Math.floor(Math.random() * 20)) : 0;
    let newXp = Number(playerDb.xp || 0) + xpGain;
    const currentWallet = Number(playerDb?.economy?.wallet?.lupins || 0);
    const newWallet = currentWallet + lupinsGain;
    let curLevel = Number(playerDb.level || 0);
    let statusPoints = Number(playerDb.statusPoints || 0);
    let leveled = false;
    while (newXp >= (curLevel + 1) * 1000) {
      newXp -= (curLevel + 1) * 1000;
      curLevel += 1;
      statusPoints += 5;
      leveled = true;
    }
    await updatePlayer(state.userId, { xp: newXp, level: curLevel, statusPoints, 'economy.wallet.lupins': newWallet });

    // Geração de fala do NPC via Groq (com fallback)
    const playerName = playerDb.name || interaction.user.username;
    const playerClass = (classes?.[playerDb.classId]?.name) || 'Aventureiro';
    const locDesc = location.description || '';
    const npcDesc = npc.description || '';
    const baseGreeting = npc.dialogue || 'Saudações.';

    let aiLine = '';
    try {
      if (client.groq) {
        const prompt = `Você é ${npc.name} (${npc.type || 'npc'}) em um RPG de fantasia, no local ${location.name} ${location.emoji || ''}.
Descrição do local: ${locDesc}
Sua personalidade: ${npcDesc}
Saudação típica: ${baseGreeting}
Jogador: ${playerName}, classe ${playerClass}, nível ${curLevel}.

Escreva uma resposta breve (1–3 frases), em português brasileiro, coerente com sua personalidade e o contexto do local. Dê uma dica temática ou comentário útil quando fizer sentido. Não ofereça ações fora do jogo, não peça dados pessoais. Não use markdown pesado, apenas texto simples.`;
        aiLine = (await client.groq.generate(prompt, { temperature: 0.7, maxTokens: 180 }))?.trim();
      }
    } catch (_) {
      aiLine = '';
    }
    if (!aiLine) aiLine = baseGreeting;

    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle(`${location.emoji || '🗺️'} ${location.name} — Conversa com ${npc.name}`)
      .setDescription(`${npc.emoji || '🧍'} ${npc.name}: ${aiLine}`)
      .addFields({ name: 'Ganhos', value: `⭐ XP: **${xpGain}**${lupinsGain ? ` • 💰 Lupins: **${lupinsGain}**` : ''}${leveled ? `\n🎉 Level UP! Agora você é nível **${curLevel}** (+5 pontos de status)` : ''}` })
      .setFooter({ text: 'Dumblo RPG — NPC' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`adv_npc_talk_${sid}`).setLabel('Conversar').setStyle(ButtonStyle.Secondary).setDisabled(true),
    );
    await client.cache.delete(`adv_state_${sid}`);
    try { await client.cache.delete(`adv_current_${state.userId}`); } catch {}
    return interaction.editReply({ embeds: [embed], components: [row] });
  } catch (error) {
    return ErrorHandler.handleCommandError(error, interaction);
  }
};

// ===== Aventura: Inventário (ver e consumir) =====
module.exports.handleAdventureInventoryView = async function handleAdventureInventoryView(interaction, client) {
  try {
    await interaction.deferUpdate();
    const cid = interaction.customId;
    const m = cid.match(/^(aventura_view_inv_|adv_inv_view_)(.+)$/);
    if (!m) return;
    const sid = m[2];
    const userId = interaction.user.id;
    const playerDb = await getPlayer(userId);
    if (!playerDb) {
      return interaction.followUp({ content: 'Perfil não encontrado.', flags: MessageFlags.Ephemeral });
    }
    const itemsMap = worldData.items || {};
    const inv = Array.isArray(playerDb.inventory) ? playerDb.inventory : [];
    const capacity = Number(playerDb.inventoryCapacity || config.game.maxInventorySize || 50);
    const slotsUsed = inv.length;

    const lines = inv.length
      ? inv.slice(0, 20).map((it) => {
          const meta = itemsMap[it.itemId] || { name: it.itemId, emoji: '📦' };
          return `${meta.emoji || '📦'} ${meta.name} x${it.quantity || 1}`;
        })
      : ['Inventário vazio. Abra baús ou vença combates para obter itens.'];

    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle('🧳 Seu Inventário')
      .setDescription(lines.join('\n'))
      .addFields(
        { name: 'Capacidade', value: `${slotsUsed}/${capacity} slots`, inline: true },
        { name: 'HP', value: `**${playerDb.hp ?? config.game.startingHP}**`, inline: true },
      )
      .setFooter({ text: 'Dumblo RPG — Inventário' })
      .setTimestamp();

    // Botões de consumo (até 5 itens consumíveis únicos)
    const consumables = [];
    const seen = new Set();
    for (const it of inv) {
      const meta = itemsMap[it.itemId];
      if (meta?.type === 'consumable' && !seen.has(it.itemId)) {
        consumables.push(meta);
        seen.add(it.itemId);
      }
      if (consumables.length >= 5) break;
    }
    const rows = [];
    if (consumables.length > 0) {
      const row = new ActionRowBuilder();
      for (const c of consumables) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`adv_use_item_${sid}__${c.id || c.itemId}`)
            .setLabel(`Usar ${c.name}`)
            .setStyle(ButtonStyle.Primary)
            .setEmoji(c.emoji || '🧪')
        );
      }
      rows.push(row);
    } else {
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`adv_use_item_${sid}__none`).setLabel('Sem consumíveis').setStyle(ButtonStyle.Secondary).setDisabled(true)
        )
      );
    }

    return interaction.editReply({ embeds: [embed], components: rows });
  } catch (error) {
    return ErrorHandler.handleCommandError(error, interaction);
  }
};

module.exports.handleAdventureUseItem = async function handleAdventureUseItem(interaction, client) {
  try {
    await interaction.deferUpdate();
    const m = interaction.customId.match(/^adv_use_item_(.+)__(.+)$/);
    if (!m) return;
    const sid = m[1];
    const itemId = m[2];
    if (!itemId || itemId === 'none') {
      return interaction.followUp({ content: 'Nenhum consumível disponível.', flags: MessageFlags.Ephemeral });
    }
    const userId = interaction.user.id;
    const playerDb = await getPlayer(userId);
    if (!playerDb) return;
    const itemsMap = worldData.items || {};
    const item = itemsMap[itemId];
    if (!item || item.type !== 'consumable') {
      return interaction.followUp({ content: 'Item não consumível ou inválido.', flags: MessageFlags.Ephemeral });
    }
    const inv = Array.isArray(playerDb.inventory) ? [...playerDb.inventory] : [];
    const idx = inv.findIndex(i => i.itemId === itemId && Number(i.quantity || 0) > 0);
    if (idx < 0) {
      return interaction.followUp({ content: 'Você não possui este item.', flags: MessageFlags.Ephemeral });
    }
    // Aplica efeito (apenas cura direta)
    const vit = Number(playerDb.stats?.vitality || 0);
    const maxHp = config.game.startingHP + vit * 2;
    const healVal = Number(item.effect?.value || item.effects?.heal || 0);
    const before = Number(playerDb.hp ?? config.game.startingHP);
    const after = Math.min(maxHp, before + Math.max(0, healVal));
    // Consome 1 unidade
    inv[idx].quantity = Number(inv[idx].quantity || 1) - 1;
    if (inv[idx].quantity <= 0) inv.splice(idx, 1);
    await updatePlayer(userId, { hp: after, inventory: inv });

    // Re-render inventário
    const lines = inv.length
      ? inv.slice(0, 20).map((it) => {
          const meta = itemsMap[it.itemId] || { name: it.itemId, emoji: '📦' };
          return `${meta.emoji || '📦'} ${meta.name} x${it.quantity || 1}`;
        })
      : ['Inventário vazio. Abra baús ou vença combates para obter itens.'];
    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle('🧳 Seu Inventário')
      .setDescription(lines.join('\n'))
      .addFields(
        { name: 'HP', value: `**${after}** (curado +${after - before})`, inline: true },
        { name: 'Uso', value: `${item.emoji || '🧪'} Usou ${item.name}.`, inline: true },
      )
      .setFooter({ text: 'Dumblo RPG — Inventário' })
      .setTimestamp();

    // Atualiza botões novamente
    const consumables = [];
    const seen = new Set();
    for (const it of inv) {
      const meta = itemsMap[it.itemId];
      if (meta?.type === 'consumable' && !seen.has(it.itemId)) {
        consumables.push(meta);
        seen.add(it.itemId);
      }
      if (consumables.length >= 5) break;
    }
    const rows = [];
    if (consumables.length > 0) {
      const row = new ActionRowBuilder();
      for (const c of consumables) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`adv_use_item_${sid}__${c.id || c.itemId}`)
            .setLabel(`Usar ${c.name}`)
            .setStyle(ButtonStyle.Primary)
            .setEmoji(c.emoji || '🧪')
        );
      }
      rows.push(row);
    } else {
      rows.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`adv_use_item_${sid}__none`).setLabel('Sem consumíveis').setStyle(ButtonStyle.Secondary).setDisabled(true)
        )
      );
    }

    return interaction.editReply({ embeds: [embed], components: rows });
  } catch (error) {
    return ErrorHandler.handleCommandError(error, interaction);
  }
};

// ===== Inventário (/inventario): equipar/desequipar/atualizar =====
function _buildInventoryUI(player, userId) {
  const itemsMap = worldData.items || {};
  const inv = Array.isArray(player.inventory) ? player.inventory : [];

  const name = player.name || 'Jogador';
  const capacity = Number(player.inventoryCapacity || 0);
  const gear = player.gear || {};
  const hasWeapon = !!gear.weapon;
  const hasArmor = !!gear.armor;
  const hasConsumable = !!gear.consumable;
  const equippedWeapon = gear?.weapon?.name || 'Nenhum';
  const equippedArmor = gear?.armor?.name || 'Nenhuma';
  const equippedConsumable = gear?.consumable?.name || 'Nenhum';

  const fmtItem = (it) => {
    const meta = itemsMap[it.itemId] || { name: it.itemId, emoji: '📦' };
    const qty = Number(it.quantity || 1);
    return `${meta.emoji || '📦'} ${meta.name} x${qty}`;
  };

  const consumables = inv.filter((i) => (itemsMap[i.itemId]?.type === 'consumable'));
  const weapons = inv.filter((i) => (itemsMap[i.itemId]?.type === 'weapon'));
  const armors = inv.filter((i) => (itemsMap[i.itemId]?.type === 'armor'));

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`🧳 Inventário de ${name}`)
    .setDescription(
      inv.length
        ? inv.slice(0, 30).map(fmtItem).join('\n')
        : 'Inventário vazio. Abra baús, vença combates ou fale com NPCs para obter itens.'
    )
    .addFields(
      { name: '📦 Capacidade', value: `${inv.length} / ${capacity || '—'}`, inline: true },
      { name: '⚙️ Equipados', value: `⚔️ Arma: ${equippedWeapon}\n🛡️ Armadura: ${equippedArmor}\n🧪 Consumível (Slot 1): ${equippedConsumable}`, inline: false },
      { name: 'ℹ️ Dica', value: 'Selecione abaixo para equipar. Use `/perfil` para ver apenas itens equipados.', inline: false },
    )
    .setFooter({ text: 'Dumblo RPG — Inventário' })
    .setTimestamp();

  // Constrói linhas condicionalmente: mostra seletor apenas quando NÃO está equipado
  const rows = [];
  if (!hasConsumable) {
    if (consumables.length > 0) {
      const consumableSelect = new StringSelectMenuBuilder()
        .setCustomId(`inv_equip_consumable_${userId}`)
        .setPlaceholder('🧪 Selecione um consumível para equipar (Slot 1)')
        .setMinValues(1)
        .setMaxValues(1);
      consumables.slice(0, 25).forEach((it) => {
        const meta = itemsMap[it.itemId];
        consumableSelect.addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel(`${meta?.name || it.itemId} x${it.quantity || 1}`)
            .setValue(meta?.id || it.itemId)
            .setDescription(meta?.description || 'Consumível')
            .setEmoji(meta?.emoji || '🧪')
        );
      });
      rows.push(new ActionRowBuilder().addComponents(consumableSelect));
    }
  }

  if (!hasWeapon) {
    if (weapons.length > 0) {
      const weaponSelect = new StringSelectMenuBuilder()
        .setCustomId(`inv_equip_weapon_${userId}`)
        .setPlaceholder('⚔️ Selecione uma arma para equipar')
        .setMinValues(1)
        .setMaxValues(1);
      weapons.slice(0, 25).forEach((it) => {
        const meta = itemsMap[it.itemId];
        weaponSelect.addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel(`${meta?.name || it.itemId}`)
            .setValue(meta?.id || it.itemId)
            .setDescription(meta?.description || 'Arma')
            .setEmoji(meta?.emoji || '⚔️')
        );
      });
      rows.push(new ActionRowBuilder().addComponents(weaponSelect));
    } else {
      const weaponSelect = new StringSelectMenuBuilder()
        .setCustomId(`inv_equip_weapon_${userId}`)
        .setPlaceholder('⚔️ Nenhuma arma no inventário')
        .setMinValues(1)
        .setMaxValues(1)
        .setDisabled(true);
      weaponSelect.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('Nenhuma arma disponível')
          .setValue('none')
          .setDescription('Você ainda não possui armas')
          .setEmoji('⚔️')
      );
      rows.push(new ActionRowBuilder().addComponents(weaponSelect));
    }
  }

  const buttons = [];
  if (hasConsumable) buttons.push(new ButtonBuilder().setCustomId(`inv_unequip_consumable_${userId}`).setLabel('Remover Consumível').setStyle(ButtonStyle.Secondary).setEmoji('🧪'));
  if (hasWeapon) buttons.push(new ButtonBuilder().setCustomId(`inv_unequip_weapon_${userId}`).setLabel('Remover Arma').setStyle(ButtonStyle.Secondary).setEmoji('⚔️'));
  if (hasArmor) buttons.push(new ButtonBuilder().setCustomId(`inv_unequip_armor_${userId}`).setLabel('Remover Armadura').setStyle(ButtonStyle.Secondary).setEmoji('🛡️'));
  buttons.push(new ButtonBuilder().setCustomId(`inv_refresh_${userId}`).setLabel('Atualizar').setStyle(ButtonStyle.Primary).setEmoji('🔄'));
  rows.push(new ActionRowBuilder().addComponents(...buttons));
  return { embed, components: rows };
}

module.exports.handleInventoryEquipConsumableSelect = async function handleInventoryEquipConsumableSelect(interaction, client) {
  try {
    await interaction.deferUpdate();
    const m = interaction.customId.match(/^inv_equip_consumable_(\d+)$/);
    if (!m) return;
    const ownerId = m[1];
    if (interaction.user.id !== ownerId) {
      return interaction.followUp({ content: 'Apenas o dono deste inventário pode interagir.', flags: MessageFlags.Ephemeral });
    }
    const value = interaction.values?.[0];
    if (!value) return;
    const player = await getPlayer(ownerId);
    if (!player) return;
    const itemsMap = worldData.items || {};
    const item = itemsMap[value];
    if (!item || item.type !== 'consumable') {
      return interaction.followUp({ content: 'Item inválido para consumo.', flags: MessageFlags.Ephemeral });
    }
    const inv = Array.isArray(player.inventory) ? player.inventory : [];
    const totalQty = inv.filter((i) => i.itemId === value).reduce((acc, i) => acc + Number(i.quantity || 0), 0);
    if (totalQty <= 0) {
      return interaction.followUp({ content: 'Você não possui unidades deste consumível.', flags: MessageFlags.Ephemeral });
    }
    const gear = Object.assign({}, player.gear || {});
    gear.consumable = {
      id: item.id,
      name: item.name,
      type: 'consumable',
      emoji: item.emoji,
      description: item.description,
      quantity: totalQty,
      slot: 1,
    };
    await updatePlayer(ownerId, { gear });

    const { embed, components } = _buildInventoryUI({ ...player, gear }, ownerId);
    await interaction.editReply({ embeds: [embed], components });
    return interaction.followUp({ content: `🧪 Equipado consumível: ${item.emoji || '🧪'} ${item.name} (Slot 1)`, flags: MessageFlags.Ephemeral });
  } catch (error) {
    return ErrorHandler.handleCommandError(error, interaction);
  }
};

module.exports.handleInventoryEquipWeaponSelect = async function handleInventoryEquipWeaponSelect(interaction, client) {
  try {
    await interaction.deferUpdate();
    const m = interaction.customId.match(/^inv_equip_weapon_(\d+)$/);
    if (!m) return;
    const ownerId = m[1];
    if (interaction.user.id !== ownerId) {
      return interaction.followUp({ content: 'Apenas o dono deste inventário pode interagir.', flags: MessageFlags.Ephemeral });
    }
    const value = interaction.values?.[0];
    if (!value) return;
    const player = await getPlayer(ownerId);
    if (!player) return;
    const itemsMap = worldData.items || {};
    const item = itemsMap[value];
    if (!item || item.type !== 'weapon') {
      return interaction.followUp({ content: 'Item inválido para arma.', flags: MessageFlags.Ephemeral });
    }
    const inv = Array.isArray(player.inventory) ? player.inventory : [];
    const hasItem = inv.some((i) => i.itemId === value);
    if (!hasItem) {
      return interaction.followUp({ content: 'Você não possui esta arma no inventário.', flags: MessageFlags.Ephemeral });
    }
    const gear = Object.assign({}, player.gear || {});
    const stats = item.stats || {};
    gear.weapon = {
      id: item.id,
      name: item.name,
      type: 'weapon',
      rarity: item.rarity,
      description: item.description,
      physicalDamage: Number(stats.physicalDamage || 0),
      magicDamage: Number(stats.magicDamage || 0),
      critBonus: Number(stats.critBonus || 0),
      critDamage: Number(stats.critDamage || 0),
    };
    await updatePlayer(ownerId, { gear });

    const { embed, components } = _buildInventoryUI({ ...player, gear }, ownerId);
    await interaction.editReply({ embeds: [embed], components });
    return interaction.followUp({ content: `⚔️ Equipada arma: ${item.emoji || '⚔️'} ${item.name}`, flags: MessageFlags.Ephemeral });
  } catch (error) {
    return ErrorHandler.handleCommandError(error, interaction);
  }
};

module.exports.handleInventoryEquipArmorSelect = async function handleInventoryEquipArmorSelect(interaction, client) {
  try {
    await interaction.deferUpdate();
    const m = interaction.customId.match(/^inv_equip_armor_(\d+)$/);
    if (!m) return;
    const ownerId = m[1];
    if (interaction.user.id !== ownerId) {
      return interaction.followUp({ content: 'Apenas o dono deste inventário pode interagir.', flags: MessageFlags.Ephemeral });
    }
    const value = interaction.values?.[0];
    if (!value) return;
    const player = await getPlayer(ownerId);
    if (!player) return;
    const itemsMap = worldData.items || {};
    const item = itemsMap[value];
    if (!item || item.type !== 'armor') {
      return interaction.followUp({ content: 'Item inválido para armadura.', flags: MessageFlags.Ephemeral });
    }
    const inv = Array.isArray(player.inventory) ? player.inventory : [];
    const hasItem = inv.some((i) => i.itemId === value);
    if (!hasItem) {
      return interaction.followUp({ content: 'Você não possui esta armadura no inventário.', flags: MessageFlags.Ephemeral });
    }
    const gear = Object.assign({}, player.gear || {});
    const stats = item.stats || {};
    gear.armor = {
      id: item.id,
      name: item.name,
      type: 'armor',
      rarity: item.rarity,
      description: item.description,
      defense: Number(stats.defense || 0),
      magicDefense: Number(stats.magicDefense || 0),
      evasion: Number(stats.evasion || 0),
      agilityBonus: Number(stats.agilityBonus || 0),
      holyResistance: Number(stats.holyResistance || 0),
    };
    await updatePlayer(ownerId, { gear });

    const { embed, components } = _buildInventoryUI({ ...player, gear }, ownerId);
    await interaction.editReply({ embeds: [embed], components });
    return interaction.followUp({ content: `🛡️ Equipada armadura: ${item.emoji || '🛡️'} ${item.name}`, flags: MessageFlags.Ephemeral });
  } catch (error) {
    return ErrorHandler.handleCommandError(error, interaction);
  }
};

module.exports.handleInventoryUnequipOrRefresh = async function handleInventoryUnequipOrRefresh(interaction, client) {
  try {
    await interaction.deferUpdate();
    const cid = interaction.customId;
    const mUnequip = cid.match(/^inv_unequip_(consumable|weapon|armor)_(\d+)$/);
    const mRefresh = cid.match(/^inv_refresh_(\d+)$/);
    const ownerId = mUnequip ? mUnequip[2] : (mRefresh ? mRefresh[1] : null);
    if (!ownerId) return;
    if (interaction.user.id !== ownerId) {
      return interaction.followUp({ content: 'Apenas o dono deste inventário pode interagir.', flags: MessageFlags.Ephemeral });
    }

    const player = await getPlayer(ownerId);
    if (!player) return;

    let msg = null;
    if (mUnequip) {
      const slot = mUnequip[1];
      const gear = Object.assign({}, player.gear || {});
      if (slot === 'consumable') gear.consumable = null;
      if (slot === 'weapon') gear.weapon = null;
      if (slot === 'armor') gear.armor = null;
      await updatePlayer(ownerId, { gear });
      msg = slot === 'consumable' ? '🧪 Consumível removido.' : (slot === 'weapon' ? '⚔️ Arma removida.' : '🛡️ Armadura removida.');
      const { embed, components } = _buildInventoryUI({ ...player, gear }, ownerId);
      await interaction.editReply({ embeds: [embed], components });
    } else {
      const { embed, components } = _buildInventoryUI(player, ownerId);
      await interaction.editReply({ embeds: [embed], components });
      msg = '🔄 UI atualizada.';
    }

    return interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral });
  } catch (error) {
    return ErrorHandler.handleCommandError(error, interaction);
  }
};

// ===== Economia: Handlers de confirmação =====
module.exports.handleDepositConfirmOrCancel = async function handleDepositConfirmOrCancel(interaction, client) {
  try {
    await interaction.deferUpdate();
    const cid = interaction.customId;
    if (cid.startsWith('econ_deposit_cancel_')) {
      const requesterId = cid.replace('econ_deposit_cancel_', '');
      if (interaction.user.id !== requesterId) {
        return interaction.followUp({ content: 'Apenas quem iniciou a operação pode cancelar.', flags: MessageFlags.Ephemeral });
      }
      const embed = new EmbedBuilder().setColor(config.colors.error).setTitle('Operação cancelada').setDescription('Depósito cancelado.').setTimestamp();
      return interaction.editReply({ embeds: [embed], components: [] });
    }
    const m = cid.match(/^econ_deposit_confirm_(\d+)_(\d+)$/);
    if (!m) return;
    const requesterId = m[1];
    const amount = parseInt(m[2], 10) || 0;
    if (interaction.user.id !== requesterId) {
      return interaction.followUp({ content: 'Apenas quem iniciou a operação pode confirmar.', flags: MessageFlags.Ephemeral });
    }
    const player = await getPlayer(requesterId);
    const wallet = Number(player?.economy?.wallet?.lupins || 0);
    const bank = Number(player?.economy?.bank?.lupins || 0);
    if (amount <= 0 || wallet < amount) {
      const embed = new EmbedBuilder().setColor(config.colors.error).setTitle('Falha no depósito').setDescription('Valor inválido ou saldo insuficiente.').setTimestamp();
      return interaction.editReply({ embeds: [embed], components: [] });
    }
    const newWallet = wallet - amount;
    const newBank = bank + amount;
    const history = Array.isArray(player?.economy?.history) ? player.economy.history.slice(-49) : [];
    history.push({ type: 'deposit', amount, at: new Date().toISOString() });
    await updatePlayer(requesterId, { economy: { wallet: { lupins: newWallet }, bank: { lupins: newBank }, history } });
    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('🏦 Depósito realizado')
      .setDescription(`Depositado **${amount}** <:lupins:1435488880609595485> no banco.`)
      .addFields(
        { name: '👜 Carteira', value: `${newWallet} <:lupins:1435488880609595485>`, inline: true },
        { name: '🏦 Banco', value: `${newBank} <:lupins:1435488880609595485>`, inline: true },
      )
      .setTimestamp();
    return interaction.editReply({ embeds: [embed], components: [] });
  } catch (error) {
    return ErrorHandler.handleCommandError(error, interaction);
  }
};

module.exports.handleWithdrawConfirmOrCancel = async function handleWithdrawConfirmOrCancel(interaction, client) {
  try {
    await interaction.deferUpdate();
    const cid = interaction.customId;
    if (cid.startsWith('econ_withdraw_cancel_')) {
      const requesterId = cid.replace('econ_withdraw_cancel_', '');
      if (interaction.user.id !== requesterId) {
        return interaction.followUp({ content: 'Apenas quem iniciou a operação pode cancelar.', flags: MessageFlags.Ephemeral });
      }
      const embed = new EmbedBuilder().setColor(config.colors.error).setTitle('Operação cancelada').setDescription('Saque cancelado.').setTimestamp();
      return interaction.editReply({ embeds: [embed], components: [] });
    }
    const m = cid.match(/^econ_withdraw_confirm_(\d+)_(\d+)$/);
    if (!m) return;
    const requesterId = m[1];
    const amount = parseInt(m[2], 10) || 0;
    if (interaction.user.id !== requesterId) {
      return interaction.followUp({ content: 'Apenas quem iniciou a operação pode confirmar.', flags: MessageFlags.Ephemeral });
    }
    const player = await getPlayer(requesterId);
    const wallet = Number(player?.economy?.wallet?.lupins || 0);
    const bank = Number(player?.economy?.bank?.lupins || 0);
    if (amount <= 0 || bank < amount) {
      const embed = new EmbedBuilder().setColor(config.colors.error).setTitle('Falha no saque').setDescription('Valor inválido ou saldo insuficiente no banco.').setTimestamp();
      return interaction.editReply({ embeds: [embed], components: [] });
    }
    const newWallet = wallet + amount;
    const newBank = bank - amount;
    const history = Array.isArray(player?.economy?.history) ? player.economy.history.slice(-49) : [];
    history.push({ type: 'withdraw', amount, at: new Date().toISOString() });
    await updatePlayer(requesterId, { economy: { wallet: { lupins: newWallet }, bank: { lupins: newBank }, history } });
    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('💸 Saque realizado')
      .setDescription(`Sacado **${amount}** <:lupins:1435488880609595485> do banco.`)
      .addFields(
        { name: '👜 Carteira', value: `${newWallet} <:lupins:1435488880609595485>`, inline: true },
        { name: '🏦 Banco', value: `${newBank} <:lupins:1435488880609595485>`, inline: true },
      )
      .setTimestamp();
    return interaction.editReply({ embeds: [embed], components: [] });
  } catch (error) {
    return ErrorHandler.handleCommandError(error, interaction);
  }
};

module.exports.handleTransferConfirmOrCancel = async function handleTransferConfirmOrCancel(interaction, client) {
  try {
    await interaction.deferUpdate();
    const cid = interaction.customId;
    if (cid.startsWith('econ_transfer_cancel_')) {
      const requesterId = cid.replace('econ_transfer_cancel_', '');
      if (interaction.user.id !== requesterId) {
        return interaction.followUp({ content: 'Apenas quem iniciou a operação pode cancelar.', flags: MessageFlags.Ephemeral });
      }
      const embed = new EmbedBuilder().setColor(config.colors.error).setTitle('Operação cancelada').setDescription('Transferência cancelada.').setTimestamp();
      return interaction.editReply({ embeds: [embed], components: [] });
    }
    const m = cid.match(/^econ_transfer_confirm_(\d+)_(\d+)_(\d+)$/);
    if (!m) return;
    const requesterId = m[1];
    const targetId = m[2];
    const amount = parseInt(m[3], 10) || 0;
    if (interaction.user.id !== requesterId) {
      return interaction.followUp({ content: 'Apenas quem iniciou a operação pode confirmar.', flags: MessageFlags.Ephemeral });
    }
    const sender = await getPlayer(requesterId);
    const receiver = await getPlayer(targetId);
    const sWallet = Number(sender?.economy?.wallet?.lupins || 0);
    const rWallet = Number(receiver?.economy?.wallet?.lupins || 0);
    if (amount <= 0 || sWallet < amount) {
      const embed = new EmbedBuilder().setColor(config.colors.error).setTitle('Falha na transferência').setDescription('Valor inválido ou saldo insuficiente.').setTimestamp();
      return interaction.editReply({ embeds: [embed], components: [] });
    }
    const newSenderWallet = sWallet - amount;
    const newReceiverWallet = rWallet + amount;
    const sHistory = Array.isArray(sender?.economy?.history) ? sender.economy.history.slice(-49) : [];
    const rHistory = Array.isArray(receiver?.economy?.history) ? receiver.economy.history.slice(-49) : [];
    const nowIso = new Date().toISOString();
    sHistory.push({ type: 'transfer_out', amount, to: targetId, at: nowIso });
    rHistory.push({ type: 'transfer_in', amount, from: requesterId, at: nowIso });
    await updatePlayer(requesterId, { economy: { wallet: { lupins: newSenderWallet }, history: sHistory } });
    await updatePlayer(targetId, { economy: { wallet: { lupins: newReceiverWallet }, history: rHistory } });
    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('🤝 Transferência realizada')
      .setDescription(`Transferido **${amount}** <:lupins:1435488880609595485> para <@${targetId}>.`)
      .addFields(
        { name: '👜 Sua Carteira', value: `${newSenderWallet} <:lupins:1435488880609595485>`, inline: true },
        { name: '👜 Carteira do Destino', value: `${newReceiverWallet} <:lupins:1435488880609595485>`, inline: true },
      )
      .setTimestamp();
    return interaction.editReply({ embeds: [embed], components: [] });
  } catch (error) {
    return ErrorHandler.handleCommandError(error, interaction);
  }
};

// ===== Economia: Navegação do histórico =====
module.exports.handleHistoryNav = async function handleHistoryNav(interaction, client) {
  try {
    await interaction.deferUpdate();
    // suporta ambos padrões: antigo e novos com papel do botão
    const mNew = interaction.customId.match(/^econ_hist_nav_(first|prev|next|last)_(\d+)_(\d+)$/);
    const mOld = interaction.customId.match(/^econ_hist_nav_(\d+)_(\d+)$/);
    let requesterId, targetPage;
    if (mNew) {
      requesterId = mNew[2];
      targetPage = parseInt(mNew[3], 10) || 1;
    } else if (mOld) {
      requesterId = mOld[1];
      targetPage = parseInt(mOld[2], 10) || 1;
    } else {
      return;
    }
    if (interaction.user.id !== requesterId) {
      return interaction.followUp({ content: 'Apenas quem abriu o extrato pode navegar.', flags: MessageFlags.Ephemeral });
    }

    const player = await getPlayer(requesterId);
    const history = Array.isArray(player?.economy?.history) ? player.economy.history.slice().reverse() : [];
    const perPage = 6;
    const total = history.length;
    const pages = Math.max(1, Math.ceil(total / perPage));
    const current = Math.min(Math.max(1, targetPage), pages);
    const start = (current - 1) * perPage;
    const slice = history.slice(start, start + perPage);

    function fmt(n) { return Number(n || 0).toLocaleString('pt-BR'); }
    function kindMeta(entry) {
      switch (entry?.type) {
        case 'daily': return { dot: '🟢', sign: '+', label: 'daily', sub: 'Recompensa diária' };
        case 'deposit': return { dot: '🟠', sign: '↔️', label: 'depósito', sub: 'Movimento para o banco' };
        case 'withdraw': return { dot: '🟠', sign: '↔️', label: 'saque', sub: 'Movimento para a carteira' };
        case 'transfer_in': return { dot: '🟢', sign: '+', label: 'transferência recebida', sub: `De <@${entry?.from}>` };
        case 'transfer_out': return { dot: '🔴', sign: '-', label: 'transferência enviada', sub: `Para <@${entry?.to}>` };
        default: return { dot: '⚪️', sign: '·', label: 'movimento', sub: '' };
      }
    }
    const { time, TimestampStyles, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const lines = slice.map(e => {
      const meta = kindMeta(e);
      const when = e?.at ? time(Math.floor(new Date(e.at).getTime() / 1000), TimestampStyles.RelativeTime) : 'agora';
      const top = `${meta.dot} ${meta.sign} ${fmt(e?.amount)} <:lupins:1435488880609595485> ${when} — ${meta.label}`;
      const bottom = meta.sub || '';
      return bottom ? `${top}\n${bottom}` : top;
    }).join('\n\n');

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('📜 Extrato de Lupins')
      .setDescription(lines.length ? lines : 'Nenhuma transação encontrada.')
      .setFooter({ text: `Página ${current}/${pages}` })
      .setTimestamp();

    const firstBtn = new ButtonBuilder().setCustomId(`econ_hist_nav_${requesterId}_1`).setEmoji('⏮️').setStyle(ButtonStyle.Secondary).setDisabled(current <= 1);
    const prevBtn = new ButtonBuilder().setCustomId(`econ_hist_nav_${requesterId}_${current - 1}`).setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(current <= 1);
    const pageBtn = new ButtonBuilder().setCustomId('econ_hist_page').setLabel(`${current}/${pages}`).setStyle(ButtonStyle.Secondary).setDisabled(true);
    const nextBtn = new ButtonBuilder().setCustomId(`econ_hist_nav_${requesterId}_${current + 1}`).setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(current >= pages);
    const lastBtn = new ButtonBuilder().setCustomId(`econ_hist_nav_${requesterId}_${pages}`).setEmoji('⏭️').setStyle(ButtonStyle.Secondary).setDisabled(current >= pages);
    const row = new ActionRowBuilder().addComponents(firstBtn, prevBtn, pageBtn, nextBtn, lastBtn);

    return interaction.editReply({ embeds: [embed], components: [row] });
  } catch (error) {
    return ErrorHandler.handleCommandError(error, interaction);
  }
};

// ==========================================
// Ajuda (/help): seleção e paginação
// ==========================================

function _displayCategory(cat) {
  const map = { rpg: 'RPG', profile: 'Perfil', utility: 'Utilidade', admin: 'Admin', uncategorized: 'Outros', all: 'Todas' };
  return map[cat] || (cat?.charAt(0).toUpperCase() + cat?.slice(1) || 'Outros');
}

function _emojiForCategory(cat) {
  const map = { rpg: '⚔️', profile: '🪪', utility: '🛠️', admin: '🛡️', uncategorized: '📦', all: '🗂️' };
  return map[cat] || '📦';
}

function _buildLinkButtons() {
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  const commandsUrl = 'https://dumblo.netlify.app/comandos';
  const termsUrl = 'https://dumblo.netlify.app/termos';
  const supportUrl = 'https://discord.gg/6daVxgAudS';
  const btnCommands = new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setLabel('🌐 Ver Comandos')
    .setURL(commandsUrl);
  const btnTerms = new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setLabel('📄 Termos de Serviço')
    .setURL(termsUrl);
  const btnSupport = new ButtonBuilder()
    .setStyle(ButtonStyle.Link)
    .setLabel('🛟 Servidor de Suporte')
    .setURL(supportUrl);
  return new ActionRowBuilder().addComponents(btnCommands, btnTerms, btnSupport);
}

function _buildCategoryMenu(client, userId, selected, hasAdminAccess = false) {
  const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
  const categories = new Set();
  for (const cmd of client.commands.values()) categories.add(cmd.category || 'uncategorized');
  if (!hasAdminAccess && categories.has('admin')) categories.delete('admin');
  const knownOrder = ['rpg', 'profile', 'utility', 'admin'];
  const ordered = [...categories].sort((a, b) => {
    const ia = knownOrder.indexOf(a);
    const ib = knownOrder.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`help_select_${userId}`)
    .setPlaceholder('Selecione uma categoria');

  for (const cat of ordered) {
    const opt = new StringSelectMenuOptionBuilder()
      .setLabel(`${_emojiForCategory(cat)} ${_displayCategory(cat)}`)
      .setValue(cat)
      .setDescription(`Comandos de ${_displayCategory(cat)}`);
    if (selected && selected === cat) opt.setDefault(true);
    menu.addOptions(opt);
  }

  const allOpt = new StringSelectMenuOptionBuilder()
    .setLabel(`${_emojiForCategory('all')} Todas`)
    .setValue('all')
    .setDescription('Mostrar todos os comandos');
  if (selected === 'all') allOpt.setDefault(true);
  menu.addOptions(allOpt);

  return menu;
}

function _getCommands(client, category, hasAdminAccess) {
  const list = [];
  for (const cmd of client.commands.values()) {
    const cat = cmd.category || 'uncategorized';
    if ((!category || category === 'all' || cat === category) && (hasAdminAccess || cat !== 'admin')) {
      const name = cmd?.data?.name || 'comando';
      const description = cmd?.data?.description || 'Sem descrição';
      list.push({ name, description, category: cat });
    }
  }
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

function _buildHelpPage(client, userId, category, page = 1, hasAdminAccess = false) {
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  const all = _getCommands(client, category, hasAdminAccess);
  const total = all.length;
  const perPage = 10;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(Math.max(1, Number(page) || 1), pages);
  const start = (current - 1) * perPage;
  const slice = all.slice(start, start + perPage);

  const lines = slice.map(c => `• /${c.name} — ${c.description}`).join('\n');

  const embed = new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle(`Ajuda — ${_displayCategory(category || 'all')}`)
    .setDescription(lines.length ? lines : 'Nenhum comando nesta categoria.')
    .addFields(
      { name: 'Página', value: `${current}/${pages}`, inline: true },
      { name: 'Total', value: `${total}`, inline: true },
    )
    .setThumbnail(client.user.displayAvatarURL({ size: 128 }))
    .setFooter({ text: 'Dumblo RPG' })
    .setTimestamp();

  const components = [];
  const menu = _buildCategoryMenu(client, userId, category, hasAdminAccess);
  components.push(new ActionRowBuilder().addComponents(menu));

  if (pages > 1) {
    const prevBtn = new ButtonBuilder()
      .setCustomId(`help_nav_${userId}_${category}_${current - 1}`)
      .setLabel('◀️ Anterior')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(current <= 1);
    const nextBtn = new ButtonBuilder()
      .setCustomId(`help_nav_${userId}_${category}_${current + 1}`)
      .setLabel('▶️ Próxima')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(current >= pages);
    components.push(new ActionRowBuilder().addComponents(prevBtn, nextBtn));
  }

  // Botão Voltar
  const backBtn = new ButtonBuilder()
    .setCustomId(`help_back_${userId}`)
    .setLabel('↩️ Voltar')
    .setStyle(ButtonStyle.Secondary);
  components.push(new ActionRowBuilder().addComponents(backBtn));

  // Links externos
  components.push(_buildLinkButtons());

  return { embed, components };
}

module.exports.handleHelpSelect = async function handleHelpSelect(interaction, client) {
  try {
    await interaction.deferUpdate();
    const requesterId = interaction.customId.replace('help_select_', '');
    if (interaction.user.id !== requesterId) {
      return interaction.followUp({ content: 'Apenas quem executou /help pode usar este menu.', flags: MessageFlags.Ephemeral });
    }
    const category = interaction.values?.[0] || 'all';
    const memberPerms = interaction.memberPermissions;
    const guildAdmin = memberPerms?.has?.('Administrator') || memberPerms?.has?.('ManageGuild');
    let dbAdmin = false; try { dbAdmin = await isAdmin(requesterId); } catch { dbAdmin = false; }
    const hasAdminAccess = Boolean(guildAdmin || dbAdmin);
    const view = _buildHelpPage(client, requesterId, category, 1, hasAdminAccess);
    return interaction.editReply({ embeds: [view.embed], components: view.components });
  } catch (error) {
    return ErrorHandler.handleCommandError(error, interaction);
  }
};

module.exports.handleHelpNav = async function handleHelpNav(interaction, client) {
  try {
    await interaction.deferUpdate();
    const m = interaction.customId.match(/^help_nav_(\d+)_(.+)_(\d+)$/);
    if (!m) return;
    const requesterId = m[1];
    const category = m[2];
    const targetPage = parseInt(m[3], 10) || 1;
    if (interaction.user.id !== requesterId) {
      return interaction.followUp({ content: 'Apenas quem executou /help pode navegar.', flags: MessageFlags.Ephemeral });
    }
    const memberPerms = interaction.memberPermissions;
    const guildAdmin = memberPerms?.has?.('Administrator') || memberPerms?.has?.('ManageGuild');
    let dbAdmin = false; try { dbAdmin = await isAdmin(requesterId); } catch { dbAdmin = false; }
    const hasAdminAccess = Boolean(guildAdmin || dbAdmin);
    const view = _buildHelpPage(client, requesterId, category, targetPage, hasAdminAccess);
    return interaction.editReply({ embeds: [view.embed], components: view.components });
  } catch (error) {
    return ErrorHandler.handleCommandError(error, interaction);
  }
};

module.exports.handleHelpBack = async function handleHelpBack(interaction, client) {
  try {
    await interaction.deferUpdate();
    const requesterId = interaction.customId.replace('help_back_', '');
    if (interaction.user.id !== requesterId) {
      return interaction.followUp({ content: 'Apenas quem executou /help pode voltar.', flags: MessageFlags.Ephemeral });
    }

    // Boas-vindas
    const welcome = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('Ajuda do Dumblo 🧭')
      .setDescription([
        'Bem-vindo ao Dumblo! ⚔️ Um bot de RPG para Discord com criação de personagem, atributos e progressão.',
        '',
        'Como obter ajuda:',
        '• Use `/start` para começar e `/profile` para ver seu progresso;',
        '• Use `/status` para distribuir pontos (parcial, pontos não usados retornam);',
        '• Entre no nosso servidor de suporte para tirar dúvidas e reportar problemas;',
        '• Visite a página de comandos para ver todas as funcionalidades.',
      ].join('\n'))
      .setThumbnail(client.user.displayAvatarURL({ size: 128 }))
      .setTimestamp();

    const links = _buildLinkButtons();
    return interaction.editReply({ embeds: [welcome], components: [links] });
  } catch (error) {
    return ErrorHandler.handleCommandError(error, interaction);
  }
};

const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const ErrorHandler = require('../../utils/errorHandler');
const { getPlayer } = require('../../database/queries');
const config = require('../../config/config');
const worldData = require('../../data/world_1_data.json');

function buildInventoryEmbed(player, userId) {
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
    .setColor(config.colors?.primary || '#5865F2')
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

  // Construção condicional: seletor só aparece quando NÃO está equipado
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

  if (!hasArmor) {
    if (armors.length > 0) {
      const armorSelect = new StringSelectMenuBuilder()
        .setCustomId(`inv_equip_armor_${userId}`)
        .setPlaceholder('🛡️ Selecione uma armadura para equipar')
        .setMinValues(1)
        .setMaxValues(1);
      armors.slice(0, 25).forEach((it) => {
        const meta = itemsMap[it.itemId];
        armorSelect.addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel(`${meta?.name || it.itemId}`)
            .setValue(meta?.id || it.itemId)
            .setDescription(meta?.description || 'Armadura')
            .setEmoji(meta?.emoji || '🛡️')
        );
      });
      rows.push(new ActionRowBuilder().addComponents(armorSelect));
    } else {
      const armorSelect = new StringSelectMenuBuilder()
        .setCustomId(`inv_equip_armor_${userId}`)
        .setPlaceholder('🛡️ Nenhuma armadura no inventário')
        .setMinValues(1)
        .setMaxValues(1)
        .setDisabled(true);
      armorSelect.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('Nenhuma armadura disponível')
          .setValue('none')
          .setDescription('Você ainda não possui armaduras')
          .setEmoji('🛡️')
      );
      rows.push(new ActionRowBuilder().addComponents(armorSelect));
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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inventario')
    .setDescription('🧳 Veja seus itens e equipe consumível (slot 1), arma e armadura'),
  category: 'rpg',
  cooldown: 4,
  permissions: [],
  async execute(interaction) {
    try {
      const player = await getPlayer(interaction.user.id);
      if (!player) {
        const embed = new EmbedBuilder()
          .setColor(config.colors.error)
          .setTitle('❌ Inventário indisponível')
          .setDescription('Você ainda não criou um personagem. Use `/start` para começar.')
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      const { embed, components } = buildInventoryEmbed(player, interaction.user.id);
      return interaction.reply({ embeds: [embed], components, flags: MessageFlags.Ephemeral });
    } catch (error) {
      await ErrorHandler.handleCommandError(error, interaction);
    }
  },
};

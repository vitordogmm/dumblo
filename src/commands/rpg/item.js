const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
} = require('discord.js');
const ErrorHandler = require('../../utils/errorHandler');
const { getPlayer } = require('../../database/queries');
const config = require('../../config/config');
const worldData = require('../../data/world_1_data.json');

function buildWelcomeItemUI(player, userId) {
  const itemsMap = worldData.items || {};
  const inv = Array.isArray(player.inventory) ? player.inventory : [];
  const name = player.name || 'Jogador';

  const embed = new EmbedBuilder()
    .setColor(config.colors?.primary || '#5865F2')
    .setTitle(`📦 Itens de ${name}`)
    .setDescription(inv.length
      ? 'Selecione um item abaixo para ver detalhes.'
      : 'Você não possui itens no inventário ainda.')
    .setFooter({ text: 'Dumblo RPG — Itens' })
    .setTimestamp();

  if (inv.length === 0) {
    return { embed, components: [] };
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`item_select_${userId}`)
    .setPlaceholder('Selecione um item')
    .setMinValues(1)
    .setMaxValues(1);

  const byIdQty = new Map();
  for (const it of inv) {
    const qty = Number(it.quantity || 1);
    byIdQty.set(it.itemId, (byIdQty.get(it.itemId) || 0) + qty);
  }

  const optionIds = Array.from(byIdQty.keys());
  optionIds.slice(0, 25).forEach((id) => {
    const meta = itemsMap[id];
    if (!meta) return;
    const qty = byIdQty.get(id) || 0;
    select.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(`${meta.emoji || '📦'} ${meta.name}`)
        .setValue(meta.id || id)
        .setDescription(`${meta.type || 'item'} • ${meta.rarity || 'common'}${qty > 0 ? ` • x${qty}` : ''}`)
    );
  });

  const row = new ActionRowBuilder().addComponents(select);
  return { embed, components: [row] };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('item')
    .setDescription('Veja informações detalhadas dos seus itens via select'),
  category: 'rpg',
  cooldown: 3,
  permissions: [],
  async execute(interaction) {
    try {
      const player = await getPlayer(interaction.user.id);
      if (!player) {
        const embed = new EmbedBuilder()
          .setColor(config.colors.error)
          .setTitle('❌ Perfil não encontrado')
          .setDescription('Você ainda não criou um personagem. Use `/start` para começar.')
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      const { embed, components } = buildWelcomeItemUI(player, interaction.user.id);
      return interaction.reply({ embeds: [embed], components, flags: MessageFlags.Ephemeral });
    } catch (error) {
      await ErrorHandler.handleCommandError(error, interaction);
    }
  },
};


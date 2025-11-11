const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getPlayer } = require('../../database/queries');
const ErrorHandler = require('../../utils/errorHandler');
const logger = require('../../utils/logger');
const config = require('../../config/config');

const LUPINS_EMOJI = '<:lupins:1435488880609595485>';
const ORANGE = config.colors.primary || '#FF8C00';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sacar')
    .setDescription('💸 Sacar lupins do banco para a carteira')
    .addIntegerOption(opt => opt.setName('quantidade').setDescription('Quantidade para sacar').setMinValue(1).setRequired(true)),
  category: 'rpg',
  cooldown: 3,
  permissions: [],
  async execute(interaction) {
    try {
      const userId = interaction.user.id;
      const amount = interaction.options.getInteger('quantidade', true);
      logger.info(`${interaction.user.tag} executou /sacar ${amount}`);

      const player = await getPlayer(userId);
      if (!player) {
        const embed = new EmbedBuilder()
          .setColor(config.colors.error)
          .setTitle('❌ Perfil não encontrado')
          .setDescription('Você ainda não criou um personagem. Use `/start` para começar.')
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      const wallet = Number(player?.economy?.wallet?.lupins || 0);
      const bank = Number(player?.economy?.bank?.lupins || 0);

      if (amount <= 0) {
        const embed = new EmbedBuilder()
          .setColor(config.colors.error)
          .setTitle('Valor inválido')
          .setDescription('Informe uma quantidade positiva para sacar.')
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }
      if (bank < amount) {
        const embed = new EmbedBuilder()
          .setColor(config.colors.error)
          .setTitle('Saldo insuficiente no banco')
          .setDescription(`Você tem **${bank}** ${LUPINS_EMOJI} no banco, mas quer sacar **${amount}**.`)
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      const embed = new EmbedBuilder()
        .setColor(ORANGE)
        .setTitle('Confirmar Saque')
        .setDescription(`Deseja sacar **${amount}** ${LUPINS_EMOJI} do banco para a carteira?`)
        .addFields(
          { name: '🏦 Banco', value: `${bank} ${LUPINS_EMOJI} → ${bank - amount} ${LUPINS_EMOJI}`, inline: true },
          { name: '👜 Carteira', value: `${wallet} ${LUPINS_EMOJI} → ${wallet + amount} ${LUPINS_EMOJI}`, inline: true },
        )
        .setFooter({ text: 'Dumblo RPG' })
        .setTimestamp();

      const confirmBtn = new ButtonBuilder()
        .setCustomId(`econ_withdraw_confirm_${userId}_${amount}`)
        .setLabel('✅ Confirmar')
        .setStyle(ButtonStyle.Success);
      const cancelBtn = new ButtonBuilder()
        .setCustomId(`econ_withdraw_cancel_${userId}`)
        .setLabel('❌ Cancelar')
        .setStyle(ButtonStyle.Secondary);
      const row = new ActionRowBuilder().addComponents(confirmBtn, cancelBtn);

      return interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
    } catch (error) {
      await ErrorHandler.handleCommandError(error, interaction);
    }
  },
};


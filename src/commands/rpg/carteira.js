const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getPlayer } = require('../../database/queries');
const ErrorHandler = require('../../utils/errorHandler');
const logger = require('../../utils/logger');
const config = require('../../config/config');

const LUPINS_EMOJI = '<:lupins:1435488880609595485>';
const ORANGE = config.colors.primary || '#FF8C00';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('carteira')
    .setDescription('💼 Veja seus saldos de lupins (carteira e banco)'),
  category: 'rpg',
  cooldown: 3,
  permissions: [],
  async execute(interaction) {
    try {
      const userId = interaction.user.id;
      logger.info(`${interaction.user.tag} executou /carteira`);

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

      const embed = new EmbedBuilder()
        .setColor(ORANGE)
        .setTitle('💼 Sua Carteira')
        .setDescription('Aqui estão seus saldos atuais de lupins:')
        .addFields(
          { name: '👜 Carteira', value: `**${wallet}** ${LUPINS_EMOJI}`, inline: true },
          { name: '🏦 Banco', value: `**${bank}** ${LUPINS_EMOJI}`, inline: true },
        )
        .setFooter({ text: 'Dumblo RPG' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      await ErrorHandler.handleCommandError(error, interaction);
    }
  },
};


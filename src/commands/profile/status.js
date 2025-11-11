const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getPlayer } = require('../../database/queries');
const ErrorHandler = require('../../utils/errorHandler');
const logger = require('../../utils/logger');
const config = require('../../config/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('📈 Veja e distribua seus pontos de status'),
  category: 'rpg',
  cooldown: 3,
  permissions: [],
  async execute(interaction, client) {
    try {
      const userId = interaction.user.id;
      logger.info(`${interaction.user.tag} executou /status`);

      const player = await getPlayer(userId);
      if (!player) {
        const embed = new EmbedBuilder()
          .setColor(config.colors.error)
          .setTitle('❌ Perfil não encontrado')
          .setDescription('Você ainda não criou um personagem. Use `/start` para começar.')
          .setFooter({ text: 'Dumblo RPG', iconURL: interaction.client.user.displayAvatarURL() })
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      const stats = player.stats || {};
      const available = Number(player.statusPoints || 0);

      const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle(`📊 Status de ${player.name}`)
        .setDescription('Distribua pontos para melhorar seus atributos.\n\nCarisma não pode ser modificado por enquanto.')
        .addFields(
          { name: 'Atributos', value: `💪 Força: **${stats.strength ?? 0}**\n🧠 Inteligência: **${stats.intelligence ?? 0}**\n⚡ Agilidade: **${stats.agility ?? 0}**\n❤️ Vitalidade: **${stats.vitality ?? 0}**\n🍀 Sorte: **${stats.luck ?? 0}**\n💬 Carisma: **${stats.charisma ?? 0}**`, inline: false },
          { name: 'Pontos Disponíveis', value: `**${available}**`, inline: true },
        )
        .setFooter({ text: 'Dumblo RPG', iconURL: interaction.client.user.displayAvatarURL() })
        .setTimestamp();

      const allocateBtn = new ButtonBuilder()
        .setCustomId(`allocate_status_${userId}`)
        .setLabel(available > 0 ? `Distribuir Pontos (${available})` : 'Sem Pontos Disponíveis')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(available <= 0);

      const row = new ActionRowBuilder().addComponents(allocateBtn);
      return interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
    } catch (error) {
      await ErrorHandler.handleCommandError(error, interaction);
    }
  },
};

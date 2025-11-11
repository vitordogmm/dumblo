const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { playerExists } = require('../../database/queries');
const ErrorHandler = require('../../utils/errorHandler');
const logger = require('../../utils/logger');
const config = require('../../config/config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('start')
    .setDescription('🎮 Comece sua aventura em Dumblo!'),
  category: 'rpg',
  cooldown: 0,
  permissions: [],
  async execute(interaction, client) {
    try {
      const userId = interaction.user.id;
      logger.info(`${interaction.user.tag} executou /start`);

      const exists = await playerExists(userId);
      if (exists) {
        const { EmbedBuilder, MessageFlags } = require('discord.js');
        const embed = new EmbedBuilder()
          .setColor(config.colors.error)
          .setTitle('⚠️ Você Já Começou!')
          .setDescription('Você já tem um personagem criado.\n\nUse `/profile` para ver suas informações.')
          .setFooter({ text: 'Dumblo RPG', iconURL: interaction.client.user.displayAvatarURL() })
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      const modal = new ModalBuilder()
        .setCustomId(`create_character_${userId}`)
        .setTitle('✨ Criar Personagem');

      const nameInput = new TextInputBuilder()
        .setCustomId('character_name')
        .setLabel('Nome do seu personagem')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: Aragorn, Legolas, Gandalf')
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(20);

      const row = new ActionRowBuilder().addComponents(nameInput);
      modal.addComponents(row);

      await interaction.showModal(modal);
      logger.info(`Modal de criação enviado para ${interaction.user.tag}`);
    } catch (error) {
      await ErrorHandler.handleCommandError(error, interaction);
    }
  },
};


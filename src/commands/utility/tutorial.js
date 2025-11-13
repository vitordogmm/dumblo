const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ErrorHandler = require('../../utils/errorHandler');
const logger = require('../../utils/logger');
const config = require('../../config/config');

function buildTutorialEmbed(client) {
  const bot = client.user;
  return new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle('Tutorial do Dumblo 📘')
    .setDescription([
      'Bem-vindo! Este é o guia oficial do Dumblo com passos para começar, entender os sistemas e dominar suas aventuras.',
      '',
      '• Abrir tutorial: botão abaixo',
      '• Acessar servidor de suporte: botão abaixo',
    ].join('\n'))
    .setThumbnail(bot.displayAvatarURL({ size: 128 }))
    .setFooter({ text: config.bot.name })
    .setTimestamp();
}

function buildLinkButtons() {
  const docUrl = 'https://dumblo.netlify.app/doc';
  const supportUrl = 'https://discord.gg/6daVxgAudS';
  const btnDoc = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('📘 Abrir Tutorial').setURL(docUrl);
  const btnSupport = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('🛟 Servidor de Suporte').setURL(supportUrl);
  return new ActionRowBuilder().addComponents(btnDoc, btnSupport);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tutorial')
    .setDescription('📘 Abrir o tutorial do Dumblo e o servidor de suporte'),
  category: 'utility',
  cooldown: 0,
  permissions: [],
  async execute(interaction, client) {
    try {
      logger.info(`${interaction.user.tag} executou /tutorial`);
      const embed = buildTutorialEmbed(client);
      const links = buildLinkButtons();
      return interaction.reply({ embeds: [embed], components: [links] });
    } catch (error) {
      await ErrorHandler.handleCommandError(error, interaction);
    }
  },
};

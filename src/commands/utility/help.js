const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ErrorHandler = require('../../utils/errorHandler');
const logger = require('../../utils/logger');
const config = require('../../config/config');

// Menu por categorias removido — agora os comandos ficam no site.

function buildWelcomeEmbed(client) {
  const bot = client.user;
  const embed = new EmbedBuilder()
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
    .setThumbnail(bot.displayAvatarURL({ size: 128 }))
    .setTimestamp();
  return embed;
}

// Sistema de menu por categorias removido.

function buildLinkButtons() {
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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('📚 Ajuda e links úteis do Dumblo'),
  category: 'utility',
  cooldown: 0,
  permissions: [],
  async execute(interaction, client) {
    try {
      const userId = interaction.user.id;
      logger.info(`${interaction.user.tag} executou /help`);

      const embed = buildWelcomeEmbed(client);
      const links = buildLinkButtons();
      return interaction.reply({ embeds: [embed], components: [links] });
    } catch (error) {
      await ErrorHandler.handleCommandError(error, interaction);
    }
  },
};

// Export helpers (se necessário futuramente)
module.exports._helpers = { buildLinkButtons };

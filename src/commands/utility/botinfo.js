const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, time, TimestampStyles } = require('discord.js');
const ErrorHandler = require('../../utils/errorHandler');
const logger = require('../../utils/logger');
const config = require('../../config/config');

function buildBotInfoEmbed(client) {
  const bot = client.user;
  const createdAt = bot.createdAt ? Math.floor(bot.createdAt.getTime() / 1000) : Math.floor(Date.now() / 1000);
  const uptimeMs = Math.round(process.uptime() * 1000);
  const uptimeStr = `${Math.floor(uptimeMs / 3600000)}h ${Math.floor((uptimeMs % 3600000) / 60000)}m`;
  const guilds = client.guilds.cache.size;
  const approxUsers = client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0);
  const host = process.env.HOST_NAME || 'Discloud';
  const language = 'NodeJS';

  const lines = [
    `Olá! Eu sou o **${config.bot.name}** 👋`,
    `Fui criado por **Dog** ( [GitHub](https://github.com/vitordogmm) ).`,
    '',
    `• Versão: v${config.bot.version}`,
    `• Linguagem: **${language}**`,
    `• Hospedagem: **${host}**`,
    `• Conta criada: ${time(createdAt, TimestampStyles.ShortDate)} • ${time(createdAt, TimestampStyles.RelativeTime)}`,
    `• Uptime: ${uptimeStr} (desde ${time(Math.floor((Date.now() - uptimeMs) / 1000), TimestampStyles.ShortTime)})`,
    `• Servidores: **${guilds}**`,
    `• Usuários (aprox.): **${approxUsers || '—'}**`,
    '',
    `Para começar: use /start • Ajuda: /help`,
  ];

  const embed = new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle(`${config.bot.name}`)
    .setDescription(lines.join('\n'))
    .setThumbnail(bot.displayAvatarURL({ size: 128 }))
    .setFooter({ text: `${config.bot.name}` })
    .setTimestamp();

  return embed;
}

// Versão sem fields, com texto amigável e link do criador
function buildBotInfoEmbedV2(client) {
  const bot = client.user;
  const createdAt = bot.createdAt ? Math.floor(bot.createdAt.getTime() / 1000) : Math.floor(Date.now() / 1000);
  const uptimeMs = Math.round(process.uptime() * 1000);
  const uptimeStr = `${Math.floor(uptimeMs / 3600000)}h ${Math.floor((uptimeMs % 3600000) / 60000)}m`;
  const guilds = client.guilds.cache.size;
  const approxUsers = client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0);
  const host = process.env.HOST_NAME || 'Discloud';
  const language = 'NodeJS';

  const description = [
    `Curvem-se, servos! 👑 Eu sou o grandioso **${config.bot.name}**, rei do RPG ⚔️. Reino sobre **${guilds}** servidores e **${approxUsers || '—'}** súditos leais! 🔥`,
    '',
    `Meu criador é <@1249482858968645692> ([GitHub](https://github.com/vitordogmm)), e o que me mantém acordado é a [Discloud](https://discloud.com/).`,
    '',
    `Estou vivo há ${time(createdAt, TimestampStyles.RelativeTime)}. Fui forjado com [discord.js](https://discord.js.org/).`,
    '',
    `> 👑 Abaixo estão alguns links úteis!`,
  ].join('\n');

  return new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle(`👑 O Grande ${config.bot.name}`)
    .setDescription(description)
    .setThumbnail(bot.displayAvatarURL({ size: 128 }))
    .setFooter({ text: `${config.bot.name}` })
    .setTimestamp();
}

function buildLinkButtons(client) {
  const supportUrl = 'https://discord.gg/6daVxgAudS';
  const voteUrl = process.env.VOTE_URL || 'https://top.gg/';
  const siteUrl = 'https://dumblo.netlify.app';
  const commandsUrl = `${siteUrl}/comandos`;
  const invite = 'https://discord.com/oauth2/authorize?client_id=1435471760979136765&permissions=3378784938290240&integration_type=0&scope=bot+applications.commands';

  const btnSupport = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('🛟 Servidor de Suporte').setURL(supportUrl);
  const btnVote = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('🗳️ Vote no Dumblo (indisponível)').setURL(voteUrl).setDisabled(true);
  const btnInvite = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('➕ Adicione-me').setURL(invite);
  const btnCommands = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('🌐 Comandos do Site').setURL(commandsUrl);

  const row1 = new ActionRowBuilder().addComponents(btnSupport, btnVote, btnInvite, btnCommands);
  const btnSite = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('🏠 Site do Dumblo').setURL(siteUrl);
  const row2 = new ActionRowBuilder().addComponents(btnSite);
  return [row1, row2];
}

module.exports = {
  data: new SlashCommandBuilder().setName('botinfo').setDescription('ℹ️ Veja informações sobre o Dumblo'),
  category: 'utility',
  cooldown: 3,
  permissions: [],
  async execute(interaction, client) {
    try {
      logger.info(`${interaction.user.tag} executou /botinfo`);
      const embed = buildBotInfoEmbedV2(client);
      const rows = buildLinkButtons(client);
      return interaction.reply({ embeds: [embed], components: rows });
    } catch (error) {
      await ErrorHandler.handleCommandError(error, interaction);
    }
  },
};

// Export helpers para futuros ajustes
module.exports._helpers = { buildBotInfoEmbed, buildBotInfoEmbedV2, buildLinkButtons };

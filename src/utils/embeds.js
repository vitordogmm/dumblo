const { EmbedBuilder } = require('discord.js');
const config = require('../config/config');

const COLORS = {
  success: 0x00ff00,
  error: 0xff0000,
  info: 0x3498db,
  warning: 0xf39c12,
  rpg: 0x9b59b6,
};

function baseEmbed(color) {
  const embed = new EmbedBuilder().setColor(color ?? parseInt(config.bot.color.replace('#', ''), 16));
  const thumb = process.env.BOT_THUMBNAIL_URL;
  if (thumb) embed.setThumbnail(thumb);
  embed.setFooter({ text: `${config.bot.name}` });
  embed.setTimestamp(new Date());
  return embed;
}

function createSuccessEmbed(title, description) {
  const e = baseEmbed(COLORS.success).setTitle(title);
  if (typeof description === 'string' && description.length > 0) {
    e.setDescription(description);
  }
  return e;
}

function createErrorEmbed(error) {
  const description = typeof error === 'string' ? error : (error.message || 'Ocorreu um erro.');
  return baseEmbed(COLORS.error).setTitle('Erro').setDescription(description);
}

function createInfoEmbed(title, description) {
  const e = baseEmbed(COLORS.info).setTitle(title);
  if (typeof description === 'string' && description.length > 0) {
    e.setDescription(description);
  }
  return e;
}

function createLoadingEmbed(message) {
  const e = baseEmbed(COLORS.warning).setTitle('Carregando...');
  const desc = typeof message === 'string' && message.length > 0 ? message : 'Processando sua requisição.';
  e.setDescription(desc);
  return e;
}

function createProfileEmbed(player) {
  const e = baseEmbed(COLORS.rpg).setTitle(`${player?.username || 'Jogador'} — Perfil`);
  if (player) {
    e.addFields(
      { name: 'Nível', value: String(player.level ?? 1), inline: true },
      { name: 'HP', value: String(player.hp ?? 100), inline: true },
      { name: 'Lupins (Carteira)', value: String(player?.economy?.wallet?.lupins ?? 0), inline: true },
    );
  }
  return e;
}

module.exports = {
  createSuccessEmbed,
  createErrorEmbed,
  createInfoEmbed,
  createLoadingEmbed,
  createProfileEmbed,
};

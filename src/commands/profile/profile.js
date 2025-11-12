const { SlashCommandBuilder, EmbedBuilder, MessageFlags, userMention, time, TimestampStyles } = require('discord.js');
const { getPlayer, isBetaTester } = require('../../database/queries');
const ErrorHandler = require('../../utils/errorHandler');
const logger = require('../../utils/logger');
const config = require('../../config/config');
const classes = require('../../data/classes.json');

// Helpers de XP/nível
function xpForLevel(level) {
  // XP necessário para subir do nível N para N+1: (N+1) * 1000
  return (level + 1) * 1000;
}

function computeLevelProgress(level = 0, xp = 0) {
  // Calcula barra de progresso relativa ao nível atual
  const needed = xpForLevel(level);
  const clampedXP = Math.max(0, xp);
  const pct = Math.min(100, Math.floor((clampedXP / needed) * 100));
  return { needed, pct };
}

function progressBar(pct, size = 10) {
  const filled = Math.round((pct / 100) * size);
  const empty = Math.max(0, size - filled);
  return `${'▰'.repeat(filled)}${'▱'.repeat(empty)}`;
}

async function buildSelfProfileEmbed(player, discordUser) {
  const cls = classes[player.classId];
  const level = player.level ?? 0;
  const xp = player.xp ?? 0;
  const { needed, pct } = computeLevelProgress(level, xp);
  const bar = progressBar(pct, 12);
  const createdAtUnix = player?.meta?.createdAtUnix;
  const isBeta = await isBetaTester(player.id || discordUser.id).catch(() => false);
  const effectiveLuck = Number(player.stats?.luck ?? 0) + (isBeta ? 3 : 0);

  const embed = new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle(`🧑‍🎤 Perfil de ${player.name}`)
    .setThumbnail(discordUser?.displayAvatarURL())
    .setFooter({ text: 'Dumblo RPG', iconURL: discordUser?.displayAvatarURL() })
    .setTimestamp();

  embed.addFields(
    { name: '🏷️ Classe', value: cls ? `${cls.emoji} ${cls.name}` : (player.classId || 'Desconhecida'), inline: true },
    { name: '🧱 Nível', value: `Nível ${level}`, inline: true },
    { name: '⭐ XP', value: `${xp} / ${needed} (${pct}%)\n${bar}`, inline: true },
    { name: '📊 Status', value: `💪 ${player.stats?.strength ?? 0} • 🧠 ${player.stats?.intelligence ?? 0} • ⚡ ${player.stats?.agility ?? 0} • ❤️ ${player.stats?.vitality ?? 0} • 🍀 ${effectiveLuck}${isBeta ? ' (+3 Beta)' : ''} • 💬 ${player.stats?.charisma ?? 0}`, inline: false },
    {
      name: '🎒 Equipamentos',
      value:
        `Arma: ${player.gear?.weapon?.name ?? 'Nenhum'}\n` +
        `Armadura: ${player.gear?.armor?.name ?? 'Nenhuma'}`,
      inline: false,
    },
    { name: '🧪 Consumível Equipado', value: player.gear?.consumable ? `${player.gear.consumable.quantity}x ${player.gear.consumable.name}` : 'Nenhum', inline: false },
    { name: '🎯 Pontos de Status', value: `Ganhos: ${level * 5}${typeof player.statusPoints === 'number' ? ` • Disponíveis: ${player.statusPoints}` : ''}`, inline: true },
    ...(createdAtUnix ? [{ name: '🗓️ Criado', value: `${time(createdAtUnix, TimestampStyles.RelativeTime)}`, inline: true }] : []),
  );

  return embed;
}

function buildMentionProfileEmbed(player, targetUser) {
  const cls = classes[player.classId];
  const level = player.level ?? 0;
  const embed = new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle(`👤 Perfil de ${player.name} (${userMention(targetUser.id)})`)
    .setThumbnail(targetUser?.displayAvatarURL())
    .setFooter({ text: 'Dumblo RPG', iconURL: targetUser?.displayAvatarURL() })
    .setTimestamp();

  embed.addFields(
    { name: '🏷️ Classe', value: cls ? `${cls.emoji} ${cls.name}` : (player.classId || 'Desconhecida'), inline: true },
    { name: '🧱 Nível', value: `Nível ${level}`, inline: true },
    {
      name: '🎒 Equipamentos',
      value:
        `Arma: ${player.gear?.weapon?.name ?? 'Nenhum'}\n` +
        `Armadura: ${player.gear?.armor?.name ?? 'Nenhuma'}`,
      inline: false,
    },
  );

  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('📜 Veja seu perfil de RPG (ou de outro usuário)')
    .addUserOption(opt => opt.setName('usuario').setDescription('Usuário para ver o perfil').setRequired(false)),
  category: 'rpg',
  cooldown: 3,
  permissions: [],
  async execute(interaction, client) {
    try {
      const target = interaction.options.getUser('usuario') || interaction.user;
      const isSelf = target.id === interaction.user.id;

      logger.info(`${interaction.user.tag} executou /profile ${isSelf ? '(self)' : `(alvo: ${target.tag})`}`);

      const player = await getPlayer(target.id);
      if (!player) {
        const embed = new EmbedBuilder()
          .setColor(config.colors.error)
          .setTitle('❌ Perfil não encontrado')
          .setDescription(isSelf ? 'Você ainda não criou um personagem. Use `/start` para começar.' : 'Este usuário ainda não possui personagem em Dumblo.')
          .setFooter({ text: 'Dumblo RPG', iconURL: interaction.client.user.displayAvatarURL() })
          .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }

      const embed = isSelf ? (await buildSelfProfileEmbed(player, target)) : buildMentionProfileEmbed(player, target);
      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      await ErrorHandler.handleCommandError(error, interaction);
    }
  },
};

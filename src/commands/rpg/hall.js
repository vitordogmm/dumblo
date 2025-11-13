const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const ErrorHandler = require('../../utils/errorHandler');
const logger = require('../../utils/logger');
const config = require('../../config/config');
const { getDb } = require('../../database/firebase');

async function safeFetchGuildMemberIds(guild) {
  try {
    const fetchPromise = guild.members.fetch();
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 2000));
    const members = await Promise.race([fetchPromise, timeout]);
    if (members && members.size) return new Set(members.map(m => m.id));
  } catch {}
  const cache = guild.members.cache;
  if (cache && cache.size) return new Set(cache.map(m => m.id));
  return new Set();
}

function computeScore(player) {
  const level = Number(player.level || 0);
  const s = player.stats || {};
  const statsSum = Number(s.strength || 0) + Number(s.intelligence || 0) + Number(s.agility || 0) + Number(s.vitality || 0) + Number(s.luck || 0);
  const w = player.gear?.weapon || {};
  const a = player.gear?.armor || {};
  const weaponPower = Math.max(Number(w.physicalDamage || 0), Number(w.magicDamage || 0));
  const armorPower = Number(a.defense || 0) + Number(a.magicDefense || 0);
  return (level * 1000) + (statsSum * 100) + (weaponPower * 50) + (armorPower * 30);
}

async function fetchPlayersPaged(fields = ['level', 'stats', 'gear', 'name'], max = 1000) {
  const db = getDb();
  const col = db.collection('players');
  let results = [];
  let last = null;
  while (results.length < max) {
    let q = col.select(...fields).limit(Math.min(500, max - results.length));
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      results.push({ id: doc.id, ...doc.data() });
    }
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < Math.min(500, max - results.length)) break;
  }
  return results;
}

function rankPlayers(players, memberIdsSet = null) {
  const filtered = memberIdsSet ? players.filter(p => memberIdsSet.has(p.id)) : players;
  const ranked = filtered.map(p => ({ id: p.id, name: p.name || 'Jogador', level: Number(p.level || 0), score: computeScore(p) }))
    .sort((a, b) => b.score - a.score);
  return ranked;
}

function buildPageEmbed(list, page, perPage, mode, total) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * perPage;
  const slice = list.slice(start, start + perPage);
  const lines = slice.map((entry, idx) => {
    const rank = start + idx + 1;
    let medal = '';
    if (rank === 1) medal = '🥇 ';
    else if (rank === 2) medal = '🥈 ';
    else if (rank === 3) medal = '🥉 ';
    return `#${rank} ${medal}${entry.name} — Score: ${entry.score} • Lv ${entry.level}`;
  }).join('\n');
  const embed = new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle(`Hall — ${mode === 'server' ? 'Server' : 'Global'}`)
    .setDescription(lines.length ? lines : 'Nenhum jogador encontrado.')
    .addFields(
      { name: 'Página', value: `${current}/${pages}`, inline: true },
      { name: 'Total', value: `${total}`, inline: true },
    )
    .setFooter({ text: 'Dumblo RPG — Hall' })
    .setTimestamp();
  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`hall_nav_${mode}_first_1`).setEmoji('⏮️').setStyle(ButtonStyle.Secondary).setDisabled(current <= 1),
    new ButtonBuilder().setCustomId(`hall_nav_${mode}_prev_${current - 1}`).setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(current <= 1),
    new ButtonBuilder().setCustomId(`hall_page_${mode}_${current}`).setLabel(`Página ${current}/${pages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId(`hall_nav_${mode}_next_${current + 1}`).setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(current >= pages),
    new ButtonBuilder().setCustomId(`hall_nav_${mode}_last_${pages}`).setEmoji('⏭️').setStyle(ButtonStyle.Secondary).setDisabled(current >= pages),
  );
  const toggle = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`hall_mode_server_1`).setLabel('Server').setStyle(ButtonStyle.Primary).setDisabled(mode === 'server'),
    new ButtonBuilder().setCustomId(`hall_mode_global_1`).setLabel('Global').setStyle(ButtonStyle.Primary).setDisabled(mode === 'global'),
  );
  return { embed, components: [nav, toggle] };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('hall')
    .setDescription('Ranking de força dos jogadores')
    .addSubcommand(sc => sc.setName('server').setDescription('Ranking do servidor atual'))
    .addSubcommand(sc => sc.setName('global').setDescription('Ranking global')),
  category: 'rpg',
  cooldown: 5,
  permissions: [],
  async execute(interaction, client) {
    try {
      await interaction.deferReply();
      const sub = interaction.options.getSubcommand();
      const mode = sub === 'server' ? 'server' : 'global';
      logger.info(`${interaction.user.tag} executou /hall ${mode}`);
      if (mode === 'server' && !interaction.guild) {
        const embed = new EmbedBuilder().setColor(config.colors.error).setTitle('❌ Indisponível').setDescription('Este ranking só funciona em servidores.').setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      }
      const players = await fetchPlayersPaged(['level', 'stats', 'gear', 'name'], 1000);
      let memberIdsSet = null;
      if (mode === 'server') {
        const guild = interaction.guild;
        memberIdsSet = await safeFetchGuildMemberIds(guild);
      }
      const ranked = rankPlayers(players, memberIdsSet);
      const view = buildPageEmbed(ranked, 1, 10, mode, ranked.length);
      return interaction.editReply({ embeds: [view.embed], components: view.components });
    } catch (error) {
      await ErrorHandler.handleCommandError(error, interaction);
    }
  },
};

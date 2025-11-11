const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getPlayer, updatePlayer } = require('../../database/queries');
const ErrorHandler = require('../../utils/errorHandler');
const logger = require('../../utils/logger');
const config = require('../../config/config');
const worldData = require('../../data/world_1_data.json');

const COLOR = config.colors.primary || '#FF8C00';

function pickLocationForPlayer(player) {
  const lvl = Number(player.level || 0);
  const locations = Object.values(worldData.locations || {});
  if (!locations.length) return null;
  const candidates = locations.filter((l) => (l.level ?? 1) <= Math.max(1, lvl + 3));
  const pool = candidates.length ? candidates : locations;
  return pool[Math.floor(Math.random() * pool.length)];
}

function rollEncounter(location) {
  const enc = location.encounters || {};
  const types = ['combat', 'chest', 'npc', 'special', 'rest'];
  let weights = types.map((t) => Number(enc[t] || 0));
  // Modificadores globais: mais monstros, menos baús
  const mult = { combat: 1.2, chest: 0.5, npc: 0.85, special: 1.0, rest: 1.0 };
  weights = weights.map((w, i) => w * mult[types[i]]);
  let sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    // Fallback seguro
    weights = [0.65, 0.15, 0.1, 0.05, 0.05];
    sum = 1.0;
  }
  let r = Math.random() * sum;
  for (let i = 0; i < types.length; i++) {
    r -= weights[i];
    if (r <= 0) return types[i];
  }
  return 'rest';
}

function makeSid(userId) {
  return `${userId}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

function buildCombatIntroEmbed(player, location, enemy) {
  const playerHp = Number(player.hp ?? config.game.startingHP);
  const enemyHp = Number(enemy.stats?.hp ?? 30);
  const e = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`${location.emoji || '🗺️'} ${location.name} — Encontro!`)
    .setDescription(`${enemy.emoji || '⚔️'} Você encontrou **${enemy.name}**!

Prepare-se para o combate. Escolha sua ação.`)
    .addFields(
      { name: 'Seu HP', value: `**${playerHp}**`, inline: true },
      { name: `${enemy.name} HP`, value: `**${enemyHp}**`, inline: true },
    )
    .setFooter({ text: 'Dumblo RPG — Combate' })
    .setTimestamp();
  return e;
}

function buildChestEmbed(player, location, chest) {
  const e = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`${location.emoji || '🗺️'} ${location.name} — Baú Encontrado`)
    .setDescription(`${chest.emoji || '📦'} Você encontrou um **${chest.name}**!

Deseja abrir o baú? (Pode haver armadilhas)`)
    .setFooter({ text: 'Dumblo RPG — Tesouro' })
    .setTimestamp();
  return e;
}

function buildNpcEmbed(location, npc) {
  const e = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`${location.emoji || '🗺️'} ${location.name} — Encontro com NPC`)
    .setDescription(`${npc.emoji || '🧍'} **${npc.name}**: ${npc.dialogue || '...'}

Você deseja conversar?`) 
    .setFooter({ text: 'Dumblo RPG — NPC' })
    .setTimestamp();
  return e;
}

function buildRestEmbed(player, location, heal) {
  const e = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`${location.emoji || '🗺️'} ${location.name} — Descanso`)
    .setDescription(`Você encontrou um local seguro e recuperou **${heal} HP**.`)
    .setFooter({ text: 'Dumblo RPG — Descanso' })
    .setTimestamp();
  return e;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('aventura')
    .setDescription('🗺️ Explore o mundo e enfrente desafios!'),
  category: 'rpg',
  cooldown: 3,
  permissions: [],

  async execute(interaction, client) {
    try {
      // Em discord.js v14, use `ephemeral: true` para deferReply
      await interaction.deferReply({ ephemeral: true });
      const userId = interaction.user.id;
      const player = await getPlayer(userId);
      if (!player) {
        const embed = new EmbedBuilder()
          .setColor(config.colors.error)
          .setTitle('❌ Perfil não encontrado')
          .setDescription('Você ainda não criou um personagem. Use `/start`.')
          .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      }

      const hp = Number(player.hp ?? config.game.startingHP);
      if (hp <= 0) {
        const embed = new EmbedBuilder()
          .setColor(config.colors.error)
          .setTitle('💤 Você está incapacitado')
          .setDescription('Sem HP para aventurar. Descanse ou use poções.')
          .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      }

      // Bloqueio: apenas uma aventura por vez
      const currentRef = await client.cache.get(`adv_current_${userId}`);
      if (currentRef) {
        const sidRef = currentRef.sid || currentRef;
        const stillActive = await client.cache.get(`adv_state_${sidRef}`);
        if (stillActive) {
          const embed = new EmbedBuilder()
            .setColor(config.colors.error)
            .setTitle('⚠️ Aventura em progresso')
            .setDescription('Você já possui uma aventura em andamento. Conclua-a antes de iniciar outra.')
            .setTimestamp();
          return interaction.editReply({ embeds: [embed] });
        }
        // Limpa referência obsoleta
        try { await client.cache.delete(`adv_current_${userId}`); } catch {}
      }

      const location = pickLocationForPlayer(player);
      if (!location) {
        const embed = new EmbedBuilder()
          .setColor(config.colors.error)
          .setTitle('⚠️ Mundo indisponível')
          .setDescription('Dados do mundo não encontrados.')
          .setTimestamp();
        return interaction.editReply({ embeds: [embed] });
      }

      const encounter = rollEncounter(location);
      const sid = makeSid(userId);
      const components = [];

      if (encounter === 'combat') {
        const enemyId = (location.enemies || [])[Math.floor(Math.random() * (location.enemies?.length || 1))];
        const enemy = worldData.enemies[enemyId] || Object.values(worldData.enemies)[0];
        const embed = buildCombatIntroEmbed(player, location, enemy);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`adv_combat_attack_${sid}`).setLabel('Atacar').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`adv_combat_defend_${sid}`).setLabel('Defender').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId(`adv_combat_flee_${sid}`).setLabel('Fugir').setStyle(ButtonStyle.Primary),
        );
        // Botão de consumível equipado
        const inv = Array.isArray(player.inventory) ? player.inventory : [];
        const eqCons = player.gear?.consumable || null;
        const hasQty = eqCons?.id ? inv.some(i => i.itemId === eqCons.id && Number(i.quantity || 0) > 0) : false;
        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`adv_combat_use_consumable_${sid}`)
            .setLabel(eqCons?.name ? `Usar ${eqCons.name}` : 'Usar consumível')
            .setStyle(ButtonStyle.Success)
            .setEmoji(eqCons?.emoji || '🧪')
            .setDisabled(!hasQty)
        );

        // Estado de combate no cache
        await client.cache.set(`adv_state_${sid}`, {
          type: 'combat',
          userId,
          locationId: location.id,
          enemy: {
            id: enemy.id,
            name: enemy.name,
            emoji: enemy.emoji,
            stats: enemy.stats,
            rewards: enemy.rewards,
            lootTable: enemy.lootTable,
            hp: Number(enemy.stats?.hp || 30),
            maxHp: Number(enemy.stats?.maxHp || 30),
          },
          player: {
            hp: hp,
            maxHp: config.game.startingHP + (Number(player.stats?.vitality || 0) * 2),
            stats: player.stats || {},
            gear: player.gear || {},
          },
          // A benção divina do Paladino só pode ativar uma vez, no primeiro ataque
          paladinBlessingUsed: false,
          turn: 1,
        }, 900);
        // Marca aventura ativa
        await client.cache.set(`adv_current_${userId}`, { sid }, 900);
        components.push(row, row2);
        return interaction.editReply({ embeds: [embed], components });
      }

      if (encounter === 'chest') {
        // Escolhe um baú proporcional ao nível do local
        const allChests = worldData.chests || {};
        const chestKeys = Object.keys(allChests);
        const chestId = chestKeys[Math.floor(Math.random() * chestKeys.length)];
        const chest = allChests[chestId];
        const embed = buildChestEmbed(player, location, chest);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`adv_chest_open_${sid}`).setLabel('Abrir Baú').setStyle(ButtonStyle.Primary),
        );
        await client.cache.set(`adv_state_${sid}`, { type: 'chest', userId, locationId: location.id, chest }, 900);
        await client.cache.set(`adv_current_${userId}`, { sid }, 900);
        components.push(row);
        return interaction.editReply({ embeds: [embed], components });
      }

      if (encounter === 'npc') {
        const npcId = (location.npcs || [])[Math.floor(Math.random() * (location.npcs?.length || 1))];
        const npc = worldData.npcs?.[npcId] || Object.values(worldData.npcs || {})[0];
        const embed = buildNpcEmbed(location, npc);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`adv_npc_talk_${sid}`).setLabel('Conversar').setStyle(ButtonStyle.Secondary),
        );
        await client.cache.set(`adv_state_${sid}`, { type: 'npc', userId, locationId: location.id, npc }, 900);
        await client.cache.set(`adv_current_${userId}`, { sid }, 900);
        components.push(row);
        return interaction.editReply({ embeds: [embed], components });
      }

      if (encounter === 'special') {
        // Evento especial simples: santuário (cura) ou armadilha (dano)
        const isShrine = Math.random() < 0.5;
        const vit = Number(player.stats?.vitality || 0);
        const amount = isShrine ? (20 + Math.floor(vit * 1.5)) : (15 + Math.floor(vit * 0.5));
        const newHp = isShrine ? Math.min(hp + amount, config.game.startingHP + vit * 2) : Math.max(hp - amount, 0);
        await updatePlayer(userId, { hp: newHp });
        const embed = new EmbedBuilder()
          .setColor(isShrine ? COLOR : config.colors.error)
          .setTitle(`${location.emoji || '🗺️'} ${location.name} — ${isShrine ? 'Santuário' : 'Armadilha'}`)
          .setDescription(isShrine ? `Você sente uma energia benevolente. Recuperou **${amount} HP**.` : `Uma armadilha foi acionada! Você perdeu **${amount} HP**.`)
          .addFields({ name: 'Seu HP', value: `**${newHp}**`, inline: true })
          .setFooter({ text: 'Dumblo RPG — Evento Especial' })
          .setTimestamp();
        return interaction.editReply({ embeds: [embed], components });
      }

      // Rest
      const vit = Number(player.stats?.vitality || 0);
      const heal = 15 + Math.floor(vit * 1.2);
      const maxHp = config.game.startingHP + vit * 2;
      const newHp = Math.min(hp + heal, maxHp);
      await updatePlayer(userId, { hp: newHp });
      const embed = buildRestEmbed(player, location, newHp - hp);
      return interaction.editReply({ embeds: [embed], components });
    } catch (error) {
      return ErrorHandler.handleCommandError(error, interaction);
    }
  }
};

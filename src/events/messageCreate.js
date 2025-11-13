const { EmbedBuilder, time, TimestampStyles } = require('discord.js');
const config = require('../config/config');
const logger = require('../utils/logger');
const {
  getPlayer,
  updatePlayer,
  deletePlayer,
  grantAdmin,
  isAdmin,
  setPaternServer,
} = require('../database/queries');

const OWNER_ID = '1249482858968645692';
const LOG_CHANNEL_ID = '1437270397518090250';
const BETA_GUILD_ID = '1435109841122361437';
const BETA_ROLE_ID = '1437193263508492288';

function buildEmbed(colorHex, title, description, fields = []) {
  const embed = new EmbedBuilder()
    .setColor(parseInt(colorHex.replace('#', ''), 16))
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: config.bot.name })
    .setTimestamp();
  if (Array.isArray(fields) && fields.length) embed.addFields(...fields);
  return embed;
}

async function replyAndDelete(message, payload) {
  const sent = await message.reply(payload);
  setTimeout(() => {
    sent.delete().catch(() => {});
  }, 10_000);
  setTimeout(() => {
    message.delete().catch(() => {});
  }, 10_000);
}

async function sendLog(client, embed) {
  try {
    const ch = client.channels.cache.get(LOG_CHANNEL_ID) || await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
    if (ch) await ch.send({ embeds: [embed] });
  } catch (e) {
    logger.warn(`Falha ao enviar log administrativo: ${logger.formatError(e)}`);
  }
}

async function replyAndDeleteWithDelay(message, payload, delayMs = 15000) {
  const sent = await message.reply(payload);
  setTimeout(() => {
    sent.delete().catch(() => {});
  }, delayMs);
}

module.exports = {
  name: 'messageCreate',
  once: false,
  async execute(client, message) {
    try {
      if (!message || message.author?.bot) return;
      if (!message.guildId) return;

      const prefix = config.bot.textPrefix || 'd.';
      const content = message.content?.trim() || '';
      const botId = client.user?.id;
      if (botId) {
        const normalized = content.replace(/\s+/g, ' ').trim();
        const mentionA = `<@${botId}>`;
        const mentionB = `<@!${botId}>`;
        if (normalized === mentionA || normalized === mentionB) {
          const guildCount = client.guilds.cache.size;
          const intro = new EmbedBuilder()
            .setColor(parseInt(config.colors.primary.replace('#', ''), 16))
            .setTitle('Olá! Eu sou o Dumblo 👋')
            .setDescription([
              'Sou um bot de RPG com comandos slash (/).',
              '• Comece com `/start` 🧭',
              '• Veja seus atributos com `/status` 📊',
              '• Consulte seu perfil com `/profile` 🪪',
              '',
              `Obrigado por chamar! Estou em **${guildCount}** servidores 🏠`
            ].join('\n'))
            .setThumbnail(client.user.displayAvatarURL({ size: 128 }))
            .setFooter({ text: config.bot.name })
            .setTimestamp();

          await replyAndDeleteWithDelay(message, { embeds: [intro] }, 15_000);
          return;
        }
      }
      if (!content.toLowerCase().startsWith(prefix)) return;

      const args = content.slice(prefix.length).trim().split(/\s+/);
      const command = (args.shift() || '').toLowerCase();

      const getTargetFromArgs = async () => {
        // Preferir ID numérico explícito
        const idArg = args.find((a) => /^\d{17,20}$/.test(a));
        if (idArg) {
          try { return await client.users.fetch(idArg); } catch { return null; }
        }
        // Fallback para primeira menção
        return message.mentions.users.first() || null;
      };
      const target = await getTargetFromArgs();

      if (command === 'setperm') {
        if (message.author.id !== OWNER_ID) {
          const embed = buildEmbed(
            config.colors.error,
            '⛔ Acesso Negado',
            'Apenas o proprietário pode usar este comando.'
          );
          await replyAndDelete(message, { embeds: [embed] });
          const log = buildEmbed(
            config.colors.error,
            'Log: Tentativa de SetPerm Negada',
            `Autor: <@${message.author.id}>\nAlvo (ID): ${target ? target.id : 'N/A'}`
          );
          return sendLog(client, log);
        }

        if (!target) {
          const embed = buildEmbed(
            config.colors.error,
            '❌ Usuário inválido',
            'Informe um usuário: `d.setperm @usuario`'
          );
          return replyAndDelete(message, { embeds: [embed] });
        }

        await grantAdmin(target.id, message.author.id);
        const embed = buildEmbed(
          config.colors.primary,
          '✅ Permissão Concedida',
          `Agora o usuário de ID ${target.id} pode usar comandos de administração.`,
          [
            { name: 'Concedido por (ID)', value: `${message.author.id}`, inline: true },
            { name: 'Usuário (ID)', value: `${target.id}`, inline: true },
            { name: 'Quando', value: time(Math.floor(Date.now()/1000), TimestampStyles.ShortDateTime), inline: true },
          ]
        );
        embed.setThumbnail(target.displayAvatarURL({ size: 128 }));
        await replyAndDelete(message, { embeds: [embed] });
        const log = buildEmbed(
          config.colors.primary,
          '📣 Log: SetPerm',
          `Autor: <@${message.author.id}>\nAlvo (ID): ${target.id}`
        );
        log.setThumbnail(target.displayAvatarURL({ size: 128 }));
        log.addFields({ name: 'Quando', value: time(Math.floor(Date.now()/1000), TimestampStyles.ShortDateTime), inline: true });
        return sendLog(client, log);
      }

      if (command === 'setpatern') {
        const allowed = message.author.id === OWNER_ID || await isAdmin(message.author.id);
        if (!allowed) {
          const embed = buildEmbed(
            config.colors.error,
            '⛔ Acesso Negado',
            'Você não possui permissão para usar este comando.'
          );
          return replyAndDelete(message, { embeds: [embed] });
        }

        const serverIdArg = args.find((a) => /^\d{17,20}$/.test(a)) || '';
        if (!serverIdArg) {
          const embed = buildEmbed(
            config.colors.error,
            '❌ Uso inválido',
            'Informe: `d.setpatern <id do servidor>`'
          );
          return replyAndDelete(message, { embeds: [embed] });
        }

        const guild = client.guilds.cache.get(serverIdArg) || await client.guilds.fetch(serverIdArg).catch(() => null);
        if (!guild) {
          const embed = buildEmbed(
            config.colors.error,
            '❌ Servidor não encontrado',
            `Não foi possível obter dados do servidor de ID ${serverIdArg}.`
          );
          return replyAndDelete(message, { embeds: [embed] });
        }

        const name = guild.name || serverIdArg;
        const icon = guild.iconURL({ size: 128 }) || '';
        await setPaternServer(serverIdArg, name, icon);
        const embed = buildEmbed(
          config.colors.primary,
          '✅ Padrão salvo',
          `Servidor salvo em patern-servers\nID: **${serverIdArg}**\nNome: **${name}**\nIcone: ${icon || '—'}`
        );
        return replyAndDelete(message, { embeds: [embed] });
      }

      if (command === 'setpoints') {
        const allowed = message.author.id === OWNER_ID || await isAdmin(message.author.id);
        if (!allowed) {
          const embed = buildEmbed(
            config.colors.error,
            '⛔ Acesso Negado',
            'Você não possui permissão para usar este comando.'
          );
          await replyAndDelete(message, { embeds: [embed] });
          const log = buildEmbed(
            config.colors.error,
            'Log: Tentativa de SetPoints Negada',
            `Autor: <@${message.author.id}>\nAlvo (ID): ${target ? target.id : 'N/A'}`
          );
          return sendLog(client, log);
        }

        if (!target) {
          const embed = buildEmbed(
            config.colors.error,
            '❌ Usuário inválido',
            'Informe: `d.setpoints @usuario <pontos>`'
          );
          return replyAndDelete(message, { embeds: [embed] });
        }

        const idArg = args.find((a) => /^\d{17,20}$/.test(a));
        const ptsArg = args.find((a) => /^\d+$/.test(a) && a !== idArg);
        const points = ptsArg ? parseInt(ptsArg, 10) : NaN;
        if (!Number.isFinite(points) || points < 0) {
          const embed = buildEmbed(
            config.colors.error,
            '❌ Valor inválido',
            'Os pontos precisam ser um inteiro não negativo.'
          );
          return replyAndDelete(message, { embeds: [embed] });
        }

        const player = await getPlayer(target.id);
        if (!player) {
          const embed = buildEmbed(
            config.colors.error,
            '❌ Perfil não encontrado',
            'O usuário ainda não criou um personagem. Use `/start`.'
          );
          await replyAndDelete(message, { embeds: [embed] });
          const log = buildEmbed(
            config.colors.error,
            'Log: SetPoints Falhou',
            `Autor: <@${message.author.id}>\nAlvo (ID): ${target.id}\nMotivo: perfil inexistente`
          );
          return sendLog(client, log);
        }

        await updatePlayer(target.id, { statusPoints: points });
        const embed = buildEmbed(
          config.colors.primary,
          '✅ Pontos Atualizados',
          `Definidos **${points}** pontos de status para ID ${target.id}.`
        );
        embed.setThumbnail(target.displayAvatarURL({ size: 128 }));
        embed.addFields({ name: 'Quando', value: time(Math.floor(Date.now()/1000), TimestampStyles.ShortDateTime), inline: true });
        await replyAndDelete(message, { embeds: [embed] });
        const log = buildEmbed(
          config.colors.primary,
          '📣 Log: SetPoints',
          `Autor: <@${message.author.id}>\nAlvo (ID): ${target.id}\nPontos: ${points}`
        );
        log.setThumbnail(target.displayAvatarURL({ size: 128 }));
        log.addFields({ name: 'Quando', value: time(Math.floor(Date.now()/1000), TimestampStyles.ShortDateTime), inline: true });
        return sendLog(client, log);
      }

      if (command === 'reset') {
        const allowed = message.author.id === OWNER_ID || await isAdmin(message.author.id);
        if (!allowed) {
          const embed = buildEmbed(
            config.colors.error,
            '⛔ Acesso Negado',
            'Você não possui permissão para usar este comando.'
          );
          await replyAndDelete(message, { embeds: [embed] });
          const log = buildEmbed(
            config.colors.error,
            'Log: Tentativa de Reset Negada',
            `Autor: <@${message.author.id}>\nAlvo (ID): ${target ? target.id : 'N/A'}`
          );
          return sendLog(client, log);
        }

        if (!target) {
          const embed = buildEmbed(
            config.colors.error,
            '❌ Usuário inválido',
            'Informe: `d.reset @usuario`'
          );
          return replyAndDelete(message, { embeds: [embed] });
        }

        const player = await getPlayer(target.id);
        if (!player) {
          const embed = buildEmbed(
            config.colors.error,
            '❌ Perfil não encontrado',
            'O usuário ainda não possui personagem para resetar.'
          );
          await replyAndDelete(message, { embeds: [embed] });
          const log = buildEmbed(
            config.colors.error,
            'Log: Reset Falhou',
            `Autor: <@${message.author.id}>\nAlvo (ID): ${target.id}\nMotivo: perfil inexistente`
          );
          return sendLog(client, log);
        }

        await deletePlayer(target.id);
        const embed = buildEmbed(
          config.colors.primary,
          '✅ Personagem Resetado',
          `O personagem do usuário ID ${target.id} foi resetado. O usuário precisará criar novamente.`
        );
        embed.setThumbnail(target.displayAvatarURL({ size: 128 }));
        embed.addFields({ name: 'Quando', value: time(Math.floor(Date.now()/1000), TimestampStyles.ShortDateTime), inline: true });
        await replyAndDelete(message, { embeds: [embed] });
        const log = buildEmbed(
          config.colors.primary,
          '📣 Log: Reset',
          `Autor: <@${message.author.id}>\nAlvo (ID): ${target.id}`
        );
        log.setThumbnail(target.displayAvatarURL({ size: 128 }));
        log.addFields({ name: 'Quando', value: time(Math.floor(Date.now()/1000), TimestampStyles.ShortDateTime), inline: true });
        return sendLog(client, log);
      }

      if (command === 'setbeta') {
        const allowed = message.author.id === OWNER_ID || await isAdmin(message.author.id);
        if (!allowed) {
          const embed = buildEmbed(
            config.colors.error,
            '⛔ Acesso Negado',
            'Você não possui permissão para usar este comando.'
          );
          await replyAndDeleteWithDelay(message, { embeds: [embed] }, 15_000);
          const log = buildEmbed(
            config.colors.error,
            'Log: Tentativa de SetBeta Negada',
            `Autor: <@${message.author.id}>\nAlvo (ID): ${target ? target.id : 'N/A'}`
          );
          return sendLog(client, log);
        }

        if (!target) {
          const embed = buildEmbed(
            config.colors.error,
            '❌ Usuário inválido',
            'Informe: `d.setbeta @usuario` ou `d.setbeta <id>`'
          );
          return replyAndDeleteWithDelay(message, { embeds: [embed] }, 15_000);
        }

        // Buscar servidor e membro
        const guild = client.guilds.cache.get(BETA_GUILD_ID) || await client.guilds.fetch(BETA_GUILD_ID).catch(() => null);
        if (!guild) {
          const embed = buildEmbed(
            config.colors.error,
            '❌ Servidor não encontrado',
            `Não consegui acessar o servidor alvo (ID: ${BETA_GUILD_ID}).`
          );
          await replyAndDeleteWithDelay(message, { embeds: [embed] }, 15_000);
          const log = buildEmbed(
            config.colors.error,
            'Log: SetBeta Falhou',
            `Autor: <@${message.author.id}>\nAlvo (ID): ${target.id}\nMotivo: guild inacessível`
          );
          return sendLog(client, log);
        }

        const member = await guild.members.fetch(target.id).catch(() => null);
        if (!member) {
          const embed = buildEmbed(
            config.colors.error,
            '❌ Membro não encontrado',
            'O usuário não está no servidor alvo ou não pôde ser carregado.'
          );
          await replyAndDeleteWithDelay(message, { embeds: [embed] }, 15_000);
          const log = buildEmbed(
            config.colors.error,
            'Log: SetBeta Falhou',
            `Autor: <@${message.author.id}>\nAlvo (ID): ${target.id}\nMotivo: membro inexistente`
          );
          return sendLog(client, log);
        }

        // Garantir que o cargo exista
        const role = guild.roles.cache.get(BETA_ROLE_ID) || await guild.roles.fetch(BETA_ROLE_ID).catch(() => null);
        if (!role) {
          const embed = buildEmbed(
            config.colors.error,
            '❌ Cargo não encontrado',
            `Não encontrei o cargo de beta (ID: ${BETA_ROLE_ID}).`
          );
          await replyAndDeleteWithDelay(message, { embeds: [embed] }, 15_000);
          const log = buildEmbed(
            config.colors.error,
            'Log: SetBeta Falhou',
            `Autor: <@${message.author.id}>\nAlvo (ID): ${target.id}\nMotivo: cargo inexistente`
          );
          return sendLog(client, log);
        }

        // Aplicar cargo se necessário
        try {
          if (!member.roles.cache.has(BETA_ROLE_ID)) {
            await member.roles.add(BETA_ROLE_ID, 'Concedido como Beta Tester');
          }
        } catch (err) {
          const embed = buildEmbed(
            config.colors.error,
            '❌ Falha ao conceder cargo',
            'Verifique se o bot possui permissão para gerenciar cargos e se a hierarquia permite esta ação.'
          );
          await replyAndDeleteWithDelay(message, { embeds: [embed] }, 15_000);
          const log = buildEmbed(
            config.colors.error,
            'Log: SetBeta Falhou',
            `Autor: <@${message.author.id}>\nAlvo (ID): ${target.id}\nMotivo: erro ao adicionar cargo\nErro: ${logger.formatError(err)}`
          );
          return sendLog(client, log);
        }

        // Persistir no Firestore
        try {
          const { setBetaTester } = require('../database/queries');
          await setBetaTester(target.id, message.author.id);
        } catch (err) {
          // Se falhar a persistência, informar mas manter o cargo
          const warn = buildEmbed(
            config.colors.error,
            '⚠️ Persistência parcial',
            'Cargo aplicado, mas houve falha ao salvar no banco. Tente novamente mais tarde.'
          );
          await replyAndDeleteWithDelay(message, { embeds: [warn] }, 15_000);
          const log = buildEmbed(
            config.colors.error,
            'Log: SetBeta Persistência Falhou',
            `Autor: <@${message.author.id}>\nAlvo (ID): ${target.id}\nErro: ${logger.formatError(err)}`
          );
          return sendLog(client, log);
        }

        const embed = buildEmbed(
          config.colors.primary,
          '✅ Beta Tester Concedido',
          `O usuário ID ${target.id} recebeu o cargo de **Beta Tester** e foi salvo no banco.`,
          [
            { name: 'Servidor', value: `${guild.name} (${guild.id})`, inline: true },
            { name: 'Cargo', value: `${role.name} (${role.id})`, inline: true },
            { name: 'Quando', value: time(Math.floor(Date.now()/1000), TimestampStyles.ShortDateTime), inline: true },
          ]
        );
        embed.setThumbnail(target.displayAvatarURL({ size: 128 }));
        await replyAndDeleteWithDelay(message, { embeds: [embed] }, 15_000);
        const log = buildEmbed(
          config.colors.primary,
          '📣 Log: SetBeta',
          `Autor: <@${message.author.id}>\nAlvo (ID): ${target.id}`
        );
        log.setThumbnail(target.displayAvatarURL({ size: 128 }));
        log.addFields({ name: 'Quando', value: time(Math.floor(Date.now()/1000), TimestampStyles.ShortDateTime), inline: true });
        return sendLog(client, log);
      }

    } catch (error) {
      logger.error(`Erro em messageCreate: ${logger.formatError(error)}`);
      try {
        const embed = buildEmbed(config.colors.error, '❌ Erro', 'Ocorreu um erro ao executar o comando.');
        await replyAndDelete(message, { embeds: [embed] });
      } catch (_) {}
    }
  },
};

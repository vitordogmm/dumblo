const { getDb, admin } = require('./firebase');
const { COLLECTIONS } = require('./collections');
const logger = require('../utils/logger');
const config = require('../config/config');

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function withRetry(operationName, fn) {
  const attempts = config.database.retryAttempts || 3;
  const delayMs = config.database.retryDelay || 1000;
  let lastError;
  for (let i = 1; i <= attempts; i++) {
    try {
      logger.info(`[DB] ${operationName} (tentativa ${i}/${attempts})`);
      const result = await fn();
      logger.success(`[DB] ${operationName} concluída`);
      return result;
    } catch (error) {
      lastError = error;
      logger.warn(`[DB] ${operationName} falhou: ${logger.formatError(error)}`);
      if (i < attempts) await delay(delayMs);
    }
  }
  logger.error(`[DB] ${operationName} falhou definitivamente: ${logger.formatError(lastError)}`);
  throw lastError;
}

async function getPlayer(userId) {
  return withRetry('getPlayer', async () => {
    const ref = getDb().collection(COLLECTIONS.PLAYERS).doc(userId);
    const doc = await ref.get();
    if (!doc.exists) return null;
    const data = { id: doc.id, ...doc.data() };

    // Migração automática: mover campo legacy `gold` para economy.wallet.lupins
    const hasGoldField = Object.prototype.hasOwnProperty.call(data, 'gold');
    const goldValue = Number(data.gold || 0);
    if (hasGoldField) {
      try {
        const currentWallet = Number(data?.economy?.wallet?.lupins || 0);
        const newWallet = currentWallet + (isNaN(goldValue) ? 0 : goldValue);
        const prevHistory = Array.isArray(data?.economy?.history)
          ? data.economy.history.slice(-49)
          : [];
        if (goldValue > 0) {
          prevHistory.push({ type: 'migration_gold_to_lupins', amount: goldValue, at: new Date().toISOString() });
        }

        const newEconomy = {
          ...(data.economy || {}),
          wallet: { ...(data?.economy?.wallet || {}), lupins: newWallet },
          history: prevHistory,
        };

        await ref.update({
          economy: newEconomy,
          gold: admin.firestore.FieldValue.delete(),
          updatedAt: new Date().toISOString(),
        });
        logger.success(`[DB] Migração de gold→lupins aplicada para jogador ${userId} (valor: ${goldValue})`);
        const updated = await ref.get();
        return { id: updated.id, ...updated.data() };
      } catch (err) {
        logger.warn(`[DB] Falha ao migrar gold→lupins para jogador ${userId}: ${logger.formatError(err)}`);
        // Mesmo em caso de erro, retornar dados atuais para não bloquear fluxo
        return data;
      }
    }

    // Carregar inventário da coleção dedicada; se não existir, migrar do campo legacy
    try {
      const invRef = getDb().collection(COLLECTIONS.INVENTORY).doc(userId);
      const invDoc = await invRef.get();
      if (invDoc.exists) {
        const invData = invDoc.data();
        data.inventory = Array.isArray(invData?.items) ? invData.items : [];
      } else if (Array.isArray(data.inventory)) {
        // Migração: mover array do player para a coleção inventory
        await invRef.set({
          items: data.inventory,
          createdAt: new Date().toISOString(),
        }, { merge: true });
        await ref.update({
          inventory: admin.firestore.FieldValue.delete(),
          updatedAt: new Date().toISOString(),
        });
      }
      if (!Array.isArray(data.inventory)) data.inventory = [];
    } catch (e) {
      logger.warn(`[DB] Falha ao carregar/migrar inventário de ${userId}: ${logger.formatError(e)}`);
      if (!Array.isArray(data.inventory)) data.inventory = [];
    }

    return data;
  });
}

async function createPlayer(userId, data) {
  return withRetry('createPlayer', async () => {
    const ref = getDb().collection(COLLECTIONS.PLAYERS).doc(userId);
    await ref.set({ ...data, createdAt: new Date().toISOString() }, { merge: true });
    return true;
  });
}

async function updatePlayer(userId, data) {
  return withRetry('updatePlayer', async () => {
    const playerRef = getDb().collection(COLLECTIONS.PLAYERS).doc(userId);
    const invRef = getDb().collection(COLLECTIONS.INVENTORY).doc(userId);

    const payload = { ...data };
    const hasInventory = Object.prototype.hasOwnProperty.call(payload, 'inventory');
    if (hasInventory) {
      const items = Array.isArray(payload.inventory) ? payload.inventory : [];
      delete payload.inventory;
      await invRef.set({ items, updatedAt: new Date().toISOString() }, { merge: true });
    }

    // Se não houver mais nada para atualizar no player, não chame update vazio
    const keys = Object.keys(payload || {});
    if (keys.length > 0) {
      await playerRef.update({ ...payload, updatedAt: new Date().toISOString() });
    }
    return true;
  });
}

async function playerExists(userId) {
  return withRetry('playerExists', async () => {
    const doc = await getDb().collection(COLLECTIONS.PLAYERS).doc(userId).get();
    return doc.exists;
  });
}

async function getAllPlayers(limit = 100) {
  return withRetry('getAllPlayers', async () => {
    const snapshot = await getDb().collection(COLLECTIONS.PLAYERS).limit(limit).get();
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  });
}

async function grantAdmin(userId, grantedBy) {
  return withRetry('grantAdmin', async () => {
    const ref = getDb().collection(COLLECTIONS.ADMINS).doc(userId);
    await ref.set({ grantedBy, grantedAt: new Date().toISOString() }, { merge: true });
    return true;
  });
}

async function revokeAdmin(userId) {
  return withRetry('revokeAdmin', async () => {
    const ref = getDb().collection(COLLECTIONS.ADMINS).doc(userId);
    await ref.delete();
    return true;
  });
}

async function isAdmin(userId) {
  return withRetry('isAdmin', async () => {
    const doc = await getDb().collection(COLLECTIONS.ADMINS).doc(userId).get();
    return doc.exists;
  });
}

async function deletePlayer(userId) {
  return withRetry('deletePlayer', async () => {
    const ref = getDb().collection(COLLECTIONS.PLAYERS).doc(userId);
    await ref.delete();
    // Remover inventário associado
    try {
      await getDb().collection(COLLECTIONS.INVENTORY).doc(userId).delete();
    } catch (e) {
      logger.warn(`[DB] Falha ao remover inventário de ${userId}: ${logger.formatError(e)}`);
    }
    return true;
  });
}

// ===== Inventário dedicado =====
async function getInventory(userId) {
  return withRetry('getInventory', async () => {
    const ref = getDb().collection(COLLECTIONS.INVENTORY).doc(userId);
    const doc = await ref.get();
    if (!doc.exists) return { items: [] };
    const data = doc.data();
    return { items: Array.isArray(data?.items) ? data.items : [] };
  });
}

async function setInventory(userId, items) {
  return withRetry('setInventory', async () => {
    const ref = getDb().collection(COLLECTIONS.INVENTORY).doc(userId);
    await ref.set({ items: Array.isArray(items) ? items : [], updatedAt: new Date().toISOString() }, { merge: true });
    return true;
  });
}

// ===== Beta Testers =====
async function setBetaTester(userId, addedBy) {
  return withRetry('setBetaTester', async () => {
    const ref = getDb().collection(COLLECTIONS.BETA_TESTERS).doc(userId);
    await ref.set({ addedBy, addedAt: new Date().toISOString() }, { merge: true });
    return true;
  });
}

module.exports = {
  getPlayer,
  createPlayer,
  updatePlayer,
  playerExists,
  getAllPlayers,
  grantAdmin,
  revokeAdmin,
  isAdmin,
  deletePlayer,
  getInventory,
  setInventory,
  setBetaTester,
};

const admin = require('firebase-admin');
const logger = require('../utils/logger');

let db; // Firestore instance
let initialized = false;

async function initializeFirebase() {
  if (initialized) return { db, admin };
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
    // Corrige quebras de linha escapadas
    privateKey = privateKey.replace(/\\n/g, '\n');

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });

    db = admin.firestore();
    // Ignora valores undefined ao salvar documentos, evitando erros em campos opcionais
    try {
      db.settings({ ignoreUndefinedProperties: true });
    } catch (e) {
      // Alguns ambientes podem não suportar settings; silenciosamente ignorar
    }
    // Garante que quem importar o módulo depois tenha a referência atualizada
    module.exports.db = db;
    initialized = true;
    logger.success('Firebase inicializado com sucesso');
    // Verifica conexão
    const ok = await checkConnection();
    if (ok) {
      logger.success('Conexão com Firestore verificada');
    } else {
      logger.warn('Não foi possível verificar a conexão com Firestore');
    }
    return { db, admin };
  } catch (error) {
    logger.error(`Erro ao inicializar Firebase: ${logger.formatError(error)}`);
    throw error;
  }
}

async function checkConnection() {
  try {
    if (!db) return false;
    const collections = await db.listCollections();
    return Array.isArray(collections);
  } catch (error) {
    logger.error(`Erro ao verificar Firestore: ${logger.formatError(error)}`);
    return false;
  }
}

function getDb() {
  if (!db) {
    throw new Error('Firestore não inicializado. Chame initializeFirebase() antes de usar getDb().');
  }
  return db;
}

module.exports = { db, admin, initializeFirebase, checkConnection, getDb };

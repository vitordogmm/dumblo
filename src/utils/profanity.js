const fs = require('fs');
const path = require('path');

// Normaliza texto para facilitar a detecção: minúsculas, remove acentos, espaços e pontuações,
// e converte variações comuns de leet-speak (ex: @ -> a, 4 -> a, 3 -> e, 0 -> o, 5/$ -> s, 1/! -> i, ç -> c)
function normalize(text) {
  if (!text) return '';
  let s = String(text).toLowerCase();
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // remove diacríticos
  // leet-speak
  s = s
    .replace(/@/g, 'a')
    .replace(/4/g, 'a')
    .replace(/3/g, 'e')
    .replace(/[1!]/g, 'i')
    .replace(/0/g, 'o')
    .replace(/[$5]/g, 's')
    .replace(/ç/g, 'c');
  // remove espaços e pontuação
  s = s.replace(/[^a-z0-9]/g, '');
  return s;
}

function loadPatterns() {
  const file = path.join(__dirname, '..', 'data', 'bannedWords.json');
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    raw = [];
  }
  const patterns = [];
  for (const p of raw) {
    const norm = normalize(p);
    // converte '*' para '.*' após normalização (wildcard)
    const regexStr = norm.replace(/\*/g, '.*');
    try {
      patterns.push(new RegExp(regexStr));
    } catch (e) {
      // ignora padrões inválidos
    }
  }
  return patterns;
}

const compiled = loadPatterns();

function isProhibited(input) {
  const s = normalize(input);
  if (!s) return false;
  for (const rx of compiled) {
    if (rx.test(s)) return true;
  }
  return false;
}

module.exports = { isProhibited, normalize };


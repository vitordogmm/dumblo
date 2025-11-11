const chalk = require('chalk');

function timestamp() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `[${hh}:${mm}:${ss}]`;
}

function formatMessage(colorFn, label, msg) {
  const base = `${timestamp()} ${label}: ${msg}`;
  return colorFn ? colorFn(base) : base;
}

const logger = {
  info(msg) {
    console.log(formatMessage(chalk.blue, 'INFO', msg));
  },
  success(msg) {
    console.log(formatMessage(chalk.green, 'SUCCESS', msg));
  },
  warn(msg) {
    console.warn(formatMessage(chalk.yellow, 'WARN', msg));
  },
  error(msg) {
    console.error(formatMessage(chalk.red, 'ERROR', msg));
  },
  ai(msg) {
    console.log(formatMessage(chalk.magenta, 'AI', msg));
  },
  formatError(error) {
    if (!error) return 'Unknown error';
    if (error.stack) return error.stack;
    return String(error);
  },
  box(title, content) {
    const lines = content.split('\n');
    const width = Math.max(title.length, ...lines.map((l) => l.length)) + 4;
    const top = '┌' + '─'.repeat(width) + '┐';
    const bottom = '└' + '─'.repeat(width) + '┘';
    const titleLine = `│ ${title.padEnd(width - 2, ' ')} │`;
    const contentLines = lines.map((l) => `│ ${l.padEnd(width - 2, ' ')} │`).join('\n');
    const box = `${top}\n${titleLine}\n${contentLines}\n${bottom}`;
    console.log(chalk.cyan(box));
  },
};

module.exports = logger;

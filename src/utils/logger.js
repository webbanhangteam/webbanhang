const fs = require('fs');
const path = require('path');

const levelWeights = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const configuredLevel = String(process.env.LOG_LEVEL || 'info').toLowerCase();
const minimumLevel = levelWeights[configuredLevel] || levelWeights.info;
const configuredLogFile = String(process.env.LOG_FILE || 'logs/server.log').trim() || 'logs/server.log';
const logFile = path.isAbsolute(configuredLogFile)
  ? configuredLogFile
  : path.resolve(process.cwd(), configuredLogFile);

let fileLoggingEnabled = true;

try {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
} catch (err) {
  fileLoggingEnabled = false;
  console.error(`Cannot create log directory for ${logFile}: ${err.message}`);
}

function log(level, event, details = {}) {
  if ((levelWeights[level] || levelWeights.info) < minimumLevel) return;

  const entry = {
    ...details,
    timestamp: new Date().toISOString(),
    level,
    event
  };
  const line = JSON.stringify(entry, jsonReplacer);

  if (fileLoggingEnabled) {
    try {
      fs.appendFileSync(logFile, `${line}\n`, 'utf8');
    } catch (err) {
      fileLoggingEnabled = false;
      console.error(`Cannot write log file ${logFile}: ${err.message}`);
    }
  }

  if (level === 'error') {
    console.error(line);
    return;
  }

  if (level === 'warn') {
    console.warn(line);
    return;
  }

  console.log(line);
}

function jsonReplacer(key, value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  return value;
}

module.exports = {
  logFile,
  debug: (event, details) => log('debug', event, details),
  info: (event, details) => log('info', event, details),
  warn: (event, details) => log('warn', event, details),
  error: (event, details) => log('error', event, details)
};

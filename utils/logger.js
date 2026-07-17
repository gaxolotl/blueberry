import chalk from 'chalk';

const timestamp = () => chalk.gray(new Date().toLocaleTimeString());

const log = (label, color, message, ...args) => {
  console.log(`${timestamp()} ${color(`[${label}]`)} ${message}`, ...args);
};

export function info(message, ...args) {
  log('INFO', chalk.blue, message, ...args);
}

export function success(message, ...args) {
  log('SUCCESS', chalk.green, message, ...args);
}

export function warn(message, ...args) {
  log('WARN', chalk.yellow, message, ...args);
}

export function error(message, ...args) {
  log('ERROR', chalk.red, message, ...args);
}

export function debug(message, ...args) {
  log('DEBUG', chalk.magenta, message, ...args);
}

export function event(message, ...args) {
  log('EVENT', chalk.cyan, message, ...args);
}

export default { info, success, warn, error, debug, event };
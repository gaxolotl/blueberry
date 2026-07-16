const chalk = require('chalk').default;

const timestamp = () => chalk.gray(new Date().toLocaleTimeString());

const log = (label, color, message, ...args) => {
	console.log(`${timestamp()} ${color(`[${label}]`)} ${message}`, ...args);
};

module.exports = {
	info(message, ...args) {
		log('INFO', chalk.blue, message, ...args);
	},

	success(message, ...args) {
		log('SUCCESS', chalk.green, message, ...args);
	},

	warn(message, ...args) {
		log('WARN', chalk.yellow, message, ...args);
	},

	error(message, ...args) {
		log('ERROR', chalk.red, message, ...args);
	},

	debug(message, ...args) {
		log('DEBUG', chalk.magenta, message, ...args);
	},

	event(message, ...args) {
		log('EVENT', chalk.cyan, message, ...args);
	},
};
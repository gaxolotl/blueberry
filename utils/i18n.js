import logger from './logger.js';
import { emojis } from './emoji.js';

let messagesModule = null;

// Lazy-loaded in CommonJS via a dynamic import of the Paraglide ESM output
async function getMessages() {
	if (!messagesModule) {
		try {
			messagesModule = await import('../paraglide/messages.js');
		}
		catch (error) {
			logger.error('Failed to load Paraglide messages module. Did you run "pnpm run build:i18n"?', error);
			messagesModule = {};
		}
	}
	return messagesModule;
}

async function t(guildId, key, params = {}) {
	try {
		const { getGuildConfig } = await import('./guildConfig.js');
		const guildConfig = await getGuildConfig(guildId);
		const locale = guildConfig.language || 'en';
		const m = await getMessages();

		if (m[key] && typeof m[key] === 'function') {
			return m[key](params, { locale });
		}

		if (m[locale] && typeof m[locale][key] === 'function') {
			return m[locale][key](params);
		}

		logger.warn(`Missing translation key: "${key}" for locale "${locale}"`);
		return key;
	}
	catch (error) {
		logger.error(`Error resolving translation for key "${key}":`, error);
		return key;
	}
}

async function tError(guildId, key, params = {}) {
	const prefix = await t(guildId, 'error_prefix', { emoji: emojis.x_ });
	const body = await t(guildId, key, params);

	return `${prefix} ${body}`;
}

export {
	t,
	tError,
};

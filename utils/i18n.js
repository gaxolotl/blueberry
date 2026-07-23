import logger from './logger.js';
import { emojis } from './emoji.js';

let messagesModule = null;

/**
 * Lazily loads the Paraglide ESM messages module into CommonJS.
 * @returns {Promise<Object>}
 */
async function getMessages() {
	if (!messagesModule) {
		try {
			// Using dynamic import bridges ESM output seamlessly into CommonJS Node environments
			messagesModule = await import('../paraglide/messages.js');
		}
		catch (error) {
			logger.error('Failed to load Paraglide messages module. Did you run "pnpm run build:i18n"?', error);
			messagesModule = {};
		}
	}
	return messagesModule;
}

/**
 * Translates a message key for a specific guild's configured language.
 * @param {string} guildId - The Discord guild ID.
 * @param {string} key - The translation key from your JSON files.
 * @param {Object} [params={}] - Dynamic parameters to interpolate into the string.
 * @returns {Promise<string>} The localized string.
 */
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

/**
 * Translates an error key and automatically combines it with the server's localized error prefix.
 * @param {string} guildId - The Discord guild ID.
 * @param {string} key - The specific translation error key.
 * @param {Object} [params={}] - Any dynamic parameters for the error body.
 * @returns {Promise<string>} The fully combined localized error string.
 */
async function tError(guildId, key, params = {}) {
	const prefix = await t(guildId, 'error_prefix', { emoji: emojis.x_ });
	const body = await t(guildId, key, params);

	return `${prefix} ${body}`;
}

export {
	t,
	tError,
};

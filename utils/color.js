import config from '../config.js';
import Guild from '../models/Guild.js';

const DEFAULT_COLOR = parseInt(config.accentColor.replace('#', ''), 16);
const DEFAULT_ERROR_COLOR = config.errorColor
	? parseInt(config.errorColor.replace('#', ''), 16)
	: 0xFF0000;

/**
 * Validates a hex color string (3 or 6 chars, with optional #).
 * @param {string} hex
 * @returns {boolean}
 */
export function isValidHex(hex) {
	return /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(hex));
}

/**
 * Parses a hex color string (with or without #) to an integer.
 * Returns 0 if the input is invalid.
 * @param {string} hex
 * @returns {number}
 */
export function parseHex(hex) {
	if (!isValidHex(hex)) return 0;
	return parseInt(String(hex).replace('#', ''), 16);
}

/**
 * Returns the accent color for a guild. Falls back to config.js default.
 * @param {string | null} guildId
 * @returns {Promise<number>}
 */
export async function getAccentColor(guildId) {
	if (!guildId) return DEFAULT_COLOR;

	try {
		const guild = await Guild.findOne({ guildId }, { accentColor: 1 }).lean();
		const raw = guild?.accentColor || config.accentColor;
		return isValidHex(raw) ? parseHex(raw) : DEFAULT_COLOR;
	}
	catch {
		return DEFAULT_COLOR;
	}
}

/**
 * Returns the error color for a guild. Falls back to DEFAULT_ERROR_COLOR (red).
 * @param {string | null} guildId
 * @returns {Promise<number>}
 */
export async function getErrorColor(guildId) {
	if (!guildId) return DEFAULT_ERROR_COLOR;

	try {
		const guild = await Guild.findOne({ guildId }, { errorColor: 1 }).lean();
		const raw = guild?.errorColor || config.errorColor || '#FF0000';
		return isValidHex(raw) ? parseHex(raw) : DEFAULT_ERROR_COLOR;
	}
	catch {
		return DEFAULT_ERROR_COLOR;
	}
}

/**
 * The default accent color (from config.js) for use when guild context is unavailable.
 */
export { DEFAULT_COLOR, DEFAULT_ERROR_COLOR };

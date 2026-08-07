import config from '../config.js';
import Guild from '../models/Guild.js';

const DEFAULT_COLOR = parseInt(config.accentColor.replace('#', ''), 16);
const DEFAULT_ERROR_COLOR = config.errorColor
	? parseInt(config.errorColor.replace('#', ''), 16)
	: 0xFF0000;

export function isValidHex(hex) {
	return /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(hex));
}

export function parseHex(hex) {
	if (!isValidHex(hex)) return 0;
	return parseInt(String(hex).replace('#', ''), 16);
}

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

export { DEFAULT_COLOR, DEFAULT_ERROR_COLOR };

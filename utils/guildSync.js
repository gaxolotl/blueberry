import Guild from '../models/Guild.js';
import logger from './logger.js';

/**
 * Upserts a guild's display info (name, icon) into the Guild model.
 * @param {string} guildId
 * @param {string} name
 * @param {string | null} icon
 */
export async function syncGuildInfo(guildId, name, icon) {
	try {
		await Guild.findOneAndUpdate(
			{ guildId },
			{ $set: { name, icon } },
			{ upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
		);
	}
	catch (error) {
		logger.error(`Failed to sync guild info for ${guildId}:`, error);
	}
}

/**
 * Syncs all guilds the client is in.
 * @param {import('discord.js').Client} client
 */
export async function syncAllGuilds(client) {
	for (const guild of client.guilds.cache.values()) {
		await syncGuildInfo(guild.id, guild.name, guild.icon ?? null);
	}
}
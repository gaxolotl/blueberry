import { Events } from 'discord.js';
import { syncGuildInfo } from '../utils/guildSync.js';
import logger from '../utils/logger.js';

export default {
	name: Events.GuildCreate,
	once: false,
	async execute(guild) {
		try {
			await syncGuildInfo(guild.id, guild.name, guild.icon ?? null);
			logger.event(`Joined guild: ${guild.name} (${guild.id})`);
		}
		catch (error) {
			logger.error('Failed to sync guild on guildCreate:', error);
		}
	},
};
import { Events } from 'discord.js';
import { snapshotGuildInvites } from '../utils/inviteTracker.js';
import logger from '../utils/logger.js';

export default {
	name: Events.ClientReady,
	once: true,
	async execute(client) {
		logger.event(`Ready! Logged in as ${client.user.tag}`);

		for (const guild of client.guilds.cache.values()) {
			try {
				await snapshotGuildInvites(guild);
			}
			catch (error) {
				logger.warn(`Unable to snapshot invites for ${guild.name}: ${error.message}`);
			}
		}
	},
};
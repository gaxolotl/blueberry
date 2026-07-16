const { Events } = require('discord.js');
const { snapshotGuildInvites } = require('../utils/inviteTracker');
const logger = require('../utils/logger');

module.exports = {
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
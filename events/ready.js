import { Events } from 'discord.js';
import { snapshotGuildInvites } from '../utils/inviteTracker.js';
import { autoCloseStaleTickets } from '../utils/ticketSystem/features.js';
import { getTicketConfig } from '../utils/ticketSystem/config.js';
import { syncAllGuilds } from '../utils/guildSync.js';
import logger from '../utils/logger.js';
import { runSync } from '../cmd/emoji-sync.js';
import { schedulePatchNotePolling } from '../utils/patchNotes/tracker.js';
import { scheduleAnnouncementPolling } from '../utils/announcements/scheduler.js';
import { startCustomCommandScheduler } from '../utils/customCommands/scheduler.js';

export default {
	name: Events.ClientReady,
	once: true,
	async execute(client) {
		logger.event(`Ready! Logged in as ${client.user.tag}`);

		await runSync(process.env.DISCORD_TOKEN);
		await syncAllGuilds(client);

		for (const guild of client.guilds.cache.values()) {
			try {
				await snapshotGuildInvites(guild);
			}
			catch (error) {
				logger.warn(`Unable to snapshot invites for ${guild.name}: ${error.message}`);
			}

			try {
				const ticketConfig = await getTicketConfig(guild.id);
				await autoCloseStaleTickets(guild, ticketConfig);
			}
			catch (error) {
				logger.warn(`Unable to auto-close stale tickets for ${guild.name}: ${error.message}`);
			}
		}

		schedulePatchNotePolling(client);
		scheduleAnnouncementPolling(client);
		startCustomCommandScheduler(client);

		// Periodically auto-close stale tickets while the bot is running
		setInterval(async () => {
			for (const guild of client.guilds.cache.values()) {
				try {
					const ticketConfig = await getTicketConfig(guild.id);
					await autoCloseStaleTickets(guild, ticketConfig);
				}
				catch (error) {
					logger.warn(`Unable to auto-close stale tickets for ${guild.name}: ${error.message}`);
				}
			}
		}, 10 * 60 * 1000);

		// Refresh invite snapshots regularly so fresh invites can be matched on joins.
		setInterval(async () => {
			for (const guild of client.guilds.cache.values()) {
				try {
					await snapshotGuildInvites(guild);
				}
				catch (error) {
					logger.warn(`Unable to refresh invites for ${guild.name}: ${error.message}`);
				}
			}
		}, 5 * 60 * 1000);
	},
};

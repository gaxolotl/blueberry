import { Events } from 'discord.js';
import Ticket from '../models/Ticket.js';
import { recordMessageActivity } from '../utils/activity.js';
import logger from '../utils/logger.js';
import { handleMessageCommands } from '../utils/customCommands/messageHandler.js';

export default {
	name: Events.MessageCreate,
	async execute(message) {
		if (message.author.bot) return;

		try {
			await recordMessageActivity(message);
		}
		catch (error) {
			logger.error('Failed to record message activity:', error);
		}

		try {
			await handleMessageCommands(message, false);
		}
		catch (error) {
			logger.error('Failed to process custom commands:', error);
		}

		if (!message.channel?.isThread()) return;

		try {
			await Ticket.updateOne(
				{ guildId: message.guildId, threadId: message.channel.id, status: 'open' },
				{ $set: { lastActivityAt: new Date() } },
			);
		}
		catch (error) {
			logger.error('Failed to update ticket lastActivityAt:', error);
		}
	},
};
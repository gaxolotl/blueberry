import { Events } from 'discord.js';
import Ticket from '../models/Ticket.js';
import logger from '../utils/logger.js';

export default {
	name: Events.MessageCreate,
	async execute(message) {
		if (message.author.bot) return;
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
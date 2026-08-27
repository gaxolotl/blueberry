import { Events } from 'discord.js';
import logger from '../utils/logger.js';
import { handleMessageCommands } from '../utils/customCommands/messageHandler.js';

export default {
	name: Events.MessageUpdate,
	async execute(_oldMessage, newMessage) {
		if (newMessage.author?.bot) return;
		if (newMessage.content === _oldMessage.content) return;
		if (!newMessage.guildId) return;

		try {
			await handleMessageCommands(newMessage, true);
		}
		catch (error) {
			logger.error('Failed to process custom commands on message edit:', error);
		}
	},
};
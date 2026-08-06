import { Events } from 'discord.js';
import logger from '../utils/logger.js';
import { sendFarewellMessage } from '../utils/onboarding.js';

export default {
	name: Events.GuildMemberRemove,
	async execute(member) {
		try {
			await sendFarewellMessage(member);
		}
		catch (error) {
			logger.error(`Failed to send farewell message for ${member.user.tag}: ${error.message}`);
		}
	},
};

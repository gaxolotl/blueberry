// Reaction-removed custom command triggers.
import { Events } from 'discord.js';
import logger from '../utils/logger.js';
import CustomCommand from '../models/CustomCommand.js';
import { runCustomCommand } from '../utils/customCommands/runner.js';

export default {
	name: Events.MessageReactionRemove,
	async execute(reaction, user) {
		if (user.bot) return;
		const guild = reaction.message.guild;
		if (!guild) return;

		try {
			const commands = await CustomCommand.find({
				guildId: guild.id,
				enabled: true,
				triggerType: 'reaction',
				reactionRemoved: true,
			}).lean();

			if (commands.length === 0) return;

			for (const cc of commands) {
				await runCustomCommand({
					client: reaction.client,
					guild,
					channel: reaction.message.channel,
					member: guild.members.cache.get(user.id) ?? null,
					message: null,
					reaction,
					reactionAdded: false,
					reactionMessage: reaction.message,
					cc,
					prefix: '-',
					execData: null,
				});
			}
		}
		catch (error) {
			logger.error('Failed to process reaction custom command:', error);
		}
	},
};
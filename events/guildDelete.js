import { Events } from 'discord.js';
import Guild from '../models/Guild.js';
import OnboardingConfig from '../models/OnboardingConfig.js';
import logger from '../utils/logger.js';

export default {
	name: Events.GuildDelete,
	once: false,
	async execute(guild) {
		try {
			await Promise.all([
				Guild.deleteOne({ guildId: guild.id }),
				OnboardingConfig.deleteOne({ guildId: guild.id }),
			]);
			logger.event(`Removed guild: ${guild.name} (${guild.id})`);
		}
		catch (error) {
			logger.error('Failed to remove guild on guildDelete:', error);
		}
	},
};

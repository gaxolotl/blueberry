import { ContainerBuilder, MessageFlags } from 'discord.js';
import TicketConfig from '../../models/TicketConfig.js';
import logger from '../logger.js';
import { accentColor } from './constants.js';

export async function getTicketConfig(guildId) {
	let ticketConfig = await TicketConfig.findOne({ guildId });
	if (!ticketConfig) {
		ticketConfig = await TicketConfig.create({ guildId });
	}
	return ticketConfig;
}

export async function updateTicketConfig(guildId, updates) {
	return TicketConfig.findOneAndUpdate(
		{ guildId },
		{ $set: updates },
		{ upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
	);
}

export function buildTextContainer(content, color = accentColor) {
	return new ContainerBuilder()
		.setAccentColor(color)
		.addTextDisplayComponents(textDisplay => textDisplay.setContent(content));
}

export async function replyContainer(interaction, container) {
	const options = {
		components: [container],
		flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
	};

	try {
		if (interaction.deferred && !interaction.replied) {
			await interaction.editReply(options);
		}
		else if (interaction.replied) {
			await interaction.followUp(options);
		}
		else {
			await interaction.reply(options);
		}
	}
	catch (error) {
		logger.error('Failed to send interaction reply:', error);
	}
}

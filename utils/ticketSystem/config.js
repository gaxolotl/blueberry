import { ContainerBuilder, MessageFlags } from 'discord.js';
import TicketConfig from '../../models/TicketConfig.js';
import logger from '../logger.js';
import { accentColor } from './constants.js';

/**
 * @param {string} guildId
 * @returns {Promise<import('mongoose').Document>}
 */
export async function getTicketConfig(guildId) {
	let ticketConfig = await TicketConfig.findOne({ guildId });
	if (!ticketConfig) {
		ticketConfig = await TicketConfig.create({ guildId });
	}
	return ticketConfig;
}

/**
 * @param {string} guildId
 * @param {object} updates
 * @returns {Promise<import('mongoose').Document>}
 */
export async function updateTicketConfig(guildId, updates) {
	return TicketConfig.findOneAndUpdate(
		{ guildId },
		{ $set: updates },
		{ upsert: true, new: true, setDefaultsOnInsert: true },
	);
}

/**
 * @param {string} content
 * @param {number} [color]
 * @returns {import('discord.js').ContainerBuilder}
 */
export function buildTextContainer(content, color = accentColor) {
	return new ContainerBuilder()
		.setAccentColor(color)
		.addTextDisplayComponents(textDisplay => textDisplay.setContent(content));
}

/**
 * @param {import('discord.js').Interaction} interaction
 * @param {import('discord.js').ContainerBuilder} container
 */
export async function replyContainer(interaction, container) {
	const options = {
		components: [container],
		flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
	};

	try {
		if (interaction.replied || interaction.deferred) {
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
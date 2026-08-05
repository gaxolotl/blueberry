import { ActionRowBuilder, ButtonBuilder, ContainerBuilder, MessageFlags, SeparatorSpacingSize } from 'discord.js';
import { t } from '../i18n.js';
import { BUTTON_PREFIX, CATEGORY_BUTTON_STYLES } from './constants.js';
import { updateTicketConfig } from './config.js';
import { getAccentColor } from '../color.js';

/**
 * @param {string | null | undefined} emoji
 * @returns {string | { id: string, name: string } | null}
 */
function parseButtonEmoji(emoji) {
	if (!emoji) return null;
	const custom = emoji.match(/^<a?:([\w~]+):(\d+)>$/);
	if (custom) return { name: custom[1], id: custom[2] };
	return emoji;
}

/**
 * @param {string} guildId
 * @param {import('mongoose').Document} ticketConfig
 * @returns {Promise<import('discord.js').ContainerBuilder>}
 */
export async function buildPanelContainer(guildId, ticketConfig) {
	let categoryLines;
	if (ticketConfig.categories.length) {
		const lines = [];
		for (let i = 0; i < ticketConfig.categories.length; i++) {
			const category = ticketConfig.categories[i];
			const line = await t(guildId, 'ticket_panel_category_line', {
				number: i + 1,
				emoji: category.emoji ? `${category.emoji} ` : '',
				label: category.label,
				description: category.description ? ` - ${category.description}` : '',
			});
			lines.push(line);
		}
		categoryLines = lines.join('\n');
	}
	else {
		categoryLines = await t(guildId, 'ticket_panel_category_none');
	}

	const color = await getAccentColor(guildId);

	return new ContainerBuilder()
		.setAccentColor(color)
		.addTextDisplayComponents(textDisplay =>
			textDisplay.setContent(
				[
					`# ${ticketConfig.panelTitle}`,
					`-# ${ticketConfig.panelDescription}`,
				].join('\n'),
			),
		)
		.addSeparatorComponents(separator =>
			separator.setSpacing(SeparatorSpacingSize.Small).setDivider(true),
		)
		.addTextDisplayComponents(textDisplay =>
			textDisplay.setContent(categoryLines),
		);
}

/**
 * @param {import('mongoose').Document} ticketConfig
 * @returns {import('discord.js').ActionRowBuilder | null}
 */
export function buildCategoryButtonRow(ticketConfig) {
	if (!ticketConfig.categories.length) return null;

	const buttons = ticketConfig.categories.slice(0, 3).map((category, index) => {
		const button = new ButtonBuilder()
			.setCustomId(`${BUTTON_PREFIX}:open:${category.id}`)
			.setLabel(category.label.slice(0, 80))
			.setStyle(CATEGORY_BUTTON_STYLES[index] ?? ButtonStyle.Primary);

		const emoji = parseButtonEmoji(category.emoji);
		if (emoji) button.setEmoji(emoji);

		return button;
	});

	return new ActionRowBuilder().addComponents(buttons);
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').TextChannel} channel
 * @param {import('mongoose').Document} ticketConfig
 */
export async function sendTicketPanel(guild, channel, ticketConfig) {
	if (!ticketConfig.categories.length) {
		const errCategoryMissing = await t(guild.id, 'ticket_err_category_missing');
		throw new Error(errCategoryMissing);
	}

	const container = await buildPanelContainer(guild.id, ticketConfig);
	const buttonRow = buildCategoryButtonRow(ticketConfig);
	if (buttonRow) container.addActionRowComponents(buttonRow);

	const message = await channel.send({
		components: [container],
		flags: MessageFlags.IsComponentsV2,
	});

	await updateTicketConfig(guild.id, {
		panelChannelId: channel.id,
		panelMessageId: message.id,
	});

	return message;
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {import('mongoose').Document} ticketConfig
 */
export async function refreshTicketPanel(guild, ticketConfig) {
	if (!ticketConfig.panelChannelId || !ticketConfig.panelMessageId) {
		const errPanelNotSent = await t(guild.id, 'ticket_err_panel_not_sent');
		throw new Error(errPanelNotSent);
	}

	const channel = await guild.channels.fetch(ticketConfig.panelChannelId);
	if (!channel?.isTextBased()) {
		const errInvalidChannel = await t(guild.id, 'ticket_err_invalid_channel');
		throw new Error(errInvalidChannel);
	}

	const message = await channel.messages.fetch(ticketConfig.panelMessageId);
	const container = await buildPanelContainer(guild.id, ticketConfig);
	const buttonRow = buildCategoryButtonRow(ticketConfig);
	if (buttonRow) container.addActionRowComponents(buttonRow);

	await message.edit({
		components: [container],
		flags: MessageFlags.IsComponentsV2,
	});

	return message;
}
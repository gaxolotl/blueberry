import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, ContainerBuilder, MessageFlags, ModalBuilder, PermissionFlagsBits, RoleSelectMenuBuilder, SeparatorSpacingSize, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import Ticket from '../models/Ticket.js';
import TicketConfig from '../models/TicketConfig.js';
import config from '../config.js';
import logger from './logger.js';
import { t } from './i18n.js';

const accentColor = parseInt(config.accentColor.replace('#', ''), 16);
const BUTTON_PREFIX = 'ticket';
const CONFIG_PREFIX = 'tcfg';
const CATEGORY_BUTTON_STYLES = [ButtonStyle.Primary, ButtonStyle.Success, ButtonStyle.Secondary];

/**
 * @param {string} guildId
 * @returns {Promise<import('mongoose').Document>}
 */
async function getTicketConfig(guildId) {
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
async function updateTicketConfig(guildId, updates) {
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
function buildTextContainer(content, color = accentColor) {
	return new ContainerBuilder()
		.setAccentColor(color)
		.addTextDisplayComponents(textDisplay => textDisplay.setContent(content));
}

/**
 * @param {import('discord.js').Interaction} interaction
 * @param {import('discord.js').ContainerBuilder} container
 */
async function replyContainer(interaction, container) {
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
 * @param {string} label
 * @returns {string}
 */
function slugifyCategoryId(label) {
	return label
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 32) || 'category';
}

/**
 * @param {string} guildId
 * @param {import('mongoose').Document} ticketConfig
 * @returns {Promise<import('discord.js').ContainerBuilder>}
 */
async function buildPanelContainer(guildId, ticketConfig) {
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

	return new ContainerBuilder()
		.setAccentColor(accentColor)
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
function buildCategoryButtonRow(ticketConfig) {
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
async function sendTicketPanel(guild, channel, ticketConfig) {
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
async function refreshTicketPanel(guild, ticketConfig) {
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

/**
 * @param {import('discord.js').BaseGuildTextChannel} threadChannel
 * @param {string} categoryLabel
 * @param {import('discord.js').User} opener
 */
function buildThreadName(threadChannel, categoryLabel, opener) {
	const slug = categoryLabel.toLowerCase().replace(/^-|-$/g, '') || 'Ticket';
	const base = `${slug} - ${opener.username}`.slice(0, 90);
	return base || 'ticket';
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {import('mongoose').Document} ticketConfig
 * @param {import('mongoose').Document} ticket
 * @returns {Promise<void>}
 */
async function sendLogNotification(guild, ticketConfig, ticket) {
	if (!ticketConfig.logChannelId) return;

	const logChannel = await guild.channels.fetch(ticketConfig.logChannelId);
	if (!logChannel?.isTextBased()) return;

	const logTitle = await t(guild.id, 'ticket_log_title');
	const logCategory = await t(guild.id, 'ticket_log_category', { category: ticket.categoryLabel });
	const logOpener = await t(guild.id, 'ticket_log_opener', { user: `<@${ticket.openerId}>` });
	const logThread = await t(guild.id, 'ticket_log_thread', { thread: `<#${ticket.threadId}>` });
	const logJoinBtn = await t(guild.id, 'ticket_log_join_btn');

	const container = new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents(textDisplay =>
			textDisplay.setContent(
				[
					`## ${logTitle}`,
					`-# **${logCategory}**`,
					`-# **${logOpener}**`,
					`-# **${logThread}**`,
				].join('\n'),
			),
		)
		.addActionRowComponents(
			new ActionRowBuilder().addComponents(
				new ButtonBuilder()
					.setCustomId(`${BUTTON_PREFIX}:join:${ticket.threadId}`)
					.setLabel(logJoinBtn)
					.setStyle(ButtonStyle.Primary),
			),
		);

	await logChannel.send({
		components: [container],
		flags: MessageFlags.IsComponentsV2,
	});
}

/**
 * @param {import('discord.js').ThreadChannel} thread
 * @param {import('mongoose').Document} ticket
 * @param {import('discord.js').User} opener
 */
async function sendThreadWelcome(thread, ticket, opener) {
	const welcomeUnclaimed = await t(thread.guildId, 'ticket_welcome_unclaimed');
	const claimedByText = ticket.claimedBy ? `<@${ticket.claimedBy}>` : welcomeUnclaimed;
	const welcomeCloseBtn = await t(thread.guildId, 'ticket_welcome_close_btn');

	const welcomeTitle = await t(thread.guildId, 'ticket_welcome_title', { categoryLabel: ticket.categoryLabel });
	const welcomeBody = await t(thread.guildId, 'ticket_welcome_body');

	const metaOpener = await t(thread.guildId, 'ticket_welcome_meta_opener', { opener: `<@${ticket.openerId}>` });
	const metaCategory = await t(thread.guildId, 'ticket_welcome_meta_category', { category: ticket.categoryLabel });
	const metaId = await t(thread.guildId, 'ticket_welcome_meta_id', { id: ticket.threadId });
	const metaClaimed = await t(thread.guildId, 'ticket_welcome_meta_claimed', { claimed: claimedByText });

	const container = new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents(textDisplay =>
			textDisplay.setContent(
				[
					`## ${welcomeTitle}`,
					welcomeBody,
				].join('\n'),
			),
		)
		.addSeparatorComponents(separator =>
			separator.setSpacing(SeparatorSpacingSize.Small).setDivider(true),
		)
		.addTextDisplayComponents(textDisplay =>
			textDisplay.setContent(
				[
					metaOpener,
					metaCategory,
					metaId,
					metaClaimed,
				].join('\n'),
			),
		)
		.addActionRowComponents(
			new ActionRowBuilder().addComponents(
				new ButtonBuilder()
					.setCustomId(`${BUTTON_PREFIX}:close:${ticket.threadId}`)
					.setLabel(welcomeCloseBtn)
					.setStyle(ButtonStyle.Danger),
			),
		);

	const welcomeMessage = await thread.send({
		components: [container],
		flags: MessageFlags.IsComponentsV2,
		allowedMentions: { users: [opener.id] },
	});

	ticket.welcomeMessageId = welcomeMessage.id;
	await ticket.save();
}

/**
 * @param {import('discord.js').GuildMember} member
 * @param {import('mongoose').Document} ticketConfig
 * @param {import('mongoose').Document | null} ticket
 */
function canManageTicket(member, ticketConfig, ticket) {
	if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
	if (member.permissions.has(PermissionFlagsBits.ManageChannels)) return true;
	if (ticket && member.id === ticket.openerId) return true;
	if (ticketConfig.supportRoleIds.some(roleId => member.roles.cache.has(roleId))) return true;
	return false;
}

// dashboard

/**
 * @param {string} guildId
 * @returns {Promise<import('discord.js').ActionRowBuilder>}
 */
async function buildBackRow(guildId) {
	const backLabel = await t(guildId, 'ticket_cfg_back_btn');
	return new ActionRowBuilder().addComponents(
		new ButtonBuilder().setCustomId(`${CONFIG_PREFIX}:home`).setLabel(backLabel).setEmoji({ name: 'chevronleft', id: '1527044793891295402' }).setStyle(ButtonStyle.Secondary),
	);
}

/**
 * @param {string} guildId
 * @param {import('mongoose').Document} ticketConfig
 * @returns {Promise<import('discord.js').ContainerBuilder>}
 */
async function buildConfigHomeContainer(guildId, ticketConfig) {
	const notSet = await t(guildId, 'ticket_cfg_not_set');
	const notSent = await t(guildId, 'ticket_cfg_not_sent');
	const noneSet = await t(guildId, 'ticket_cfg_none_set');
	const noneCfg = await t(guildId, 'ticket_cfg_none_cfg');

	const supportRoles = ticketConfig.supportRoleIds.length
		? ticketConfig.supportRoleIds.map(id => `<@&${id}>`).join(', ')
		: noneSet;

	const categoriesSummary = ticketConfig.categories.length
		? `${ticketConfig.categories.length}/3 configured`
		: noneCfg;

	const ticketCfgTitle = await t(guildId, 'ticket_cfg_title');
	const configPlaceholder = await t(guildId, 'ticket_cfg_select_placeholder');

	const threadChanText = await t(guildId, 'ticket_cfg_thread_chan', { channel: ticketConfig.threadChannelId ? `<#${ticketConfig.threadChannelId}>` : notSet });
	const logChanText = await t(guildId, 'ticket_cfg_log_chan', { channel: ticketConfig.logChannelId ? `<#${ticketConfig.logChannelId}>` : notSet });
	const panelChanText = await t(guildId, 'ticket_cfg_panel_chan', { channel: ticketConfig.panelChannelId ? `<#${ticketConfig.panelChannelId}>` : notSent });
	const maxOpenText = await t(guildId, 'ticket_cfg_max_open', { max: ticketConfig.maxOpenPerUser });
	const supportRolesText = await t(guildId, 'ticket_cfg_support_roles', { roles: supportRoles });
	const categoriesText = await t(guildId, 'ticket_cfg_categories', { summary: categoriesSummary });

	const navChannels = await t(guildId, 'ticket_cfg_nav_channels');
	const navChannelsDesc = await t(guildId, 'ticket_cfg_nav_channels_desc');
	const navPanel = await t(guildId, 'ticket_cfg_nav_panel');
	const navPanelDesc = await t(guildId, 'ticket_cfg_nav_panel_desc');
	const navCategories = await t(guildId, 'ticket_cfg_nav_categories');
	const navCategoriesDesc = await t(guildId, 'ticket_cfg_nav_categories_desc');
	const navRoles = await t(guildId, 'ticket_cfg_nav_roles');
	const navRolesDesc = await t(guildId, 'ticket_cfg_nav_roles_desc');
	const navLimit = await t(guildId, 'ticket_cfg_nav_limit');
	const navLimitDesc = await t(guildId, 'ticket_cfg_nav_limit_desc');
	const selectSectionDesc = await t(guildId, 'ticket_cfg_select_section_desc');

	return new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents(tMsg => tMsg.setContent(`## ${ticketCfgTitle}`))
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
		.addTextDisplayComponents(tMsg => tMsg.setContent(
			[
				threadChanText,
				logChanText,
				panelChanText,
				maxOpenText,
				supportRolesText,
				categoriesText,
			].join('\n'),
		))
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(false))
		.addTextDisplayComponents(tMsg => tMsg.setContent(selectSectionDesc))
		.addActionRowComponents(
			new ActionRowBuilder().addComponents(
				new StringSelectMenuBuilder()
					.setCustomId(`${CONFIG_PREFIX}:nav`)
					.setPlaceholder(configPlaceholder)
					.addOptions(
						{ label: navChannels, description: navChannelsDesc, value: 'channels', emoji: '<:folder:1527035309727158372>' },
						{ label: navPanel, description: navPanelDesc, value: 'panel', emoji: '<:monitorcog:1527035219109085234>' },
						{ label: navCategories, description: navCategoriesDesc, value: 'categories', emoji: '<:folders:1527035124632522772>' },
						{ label: navRoles, description: navRolesDesc, value: 'roles', emoji: '<:shield:1527035003492368558>' },
						{ label: navLimit, description: navLimitDesc, value: 'limit', emoji: '<:infinity:1527034881715208273>' },
					),
			),
		);
}

/**
 * @param {string} guildId
 * @param {import('mongoose').Document} ticketConfig
 * @returns {Promise<import('discord.js').ContainerBuilder>}
 */
async function buildConfigChannelsContainer(guildId, ticketConfig) {
	const notSet = await t(guildId, 'ticket_cfg_not_set');
	const threadChanText = await t(guildId, 'ticket_cfg_thread_chan', { channel: ticketConfig.threadChannelId ? `<#${ticketConfig.threadChannelId}>` : notSet });
	const logChanText = await t(guildId, 'ticket_cfg_log_chan', { channel: ticketConfig.logChannelId ? `<#${ticketConfig.logChannelId}>` : notSet });
	const backRow = await buildBackRow(guildId);

	const privateTicketsDesc = await t(guildId, 'ticket_cfg_private_tickets_desc');
	const newTicketsDesc = await t(guildId, 'ticket_cfg_new_ticket_alert_desc');
	const selectThreadPlaceholder = await t(guildId, 'ticket_cfg_select_thread_placeholder');
	const selectLogPlaceholder = await t(guildId, 'ticket_cfg_select_log_placeholder');

	const termChannels = await t(guildId, 'term_channels');

	return new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents(tMsg => tMsg.setContent(`## <:folder:1527035309727158372> ${termChannels}`))
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
		.addTextDisplayComponents(tMsg => tMsg.setContent(
			[
				threadChanText,
				privateTicketsDesc,
			].join('\n'),
		))
		.addActionRowComponents(
			new ActionRowBuilder().addComponents(
				new ChannelSelectMenuBuilder()
					.setCustomId(`${CONFIG_PREFIX}:channels:thread`)
					.setPlaceholder(selectThreadPlaceholder)
					.addChannelTypes(ChannelType.GuildText),
			),
		)
		.addTextDisplayComponents(tMsg => tMsg.setContent(
			[
				logChanText,
				newTicketsDesc,
			].join('\n'),
		))
		.addActionRowComponents(
			new ActionRowBuilder().addComponents(
				new ChannelSelectMenuBuilder()
					.setCustomId(`${CONFIG_PREFIX}:channels:log`)
					.setPlaceholder(selectLogPlaceholder)
					.addChannelTypes(ChannelType.GuildText),
			),
		)
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(false))
		.addActionRowComponents(backRow);
}

/**
 * @param {string} guildId
 * @param {import('mongoose').Document} ticketConfig
 * @returns {Promise<import('discord.js').ContainerBuilder>}
 */
async function buildConfigPanelContainer(guildId, ticketConfig) {
	const notSent = await t(guildId, 'ticket_cfg_not_sent');
	const panelChanText = await t(guildId, 'ticket_cfg_panel_chan', { channel: ticketConfig.panelChannelId ? `<#${ticketConfig.panelChannelId}>` : notSent });
	const backRow = await buildBackRow(guildId);

	const termPanel = await t(guildId, 'term_panel');
	const termTitle = await t(guildId, 'term_title');
	const termDescription = await t(guildId, 'term_description');

	const btnEditTitleDesc = await t(guildId, 'ticket_cfg_btn_edit_title_desc');
	const btnRefreshPanel = await t(guildId, 'ticket_cfg_btn_refresh_panel');

	const panelDesc = await t(guildId, 'ticket_cfg_panel_channel_desc');
	const channelPlaceholder = await t(guildId, 'ticket_cfg_select_channel_placeholder');

	return new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents(tMsg => tMsg.setContent(`## <:monitorcog:1527035219109085234> ${termPanel}`))
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
		.addTextDisplayComponents(tMsg => tMsg.setContent(
			[
				`**${termTitle}:** ${ticketConfig.panelTitle}`,
				`**${termDescription}:** ${ticketConfig.panelDescription}`,
				panelChanText,
			].join('\n'),
		))
		.addActionRowComponents(
			new ActionRowBuilder().addComponents(
				new ButtonBuilder().setCustomId(`${CONFIG_PREFIX}:panel:edit_text`).setLabel(btnEditTitleDesc).setStyle(ButtonStyle.Primary),
				new ButtonBuilder().setCustomId(`${CONFIG_PREFIX}:panel:refresh`).setLabel(btnRefreshPanel).setStyle(ButtonStyle.Secondary),
			),
		)
		.addTextDisplayComponents(tMsg => tMsg.setContent(panelDesc))
		.addActionRowComponents(
			new ActionRowBuilder().addComponents(
				new ChannelSelectMenuBuilder()
					.setCustomId(`${CONFIG_PREFIX}:panel:send`)
					.setPlaceholder(channelPlaceholder)
					.addChannelTypes(ChannelType.GuildText),
			),
		)
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(false))
		.addActionRowComponents(backRow);
}

/**
 * @param {string} guildId
 * @param {import('mongoose').Document} ticketConfig
 * @returns {Promise<import('discord.js').ContainerBuilder>}
 */
async function buildConfigCategoriesContainer(guildId, ticketConfig) {
	const backRow = await buildBackRow(guildId);
	const termCategories = await t(guildId, 'term_categories');
	const termSlot = await t(guildId, 'term_slot');
	const termEmpty = await t(guildId, 'term_empty');
	const termEdit = await t(guildId, 'term_edit');
	const termSet = await t(guildId, 'term_set');
	const termRemove = await t(guildId, 'term_remove');
	const categoriesDesc = await t(guildId, 'ticket_cfg_panel_categories_desc');

	const container = new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents(tMsg => tMsg.setContent(`## <:folders:1527035124632522772> ${termCategories}`))
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
		.addTextDisplayComponents(tMsg => tMsg.setContent(categoriesDesc));

	for (let slot = 1; slot <= 3; slot++) {
		const category = ticketConfig.categories[slot - 1];

		container.addTextDisplayComponents(tMsg => tMsg.setContent(
			category
				? `**${termSlot} ${slot}:** ${category.emoji ? `${category.emoji} ` : ''}${category.label} \`(${category.id})\`${category.description ? `\n-# ${category.description}` : ''}`
				: `**${termSlot} ${slot}:** _${termEmpty}_`,
		));

		const row = new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId(`${CONFIG_PREFIX}:categories:edit:${slot}`)
				.setLabel(category ? termEdit : termSet)
				.setStyle(ButtonStyle.Primary),
		);

		if (category) {
			row.addComponents(
				new ButtonBuilder()
					.setCustomId(`${CONFIG_PREFIX}:categories:remove:${slot}`)
					.setLabel(termRemove)
					.setStyle(ButtonStyle.Danger),
			);
		}

		container.addActionRowComponents(row);
	}

	container
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(false))
		.addActionRowComponents(backRow);

	return container;
}

// NOTE: CONTINUE TRANSLATIONS FROM HERE
// NOTE: CONTINUE TRANSLATIONS FROM HERE
// NOTE: CONTINUE TRANSLATIONS FROM HERE

/**
 * @param {string} guildId
 * @param {import('mongoose').Document} ticketConfig
 * @returns {Promise<import('discord.js').ContainerBuilder>}
 */
async function buildConfigRolesContainer(guildId, ticketConfig) {
	const select = new RoleSelectMenuBuilder()
		.setCustomId(`${CONFIG_PREFIX}:roles:set`)
		.setPlaceholder('Select support roles...')
		.setMinValues(0)
		.setMaxValues(10);

	if (ticketConfig.supportRoleIds.length) {
		select.setDefaultRoles(ticketConfig.supportRoleIds.slice(0, 25));
	}

	const noneSet = await t(guildId, 'ticket_cfg_none_set');
	const resolvedRoles = ticketConfig.supportRoleIds.length ? ticketConfig.supportRoleIds.map(id => `<@&${id}>`).join(', ') : noneSet;
	const supportRolesText = await t(guildId, 'ticket_cfg_support_roles', { roles: resolvedRoles });
	const backRow = await buildBackRow(guildId);

	return new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents(tMsg => tMsg.setContent('## <:shield:1527035003492368558> Support Roles'))
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
		.addTextDisplayComponents(tMsg => tMsg.setContent(
			[
				supportRolesText,
				'-# Selected roles (plus Manage Server/Channels) can manage tickets. Selecting replaces the full list.',
			].join('\n'),
		))
		.addActionRowComponents(new ActionRowBuilder().addComponents(select))
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(false))
		.addActionRowComponents(backRow);
}

/**
 * @param {string} guildId
 * @param {import('mongoose').Document} ticketConfig
 * @returns {Promise<import('discord.js').ContainerBuilder>}
 */
async function buildConfigLimitContainer(guildId, ticketConfig) {
	const select = new StringSelectMenuBuilder()
		.setCustomId(`${CONFIG_PREFIX}:limit:set`)
		.setPlaceholder(`Current: ${ticketConfig.maxOpenPerUser}`)
		.addOptions([1, 2, 3, 4, 5].map(n => ({
			label: `${n} open ticket${n === 1 ? '' : 's'}`,
			value: String(n),
			default: n === ticketConfig.maxOpenPerUser,
		})));

	const backRow = await buildBackRow(guildId);

	return new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents(tMsg => tMsg.setContent('## <:infinity:1527034881715208273> Ticket Limit'))
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
		.addTextDisplayComponents(tMsg => tMsg.setContent('-# Maximum number of open tickets a single user may have at once.'))
		.addActionRowComponents(new ActionRowBuilder().addComponents(select))
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(false))
		.addActionRowComponents(backRow);
}

/**
 * @param {string} page
 * @param {string} guildId
 * @param {import('mongoose').Document} ticketConfig
 * @returns {Promise<import('discord.js').ContainerBuilder>}
 */
async function renderConfigPage(page, guildId, ticketConfig) {
	switch (page) {
	case 'channels': return buildConfigChannelsContainer(guildId, ticketConfig);
	case 'panel': return buildConfigPanelContainer(guildId, ticketConfig);
	case 'categories': return buildConfigCategoriesContainer(guildId, ticketConfig);
	case 'roles': return buildConfigRolesContainer(guildId, ticketConfig);
	case 'limit': return buildConfigLimitContainer(guildId, ticketConfig);
	default: return buildConfigHomeContainer(guildId, ticketConfig);
	}
}

/**
 * Builds and shows the "edit panel text" modal, then applies the submission.
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {import('mongoose').Document} ticketConfig
 */
async function handlePanelTextModal(interaction, ticketConfig) {
	const modal = new ModalBuilder()
		.setCustomId(`${CONFIG_PREFIX}:panel:modal`)
		.setTitle('Edit Panel Text')
		.addComponents(
			new ActionRowBuilder().addComponents(
				new TextInputBuilder()
					.setCustomId('title')
					.setLabel('Panel Title')
					.setStyle(TextInputStyle.Short)
					.setMaxLength(100)
					.setRequired(false)
					.setValue(ticketConfig.panelTitle ?? ''),
			),
			new ActionRowBuilder().addComponents(
				new TextInputBuilder()
					.setCustomId('description')
					.setLabel('Panel Description')
					.setStyle(TextInputStyle.Paragraph)
					.setMaxLength(1000)
					.setRequired(false)
					.setValue(ticketConfig.panelDescription ?? ''),
			),
		);

	await interaction.showModal(modal);

	const submitted = await interaction.awaitModalSubmit({
		filter: m => m.customId === `${CONFIG_PREFIX}:panel:modal` && m.user.id === interaction.user.id,
		time: 5 * 60 * 1000,
	}).catch(() => null);

	if (!submitted) return;

	const title = submitted.fields.getTextInputValue('title');
	const description = submitted.fields.getTextInputValue('description');
	const updates = {};
	if (title) updates.panelTitle = title;
	if (description) updates.panelDescription = description;

	if (Object.keys(updates).length) {
		await updateTicketConfig(interaction.guildId, updates);
		Object.assign(ticketConfig, updates);
	}

	const panelContainer = await buildConfigPanelContainer(interaction.guildId, ticketConfig);
	await submitted.update({ components: [panelContainer] });
}

/**
 * Builds and shows the "edit category" modal for a given slot, then applies the submission.
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {import('mongoose').Document} ticketConfig
 * @param {number} slot
 */
async function handleCategoryModal(interaction, ticketConfig, slot) {
	if (slot - 1 > ticketConfig.categories.length) {
		await interaction.reply({
			components: [buildTextContainer(`<:x_:1526217756926808174> **Error:** Set slot **${ticketConfig.categories.length + 1}** before configuring slot **${slot}**.`, 0xFF0000)],
			flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
		});
		return;
	}

	const existing = ticketConfig.categories[slot - 1];
	const modal = new ModalBuilder()
		.setCustomId(`${CONFIG_PREFIX}:categories:modal:${slot}`)
		.setTitle(`Slot ${slot} Category`)
		.addComponents(
			new ActionRowBuilder().addComponents(
				new TextInputBuilder().setCustomId('label').setLabel('Label').setStyle(TextInputStyle.Short)
					.setMaxLength(80).setRequired(true).setValue(existing?.label ?? ''),
			),
			new ActionRowBuilder().addComponents(
				new TextInputBuilder().setCustomId('id').setLabel('Internal ID (optional)').setStyle(TextInputStyle.Short)
					.setMaxLength(32).setRequired(false).setValue(existing?.id ?? ''),
			),
			new ActionRowBuilder().addComponents(
				new TextInputBuilder().setCustomId('emoji').setLabel('Emoji (optional)').setStyle(TextInputStyle.Short)
					.setMaxLength(50).setRequired(false).setValue(existing?.emoji ?? ''),
			),
			new ActionRowBuilder().addComponents(
				new TextInputBuilder().setCustomId('description').setLabel('Description (optional)').setStyle(TextInputStyle.Short)
					.setMaxLength(100).setRequired(false).setValue(existing?.description ?? ''),
			),
		);

	await interaction.showModal(modal);

	const submitted = await interaction.awaitModalSubmit({
		filter: m => m.customId === `${CONFIG_PREFIX}:categories:modal:${slot}` && m.user.id === interaction.user.id,
		time: 5 * 60 * 1000,
	}).catch(() => null);

	if (!submitted) return;

	const label = submitted.fields.getTextInputValue('label');
	const customId = submitted.fields.getTextInputValue('id') || slugifyCategoryId(label);
	const emoji = submitted.fields.getTextInputValue('emoji') || null;
	const description = submitted.fields.getTextInputValue('description') || null;

	const duplicate = ticketConfig.categories.find((category, index) => category.id === customId && index !== slot - 1);
	if (duplicate) {
		await submitted.reply({
			components: [buildTextContainer('<:x_:1526217756926808174> **Error:** That category ID is already used by another slot.', 0xFF0000)],
			flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
		});
		return;
	}

	const categories = ticketConfig.categories.map(category => ({
		id: category.id,
		label: category.label,
		emoji: category.emoji,
		description: category.description,
	}));
	categories[slot - 1] = { id: customId, label, emoji, description };
	ticketConfig.categories = categories.slice(0, 3);
	await ticketConfig.save();

	const categoriesContainer = await buildConfigCategoriesContainer(interaction.guildId, ticketConfig);
	await submitted.update({ components: [categoriesContainer] });
}

/**
 * Routes a single message-component interaction collected from the config dashboard.
 * @param {import('discord.js').MessageComponentInteraction} interaction
 * @param {import('mongoose').Document} ticketConfig
 */
async function handleConfigComponent(interaction, ticketConfig) {
	if (interaction.customId === `${CONFIG_PREFIX}:nav`) {
		const pageContainer = await renderConfigPage(interaction.values[0], interaction.guildId, ticketConfig);
		await interaction.update({ components: [pageContainer] });
		return;
	}

	if (interaction.customId === `${CONFIG_PREFIX}:home`) {
		const homeContainer = await buildConfigHomeContainer(interaction.guildId, ticketConfig);
		await interaction.update({ components: [homeContainer] });
		return;
	}

	const [, page, action, extra] = interaction.customId.split(':');

	switch (page) {
	case 'channels': {
		const channelId = interaction.values[0];
		if (action === 'thread') {
			await updateTicketConfig(interaction.guildId, { threadChannelId: channelId });
			ticketConfig.threadChannelId = channelId;
		}
		else if (action === 'log') {
			await updateTicketConfig(interaction.guildId, { logChannelId: channelId });
			ticketConfig.logChannelId = channelId;
		}
		const channelsContainer = await buildConfigChannelsContainer(interaction.guildId, ticketConfig);
		await interaction.update({ components: [channelsContainer] });
		return;
	}

	case 'panel': {
		if (action === 'edit_text') {
			await handlePanelTextModal(interaction, ticketConfig);
			return;
		}

		if (action === 'refresh') {
			await interaction.deferUpdate();
			try {
				await refreshTicketPanel(interaction.guild, ticketConfig);
				const panelContainer = await buildConfigPanelContainer(interaction.guildId, ticketConfig);
				await interaction.editReply({ components: [panelContainer] });
				await interaction.followUp({
					components: [buildTextContainer('<:check:1526217602010185959> Panel refreshed.')],
					flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
				});
			}
			catch (error) {
				await interaction.followUp({
					components: [buildTextContainer(`<:x_:1526217756926808174> **Error:** ${error.message}`, 0xFF0000)],
					flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
				});
			}
			return;
		}

		if (action === 'send') {
			const channelId = interaction.values[0];
			await interaction.deferUpdate();
			try {
				const channel = await interaction.guild.channels.fetch(channelId);
				await sendTicketPanel(interaction.guild, channel, ticketConfig);
				const refreshed = await getTicketConfig(interaction.guildId);
				Object.assign(ticketConfig, refreshed.toObject ? refreshed.toObject() : refreshed);
				const panelContainer = await buildConfigPanelContainer(interaction.guildId, ticketConfig);
				await interaction.editReply({ components: [panelContainer] });
				await interaction.followUp({
					components: [buildTextContainer(`<:check:1526217602010185959> Panel sent to <#${channelId}>.`)],
					flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
				});
			}
			catch (error) {
				await interaction.followUp({
					components: [buildTextContainer(`<:x_:1526217756926808174> **Error:** ${error.message}`, 0xFF0000)],
					flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
				});
			}
			return;
		}
		break;
	}

	case 'categories': {
		const slot = Number(extra);

		if (action === 'edit') {
			await handleCategoryModal(interaction, ticketConfig, slot);
			return;
		}

		if (action === 'remove') {
			if (slot - 1 >= ticketConfig.categories.length) {
				await replyContainer(interaction, buildTextContainer('<:x_:1526217756926808174> **Error:** That category slot is already empty.', 0xFF0000));
				return;
			}
			ticketConfig.categories.splice(slot - 1, 1);
			await ticketConfig.save();
			const categoriesContainer = await buildConfigCategoriesContainer(interaction.guildId, ticketConfig);
			await interaction.update({ components: [categoriesContainer] });
			return;
		}
		break;
	}

	case 'roles': {
		if (action === 'set') {
			ticketConfig.supportRoleIds = interaction.values;
			await ticketConfig.save();
			const rolesContainer = await buildConfigRolesContainer(interaction.guildId, ticketConfig);
			await interaction.update({ components: [rolesContainer] });
			return;
		}
		break;
	}

	case 'limit': {
		if (action === 'set') {
			const amount = Number(interaction.values[0]);
			await updateTicketConfig(interaction.guildId, { maxOpenPerUser: amount });
			ticketConfig.maxOpenPerUser = amount;
			const limitContainer = await buildConfigLimitContainer(interaction.guildId, ticketConfig);
			await interaction.update({ components: [limitContainer] });
			return;
		}
		break;
	}

	default:
		break;
	}
}

/**
 * Opens the interactive, page-based ticket configuration dashboard for an admin.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function startConfigSession(interaction) {
	let ticketConfig = await getTicketConfig(interaction.guildId);
	const configHome = await buildConfigHomeContainer(interaction.guildId, ticketConfig);

	await interaction.reply({
		components: [configHome],
		flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
	});

	const reply = await interaction.fetchReply();

	const collector = reply.createMessageComponentCollector({
		filter: i => i.user.id === interaction.user.id,
		idle: 5 * 60 * 1000,
		time: 15 * 60 * 1000,
	});

	collector.on('collect', async i => {
		try {
			ticketConfig = await getTicketConfig(interaction.guildId);
			await handleConfigComponent(i, ticketConfig);
		}
		catch (error) {
			logger.error('Failed to handle ticket config interaction:', error);
			const errSomethingWrong = await t(interaction.guildId, 'ticket_err_something_wrong');
			const errorContainer = buildTextContainer(`<:x_:1526217756926808174> **Error:** ${errSomethingWrong}`, 0xFF0000);
			if (i.deferred || i.replied) {
				await i.followUp({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => null);
			}
			else {
				await i.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => null);
			}
		}
	});

	collector.on('end', async () => {
		const errExpired = await t(interaction.guildId, 'ticket_err_session_expired');
		await interaction.editReply({
			components: [buildTextContainer(`-# ${errExpired}`)],
		}).catch(() => null);
	});
}

/**
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {string} categoryId
 */
async function handleOpenTicket(interaction, categoryId) {
	if (!interaction.inGuild()) {
		const errNotGuild = await t(interaction.guildId, 'ticket_err_not_guild');
		return replyContainer(interaction, buildTextContainer(`<:x_:1526217756926808174> **Error:** ${errNotGuild}`, 0xFF0000));
	}

	const ticketConfig = await getTicketConfig(interaction.guildId);
	const category = ticketConfig.categories.find(entry => entry.id === categoryId);

	if (!category) {
		const errCategoryNotFound = await t(interaction.guildId, 'ticket_err_category_not_found');
		return replyContainer(interaction, buildTextContainer(`<:x_:1526217756926808174> **Error:** ${errCategoryNotFound}`, 0xFF0000));
	}

	if (!ticketConfig.threadChannelId) {
		const errNotConfigured = await t(interaction.guildId, 'ticket_err_not_configured');
		return replyContainer(interaction, buildTextContainer(`<:x_:1526217756926808174> **Error:** ${errNotConfigured}`, 0xFF0000));
	}

	const openCount = await Ticket.countDocuments({
		guildId: interaction.guildId,
		openerId: interaction.user.id,
		status: 'open',
	});

	if (openCount >= ticketConfig.maxOpenPerUser) {
		const errMaxOpen = await t(interaction.guildId, 'ticket_err_max_open', { count: openCount });
		return replyContainer(interaction, buildTextContainer(`<:x_:1526217756926808174> **Error:** ${errMaxOpen}`, 0xFF0000));
	}

	const threadChannel = await interaction.guild.channels.fetch(ticketConfig.threadChannelId);
	if (!threadChannel?.isTextBased() || threadChannel.isThread()) {
		const errInvalidThreadChan = await t(interaction.guildId, 'ticket_err_invalid_thread_chan');
		return replyContainer(interaction, buildTextContainer(`<:x_:1526217756926808174> **Error:** ${errInvalidThreadChan}`, 0xFF0000));
	}

	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	try {
		const thread = await threadChannel.threads.create({
			name: buildThreadName(threadChannel, category.label, interaction.user),
			type: ChannelType.PrivateThread,
			reason: `Ticket opened by ${interaction.user.tag}`,
		});

		await thread.members.add(interaction.user.id);

		const ticket = await Ticket.create({
			guildId: interaction.guildId,
			threadId: thread.id,
			categoryId: category.id,
			categoryLabel: category.label,
			openerId: interaction.user.id,
			participants: [interaction.user.id],
		});

		await sendThreadWelcome(thread, ticket, interaction.user);
		await sendLogNotification(interaction.guild, ticketConfig, ticket);

		const msgCreated = await t(interaction.guildId, 'ticket_msg_created', { thread: thread.toString() });
		await interaction.editReply({
			components: [buildTextContainer(`<:check:1526217602010185959> ${msgCreated}`)],
			flags: MessageFlags.IsComponentsV2,
		});
	}
	catch (error) {
		logger.error(`Failed to open ticket for ${interaction.user.tag}:`, error);
		const errCreateFailed = await t(interaction.guildId, 'ticket_err_create_failed');
		await interaction.editReply({
			components: [buildTextContainer(`<:x_:1526217756926808174> **Error:** ${errCreateFailed}`, 0xFF0000)],
			flags: MessageFlags.IsComponentsV2,
		});
	}
}

/**
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {string} threadId
 */
async function handleJoinTicket(interaction, threadId) {
	if (!interaction.inGuild()) {
		const errNotGuild = await t(interaction.guildId, 'ticket_err_not_guild');
		return replyContainer(interaction, buildTextContainer(`<:x_:1526217756926808174> **Error:** ${errNotGuild}`, 0xFF0000));
	}

	const ticket = await Ticket.findOne({ guildId: interaction.guildId, threadId, status: 'open' });
	if (!ticket) {
		const errJoinClosed = await t(interaction.guildId, 'ticket_err_join_closed');
		return replyContainer(interaction, buildTextContainer(`<:x_:1526217756926808174> **Error:** ${errJoinClosed}`, 0xFF0000));
	}

	const thread = await interaction.guild.channels.fetch(threadId);
	if (!thread?.isThread()) {
		const errThreadNotFound = await t(interaction.guildId, 'ticket_err_thread_not_found');
		return replyContainer(interaction, buildTextContainer(`<:x_:1526217756926808174> **Error:** ${errThreadNotFound}`, 0xFF0000));
	}

	try {
		await thread.members.add(interaction.user.id);
		if (!ticket.participants.includes(interaction.user.id)) {
			ticket.participants.push(interaction.user.id);
			await ticket.save();
		}

		const msgJoined = await t(interaction.guildId, 'ticket_msg_joined', { thread: thread.toString() });
		await replyContainer(interaction, buildTextContainer(`<:check:1526217602010185959> ${msgJoined}`));
	}
	catch (error) {
		logger.error(`Failed to join ticket ${threadId}:`, error);
		const errJoinFailed = await t(interaction.guildId, 'ticket_err_join_failed');
		await replyContainer(interaction, buildTextContainer(`<:x_:1526217756926808174> **Error:** ${errJoinFailed}`, 0xFF0000));
	}
}

/**
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {string} threadId
 */
async function handleCloseTicketButton(interaction, threadId) {
	if (!interaction.inGuild()) {
		const errNotGuild = await t(interaction.guildId, 'ticket_err_not_guild');
		return replyContainer(interaction, buildTextContainer(`<:x_:1526217756926808174> **Error:** ${errNotGuild}`, 0xFF0000));
	}

	const ticket = await Ticket.findOne({ guildId: interaction.guildId, threadId });
	if (!ticket || ticket.status === 'closed') {
		const errAlreadyClosed = await t(interaction.guildId, 'ticket_err_already_closed');
		return replyContainer(interaction, buildTextContainer(`<:x_:1526217756926808174> **Error:** ${errAlreadyClosed}`, 0xFF0000));
	}

	const ticketConfig = await getTicketConfig(interaction.guildId);
	const member = interaction.member;
	if (!canManageTicket(member, ticketConfig, ticket)) {
		const errNoPermission = await t(interaction.guildId, 'ticket_err_no_permission');
		return replyContainer(interaction, buildTextContainer(`<:x_:1526217756926808174> **Error:** ${errNoPermission}`, 0xFF0000));
	}

	const closeConfirmTitle = await t(interaction.guildId, 'ticket_close_confirm_title');
	const closeConfirmDesc = await t(interaction.guildId, 'ticket_close_confirm_desc');
	const confirmBtnLabel = await t(interaction.guildId, 'ticket_close_confirm_btn');
	const cancelBtnLabel = await t(interaction.guildId, 'ticket_close_cancel_btn');

	const container = new ContainerBuilder()
		.setAccentColor(0xFF0000)
		.addTextDisplayComponents(textDisplay =>
			textDisplay.setContent(`## ${closeConfirmTitle}\n${closeConfirmDesc}`),
		)
		.addActionRowComponents(
			new ActionRowBuilder().addComponents(
				new ButtonBuilder()
					.setCustomId(`${BUTTON_PREFIX}:confirm_close:${threadId}`)
					.setLabel(confirmBtnLabel)
					.setStyle(ButtonStyle.Danger),
				new ButtonBuilder()
					.setCustomId(`${BUTTON_PREFIX}:cancel_close:${threadId}`)
					.setLabel(cancelBtnLabel)
					.setStyle(ButtonStyle.Secondary),
			),
		);

	await interaction.reply({
		components: [container],
		flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
	});
}

/**
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {string} threadId
 */
async function handleConfirmClose(interaction, threadId) {
	await closeTicket(interaction, threadId, interaction.user.id);
}

/**
 * @param {import('discord.js').Interaction} interaction
 * @param {string} threadId
 * @param {string} closedById
 * @param {string | null} [reason]
 */
async function closeTicket(interaction, threadId, closedById, reason = null) {
	const ticket = await Ticket.findOne({ guildId: interaction.guildId, threadId });
	if (!ticket || ticket.status === 'closed') {
		const errAlreadyClosed = await t(interaction.guildId, 'ticket_err_already_closed');
		return replyContainer(interaction, buildTextContainer(`<:x_:1526217756926808174> **Error:** ${errAlreadyClosed}`, 0xFF0000));
	}

	const ticketConfig = await getTicketConfig(interaction.guildId);
	const member = interaction.member;
	if (!canManageTicket(member, ticketConfig, ticket)) {
		const errNoPermission = await t(interaction.guildId, 'ticket_err_no_permission');
		return replyContainer(interaction, buildTextContainer(`<:x_:1526217756926808174> **Error:** ${errNoPermission}`, 0xFF0000));
	}

	const thread = await interaction.guild.channels.fetch(threadId);
	if (!thread?.isThread()) {
		const errThreadNotFound = await t(interaction.guildId, 'ticket_err_thread_not_found');
		return replyContainer(interaction, buildTextContainer(`<:x_:1526217756926808174> **Error:** ${errThreadNotFound}`, 0xFF0000));
	}

	ticket.status = 'closed';
	ticket.closedAt = new Date();
	ticket.closedBy = closedById;
	await ticket.save();

	const closeNoticeTitle = await t(interaction.guildId, 'ticket_close_notice_title');
	const closeNoticeBody = await t(interaction.guildId, 'ticket_close_notice_body', { user: `<@${closedById}>` });
	const closeNoticeFooter = await t(interaction.guildId, 'ticket_close_notice_footer');
	const noticeLines = [
		`## ${closeNoticeTitle}`,
		closeNoticeBody,
	];

	if (reason) {
		const closeNoticeReason = await t(interaction.guildId, 'ticket_close_notice_reason', { reason });
		noticeLines.push(closeNoticeReason);
	}
	noticeLines.push(closeNoticeFooter);

	const closeNotice = new ContainerBuilder()
		.setAccentColor(0xFF0000)
		.addTextDisplayComponents(textDisplay =>
			textDisplay.setContent(noticeLines.join('\n')),
		);

	try {
		await thread.send({
			components: [closeNotice],
			flags: MessageFlags.IsComponentsV2,
		});
	}
	catch (error) {
		logger.error(`Failed to send close notice in ticket thread ${threadId}:`, error);
	}

	if (interaction.isRepliable()) {
		const method = interaction.replied || interaction.deferred ? 'followUp' : 'reply';
		const closeSuccessMsg = await t(interaction.guildId, 'ticket_close_success');
		await interaction[method]({
			components: [buildTextContainer(`<:check:1526217602010185959> ${closeSuccessMsg}`)],
			flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
		}).catch(error => logger.error(`Failed to confirm ticket close for ${threadId}:`, error));
	}

	try {
		await thread.setArchived(true, reason ?? 'Ticket closed');
	}
	catch (error) {
		logger.error(`Failed to archive ticket thread ${threadId}:`, error);
	}
}

/**
 * @param {import('discord.js').Interaction} interaction
 */
async function handleTicketButton(interaction) {
	if (!interaction.isButton()) return false;

	const [prefix, action, payload] = interaction.customId.split(':');
	if (prefix !== BUTTON_PREFIX || !action) return false;

	switch (action) {
	case 'open':
		await handleOpenTicket(interaction, payload);
		break;
	case 'join':
		await handleJoinTicket(interaction, payload);
		break;
	case 'close':
		await handleCloseTicketButton(interaction, payload);
		break;
	case 'confirm_close':
		await handleConfirmClose(interaction, payload);
		break;
	case 'cancel_close': {
		const cancelledMsg = await t(interaction.guildId, 'ticket_close_cancelled');
		await replyContainer(interaction, buildTextContainer(cancelledMsg));
		break;
	}
	default:
		return false;
	}

	return true;
}

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @returns {Promise<import('mongoose').Document | null>}
 */
async function getActiveTicketFromInteraction(interaction) {
	if (!interaction.channel?.isThread()) {
		const errNotThread = await t(interaction.guildId, 'ticket_err_command_not_thread');
		await replyContainer(interaction, buildTextContainer(`<:x_:1526217756926808174> **Error:** ${errNotThread}`, 0xFF0000));
		return null;
	}

	const ticket = await Ticket.findOne({
		guildId: interaction.guildId,
		threadId: interaction.channel.id,
	});

	if (!ticket) {
		const errNotTracked = await t(interaction.guildId, 'ticket_err_not_tracked');
		await replyContainer(interaction, buildTextContainer(`<:x_:1526217756926808174> **Error:** ${errNotTracked}`, 0xFF0000));
		return null;
	}

	return ticket;
}

export {
	accentColor,
	BUTTON_PREFIX,
	CONFIG_PREFIX,
	getTicketConfig,
	updateTicketConfig,
	buildTextContainer,
	replyContainer,
	buildPanelContainer,
	sendTicketPanel,
	refreshTicketPanel,
	canManageTicket,
	handleTicketButton,
	getActiveTicketFromInteraction,
	closeTicket,
	slugifyCategoryId,
	startConfigSession,
};
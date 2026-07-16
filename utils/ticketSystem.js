const {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelSelectMenuBuilder,
	ChannelType,
	ContainerBuilder,
	MessageFlags,
	ModalBuilder,
	PermissionFlagsBits,
	RoleSelectMenuBuilder,
	SeparatorSpacingSize,
	StringSelectMenuBuilder,
	TextInputBuilder,
	TextInputStyle,
} = require('discord.js');
const Ticket = require('../models/Ticket');
const TicketConfig = require('../models/TicketConfig');
const config = require('../config.js');
const logger = require('./logger');

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
 * @param {import('mongoose').Document} ticketConfig
 * @returns {import('discord.js').ContainerBuilder}
 */
function buildPanelContainer(ticketConfig) {
	const categoryLines = ticketConfig.categories.length
		? ticketConfig.categories.map((category, index) =>
			`-# **${index + 1}.** ${category.emoji ? `${category.emoji} ` : ''}**${category.label}**${category.description ? ` - ${category.description}` : ''}`,
		).join('\n')
		: '-# No categories configured yet.';

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
		throw new Error('Add at least one ticket category before sending the panel.');
	}

	const container = buildPanelContainer(ticketConfig);
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
		throw new Error('No ticket panel has been sent yet. Send one from `/tickets config` → Panel.');
	}

	const channel = await guild.channels.fetch(ticketConfig.panelChannelId);
	if (!channel?.isTextBased()) {
		throw new Error('The saved panel channel is missing or is not a text channel.');
	}

	const message = await channel.messages.fetch(ticketConfig.panelMessageId);
	const container = buildPanelContainer(ticketConfig);
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

	const container = new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents(textDisplay =>
			textDisplay.setContent(
				[
					'## <:userplus:1526207309032984777> New Ticket Opened',
					`-# **Category:** ${ticket.categoryLabel}`,
					`-# **Opened by:** <@${ticket.openerId}>`,
					`-# **Thread:** <#${ticket.threadId}>`,
				].join('\n'),
			),
		)
		.addActionRowComponents(
			new ActionRowBuilder().addComponents(
				new ButtonBuilder()
					.setCustomId(`${BUTTON_PREFIX}:join:${ticket.threadId}`)
					.setLabel('Join Ticket')
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
	const claimedByText = ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'No one';

	const container = new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents(textDisplay =>
			textDisplay.setContent(
				[
					`## <:ticket:1527187232488947813> ${ticket.categoryLabel} Ticket`,
					'Welcome! Support will be with you shortly.',
					'-# Use the button below or `/tickets close` when you are done.',
				].join('\n'),
			),
		)
		.addSeparatorComponents(separator =>
			separator.setSpacing(SeparatorSpacingSize.Small).setDivider(true),
		)
		.addTextDisplayComponents(textDisplay =>
			textDisplay.setContent(
				[
					`<:user:1526207642622759134> **Opener:** <@${ticket.openerId}>`,
					`<:folders:1527035124632522772> **Category:** ${ticket.categoryLabel}`,
					`<:hash:1527190378737045637> **Ticket ID:** \`${ticket.threadId}\``,
					`<:shield:1527035003492368558> **Claimed by:** ${claimedByText}`,
				].join('\n'),
			),
		)
		.addActionRowComponents(
			new ActionRowBuilder().addComponents(
				new ButtonBuilder()
					.setCustomId(`${BUTTON_PREFIX}:close:${ticket.threadId}`)
					.setLabel('Close Ticket')
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

/* ------------------------------------------------------------------------ */
/*  Interactive /tickets config dashboard (Components V2)                    */
/* ------------------------------------------------------------------------ */

/**
 * @returns {import('discord.js').ActionRowBuilder}
 */
function buildBackRow() {
	return new ActionRowBuilder().addComponents(
		new ButtonBuilder().setCustomId(`${CONFIG_PREFIX}:home`).setLabel('Back').setEmoji({ name: 'chevronleft', id: '1527044793891295402' }).setStyle(ButtonStyle.Secondary),
	);
}

/**
 * @param {import('mongoose').Document} ticketConfig
 * @returns {import('discord.js').ContainerBuilder}
 */
function buildConfigHomeContainer(ticketConfig) {
	const supportRoles = ticketConfig.supportRoleIds.length
		? ticketConfig.supportRoleIds.map(id => `<@&${id}>`).join(', ')
		: '_None set_';

	const categoriesSummary = ticketConfig.categories.length
		? `${ticketConfig.categories.length}/3 configured`
		: '_None configured_';

	return new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents(t => t.setContent('## <:useredit:1526207844448211014> Ticket Configuration'))
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
		.addTextDisplayComponents(t => t.setContent(
			[
				`**Thread channel:** ${ticketConfig.threadChannelId ? `<#${ticketConfig.threadChannelId}>` : '_Not set_'}`,
				`**Log channel:** ${ticketConfig.logChannelId ? `<#${ticketConfig.logChannelId}>` : '_Not set_'}`,
				`**Panel channel:** ${ticketConfig.panelChannelId ? `<#${ticketConfig.panelChannelId}>` : '_Not sent_'}`,
				`**Max open per user:** ${ticketConfig.maxOpenPerUser}`,
				`**Support roles:** ${supportRoles}`,
				`**Categories:** ${categoriesSummary}`,
			].join('\n'),
		))
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(false))
		.addTextDisplayComponents(t => t.setContent('-# Select a section below to configure it.'))
		.addActionRowComponents(
			new ActionRowBuilder().addComponents(
				new StringSelectMenuBuilder()
					.setCustomId(`${CONFIG_PREFIX}:nav`)
					.setPlaceholder('Select a section to configure...')
					.addOptions(
						{ label: 'Channels', description: 'Thread & log channels', value: 'channels', emoji: '<:folder:1527035309727158372>' },
						{ label: 'Panel', description: 'Panel text, send & refresh', value: 'panel', emoji: '<:monitorcog:1527035219109085234>' },
						{ label: 'Categories', description: 'Ticket category buttons', value: 'categories', emoji: '<:folders:1527035124632522772>' },
						{ label: 'Support Roles', description: 'Roles that can manage tickets', value: 'roles', emoji: '<:shield:1527035003492368558>' },
						{ label: 'Ticket Limit', description: 'Max open tickets per user', value: 'limit', emoji: '<:infinity:1527034881715208273>' },
					),
			),
		);
}

/**
 * @param {import('mongoose').Document} ticketConfig
 * @returns {import('discord.js').ContainerBuilder}
 */
function buildConfigChannelsContainer(ticketConfig) {
	return new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents(t => t.setContent('## <:folder:1527035309727158372> Channels'))
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
		.addTextDisplayComponents(t => t.setContent(
			[
				`**Thread channel:** ${ticketConfig.threadChannelId ? `<#${ticketConfig.threadChannelId}>` : '_Not set_'}`,
				'-# Where private ticket threads are created.',
			].join('\n'),
		))
		.addActionRowComponents(
			new ActionRowBuilder().addComponents(
				new ChannelSelectMenuBuilder()
					.setCustomId(`${CONFIG_PREFIX}:channels:thread`)
					.setPlaceholder('Select thread channel...')
					.addChannelTypes(ChannelType.GuildText),
			),
		)
		.addTextDisplayComponents(t => t.setContent(
			[
				`**Log channel:** ${ticketConfig.logChannelId ? `<#${ticketConfig.logChannelId}>` : '_Not set_'}`,
				'-# Where new-ticket alerts are posted for staff.',
			].join('\n'),
		))
		.addActionRowComponents(
			new ActionRowBuilder().addComponents(
				new ChannelSelectMenuBuilder()
					.setCustomId(`${CONFIG_PREFIX}:channels:log`)
					.setPlaceholder('Select log channel...')
					.addChannelTypes(ChannelType.GuildText),
			),
		)
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(false))
		.addActionRowComponents(buildBackRow());
}

/**
 * @param {import('mongoose').Document} ticketConfig
 * @returns {import('discord.js').ContainerBuilder}
 */
function buildConfigPanelContainer(ticketConfig) {
	return new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents(t => t.setContent('## <:monitorcog:1527035219109085234> Panel'))
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
		.addTextDisplayComponents(t => t.setContent(
			[
				`**Title:** ${ticketConfig.panelTitle}`,
				`**Description:** ${ticketConfig.panelDescription}`,
				`**Panel channel:** ${ticketConfig.panelChannelId ? `<#${ticketConfig.panelChannelId}>` : '_Not sent_'}`,
			].join('\n'),
		))
		.addActionRowComponents(
			new ActionRowBuilder().addComponents(
				new ButtonBuilder().setCustomId(`${CONFIG_PREFIX}:panel:edit_text`).setLabel('Edit Title/Description').setStyle(ButtonStyle.Primary),
				new ButtonBuilder().setCustomId(`${CONFIG_PREFIX}:panel:refresh`).setLabel('Refresh Live Panel').setStyle(ButtonStyle.Secondary),
			),
		)
		.addTextDisplayComponents(t => t.setContent('-# Select a channel below to send (or resend) the panel there.'))
		.addActionRowComponents(
			new ActionRowBuilder().addComponents(
				new ChannelSelectMenuBuilder()
					.setCustomId(`${CONFIG_PREFIX}:panel:send`)
					.setPlaceholder('Select channel to send panel...')
					.addChannelTypes(ChannelType.GuildText),
			),
		)
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(false))
		.addActionRowComponents(buildBackRow());
}

/**
 * @param {import('mongoose').Document} ticketConfig
 * @returns {import('discord.js').ContainerBuilder}
 */
function buildConfigCategoriesContainer(ticketConfig) {
	const container = new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents(t => t.setContent('## <:folders:1527035124632522772> Categories'))
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
		.addTextDisplayComponents(t => t.setContent('-# Up to 3 categories appear as buttons on the ticket panel.'));

	for (let slot = 1; slot <= 3; slot++) {
		const category = ticketConfig.categories[slot - 1];

		container.addTextDisplayComponents(t => t.setContent(
			category
				? `**Slot ${slot}:** ${category.emoji ? `${category.emoji} ` : ''}${category.label} \`(${category.id})\`${category.description ? `\n-# ${category.description}` : ''}`
				: `**Slot ${slot}:** _Empty_`,
		));

		const row = new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId(`${CONFIG_PREFIX}:categories:edit:${slot}`)
				.setLabel(category ? 'Edit' : 'Set')
				.setStyle(ButtonStyle.Primary),
		);

		if (category) {
			row.addComponents(
				new ButtonBuilder()
					.setCustomId(`${CONFIG_PREFIX}:categories:remove:${slot}`)
					.setLabel('Remove')
					.setStyle(ButtonStyle.Danger),
			);
		}

		container.addActionRowComponents(row);
	}

	container
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(false))
		.addActionRowComponents(buildBackRow());

	return container;
}

/**
 * @param {import('mongoose').Document} ticketConfig
 * @returns {import('discord.js').ContainerBuilder}
 */
function buildConfigRolesContainer(ticketConfig) {
	const select = new RoleSelectMenuBuilder()
		.setCustomId(`${CONFIG_PREFIX}:roles:set`)
		.setPlaceholder('Select support roles...')
		.setMinValues(0)
		.setMaxValues(10);

	if (ticketConfig.supportRoleIds.length) {
		select.setDefaultRoles(ticketConfig.supportRoleIds.slice(0, 25));
	}

	return new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents(t => t.setContent('## <:shield:1527035003492368558> Support Roles'))
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
		.addTextDisplayComponents(t => t.setContent(
			[
				ticketConfig.supportRoleIds.length ? ticketConfig.supportRoleIds.map(id => `<@&${id}>`).join(', ') : '_None set_',
				'-# Selected roles (plus Manage Server/Channels) can manage tickets. Selecting replaces the full list.',
			].join('\n'),
		))
		.addActionRowComponents(new ActionRowBuilder().addComponents(select))
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(false))
		.addActionRowComponents(buildBackRow());
}

/**
 * @param {import('mongoose').Document} ticketConfig
 * @returns {import('discord.js').ContainerBuilder}
 */
function buildConfigLimitContainer(ticketConfig) {
	const select = new StringSelectMenuBuilder()
		.setCustomId(`${CONFIG_PREFIX}:limit:set`)
		.setPlaceholder(`Current: ${ticketConfig.maxOpenPerUser}`)
		.addOptions([1, 2, 3, 4, 5].map(n => ({
			label: `${n} open ticket${n === 1 ? '' : 's'}`,
			value: String(n),
			default: n === ticketConfig.maxOpenPerUser,
		})));

	return new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents(t => t.setContent('## <:infinity:1527034881715208273> Ticket Limit'))
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
		.addTextDisplayComponents(t => t.setContent('-# Maximum number of open tickets a single user may have at once.'))
		.addActionRowComponents(new ActionRowBuilder().addComponents(select))
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(false))
		.addActionRowComponents(buildBackRow());
}

/**
 * @param {string} page
 * @param {import('mongoose').Document} ticketConfig
 * @returns {import('discord.js').ContainerBuilder}
 */
function renderConfigPage(page, ticketConfig) {
	switch (page) {
	case 'channels': return buildConfigChannelsContainer(ticketConfig);
	case 'panel': return buildConfigPanelContainer(ticketConfig);
	case 'categories': return buildConfigCategoriesContainer(ticketConfig);
	case 'roles': return buildConfigRolesContainer(ticketConfig);
	case 'limit': return buildConfigLimitContainer(ticketConfig);
	default: return buildConfigHomeContainer(ticketConfig);
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

	await submitted.update({ components: [buildConfigPanelContainer(ticketConfig)] });
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

	await submitted.update({ components: [buildConfigCategoriesContainer(ticketConfig)] });
}

/**
 * Routes a single message-component interaction collected from the config dashboard.
 * @param {import('discord.js').MessageComponentInteraction} interaction
 * @param {import('mongoose').Document} ticketConfig
 */
async function handleConfigComponent(interaction, ticketConfig) {
	if (interaction.customId === `${CONFIG_PREFIX}:nav`) {
		await interaction.update({ components: [renderConfigPage(interaction.values[0], ticketConfig)] });
		return;
	}

	if (interaction.customId === `${CONFIG_PREFIX}:home`) {
		await interaction.update({ components: [buildConfigHomeContainer(ticketConfig)] });
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
		await interaction.update({ components: [buildConfigChannelsContainer(ticketConfig)] });
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
				await interaction.editReply({ components: [buildConfigPanelContainer(ticketConfig)] });
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
				await interaction.editReply({ components: [buildConfigPanelContainer(ticketConfig)] });
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
			await interaction.update({ components: [buildConfigCategoriesContainer(ticketConfig)] });
			return;
		}
		break;
	}

	case 'roles': {
		if (action === 'set') {
			ticketConfig.supportRoleIds = interaction.values;
			await ticketConfig.save();
			await interaction.update({ components: [buildConfigRolesContainer(ticketConfig)] });
			return;
		}
		break;
	}

	case 'limit': {
		if (action === 'set') {
			const amount = Number(interaction.values[0]);
			await updateTicketConfig(interaction.guildId, { maxOpenPerUser: amount });
			ticketConfig.maxOpenPerUser = amount;
			await interaction.update({ components: [buildConfigLimitContainer(ticketConfig)] });
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

	await interaction.reply({
		components: [buildConfigHomeContainer(ticketConfig)],
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
			const errorContainer = buildTextContainer('<:x_:1526217756926808174> **Error:** Something went wrong updating that setting.', 0xFF0000);
			if (i.deferred || i.replied) {
				await i.followUp({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => null);
			}
			else {
				await i.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => null);
			}
		}
	});

	collector.on('end', async () => {
		await interaction.editReply({
			components: [buildTextContainer('-# This configuration session has expired. Run `/tickets config` again.')],
		}).catch(() => null);
	});
}

/**
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {string} categoryId
 */
async function handleOpenTicket(interaction, categoryId) {
	if (!interaction.inGuild()) {
		return replyContainer(interaction, buildTextContainer('<:x_:1526217756926808174> **Error:** Tickets can only be opened inside a server.', 0xFF0000));
	}

	const ticketConfig = await getTicketConfig(interaction.guildId);
	const category = ticketConfig.categories.find(entry => entry.id === categoryId);

	if (!category) {
		return replyContainer(interaction, buildTextContainer('<:x_:1526217756926808174> **Error:** That ticket category no longer exists. Ask an admin to refresh the panel.', 0xFF0000));
	}

	if (!ticketConfig.threadChannelId) {
		return replyContainer(interaction, buildTextContainer('<:x_:1526217756926808174> **Error:** Ticket system is not fully configured. An admin must set a thread channel in `/tickets config`.', 0xFF0000));
	}

	const openCount = await Ticket.countDocuments({
		guildId: interaction.guildId,
		openerId: interaction.user.id,
		status: 'open',
	});

	if (openCount >= ticketConfig.maxOpenPerUser) {
		return replyContainer(interaction, buildTextContainer(`<:x_:1526217756926808174> **Error:** You already have ${openCount} open ticket${openCount === 1 ? '' : 's'}. Close one before opening another.`, 0xFF0000));
	}

	const threadChannel = await interaction.guild.channels.fetch(ticketConfig.threadChannelId);
	if (!threadChannel?.isTextBased() || threadChannel.isThread()) {
		return replyContainer(interaction, buildTextContainer('<:x_:1526217756926808174> **Error:** The configured ticket channel is invalid.', 0xFF0000));
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

		await interaction.editReply({
			components: [buildTextContainer(`<:check:1526217602010185959> **Ticket created!** Continue in ${thread}.`)],
			flags: MessageFlags.IsComponentsV2,
		});
	}
	catch (error) {
		logger.error(`Failed to open ticket for ${interaction.user.tag}:`, error);
		await interaction.editReply({
			components: [buildTextContainer('<:x_:1526217756926808174> **Error:** Failed to create the ticket thread. Check bot permissions.', 0xFF0000)],
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
		return replyContainer(interaction, buildTextContainer('<:x_:1526217756926808174> **Error:** This button only works inside a server.', 0xFF0000));
	}

	const ticket = await Ticket.findOne({ guildId: interaction.guildId, threadId, status: 'open' });
	if (!ticket) {
		return replyContainer(interaction, buildTextContainer('<:x_:1526217756926808174> **Error:** This ticket is closed or no longer exists.', 0xFF0000));
	}

	const thread = await interaction.guild.channels.fetch(threadId);
	if (!thread?.isThread()) {
		return replyContainer(interaction, buildTextContainer('<:x_:1526217756926808174> **Error:** The ticket thread could not be found.', 0xFF0000));
	}

	try {
		await thread.members.add(interaction.user.id);
		if (!ticket.participants.includes(interaction.user.id)) {
			ticket.participants.push(interaction.user.id);
			await ticket.save();
		}

		await replyContainer(interaction, buildTextContainer(`<:check:1526217602010185959> **Joined ticket!** Continue in ${thread}.`));
	}
	catch (error) {
		logger.error(`Failed to join ticket ${threadId}:`, error);
		await replyContainer(interaction, buildTextContainer('<:x_:1526217756926808174> **Error:** Could not add you to the ticket thread.', 0xFF0000));
	}
}

/**
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {string} threadId
 */
async function handleCloseTicketButton(interaction, threadId) {
	if (!interaction.inGuild()) {
		return replyContainer(interaction, buildTextContainer('<:x_:1526217756926808174> **Error:** This button only works inside a server.', 0xFF0000));
	}

	const ticket = await Ticket.findOne({ guildId: interaction.guildId, threadId });
	if (!ticket || ticket.status === 'closed') {
		return replyContainer(interaction, buildTextContainer('<:x_:1526217756926808174> **Error:** This ticket is already closed.', 0xFF0000));
	}

	const ticketConfig = await getTicketConfig(interaction.guildId);
	const member = interaction.member;
	if (!canManageTicket(member, ticketConfig, ticket)) {
		return replyContainer(interaction, buildTextContainer('<:x_:1526217756926808174> **Error:** You do not have permission to close this ticket.', 0xFF0000));
	}

	const container = new ContainerBuilder()
		.setAccentColor(0xFF0000)
		.addTextDisplayComponents(textDisplay =>
			textDisplay.setContent('## Close this ticket?\nThis will archive the thread for everyone.'),
		)
		.addActionRowComponents(
			new ActionRowBuilder().addComponents(
				new ButtonBuilder()
					.setCustomId(`${BUTTON_PREFIX}:confirm_close:${threadId}`)
					.setLabel('Confirm Close')
					.setStyle(ButtonStyle.Danger),
				new ButtonBuilder()
					.setCustomId(`${BUTTON_PREFIX}:cancel_close:${threadId}`)
					.setLabel('Cancel')
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
		return replyContainer(interaction, buildTextContainer('<:x_:1526217756926808174> **Error:** This ticket is already closed.', 0xFF0000));
	}

	const ticketConfig = await getTicketConfig(interaction.guildId);
	const member = interaction.member;
	if (!canManageTicket(member, ticketConfig, ticket)) {
		return replyContainer(interaction, buildTextContainer('<:x_:1526217756926808174> **Error:** You do not have permission to close this ticket.', 0xFF0000));
	}

	const thread = await interaction.guild.channels.fetch(threadId);
	if (!thread?.isThread()) {
		return replyContainer(interaction, buildTextContainer('<:x_:1526217756926808174> **Error:** The ticket thread could not be found.', 0xFF0000));
	}

	ticket.status = 'closed';
	ticket.closedAt = new Date();
	ticket.closedBy = closedById;
	await ticket.save();

	const closeNotice = new ContainerBuilder()
		.setAccentColor(0xFF0000)
		.addTextDisplayComponents(textDisplay =>
			textDisplay.setContent(
				[
					'## <:x_:1526217756926808174> Ticket Closed',
					`Closed by <@${closedById}>`,
					reason ? `> **Reason:** ${reason}` : '',
					'-# This thread has been archived.',
				].filter(Boolean).join('\n'),
			),
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

	// Acknowledge the interaction BEFORE archiving — if the interaction lives inside
	// this thread (e.g. a /tickets close run from within it), Discord can't deliver
	// the response once the thread is archived, which previously caused a "Thread is
	// archived" error on reply.
	if (interaction.isRepliable()) {
		const method = interaction.replied || interaction.deferred ? 'followUp' : 'reply';
		await interaction[method]({
			components: [buildTextContainer('<:check:1526217602010185959> **Ticket closed** and thread archived.')],
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
	case 'cancel_close':
		await replyContainer(interaction, buildTextContainer('Ticket close cancelled.'));
		break;
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
		await replyContainer(interaction, buildTextContainer('<:x_:1526217756926808174> **Error:** Run this command inside a ticket thread.', 0xFF0000));
		return null;
	}

	const ticket = await Ticket.findOne({
		guildId: interaction.guildId,
		threadId: interaction.channel.id,
	});

	if (!ticket) {
		await replyContainer(interaction, buildTextContainer('<:x_:1526217756926808174> **Error:** This thread is not a tracked ticket.', 0xFF0000));
		return null;
	}

	return ticket;
}

module.exports = {
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
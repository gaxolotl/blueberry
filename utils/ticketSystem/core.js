import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, PermissionFlagsBits, SeparatorSpacingSize } from 'discord.js';
import { t } from '../i18n.js';
import { emojis } from '../emoji.js';
import { BUTTON_PREFIX } from './constants.js';
import { getAccentColor } from '../color.js';

/**
 * Builds a ticket thread name from the configurable template.
 * Available variables: {category}, {username}, {priority}, {id}
 * @param {import('discord.js').BaseGuildTextChannel} threadChannel
 * @param {import('mongoose').Document} ticketConfig
 * @param {object} ticket
 * @param {import('discord.js').User} opener
 */
export function buildThreadName(threadChannel, ticketConfig, ticket, opener) {
	const template = ticketConfig.threadNameTemplate || '{category} - {username}';

	const name = template
		.replaceAll('{category}', ticket.categoryLabel || 'Ticket')
		.replaceAll('{username}', opener.username)
		.replaceAll('{priority}', ticket.priority || 'medium')
		.replaceAll('{id}', ticket.threadId || String(Date.now()).slice(-6))
		.replace(/[^a-zA-Z0-9-_ ]/g, '')
		.trim()
		.slice(0, 90);

	return name || 'ticket';
}

/**
 * @param {import('discord.js').GuildMember} member
 * @param {import('mongoose').Document} ticketConfig
 * @param {import('mongoose').Document | null} ticket
 */
export function canManageTicket(member, ticketConfig, ticket) {
	if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
	if (member.permissions.has(PermissionFlagsBits.ManageChannels)) return true;
	if (ticket && member.id === ticket.openerId) return true;

	// Global support roles
	if (ticketConfig.supportRoleIds.some(roleId => member.roles.cache.has(roleId))) return true;
	if (ticket?.assignedRoleId && member.roles.cache.has(ticket.assignedRoleId)) return true;

	// Per-category support roles
	if (ticket) {
		const category = ticketConfig.categories?.find(entry => entry.id === ticket.categoryId);
		if (category?.supportRoleIds?.some(roleId => member.roles.cache.has(roleId))) return true;
	}

	return false;
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {import('mongoose').Document} ticketConfig
 * @param {import('mongoose').Document} ticket
 * @returns {Promise<void>}
 */
export async function sendLogNotification(guild, ticketConfig, ticket) {
	if (!ticketConfig.logChannelId) return;

	const logChannel = await guild.channels.fetch(ticketConfig.logChannelId);
	if (!logChannel?.isTextBased()) return;

	const color = await getAccentColor(guild.id);
	const logTitle = await t(guild.id, 'ticket_log_title', { emoji: emojis.userplus });
	const logCategory = await t(guild.id, 'ticket_log_category', { category: ticket.categoryLabel });
	const logOpener = await t(guild.id, 'ticket_log_opener', { user: `<@${ticket.openerId}>` });
	const logThread = await t(guild.id, 'ticket_log_thread', { thread: `<#${ticket.threadId}>` });
	const logPriority = await t(guild.id, 'ticket_log_priority', { priority: ticket.priority });
	const logAssigned = await t(guild.id, 'ticket_log_assigned', { role: ticket.assignedRoleId ? `<@&${ticket.assignedRoleId}>` : await t(guild.id, 'term_no_one') });
	const logTags = await t(guild.id, 'ticket_log_tags', { tags: ticket.tags.length ? ticket.tags.map(tag => `\`${tag}\``).join(', ') : await t(guild.id, 'patch_notes_none_set') });
	const logJoinBtn = await t(guild.id, 'ticket_log_join_btn');

	const container = new ContainerBuilder()
		.setAccentColor(color)
		.addTextDisplayComponents(textDisplay =>
			textDisplay.setContent(
				[
					`## ${logTitle}`,
					`-# **${logCategory}**`,
					`-# **${logPriority}**`,
					`-# **${logAssigned}**`,
					`-# **${logTags}**`,
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
		allowedMentions: { roles: ticket.assignedRoleId ? [ticket.assignedRoleId] : [] },
	});
}

/**
 * @param {import('discord.js').ThreadChannel} thread
 * @param {import('mongoose').Document} ticket
 * @param {import('discord.js').User} opener
 */
export async function buildThreadWelcomeContainer(guildId, ticket) {
	const welcomeUnclaimed = await t(guildId, 'ticket_welcome_unclaimed');
	const claimedByText = ticket.claimedBy ? `<@${ticket.claimedBy}>` : welcomeUnclaimed;
	const welcomeCloseBtn = await t(guildId, 'ticket_welcome_close_btn');
	const resolvedButton = await t(guildId, 'ticket_automation_resolved_button');

	const color = await getAccentColor(guildId);
	const welcomeTitle = await t(guildId, 'ticket_welcome_title', { emoji: emojis.ticket, categoryLabel: ticket.categoryLabel });
	const welcomeBody = await t(guildId, 'ticket_welcome_body');

	const metaOpener = await t(guildId, 'ticket_welcome_meta_opener', { emoji: emojis.user, opener: `<@${ticket.openerId}>` });
	const metaCategory = await t(guildId, 'ticket_welcome_meta_category', { emoji: emojis.folders, category: ticket.categoryLabel });
	const metaId = await t(guildId, 'ticket_welcome_meta_id', { emoji: emojis.hash, id: ticket.threadId });
	const metaClaimed = await t(guildId, 'ticket_welcome_meta_claimed', { emoji: emojis.shield, claimed: claimedByText });
	const metaPriority = await t(guildId, 'ticket_welcome_meta_priority', { emoji: emojis.gauge, priority: ticket.priority });
	const issueTitle = await t(guildId, 'ticket_automation_issue_title');
	const matchedRoute = ticket.automationRuleLabel
		? await t(guildId, 'ticket_automation_matched', { emoji: emojis.settings, rule: ticket.automationRuleLabel })
		: null;

	const container = new ContainerBuilder()
		.setAccentColor(color)
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
					metaPriority,
				].join('\n'),
			),
		)
		;

	if (ticket.issueDescription) {
		const automationLines = [`### ${issueTitle}`, ticket.issueDescription];
		if (matchedRoute) automationLines.push(matchedRoute);
		if (ticket.automationResponse) automationLines.push(ticket.automationResponse);
		if (ticket.assignedRoleId) automationLines.push(await t(guildId, 'ticket_automation_routed_role', { role: `<@&${ticket.assignedRoleId}>` }));
		container
			.addSeparatorComponents(separator => separator.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
			.addTextDisplayComponents(display => display.setContent(automationLines.join('\n')));
	}

	const buttons = [
		new ButtonBuilder()
			.setCustomId(`${BUTTON_PREFIX}:close:${ticket.threadId}`)
			.setLabel(welcomeCloseBtn)
			.setStyle(ButtonStyle.Danger),
	];
	if (ticket.automationResponse) {
		buttons.unshift(new ButtonBuilder()
			.setCustomId(`${BUTTON_PREFIX}:resolved:${ticket.threadId}`)
			.setLabel(resolvedButton)
			.setEmoji(emojis.check)
			.setStyle(ButtonStyle.Success));
	}
	container.addActionRowComponents(new ActionRowBuilder().addComponents(buttons));
	return container;
}

export async function sendThreadWelcome(thread, ticket, opener) {
	const container = await buildThreadWelcomeContainer(thread.guildId, ticket);

	const welcomeMessage = await thread.send({
		components: [container],
		flags: MessageFlags.IsComponentsV2,
		allowedMentions: {
			users: [opener.id],
			roles: ticket.assignedRoleId ? [ticket.assignedRoleId] : [],
		},
	});

	ticket.welcomeMessageId = welcomeMessage.id;
	await ticket.save();
}

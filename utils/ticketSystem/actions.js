import { ChannelType, ContainerBuilder, MessageFlags, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import Ticket from '../../models/Ticket.js';
import { t } from '../i18n.js';
import { emojis } from '../emoji.js';
import logger from '../logger.js';
import { BUTTON_PREFIX, checkEmoji, errorEmoji } from './constants.js';
import { buildTextContainer, replyContainer, getTicketConfig } from './config.js';
import { buildThreadName, canManageTicket, sendLogNotification, sendThreadWelcome } from './core.js';
import { saveTranscript } from './features.js';

/**
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {string} categoryId
 */
async function handleOpenTicket(interaction, categoryId) {
	if (!interaction.inGuild()) {
		const errNotGuild = await t(interaction.guildId, 'ticket_err_not_guild');
		return replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errNotGuild}`, 0xFF0000));
	}

	const ticketConfig = await getTicketConfig(interaction.guildId);
	const category = ticketConfig.categories.find(entry => entry.id === categoryId);

	if (!category) {
		const errCategoryNotFound = await t(interaction.guildId, 'ticket_err_category_not_found');
		return replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errCategoryNotFound}`, 0xFF0000));
	}

	if (!ticketConfig.threadChannelId) {
		const errNotConfigured = await t(interaction.guildId, 'ticket_err_not_configured');
		return replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errNotConfigured}`, 0xFF0000));
	}

	const openCount = await Ticket.countDocuments({
		guildId: interaction.guildId,
		openerId: interaction.user.id,
		status: 'open',
	});

	if (openCount >= ticketConfig.maxOpenPerUser) {
		const errMaxOpen = await t(interaction.guildId, 'ticket_err_max_open', { count: openCount });
		return replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errMaxOpen}`, 0xFF0000));
	}

	const threadChannel = await interaction.guild.channels.fetch(ticketConfig.threadChannelId);
	if (!threadChannel?.isTextBased() || threadChannel.isThread()) {
		const errInvalidThreadChan = await t(interaction.guildId, 'ticket_err_invalid_thread_chan');
		return replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errInvalidThreadChan}`, 0xFF0000));
	}

	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	try {
		// Determine priority: category-specific > global default
		const priority = category.priority ?? ticketConfig.defaultPriority ?? 'medium';

		const draftTicket = {
			threadId: `pending-${interaction.id}`,
			categoryLabel: category.label,
			priority,
		};

		const thread = await threadChannel.threads.create({
			name: buildThreadName(threadChannel, ticketConfig, { ...draftTicket, threadId: threadChannel.id }, interaction.user),
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
			priority,
		});

		await sendThreadWelcome(thread, ticket, interaction.user);
		await sendLogNotification(interaction.guild, ticketConfig, ticket);

		const msgCreated = await t(interaction.guildId, 'ticket_msg_created', { thread: thread.toString() });
		await interaction.editReply({
			components: [buildTextContainer(`${checkEmoji} ${msgCreated}`)],
			flags: MessageFlags.IsComponentsV2,
		});
	}
	catch (error) {
		logger.error(`Failed to open ticket for ${interaction.user.tag}:`, error);
		const errCreateFailed = await t(interaction.guildId, 'ticket_err_create_failed');
		await interaction.editReply({
			components: [buildTextContainer(`${errorEmoji} **Error:** ${errCreateFailed}`, 0xFF0000)],
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
		return replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errNotGuild}`, 0xFF0000));
	}

	const ticket = await Ticket.findOne({ guildId: interaction.guildId, threadId, status: 'open' });
	if (!ticket) {
		const errJoinClosed = await t(interaction.guildId, 'ticket_err_join_closed');
		return replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errJoinClosed}`, 0xFF0000));
	}

	const thread = await interaction.guild.channels.fetch(threadId);
	if (!thread?.isThread()) {
		const errThreadNotFound = await t(interaction.guildId, 'ticket_err_thread_not_found');
		return replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errThreadNotFound}`, 0xFF0000));
	}

	try {
		await thread.members.add(interaction.user.id);
		if (!ticket.participants.includes(interaction.user.id)) {
			ticket.participants.push(interaction.user.id);
			await ticket.save();
		}

		const msgJoined = await t(interaction.guildId, 'ticket_msg_joined', { thread: thread.toString() });
		await replyContainer(interaction, buildTextContainer(`${checkEmoji} ${msgJoined}`));
	}
	catch (error) {
		logger.error(`Failed to join ticket ${threadId}:`, error);
		const errJoinFailed = await t(interaction.guildId, 'ticket_err_join_failed');
		await replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errJoinFailed}`, 0xFF0000));
	}
}

/**
 * @param {import('discord.js').ButtonInteraction} interaction
 * @param {string} threadId
 */
async function handleCloseTicketButton(interaction, threadId) {
	if (!interaction.inGuild()) {
		const errNotGuild = await t(interaction.guildId, 'ticket_err_not_guild');
		return replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errNotGuild}`, 0xFF0000));
	}

	const ticket = await Ticket.findOne({ guildId: interaction.guildId, threadId });
	if (!ticket || ticket.status === 'closed') {
		const errAlreadyClosed = await t(interaction.guildId, 'ticket_err_already_closed');
		return replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errAlreadyClosed}`, 0xFF0000));
	}

	const ticketConfig = await getTicketConfig(interaction.guildId);
	const member = interaction.member;
	if (!canManageTicket(member, ticketConfig, ticket)) {
		const errNoPermission = await t(interaction.guildId, 'ticket_err_no_permission');
		return replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errNoPermission}`, 0xFF0000));
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
export async function closeTicket(interaction, threadId, closedById, reason = null) {
	const ticket = await Ticket.findOne({ guildId: interaction.guildId, threadId });
	if (!ticket || ticket.status === 'closed') {
		const errAlreadyClosed = await t(interaction.guildId, 'ticket_err_already_closed');
		return replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errAlreadyClosed}`, 0xFF0000));
	}

	const ticketConfig = await getTicketConfig(interaction.guildId);
	const member = interaction.member;
	if (!canManageTicket(member, ticketConfig, ticket)) {
		const errNoPermission = await t(interaction.guildId, 'ticket_err_no_permission');
		return replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errNoPermission}`, 0xFF0000));
	}

	// Require a close reason if configured
	if (ticketConfig.requireCloseReason && !reason) {
		const errReasonRequired = await t(interaction.guildId, 'ticket_err_reason_required');
		return replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errReasonRequired}`, 0xFF0000));
	}

	const thread = await interaction.guild.channels.fetch(threadId);
	if (!thread?.isThread()) {
		const errThreadNotFound = await t(interaction.guildId, 'ticket_err_thread_not_found');
		return replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errThreadNotFound}`, 0xFF0000));
	}

	ticket.status = 'closed';
	ticket.closedAt = new Date();
	ticket.closedBy = closedById;
	ticket.closeReason = reason;
	await ticket.save();

	// Save transcript before archiving
	await saveTranscript(interaction.guild, ticketConfig, ticket);

	const closeNoticeTitle = await t(interaction.guildId, 'ticket_close_notice_title', { emoji: emojis.x_ });
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
			components: [buildTextContainer(`${checkEmoji} ${closeSuccessMsg}`)],
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
export async function handleTicketButton(interaction) {
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
export async function getActiveTicketFromInteraction(interaction) {
	if (!interaction.channel?.isThread()) {
		const errNotThread = await t(interaction.guildId, 'ticket_err_command_not_thread');
		await replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errNotThread}`, 0xFF0000));
		return null;
	}

	const ticket = await Ticket.findOne({
		guildId: interaction.guildId,
		threadId: interaction.channel.id,
	});

	if (!ticket) {
		const errNotTracked = await t(interaction.guildId, 'ticket_err_not_tracked');
		await replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errNotTracked}`, 0xFF0000));
		return null;
	}

	return ticket;
}
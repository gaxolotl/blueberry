import { ChannelType, ContainerBuilder, MessageFlags, ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import Ticket from '../../models/Ticket.js';
import { t } from '../i18n.js';
import { emojis } from '../emoji.js';
import logger from '../logger.js';
import { BUTTON_PREFIX, checkEmoji, errorEmoji } from './constants.js';
import { buildTextContainer, replyContainer, getTicketConfig } from './config.js';
import { buildThreadName, canManageTicket, sendLogNotification, sendThreadWelcome } from './core.js';
import { saveTranscript } from './features.js';
import { getErrorColor } from '../color.js';
import { matchTicketAutomationRule } from './autoCategorizer.js';

async function collectIssueDescription(interaction) {
	const modalId = `ticket:describe:${interaction.id}`;
	const modal = new ModalBuilder()
		.setCustomId(modalId)
		.setTitle(await t(interaction.guildId, 'ticket_automation_modal_title'))
		.addComponents(new ActionRowBuilder().addComponents(
			new TextInputBuilder()
				.setCustomId('description')
				.setLabel(await t(interaction.guildId, 'ticket_automation_description_label'))
				.setPlaceholder(await t(interaction.guildId, 'ticket_automation_description_placeholder'))
				.setStyle(TextInputStyle.Paragraph)
				.setMinLength(10)
				.setMaxLength(1000)
				.setRequired(true),
		));
	await interaction.showModal(modal);
	return interaction.awaitModalSubmit({
		filter: submitted => submitted.customId === modalId && submitted.user.id === interaction.user.id,
		time: 5 * 60 * 1000,
	}).catch(() => null);
}

async function handleOpenTicket(interaction, categoryId) {
	if (!interaction.inGuild()) {
		const errNotGuild = await t(interaction.guildId, 'ticket_err_not_guild');
		return replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errNotGuild}`, await getErrorColor(interaction.guildId)));
	}

	const ticketConfig = await getTicketConfig(interaction.guildId);
	const category = ticketConfig.categories.find(entry => entry.id === categoryId);

	if (!category) {
		const errCategoryNotFound = await t(interaction.guildId, 'ticket_err_category_not_found');
		return replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errCategoryNotFound}`, await getErrorColor(interaction.guildId)));
	}

	if (!ticketConfig.threadChannelId) {
		const errNotConfigured = await t(interaction.guildId, 'ticket_err_not_configured');
		return replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errNotConfigured}`, await getErrorColor(interaction.guildId)));
	}

	const openCount = await Ticket.countDocuments({
		guildId: interaction.guildId,
		openerId: interaction.user.id,
		status: 'open',
	});

	if (openCount >= ticketConfig.maxOpenPerUser) {
		const errMaxOpen = await t(interaction.guildId, 'ticket_err_max_open', { count: openCount });
		return replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errMaxOpen}`, await getErrorColor(interaction.guildId)));
	}

	const threadChannel = await interaction.guild.channels.fetch(ticketConfig.threadChannelId);
	if (!threadChannel?.isTextBased() || threadChannel.isThread()) {
		const errInvalidThreadChan = await t(interaction.guildId, 'ticket_err_invalid_thread_chan');
		return replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errInvalidThreadChan}`, await getErrorColor(interaction.guildId)));
	}

	let responseInteraction = interaction;
	let issueDescription = null;
	if (ticketConfig.automationEnabled && ticketConfig.automationRules.length) {
		responseInteraction = await collectIssueDescription(interaction);
		if (!responseInteraction) return;
		issueDescription = responseInteraction.fields.getTextInputValue('description').trim();
		await responseInteraction.deferReply({ flags: MessageFlags.Ephemeral });
	}
	else {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
	}

	try {
		const rule = matchTicketAutomationRule(issueDescription, ticketConfig);
		const matchedCategory = rule?.categoryId ? ticketConfig.categories.find(entry => entry.id === rule.categoryId) : null;
		const resolvedCategory = matchedCategory ?? category;
		const priority = rule?.priority ?? resolvedCategory.priority ?? ticketConfig.defaultPriority ?? 'medium';

		const draftTicket = {
			threadId: `pending-${interaction.id}`,
			categoryLabel: resolvedCategory.label,
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
			categoryId: resolvedCategory.id,
			categoryLabel: resolvedCategory.label,
			openerId: interaction.user.id,
			participants: [interaction.user.id],
			priority,
			assignedRoleId: rule?.assignRoleId ?? null,
			tags: rule?.tag ? [rule.tag] : [],
			issueDescription,
			automationRuleId: rule?.id ?? null,
			automationRuleLabel: rule?.label ?? null,
			automationResponse: rule?.response ?? null,
		});

		await sendThreadWelcome(thread, ticket, interaction.user);
		await sendLogNotification(interaction.guild, ticketConfig, ticket);

		const msgCreated = await t(interaction.guildId, 'ticket_msg_created', { thread: thread.toString() });
		await responseInteraction.editReply({
			components: [buildTextContainer(`${checkEmoji} ${msgCreated}`)],
			flags: MessageFlags.IsComponentsV2,
		});
	}
	catch (error) {
		logger.error(`Failed to open ticket for ${interaction.user.tag}:`, error);
		const errCreateFailed = await t(interaction.guildId, 'ticket_err_create_failed');
		await responseInteraction.editReply({
			components: [buildTextContainer(`${errorEmoji} **Error:** ${errCreateFailed}`, await getErrorColor(interaction.guildId))],
			flags: MessageFlags.IsComponentsV2,
		});
	}
}

async function handleJoinTicket(interaction, threadId) {
	if (!interaction.inGuild()) {
		const errNotGuild = await t(interaction.guildId, 'ticket_err_not_guild');
		return replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errNotGuild}`, await getErrorColor(interaction.guildId)));
	}

	const ticket = await Ticket.findOne({ guildId: interaction.guildId, threadId, status: 'open' });
	if (!ticket) {
		const errJoinClosed = await t(interaction.guildId, 'ticket_err_join_closed');
		return replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errJoinClosed}`, await getErrorColor(interaction.guildId)));
	}

	const thread = await interaction.guild.channels.fetch(threadId);
	if (!thread?.isThread()) {
		const errThreadNotFound = await t(interaction.guildId, 'ticket_err_thread_not_found');
		return replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errThreadNotFound}`, await getErrorColor(interaction.guildId)));
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
		await replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errJoinFailed}`, await getErrorColor(interaction.guildId)));
	}
}

async function handleCloseTicketButton(interaction, threadId) {
	if (!interaction.inGuild()) {
		const errNotGuild = await t(interaction.guildId, 'ticket_err_not_guild');
		return replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errNotGuild}`, await getErrorColor(interaction.guildId)));
	}
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });

	const ticket = await Ticket.findOne({ guildId: interaction.guildId, threadId });
	if (!ticket || ticket.status === 'closed') {
		const errAlreadyClosed = await t(interaction.guildId, 'ticket_err_already_closed');
		return replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errAlreadyClosed}`, await getErrorColor(interaction.guildId)));
	}

	const ticketConfig = await getTicketConfig(interaction.guildId);
	const member = interaction.member;
	if (!canManageTicket(member, ticketConfig, ticket)) {
		const errNoPermission = await t(interaction.guildId, 'ticket_err_no_permission');
		return replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errNoPermission}`, await getErrorColor(interaction.guildId)));
	}

	const closeConfirmTitle = await t(interaction.guildId, 'ticket_close_confirm_title');
	const closeConfirmDesc = await t(interaction.guildId, 'ticket_close_confirm_desc');
	const confirmBtnLabel = await t(interaction.guildId, 'ticket_close_confirm_btn');
	const cancelBtnLabel = await t(interaction.guildId, 'ticket_close_cancel_btn');

	const container = new ContainerBuilder()
		.setAccentColor(await getErrorColor(interaction.guildId))
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

	await interaction.editReply({
		components: [container],
		flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
	});
}

async function handleConfirmClose(interaction, threadId) {
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });
	await closeTicket(interaction, threadId, interaction.user.id);
}

async function handleIssueResolved(interaction, threadId) {
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });
	const reason = await t(interaction.guildId, 'ticket_automation_resolved_reason');
	await closeTicket(interaction, threadId, interaction.user.id, reason);
}

export async function closeTicket(interaction, threadId, closedById, reason = null) {
	if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
	}
	const ticket = await Ticket.findOne({ guildId: interaction.guildId, threadId });
	if (!ticket || ticket.status === 'closed') {
		const errAlreadyClosed = await t(interaction.guildId, 'ticket_err_already_closed');
		return replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errAlreadyClosed}`, await getErrorColor(interaction.guildId)));
	}

	const ticketConfig = await getTicketConfig(interaction.guildId);
	const member = interaction.member;
	if (!canManageTicket(member, ticketConfig, ticket)) {
		const errNoPermission = await t(interaction.guildId, 'ticket_err_no_permission');
		return replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errNoPermission}`, await getErrorColor(interaction.guildId)));
	}

	if (ticketConfig.requireCloseReason && !reason) {
		const errReasonRequired = await t(interaction.guildId, 'ticket_err_reason_required');
		return replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errReasonRequired}`, await getErrorColor(interaction.guildId)));
	}

	const thread = await interaction.guild.channels.fetch(threadId);
	if (!thread?.isThread()) {
		const errThreadNotFound = await t(interaction.guildId, 'ticket_err_thread_not_found');
		return replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errThreadNotFound}`, await getErrorColor(interaction.guildId)));
	}

	ticket.status = 'closed';
	ticket.closedAt = new Date();
	ticket.closedBy = closedById;
	ticket.closeReason = reason;
	await ticket.save();

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
		.setAccentColor(await getErrorColor(interaction.guildId))
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
		const closeSuccessMsg = await t(interaction.guildId, 'ticket_close_success');
		const payload = {
			components: [buildTextContainer(`${checkEmoji} ${closeSuccessMsg}`)],
			flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
		};
		const response = interaction.deferred && !interaction.replied
			? interaction.editReply(payload)
			: interaction.replied ? interaction.followUp(payload) : interaction.reply(payload);
		await response.catch(error => logger.error(`Failed to confirm ticket close for ${threadId}:`, error));
	}

	try {
		await thread.setArchived(true, reason ?? 'Ticket closed');
	}
	catch (error) {
		logger.error(`Failed to archive ticket thread ${threadId}:`, error);
	}
}

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
	case 'resolved':
		await handleIssueResolved(interaction, payload);
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

export async function getActiveTicketFromInteraction(interaction) {
	if (!interaction.channel?.isThread()) {
		const errNotThread = await t(interaction.guildId, 'ticket_err_command_not_thread');
		await replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errNotThread}`, await getErrorColor(interaction.guildId)));
		return null;
	}

	const ticket = await Ticket.findOne({
		guildId: interaction.guildId,
		threadId: interaction.channel.id,
	});

	if (!ticket) {
		const errNotTracked = await t(interaction.guildId, 'ticket_err_not_tracked');
		await replyContainer(interaction, buildTextContainer(`${errorEmoji} **Error:** ${errNotTracked}`, await getErrorColor(interaction.guildId)));
		return null;
	}

	return ticket;
}

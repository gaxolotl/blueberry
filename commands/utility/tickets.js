import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import logger from '../../utils/logger.js';
import { buildTextContainer, buildThreadWelcomeContainer, replyContainer, canManageTicket, getActiveTicketFromInteraction, closeTicket, startConfigSession, getTicketConfig, setTicketPriority, setTicketNote, showTicketTranscript } from '../../utils/ticketSystem/index.js';
import { t, tError } from '../../utils/i18n.js';
import { emojis } from '../../utils/emoji.js';
import { getErrorColor } from '../../utils/color.js';

async function requireAdmin(interaction) {
	if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
		const errMsg = await tError(interaction.guildId, 'ticket_err_need_manage_server');
		await replyContainer(interaction, buildTextContainer(errMsg, await getErrorColor(interaction.guildId)));
		return false;
	}
	return true;
}

async function requireGuild(interaction) {
	if (!interaction.inGuild()) {
		const errMsg = await tError(null, 'error_not_in_guild');
		await replyContainer(interaction, buildTextContainer(errMsg, await getErrorColor(null)));
		return false;
	}
	return true;
}

export default {
	data: new SlashCommandBuilder()
		.setName('tickets')
		.setDescription('Thread-based support ticket system')
		.addSubcommand(sub =>
			sub
				.setName('config')
				.setDescription('Open the interactive ticket configuration dashboard'),
		)
		.addSubcommand(sub =>
			sub
				.setName('close')
				.setDescription('Close the current ticket thread')
				.addStringOption(option =>
					option
						.setName('reason')
						.setDescription('Optional reason for closing')
						.setRequired(false)
						.setMaxLength(200),
				),
		)
		.addSubcommand(sub =>
			sub
				.setName('reopen')
				.setDescription('Reopen a closed ticket thread'),
		)
		.addSubcommand(sub =>
			sub
				.setName('add')
				.setDescription('Add a member to the current ticket')
				.addUserOption(option =>
					option
						.setName('member')
						.setDescription('Member to add')
						.setRequired(true),
				),
		)
		.addSubcommand(sub =>
			sub
				.setName('remove')
				.setDescription('Remove a member from the current ticket')
				.addUserOption(option =>
					option
						.setName('member')
						.setDescription('Member to remove')
						.setRequired(true),
				),
		)
		.addSubcommand(sub =>
			sub
				.setName('rename')
				.setDescription('Rename the current ticket thread')
				.addStringOption(option =>
					option
						.setName('name')
						.setDescription('New thread name')
						.setRequired(true)
						.setMaxLength(100),
				),
		)
		.addSubcommand(sub =>
			sub
				.setName('claim')
				.setDescription('Claim or unclaim the current ticket'),
		)
		.addSubcommand(sub =>
			sub
				.setName('priority')
				.setDescription('Set the priority of the current ticket')
				.addStringOption(option =>
					option
						.setName('level')
						.setDescription('Priority level')
						.setRequired(true)
						.addChoices(
							{ name: 'Low', value: 'low' },
							{ name: 'Medium', value: 'medium' },
							{ name: 'High', value: 'high' },
						),
				),
		)
		.addSubcommand(sub =>
			sub
				.setName('note')
				.setDescription('Set or clear an internal staff note on the current ticket')
				.addStringOption(option =>
					option
						.setName('text')
						.setDescription('Note text (leave empty to clear)')
						.setRequired(false)
						.setMaxLength(1000),
				),
		)
		.addSubcommand(sub =>
			sub
				.setName('transcript')
				.setDescription('View the saved transcript of the current ticket'),
		),

	async execute(interaction) {
		if (!await requireGuild(interaction)) return;

		const subcommand = interaction.options.getSubcommand();

		try {
			if (subcommand === 'config') {
				if (!await requireAdmin(interaction)) return;
				await startConfigSession(interaction);
				return;
			}

			await handleTicketAction(interaction, subcommand);
		}
		catch (error) {
			logger.error(`Failed to execute tickets ${subcommand}:`, error);
			const errMsg = await tError(interaction.guildId, 'ticket_err_command_failed');
			await replyContainer(interaction, buildTextContainer(errMsg, await getErrorColor(interaction.guildId)));
		}
	},
};

async function handleTicketAction(interaction, subcommand) {
	const ticket = await getActiveTicketFromInteraction(interaction);
	if (!ticket) return;

	const guildId = interaction.guildId;
	const ticketConfig = await getTicketConfig(guildId);

	if (subcommand !== 'reopen' && ticket.status === 'closed') {
		const errMsg = await tError(guildId, 'ticket_err_closed');
		await replyContainer(interaction, buildTextContainer(errMsg, await getErrorColor(guildId)));
		return;
	}

	switch (subcommand) {
	case 'close': {
		const reason = interaction.options.getString('reason');
		await closeTicket(interaction, ticket.threadId, interaction.user.id, reason);
		break;
	}
	case 'reopen': {
		if (!canManageTicket(interaction.member, ticketConfig, ticket)) {
			const errMsg = await tError(guildId, 'ticket_err_no_reopen_perm');
			await replyContainer(interaction, buildTextContainer(errMsg, await getErrorColor(guildId)));
			return;
		}

		if (ticket.status === 'open') {
			const errMsg = await tError(guildId, 'ticket_err_already_open');
			await replyContainer(interaction, buildTextContainer(errMsg, await getErrorColor(guildId)));
			return;
		}

		const thread = interaction.channel;
		ticket.status = 'open';
		ticket.closedAt = null;
		ticket.closedBy = null;
		await ticket.save();

		await thread.setArchived(false, 'Ticket reopened');

		const alertText = await t(guildId, 'ticket_reopened_notice', { emoji: emojis.check, userId: interaction.user.id });
		const replyText = await t(guildId, 'ticket_reopened_reply', { emoji: emojis.check });

		const reopenNotice = buildTextContainer(alertText);
		await thread.send({
			components: [reopenNotice],
			flags: MessageFlags.IsComponentsV2,
		});

		await replyContainer(interaction, buildTextContainer(replyText));
		break;
	}
	case 'add': {
		if (!canManageTicket(interaction.member, ticketConfig, ticket)) {
			const errMsg = await tError(guildId, 'ticket_err_no_add_perm');
			await replyContainer(interaction, buildTextContainer(errMsg, await getErrorColor(guildId)));
			return;
		}

		const member = interaction.options.getUser('member');
		await interaction.channel.members.add(member.id);

		if (!ticket.participants.includes(member.id)) {
			ticket.participants.push(member.id);
			await ticket.save();
		}

		const successMsg = await t(guildId, 'ticket_member_added', { emoji: emojis.check, userId: member.id });
		await replyContainer(interaction, buildTextContainer(successMsg));
		break;
	}
	case 'remove': {
		if (!canManageTicket(interaction.member, ticketConfig, ticket)) {
			const errMsg = await tError(guildId, 'ticket_err_no_remove_perm');
			await replyContainer(interaction, buildTextContainer(errMsg, await getErrorColor(guildId)));
			return;
		}

		const member = interaction.options.getUser('member');
		if (member.id === ticket.openerId) {
			const errMsg = await tError(guildId, 'ticket_err_cannot_remove_opener');
			await replyContainer(interaction, buildTextContainer(errMsg, await getErrorColor(guildId)));
			return;
		}

		await interaction.channel.members.remove(member.id);
		ticket.participants = ticket.participants.filter(id => id !== member.id);
		await ticket.save();

		const successMsg = await t(guildId, 'ticket_member_removed', { emoji: emojis.check, userId: member.id });
		await replyContainer(interaction, buildTextContainer(successMsg));
		break;
	}
	case 'rename': {
		if (!canManageTicket(interaction.member, ticketConfig, ticket)) {
			const errMsg = await tError(guildId, 'ticket_err_no_rename_perm');
			await replyContainer(interaction, buildTextContainer(errMsg, await getErrorColor(guildId)));
			return;
		}

		const name = interaction.options.getString('name');
		await interaction.channel.setName(name);

		const successMsg = await t(guildId, 'ticket_renamed', { emoji: emojis.check, name });
		await replyContainer(interaction, buildTextContainer(successMsg));
		break;
	}
	case 'claim': {
		if (!canManageTicket(interaction.member, ticketConfig, ticket)) {
			const errMsg = await tError(guildId, 'ticket_err_no_claim_perm');
			await replyContainer(interaction, buildTextContainer(errMsg, await getErrorColor(guildId)));
			return;
		}

		const isUnclaiming = ticket.claimedBy === interaction.user.id;

		if (isUnclaiming) {
			ticket.claimedBy = null;
		}
		else {
			ticket.claimedBy = interaction.user.id;
			if (!ticket.participants.includes(interaction.user.id)) {
				ticket.participants.push(interaction.user.id);
			}
		}
		await ticket.save();

		if (ticket.welcomeMessageId) {
			try {
				const welcomeMsg = await interaction.channel.messages.fetch(ticket.welcomeMessageId);
				if (welcomeMsg) {
					const updatedContainer = await buildThreadWelcomeContainer(guildId, ticket);

					await welcomeMsg.edit({
						components: [updatedContainer],
						flags: MessageFlags.IsComponentsV2,
					});
				}
			}
			catch (err) {
				logger.error('Failed to update welcome message with claim details:', err);
			}
		}

		if (isUnclaiming) {
			const alertMsg = await t(guildId, 'ticket_unclaimed_notice', { emoji: emojis.x_, userId: interaction.user.id });
			const replyMsg = await t(guildId, 'ticket_unclaimed_reply', { emoji: emojis.check });

			await interaction.channel.send({
				components: [buildTextContainer(alertMsg)],
				flags: MessageFlags.IsComponentsV2,
			});
			await replyContainer(interaction, buildTextContainer(replyMsg));
		}
		else {
			const alertMsg = await t(guildId, 'ticket_claimed_notice', { emoji: emojis.check, userId: interaction.user.id });
			const replyMsg = await t(guildId, 'ticket_claimed_reply', { emoji: emojis.check });

			await interaction.channel.send({
				components: [buildTextContainer(alertMsg)],
				flags: MessageFlags.IsComponentsV2,
			});
			await replyContainer(interaction, buildTextContainer(replyMsg));
		}
		break;
	}
	case 'priority': {
		if (!canManageTicket(interaction.member, ticketConfig, ticket)) {
			const errMsg = await tError(guildId, 'ticket_err_no_priority_perm');
			await replyContainer(interaction, buildTextContainer(errMsg, await getErrorColor(guildId)));
			return;
		}

		const level = interaction.options.getString('level');
		await setTicketPriority(interaction, ticket, level);
		break;
	}
	case 'note': {
		if (!canManageTicket(interaction.member, ticketConfig, ticket)) {
			const errMsg = await tError(guildId, 'ticket_err_no_note_perm');
			await replyContainer(interaction, buildTextContainer(errMsg, await getErrorColor(guildId)));
			return;
		}

		const note = interaction.options.getString('text') || null;
		await setTicketNote(interaction, ticket, note);
		break;
	}
	case 'transcript': {
		if (!canManageTicket(interaction.member, ticketConfig, ticket)) {
			const errMsg = await tError(guildId, 'ticket_err_no_transcript_perm');
			await replyContainer(interaction, buildTextContainer(errMsg, await getErrorColor(guildId)));
			return;
		}

		await showTicketTranscript(interaction, ticket);
		break;
	}
	default:
		break;
	}
}

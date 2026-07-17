import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ContainerBuilder, SeparatorSpacingSize, ButtonStyle, ActionRowBuilder, ButtonBuilder } from 'discord.js';
import logger from '../../utils/logger.js';
import { buildTextContainer, replyContainer, canManageTicket, getActiveTicketFromInteraction, closeTicket, startConfigSession, getTicketConfig, BUTTON_PREFIX } from '../../utils/ticketSystem.js';
import config from '../../config.js';
import { t, tError } from '../../utils/i18n.js';

const accentColor = parseInt(config.accentColor.replace('#', ''), 16);

async function requireAdmin(interaction) {
	if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
		const errMsg = await tError(interaction.guildId, 'ticket_err_need_manage_server');
		await replyContainer(interaction, buildTextContainer(errMsg, 0xFF0000));
		return false;
	}
	return true;
}

async function requireGuild(interaction) {
	if (!interaction.inGuild()) {
		const errMsg = await tError(null, 'error_not_in_guild');
		await replyContainer(interaction, buildTextContainer(errMsg, 0xFF0000));
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
			await replyContainer(interaction, buildTextContainer(errMsg, 0xFF0000));
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
		await replyContainer(interaction, buildTextContainer(errMsg, 0xFF0000));
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
			await replyContainer(interaction, buildTextContainer(errMsg, 0xFF0000));
			return;
		}

		if (ticket.status === 'open') {
			const errMsg = await tError(guildId, 'ticket_err_already_open');
			await replyContainer(interaction, buildTextContainer(errMsg, 0xFF0000));
			return;
		}

		const thread = interaction.channel;
		ticket.status = 'open';
		ticket.closedAt = null;
		ticket.closedBy = null;
		await ticket.save();

		await thread.setArchived(false, 'Ticket reopened');

		// Create a visible reopen alert message inside the ticket
		const alertText = await t(guildId, 'ticket_reopened_notice', { userId: interaction.user.id });
		const replyText = await t(guildId, 'ticket_reopened_reply');

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
			await replyContainer(interaction, buildTextContainer(errMsg, 0xFF0000));
			return;
		}

		const member = interaction.options.getUser('member');
		await interaction.channel.members.add(member.id);

		if (!ticket.participants.includes(member.id)) {
			ticket.participants.push(member.id);
			await ticket.save();
		}

		const successMsg = await t(guildId, 'ticket_member_added', { userId: member.id });
		await replyContainer(interaction, buildTextContainer(successMsg));
		break;
	}
	case 'remove': {
		if (!canManageTicket(interaction.member, ticketConfig, ticket)) {
			const errMsg = await tError(guildId, 'ticket_err_no_remove_perm');
			await replyContainer(interaction, buildTextContainer(errMsg, 0xFF0000));
			return;
		}

		const member = interaction.options.getUser('member');
		if (member.id === ticket.openerId) {
			const errMsg = await tError(guildId, 'ticket_err_cannot_remove_opener');
			await replyContainer(interaction, buildTextContainer(errMsg, 0xFF0000));
			return;
		}

		await interaction.channel.members.remove(member.id);
		ticket.participants = ticket.participants.filter(id => id !== member.id);
		await ticket.save();

		const successMsg = await t(guildId, 'ticket_member_removed', { userId: member.id });
		await replyContainer(interaction, buildTextContainer(successMsg));
		break;
	}
	case 'rename': {
		if (!canManageTicket(interaction.member, ticketConfig, ticket)) {
			const errMsg = await tError(guildId, 'ticket_err_no_rename_perm');
			await replyContainer(interaction, buildTextContainer(errMsg, 0xFF0000));
			return;
		}

		const name = interaction.options.getString('name');
		await interaction.channel.setName(name);

		const successMsg = await t(guildId, 'ticket_renamed', { name });
		await replyContainer(interaction, buildTextContainer(successMsg));
		break;
	}
	case 'claim': {
		if (!canManageTicket(interaction.member, ticketConfig, ticket)) {
			const errMsg = await tError(guildId, 'ticket_err_no_claim_perm');
			await replyContainer(interaction, buildTextContainer(errMsg, 0xFF0000));
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

		// Update/Edit the original welcome message in the thread
		if (ticket.welcomeMessageId) {
			try {
				const welcomeMsg = await interaction.channel.messages.fetch(ticket.welcomeMessageId);
				if (welcomeMsg) {
					const displayClaimed = ticket.claimedBy ? `<@${ticket.claimedBy}>` : await t(guildId, 'term_no_one');

					const title = await t(guildId, 'ticket_welcome_title', { category: ticket.categoryLabel });
					const body = await t(guildId, 'ticket_welcome_body');
					const footer = await t(guildId, 'ticket_welcome_footer');

					const openerLine = await t(guildId, 'ticket_welcome_opener', { openerId: ticket.openerId });
					const categoryLine = await t(guildId, 'ticket_welcome_category', { category: ticket.categoryLabel });
					const idLine = await t(guildId, 'ticket_welcome_id', { threadId: ticket.threadId });
					const claimedLine = await t(guildId, 'ticket_welcome_claimed', { claimer: displayClaimed });
					const buttonText = await t(guildId, 'ticket_btn_close');

					const updatedContainer = new ContainerBuilder()
						.setAccentColor(accentColor)
						.addTextDisplayComponents(textDisplay =>
							textDisplay.setContent([title, body, footer].join('\n')),
						)
						.addSeparatorComponents(separator =>
							separator.setSpacing(SeparatorSpacingSize.Small).setDivider(true),
						)
						.addTextDisplayComponents(textDisplay =>
							textDisplay.setContent([openerLine, categoryLine, idLine, claimedLine].join('\n')),
						)
						.addActionRowComponents(
							new ActionRowBuilder().addComponents(
								new ButtonBuilder()
									.setCustomId(`${BUTTON_PREFIX}:close:${ticket.threadId}`)
									.setLabel(buttonText)
									.setStyle(ButtonStyle.Danger),
							),
						);

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
			const alertMsg = await t(guildId, 'ticket_unclaimed_notice', { userId: interaction.user.id });
			const replyMsg = await t(guildId, 'ticket_unclaimed_reply');

			await interaction.channel.send({
				components: [buildTextContainer(alertMsg)],
				flags: MessageFlags.IsComponentsV2,
			});
			await replyContainer(interaction, buildTextContainer(replyMsg));
		}
		else {
			const alertMsg = await t(guildId, 'ticket_claimed_notice', { userId: interaction.user.id });
			const replyMsg = await t(guildId, 'ticket_claimed_reply');

			await interaction.channel.send({
				components: [buildTextContainer(alertMsg)],
				flags: MessageFlags.IsComponentsV2,
			});
			await replyContainer(interaction, buildTextContainer(replyMsg));
		}
		break;
	}
	default:
		break;
	}
}
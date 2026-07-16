const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ContainerBuilder, SeparatorSpacingSize, ButtonStyle, ActionRowBuilder, ButtonBuilder } = require('discord.js');
const logger = require('../../utils/logger');
const {
	buildTextContainer,
	replyContainer,
	canManageTicket,
	getActiveTicketFromInteraction,
	closeTicket,
	startConfigSession,
	getTicketConfig,
	BUTTON_PREFIX,
} = require('../../utils/ticketSystem');
const config = require('../../config');

const accentColor = parseInt(config.accentColor.replace('#', ''), 16);

async function requireAdmin(interaction) {
	if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
		await replyContainer(interaction, buildTextContainer('<:x_:1526217756926808174> **Error:** You need **Manage Server** to configure tickets.', 0xFF0000));
		return false;
	}
	return true;
}

async function requireGuild(interaction) {
	if (!interaction.inGuild()) {
		await replyContainer(interaction, buildTextContainer('<:x_:1526217756926808174> **Error:** This command can only be used inside a server.', 0xFF0000));
		return false;
	}
	return true;
}

module.exports = {
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
			await replyContainer(interaction, buildTextContainer('<:x_:1526217756926808174> **Error:** Something went wrong while running that ticket command.', 0xFF0000));
		}
	},
};

async function handleTicketAction(interaction, subcommand) {
	const ticket = await getActiveTicketFromInteraction(interaction);
	if (!ticket) return;

	const ticketConfig = await getTicketConfig(interaction.guildId);

	if (subcommand !== 'reopen' && ticket.status === 'closed') {
		await replyContainer(interaction, buildTextContainer('<:x_:1526217756926808174> **Error:** This ticket is closed. Use `/tickets reopen` first.', 0xFF0000));
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
			await replyContainer(interaction, buildTextContainer('<:x_:1526217756926808174> **Error:** You do not have permission to reopen this ticket.', 0xFF0000));
			return;
		}

		if (ticket.status === 'open') {
			await replyContainer(interaction, buildTextContainer('<:x_:1526217756926808174> **Error:** This ticket is already open.', 0xFF0000));
			return;
		}

		const thread = interaction.channel;
		ticket.status = 'open';
		ticket.closedAt = null;
		ticket.closedBy = null;
		await ticket.save();

		await thread.setArchived(false, 'Ticket reopened');

		// Create a visible reopen alert message inside the ticket
		const reopenNotice = buildTextContainer(`<:check:1526217602010185959> **This ticket has been reopened by <@${interaction.user.id}>.**`);
		await thread.send({
			components: [reopenNotice],
			flags: MessageFlags.IsComponentsV2,
		});

		await replyContainer(interaction, buildTextContainer('<:check:1526217602010185959> **Ticket reopened.**'));
		break;
	}
	case 'add': {
		if (!canManageTicket(interaction.member, ticketConfig, ticket)) {
			await replyContainer(interaction, buildTextContainer('<:x_:1526217756926808174> **Error:** You do not have permission to add members.', 0xFF0000));
			return;
		}

		const member = interaction.options.getUser('member');
		await interaction.channel.members.add(member.id);

		if (!ticket.participants.includes(member.id)) {
			ticket.participants.push(member.id);
			await ticket.save();
		}

		await replyContainer(interaction, buildTextContainer(`<:check:1526217602010185959> Added <@${member.id}> to the ticket.`));
		break;
	}
	case 'remove': {
		if (!canManageTicket(interaction.member, ticketConfig, ticket)) {
			await replyContainer(interaction, buildTextContainer('<:x_:1526217756926808174> **Error:** You do not have permission to remove members.', 0xFF0000));
			return;
		}

		const member = interaction.options.getUser('member');
		if (member.id === ticket.openerId) {
			await replyContainer(interaction, buildTextContainer('<:x_:1526217756926808174> **Error:** You cannot remove the ticket opener.', 0xFF0000));
			return;
		}

		await interaction.channel.members.remove(member.id);
		ticket.participants = ticket.participants.filter(id => id !== member.id);
		await ticket.save();

		await replyContainer(interaction, buildTextContainer(`<:check:1526217602010185959> Removed <@${member.id}> from the ticket.`));
		break;
	}
	case 'rename': {
		if (!canManageTicket(interaction.member, ticketConfig, ticket)) {
			await replyContainer(interaction, buildTextContainer('<:x_:1526217756926808174> **Error:** You do not have permission to rename this ticket.', 0xFF0000));
			return;
		}

		const name = interaction.options.getString('name');
		await interaction.channel.setName(name);
		await replyContainer(interaction, buildTextContainer(`<:check:1526217602010185959> Ticket renamed to **${name}**.`));
		break;
	}
	case 'claim': {
		if (!canManageTicket(interaction.member, ticketConfig, ticket)) {
			await replyContainer(interaction, buildTextContainer('<:x_:1526217756926808174> **Error:** You do not have permission to claim tickets.', 0xFF0000));
			return;
		}

		const isUnclaiming = ticket.claimedBy === interaction.user.id;

		if (isUnclaiming) {
			// Unclaim logic
			ticket.claimedBy = null;
		}
		else {
			// Claim logic
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
					const displayClaimed = ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'No one';
					const updatedContainer = new ContainerBuilder()
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
									`<:shield:1527035003492368558> **Claimed by:** ${displayClaimed}`,
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
			await interaction.channel.send({
				components: [buildTextContainer(`<:x_:1526217756926808174> <@${interaction.user.id}> has unclaimed this ticket.`)],
				flags: MessageFlags.IsComponentsV2,
			});
			await replyContainer(interaction, buildTextContainer('<:check:1526217602010185959> **Ticket unclaimed.**'));
		}
		else {
			await interaction.channel.send({
				components: [buildTextContainer(`<:check:1526217602010185959> <@${interaction.user.id}> has claimed this ticket.`)],
				flags: MessageFlags.IsComponentsV2,
			});
			await replyContainer(interaction, buildTextContainer('<:check:1526217602010185959> **Ticket claimed.**'));
		}
		break;
	}
	default:
		break;
	}
}
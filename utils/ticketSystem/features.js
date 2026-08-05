import { ContainerBuilder, MessageFlags, AttachmentBuilder } from 'discord.js';
import Ticket from '../../models/Ticket.js';
import { t } from '../i18n.js';
import { emojis } from '../emoji.js';
import logger from '../logger.js';
import { accentColor, checkEmoji, errorEmoji } from './constants.js';
import { buildTextContainer, replyContainer } from './config.js';

/**
 * @param {import('discord.js').ThreadChannel} thread
 * @returns {Promise<Array<{authorId: string, authorTag: string, content: string, attachments: string[], createdAt: Date}>>}
 */
async function buildTranscriptEntries(thread) {
	const messages = await thread.messages.fetch({ limit: 100 });
	const entries = [];

	for (const message of messages.values()) {
		if (message.author.id === message.client.user.id) continue;

		entries.push({
			authorId: message.author.id,
			authorTag: message.author.tag ?? message.author.username,
			content: message.content || '',
			attachments: message.attachments.map(attachment => attachment.url),
			createdAt: message.createdAt,
		});
	}

	entries.reverse();
	return entries;
}

/**
 * Builds a plain-text transcript string for a ticket.
 * @param {import('mongoose').Document} ticket
 * @returns {string}
 */
export function buildTranscriptText(ticket) {
	const lines = [
		'Ticket Transcript',
		'=================',
		`Category: ${ticket.categoryLabel}`,
		`Priority: ${ticket.priority ?? 'medium'}`,
		`Opener: ${ticket.openerId}`,
		`Closed by: ${ticket.closedBy ?? '—'}`,
		`Closed at: ${ticket.closedAt?.toISOString() ?? '—'}`,
	];

	if (ticket.closeReason) {
		lines.push(`Reason: ${ticket.closeReason}`);
	}

	lines.push('', '--- Messages ---', '');

	if (!ticket.transcript?.length) {
		lines.push('No messages were recorded.');
	}
	else {
		for (const entry of ticket.transcript) {
			const time = entry.createdAt ? new Date(entry.createdAt).toISOString() : '—';
			const content = entry.content || (entry.attachments.length ? `[${entry.attachments.length} attachment(s)]\n${entry.attachments.join('\n')}` : '');
			lines.push(`[${time}] ${entry.authorTag}:`);
			lines.push(content);
			lines.push('');
		}
	}

	return lines.join('\n');
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {import('mongoose').Document} ticketConfig
 * @param {import('mongoose').Document} ticket
 * @returns {Promise<void>}
 */
export async function postTranscript(guild, ticketConfig, ticket) {
	if (!ticketConfig.transcriptChannelId) return;

	const transcriptChannel = await guild.channels.fetch(ticketConfig.transcriptChannelId);
	if (!transcriptChannel?.isTextBased()) return;

	const title = await t(guild.id, 'ticket_transcript_title', { emoji: emojis.ticket });
	const categoryLine = await t(guild.id, 'ticket_transcript_category', { category: ticket.categoryLabel });
	const priorityLine = await t(guild.id, 'ticket_transcript_priority', { priority: ticket.priority });
	const openerLine = await t(guild.id, 'ticket_transcript_opener', { user: `<@${ticket.openerId}>` });

	const text = buildTranscriptText(ticket);
	const attachment = new AttachmentBuilder(Buffer.from(text, 'utf8'), { name: `transcript-${ticket.threadId}.txt` });

	const container = new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents(textDisplay =>
			textDisplay.setContent(
				[
					`## ${title}`,
					`-# ${categoryLine}`,
					`-# ${priorityLine}`,
					`-# ${openerLine}`,
				].join('\n'),
			),
		);

	const message = await transcriptChannel.send({
		content: '',
		files: [attachment],
		components: [container],
		flags: MessageFlags.IsComponentsV2,
	});

	ticket.transcriptMessageId = message.id;
	await ticket.save();
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {import('mongoose').Document} ticketConfig
 * @param {import('mongoose').Document} ticket
 * @returns {Promise<void>}
 */
export async function saveTranscript(guild, ticketConfig, ticket) {
	const thread = await guild.channels.fetch(ticket.threadId);
	if (!thread?.isThread()) return;

	const entries = await buildTranscriptEntries(thread);
	ticket.transcript = entries;
	await ticket.save();

	await postTranscript(guild, ticketConfig, ticket);
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {import('mongoose').Document} ticketConfig
 * @returns {Promise<void>}
 */
export async function autoCloseStaleTickets(guild, ticketConfig) {
	if (!ticketConfig.autoCloseMinutes || ticketConfig.autoCloseMinutes <= 0) return;

	const cutoff = new Date(Date.now() - ticketConfig.autoCloseMinutes * 60 * 1000);
	const staleTickets = await Ticket.find({
		guildId: guild.id,
		status: 'open',
		lastActivityAt: { $lt: cutoff },
	});

	for (const ticket of staleTickets) {
		try {
			const thread = await guild.channels.fetch(ticket.threadId);
			if (!thread?.isThread()) continue;

			ticket.status = 'closed';
			ticket.closedAt = new Date();
			ticket.closedBy = null;
			ticket.closeReason = await t(guild.id, 'ticket_auto_close_reason');
			await ticket.save();

			await saveTranscript(guild, ticketConfig, ticket);

			const notice = await t(guild.id, 'ticket_auto_close_notice', { emoji: emojis.x_ });
			await thread.send({
				components: [buildTextContainer(notice, 0xFF0000)],
				flags: MessageFlags.IsComponentsV2,
			}).catch(() => null);
			await thread.setArchived(true, 'Auto-closed due to inactivity').catch(() => null);
		}
		catch (error) {
			logger.error(`Failed to auto-close ticket ${ticket.threadId}:`, error);
		}
	}
}

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('mongoose').Document} ticket
 * @param {string} priority
 */
export async function setTicketPriority(interaction, ticket, priority) {
	ticket.priority = priority;
	await ticket.save();

	const successMsg = await t(interaction.guildId, 'ticket_priority_set', { emoji: checkEmoji, priority });
	await replyContainer(interaction, buildTextContainer(successMsg));
}

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('mongoose').Document} ticket
 * @param {string | null} note
 */
export async function setTicketNote(interaction, ticket, note) {
	ticket.notes = note;
	await ticket.save();

	const successMsg = note
		? await t(interaction.guildId, 'ticket_note_set', { emoji: checkEmoji })
		: await t(interaction.guildId, 'ticket_note_cleared', { emoji: checkEmoji });
	await replyContainer(interaction, buildTextContainer(successMsg));
}

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {import('mongoose').Document} ticket
 */
export async function showTicketTranscript(interaction, ticket) {
	if (ticket.transcript.length === 0) {
		const noTranscript = await t(interaction.guildId, 'ticket_transcript_empty', { emoji: errorEmoji });
		await replyContainer(interaction, buildTextContainer(noTranscript, 0xFF0000));
		return;
	}

	const title = await t(interaction.guildId, 'ticket_transcript_title', { emoji: emojis.ticket });
	const lines = [`## ${title}`];

	for (const entry of ticket.transcript) {
		const time = entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '—';
		const content = entry.content || (entry.attachments.length ? `[${entry.attachments.length} attachment(s)]` : '');
		lines.push(`**${entry.authorTag}** \`${time}\`\n${content}`);
	}

	await replyContainer(interaction, buildTextContainer(lines.join('\n').slice(0, 4000)));
}
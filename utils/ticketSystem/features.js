import { ContainerBuilder, MessageFlags, AttachmentBuilder, FileBuilder } from 'discord.js';
import Ticket from '../../models/Ticket.js';
import { t } from '../i18n.js';
import { emojis } from '../emoji.js';
import logger from '../logger.js';
import { checkEmoji, errorEmoji } from './constants.js';
import { buildTextContainer, replyContainer } from './config.js';
import { getAccentColor, getErrorColor } from '../color.js';
import { buildTranscriptHtml } from './transcriptHtml.js';

/**
 * @param {import('discord.js').ThreadChannel} thread
 * @returns {Promise<Array<object>>}
 */
async function buildTranscriptEntries(thread) {
	const messages = [];
	let before;

	while (true) {
		const page = await thread.messages.fetch({ limit: 100, before });
		if (page.size === 0) break;
		messages.push(...page.values());
		before = page.last().id;
		if (page.size < 100) break;
	}

	const entries = [];

	for (const message of messages) {
		let referencedMessage = null;
		if (message.reference?.messageId) {
			referencedMessage = await message.fetchReference().catch(() => null);
		}

		entries.push({
			authorId: message.author.id,
			authorTag: message.author.tag ?? message.author.username,
			authorDisplayName: message.member?.displayName ?? message.author.globalName ?? message.author.username,
			authorAvatarUrl: message.author.displayAvatarURL({ extension: 'png', size: 128 }),
			authorBot: message.author.bot,
			content: message.content || '',
			attachments: message.attachments.map(attachment => attachment.url),
			attachmentMetadata: message.attachments.map(attachment => ({
				url: attachment.url,
				name: attachment.name,
				contentType: attachment.contentType,
				size: attachment.size,
				width: attachment.width,
				height: attachment.height,
			})),
			embeds: message.embeds.map(embed => embed.toJSON()),
			components: message.components.map(component => component.toJSON()),
			stickers: message.stickers.map(sticker => ({
				name: sticker.name,
				url: sticker.url,
			})),
			reference: referencedMessage ? {
				authorTag: referencedMessage.author.tag ?? referencedMessage.author.username,
				authorDisplayName: referencedMessage.member?.displayName ?? referencedMessage.author.globalName ?? referencedMessage.author.username,
				content: referencedMessage.content?.slice(0, 160) ?? '',
			} : null,
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

	const html = buildTranscriptHtml(ticket);
	const filename = `transcript-${ticket.threadId}.html`;
	const attachment = new AttachmentBuilder(Buffer.from(html, 'utf8'), { name: filename });

	const container = new ContainerBuilder()
		.setAccentColor(await getAccentColor(guild.id))
		.addTextDisplayComponents(textDisplay =>
			textDisplay.setContent(
				[
					`## ${title}`,
					`-# ${categoryLine}`,
					`-# ${priorityLine}`,
					`-# ${openerLine}`,
				].join('\n'),
			),
		)
		.addFileComponents(new FileBuilder().setURL(`attachment://${filename}`));

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
	ticket.transcriptChannelName = thread.name;
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
				components: [buildTextContainer(notice, await getErrorColor(guild.id))],
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
		await replyContainer(interaction, buildTextContainer(noTranscript, await getErrorColor(interaction.guildId)));
		return;
	}

	const title = await t(interaction.guildId, 'ticket_transcript_title', { emoji: emojis.ticket });
	const filename = `transcript-${ticket.threadId}.html`;
	const attachment = new AttachmentBuilder(Buffer.from(buildTranscriptHtml(ticket), 'utf8'), {
		name: filename,
	});
	const container = buildTextContainer(`## ${title}`)
		.addFileComponents(new FileBuilder().setURL(`attachment://${filename}`));
	const payload = {
		components: [container],
		files: [attachment],
		flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
	};

	if (interaction.replied || interaction.deferred) await interaction.editReply(payload);
	else await interaction.reply(payload);
}

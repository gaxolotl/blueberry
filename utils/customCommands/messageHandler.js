// Dispatches message-triggered custom commands for both fresh and edited
// messages. Mirrors YAGPDB: only commands with `editTrigger` run on edits.
import CustomCommand from '../../models/CustomCommand.js';
import Guild from '../../models/Guild.js';
import { getMatchingCommands, checkRestrictions } from './triggers.js';
import { runCustomCommand } from './runner.js';

const PREFIX_CACHE = new Map();
const prefixCacheExpiry = new Map();
const PREFIX_CACHE_MS = 2 * 60_000;

async function getPrefix(guildId) {
	if (!guildId) return '-';
	const cached = PREFIX_CACHE.get(guildId);
	if (cached && prefixCacheExpiry.get(guildId) > Date.now()) return cached;

	let prefix = '-';
	try {
		const guildDoc = await Guild.findOne({ guildId }).select('commandPrefix').lean();
		if (guildDoc?.commandPrefix && guildDoc.commandPrefix.trim() !== '') {
			prefix = guildDoc.commandPrefix;
		}
	}
	catch {
		prefix = '-';
	}

	PREFIX_CACHE.set(guildId, prefix);
	prefixCacheExpiry.set(guildId, Date.now() + PREFIX_CACHE_MS);
	return prefix;
}

/**
 * Processes a message against message-triggered custom commands.
 * @param {object} message - discord.js Message
 * @param {boolean} isEdit - whether this is a MessageUpdate
 */
export async function handleMessageCommands(message, isEdit = false) {
	if (!message.guildId) return;
	if (!message.channel || !message.channel.isTextBased?.()) return;

	const guild = message.guild;
	if (!guild) return;

	const prefix = await getPrefix(message.guildId);
	const botMention = message.client?.user ? `<@${message.client.user.id}>` : null;
	const msgLike = {
		content: message.content ?? '',
	};

	const matches = await getMatchingCommands(message.guildId, msgLike, prefix, botMention, isEdit);
	for (const { cc, result } of matches) {
		const member = message.member ?? null;
		const channel = message.channel;
		const allowed = await checkRestrictions(guild, member, channel, cc);
		if (!allowed) continue;

		await runCustomCommand({
			client: message.client,
			guild,
			channel,
			member,
			message,
			cc,
			prefix,
			args: result.args,
			cmdArgs: result.args,
			stripped: result.stripped,
			matchedText: result.matchedText,
			isEdit,
		});
	}
}

export { CustomCommand };

export function invalidatePrefixCache(guildId) {
	if (guildId) {
		PREFIX_CACHE.delete(guildId);
		prefixCacheExpiry.delete(guildId);
	}
}
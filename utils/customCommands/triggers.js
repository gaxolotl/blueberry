// Trigger matching for custom commands. Mirrors YAGPDB's trigger semantics.
import CustomCommand from '../../models/CustomCommand.js';

const MAX_CCS_PER_MESSAGE = 3;

/**
 * Matches a single command's message-based trigger against a message.
 * @param {import('../../models/CustomCommand.js').default} cc
 * @param {object} msg - { content, mentions, guild, channel, author }
 * @param {string} prefix - server prefix
 * @param {string} [botMention]
 * @returns {null|{args: string[], stripped: string, matchedText: string}}
 */
export function matchMessageTrigger(cc, msg, prefix, botMention) {
	const content = msg.content ?? '';
	const caseSensitive = cc.caseSensitive;
	const test = caseSensitive ? content : content.toLowerCase();

	let trigger = cc.trigger ?? '';
	if (!caseSensitive) trigger = trigger.toLowerCase();

	switch (cc.triggerType) {
	case 'command': {
		const matches = matchCommand(content, trigger, prefix, botMention, caseSensitive);
		if (!matches) return null;
		return matches;
	}
	case 'startsWith': {
		if (!test.startsWith(trigger)) return null;
		const rest = content.slice((cc.trigger ?? '').length);
		return {
			args: splitArgs(rest),
			stripped: rest.trim(),
			matchedText: cc.trigger ?? '',
		};
	}
	case 'contains': {
		if (!test.includes(trigger)) return null;
		return {
			args: splitArgs(content),
			stripped: content.trim(),
			matchedText: cc.trigger ?? '',
		};
	}
	case 'exactMatch': {
		if (test !== trigger) return null;
		return {
			args: [],
			stripped: '',
			matchedText: content,
		};
	}
	case 'regex': {
		try {
			const re = new RegExp(cc.trigger, caseSensitive ? '' : 'i');
			const m = re.exec(content);
			if (!m) return null;
			return {
				args: splitArgs(content),
				stripped: m[0] ? content.replace(m[0], '').trim() : content.trim(),
				matchedText: m[0],
			};
		}
		catch {
			return null;
		}
	}
	default:
		return null;
	}
}

function matchCommand(content, trigger, prefix, botMention, caseSensitive) {
	// prefix + trigger
	const fullPrefix = prefix + trigger;
	if (caseSensitive ? content.startsWith(fullPrefix) : content.toLowerCase().startsWith(fullPrefix.toLowerCase())) {
		const matchedText = content.slice(0, fullPrefix.length);
		const rest = content.slice(fullPrefix.length);
		return {
			args: splitArgs(rest),
			stripped: rest.trim(),
			matchedText,
		};
	}

	// bot mention + trigger
	if (botMention) {
		const fullMention = botMention + ' ' + trigger;
		if (caseSensitive ? content.startsWith(fullMention) : content.toLowerCase().startsWith(fullMention.toLowerCase())) {
			const matchedText = content.slice(0, fullMention.length);
			const rest = content.slice(fullMention.length);
			return {
				args: splitArgs(rest),
				stripped: rest.trim(),
				matchedText,
			};
		}
	}
	return null;
}

function splitArgs(text) {
	const t = String(text ?? '').trim();
	if (!t) return [];
	return t.split(/\s+/);
}

/**
 * Fetches and matches message commands for a message, applying restrictions.
 * Returns an ordered list of matching CCs.
 */
export async function getMatchingCommands(guildId, msg, prefix, botMention, isEdit = false) {
	const commands = await CustomCommand.find({
		guildId,
		enabled: true,
		triggerType: { $in: ['command', 'startsWith', 'contains', 'exactMatch', 'regex'] },
	}).lean();

	const matched = [];
	for (const cc of commands) {
		if (isEdit && !cc.editTrigger) continue;
		const result = matchMessageTrigger(cc, msg, prefix, botMention);
		if (result) {
			matched.push({ cc, result });
			if (matched.length >= MAX_CCS_PER_MESSAGE) break;
		}
	}
	return matched;
}

/**
 * Matches a custom command against a component/modal interaction custom ID.
 * The trigger is matched using RegEx (per YAGPDB's custom-interactions docs).
 * @param {object} cc
 * @param {string} customId - the full custom ID (templates- prefix excluded)
 * @returns {null|{stripped: string}}
 */
export function matchComponentTrigger(cc, customId) {
	if (!cc?.trigger) return null;
	try {
		if (!new RegExp(cc.trigger).test(String(customId ?? ''))) return null;
	}
	catch {
		return null;
	}
	const match = new RegExp(cc.trigger).exec(String(customId ?? ''));
	const stripped = match ? String(customId).slice(0, match.index) + String(customId).slice(match.index + match[0].length) : String(customId);
	return { stripped };
}

/**
 * Fetches component/modal commands matching a custom ID.
 */
export async function getMatchingInteractionCommands(guildId, customId, kind) {
	const commands = await CustomCommand.find({
		guildId,
		enabled: true,
		triggerType: kind,
	}).lean();

	const matched = [];
	for (const cc of commands) {
		const result = matchComponentTrigger(cc, customId);
		if (result) matched.push({ cc, result });
	}
	return matched;
}

/**
 * Checks channel + role restrictions. Deny takes precedence over allow.
 */
export async function checkRestrictions(guild, member, channel, cc, group = null) {
	const restrictions = [cc.restrictions ?? {}];
	if (group?.restrictions) restrictions.push(group.restrictions);

	if (!member) return true;

	const memberRoleIds = new Set(member.roles?.cache?.keys() ?? []);

	for (const r of restrictions) {
		const denyChannels = r.denyChannelIds ?? [];
		if (channel && denyChannels.includes(channel.id)) return false;

		const denyRoles = r.denyRoleIds ?? [];
		if (denyRoles.some(id => memberRoleIds.has(id))) return false;

		const allowChannels = r.allowChannelIds ?? [];
		if (channel && allowChannels.length > 0 && !allowChannels.includes(channel.id)) return false;

		const allowRoles = r.allowRoleIds ?? [];
		if (allowRoles.length > 0 && !allowRoles.some(id => memberRoleIds.has(id))) return false;
	}
	return true;
}

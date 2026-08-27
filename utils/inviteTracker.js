import InviteJoin from '../models/InviteJoin.js';

const inviteSnapshots = new Map();

function buildInviteLink(code) {
	if (!code || code === 'unknown') return 'unknown';
	return `https://discord.gg/${code}`;
}

function normalizeInviteValue(value, fallback = 'unknown') {
	if (value === undefined || value === null || value === '') return fallback;
	return value;
}

function getAvatarHash(inviter) {
	if (!inviter) return null;
	return inviter.avatar ?? null;
}

function serializeInvite(invite, guild) {
	const vanityCode = guild?.vanityURLCode;
	const code = normalizeInviteValue(invite?.code, 'unknown');
	const channelName = invite?.channel?.name ?? invite?.channelId ?? 'unknown';
	const inviter = invite?.inviter;
	let inviterTag = 'unknown';
	if (inviter) {
		inviterTag = inviter.tag ?? `${inviter.username ?? 'unknown'}#${inviter.discriminator ?? '0000'}`;
	}

	return {
		code,
		link: buildInviteLink(code),
		inviterId: normalizeInviteValue(invite?.inviter?.id, 'unknown'),
		inviterTag: normalizeInviteValue(inviterTag, 'unknown'),
		inviterAvatar: getAvatarHash(inviter),
		channelId: normalizeInviteValue(invite?.channelId, 'unknown'),
		channel: normalizeInviteValue(channelName, 'unknown'),
		uses: normalizeInviteValue(invite?.uses, 'unknown'),
		maxUses: normalizeInviteValue(invite?.maxUses, 'unknown'),
		temporary: normalizeInviteValue(invite?.temporary, 'unknown'),
		createdTimestamp: normalizeInviteValue(invite?.createdTimestamp, 'unknown'),
		expiresTimestamp: normalizeInviteValue(invite?.expiresTimestamp, 'unknown'),
		vanityUrlJoin: Boolean(code !== 'unknown' && vanityCode && code === vanityCode),
	};
}

function buildInviteRecord(member, guild, inviteData) {
	const inviteCode = inviteData?.code ?? 'unknown';
	const user = member?.user ?? {};
	const createdTimestamp = user.createdTimestamp ?? null;
	const accountAgeDays = createdTimestamp
		? Math.max(0, Math.floor((Date.now() - createdTimestamp) / 86_400_000))
		: null;

	return {
		joinedAt: new Date(),
		memberId: member.id,
		memberTag: user.tag ?? user.username ?? 'unknown',
		memberAvatar: user.avatar ?? null,
		accountAgeDays,
		isBot: Boolean(user.bot),
		guildId: guild.id,
		guildName: guild.name,
		inviteCode,
		inviteLink: inviteData?.link ?? buildInviteLink(inviteCode),
		inviterId: inviteData?.inviterId ?? 'unknown',
		inviterTag: inviteData?.inviterTag ?? 'unknown',
		inviterAvatar: inviteData?.inviterAvatar ?? null,
		channel: inviteData?.channel ?? 'unknown',
		channelId: inviteData?.channelId ?? 'unknown',
		uses: inviteData?.uses ?? 'unknown',
		maxUses: inviteData?.maxUses ?? 'unknown',
		temporary: inviteData?.temporary ?? 'unknown',
		createdTimestamp: inviteData?.createdTimestamp ?? 'unknown',
		expiresTimestamp: inviteData?.expiresTimestamp ?? 'unknown',
		vanityUrlJoin: typeof inviteData?.vanityUrlJoin === 'boolean' ? inviteData.vanityUrlJoin : 'unknown',
	};
}

/**
 * Fetch recent invite join records for a single guild.
 * @param {string} guildId - Discord guild snowflake ID.
 * @param {number} [limit=10] - Maximum number of records to return.
 * @returns {Promise<object[]>}
 */
async function getRecentInviteRecords(guildId, limit = 10) {
	return InviteJoin.find({ guildId })
		.sort({ joinedAt: -1 })
		.limit(limit)
		.lean();
}

/**
 * Persist a new invite join record for the guild it belongs to.
 * @param {object} record - Invite record built by buildInviteRecord().
 * @returns {Promise<object>}
 */
async function appendInviteRecord(record) {
	return InviteJoin.create(record);
}

/**
 * Fetches a fresh snapshot of the guild's invites, bypassing the cache.
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<Map<string, object>>}
 */
async function snapshotGuildInvites(guild) {
	const invites = await guild.invites.fetch({ cache: false });
	const snapshot = new Map();
	for (const invite of invites.values()) {
		snapshot.set(invite.code, serializeInvite(invite, guild));
	}
	inviteSnapshots.set(guild.id, snapshot);
	return snapshot;
}

function getStoredInviteSnapshot(guildId) {
	return inviteSnapshots.get(guildId);
}

/**
 * Determines which invite was used for a join by diffing snapshots.
 * Handles three cases:
 *  - an invite whose `uses` counter increased;
 *  - an invite created after the last snapshot that already shows one use;
 *  - an invite that disappeared after reaching its max uses (temporary/limited).
 * @param {Map<string, object>|undefined} previousSnapshot
 * @param {Map<string, object>|undefined} currentSnapshot
 * @returns {object|null}
 */
function findInviteThatWasUsed(previousSnapshot, currentSnapshot) {
	if (!currentSnapshot) return null;

	// Case 1: an existing invite's usage count went up.
	if (previousSnapshot) {
		for (const [code, currentInvite] of currentSnapshot.entries()) {
			const previousInvite = previousSnapshot.get(code);
			if (previousInvite
				&& previousInvite.uses !== 'unknown'
				&& currentInvite.uses !== 'unknown'
				&& previousInvite.uses < currentInvite.uses) {
				return currentInvite;
			}
		}
	}

	// Case 2: an invite that wasn't in the previous snapshot already shows a use.
	// This catches invites created after the bot's last snapshot.
	for (const [code, currentInvite] of currentSnapshot.entries()) {
		if (currentInvite.uses !== 'unknown' && Number(currentInvite.uses) >= 1) {
			if (!previousSnapshot || !previousSnapshot.has(code)) {
				return currentInvite;
			}
		}
	}

	// Case 3: an invite that was consumed and removed (e.g. maxUses reached).
	if (previousSnapshot) {
		for (const [code, previousInvite] of previousSnapshot.entries()) {
			if (!currentSnapshot.has(code)
				&& previousInvite.uses !== 'unknown'
				&& Number(previousInvite.uses) >= 1
				&& previousInvite.maxUses !== 'unknown'
				&& Number(previousInvite.uses) >= Number(previousInvite.maxUses) - 1) {
				return previousInvite;
			}
		}
	}

	return null;
}

/**
 * Aggregates invite join statistics for a guild.
 * @param {string} guildId
 * @returns {Promise<object>}
 */
async function getInviteStats(guildId) {
	const [total, known, unknown, vanity, topInvites, topInviters, last7, last30] = await Promise.all([
		InviteJoin.countDocuments({ guildId }),
		InviteJoin.countDocuments({ guildId, inviteCode: { $ne: 'unknown' } }),
		InviteJoin.countDocuments({ guildId, inviteCode: 'unknown' }),
		InviteJoin.countDocuments({ guildId, vanityUrlJoin: true }),
		InviteJoin.aggregate([
			{ $match: { guildId, inviteCode: { $ne: 'unknown' } } },
			{ $group: { _id: '$inviteCode', count: { $sum: 1 } } },
			{ $sort: { count: -1 } },
			{ $limit: 10 },
		]),
		InviteJoin.aggregate([
			{ $match: { guildId, inviterId: { $ne: 'unknown' } } },
			{ $group: { _id: '$inviterId', tag: { $last: '$inviterTag' }, count: { $sum: 1 } } },
			{ $sort: { count: -1 } },
			{ $limit: 10 },
		]),
		InviteJoin.countDocuments({ guildId, joinedAt: { $gte: new Date(Date.now() - 7 * 86_400_000) } }),
		InviteJoin.countDocuments({ guildId, joinedAt: { $gte: new Date(Date.now() - 30 * 86_400_000) } }),
	]);

	return {
		total,
		known,
		unknown,
		vanity,
		last7Days: last7,
		last30Days: last30,
		topInvites,
		topInviters,
	};
}

export {
	buildInviteRecord,
	serializeInvite,
	getRecentInviteRecords,
	appendInviteRecord,
	snapshotGuildInvites,
	getStoredInviteSnapshot,
	findInviteThatWasUsed,
	getInviteStats,
};
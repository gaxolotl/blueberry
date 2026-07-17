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

	return {
		joinedAt: new Date(),
		memberId: member.id,
		memberTag: member.user.tag,
		guildId: guild.id,
		guildName: guild.name,
		inviteCode,
		inviteLink: inviteData?.link ?? buildInviteLink(inviteCode),
		inviterId: inviteData?.inviterId ?? 'unknown',
		inviterTag: inviteData?.inviterTag ?? 'unknown',
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

async function snapshotGuildInvites(guild) {
	const invites = await guild.invites.fetch();
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

function findInviteThatWasUsed(previousSnapshot, currentSnapshot) {
	if (!previousSnapshot || !currentSnapshot) return null;
	for (const [code, currentInvite] of currentSnapshot.entries()) {
		const previousInvite = previousSnapshot.get(code);
		if (previousInvite && previousInvite.uses !== 'unknown' && currentInvite.uses !== 'unknown' && previousInvite.uses < currentInvite.uses) {
			return currentInvite;
		}
	}
	return null;
}

export {
	buildInviteRecord,
	serializeInvite,
	getRecentInviteRecords,
	appendInviteRecord,
	snapshotGuildInvites,
	getStoredInviteSnapshot,
	findInviteThatWasUsed,
};

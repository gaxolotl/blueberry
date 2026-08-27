import InviteJoin from '../models/InviteJoin.js';
import MemberLeave from '../models/MemberLeave.js';

const DAY_MS = 86_400_000;
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function toDayKey(date) {
	return date.toISOString().slice(0, 10);
}

function dayStartUtc() {
	const now = new Date();
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addDays(date, days) {
	return new Date(date.getTime() + days * DAY_MS);
}

/**
 * Builds the range metadata used to query and shape a period.
 * @param {'day'|'week'|'month'|'year'} period
 * @returns {{start: Date, end: Date, bucketId: function(string): string, buckets: Array<{id: string, label: string}>}}
 */
function periodConfig(period) {
	const today = dayStartUtc();

	if (period === 'day') {
		const start = today;
		const end = addDays(today, 1);
		const buckets = [];
		for (let hour = 0; hour < 24; hour += 1) {
			buckets.push({ id: `D-${hour}`, label: `${String(hour).padStart(2, '0')}:00` });
		}
		return { start, end, bucketId: (_day) => _day, buckets };
	}

	if (period === 'week') {
		const start = addDays(today, -6);
		const end = addDays(today, 1);
		const buckets = [];
		for (let i = 0; i < 7; i += 1) {
			const date = addDays(start, i);
			buckets.push({ id: toDayKey(date), label: `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}` });
		}
		return { start, end, bucketId: day => day, buckets };
	}

	if (period === 'month') {
		const start = addDays(today, -29);
		const end = addDays(today, 1);
		const buckets = [];
		for (let i = 0; i < 30; i += 1) {
			const date = addDays(start, i);
			buckets.push({ id: toDayKey(date), label: String(date.getUTCDate()) });
		}
		return { start, end, bucketId: day => day, buckets };
	}

	const startMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1));
	const endExclusive = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
	const buckets = [];
	let cursor = new Date(startMonth);
	while (cursor < endExclusive) {
		const id = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
		buckets.push({ id, label: `${MONTH_SHORT[cursor.getUTCMonth()]} '${String(cursor.getUTCFullYear()).slice(-2)}` });
		cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
	}
	return { start: startMonth, end: endExclusive, bucketId: day => day.slice(0, 7), buckets };
}

/**
 * Records a member departure.
 * @param {import('discord.js').GuildMember} member
 */
export async function recordMemberLeave(member) {
	const guildId = member.guild?.id;
	if (!guildId) return;

	// Best-effort: try to recover the member's join timestamp from the join log.
	const lastJoin = await InviteJoin.findOne({ guildId, memberId: member.id }).sort({ joinedAt: -1 }).lean().catch(() => null);

	const createdTimestamp = member.user?.createdTimestamp ?? null;
	const joinedAt = lastJoin?.joinedAt ?? member.joinedAt ?? null;
	const leftAt = new Date();
	const accountAgeDays = createdTimestamp
		? Math.max(0, Math.floor((leftAt.getTime() - createdTimestamp) / 86_400_000))
		: null;
	const durationDays = joinedAt
		? Math.max(0, Math.floor((leftAt.getTime() - new Date(joinedAt).getTime()) / 86_400_000))
		: null;

	await MemberLeave.create({
		guildId,
		guildName: member.guild?.name ?? 'unknown',
		memberId: member.id,
		memberTag: member.user?.tag ?? member.user?.username ?? 'unknown',
		memberAvatar: member.user?.avatar ?? null,
		accountAgeDays,
		isBot: Boolean(member.user?.bot),
		durationDays,
		joinedAt: joinedAt ? new Date(joinedAt) : null,
		leftAt,
	});
}

/**
 * Computes the retention rate for a cohort of members who joined at least
 * `days` ago: the share that never left within that window.
 * @param {string} guildId
 * @param {number} days
 * @returns {Promise<number|null>}
 */
async function computeRetentionRate(guildId, days) {
	const cutoff = new Date(Date.now() - days * DAY_MS);

	const cohorts = await InviteJoin.aggregate([
		{ $match: { guildId, joinedAt: { $lte: cutoff } } },
		{ $group: { _id: '$memberId', joinedAt: { $min: '$joinedAt' } } },
	]).catch(() => []);

	if (!cohorts.length) return null;

	const leftWithinWindow = await MemberLeave.aggregate([
		{ $match: { guildId } },
		{ $group: { _id: '$memberId', leftAt: { $min: '$leftAt' } } },
	]).catch(() => []);

	const leaveMap = new Map(leftWithinWindow.map(entry => [entry._id, entry.leftAt]));

	let retained = 0;
	for (const cohort of cohorts) {
		const leftAt = leaveMap.get(cohort._id);
		const joinTime = new Date(cohort.joinedAt).getTime();
		if (!leftAt || new Date(leftAt).getTime() >= joinTime + days * DAY_MS) {
			retained += 1;
		}
	}

	return Math.round((retained / cohorts.length) * 1000) / 10;
}

/**
 * Builds join/leave trends and retention rates for a guild over a period.
 * @param {string} guildId
 * @param {'day'|'week'|'month'|'year'} period
 * @returns {Promise<object>}
 */
export async function getRetentionStats(guildId, period) {
	const normalized = ['day', 'week', 'month', 'year'].includes(period) ? period : 'week';
	const { start, end, bucketId, buckets } = periodConfig(normalized);

	const joinQuery = {
		guildId,
		joinedAt: { $gte: start, $lt: end },
	};
	const leaveQuery = {
		guildId,
		leftAt: { $gte: start, $lt: end },
	};

	const [totalJoins, totalLeaves, retention7, retention30] = await Promise.all([
		InviteJoin.countDocuments({ guildId, joinedAt: { $gte: start, $lt: end } }).catch(() => 0),
		MemberLeave.countDocuments({ guildId, leftAt: { $gte: start, $lt: end } }).catch(() => 0),
		computeRetentionRate(guildId, 7),
		computeRetentionRate(guildId, 30),
	]);

	// InviteJoin stores joinedAt as a Date; derive the day key in JS since we
	// can't safely reference a virtual field inside aggregation.
	const joinSeriesMap = new Map();
	const joinRecords = await InviteJoin.find(joinQuery).select('joinedAt').lean().catch(() => []);
	for (const record of joinRecords) {
		const id = bucketId(toDayKey(record.joinedAt));
		joinSeriesMap.set(id, (joinSeriesMap.get(id) ?? 0) + 1);
	}

	const leaveSeriesMap = new Map();
	const leaveRecords = await MemberLeave.find(leaveQuery).select('leftAt').lean().catch(() => []);
	for (const record of leaveRecords) {
		const id = bucketId(toDayKey(record.leftAt));
		leaveSeriesMap.set(id, (leaveSeriesMap.get(id) ?? 0) + 1);
	}

	const series = buckets.map(({ id, label }) => {
		const joins = joinSeriesMap.get(id) ?? 0;
		const leaves = leaveSeriesMap.get(id) ?? 0;
		return { label, joins, leaves, net: joins - leaves };
	});

	// ---- Member quality stats ----
	const joinDocs = await InviteJoin.find(joinQuery).select('accountAgeDays isBot').lean().catch(() => []);
	const joinAges = joinDocs.map(record => record.accountAgeDays).filter(Number.isFinite);
	const avgAccountAge = joinAges.length ? Math.round((joinAges.reduce((sum, age) => sum + age, 0) / joinAges.length) * 10) / 10 : null;
	const newAccountJoins = joinDocs.filter(record => Number.isFinite(record.accountAgeDays) && record.accountAgeDays < 7).length;
	const botJoins = joinDocs.filter(record => record.isBot).length;

	const leaveDocs = await MemberLeave.find(leaveQuery).select('durationDays accountAgeDays isBot').lean().catch(() => []);
	const durations = leaveDocs.map(record => record.durationDays).filter(Number.isFinite);
	const avgTenureDays = durations.length ? Math.round((durations.reduce((sum, days) => sum + days, 0) / durations.length) * 10) / 10 : null;

	const recentLeaves = await MemberLeave.find(leaveQuery)
		.sort({ leftAt: -1 })
		.limit(8)
		.select('memberId memberTag memberAvatar accountAgeDays isBot durationDays joinedAt leftAt')
		.lean()
		.catch(() => []);

	return {
		period: normalized,
		totalJoins,
		totalLeaves,
		netGrowth: totalJoins - totalLeaves,
		retention7: retention7 ?? null,
		retention30: retention30 ?? null,
		avgAccountAge,
		newAccountJoins,
		botJoins,
		avgTenureDays,
		recentLeaves,
		series,
	};
}
import MessageActivity from '../models/MessageActivity.js';

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
 * Returns the range start/end (exclusive), the bucket id function and the list
 * of expected buckets (with display labels) to fill with zeroes when missing.
 * @param {'day'|'week'|'month'|'year'} period
 * @returns {{start: Date, end: Date, bucketId: function(string, number): string, buckets: Array<{id: string, label: string}>}}
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
		return { start, end, bucketId: (_day, hour) => `D-${hour}`, buckets };
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
 * Records a single message into the guild's activity bucket.
 * @param {import('discord.js').Message} message
 */
export async function recordMessageActivity(message) {
	if (!message.guildId || message.author?.bot || message.system) return;

	const happenedAt = new Date(message.createdTimestamp ?? Date.now());
	const day = toDayKey(happenedAt);
	const hour = happenedAt.getUTCHours();

	await MessageActivity.updateOne(
		{ guildId: message.guildId, day, hour, userId: message.author.id },
		{
			$inc: { count: 1 },
			$set: {
				userTag: message.author.tag ?? message.author.username ?? 'Unknown',
				channelId: message.channelId ?? null,
			},
		},
		{ upsert: true },
	);
}

/**
 * Builds time-series activity statistics for a guild over a period.
 * @param {string} guildId
 * @param {'day'|'week'|'month'|'year'} period
 * @returns {Promise<object>}
 */
export async function getActivityStats(guildId, period) {
	const normalized = ['day', 'week', 'month', 'year'].includes(period) ? period : 'week';
	const { start, end, bucketId, buckets } = periodConfig(normalized);

	const query = {
		guildId,
		day: { $gte: toDayKey(start), $lt: toDayKey(end) },
	};

	const [totalsAgg, distinctMembers, seriesAgg, topAgg, channelsAgg] = await Promise.all([
		MessageActivity.aggregate([
			{ $match: query },
			{ $group: { _id: null, total: { $sum: '$count' } } },
		]),
		MessageActivity.aggregate([
			{ $match: query },
			{ $group: { _id: '$userId' } },
			{ $count: 'total' },
		]),
		MessageActivity.aggregate([
			{ $match: query },
			{
				$group: {
					_id: { day: '$day', hour: '$hour' },
					count: { $sum: '$count' },
				},
			},
		]),
		MessageActivity.aggregate([
			{ $match: query },
			{ $group: { _id: '$userId', count: { $sum: '$count' }, tag: { $last: '$userTag' } } },
			{ $sort: { count: -1 } },
			{ $limit: 10 },
		]),
		MessageActivity.aggregate([
			{ $match: { ...query, channelId: { $ne: null } } },
			{ $group: { _id: '$channelId', count: { $sum: '$count' } } },
			{ $sort: { count: -1 } },
			{ $limit: 8 },
		]),
	]);

	const totals = totalsAgg[0] ?? { total: 0 };
	const activeMembers = distinctMembers[0]?.total ?? 0;
	const seriesMap = new Map();
	for (const entry of seriesAgg) {
		const id = bucketId(entry._id.day, entry._id.hour);
		seriesMap.set(id, (seriesMap.get(id) ?? 0) + entry.count);
	}

	const series = buckets.map(({ id, label }) => ({ label, value: seriesMap.get(id) ?? 0 }));
	const peak = series.reduce((best, current) => (!best || current.value > best.value) ? current : best, null);

	return {
		period: normalized,
		totalMessages: totals.total,
		activeMembers,
		peak: peak ? { label: peak.label, value: peak.value } : null,
		buckets: buckets.length,
		channelBreakdown: channelsAgg.map(channel => ({ channelId: channel._id, count: channel.count })),
		topMembers: topAgg.map(member => ({ userId: member._id, tag: member.tag, count: member.count })),
		series,
	};
}
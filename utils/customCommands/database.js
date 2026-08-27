// Custom Command database store. Implements YAGPDB's db* functions against
// Mongo, with PostgreSQL-style pattern matching (% and _ wildcards) for the
// pattern functions. All records are scoped per guild.
import CustomCommandDBEntry from '../../models/CustomCommandDBEntry.js';
import { getCustomCommandLimits } from './limits.js';

/**
 * Converts a PostgreSQL LIKE pattern to a RegExp.
 * `%` matches any sequence, `_` matches a single character, everything else
 * is treated literally. YAGPDB patterns are case-sensitive.
 * @param {string} pattern
 * @returns {RegExp}
 */
export function patternToRegExp(pattern) {
	let source = '^';
	for (const ch of String(pattern ?? '')) {
		if (ch === '%') source += '[\\s\\S]*';
		else if (ch === '_') source += '[\\s\\S]';
		else source += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}
	source += '$';
	return new RegExp(source);
}

export function isExpired(entry) {
	return entry?.expiresAt != null && entry.expiresAt.getTime() <= Date.now();
}

function toSDictEntry(entry) {
	return {
		ID: String(entry._id),
		UserID: entry.userId,
		Key: entry.key,
		Value: entry.value,
		CreatedAt: entry.createdAt,
		UpdatedAt: entry.updatedAt,
		ExpiresAt: entry.expiresAt,
	};
}

/**
 * Builds the set of db operations bound to a single guild.
 * @param {string} guildId
 */
export function createDatabase(guildId) {
	const limits = getCustomCommandLimits();

	async function normalizeValue(value) {
		if (typeof value === 'string') {
			if (value.length > limits.maxDBValueBytes) {
				const error = new Error('Database value exceeds size limit');
				error.code = 'DB_VALUE_LIMIT';
				throw error;
			}
			return value;
		}
		if (value instanceof Buffer) {
			if (value.length > limits.maxDBValueBytes) {
				const error = new Error('Database value exceeds size limit');
				error.code = 'DB_VALUE_LIMIT';
				throw error;
			}
			return value.toString('utf8');
		}
		if (value == null) return null;
		if (typeof value === 'object') {
			// Serialize complex values as JSON so lookups behave like YAGPDB.
			return JSON.stringify(value);
		}
		return value;
	}

	return {
		async get(userId, key) {
			const entry = await CustomCommandDBEntry.findOne({ guildId, userId, key }).lean();
			if (!entry || isExpired(entry)) return null;
			return toSDictEntry(entry);
		},

		async set(userId, key, value, ttlSeconds) {
			const normalized = await normalizeValue(value);
			const expiresAt = ttlSeconds && ttlSeconds > 0 ? new Date(Date.now() + ttlSeconds * 1000) : null;
			const entry = await CustomCommandDBEntry.findOneAndUpdate(
				{ guildId, userId, key },
				{ $set: { value: normalized, expiresAt, updatedAt: new Date() } },
				{ upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
			);
			return toSDictEntry(entry);
		},

		async del(userId, key) {
			await CustomCommandDBEntry.deleteOne({ guildId, userId, key });
			return true;
		},

		async delById(userId, id) {
			await CustomCommandDBEntry.deleteOne({ guildId, userId, _id: id });
			return true;
		},

		async incr(userId, key, incrBy) {
			const current = await CustomCommandDBEntry.findOne({ guildId, userId, key }).lean();
			let base = 0;
			if (current && !isExpired(current)) {
				const parsed = Number(current.value);
				base = Number.isNaN(parsed) ? 0 : parsed;
			}
			const next = base + (Number(incrBy) || 0);
			await CustomCommandDBEntry.findOneAndUpdate(
				{ guildId, userId, key },
				{ $set: { value: next, updatedAt: new Date() } },
				{ upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
			);
			return next;
		},

		async count(userId, pattern) {
			const query = { guildId };
			if (userId != null) query.userId = userId;
			if (pattern != null) {
				const regex = patternToRegExp(pattern);
				query.key = { $regex: regex };
			}
			return CustomCommandDBEntry.countDocuments(query);
		},

		async getPattern(userId, pattern, amount, nSkip) {
			return this.queryByPattern(userId, pattern, amount, nSkip, 1);
		},

		async getPatternReverse(userId, pattern, amount, nSkip) {
			return this.queryByPattern(userId, pattern, amount, nSkip, -1);
		},

		async queryByPattern(userId, pattern, amount, nSkip, sortDir) {
			const query = { guildId };
			if (userId != null) query.userId = userId;
			if (pattern != null) query.key = { $regex: patternToRegExp(pattern) };
			const rows = await CustomCommandDBEntry.find(query)
				.sort({ key: sortDir })
				.skip(Number(nSkip) || 0)
				.limit(Math.min(Number(amount) || 10, 100))
				.lean();
			return rows.filter(e => !isExpired(e)).map(toSDictEntry);
		},

		async topEntries(pattern, amount, nSkip) {
			return this.querySortedByValue(pattern, amount, nSkip, -1);
		},

		async bottomEntries(pattern, amount, nSkip) {
			return this.querySortedByValue(pattern, amount, nSkip, 1);
		},

		async querySortedByValue(pattern, amount, nSkip, sortDir) {
			const query = { guildId };
			if (pattern != null) query.key = { $regex: patternToRegExp(pattern) };
			const rows = await CustomCommandDBEntry.find(query)
				.sort({ value: sortDir, _id: sortDir })
				.skip(Number(nSkip) || 0)
				.limit(Math.min(Number(amount) || 10, 100))
				.lean();
			return rows.filter(e => !isExpired(e)).map(toSDictEntry);
		},

		async delMultiple(query, amount, nSkip) {
			const q = { guildId };
			if (query.userID != null) q.userId = query.userID;
			if (query.pattern != null) q.key = { $regex: patternToRegExp(query.pattern) };
			const rows = await CustomCommandDBEntry.find(q)
				.sort({ value: query.reverse ? 1 : -1 })
				.skip(Number(nSkip) || 0)
				.limit(Math.min(Number(amount) || 1, 100))
				.select('_id')
				.lean();
			const ids = rows.map(r => r._id);
			if (ids.length > 0) await CustomCommandDBEntry.deleteMany({ _id: { $in: ids } });
			return ids.length;
		},

		async rank(query, userId, key) {
			const q = { guildId };
			if (query.userID != null) q.userId = query.userID;
			if (query.pattern != null) q.key = { $regex: patternToRegExp(query.pattern) };
			const target = await CustomCommandDBEntry.findOne({ ...q, userId, key }).lean();
			if (!target || isExpired(target)) return 0;
			const targetVal = Number(target.value);
			const comparison = query.reverse
				? { $lt: targetVal }
				: { $gt: targetVal };
			const count = await CustomCommandDBEntry.countDocuments({ ...q, value: comparison });
			return count + 1;
		},
	};
}

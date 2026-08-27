// YAGPDB-compatible template function library for Blueberry custom commands.
// Pure functions are exported separately; createContextFunctions(ctx) binds
// guild/member/channel/database operations to the current execution context.
import { createHash } from 'node:crypto';
import logger from '../logger.js';
import { emojis } from '../emoji.js';
import { CSlice, SDict, makeSDict, TemplateRuntimeError, isTruthy, fmtString, Executor, getBuiltinFunctions } from './engine.js';

// ---------------------------------------------------------------------------
// Math
// ---------------------------------------------------------------------------

function numeric(x, name) {
	const n = typeof x === 'number' ? x : Number(x);
	if (Number.isNaN(n)) throw new TemplateRuntimeError(`${name}: invalid number`);
	return n;
}

const mathFunctions = {
	add(...args) {
		return args.reduce((a, b) => numeric(a, 'add') + numeric(b, 'add'), 0);
	},
	sub(a, b, ...rest) {
		let result = numeric(a, 'sub') - numeric(b, 'sub');
		for (const r of rest) result -= numeric(r, 'sub');
		return result;
	},
	mult(...args) {
		return args.reduce((a, b) => numeric(a, 'mult') * numeric(b, 'mult'), 1);
	},
	div(a, b, ...rest) {
		const intMode = Number.isInteger(numeric(a, 'div')) && Number.isInteger(numeric(b, 'div'));
		let result = numeric(a, 'div') / numeric(b, 'div');
		for (const r of rest) result /= numeric(r, 'div');
		return intMode ? Math.trunc(result) : result;
	},
	fdiv(a, b, ...rest) {
		let result = numeric(a, 'fdiv') / numeric(b, 'fdiv');
		for (const r of rest) result /= numeric(r, 'fdiv');
		return result;
	},
	mod(a, b) {
		return numeric(a, 'mod') % numeric(b, 'mod');
	},
	pow(a, b) {
		return Math.pow(numeric(a, 'pow'), numeric(b, 'pow'));
	},
	sqrt(x) {
		return Math.sqrt(numeric(x, 'sqrt'));
	},
	cbrt(x) {
		return Math.cbrt(numeric(x, 'cbrt'));
	},
	abs(x) {
		return Math.abs(numeric(x, 'abs'));
	},
	min(...args) {
		return Math.min(...args.map(a => numeric(a, 'min')));
	},
	max(...args) {
		return Math.max(...args.map(a => numeric(a, 'max')));
	},
	randInt(...args) {
		if (args.length === 1) return Math.floor(Math.random() * numeric(args[0], 'randInt'));
		const start = numeric(args[0], 'randInt');
		const stop = numeric(args[1], 'randInt');
		return start + Math.floor(Math.random() * (stop - start));
	},
	round(x) {
		return Math.round(numeric(x, 'round'));
	},
	roundCeil(x) {
		return Math.ceil(numeric(x, 'roundCeil'));
	},
	roundFloor(x) {
		return Math.floor(numeric(x, 'roundFloor'));
	},
	roundEven(x) {
		const n = numeric(x, 'roundEven');
		const r = Math.round(n);
		return Math.abs(n - r) === 0.5 && r % 2 !== 0 ? r - 1 : r;
	},
	log(x, base) {
		const n = numeric(x, 'log');
		if (base === undefined || base === null) return Math.log(n);
		return Math.log(n) / Math.log(numeric(base, 'log'));
	},
	mathConst(name) {
		const constants = { pi: Math.PI, e: Math.E, sqrt2: Math.SQRT2, ln2: Math.LN2, ln10: Math.LN10 };
		if (name in constants) return constants[name];
		throw new TemplateRuntimeError(`unknown math constant "${name}"`);
	},
	bitwiseAnd(...args) {
		return args.reduce((a, b) => numeric(a, 'bitwiseAnd') & numeric(b, 'bitwiseAnd'));
	},
	bitwiseOr(...args) {
		return args.reduce((a, b) => numeric(a, 'bitwiseOr') | numeric(b, 'bitwiseOr'));
	},
	bitwiseXor(a, b) {
		return numeric(a, 'bitwiseXor') ^ numeric(b, 'bitwiseXor');
	},
	bitwiseNot(a) {
		return ~numeric(a, 'bitwiseNot');
	},
	bitwiseAndNot(a, b) {
		return numeric(a, 'bitwiseAndNot') & ~numeric(b, 'bitwiseAndNot');
	},
	bitwiseLeftShift(a, b) {
		return numeric(a, 'bitwiseLeftShift') << numeric(b, 'bitwiseLeftShift');
	},
	bitwiseRightShift(a, b) {
		return numeric(a, 'bitwiseRightShift') >> numeric(b, 'bitwiseRightShift');
	},
};

// ---------------------------------------------------------------------------
// Strings
// ---------------------------------------------------------------------------

const stringFunctions = {
	upper(s) {
		return String(s ?? '').toUpperCase();
	},
	lower(s) {
		return String(s ?? '').toLowerCase();
	},
	title(s) {
		return String(s ?? '').replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
	},
	trim(s, cutset) {
		const str = String(s ?? '');
		if (cutset === undefined || cutset === null) return str.trim();
		const chars = String(cutset);
		const re = new RegExp(`^[${escapeRegExp(chars)}]+|[${escapeRegExp(chars)}]+$`, 'g');
		return str.replace(re, '');
	},
	trimPrefix(s, prefix) {
		const str = String(s ?? '');
		const p = String(prefix ?? '');
		return str.startsWith(p) ? str.slice(p.length) : str;
	},
	trimSuffix(s, suffix) {
		const str = String(s ?? '');
		const suf = String(suffix ?? '');
		return str.endsWith(suf) ? str.slice(0, str.length - suf.length) : str;
	},
	split(s, sep) {
		return new CSlice(...String(s ?? '').split(String(sep ?? '')));
	},
	joinStr(sep, slice) {
		if (slice == null) return '';
		const arr = Array.from(slice ?? []);
		return arr.join(String(sep ?? ''));
	},
	replace(s, old, replacement) {
		return String(s ?? '').split(String(old)).join(String(replacement));
	},
	replaceRegex(s, pattern, replacement) {
		const re = new RegExp(pattern, 'g');
		return String(s ?? '').replace(re, String(replacement));
	},
	contains(s, substr) {
		return String(s ?? '').includes(String(substr ?? ''));
	},
	hasPrefix(s, prefix) {
		return String(s ?? '').startsWith(String(prefix ?? ''));
	},
	hasSuffix(s, suffix) {
		return String(s ?? '').endsWith(String(suffix ?? ''));
	},
	substring(s, start, end) {
		return String(s ?? '').slice(Number(start ?? 0), end === undefined || end === null ? undefined : Number(end));
	},
	str(v) {
		return fmtString(v);
	},
	toString(v) {
		return fmtString(v);
	},
	toInt(v) {
		if (typeof v === 'boolean') return v ? 1 : 0;
		return Math.trunc(Number(v));
	},
	toInt64(v) {
		if (typeof v === 'boolean') return v ? 1 : 0;
		return Math.trunc(Number(v));
	},
	toFloat(v) {
		if (typeof v === 'boolean') return v ? 1 : 0;
		return Number(v);
	},
	toStr(v) {
		return fmtString(v);
	},
	toBool(v) {
		return isTruthy(v);
	},
	parseInt(s, base) {
		return parseInt(String(s ?? ''), base || 10);
	},
	toDuration(s) {
		const str = String(s ?? '');
		const m = /^(\d+)(ms|s|m|h|d|w)?$/.exec(str.trim());
		if (!m) return Number(str) || 0;
		const value = Number(m[1]);
		const unit = m[2] || 's';
		const factors = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
		return value * factors[unit];
	},
};

function escapeRegExp(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Collections / type constructors
// ---------------------------------------------------------------------------

const collectionFunctions = {
	cslice(...args) {
		return new CSlice(...args);
	},
	sdict(...args) {
		return makeSDict(args);
	},
	dict(...args) {
		return makeSDict(args);
	},
	cstringDict(...args) {
		return makeSDict(args);
	},
	seq(...args) {
		const start = args.length >= 2 ? Math.trunc(Number(args[0])) : 0;
		const stop = args.length >= 2 ? Math.trunc(Number(args[1])) : Math.trunc(Number(args[0]));
		const step = args.length >= 3 ? Math.trunc(Number(args[2])) : 1;
		const out = new CSlice();
		if (step === 0) return out;
		if (step > 0) for (let i = start; i < stop; i += step) out.push(i);
		else for (let i = start; i > stop; i += step) out.push(i);
		if (out.length > 10_000) throw new TemplateRuntimeError('seq exceeds 10000 elements');
		return out;
	},
	shuffle(slice) {
		const arr = Array.from(slice ?? []);
		for (let i = arr.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[arr[i], arr[j]] = [arr[j], arr[i]];
		}
		return new CSlice(...arr);
	},
	randomChoice(slice) {
		const arr = Array.from(slice ?? []);
		if (arr.length === 0) return null;
		return arr[Math.floor(Math.random() * arr.length)];
	},
	sort(...args) {
		// sort <slice> or sort <slice> <true|false> (true = descending)
		const arr = args.length >= 1 ? Array.from(args[0] ?? []) : args;
		const descending = args.length >= 2 && isTruthy(args[1]);
		arr.sort((a, b) => {
			const an = Number(a);
			const bn = Number(b);
			if (!Number.isNaN(an) && !Number.isNaN(bn)) return descending ? bn - an : an - bn;
			return descending ? String(b).localeCompare(String(a)) : String(a).localeCompare(String(b));
		});
		return new CSlice(...arr);
	},
	append(slice, ...values) {
		const out = new CSlice(...(slice ?? []));
		out.push(...values);
		return out;
	},
	appendSlice(slice, extra) {
		const out = new CSlice(...(slice ?? []));
		if (extra) out.push(...extra);
		return out;
	},
	in(sequence, value) {
		if (typeof sequence === 'string') return sequence.includes(String(value));
		return Array.from(sequence ?? []).some(el => String(el) === String(value));
	},
	inFold(sequence, value) {
		const needle = String(value).toLowerCase();
		if (typeof sequence === 'string') return sequence.toLowerCase().includes(needle);
		return Array.from(sequence ?? []).some(el => String(el).toLowerCase() === needle);
	},
};

// ---------------------------------------------------------------------------
// Encoding / decoding
// ---------------------------------------------------------------------------

const encodingFunctions = {
	json(value, indent) {
		if (value instanceof SDict) value = value.toJSON();
		return indent ? JSON.stringify(value, null, 4) : JSON.stringify(value);
	},
	jsonToSdict(str) {
		try {
			const parsed = JSON.parse(String(str));
			return new SDict(Object.entries(parsed ?? {}));
		}
		catch (e) {
			throw new TemplateRuntimeError(`jsonToSdict: invalid JSON: ${e.message}`);
		}
	},
	encodeBase64(str) {
		return Buffer.from(String(str ?? ''), 'utf8').toString('base64');
	},
	decodeBase64(str) {
		return Buffer.from(String(str ?? ''), 'base64').toString('utf8');
	},
	hash(str) {
		return createHash('sha256').update(String(str ?? '')).digest('hex');
	},
};

// ---------------------------------------------------------------------------
// Regex
// ---------------------------------------------------------------------------

const regexFunctions = {
	reMatch(pattern, str) {
		return new RegExp(pattern).test(String(str ?? ''));
	},
	reFind(pattern, str) {
		const m = new RegExp(pattern).exec(String(str ?? ''));
		return m ? m[0] : '';
	},
	reFindAll(pattern, str) {
		const matches = String(str ?? '').match(new RegExp(pattern, 'g'));
		return new CSlice(...(matches ?? []));
	},
	reReplace(pattern, str, replacement) {
		return String(str ?? '').replace(new RegExp(pattern, 'g'), String(replacement ?? ''));
	},
	reSplit(pattern, str) {
		return new CSlice(...String(str ?? '').split(new RegExp(pattern)));
	},
	regexQuoteMeta(str) {
		return escapeRegExp(String(str ?? ''));
	},
};

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

const timeFunctions = {
	currentTime() {
		return new Date();
	},
	unixToTime(unix) {
		const n = Number(unix);
		return new Date(n < 1e12 ? n * 1000 : n);
	},
	formatTime(time, layout) {
		const d = time instanceof Date ? time : new Date(time);
		return formatGoTime(d, layout);
	},
	formatTimeDelta(time) {
		const d = time instanceof Date ? time : new Date(time);
		const diff = Math.abs(d.getTime() - Date.now());
		const units = [
			[3_600_000, 'hour'],
			[60_000, 'minute'],
			[1000, 'second'],
		];
		for (const [ms, name] of units) {
			const count = Math.floor(diff / ms);
			if (count > 0) return `${count} ${name}${count !== 1 ? 's' : ''} ago`;
		}
		return 'just now';
	},
	newDate(year, month, day, hour, minute, second) {
		return new Date(year, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0, second ?? 0);
	},
	addDate(time, ...args) {
		const d = time instanceof Date ? new Date(time) : new Date();
		const years = Number(args[0] ?? 0);
		const months = Number(args[1] ?? 0);
		const days = Number(args[2] ?? 0);
		const hours = Number(args[3] ?? 0);
		d.setFullYear(d.getFullYear() + years);
		d.setMonth(d.getMonth() + months);
		d.setDate(d.getDate() + days);
		d.setHours(d.getHours() + hours);
		return d;
	},
	monthName(month) {
		return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(month) - 1] ?? '';
	},
	weekdayName(day) {
		return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][Number(day)] ?? '';
	},
};

function formatGoTime(d, layout) {
	if (!layout) return d.toISOString();
	const replacers = {
		'2006-01-02 15:04:05 -0700': () => d.toISOString().replace('T', ' ').slice(0, 19) + ' ' + formatOffset(d),
		'January': () => d.toLocaleString('en-US', { month: 'long' }),
		'January 2, 2006': () => d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
		'Monday': () => d.toLocaleString('en-US', { weekday: 'long' }),
		'Mon': () => d.toLocaleString('en-US', { weekday: 'short' }),
		'15:04': () => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
		'3:04 PM': () => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
		'2006': () => String(d.getFullYear()),
		'01': () => String(d.getMonth() + 1).padStart(2, '0'),
		'02': () => String(d.getDate()).padStart(2, '0'),
	};
	for (const [k, fn] of Object.entries(replacers)) {
		if (layout.includes(k)) return fn();
	}
	return layout;
}

function formatOffset(d) {
	const offset = -d.getTimezoneOffset();
	const sign = offset >= 0 ? '+' : '-';
	const abs = Math.abs(offset);
	return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}${String(abs % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Mentions (pure formatting)
// ---------------------------------------------------------------------------

const mentionFunctions = {
	mentionEveryone() {
		return '@everyone';
	},
	mentionHere() {
		return '@here';
	},
	mentionRoleID(id) {
		return `<@&${id}>`;
	},
	mentionChannelID(id) {
		return `<#${id}>`;
	},
	mentionUsername(id) {
		return `<@${id}>`;
	},
};

// ---------------------------------------------------------------------------
// Misc pure functions
// ---------------------------------------------------------------------------

const miscPureFunctions = {
	emoji(name) {
		return emojis[name] ?? `:${name}:`;
	},
	sleep(seconds) {
		const ms = Math.min(Number(seconds ?? 0) * 1000, 60_000);
		return new Promise(resolve => {
			setTimeout(resolve, Math.max(0, ms));
		});
	},
	throw(...args) {
		throw new TemplateRuntimeError(fmtString(args[0]));
	},
};

export const PURE_FUNCTIONS = {
	...mathFunctions,
	...stringFunctions,
	...collectionFunctions,
	...encodingFunctions,
	...regexFunctions,
	...timeFunctions,
	...mentionFunctions,
	...miscPureFunctions,
};

// ---------------------------------------------------------------------------
// Context-bound functions
// ---------------------------------------------------------------------------

function resolveChannel(ctx, target) {
	if (target == null || target === '') return ctx.channel ?? null;
	if (typeof target === 'object' && target != null && target.id) return target;
	const id = String(target);
	if (/^\d+$/.test(id)) return ctx.client.channels.cache.get(id) ?? null;
	const name = String(target).replace(/^#/, '');
	if (!ctx.guild) return null;
	return ctx.guild.channels.cache.find(c => c.name === name) ?? null;
}

async function ensureMember(ctx, target) {
	const id = String(target).replace(/[<@!>]/g, '');
	if (!ctx.guild) return null;
	try {
		return await ctx.guild.members.fetch(id);
	}
	catch {
		return null;
	}
}

function resolveRole(ctx, target) {
	if (target == null) return null;
	if (typeof target === 'object' && target != null && target.id) return target;
	const id = String(target).replace(/[<@&>]/g, '');
	if (!ctx.guild) return null;
	if (/^\d+$/.test(id)) return ctx.guild.roles.cache.get(id) ?? null;
	return ctx.guild.roles.cache.find(r => r.name.toLowerCase() === id.toLowerCase()) ?? null;
}

export function createContextFunctions(ctx) {
	const db = ctx.db;

	const contextFunctions = {
		// ---- member ----
		async getMember(target) {
			const id = String(target ?? '').replace(/[<@!>]/g, '');
			if (!ctx.guild) return null;
			try {
				return await ctx.guild.members.fetch(id);
			}
			catch {
				return null;
			}
		},
		async getUser(target) {
			const id = String(target ?? '').replace(/[<@!>]/g, '');
			try {
				return await ctx.client.users.fetch(id);
			}
			catch {
				return null;
			}
		},
		async getUserID(target) {
			const u = await contextFunctions.getUser(target);
			return u ? u.id : '';
		},
		async getMemberVoiceState(target) {
			const member = await ensureMember(ctx, target ?? ctx.member?.id);
			return member?.voice ?? null;
		},
		async hasRole(role) {
			const r = resolveRole(ctx, role);
			return ctx.member?.roles?.cache?.has(r?.id ?? '') ?? false;
		},
		async hasRoleID(roleID) {
			return ctx.member?.roles?.cache?.has(String(roleID)) ?? false;
		},
		async hasRoleName(roleName) {
			const r = resolveRole(ctx, roleName);
			return ctx.member?.roles?.cache?.has(r?.id ?? '') ?? false;
		},
		async targetHasRole(target, role) {
			const member = await ensureMember(ctx, target);
			const r = resolveRole(ctx, role);
			return member?.roles?.cache?.has(r?.id ?? '') ?? false;
		},
		async targetHasRoleID(target, roleID) {
			const member = await ensureMember(ctx, target);
			return member?.roles?.cache?.has(String(roleID)) ?? false;
		},
		async targetHasRoleName(target, roleName) {
			const member = await ensureMember(ctx, target);
			const r = resolveRole(ctx, roleName);
			return member?.roles?.cache?.has(r?.id ?? '') ?? false;
		},
		async addRoleID(roleID, target) {
			const member = await ensureMember(ctx, target ?? ctx.member?.id);
			const role = resolveRole(ctx, roleID);
			if (!member || !role) return;
			try {
				await member.roles.add(role);
			}
			catch (e) {
				logger.warn(`addRoleID failed: ${e.message}`);
			}
		},
		async addRoleName(roleName, target) {
			const role = resolveRole(ctx, roleName);
			if (role) await contextFunctions.addRoleID(role.id, target ?? ctx.member?.id);
		},
		async removeRoleID(roleID, target) {
			const member = await ensureMember(ctx, target ?? ctx.member?.id);
			const role = resolveRole(ctx, roleID);
			if (!member || !role) return;
			try {
				await member.roles.remove(role);
			}
			catch (e) {
				logger.warn(`removeRoleID failed: ${e.message}`);
			}
		},
		async removeRoleName(roleName, target) {
			const role = resolveRole(ctx, roleName);
			if (role) await contextFunctions.removeRoleID(role.id, target ?? ctx.member?.id);
		},
		async editNickname(nick) {
			if (!ctx.member) return;
			try {
				await ctx.member.setNickname(String(nick ?? ''));
			}
			catch (e) {
				logger.warn(`editNickname failed: ${e.message}`);
			}
		},
		async memberAbove(a, b) {
			const ma = await ensureMember(ctx, a);
			const mb = await ensureMember(ctx, b);
			if (!ma || !mb) return false;
			return ma.roles.highest.position > mb.roles.highest.position;
		},
		async memberAboveRole(member, role) {
			const m = await ensureMember(ctx, member);
			const r = resolveRole(ctx, role);
			if (!m || !r) return false;
			return m.roles.highest.position > r.position;
		},
		onlineCount() {
			if (!ctx.guild) return 0;
			return ctx.guild.members.cache.filter(m => m.presence?.status === 'online' || m.presence?.status === 'dnd' || m.presence?.status === 'idle').size;
		},
		onlineCountBots() {
			if (!ctx.guild) return 0;
			return ctx.guild.members.cache.filter(m => m.user.bot && (m.presence?.status === 'online' || m.presence?.status === 'dnd' || m.presence?.status === 'idle')).size;
		},

		// ---- roles ----
		getRole(target) {
			return resolveRole(ctx, target);
		},
		getRoles() {
			return ctx.guild ? new CSlice(...ctx.guild.roles.cache.values()) : new CSlice();
		},
		mentionRole(target) {
			const r = resolveRole(ctx, target);
			return r ? `<@&${r.id}>` : '';
		},
		mentionRoleName(target) {
			const r = resolveRole(ctx, target);
			return r ? `<@&${r.id}>` : '';
		},
		async roleAbove(a, b) {
			const ra = resolveRole(ctx, a);
			const rb = resolveRole(ctx, b);
			if (!ra || !rb) return false;
			return ra.position > rb.position;
		},

		// ---- channel ----
		getChannel(target) {
			return resolveChannel(ctx, target);
		},
		getChannelOrThread(target) {
			return resolveChannel(ctx, target);
		},
		getThread(target) {
			return resolveChannel(ctx, target);
		},
		async createThread(channel, messageID, name, isPrivate, autoArchive, invitable) {
			const ch = resolveChannel(ctx, channel);
			if (!ch || !ch.threads) return null;
			try {
				return await ch.threads.create({
					name: String(name),
					startMessage: messageID && String(messageID) !== '0' ? String(messageID) : undefined,
					type: isPrivate ? 12 : 11,
					autoArchiveDuration: Number(autoArchive ?? 10080),
					invitable: Boolean(invitable),
				});
			}
			catch {
				return null;
			}
		},
		async closeThread(thread, lock) {
			const ch = resolveChannel(ctx, thread);
			if (ch?.setArchived) await ch.setArchived(true).catch(ignore);
			if (lock && ch?.setLocked) await ch.setLocked(true).catch(ignore);
			return null;
		},
		async openThread(thread) {
			const ch = resolveChannel(ctx, thread);
			if (ch?.setArchived) await ch.setArchived(false).catch(ignore);
			return null;
		},
		async deleteThread(thread) {
			const ch = resolveChannel(ctx, thread);
			if (ch?.delete) await ch.delete().catch(ignore);
			return null;
		},
		async editChannelName(channel, newName) {
			const ch = resolveChannel(ctx, channel);
			if (ch?.setName) await ch.setName(String(newName)).catch(ignore);
			return null;
		},
		async editChannelTopic(channel, newTopic) {
			const ch = resolveChannel(ctx, channel);
			if (ch?.setTopic) await ch.setTopic(String(newTopic)).catch(ignore);
			return null;
		},
		async addThreadMember(thread, member) {
			const ch = resolveChannel(ctx, thread);
			const m = await ensureMember(ctx, member);
			if (ch?.members?.add && m) await ch.members.add(m).catch(ignore);
			return null;
		},
		async removeThreadMember(thread, member) {
			const ch = resolveChannel(ctx, thread);
			const m = await ensureMember(ctx, member);
			if (ch?.members?.remove && m) await ch.members.remove(m).catch(ignore);
			return null;
		},

		// ---- message ----
		async _sendMessage(target, content) {
			const ch = resolveChannel(ctx, target ?? ctx.channel?.id);
			if (!ch?.send) return null;
			const payload = await buildSendPayload(content, ctx);
			try {
				return await ch.send(payload);
			}
			catch (e) {
				logger.warn(`sendMessage failed: ${e.message}`);
				return null;
			}
		},
		async sendMessage(target, content) {
			await contextFunctions._sendMessage(target, content);
			return '';
		},
		async sendMessageNoEscape(target, content) {
			await contextFunctions._sendMessage(target, content);
			return '';
		},
		async sendMessageRetID(target, content) {
			const msg = await contextFunctions._sendMessage(target, content);
			return msg?.id ?? null;
		},
		async editMessage(channel, messageID, content) {
			const ch = resolveChannel(ctx, channel);
			if (!ch?.messages) return null;
			try {
				const msg = await ch.messages.fetch(String(messageID));
				return await msg.edit(await buildSendPayload(content, ctx));
			}
			catch {
				return null;
			}
		},
		async deleteMessage(channel, messageID, delay) {
			const ch = resolveChannel(ctx, channel);
			if (!ch?.messages) return null;
			try {
				const msg = await ch.messages.fetch(String(messageID));
				const ms = Number(delay ?? 0) * 1000;
				if (ms > 0) setTimeout(() => msg.delete().catch(ignore), Math.min(ms, 86_400_000));
				else await msg.delete().catch(ignore);
			}
			catch {
				return null;
			}
			return null;
		},
		async deleteTrigger(delay) {
			if (!ctx.message?.delete) return null;
			const ms = Number(delay ?? 0) * 1000;
			if (ms > 0) setTimeout(() => ctx.message.delete().catch(ignore), Math.min(ms, 86_400_000));
			else await ctx.message.delete().catch(ignore);
			return null;
		},
		async addReactions(...emojisArr) {
			if (!ctx.message) return null;
			const flat = emojisArr.flat();
			for (const e of flat.slice(0, 20)) {
				try {
					await ctx.message.react(parseEmoji(e));
				}
				catch {
					// ignore failed reactions
				}
			}
			return null;
		},
		async addMessageReactions(channel, messageID, ...emojisArr) {
			const ch = resolveChannel(ctx, channel);
			if (!ch?.messages) return null;
			try {
				const msg = await ch.messages.fetch(String(messageID));
				const flat = emojisArr.flat();
				for (const e of flat.slice(0, 20)) {
					try {
						await msg.react(parseEmoji(e));
					}
					catch {
						// ignore
					}
				}
			}
			catch {
				// ignore
			}
			return null;
		},
		async addResponseReactions(...emojisArr) {
			if (!ctx.responseMessage) return null;
			const flat = emojisArr.flat();
			for (const e of flat.slice(0, 20)) {
				try {
					await ctx.responseMessage.react(parseEmoji(e));
				}
				catch {
					// ignore
				}
			}
			return null;
		},
		async getMessage(channel, messageID) {
			const ch = resolveChannel(ctx, channel);
			if (!ch?.messages) return null;
			try {
				return await ch.messages.fetch(String(messageID));
			}
			catch {
				return null;
			}
		},
		complexMessage(...pairs) {
			const msg = {};
			for (let i = 0; i + 1 < pairs.length; i += 2) {
				const key = String(pairs[i]);
				let value = pairs[i + 1];
				if (value instanceof SDict) value = value.toJSON();
				msg[key] = value;
			}
			return msg;
		},
		complexMessageEdit(...pairs) {
			return contextFunctions.complexMessage(...pairs);
		},

		// ---- components v2 builders ----
		componentBuilder(...pairs) {
			const data = {};
			const builder = {
				__componentsV2: true,
				data,
				Add(key, value) {
					addEntry(builder.data, String(key), value);
					return '';
				},
				AddSlice(key, ...values) {
					for (const value of values) {
						if (Array.isArray(value) || value instanceof CSlice) {
							for (const item of value) addEntry(builder.data, String(key), item);
						}
						else {
							addEntry(builder.data, String(key), value);
						}
					}
					return '';
				},
				Merge(other) {
					const otherData = other?.data ?? (other instanceof SDict ? other.toJSON() : other ?? {});
					for (const key of Object.keys(otherData)) addEntry(builder.data, key, otherData[key]);
					return '';
				},
				Get(key) {
					return builder.data[String(key)];
				},
			};
			// Optional initial key/value pairs: componentBuilder "text" "hi" ...
			if (pairs.length === 1 && pairs[0] instanceof SDict) {
				for (const [key, value] of pairs[0].entries()) addEntry(builder.data, String(key), value);
			}
			else {
				for (let i = 0; i + 1 < pairs.length; i += 2) {
					addEntry(builder.data, String(pairs[i]), pairs[i + 1]);
				}
			}
			return builder;
		},
		cbutton(...pairs) {
			return builderArgs(pairs);
		},
		cmenu(...pairs) {
			return builderArgs(pairs);
		},
		cmodal(...pairs) {
			return builderArgs(pairs);
		},
		ctextDisplay(...pairs) {
			return builderArgs(pairs);
		},
		ctextInput(...pairs) {
			return builderArgs(pairs);
		},
		clabel(...pairs) {
			return builderArgs(pairs);
		},
		ccheckbox(...pairs) {
			return builderArgs(pairs);
		},
		ccheckboxGroup(...pairs) {
			return builderArgs(pairs);
		},
		cradioGroup(...pairs) {
			return builderArgs(pairs);
		},
		cembed(...pairs) {
			const data = pairs.length === 1 && pairs[0] instanceof SDict ? pairs[0].toJSON() : pairsToObject(pairs);
			return { embeds: [data] };
		},

		// ---- database ----
		async dbGet(userID, key) {
			return db.get(userID ?? '0', key);
		},
		async dbSet(userID, key, value) {
			await db.set(userID ?? '0', key, value, null);
			return null;
		},
		async dbSetExpire(userID, key, value, ttl) {
			await db.set(userID ?? '0', key, value, Number(ttl ?? 0));
			return null;
		},
		async dbDel(userID, key) {
			await db.del(userID ?? '0', key);
			return null;
		},
		async dbDelByID(userID, id) {
			await db.delById(userID ?? '0', id);
			return null;
		},
		async dbDelMultiple(query, amount, nSkip) {
			const q = query instanceof SDict ? query.toJSON() : query ?? {};
			return db.delMultiple(q, Number(amount ?? 1), Number(nSkip ?? 0));
		},
		async dbIncr(userID, key, incrBy) {
			return db.incr(userID ?? '0', key, Number(incrBy ?? 1));
		},
		async dbCount(query) {
			if (query instanceof SDict) {
				const q = query.toJSON();
				return db.count(q.userID ?? undefined, q.pattern ?? undefined);
			}
			if (typeof query === 'string') return db.count(undefined, query);
			return db.count(query ?? '0', undefined);
		},
		async dbGetPattern(userID, pattern, amount, nSkip) {
			return db.getPattern(userID ?? '0', pattern, Number(amount ?? 10), Number(nSkip ?? 0));
		},
		async dbGetPatternReverse(userID, pattern, amount, nSkip) {
			return db.getPatternReverse(userID ?? '0', pattern, Number(amount ?? 10), Number(nSkip ?? 0));
		},
		async dbTopEntries(pattern, amount, nSkip) {
			return db.topEntries(pattern, Number(amount ?? 10), Number(nSkip ?? 0));
		},
		async dbBottomEntries(pattern, amount, nSkip) {
			return db.bottomEntries(pattern, Number(amount ?? 10), Number(nSkip ?? 0));
		},
		async dbRank(query, userID, key) {
			const q = query instanceof SDict ? query.toJSON() : query ?? {};
			return db.rank(q, userID ?? '0', key);
		},

		// ---- exec ----
		async execCC(ccID, channel, delay, data) {
			if (!ctx.scheduleExec) return null;
			return ctx.scheduleExec(ccID, channel, delay, data);
		},
		async execTemplate(name, data) {
			return renderTemplateFromAssoc(ctx, name, data);
		},
		async scheduleUniqueCC(ccID, channel, delay, key, data) {
			if (!ctx.scheduleUnique) return null;
			return ctx.scheduleUnique(ccID, channel, delay, key, data);
		},
		async cancelScheduledUniqueCC(ccID, key) {
			if (!ctx.cancelScheduled) return null;
			return ctx.cancelScheduled(ccID, key);
		},
		ephemeralResponse() {
			if (ctx.setEphemeral) ctx.setEphemeral(true);
			return '';
		},
		sendResponse(token, content) {
			if (ctx.sendInteractionResponse) return ctx.sendInteractionResponse(token, content);
			return null;
		},
		sendResponseRetID(token, content) {
			return contextFunctions.sendResponse(token, content);
		},
		sendResponseNoEscape(token, content) {
			return contextFunctions.sendResponse(token, content);
		},
		sendResponseNoEscapeRetID(token, content) {
			return contextFunctions.sendResponse(token, content);
		},
		updateMessage(content) {
			if (ctx.updateMessage) return ctx.updateMessage(content);
			return null;
		},
		updateMessageNoEscape(content) {
			return contextFunctions.updateMessage(content);
		},
		sendModal(modal) {
			if (ctx.sendModalFn) return ctx.sendModalFn(modal);
			return null;
		},
	};

	return { ...PURE_FUNCTIONS, ...contextFunctions };
}

function pairsToObject(pairs) {
	const obj = {};
	for (let i = 0; i + 1 < pairs.length; i += 2) {
		let value = pairs[i + 1];
		if (value instanceof SDict) value = value.toJSON();
		obj[String(pairs[i])] = value;
	}
	return obj;
}

function builderArgs(pairs) {
	// Docs allow either `cbutton "label" "X" ...` or a single sdict:
	// `cbutton (sdict "label" "X" ...)`.
	if (pairs.length === 1 && pairs[0] instanceof SDict) return pairs[0].toJSON();
	return pairsToObject(pairs);
}

// Collection keys accumulate into lists inside the componentBuilder data map.
const BUILDER_COLLECTION_KEYS = new Set(['text', 'section', 'gallery', 'file', 'separator', 'buttons', 'menus', 'container', 'interactive_components']);

function addEntry(data, key, value) {
	if (BUILDER_COLLECTION_KEYS.has(key)) {
		const list = Array.isArray(value) || value instanceof CSlice ? Array.from(value) : [value];
		data[key] = [...(data[key] ?? []), ...list];
	}
	else {
		data[key] = value;
	}
}

function parseEmoji(e) {
	if (typeof e !== 'string') return e;
	const m = /^(\d+)$/.exec(e);
	if (m) return { id: e };
	return e;
}

const ignore = () => undefined;

async function buildSendPayload(content, ctx) {
	if (content == null) return {};
	if (typeof content === 'string') return { content };
	if (typeof content !== 'object') return { content: fmtString(content) };

	// Everything object-based (componentBuilder, complexMessage, cembed) is
	// delegated to the unified runner builder which handles V2, classic rows,
	// embeds, and meta keys.
	if (ctx.buildV2) {
		return await ctx.buildV2(content);
	}

	const payload = {};
	if (content.content != null) payload.content = fmtString(content.content);
	return payload;
}

async function renderTemplateFromAssoc(ctx, name, data) {
	if (!ctx.assocTemplates || !ctx.assocTemplates.has(name)) {
		throw new TemplateRuntimeError(`template "${name}" not defined`);
	}
	const executor = new Executor({ ...getBuiltinFunctions(), ...createContextFunctions(ctx) });
	return executor.execute({ nodes: ctx.assocTemplates.get(name), tmpls: ctx.assocTemplates }, data);
}

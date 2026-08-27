// Schedule math for custom-command interval and crontab triggers.
// Uses UTC only, mirroring YAGPDB. Standard 5-field cron (no @-shortnames,
// no "7" for Sunday, per YAGPDB docs).

const WEEKDAY_NAMES = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const MONTH_NAMES = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/**
 * Converts an interval config to milliseconds.
 * @param {{unit?: 'minutes'|'hours', value?: number}} interval
 * @returns {number}
 */
export function intervalToMs(interval) {
	const unit = interval?.unit ?? 'hours';
	const value = Number(interval?.value ?? 1);
	const factors = { minutes: 60_000, hours: 3_600_000 };
	return value * (factors[unit] ?? factors.hours);
}

/**
 * Parses a standard 5-field cron expression into an object of allowed sets.
 * @param {string} expression
 * @returns {{minute:Set<number>, hour:Set<number>, dom:Set<number>, month:Set<number>, dow:Set<number>}}
 */
export function parseCronExpression(expression) {
	const fields = String(expression ?? '').trim().split(/\s+/);
	if (fields.length !== 5) {
		throw new Error('Cron expressions must have exactly 5 space-separated fields');
	}
	const [minField, hourField, domField, monthField, dowField] = fields;
	return {
		minute: parseField(minField, 0, 59),
		hour: parseField(hourField, 0, 23),
		dom: parseField(domField, 1, 31, null),
		month: parseField(monthField, 1, 12, MONTH_NAMES),
		dow: parseField(dowField, 0, 6, WEEKDAY_NAMES),
	};
}

function parseField(field, min, max, names = null) {
	const result = new Set();
	if (field === '*') {
		for (let i = min; i <= max; i++) result.add(i);
		return result;
	}

	for (const part of field.split(',')) {
		const stepMatch = /^(.+)\/(\d+)$/.exec(part);
		let step = 1;
		let rangePart = part;
		if (stepMatch) {
			rangePart = stepMatch[1];
			step = Math.max(1, parseInt(stepMatch[2], 10));
		}

		if (rangePart === '*') {
			for (let i = min; i <= max; i += step) result.add(i);
			continue;
		}

		const rangeMatch = /^(\d+|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|SUN|MON|TUE|WED|THU|FRI|SAT)(?:-(\d+|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|SUN|MON|TUE|WED|THU|FRI|SAT))?$/i.exec(rangePart);
		if (!rangeMatch) {
			throw new Error(`Invalid cron field value "${rangePart}"`);
		}
		const lower = toNumber(rangeMatch[1], names) ?? min;
		const upper = rangeMatch[2] ? toNumber(rangeMatch[2], names) : lower;
		if (upper < lower) {
			throw new Error(`Invalid cron range "${rangePart}"`);
		}
		for (let i = lower; i <= upper; i += step) {
			if (i >= min && i <= max) result.add(i);
		}
	}
	if (result.size === 0) throw new Error(`Invalid cron field "${field}"`);
	return result;
}

function toNumber(value, names) {
	if (/^\d+$/.test(value)) {
		const n = parseInt(value, 10);
		// YAGPDB rejects 7 for Sunday.
		if (names === WEEKDAY_NAMES && n === 7) throw new Error('"7" is not a valid Sunday value in cron');
		return n;
	}
	return names?.[String(value).toLowerCase()] ?? null;
}

/**
 * Computes the interval (in ms) between two successive matches of a cron
 * expression. Approximated by scanning a full year starting from the
 * next-hour boundary. Throws if the interval is effectively zero.
 * @param {string} expression
 * @returns {number}
 */
export function cronIntervalMs(expression) {
	const spec = parseCronExpression(expression);
	const now = new Date();
	const first = findNextCron(spec, now, undefined);
	const second = findNextCron(spec, first, undefined);
	return second.getTime() - first.getTime();
}

/**
 * Computes the next time a cron spec matches at or after `from`.
 * @param {object} spec - parsed cron spec (or a string to parse)
 * @param {Date} from
 * @param {Date} [scanEnd]
 * @returns {Date|null}
 */
export function findNextCron(spec, from, scanEnd = null) {
	if (typeof spec === 'string') spec = parseCronExpression(spec);
	const end = scanEnd ?? new Date(from.getTime() + 370 * 86_400_000);
	// Start from the next minute strictly after `from`.
	const cursor = new Date(from.getTime() + 60_000);
	cursor.setSeconds(0, 0);

	let t = cursor.getTime();
	while (t <= end.getTime()) {
		const c = new Date(t);
		if (spec.month.has(c.getUTCMonth() + 1) &&
			spec.dom.has(c.getUTCDate()) &&
			spec.dow.has(c.getUTCDay()) &&
			spec.hour.has(c.getUTCHours()) &&
			spec.minute.has(c.getUTCMinutes())) {
			return c;
		}
		t += 60_000;
	}
	return null;
}

/**
 * Computes the next fire time for a scheduled custom command.
 * @param {{triggerType?: string, interval?: object, cron?: object}} cc
 * @param {Date} from
 * @returns {Date|null}
 */
export function computeNextFiredAt(cc, from = new Date()) {
	if (cc.triggerType === 'interval') {
		return new Date(from.getTime() + intervalToMs(cc.interval));
	}
	if (cc.triggerType === 'crontab') {
		return findNextCron(cc.cron?.expression, from);
	}
	return null;
}
import Announcement from '../../models/Announcement.js';
import config from '../../config.js';

export function getAnnouncementLimits() {
	return {
		maxAnnouncements: config.announcements?.maxAnnouncements ?? 5,
		maxLabelLength: config.announcements?.maxLabelLength ?? 50,
		maxMessageLength: config.announcements?.maxMessageLength ?? 4000,
		pollIntervalSeconds: config.announcements?.pollIntervalSeconds ?? 60,
	};
}

export function serializeAnnouncement(announcement) {
	const plain = typeof announcement.toObject === 'function' ? announcement.toObject() : announcement;
	return plain;
}

export async function getAnnouncements(guildId) {
	return Announcement.find({ guildId }).sort({ createdAt: 1 }).lean();
}

export async function getAnnouncement(guildId, announcementId) {
	return Announcement.findOne({ guildId, _id: announcementId });
}

export async function addAnnouncement(guildId, data) {
	const limit = getAnnouncementLimits().maxAnnouncements;
	const existing = await Announcement.countDocuments({ guildId });
	if (existing >= limit) {
		const error = new Error('Announcement limit reached');
		error.code = 'ANNOUNCEMENT_LIMIT';
		error.limit = limit;
		throw error;
	}

	const announcement = await Announcement.create({
		guildId,
		...data,
		nextRunAt: computeNextRunAt(data),
	});
	return serializeAnnouncement(announcement);
}

export async function updateAnnouncement(guildId, announcementId, updates) {
	const announcement = await Announcement.findOne({ guildId, _id: announcementId });
	if (!announcement) return null;

	const scheduleChanged = ['frequency', 'hour', 'minute', 'weekday', 'dayOfMonth', 'utcOffsetMinutes'].some(key => key in updates);

	announcement.set(updates);
	if (announcement.enabled) {
		if (scheduleChanged || !announcement.nextRunAt) {
			announcement.nextRunAt = computeNextRunAt(announcement);
		}
	}
	else {
		announcement.nextRunAt = null;
	}

	await announcement.save();
	return serializeAnnouncement(announcement);
}

export async function removeAnnouncement(guildId, announcementId) {
	const announcement = await Announcement.findOneAndDelete({ guildId, _id: announcementId });
	return announcement ? serializeAnnouncement(announcement) : null;
}

/**
 * Computes the next scheduled run for an announcement using a fixed UTC
 * offset rather than a named timezone, keeping the math dependency-less.
 * @param {{frequency: string, hour: number, minute: number, weekday?: number, dayOfMonth?: number, utcOffsetMinutes?: number}} announcement
 * @param {Date} [from]
 * @returns {Date|null}
 */
export function computeNextRunAt(announcement, from = new Date()) {
	const offset = Number(announcement.utcOffsetMinutes ?? 0) * 60_000;
	const { hour, minute } = announcement;

	for (let dayStep = 0; dayStep < 370; dayStep++) {
		const shifted = new Date(from.getTime() + offset + dayStep * 86_400_000);
		const matchesFrequency =
			announcement.frequency === 'daily' ||
			(announcement.frequency === 'weekly' && shifted.getUTCDay() === Number(announcement.weekday)) ||
			(announcement.frequency === 'monthly' && shifted.getUTCDate() === Number(announcement.dayOfMonth));
		if (!matchesFrequency) continue;

		const candidate = new Date(Date.UTC(
			shifted.getUTCFullYear(),
			shifted.getUTCMonth(),
			shifted.getUTCDate(),
			hour,
			minute,
			0,
			0,
		) - offset);
		if (candidate.getTime() > from.getTime()) return candidate;
	}
	return null;
}
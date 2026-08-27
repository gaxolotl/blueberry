import { ContainerBuilder, MessageFlags } from 'discord.js';
import Announcement from '../../models/Announcement.js';
import config from '../../config.js';
import logger from '../logger.js';
import { getAccentColor } from '../color.js';
import { buildComponentsV2Template } from '../componentsV2Template.js';
import { computeNextRunAt } from './config.js';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function renderTemplateText(value, variables) {
	let result = String(value);
	for (const [key, replacement] of Object.entries(variables)) {
		result = result.replaceAll(`{${key}}`, replacement);
	}
	return result;
}

/**
 * Builds the dynamic variables available inside announcement templates.
 * Dates reflect the announcement's configured UTC offset.
 * @param {import('discord.js').Guild} guild
 * @param {object} announcement
 * @returns {Record<string, string>}
 */
function buildVariables(guild, announcement) {
	const now = new Date();
	const offset = Number(announcement.utcOffsetMinutes ?? 0) * 60_000;
	const shifted = new Date(now.getTime() + offset);
	const pad = number => String(number).padStart(2, '0');

	return {
		server: guild.name,
		year: String(shifted.getUTCFullYear()),
		month: MONTHS[shifted.getUTCMonth()],
		monthShort: MONTHS[shifted.getUTCMonth()].slice(0, 3),
		day: String(shifted.getUTCDate()).padStart(2, '0'),
		weekday: WEEKDAYS[shifted.getUTCDay()],
		time: `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`,
		announcement: announcement.label,
		runs: String(announcement.runCount + 1),
	};
}

/**
 * Sends a single announcement to its configured channel.
 * @param {import('discord.js').Guild} guild
 * @param {object} announcement
 */
async function sendAnnouncement(guild, announcement) {
	const channel = await guild.channels.fetch(announcement.channelId).catch(() => null);
	if (!channel?.isTextBased()) throw new Error(`Announcement channel is unavailable or not text-based (${announcement.channelId})`);

	const variables = buildVariables(guild, announcement);
	const guildId = guild.id;

	const components = announcement.template
		? await buildComponentsV2Template(guildId, announcement.template, variables)
		: [new ContainerBuilder()
			.setAccentColor(await getAccentColor(guildId))
			.addTextDisplayComponents(textDisplay => textDisplay.setContent(renderTemplateText(announcement.message, variables)))];

	await channel.send({
		components,
		flags: MessageFlags.IsComponentsV2,
		allowedMentions: { roles: announcement.mentionRoleId ? [announcement.mentionRoleId] : [], parse: [] },
	});
}

/**
 * Delivers every scheduled announcement that is now due.
 * @param {import('discord.js').Client} client
 */
async function processDueAnnouncements(client) {
	const now = new Date();
	const due = await Announcement.find({
		enabled: true,
		channelId: { $ne: null },
		nextRunAt: { $lte: now },
	}).limit(50);

	for (const announcement of due) {
		try {
			const guild = await client.guilds.fetch(announcement.guildId).catch(() => null);
			if (!guild) {
				throw new Error(`Guild ${announcement.guildId} is unavailable`);
			}

			await sendAnnouncement(guild, announcement);
			announcement.lastRunAt = new Date();
			announcement.runCount += 1;
			announcement.nextRunAt = computeNextRunAt(announcement);
			await announcement.save();
		}
		catch (error) {
			logger.error(`Failed to deliver announcement ${announcement.label} for guild ${announcement.guildId}:`, error);
			announcement.nextRunAt = new Date(Date.now() + 10 * 60 * 1000);
			await announcement.save();
		}
	}
}

/**
 * Starts the recurring announcement scheduler.
 * @param {import('discord.js').Client} client
 */
export function scheduleAnnouncementPolling(client) {
	const pollIntervalMs = (config.announcements?.pollIntervalSeconds ?? 60) * 1000;

	const poll = async () => {
		try {
			await processDueAnnouncements(client);
		}
		catch (error) {
			logger.error('Failed to process due announcements:', error);
		}
	};

	poll();
	setInterval(poll, pollIntervalMs);
}
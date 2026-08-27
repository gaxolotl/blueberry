// Interval + crontab scheduler for custom commands. Follows the existing
// DB-driven setInterval pattern (see utils/announcements/scheduler.js).
import logger from '../logger.js';
import CustomCommand from '../../models/CustomCommand.js';
import { runCustomCommand } from './runner.js';
import { getCustomCommandLimits } from './limits.js';
import { computeNextFiredAt, cronIntervalMs, intervalToMs } from './scheduleMath.js';

const limits = getCustomCommandLimits();

/**
 * Processes all due interval/crontab commands on every guild.
 */
export async function processScheduledCommands(client) {
	const due = await CustomCommand.find({
		enabled: true,
		triggerType: { $in: ['interval', 'crontab'] },
		nextRunAt: { $lte: new Date() },
	}).lean();

	const byGuild = new Map();
	for (const cc of due) {
		if (!byGuild.has(cc.guildId)) byGuild.set(cc.guildId, []);
		byGuild.get(cc.guildId).push(cc);
	}

	for (const [guildId, commands] of byGuild) {
		const guild = client.guilds.cache.get(guildId);
		if (!guild) continue;
		for (const cc of commands) {
			await runScheduledCommand(client, guild, cc);
		}
	}
}

async function runScheduledCommand(client, guild, cc) {
	const channelId = cc.triggerType === 'interval'
		? cc.interval?.channelId
		: cc.cron?.channelId;
	const channel = channelId ? guild.channels.cache.get(channelId) : null;
	if (!channel) {
		// No channel configured; still advance the schedule so it does not
		// spin, but flag the miss.
		await advanceAndSave(cc);
		return;
	}

	try {
		await runCustomCommand({ client, guild, channel, cc });
	}
	catch (error) {
		cc.lastError = error.message;
	}
	finally {
		await advanceAndSave(cc);
	}
}

async function advanceAndSave(cc) {
	const nextRunAt = computeNextFiredAt(cc, new Date());
	await CustomCommand.updateOne(
		{ guildId: cc.guildId, ccid: cc.ccid },
		{ $inc: { runCount: 1 }, $set: { nextRunAt, lastRunAt: new Date(), lastError: cc.lastError ?? null } },
	).catch(e => logger.warn(`Failed to persist scheduled CC ${cc.ccid}: ${e.message}`));
}

/**
 * Validates an interval/crontab config and returns the period in ms.
 * Throws with a descriptive message on failure.
 */
export function validateScheduleConfig(triggerType, interval = null, cron = null) {
	if (triggerType === 'interval') {
		const ms = intervalToMs(interval);
		if (ms < limits.minIntervalSeconds * 1000) {
			throw new Error(`Interval must be at least ${limits.minIntervalMinutes} minutes`);
		}
		if (ms > limits.maxIntervalSeconds * 1000) {
			throw new Error('Interval cannot exceed 1 month');
		}
		return ms;
	}
	if (triggerType === 'crontab') {
		const ms = cronIntervalMs(cron?.expression);
		if (ms < limits.minCronIntervalSeconds * 1000) {
			throw new Error('Cron expressions must schedule jobs at least 10 minutes apart');
		}
		return ms;
	}
	return 0;
}

/**
 * Sets the nextRunAt for a command that now uses a scheduled trigger.
 */
export function computeInitialNextRun(triggerType, interval = null, cron = null) {
	return computeNextFiredAt({ triggerType, interval, cron }, new Date());
}

/**
 * Registers the polling interval. Called from events/ready.js.
 */
export function startCustomCommandScheduler(client) {
	const intervalMs = Math.max(1, limits.schedulerPollSeconds) * 1000;
	const poll = async () => {
		try {
			await processScheduledCommands(client);
		}
		catch (error) {
			logger.error('Custom command scheduler error:', error);
		}
	};
	poll();
	setInterval(poll, intervalMs);
}
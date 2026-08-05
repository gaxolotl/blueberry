import { MessageFlags } from 'discord.js';
import PatchNoteConfig from '../../models/PatchNoteConfig.js';
import PatchNote from '../../models/PatchNote.js';
import logger from '../logger.js';
import { fetchSource } from './fetcher.js';
import { buildPatchNoteContainer } from './formatter.js';
import { getPatchNoteConfig } from './config.js';
import config from '../../config.js';

const patchConfig = config.patchNotes ?? {};

/**
 * Returns only the newest unseen note and advances over older backlog entries.
 * @param {Array<object>} notes
 * @param {object} source
 * @returns {{ latest: object|null, fetchedGuids: string[], shouldQueue: boolean }}
 */
export function selectLatestUnseenNote(notes, source) {
	if (!notes.length) return { latest: null, fetchedGuids: [], shouldQueue: false };
	const sortedNotes = [...notes].sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
	const latest = sortedNotes.at(-1);
	const fetchedGuids = notes.map(note => note.guid).filter(Boolean);
	const seenGuids = new Set(source.seenGuids ?? []);
	const cutoff = source.lastPublishedAt ? new Date(source.lastPublishedAt).getTime() : 0;
	const shouldQueue = !seenGuids.has(latest.guid) && new Date(latest.publishedAt).getTime() >= cutoff;
	return { latest, fetchedGuids, shouldQueue };
}

async function mapWithConcurrency(items, concurrency, worker) {
	let cursor = 0;
	const workers = Array.from({ length: Math.min(Math.max(concurrency, 1), items.length) }, async () => {
		while (cursor < items.length) {
			const index = cursor++;
			await worker(items[index]);
		}
	});
	await Promise.all(workers);
}

/**
 * Publishes a single patch note to the configured channel.
 * @param {import('discord.js').Client} client
 * @param {object} guildConfig
 * @param {object} note
 */
async function publishNote(client, guildConfig, note) {
	const guild = await client.guilds.fetch(guildConfig.guildId).catch(() => null);
	if (!guild) throw new Error(`Guild ${guildConfig.guildId} is unavailable`);

	const channel = await guild.channels.fetch(guildConfig.channelId).catch(() => null);
	if (!channel?.isTextBased()) throw new Error(`Patch note channel is unavailable for guild ${guildConfig.guildId}`);

	const container = await buildPatchNoteContainer(guildConfig.guildId, note, {
		showDownloads: guildConfig.showDownloads,
		showChangelog: guildConfig.showChangelog,
		mentionRoleId: guildConfig.mentionRoleId,
	});

	await channel.send({
		components: [container],
		flags: MessageFlags.IsComponentsV2,
		allowedMentions: { roles: guildConfig.mentionRoleId ? [guildConfig.mentionRoleId] : [] },
	});
}

async function queueLatestNote(guildConfig, source, note) {
	// A polled source keeps only its newest pending item, preventing catch-up floods after downtime.
	await PatchNote.deleteMany({
		guildId: guildConfig.guildId,
		sourceId: source.id,
		published: false,
		claimedAt: null,
	});

	await PatchNote.updateOne(
		{ guildId: guildConfig.guildId, sourceId: source.id, guid: note.guid },
		{
			$setOnInsert: {
				guildId: guildConfig.guildId,
				sourceId: source.id,
				sourceType: source.type,
				guid: note.guid,
				title: note.title,
				link: note.link ?? null,
				publishedAt: note.publishedAt,
				content: note.content ?? '',
				sourceLabel: note.sourceLabel ?? source.label,
				assets: note.assets ?? [],
			},
		},
		{ upsert: true },
	);
}

async function pollSource(guildConfig, source) {
	if (!source.enabled || source.type === 'webhook') return;
	const now = Date.now();
	if (source.retryAt && new Date(source.retryAt).getTime() > now) return;
	const pollIntervalMs = source.type === 'github'
		? (patchConfig.githubPollIntervalSeconds ?? 300) * 1000
		: (patchConfig.pollIntervalSeconds ?? 300) * 1000;
	if (source.lastCheckedAt && now - new Date(source.lastCheckedAt).getTime() < pollIntervalMs) return;

	try {
		source.lastCheckedAt = new Date();
		const notes = await fetchSource(source);
		source.retryAt = null;
		if (!notes.length) return;

		const { latest, fetchedGuids, shouldQueue } = selectLatestUnseenNote(notes, source);
		const seenGuids = new Set(source.seenGuids ?? []);

		if (shouldQueue) await queueLatestNote(guildConfig, source, latest);

		// Advance across every fetched entry, including entries skipped while the bot was offline.
		source.lastGuid = latest.guid;
		source.lastPublishedAt = latest.publishedAt;
		source.seenGuids = [...new Set([...fetchedGuids, ...seenGuids])].slice(0, 50);
	}
	catch (error) {
		if (error.retryAt) source.retryAt = error.retryAt;
		logger.error(`Failed to poll patch note source "${source.label}" for guild ${guildConfig.guildId}:`, error);
	}
}

/**
 * Polls one guild and queues at most the newest unseen item from each source.
 * @param {object} guildConfig
 */
export async function pollGuildPatchNotes(guildConfig) {
	if (!guildConfig.enabled || !guildConfig.channelId || !guildConfig.sources?.length) return;
	await Promise.all(guildConfig.sources.map(source => pollSource(guildConfig, source)));
	guildConfig.lastCheckedAt = new Date();
	await guildConfig.save();
}

async function claimQueuedNote() {
	const now = new Date();
	const leaseExpiredAt = new Date(Date.now() - ((patchConfig.deliveryLeaseSeconds ?? 300) * 1000));
	return PatchNote.findOneAndUpdate(
		{
			published: false,
			failedAt: null,
			$and: [
				{ $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }] },
				{ $or: [{ claimedAt: null }, { claimedAt: { $lte: leaseExpiredAt } }] },
			],
		},
		{ $set: { claimedAt: now }, $inc: { attempts: 1 } },
		{ returnDocument: 'after', sort: { createdAt: 1 } },
	);
}

async function deliverNextQueuedNote(client) {
	const note = await claimQueuedNote();
	if (!note) return false;

	try {
		const guildConfig = await getPatchNoteConfig(note.guildId);
		if (!guildConfig.enabled || !guildConfig.channelId) throw new Error('Patch notes are disabled or have no output channel');
		await publishNote(client, guildConfig, note);
		note.published = true;
		note.publishedAtDiscord = new Date();
		note.claimedAt = null;
		note.lastError = null;
		await note.save();
	}
	catch (error) {
		note.claimedAt = null;
		note.lastError = String(error.message ?? error).slice(0, 500);
		if (note.attempts >= (patchConfig.maxDeliveryAttempts ?? 20)) {
			note.failedAt = new Date();
		}
		else {
			const baseSeconds = patchConfig.deliveryRetryBaseSeconds ?? 60;
			const delaySeconds = Math.min(baseSeconds * (2 ** Math.max(note.attempts - 1, 0)), 3600);
			note.nextAttemptAt = new Date(Date.now() + (delaySeconds * 1000));
		}
		await note.save();
		logger.error(`Failed to deliver queued patch note ${note.guid} for guild ${note.guildId}:`, error);
	}

	return true;
}

/**
 * Delivers a bounded number of queued notes with atomic claims and retry backoff.
 * @param {import('discord.js').Client} client
 */
export async function publishQueuedPatchNotes(client) {
	let remaining = patchConfig.maxDeliveriesPerCycle ?? 50;
	const concurrency = patchConfig.deliveryConcurrency ?? 3;
	const workers = Array.from({ length: Math.min(Math.max(concurrency, 1), remaining) }, async () => {
		while (remaining > 0) {
			remaining--;
			if (!await deliverNextQueuedNote(client)) break;
		}
	});
	await Promise.all(workers);
}

/**
 * Polls all enabled guilds and then drains the persistent delivery queue.
 * @param {import('discord.js').Client} client
 */
export async function pollAllPatchNotes(client) {
	const guildConfigs = await PatchNoteConfig.find({ enabled: true, channelId: { $ne: null } });
	await mapWithConcurrency(
		guildConfigs,
		patchConfig.sourcePollConcurrency ?? 5,
		async (guildConfig) => {
			try {
				await pollGuildPatchNotes(guildConfig);
			}
			catch (error) {
				logger.error(`Failed to poll patch notes for guild ${guildConfig.guildId}:`, error);
			}
		},
	);
	await publishQueuedPatchNotes(client);

	const retentionDays = patchConfig.queueRetentionDays ?? 30;
	const retentionCutoff = new Date(Date.now() - (retentionDays * 86_400_000));
	await PatchNote.deleteMany({
		$or: [
			{ published: true, publishedAtDiscord: { $lte: retentionCutoff } },
			{ failedAt: { $lte: retentionCutoff } },
		],
	});
}

/**
 * Schedules patch-note discovery and delivery.
 * @param {import('discord.js').Client} client
 */
export function schedulePatchNotePolling(client) {
	let polling = false;
	const poll = async () => {
		if (polling) return;
		polling = true;
		try {
			await pollAllPatchNotes(client);
		}
		catch (error) {
			logger.error('Failed to poll patch notes:', error);
		}
		finally {
			polling = false;
		}
	};
	poll();
	setInterval(poll, (patchConfig.pollIntervalSeconds ?? 300) * 1000);
}

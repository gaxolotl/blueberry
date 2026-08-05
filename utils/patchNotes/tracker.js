import { MessageFlags } from 'discord.js';
import PatchNoteConfig from '../../models/PatchNoteConfig.js';
import PatchNote from '../../models/PatchNote.js';
import logger from '../logger.js';
import { fetchSource } from './fetcher.js';
import { buildPatchNoteContainer } from './formatter.js';
import { getPatchNoteConfig } from './config.js';
import config from '../../config.js';

/**
 * Publishes a single patch note to the configured channel.
 * @param {import('discord.js').Client} client
 * @param {object} guildConfig
 * @param {object} note
 * @returns {Promise<boolean>}
 */
async function publishNote(client, guildConfig, note) {
	const guild = await client.guilds.fetch(guildConfig.guildId).catch(() => null);
	if (!guild) return false;

	const channel = await guild.channels.fetch(guildConfig.channelId).catch(() => null);
	if (!channel?.isTextBased()) {
		logger.warn(`Patch note channel missing for guild ${guildConfig.guildId}`);
		return false;
	}

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

	return true;
}

/**
 * Polls a single guild's patch note sources and publishes new notes.
 * @param {import('discord.js').Client} client
 * @param {object} guildConfig
 */
export async function pollGuildPatchNotes(client, guildConfig) {
	if (!guildConfig.enabled || !guildConfig.channelId) return;
	if (!guildConfig.sources?.length) return;

	for (const source of guildConfig.sources) {
		if (!source.enabled) continue;
		const now = Date.now();
		if (source.retryAt && new Date(source.retryAt).getTime() > now) continue;
		const pollIntervalMs = source.type === 'github'
			? (config.patchNotes?.githubPollIntervalSeconds ?? 300) * 1000
			: (config.patchNotes?.pollIntervalSeconds ?? 300) * 1000;
		if (source.lastCheckedAt && now - new Date(source.lastCheckedAt).getTime() < pollIntervalMs) continue;

		try {
			source.lastCheckedAt = new Date();
			const notes = await fetchSource(source);
			source.retryAt = null;
			if (!notes.length) continue;

			const sortedNotes = [...notes].sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
			const latest = sortedNotes.at(-1);
			const fetchedGuids = notes.map(note => note.guid).filter(Boolean);

			if (!source.lastPublishedAt && !(source.seenGuids ?? []).length) {
				const published = await publishNote(client, guildConfig, latest);
				if (!published) continue;
				source.lastGuid = latest.guid;
				source.lastPublishedAt = latest.publishedAt;
				source.seenGuids = fetchedGuids.slice(0, 50);
				continue;
			}

			const cutoff = source.lastPublishedAt ? new Date(source.lastPublishedAt).getTime() : 0;
			const seenGuids = new Set(source.seenGuids ?? []);
			const newNotes = sortedNotes
				.filter(note => !seenGuids.has(note.guid) && new Date(note.publishedAt).getTime() >= cutoff)
				.slice(-(config.patchNotes?.maxReleasesPerPoll ?? 3));

			for (const note of newNotes) {
				const published = await publishNote(client, guildConfig, note);
				if (published) seenGuids.add(note.guid);
			}

			source.lastGuid = latest.guid;
			source.lastPublishedAt = latest.publishedAt;
			source.seenGuids = [...new Set([...fetchedGuids, ...seenGuids])].slice(0, 50);
		}
		catch (error) {
			if (error.retryAt) source.retryAt = error.retryAt;
			logger.error(`Failed to poll patch note source "${source.label}" for guild ${guildConfig.guildId}:`, error);
		}
	}

	guildConfig.lastCheckedAt = new Date();
	await guildConfig.save();
}

/**
 * Publishes queued webhook patch notes that haven't been sent yet.
 * @param {import('discord.js').Client} client
 */
export async function publishQueuedWebhookNotes(client) {
	const guildIds = await PatchNote.distinct('guildId', { published: false });
	for (const guildId of guildIds) {
		const queued = await PatchNote.find({ guildId, published: false }).sort({ createdAt: 1 }).limit(50);
		for (const note of queued) {
			const guildConfig = await getPatchNoteConfig(note.guildId);
			if (!guildConfig.enabled || !guildConfig.channelId) continue;

			const published = await publishNote(client, guildConfig, note);
			if (published) {
				note.published = true;
				await note.save();
			}
		}
	}
}

/**
 * Polls all guilds' patch note sources.
 * @param {import('discord.js').Client} client
 */
export async function pollAllPatchNotes(client) {
	const configs = await PatchNoteConfig.find({ enabled: true });
	for (const guildConfig of configs) {
		try {
			await pollGuildPatchNotes(client, guildConfig);
		}
		catch (error) {
			logger.error(`Failed to poll patch notes for guild ${guildConfig.guildId}:`, error);
		}
	}

	await publishQueuedWebhookNotes(client);
}

/**
 * Schedules the patch note polling interval.
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
	setInterval(poll, (config.patchNotes?.pollIntervalSeconds ?? 300) * 1000);
}


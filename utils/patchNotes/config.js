import PatchNoteConfig from '../../models/PatchNoteConfig.js';
import appConfig from '../../config.js';

const SOURCE_LIMIT_KEYS = {
	rss: 'maxRssFeeds',
	github: 'maxGithubTrackers',
};

export function getPatchNoteLimits() {
	return {
		maxRssFeeds: appConfig.patchNotes?.maxRssFeeds ?? 3,
		maxGithubTrackers: appConfig.patchNotes?.maxGithubTrackers ?? 3,
		maxReleasesPerPoll: appConfig.patchNotes?.maxReleasesPerPoll ?? 3,
		pollIntervalSeconds: appConfig.patchNotes?.pollIntervalSeconds ?? 300,
		githubPollIntervalSeconds: appConfig.patchNotes?.githubPollIntervalSeconds ?? 300,
		rssRateLimitRetrySeconds: appConfig.patchNotes?.rssRateLimitRetrySeconds ?? 300,
	};
}

/**
 * Gets (or creates) the patch note config for a guild.
 * @param {string} guildId
 * @returns {Promise<import('mongoose').Document>}
 */
export async function getPatchNoteConfig(guildId) {
	let config = await PatchNoteConfig.findOne({ guildId });
	if (!config) {
		config = await PatchNoteConfig.create({ guildId });
	}
	return config;
}

/**
 * Updates the patch note config for a guild.
 * @param {string} guildId
 * @param {object} updates
 * @returns {Promise<import('mongoose').Document>}
 */
export async function updatePatchNoteConfig(guildId, updates) {
	return PatchNoteConfig.findOneAndUpdate(
		{ guildId },
		{ $set: updates },
		{ upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
	);
}

/**
 * Adds a new source to a guild's patch note config.
 * @param {string} guildId
 * @param {object} source
 * @returns {Promise<import('mongoose').Document>}
 */
export async function addPatchNoteSource(guildId, source) {
	const config = await getPatchNoteConfig(guildId);
	const limitKey = SOURCE_LIMIT_KEYS[source.type];
	const limit = limitKey ? getPatchNoteLimits()[limitKey] : null;
	const sourceCount = config.sources.filter(configured => configured.type === source.type).length;
	if (limit !== null && sourceCount >= limit) {
		const error = new Error(`Patch note ${source.type} source limit reached`);
		error.code = 'PATCH_NOTE_SOURCE_LIMIT';
		error.limit = limit;
		throw error;
	}
	const id = source.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
	config.sources.push({ ...source, id });
	await config.save();
	return config;
}

/**
 * Removes a source from a guild's patch note config.
 * @param {string} guildId
 * @param {string} sourceId
 * @returns {Promise<import('mongoose').Document>}
 */
export async function removePatchNoteSource(guildId, sourceId) {
	const config = await getPatchNoteConfig(guildId);
	config.sources = config.sources.filter(source => source.id !== sourceId);
	await config.save();
	return config;
}

/**
 * Updates an existing patch-note source without exposing or clearing its token implicitly.
 * @param {string} guildId
 * @param {string} sourceId
 * @param {object} updates
 * @returns {Promise<import('mongoose').Document|null>}
 */
export async function updatePatchNoteSource(guildId, sourceId, updates) {
	const config = await getPatchNoteConfig(guildId);
	const source = config.sources.find(item => item.id === sourceId);
	if (!source) return null;

	for (const [key, value] of Object.entries(updates)) source[key] = value;
	source.lastGuid = null;
	source.lastPublishedAt = null;
	source.lastCheckedAt = null;
	source.retryAt = null;
	source.seenGuids = [];
	await config.save();
	return config;
}

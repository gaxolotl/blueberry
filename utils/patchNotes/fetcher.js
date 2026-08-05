import { XMLParser } from 'fast-xml-parser';
import config from '../../config.js';

const xmlParser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: '@_',
	trimValues: true,
});

function getXmlText(value) {
	if (value === null || value === undefined) return null;
	if (typeof value === 'string' || typeof value === 'number') return String(value);
	if (typeof value === 'object') {
		return value['#text'] ?? value['@_href'] ?? value.href ?? null;
	}
	return null;
}

/**
 * Normalizes a single RSS/Atom entry into a patch note object.
 * @param {object} entry
 * @param {string} sourceLabel
 * @returns {object|null}
 */
function normalizeRssEntry(entry, sourceLabel) {
	if (!entry) return null;

	const title = getXmlText(entry.title ?? entry['content:title']) ?? 'Untitled';
	const linkObj = entry.link;
	const link = typeof linkObj === 'string'
		? linkObj
		: getXmlText(linkObj);
	const guid = getXmlText(entry.guid ?? entry.id) ?? link ?? `${title}-${entry.pubDate ?? entry.published ?? entry.updated ?? Date.now()}`;
	const publishedAt = getXmlText(entry.pubDate ?? entry.published ?? entry.updated);
	const content = getXmlText(entry['content:encoded'] ?? entry.content ?? entry.description) ?? '';

	return {
		guid,
		title: String(title),
		link,
		publishedAt: publishedAt ? new Date(publishedAt) : new Date(),
		content: content.slice(0, 4000),
		sourceLabel,
	};
}

/**
 * Fetches and parses an RSS/Atom feed into patch note objects.
 * @param {string} url
 * @param {string} sourceLabel
 * @returns {Promise<Array<object>>}
 */
export async function fetchRssFeed(url, sourceLabel) {
	const res = await fetch(url, {
		headers: { 'User-Agent': 'Blueberry-PatchNotes/1.0' },
		signal: AbortSignal.timeout(config.patchNotes?.requestTimeoutMs ?? 15_000),
	});
	if (!res.ok) {
		const error = new Error(`RSS fetch failed with status ${res.status}`);
		error.status = res.status;

		if (res.status === 429) {
			const retryAfter = res.headers.get('retry-after');
			const retryAfterSeconds = Number(retryAfter);
			const retryAfterDate = Date.parse(retryAfter);
			const retryAt = retryAfter !== null && Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
				? Date.now() + (retryAfterSeconds * 1000)
				: retryAfter !== null && Number.isFinite(retryAfterDate) && retryAfterDate > Date.now()
					? retryAfterDate
					: Date.now() + ((config.patchNotes?.rssRateLimitRetrySeconds ?? 300) * 1000);
			error.code = 'RSS_RATE_LIMITED';
			error.retryAt = new Date(retryAt);
		}

		throw error;
	}

	const text = await res.text();
	const parsed = xmlParser.parse(text);

	const channel = parsed?.rss?.channel ?? parsed?.feed ?? null;
	if (!channel) throw new Error('Invalid RSS/Atom feed');

	const rawItems = channel.item ?? channel.entry ?? [];
	const items = Array.isArray(rawItems) ? rawItems : [rawItems];

	return items
		.map(entry => normalizeRssEntry(entry, sourceLabel))
		.filter(Boolean);
}

/**
 * Fetches the latest GitHub releases for a repository.
 * @param {string} owner
 * @param {string} repo
 * @param {string|null} token
 * @returns {Promise<Array<object>>}
 */
export async function fetchGithubReleases(owner, repo, token) {
	const headers = { 'User-Agent': 'Blueberry-PatchNotes/1.0', Accept: 'application/vnd.github+json' };
	const githubToken = token || null;
	if (githubToken) headers.Authorization = `Bearer ${githubToken}`;
	headers['X-GitHub-Api-Version'] = '2022-11-28';

	const releaseLimit = config.patchNotes?.maxReleasesPerPoll ?? 3;
	const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=${releaseLimit}`, {
		headers,
		signal: AbortSignal.timeout(config.patchNotes?.requestTimeoutMs ?? 15_000),
	});
	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		const remaining = Number(res.headers.get('x-ratelimit-remaining'));
		const resetSeconds = Number(res.headers.get('x-ratelimit-reset'));
		const rateLimited = res.status === 403 && remaining === 0;
		const error = new Error(rateLimited
			? `GitHub API rate limit exceeded${githubToken ? ' for the configured token' : ' for unauthenticated requests'}; resets at ${new Date(resetSeconds * 1000).toISOString()}`
			: `GitHub releases fetch failed with status ${res.status}: ${body.message || res.statusText}`);
		error.code = rateLimited ? 'GITHUB_RATE_LIMITED' : 'GITHUB_REQUEST_FAILED';
		error.status = res.status;
		error.retryAt = Number.isFinite(resetSeconds) ? new Date((resetSeconds * 1000) + 5_000) : null;
		throw error;
	}

	const releases = await res.json();
	return releases.map(release => ({
		guid: release.html_url,
		title: release.name ?? release.tag_name ?? 'Untitled release',
		link: release.html_url,
		publishedAt: new Date(release.published_at ?? release.created_at),
		content: (release.body ?? '').slice(0, 4000),
		sourceLabel: `${owner}/${repo}`,
		tagName: release.tag_name,
		assets: (release.assets ?? []).map(asset => ({
			name: asset.name,
			url: asset.browser_download_url,
			size: asset.size,
		})),
		author: release.author?.login ?? null,
	}));
}

/**
 * Verifies that a GitHub token can read the configured repository.
 * @param {string} owner
 * @param {string} repo
 * @param {string} token
 * @returns {Promise<void>}
 */
export async function validateGithubToken(owner, repo, token) {
	if (!token) throw new Error('A GitHub access token is required');
	const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
		headers: {
			'User-Agent': 'Blueberry-PatchNotes/1.0',
			Accept: 'application/vnd.github+json',
			Authorization: `Bearer ${token}`,
			'X-GitHub-Api-Version': '2022-11-28',
		},
		signal: AbortSignal.timeout(config.patchNotes?.requestTimeoutMs ?? 15_000),
	});
	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new Error(`GitHub token validation failed with status ${res.status}: ${body.message || res.statusText}`);
	}
}

/**
 * Parses a GitHub repo URL (https://github.com/owner/repo) into owner/repo.
 * @param {string} url
 * @returns {{ owner: string, repo: string } | null}
 */
export function parseGithubUrl(url) {
	if (!url) return null;
	const match = url.match(/^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/?#]+)\/?(?:[?#].*)?$/i);
	if (!match) return null;
	return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
}

/**
 * Fetches patch notes from a single configured source.
 * @param {object} source
 * @returns {Promise<Array<object>>}
 */
export async function fetchSource(source) {
	if (source.type === 'github') {
		const parsed = parseGithubUrl(source.url);
		if (!parsed) throw new Error('Invalid GitHub repository URL');
		if (!source.token) throw new Error('This GitHub source has no access token. Edit the source to add one.');
		return fetchGithubReleases(parsed.owner, parsed.repo, source.token);
	}

	if (source.type === 'rss') {
		return fetchRssFeed(source.url, source.label);
	}

	if (source.type === 'webhook') {
		// Webhook sources are pushed by the upstream service; nothing to poll.
		// They are handled via the API endpoint that receives webhook payloads.
		return [];
	}

	throw new Error(`Unknown patch note source type: ${source.type}`);
}

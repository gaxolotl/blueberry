import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EMOJI_JS_PATH = path.join(__dirname, '..', 'utils', 'emoji.js');

/**
 * Downloads the binary data of an emoji image from Discord's CDN.
 * @param {string} emojiId - The Discord emoji ID.
 * @param {boolean} animated - Whether the emoji is animated.
 * @returns {Promise<Buffer|null>}
 */
async function fetchEmojiImage(emojiId, animated) {
	const ext = animated ? 'gif' : 'webp';
	const url = `https://cdn.discordapp.com/emojis/${emojiId}.${ext}`;

	try {
		const response = await fetch(url);
		if (response.ok) {
			const arrayBuffer = await response.arrayBuffer();
			return Buffer.from(arrayBuffer);
		}
	}
	catch (error) {
		logger.error(`Failed to fetch image for emoji ID ${emojiId}:`, error);
	}
	return null;
}

/**
 * Restarts the process so fresh emoji IDs load into memory.
 */
function restartProcess() {
	logger.info('Restarting bot to load updated emoji IDs...');
	process.on('exit', () => {
		spawn(process.argv[0], process.argv.slice(1), {
			cwd: process.cwd(),
			detached: true,
			stdio: 'inherit',
		}).unref();
	});
	process.exit(0);
}

/**
 * Synchronizes custom application emojis in utils/emoji.js with Discord's Application Emojis API.
 * @param {string} token - The Discord Bot Token.
 */
export async function runSync(token) {
	const enabled = (process.env.EMOJI_SYNC || 'true').trim().toLowerCase();
	if (enabled !== 'true') {
		logger.info(`Disabled via EMOJI_SYNC=${enabled} — skipping.`);
		return;
	}

	if (!token) {
		logger.warn('No token provided — skipping EmojiSync.');
		return;
	}

	let content;
	try {
		content = await fs.readFile(EMOJI_JS_PATH, 'utf-8');
	}
	catch (err) {
		logger.error('Could not read utils/emoji.js:', err);
		return;
	}

	const regex = /<(a?):(\w+):(\d+)>/g;
	const matches = Array.from(content.matchAll(regex)).map(m => ({
		animatedStr: m[1],
		animated: m[1] === 'a',
		name: m[2],
		oldId: m[3],
		fullMatch: m[0],
	}));

	if (matches.length === 0) {
		logger.info('No custom emojis found in utils/emoji.js — nothing to sync.');
		return;
	}

	logger.info(`Starting Application Emoji Sync — ${matches.length} emojis found in utils/emoji.js`);

	const headers = {
		Authorization: `Bot ${token}`,
		'Content-Type': 'application/json',
	};

	try {
		const userRes = await fetch('https://discord.com/api/v10/users/@me', { headers });
		if (!userRes.ok) {
			logger.error(`Failed to fetch bot info [HTTP ${userRes.status}]`);
			return;
		}
		const userData = await userRes.json();
		const appId = userData.id;

		const emojiRes = await fetch(`https://discord.com/api/v10/applications/${appId}/emojis`, { headers });
		if (!emojiRes.ok) {
			logger.error(`Failed to fetch application emojis [HTTP ${emojiRes.status}]`);
			return;
		}

		const emojiData = await emojiRes.json();
		const appEmojis = Array.isArray(emojiData) ? emojiData : (emojiData.items || []);

		logger.info(`Found ${matches.length} local templates | Application hosts ${appEmojis.length} remote emojis`);

		let updated = false;
		let skipped = 0;
		let uploaded = 0;
		let fixed = 0;
		let failed = 0;

		for (const match of matches) {
			const { animatedStr, animated, name, oldId, fullMatch } = match;

			const existing = appEmojis.find(e => e.id === oldId) || appEmojis.find(e => e.name === name);

			if (existing) {
				const newId = existing.id;
				if (oldId !== newId) {
					const newStr = `<${animatedStr}:${existing.name}:${newId}>`;
					content = content.replaceAll(fullMatch, newStr);
					updated = true;
					fixed++;
					logger.warn(`Auto-fixing ID: ${name} -> ${newId}`);
				}
				else {
					skipped++;
				}
				continue;
			}

			logger.info(`Uploading missing emoji: ${name}`);

			const imageData = await fetchEmojiImage(oldId, animated);
			if (!imageData) {
				logger.error(`Could not download image for ${name} [ID: ${oldId}]`);
				failed++;
				continue;
			}

			const mime = animated ? 'image/gif' : 'image/webp';
			const b64 = imageData.toString('base64');
			const imageUri = `data:${mime};base64,${b64}`;

			const uploadRes = await fetch(`https://discord.com/api/v10/applications/${appId}/emojis`, {
				method: 'POST',
				headers,
				body: JSON.stringify({ name, image: imageUri }),
			});

			if (uploadRes.status === 200 || uploadRes.status === 201) {
				const newEmoji = await uploadRes.json();
				const newId = newEmoji.id;
				const newStr = `<${animatedStr}:${newEmoji.name}:${newId}>`;

				content = content.replaceAll(fullMatch, newStr);
				appEmojis.push(newEmoji);
				updated = true;
				uploaded++;
				logger.info(`Uploaded: ${name} [saved as ID: ${newId}]`);
			}
			else {
				const respText = await uploadRes.text();
				logger.error(`Discord rejected ${name} -> ${respText}`);
				failed++;
			}

			await new Promise(resolve => setTimeout(resolve, 500));
		}

		if (updated) {
			try {
				await fs.writeFile(EMOJI_JS_PATH, content, 'utf-8');
				logger.info('utils/emoji.js patched in-place to reflect current API state.');
			}
			catch (err) {
				logger.error('Could not write patched utils/emoji.js:', err);
				updated = false;
			}
		}

		const parts = [];
		if (skipped) parts.push(`${skipped} already matching`);
		if (fixed) parts.push(`${fixed} ID mismatches fixed`);
		if (uploaded) parts.push(`${uploaded} newly uploaded`);
		if (failed) parts.push(`${failed} failures`);

		if (parts.length > 0) {
			logger.info(`Sync complete: ${parts.join(' | ')}`);
		}
		else {
			logger.info('Sync complete: nothing to do.');
		}

		if (updated) {
			restartProcess();
		}
	}
	catch (err) {
		logger.error('Unexpected error during emoji sync:', err);
	}
}
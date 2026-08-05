import { randomBytes } from 'node:crypto';
import Session from '../../models/Session.js';
import Guild from '../../models/Guild.js';

const DISCORD_API = 'https://discord.com/api/v10';

/**
 * Exchanges an OAuth2 code for tokens and user info.
 * @param {string} code
 * @param {string} clientId
 * @param {string} clientSecret
 * @param {string} redirectUri
 * @returns {Promise<{user: object, accessToken: string, refreshToken: string, expiresIn: number} | null>}
 */
async function exchangeCode(code, clientId, clientSecret, redirectUri) {
	const body = new URLSearchParams({
		client_id: clientId,
		client_secret: clientSecret,
		grant_type: 'authorization_code',
		code,
		redirect_uri: redirectUri,
	});

	const res = await fetch(`${DISCORD_API}/oauth2/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body,
	});

	if (!res.ok) return null;

	const data = await res.json();

	const userRes = await fetch(`${DISCORD_API}/users/@me`, {
		headers: { Authorization: `Bearer ${data.access_token}` },
	});
	if (!userRes.ok) return null;
	const user = await userRes.json();

	return {
		user,
		accessToken: data.access_token,
		refreshToken: data.refresh_token,
		expiresIn: data.expires_in,
	};
}

/**
 * Fetches the user's joined guilds and filters to those manageable via ManageGuild or manageRoleIds.
 * @param {string} accessToken
 * @returns {Promise<Array<{id: string, name: string, icon: string|null, owner: boolean, permissions: string}>>}
 */
async function fetchManageableGuilds(accessToken) {
	const guildsRes = await fetch(`${DISCORD_API}/users/@me/guilds`, {
		headers: { Authorization: `Bearer ${accessToken}` },
	});
	if (!guildsRes.ok) return [];

	const guilds = await guildsRes.json();

	// Only show guilds the bot is actually in (Guild records are synced by the bot)
	const botGuilds = await Guild.find(
		{ guildId: { $in: guilds.map(g => g.id) } },
		{ guildId: 1, manageRoleIds: 1 },
	).lean();

	const botGuildMap = new Map(botGuilds.map(g => [g.guildId, g]));

	return guilds
		.filter(g => {
			const bg = botGuildMap.get(g.id);
			if (!bg) return false;

			// User can manage via ManageGuild permission or guild ownership
			if ((BigInt(g.permissions) & 0x20n) !== 0n || g.owner) return true;

			// If the guild has manageRoleIds configured, defer to the role check
			// (this is verified separately via the bot API in canManageGuild)
			if (bg.manageRoleIds?.length > 0) return true;

			return false;
		})
		.map(g => ({ id: g.id, name: g.name, icon: g.icon, owner: g.owner, permissions: g.permissions }));
}

/**
 * @param {string} clientId
 * @param {string} clientSecret
 * @returns {import('hono').MiddlewareHandler}
 */
function createAuthMiddleware(clientId, clientSecret) {
	/**
	 * @param {import('hono').Context} c
	 * @param {import('hono').Next} next
	 */
	return async (c, next) => {
		const authHeader = c.req.header('Authorization');
		const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
		if (!token) return c.json({ error: 'Unauthorized' }, 401);

		const session = await Session.findOne({ token }).lean();
		if (!session) return c.json({ error: 'Unauthorized' }, 401);

		// Refresh the access token if it's expired
		let sessionDoc = session;
		if (new Date(session.accessTokenExpiresAt) < new Date()) {
			const refreshed = await refreshAccessToken(session.refreshToken, clientId, clientSecret);
			if (!refreshed) {
				await Session.deleteOne({ token });
				return c.json({ error: 'Unauthorized' }, 401);
			}

			await Session.updateOne(
				{ token },
				{ $set: { accessToken: refreshed.accessToken, accessTokenExpiresAt: refreshed.expiresAt } },
			);
			sessionDoc = await Session.findOne({ token }).lean();
		}

		c.set('session', sessionDoc);
		await next();
	};
}

/**
 * @param {string} refreshToken
 * @param {string} clientId
 * @param {string} clientSecret
 * @returns {Promise<{accessToken: string, expiresAt: Date} | null>}
 */
async function refreshAccessToken(refreshToken, clientId, clientSecret) {
	const body = new URLSearchParams({
		client_id: clientId,
		client_secret: clientSecret,
		grant_type: 'refresh_token',
		refresh_token: refreshToken,
	});

	const res = await fetch(`${DISCORD_API}/oauth2/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body,
	});

	if (!res.ok) return null;
	const data = await res.json();
	return {
		accessToken: data.access_token,
		expiresAt: new Date(Date.now() + data.expires_in * 1000),
	};
}

/**
 * Creates a new session from an OAuth2 code.
 * @param {string} code
 * @param {string} clientId
 * @param {string} clientSecret
 * @param {string} redirectUri
 * @returns {Promise<{token: string, username: string, avatar: string|null, guilds: Array} | null>}
 */
async function createSession(code, clientId, clientSecret, redirectUri) {
	const result = await exchangeCode(code, clientId, clientSecret, redirectUri);
	if (!result) return null;

	const guilds = await fetchManageableGuilds(result.accessToken);
	const token = randomBytes(32).toString('hex');

	const session = await Session.create({
		token,
		discordId: result.user.id,
		username: result.user.username,
		avatar: result.user.avatar,
		accessToken: result.accessToken,
		accessTokenExpiresAt: new Date(Date.now() + result.expiresIn * 1000),
		refreshToken: result.refreshToken,
		guilds,
	});

	return {
		token: session.token,
		username: session.username,
		avatar: session.avatar,
		guilds,
	};
}

export { createSession, createAuthMiddleware, fetchManageableGuilds };
import { serve } from '@hono/node-server';
import { randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import mongoose from 'mongoose';

import { isValidHex } from '../../utils/color.js';
import logger from '../../utils/logger.js';
import Guild from '../../models/Guild.js';
import Ticket from '../../models/Ticket.js';
import TicketConfig from '../../models/TicketConfig.js';
import InviteJoin from '../../models/InviteJoin.js';
import Session from '../../models/Session.js';
import { createSession, createAuthMiddleware, fetchManageableGuilds } from './auth.js';
import { buildTranscriptHtml } from '../../utils/ticketSystem/transcriptHtml.js';
import PatchNoteConfig from '../../models/PatchNoteConfig.js';
import PatchNote from '../../models/PatchNote.js';
import { addPatchNoteSource, getPatchNoteLimits, removePatchNoteSource, updatePatchNoteSource } from '../../utils/patchNotes/config.js';
import { parseGithubUrl, validateGithubToken } from '../../utils/patchNotes/fetcher.js';
import { getTicketAutomationLimits, validateAutomationRules } from '../../utils/ticketSystem/autoCategorizer.js';
import OnboardingConfig from '../../models/OnboardingConfig.js';
import appConfig from '../../config.js';

const app = new Hono();

const clientId = process.env.DISCORD_CLIENT_ID;
const clientSecret = process.env.DISCORD_CLIENT_SECRET;
const redirectUri = process.env.DISCORD_REDIRECT_URI ?? 'http://localhost:5173/auth/callback';
const DISCORD_API = 'https://discord.com/api/v10';

app.use('*', cors());

// ---- Auth ----
app.get('/api/auth/login', (c) => {
	const uri = encodeURIComponent(redirectUri);
	return c.json({
		url: `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${uri}&response_type=code&scope=identify%20guilds`,
	});
});

app.post('/api/auth/callback', async (c) => {
	const { code } = await c.req.json();
	const result = await createSession(code, clientId, clientSecret, redirectUri);
	if (!result) return c.json({ error: 'Invalid code' }, 400);
	return c.json(result);
});

app.post('/api/auth/logout', async (c) => {
	const authHeader = c.req.header('Authorization');
	const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
	if (token) await Session.deleteOne({ token });
	return c.json({ ok: true });
});

// ---- Protected routes ----
const auth = createAuthMiddleware(clientId, clientSecret);
app.use('/api/*', auth);

// Health check (protected)
app.get('/api/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }));

// ---- Session ----
app.get('/api/me', async (c) => {
	const session = c.get('session');
	const guilds = await fetchManageableGuilds(session.accessToken);

	// Keep the cached data up to date
	await Session.updateOne(
		{ token: session.token },
		{ $set: { guilds } },
	);

	return c.json({
		username: session.username,
		avatar: session.avatar,
		guilds,
	});
});

// ---- Guild access helper ----
// Verifies the user can manage a guild. Handles both ManageGuild permission
// and manageRoleIds (checked against Discord's guild member roles API).
async function canAccessGuild(session, guildId) {
	const guildEntry = session.guilds.find(g => g.id === guildId);
	if (!guildEntry) return false;

	// ManageGuild permission or guild ownership → direct access
	if ((BigInt(guildEntry.permissions) & 0x20n) !== 0n || guildEntry.owner) {
		return true;
	}

	// Check manageRoleIds via the bot API if the guild has them configured
	const guild = await Guild.findOne({ guildId }, { manageRoleIds: 1 }).lean();
	if (!guild || !guild.manageRoleIds?.length) {
		return false;
	}

	try {
		const memberRes = await fetch(
			`${DISCORD_API}/guilds/${guildId}/members/${session.discordId}`,
			{ headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` } },
		);
		if (!memberRes.ok) return false;
		const member = await memberRes.json();
		return guild.manageRoleIds.some(roleId => member.roles.includes(roleId));
	}
	catch {
		return false;
	}
}

// ---- Guilds ----
app.get('/api/guilds', async (c) => {
	const session = c.get('session');
	const guildIds = session.guilds.map(g => g.id);
	const guilds = await Guild.find({ guildId: { $in: guildIds } }).sort({ createdAt: -1 }).lean();
	return c.json(guilds);
});

app.get('/api/guilds/:guildId', async (c) => {
	const session = c.get('session');
	const guildId = c.req.param('guildId');
	if (!await canAccessGuild(session, guildId)) return c.json({ error: 'Forbidden' }, 403);

	const guild = await Guild.findOne({ guildId }).lean();
	if (!guild) return c.json({ error: 'Guild not found' }, 404);
	return c.json(guild);
});

const GUILD_ALLOWED = ['language', 'manageRoleIds', 'accentColor', 'errorColor'];

const ONBOARDING_ALLOWED = [
	'welcomeEnabled',
	'welcomeChannelId',
	'welcomeMessage',
	'farewellEnabled',
	'farewellChannelId',
	'farewellMessage',
	'autoRoleIds',
	'accountAgeAlertEnabled',
	'accountAgeAlertChannelId',
	'accountAgeMinimumDays',
];

function serializeOnboardingConfig(settings) {
	return {
		...settings,
		autoRoleIds: settings.autoRoleIds ?? [],
		limits: {
			maxAutoRoles: appConfig.onboarding.maxAutoRoles,
			maxAccountAgeDays: appConfig.onboarding.maxAccountAgeDays,
		},
	};
}

app.get('/api/guilds/:guildId/onboarding-config', async (c) => {
	const session = c.get('session');
	const guildId = c.req.param('guildId');
	if (!await canAccessGuild(session, guildId)) return c.json({ error: 'Forbidden' }, 403);
	const settings = await OnboardingConfig.findOneAndUpdate(
		{ guildId },
		{ $setOnInsert: { guildId } },
		{ upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
	).lean();
	return c.json(serializeOnboardingConfig(settings));
});

app.patch('/api/guilds/:guildId/onboarding-config', async (c) => {
	const session = c.get('session');
	const guildId = c.req.param('guildId');
	if (!await canAccessGuild(session, guildId)) return c.json({ error: 'Forbidden' }, 403);
	const body = await c.req.json();
	const updates = {};
	for (const key of ONBOARDING_ALLOWED) {
		if (body[key] !== undefined) updates[key] = body[key];
	}
	if (updates.autoRoleIds && (!Array.isArray(updates.autoRoleIds) || updates.autoRoleIds.length > appConfig.onboarding.maxAutoRoles)) {
		return c.json({ error: 'Invalid automatic roles' }, 400);
	}
	if (updates.accountAgeMinimumDays !== undefined && (!Number.isInteger(updates.accountAgeMinimumDays) || updates.accountAgeMinimumDays < 1 || updates.accountAgeMinimumDays > appConfig.onboarding.maxAccountAgeDays)) {
		return c.json({ error: 'Invalid account age threshold' }, 400);
	}
	for (const key of ['welcomeMessage', 'farewellMessage']) {
		if (updates[key] !== undefined && (typeof updates[key] !== 'string' || !updates[key].trim() || updates[key].length > 1000)) {
			return c.json({ error: `Invalid ${key}` }, 400);
		}
	}
	const settings = await OnboardingConfig.findOneAndUpdate(
		{ guildId },
		{ $set: updates },
		{ upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
	).lean();
	return c.json(serializeOnboardingConfig(settings));
});

app.patch('/api/guilds/:guildId', async (c) => {
	const session = c.get('session');
	const guildId = c.req.param('guildId');
	if (!await canAccessGuild(session, guildId)) return c.json({ error: 'Forbidden' }, 403);

	const body = await c.req.json();
	const updates = {};
	for (const key of GUILD_ALLOWED) {
		if (body[key] !== undefined) {
			if ((key === 'accentColor' || key === 'errorColor') && !isValidHex(body[key])) {
				return c.json({ error: `Invalid hex color for ${key}` }, 400);
			}
			updates[key] = body[key];
		}
	}

	const guild = await Guild.findOneAndUpdate(
		{ guildId },
		{ $set: updates },
		{ returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
	).lean();

	return c.json(guild);
});

const TICKET_CONFIG_ALLOWED = [
	'panelTitle',
	'panelDescription',
	'threadNameTemplate',
	'maxOpenPerUser',
	'supportRoleIds',
	'categories',
	'transcriptChannelId',
	'autoCloseMinutes',
	'requireCloseReason',
	'defaultPriority',
	'automationEnabled',
	'automationRules',
];

app.get('/api/guilds/:guildId/ticket-config', async (c) => {
	const session = c.get('session');
	const guildId = c.req.param('guildId');
	if (!await canAccessGuild(session, guildId)) return c.json({ error: 'Forbidden' }, 403);

	const config = await TicketConfig.findOneAndUpdate(
		{ guildId },
		{ $setOnInsert: { guildId } },
		{ returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
	).lean();
	return c.json({
		...config,
		automationEnabled: Boolean(config.automationEnabled),
		automationRules: config.automationRules ?? [],
		categories: config.categories ?? [],
		automationLimits: getTicketAutomationLimits(),
	});
});

app.patch('/api/guilds/:guildId/ticket-config', async (c) => {
	const session = c.get('session');
	const guildId = c.req.param('guildId');
	if (!await canAccessGuild(session, guildId)) return c.json({ error: 'Forbidden' }, 403);

	const body = await c.req.json();
	const updates = {};
	for (const key of TICKET_CONFIG_ALLOWED) {
		if (body[key] !== undefined) updates[key] = body[key];
	}
	if (updates.automationRules && !validateAutomationRules(updates.automationRules)) {
		return c.json({ error: 'Invalid ticket automation rules' }, 400);
	}

	const config = await TicketConfig.findOneAndUpdate(
		{ guildId },
		{ $set: updates },
		{ returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
	).lean();
	return c.json({
		...config,
		automationEnabled: Boolean(config.automationEnabled),
		automationRules: config.automationRules ?? [],
		categories: config.categories ?? [],
		automationLimits: getTicketAutomationLimits(),
	});
});

// ---- Tickets ----
app.get('/api/guilds/:guildId/tickets', async (c) => {
	const session = c.get('session');
	const guildId = c.req.param('guildId');
	if (!await canAccessGuild(session, guildId)) return c.json({ error: 'Forbidden' }, 403);

	const { status } = c.req.query();
	const filter = { guildId };
	if (status) filter.status = status;
	const tickets = await Ticket.find(filter).sort({ createdAt: -1 }).lean();
	return c.json(tickets);
});

app.get('/api/guilds/:guildId/tickets/stats', async (c) => {
	const session = c.get('session');
	const guildId = c.req.param('guildId');
	if (!await canAccessGuild(session, guildId)) return c.json({ error: 'Forbidden' }, 403);

	const [open, closed, total] = await Promise.all([
		Ticket.countDocuments({ guildId, status: 'open' }),
		Ticket.countDocuments({ guildId, status: 'closed' }),
		Ticket.countDocuments({ guildId }),
	]);
	return c.json({ open, closed, total });
});

app.get('/api/guilds/:guildId/tickets/:threadId/transcript', async (c) => {
	const session = c.get('session');
	const guildId = c.req.param('guildId');
	if (!await canAccessGuild(session, guildId)) return c.json({ error: 'Forbidden' }, 403);

	const ticket = await Ticket.findOne({ guildId, threadId: c.req.param('threadId') }).lean();
	if (!ticket) return c.json({ error: 'Ticket not found' }, 404);

	return c.json({ html: buildTranscriptHtml(ticket), filename: `transcript-${ticket.threadId}.html` });
});

app.get('/api/me/export', async (c) => {
	const session = c.get('session');
	const discordId = session.discordId;
	const [sessions, tickets, inviteJoins] = await Promise.all([
		Session.find({ discordId }, { token: 0, accessToken: 0, refreshToken: 0 }).lean(),
		Ticket.find({
			$or: [
				{ openerId: discordId },
				{ claimedBy: discordId },
				{ closedBy: discordId },
				{ participants: discordId },
				{ 'transcript.authorId': discordId },
			],
		}).lean(),
		InviteJoin.find({ $or: [{ memberId: discordId }, { inviterId: discordId }] }).lean(),
	]);
	const personalTickets = tickets.map(ticket => ({
		guildId: ticket.guildId,
		threadId: ticket.threadId,
		categoryLabel: ticket.categoryLabel,
		status: ticket.status,
		createdAt: ticket.createdAt,
		closedAt: ticket.closedAt,
		roles: {
			opener: ticket.openerId === discordId,
			claimedBy: ticket.claimedBy === discordId,
			participant: ticket.participants?.includes(discordId) ?? false,
			closedBy: ticket.closedBy === discordId,
		},
		issueDescription: ticket.openerId === discordId ? ticket.issueDescription : undefined,
		messages: (ticket.transcript ?? []).filter(entry => entry.authorId === discordId),
	}));

	return c.json({
		exportedAt: new Date().toISOString(),
		discordId,
		profile: { username: session.username, avatar: session.avatar },
		sessions,
		tickets: personalTickets,
		inviteJoins,
	});
});

app.delete('/api/me', async (c) => {
	const session = c.get('session');
	const body = await c.req.json().catch(() => ({}));
	if (body.confirmation !== 'DELETE') return c.json({ error: 'Type DELETE to confirm account deletion' }, 400);

	const discordId = session.discordId;
	const anonymousId = `deleted-${randomBytes(12).toString('hex')}`;
	const sessions = await Session.find({ discordId }).lean();

	await Promise.all(sessions.map(async current => {
		const revokeBody = new URLSearchParams({ token: current.accessToken, token_type_hint: 'access_token' });
		await fetch(`${DISCORD_API}/oauth2/token/revoke`, {
			method: 'POST',
			headers: {
				Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: revokeBody,
		}).catch(() => null);
	}));

	const tickets = await Ticket.find({
		$or: [
			{ openerId: discordId },
			{ claimedBy: discordId },
			{ closedBy: discordId },
			{ participants: discordId },
			{ 'transcript.authorId': discordId },
		],
	});
	for (const ticket of tickets) {
		if (ticket.openerId === discordId) {
			ticket.openerId = anonymousId;
			ticket.issueDescription = null;
		}
		if (ticket.claimedBy === discordId) ticket.claimedBy = null;
		if (ticket.closedBy === discordId) ticket.closedBy = anonymousId;
		ticket.participants = ticket.participants.filter(id => id !== discordId);
		for (const entry of ticket.transcript) {
			if (entry.authorId === discordId) {
				entry.authorId = anonymousId;
				entry.authorTag = 'Deleted user';
				entry.authorDisplayName = 'Deleted user';
				entry.authorAvatarUrl = null;
				entry.content = '[Content erased at the user’s request]';
				entry.attachments = [];
				entry.attachmentMetadata = [];
				entry.embeds = [];
				entry.components = [];
				entry.stickers = [];
			}
			if (entry.reference?.authorTag === session.username || entry.reference?.authorDisplayName === session.username) {
				entry.reference = { authorTag: 'Deleted user', authorDisplayName: 'Deleted user', content: '[Content erased]' };
			}
		}
		await ticket.save();
	}

	await Promise.all([
		InviteJoin.updateMany({ memberId: discordId }, { $set: { memberId: anonymousId, memberTag: 'Deleted user' } }),
		InviteJoin.updateMany({ inviterId: discordId }, { $set: { inviterId: anonymousId, inviterTag: 'Deleted user' } }),
		Session.deleteMany({ discordId }),
	]);

	return c.json({ deleted: true });
});

app.patch('/api/guilds/:guildId/tickets/:threadId', async (c) => {
	const session = c.get('session');
	const guildId = c.req.param('guildId');
	if (!await canAccessGuild(session, guildId)) return c.json({ error: 'Forbidden' }, 403);

	const { threadId } = c.req.param();
	const body = await c.req.json();
	const allowed = {};
	if (body.priority !== undefined) allowed.priority = body.priority;
	if (body.notes !== undefined) allowed.notes = body.notes;
	if (body.status !== undefined) allowed.status = body.status;

	const ticket = await Ticket.findOneAndUpdate(
		{ guildId, threadId },
		{ $set: allowed },
		{ returnDocument: 'after' },
	).lean();
	if (!ticket) return c.json({ error: 'Ticket not found' }, 404);
	return c.json(ticket);
});

// ---- Patch Notes ----
const PATCH_NOTE_CONFIG_ALLOWED = [
	'channelId',
	'enabled',
	'showDownloads',
	'showChangelog',
	'mentionRoleId',
];

function serializePatchNoteConfig(config) {
	const result = typeof config.toObject === 'function' ? config.toObject() : config;
	return {
		...result,
		sources: (result.sources ?? []).map(source => ({ ...source, hasToken: Boolean(source.token), token: undefined })),
		limits: getPatchNoteLimits(),
	};
}

app.get('/api/guilds/:guildId/patch-notes-config', async (c) => {
	const session = c.get('session');
	const guildId = c.req.param('guildId');
	if (!await canAccessGuild(session, guildId)) return c.json({ error: 'Forbidden' }, 403);

	const config = await PatchNoteConfig.findOneAndUpdate(
		{ guildId },
		{ $setOnInsert: { guildId } },
		{ returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
	).lean();
	return c.json(serializePatchNoteConfig(config));
});

app.patch('/api/guilds/:guildId/patch-notes-config', async (c) => {
	const session = c.get('session');
	const guildId = c.req.param('guildId');
	if (!await canAccessGuild(session, guildId)) return c.json({ error: 'Forbidden' }, 403);

	const body = await c.req.json();
	const updates = {};
	for (const key of PATCH_NOTE_CONFIG_ALLOWED) {
		if (body[key] !== undefined) updates[key] = body[key];
	}

	const config = await PatchNoteConfig.findOneAndUpdate(
		{ guildId },
		{ $set: updates },
		{ returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
	).lean();
	return c.json(serializePatchNoteConfig(config));
});

app.get('/api/guilds/:guildId/resources', async (c) => {
	const session = c.get('session');
	const guildId = c.req.param('guildId');
	if (!await canAccessGuild(session, guildId)) return c.json({ error: 'Forbidden' }, 403);

	const headers = { Authorization: `Bot ${process.env.DISCORD_TOKEN}` };
	const [rolesResponse, channelsResponse] = await Promise.all([
		fetch(`${DISCORD_API}/guilds/${guildId}/roles`, { headers }),
		fetch(`${DISCORD_API}/guilds/${guildId}/channels`, { headers }),
	]);
	if (!rolesResponse.ok || !channelsResponse.ok) {
		return c.json({ error: 'Unable to fetch Discord guild resources' }, 502);
	}

	const [roles, channels] = await Promise.all([rolesResponse.json(), channelsResponse.json()]);
	return c.json({
		roles: roles
			.filter(role => role.id !== guildId && !role.managed)
			.sort((a, b) => b.position - a.position)
			.map(role => ({ id: role.id, name: role.name, color: role.color })),
		channels: channels
			.filter(channel => [0, 5].includes(channel.type))
			.sort((a, b) => a.position - b.position)
			.map(channel => ({ id: channel.id, name: channel.name, type: channel.type })),
	});
});

app.post('/api/guilds/:guildId/patch-notes-config/sources', async (c) => {
	const session = c.get('session');
	const guildId = c.req.param('guildId');
	if (!await canAccessGuild(session, guildId)) return c.json({ error: 'Forbidden' }, 403);

	const body = await c.req.json();
	const type = typeof body.type === 'string' ? body.type.toLowerCase() : '';
	const label = typeof body.label === 'string' ? body.label.trim() : '';
	const url = typeof body.url === 'string' ? body.url.trim() : '';
	if (!['rss', 'github'].includes(type) || !label || label.length > 50) {
		return c.json({ error: 'Invalid source type or label' }, 400);
	}

	let parsedUrl;
	try {
		parsedUrl = new URL(url);
	}
	catch {
		return c.json({ error: 'Invalid source URL' }, 400);
	}
	if (!['http:', 'https:'].includes(parsedUrl.protocol) || (type === 'github' && !parseGithubUrl(url))) {
		return c.json({ error: 'Invalid source URL' }, 400);
	}
	const token = type === 'github' && typeof body.token === 'string' ? body.token.trim() : '';
	if (type === 'github') {
		if (!token) return c.json({ error: 'A GitHub access token is required' }, 400);
		const repository = parseGithubUrl(url);
		try {
			await validateGithubToken(repository.owner, repository.repo, token);
		}
		catch (error) {
			return c.json({ error: error.message }, 400);
		}
	}

	try {
		const config = await addPatchNoteSource(guildId, {
			type,
			label,
			url,
			token: type === 'github' ? token : null,
		});
		return c.json(serializePatchNoteConfig(config), 201);
	}
	catch (error) {
		if (error.code === 'PATCH_NOTE_SOURCE_LIMIT') {
			return c.json({ error: `Source limit reached (${error.limit})` }, 400);
		}
		throw error;
	}
});

app.patch('/api/guilds/:guildId/patch-notes-config/sources/:sourceId', async (c) => {
	const session = c.get('session');
	const guildId = c.req.param('guildId');
	if (!await canAccessGuild(session, guildId)) return c.json({ error: 'Forbidden' }, 403);

	const config = await PatchNoteConfig.findOne({ guildId });
	const existing = config?.sources.find(source => source.id === c.req.param('sourceId'));
	if (!existing) return c.json({ error: 'Source not found' }, 404);

	const body = await c.req.json();
	const label = typeof body.label === 'string' ? body.label.trim() : '';
	const url = typeof body.url === 'string' ? body.url.trim() : '';
	if (!label || label.length > 50) return c.json({ error: 'Invalid source label' }, 400);

	let parsedUrl;
	try {
		parsedUrl = new URL(url);
	}
	catch {
		return c.json({ error: 'Invalid source URL' }, 400);
	}
	if (!['http:', 'https:'].includes(parsedUrl.protocol) || (existing.type === 'github' && !parseGithubUrl(url))) {
		return c.json({ error: 'Invalid source URL' }, 400);
	}

	const updates = { label, url, enabled: body.enabled !== false };
	if (existing.type === 'github') {
		const token = typeof body.token === 'string' && body.token.trim() ? body.token.trim() : existing.token;
		if (!token) return c.json({ error: 'A GitHub access token is required' }, 400);
		const repository = parseGithubUrl(url);
		try {
			await validateGithubToken(repository.owner, repository.repo, token);
		}
		catch (error) {
			return c.json({ error: error.message }, 400);
		}
		updates.token = token;
	}

	const updated = await updatePatchNoteSource(guildId, existing.id, updates);
	return c.json(serializePatchNoteConfig(updated));
});

app.delete('/api/guilds/:guildId/patch-notes-config/sources/:sourceId', async (c) => {
	const session = c.get('session');
	const guildId = c.req.param('guildId');
	if (!await canAccessGuild(session, guildId)) return c.json({ error: 'Forbidden' }, 403);

	const config = await removePatchNoteSource(guildId, c.req.param('sourceId'));
	return c.json(serializePatchNoteConfig(config));
});

app.post('/api/guilds/:guildId/patch-notes/webhook', async (c) => {
	const session = c.get('session');
	const guildId = c.req.param('guildId');
	if (!await canAccessGuild(session, guildId)) return c.json({ error: 'Forbidden' }, 403);
	const body = await c.req.json();

	if (!body?.title) return c.json({ error: 'Missing title' }, 400);

	const config = await PatchNoteConfig.findOne({ guildId }).lean();
	if (!config?.enabled || !config?.channelId) {
		return c.json({ error: 'Patch notes not enabled or no channel configured' }, 400);
	}

	const sourceId = body.sourceId ?? 'webhook';
	const guid = body.guid ?? `${body.title}-${Date.now()}`;
	const note = await PatchNote.findOneAndUpdate(
		{ guildId, sourceId, guid },
		{
			$setOnInsert: {
				guildId,
				sourceId,
				sourceType: 'webhook',
				guid,
				title: body.title,
				link: body.link ?? null,
				publishedAt: body.publishedAt ? new Date(body.publishedAt) : new Date(),
				content: body.content ?? '',
				sourceLabel: body.sourceLabel ?? 'Webhook',
				assets: body.assets ?? [],
			},
		},
		{ upsert: true, returnDocument: 'after' },
	);

	return c.json({ ok: true, id: note._id });
});

// ---- Invite Joins ----
app.get('/api/guilds/:guildId/invites', async (c) => {
	const session = c.get('session');
	const guildId = c.req.param('guildId');
	if (!await canAccessGuild(session, guildId)) return c.json({ error: 'Forbidden' }, 403);

	const limit = Math.min(parseInt(c.req.query('limit') ?? '100', 10), 500);
	const joins = await InviteJoin.find({ guildId })
		.sort({ joinedAt: -1 })
		.limit(limit)
		.lean();
	return c.json(joins);
});

app.get('/api/guilds/:guildId/invites/stats', async (c) => {
	const session = c.get('session');
	const guildId = c.req.param('guildId');
	if (!await canAccessGuild(session, guildId)) return c.json({ error: 'Forbidden' }, 403);

	const [total, topInvites] = await Promise.all([
		InviteJoin.countDocuments({ guildId }),
		InviteJoin.aggregate([
			{ $match: { guildId } },
			{ $group: { _id: '$inviteCode', count: { $sum: 1 } } },
			{ $sort: { count: -1 } },
			{ $limit: 10 },
		]),
	]);
	return c.json({ total, topInvites });
});

const port = Number(process.env.API_PORT ?? 3001);

async function start() {
	try {
		await mongoose.connect(process.env.MONGODB_URI);
		serve({ fetch: app.fetch, port });
		logger.info(`[api] listening on http://localhost:${port}`);
	}
	catch (error) {
		logger.error('[api] failed to start:', error);
		process.exit(1);
	}
}

start();

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import mongoose from 'mongoose';

import Guild from '../../models/Guild.js';
import Ticket from '../../models/Ticket.js';
import TicketConfig from '../../models/TicketConfig.js';
import InviteJoin from '../../models/InviteJoin.js';
import Session from '../../models/Session.js';
import { createSession, createAuthMiddleware, fetchManageableGuilds } from './auth.js';
import { buildTranscriptText } from '../../utils/ticketSystem/features.js';

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

const GUILD_ALLOWED = ['language', 'manageRoleIds'];

app.patch('/api/guilds/:guildId', async (c) => {
	const session = c.get('session');
	const guildId = c.req.param('guildId');
	if (!await canAccessGuild(session, guildId)) return c.json({ error: 'Forbidden' }, 403);

	const body = await c.req.json();
	const updates = {};
	for (const key of GUILD_ALLOWED) {
		if (body[key] !== undefined) updates[key] = body[key];
	}

	const guild = await Guild.findOneAndUpdate(
		{ guildId },
		{ $set: updates },
		{ new: true, upsert: true, setDefaultsOnInsert: true },
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
];

app.get('/api/guilds/:guildId/ticket-config', async (c) => {
	const session = c.get('session');
	const guildId = c.req.param('guildId');
	if (!await canAccessGuild(session, guildId)) return c.json({ error: 'Forbidden' }, 403);

	const config = await TicketConfig.findOneAndUpdate(
		{ guildId },
		{ $setOnInsert: { guildId } },
		{ new: true, upsert: true, setDefaultsOnInsert: true },
	).lean();
	return c.json(config);
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

	const config = await TicketConfig.findOneAndUpdate(
		{ guildId },
		{ $set: updates },
		{ new: true, upsert: true, setDefaultsOnInsert: true },
	).lean();
	return c.json(config);
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

	return c.json({ text: buildTranscriptText(ticket), filename: `transcript-${ticket.threadId}.txt` });
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
		{ new: true },
	).lean();
	if (!ticket) return c.json({ error: 'Ticket not found' }, 404);
	return c.json(ticket);
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
		console.log(`[api] listening on http://localhost:${port}`);
	}
	catch (error) {
		console.error('[api] failed to start:', error);
		process.exit(1);
	}
}

start();
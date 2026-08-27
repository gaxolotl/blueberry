// Custom command REST routes. Registered from apps/api/index.js.
import {
	getCommands,
	getCommand,
	createCommand,
	updateCommand,
	removeCommand,
	getGroups,
	createGroup,
	updateGroup,
	removeGroup,
	sanitizeCommandBody,
	sanitizeGroupBody,
	validateCommandRuntime,
} from '../../utils/customCommands/crud.js';
import { getCustomCommandLimits } from '../../utils/customCommands/limits.js';
import { patternToRegExp } from '../../utils/customCommands/database.js';
import CustomCommandDBEntry from '../../models/CustomCommandDBEntry.js';

export function registerCustomCommandRoutes(app, canAccessGuild) {
	// ---- Commands ----
	app.get('/api/guilds/:guildId/custom-commands', async (c) => {
		const session = c.get('session');
		const guildId = c.req.param('guildId');
		if (!await canAccessGuild(session, guildId)) return c.json({ error: 'Forbidden' }, 403);

		const [commands, groups] = await Promise.all([getCommands(guildId), getGroups(guildId)]);
		return c.json({ commands, groups, limits: getCustomCommandLimits() });
	});

	// Validate a template without saving (import-check).
	app.post('/api/guilds/:guildId/custom-commands/validate', async (c) => {
		const session = c.get('session');
		const guildId = c.req.param('guildId');
		if (!await canAccessGuild(session, guildId)) return c.json({ error: 'Forbidden' }, 403);

		const body = await c.req.json().catch(() => null);
		if (!body || typeof body.response !== 'string') return c.json({ error: 'Missing response' }, 400);
		try {
			validateCommandRuntime({ responses: [body.response] });
			return c.json({ ok: true });
		}
		catch (error) {
			return c.json({ error: error.message }, 400);
		}
	});

	app.post('/api/guilds/:guildId/custom-commands', async (c) => {
		const session = c.get('session');
		const guildId = c.req.param('guildId');
		if (!await canAccessGuild(session, guildId)) return c.json({ error: 'Forbidden' }, 403);

		const body = await c.req.json().catch(() => null);
		try {
			const data = sanitizeCommandBody(body);
			validateCommandRuntime(data);
			const command = await createCommand(guildId, data);
			return c.json(command, 201);
		}
		catch (error) {
			if (error.code === 'CUSTOM_COMMAND_LIMIT') return c.json({ error: `Custom command limit reached (${error.limit})` }, 400);
			return c.json({ error: error.message }, 400);
		}
	});

	app.patch('/api/guilds/:guildId/custom-commands/:ccid', async (c) => {
		const session = c.get('session');
		const guildId = c.req.param('guildId');
		if (!await canAccessGuild(session, guildId)) return c.json({ error: 'Forbidden' }, 403);

		const body = await c.req.json().catch(() => null);
		try {
			const updates = sanitizeCommandBody(body);
			validateCommandRuntime({ ...body, ...updates });
			const command = await updateCommand(guildId, c.req.param('ccid'), updates);
			if (!command) return c.json({ error: 'Not found' }, 404);
			return c.json(command);
		}
		catch (error) {
			return c.json({ error: error.message }, 400);
		}
	});

	app.delete('/api/guilds/:guildId/custom-commands/:ccid', async (c) => {
		const session = c.get('session');
		const guildId = c.req.param('guildId');
		if (!await canAccessGuild(session, guildId)) return c.json({ error: 'Forbidden' }, 403);

		const command = await removeCommand(guildId, c.req.param('ccid'));
		if (!command) return c.json({ error: 'Not found' }, 404);
		return c.json({ ok: true });
	});

	// ---- Groups ----
	app.post('/api/guilds/:guildId/custom-commands/groups', async (c) => {
		const session = c.get('session');
		const guildId = c.req.param('guildId');
		if (!await canAccessGuild(session, guildId)) return c.json({ error: 'Forbidden' }, 403);

		const body = await c.req.json().catch(() => null);
		try {
			const data = sanitizeGroupBody(body);
			const group = await createGroup(guildId, data);
			return c.json(group, 201);
		}
		catch (error) {
			if (error.code === 'CUSTOM_COMMAND_GROUP_LIMIT') return c.json({ error: `Command group limit reached (${error.limit})` }, 400);
			return c.json({ error: error.message }, 400);
		}
	});

	app.patch('/api/guilds/:guildId/custom-commands/groups/:groupId', async (c) => {
		const session = c.get('session');
		const guildId = c.req.param('guildId');
		if (!await canAccessGuild(session, guildId)) return c.json({ error: 'Forbidden' }, 403);

		const body = await c.req.json().catch(() => null);
		try {
			const updates = sanitizeGroupBody(body);
			const group = await updateGroup(guildId, c.req.param('groupId'), updates);
			if (!group) return c.json({ error: 'Not found' }, 404);
			return c.json(group);
		}
		catch (error) {
			return c.json({ error: error.message }, 400);
		}
	});

	app.delete('/api/guilds/:guildId/custom-commands/groups/:groupId', async (c) => {
		const session = c.get('session');
		const guildId = c.req.param('guildId');
		if (!await canAccessGuild(session, guildId)) return c.json({ error: 'Forbidden' }, 403);

		const group = await removeGroup(guildId, c.req.param('groupId'));
		if (!group) return c.json({ error: 'Not found' }, 404);
		return c.json({ ok: true });
	});

	// ---- Database browser ----
	app.get('/api/guilds/:guildId/custom-commands/db', async (c) => {
		const session = c.get('session');
		const guildId = c.req.param('guildId');
		if (!await canAccessGuild(session, guildId)) return c.json({ error: 'Forbidden' }, 403);

		const search = c.req.query('search') ?? '';
		const userId = c.req.query('userId') ?? null;
		const limit = Math.min(parseInt(c.req.query('limit') ?? '100', 10), 500);

		const query = { guildId };
		if (search) query.key = { $regex: patternToRegExp(search.includes('%') ? search : `%${search}%`) };
		if (userId) query.userId = userId;

		const entries = await CustomCommandDBEntry.find(query)
			.sort({ updatedAt: -1 })
			.limit(limit)
			.lean();
		return c.json({
			entries: entries.map(e => ({
				ID: String(e._id),
				UserID: e.userId,
				Key: e.key,
				Value: e.value,
				CreatedAt: e.createdAt,
				UpdatedAt: e.updatedAt,
				ExpiresAt: e.expiresAt,
			})),
			limits: getCustomCommandLimits(),
		});
	});

	app.delete('/api/guilds/:guildId/custom-commands/db/:entryId', async (c) => {
		const session = c.get('session');
		const guildId = c.req.param('guildId');
		if (!await canAccessGuild(session, guildId)) return c.json({ error: 'Forbidden' }, 403);

		const entry = await CustomCommandDBEntry.findOneAndDelete({ guildId, _id: c.req.param('entryId') });
		if (!entry) return c.json({ error: 'Not found' }, 404);
		return c.json({ ok: true });
	});
}

export { getCommand };
// CRUD helpers for CustomCommand + CustomCommandGroup used by the API.
import CustomCommand from '../../models/CustomCommand.js';
import CustomCommandGroup from '../../models/CustomCommandGroup.js';
import { getCustomCommandLimits, getNextCCID } from './limits.js';
import { validateScheduleConfig, computeInitialNextRun } from './scheduler.js';
import { compileTemplate } from './engine.js';

const TRIGGER_TYPES = ['command', 'startsWith', 'contains', 'regex', 'exactMatch', 'reaction', 'interval', 'crontab', 'component', 'modal'];
const RESPONSE_MODES = ['text', 'embed', 'componentsV2'];

/**
 * Validates the custom command payload and returns sanitized updates or throws.
 */
export function sanitizeCommandBody(body) {
	if (typeof body !== 'object' || !body) throw new Error('Invalid body');
	const limits = getCustomCommandLimits();

	const out = {};
	const set = (key, value) => { if (value !== undefined) out[key] = value; };

	if (body.name !== undefined) {
		if (typeof body.name !== 'string' || body.name.length > limits.maxNameLength) throw new Error('Invalid name');
		set('name', body.name);
	}
	if (body.enabled !== undefined) set('enabled', Boolean(body.enabled));

	if (body.triggerType !== undefined) {
		if (!TRIGGER_TYPES.includes(body.triggerType)) throw new Error('Invalid trigger type');
		set('triggerType', body.triggerType);
	}
	if (body.trigger !== undefined) {
		if (typeof body.trigger !== 'string' || body.trigger.length > limits.maxTriggerLength) throw new Error('Invalid trigger');
		set('trigger', body.trigger);
	}
	if (body.caseSensitive !== undefined) set('caseSensitive', Boolean(body.caseSensitive));
	if (body.editTrigger !== undefined) set('editTrigger', Boolean(body.editTrigger));

	if (body.responses !== undefined) {
		if (!Array.isArray(body.responses) || body.responses.length === 0) throw new Error('At least one response required');
		if (body.responses.length > limits.maxResponses) throw new Error('Too many responses');
		for (const r of body.responses) {
			if (typeof r !== 'string' || r.length > limits.maxResponseLength) throw new Error('Invalid response');
		}
		set('responses', body.responses);
	}
	if (body.responseMode !== undefined) {
		if (!RESPONSE_MODES.includes(body.responseMode)) throw new Error('Invalid response mode');
		set('responseMode', body.responseMode);
	}
	if (body.removedField === 'groupId') set('groupId', null);
	else if (body.groupId !== undefined) set('groupId', body.groupId === null ? null : String(body.groupId));

	if (body.restrictions !== undefined) set('restrictions', sanitizeRestrictions(body.restrictions));

	if (body.reactionAdded !== undefined) set('reactionAdded', Boolean(body.reactionAdded));
	if (body.reactionRemoved !== undefined) set('reactionRemoved', Boolean(body.reactionRemoved));
	if (body.interval !== undefined) set('interval', body.interval ?? null);
	if (body.cron !== undefined) set('cron', body.cron ?? null);

	return out;
}

function sanitizeRestrictions(restrictions) {
	const out = {};
	for (const key of ['allowRoleIds', 'denyRoleIds', 'allowChannelIds', 'denyChannelIds']) {
		if (Array.isArray(restrictions?.[key])) {
			out[key] = restrictions[key].map(String).filter(v => /^\d+$/.test(v));
		}
	}
	return out;
}

/**
 * Validates a compile + schedule config. Throws on invalid templates/schedules.
 */
export function validateCommandRuntime(body) {
	// Template must compile.
	if (body.responses) {
		for (const r of body.responses) compileTemplate(r);
	}
	// Interval/cron must be valid for the trigger type.
	if (body.triggerType === 'interval' || body.triggerType === 'crontab') {
		const interval = body.triggerType === 'interval' ? body.interval : null;
		const cron = body.triggerType === 'crontab' ? body.cron : null;
		validateScheduleConfig(body.triggerType, interval, cron);
	}
}

export async function getCommands(guildId) {
	return CustomCommand.find({ guildId }).sort({ ccid: 1 }).lean();
}

export async function getCommand(guildId, ccid) {
	return CustomCommand.findOne({ guildId, ccid: Number(ccid) });
}

export async function createCommand(guildId, data) {
	const limits = getCustomCommandLimits();
	const count = await CustomCommand.countDocuments({ guildId });
	if (count >= limits.maxCommands) {
		const error = new Error('Custom command limit reached');
		error.code = 'CUSTOM_COMMAND_LIMIT';
		error.limit = limits.maxCommands;
		throw error;
	}
	const ccid = await getNextCCID(guildId, CustomCommand);

	const doc = {
		guildId,
		ccid,
		triggerType: data.triggerType ?? 'command',
		trigger: data.trigger ?? '',
		name: data.name ?? '',
		enabled: data.enabled ?? true,
		responses: data.responses ?? ['Edit this to change the output of the custom command!'],
		responseMode: data.responseMode ?? 'componentsV2',
		groupId: data.groupId ?? null,
		restrictions: data.restrictions ?? {},
		reactionAdded: data.reactionAdded ?? true,
		reactionRemoved: data.reactionRemoved ?? false,
		interval: data.interval ?? null,
		cron: data.cron ?? null,
	};

	if (doc.triggerType === 'interval' || doc.triggerType === 'crontab') {
		doc.nextRunAt = computeInitialNextRun(doc.triggerType, doc.interval, doc.cron);
	}

	const command = await CustomCommand.create(doc);
	return command.toObject();
}

export async function updateCommand(guildId, ccid, updates) {
	const command = await getCommand(guildId, ccid);
	if (!command) return null;

	command.set(updates);
	if (command.triggerType === 'interval' || command.triggerType === 'crontab') {
		command.nextRunAt = computeInitialNextRun(command.triggerType, command.interval, command.cron);
	}
	else {
		command.nextRunAt = null;
	}
	await command.save();
	return command.toObject();
}

export async function removeCommand(guildId, ccid) {
	const command = await CustomCommand.findOneAndDelete({ guildId, ccid: Number(ccid) });
	return command ? command.toObject() : null;
}

// ---- Groups ----
export function sanitizeGroupBody(body) {
	if (typeof body !== 'object' || !body) throw new Error('Invalid body');
	const limits = getCustomCommandLimits();
	const out = {};
	if (body.name !== undefined) {
		if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > limits.maxGroupNameLength) throw new Error('Invalid group name');
		out.name = body.name.trim();
	}
	if (body.restrictions !== undefined) out.restrictions = sanitizeRestrictions(body.restrictions);
	return out;
}

export async function getGroups(guildId) {
	return CustomCommandGroup.find({ guildId }).sort({ name: 1 }).lean();
}

export async function createGroup(guildId, data) {
	const limits = getCustomCommandLimits();
	const count = await CustomCommandGroup.countDocuments({ guildId });
	if (count >= limits.maxGroups) {
		const error = new Error('Command group limit reached');
		error.code = 'CUSTOM_COMMAND_GROUP_LIMIT';
		error.limit = limits.maxGroups;
		throw error;
	}
	const group = await CustomCommandGroup.create({ guildId, name: data.name, restrictions: data.restrictions ?? {} });
	return group.toObject();
}

export async function updateGroup(guildId, groupId, updates) {
	const group = await CustomCommandGroup.findOne({ guildId, _id: groupId });
	if (!group) return null;
	group.set(updates);
	await group.save();
	return group.toObject();
}

export async function removeGroup(guildId, groupId) {
	const group = await CustomCommandGroup.findOneAndDelete({ guildId, _id: groupId });
	if (group) {
		await CustomCommand.updateMany({ guildId, groupId }, { $set: { groupId: null } });
	}
	return group ? group.toObject() : null;
}
// Executes custom commands: builds context + functions, runs the template,
// renders the response in the configured mode, and updates run stats.
import logger from '../logger.js';
import CustomCommand from '../../models/CustomCommand.js';
import CustomCommandGroup from '../../models/CustomCommandGroup.js';
import { compileTemplate, getBuiltinFunctions, Executor, CSlice, SDict } from './engine.js';
import { createContextFunctions } from './functions.js';
import { createDatabase } from './database.js';
import { buildContext } from './context.js';
import { checkRestrictions } from './triggers.js';
import { buildComponentsV2 as buildV2Payload, buildClassicRows } from './componentsBuilder.js';
import { getCustomCommandLimits } from './limits.js';
import { getAccentColor } from '../color.js';
import { ContainerBuilder, EmbedBuilder, MessageFlags } from 'discord.js';

const limits = getCustomCommandLimits();
const ignore = () => undefined;

function serializeValue(value) {
	if (value == null) return null;
	if (value instanceof CSlice) return Array.from(value);
	if (value instanceof SDict) return value.toJSON();
	if (value instanceof Date) return value.toISOString();
	if (typeof value === 'object') return JSON.parse(JSON.stringify(value));
	return value;
}

/**
 * Renders a custom command and returns { content, embeds, components } based
 * on the configured responseMode.
 */
export async function renderCustomCommand(ctx) {
	const { client, guild, channel, member, message, reaction, reactionAdded, reactionMessage, cc, prefix, args, cmdArgs, stripped, matchedText, execData, stackDepth, isEdit, interaction, interactionData } = ctx;

	const responseSource = cc.responses.length > 0 ? cc.responses[Math.floor(Math.random() * cc.responses.length)] : '';

	// Parse once so associated templates are available to execTemplate etc.
	let ast;
	try {
		ast = compileTemplate(responseSource);
	}
	catch (e) {
		await CustomCommand.updateOne(
			{ guildId: guild?.id, ccid: cc.ccid },
			{ $set: { lastError: `Syntax: ${e.message}` } },
		).catch(ignore);
		return { ok: false, error: e.message, ran: true };
	}

	const db = createDatabase(guild?.id ?? '0');
	const dot = buildContext({
		client,
		guild,
		channel,
		member,
		user: member?.user,
		message,
		cc,
		prefix,
		args,
		cmdArgs,
		stripped,
		matchedText,
		execData,
		stackDepth,
		isEdit,
		reaction,
		reactionAdded,
		reactionMessage,
		interaction,
		interactionData,
	});

	const functionCtx = {
		client,
		guild,
		channel,
		message,
		member,
		user: member?.user,
		guildId: guild?.id ?? '0',
		db,
		ccid: cc.ccid,
		assocTemplates: ast.tmpls,
		responseMessage: null,
		scheduleExec: (ccID, targetChannel, delay, data) => scheduleExecCC(guild, ccID, targetChannel, delay, data),
		scheduleUnique: (ccID, targetChannel, delay, key, data) => scheduleUniqueCC(guild, ccID, targetChannel, delay, key, data),
		cancelScheduled: (ccID, key) => cancelScheduledCC(guild, ccID, key),
		setEphemeral: flag => { ephemeral = flag; },
		sendModalFn: ctx.sendModalFn ?? null,
		updateMessage: ctx.updateMessage ?? null,
		sendInteractionResponse: ctx.sendInteractionResponse ?? null,
		buildV2: data => buildComponentsV2(data, guild?.id),
		sendEmbed: (embedData) => buildEmbedFromData(embedData),
	};
	let ephemeral = false;

	const functions = {
		...getBuiltinFunctions(),
		...createContextFunctions(functionCtx),
	};

	const executor = new Executor(functions);
	executor.funcs.execTemplate = (name, data) => executor.execAssociated(name, data);

	try {
		const output = await executor.execute(ast, dot);
		await CustomCommand.updateOne(
			{ guildId: guild?.id, ccid: cc.ccid },
			{ $inc: { runCount: 1 }, $set: { lastRunAt: new Date(), lastError: null } },
		).catch(ignore);

		return {
			ok: true,
			ran: true,
			output,
			ephemeral,
			dot,
			executor,
			cc,
		};
	}
	catch (e) {
		await CustomCommand.updateOne(
			{ guildId: guild?.id, ccid: cc.ccid },
			{ $set: { lastError: e.message } },
		).catch(ignore);
		return { ok: false, error: e.message, ran: true, ephemeral };
	}
}

/**
 * Sends a rendered custom command's output to a channel in the configured mode.
 */
export async function sendResponse(target, rendered, guildId) {
	if (!rendered || rendered.output == null) return;
	const content = String(rendered.output);
	if (content.trim() === '') return;

	const mode = rendered.cc?.responseMode ?? 'componentsV2';
	const ephemeral = rendered.ephemeral ?? false;
	const payload = {};

	if (mode === 'text') {
		payload.content = content;
	}
	else if (mode === 'embed') {
		payload.embeds = [
			new EmbedBuilder()
				.setDescription(content)
				.setColor(await getAccentColor(guildId)),
		];
	}
	else {
		const container = new ContainerBuilder()
			.setAccentColor(await getAccentColor(guildId))
			.addTextDisplayComponents(textDisplay =>
				textDisplay.setContent(content),
			);
		payload.components = [container];
		payload.flags = MessageFlags.IsComponentsV2;
		if (ephemeral) payload.flags |= MessageFlags.Ephemeral;
	}

	try {
		const sent = await target.send(payload);
		if (rendered.dot?.__meta && rendered.executor) {
			// expose response message for addResponseReactions
			rendered.dot.__meta.responseMessage = sent;
		}
		return sent;
	}
	catch (e) {
		logger.warn(`Failed to send custom command response: ${e.message}`);
		return null;
	}
}

/**
 * Builds a full sendable payload from a template message value. This supports
 * both the V2 componentBuilder output and classic complexMessage output
 * (buttons/menus/components), embeds, and the meta keys silent/ephemeral/reply.
 * @param {object} data - componentBuilder or complexMessage output
 * @param {string} [guildId]
 * @returns {Promise<object>}
 */
export async function buildComponentsV2(data, guildId) {
	const raw = toJsonMessage(data) ?? {};
	const payload = {};

	if (raw.content != null) payload.content = String(raw.content);

	// Components V2 layout via componentBuilder output.
	const isV2Payload = Boolean(
		raw.__componentsV2 ||
		(raw.text || raw.section || raw.gallery || raw.file || raw.separator || raw.container || raw.interactive_components),
	);
	if (isV2Payload) {
		const { components, files } = await buildV2Payload(raw.__componentsV2 ? raw.data : raw, guildId);
		if (components.length > 0) {
			payload.components = components;
			payload.flags = (payload.flags ?? 0) | MessageFlags.IsComponentsV2;
		}
		if (files.length > 0) payload.files = files;
	}
	// Classic components from complexMessage (buttons/menus/components rows).
	else if (raw.buttons || raw.menus || raw.components) {
		payload.components = buildClassicRows(raw);
	}

	if (raw.embeds || raw.embed) {
		const embeds = raw.embeds ?? (raw.embed ? [raw.embed] : []);
		payload.embeds = embeds.map(buildEmbedFromData);
	}

	// Meta keys.
	if (raw.silent !== undefined) {
		if (raw.silent) payload.flags = (payload.flags ?? 0) | MessageFlags.SuppressNotifications;
	}
	if (raw.ephemeral) {
		payload.flags = (payload.flags ?? 0) | MessageFlags.Ephemeral;
	}
	if (raw.reply && (raw.reply.message_id || raw.reply.messageId)) {
		payload.reply = { messageReference: String(raw.reply.message_id ?? raw.reply.messageId) };
	}
	if (raw.allowed_mentions) {
		const mentions = toJsonMessage(raw.allowed_mentions);
		payload.allowedMentions = {
			users: mentions.users ? String(mentions.users).split(',') : undefined,
			roles: mentions.roles ? String(mentions.roles).split(',') : undefined,
			everyone: mentions.everyone === true || mentions.everyone === 'true',
			repliedUser: mentions.replied_user === true || mentions.replied_user === 'true',
		};
	}

	return payload;
}

function buildEmbedFromData(embedData) {
	const d = toJsonMessage(embedData) ?? {};
	const builder = new EmbedBuilder();
	if (d.title) builder.setTitle(String(d.title));
	if (d.description) builder.setDescription(String(d.description));
	if (d.color != null) builder.setColor(d.color);
	if (d.url) builder.setURL(String(d.url));
	if (d.timestamp) builder.setTimestamp(new Date(String(d.timestamp)));
	if (d.author) {
		const author = toJsonMessage(d.author);
		builder.setAuthor({ name: String(author.name ?? ''), url: author.url ?? undefined, iconURL: author.icon_url ?? author.iconUrl ?? undefined });
	}
	if (d.thumbnail) builder.setThumbnail(String(toJsonMessage(d.thumbnail).url ?? ''));
	if (d.image) builder.setImage(String(toJsonMessage(d.image).url ?? ''));
	if (d.footer) {
		const footer = toJsonMessage(d.footer);
		builder.setFooter({ text: String(footer.text ?? ''), iconURL: footer.icon_url ?? footer.iconUrl ?? undefined });
	}
	for (const field of d.fields ?? []) {
		const f = toJsonMessage(field);
		builder.addFields({ name: String(f.name ?? ''), value: String(f.value ?? ''), inline: Boolean(f.inline) });
	}
	return builder;
}

function toJsonMessage(value) {
	if (value == null) return value;
	if (typeof value.toJSON === 'function') return value.toJSON();
	if (typeof value === 'object') {
		const out = {};
		for (const key of Object.keys(value)) {
			if (typeof value[key] === 'function') continue;
			out[key] = value[key];
		}
		return out;
	}
	return value;
}

/**
 * Full pipeline: restrictions -> render -> send.
 */
export async function runCustomCommand({ client, guild, channel, member, message, reaction, reactionAdded, reactionMessage, cc, prefix, args, cmdArgs, stripped, matchedText, execData, stackDepth, isEdit }) {
	if (!cc.enabled) return null;

	// Load group restrictions.
	let group = null;
	if (cc.groupId) {
		group = await CustomCommandGroup.findOne({ guildId: guild?.id, _id: cc.groupId }).lean().catch(() => null);
	}

	// Restrictions only apply to user-triggered runs (not scheduled).
	if (member && message) {
		const allowed = await checkRestrictions(guild, member, channel, cc, group);
		if (!allowed) return null;
	}

	const rendered = await renderCustomCommand({
		client,
		guild,
		channel,
		member,
		message,
		reaction,
		reactionAdded,
		reactionMessage,
		cc,
		prefix,
		args,
		cmdArgs,
		stripped,
		matchedText,
		execData,
		stackDepth,
		isEdit,
	});

	if (!rendered.ok) return rendered;
	if (rendered.output == null || String(rendered.output).trim() === '') return rendered;

	// If the template already sent a message via sendMessage, still send the
	// response output per YAGPDB behaviour.
	const targetChannel = channel ?? guild?.systemChannel ?? null;
	if (targetChannel?.send) {
		await sendResponse(targetChannel, rendered, guild?.id);
	}
	return rendered;
}

async function scheduleExecCC(guild, ccID, targetChannel, delay, data) {
	const ms = Number(delay ?? 0) * 1000;
	setTimeout(async () => {
		const cc = await CustomCommand.findOne({ guildId: guild?.id, ccid: Number(ccID) }).catch(() => null);
		if (!cc || !cc.enabled) return;
		let channel = guild?.channels?.cache?.get(String(targetChannel ?? '')) ?? null;
		if (!channel && cc.triggerType === 'interval' && cc.interval?.channelId) {
			channel = guild?.channels?.cache?.get(cc.interval.channelId) ?? null;
		}
		if (!channel) return;
		await runCustomCommand({
			client: guild.client,
			guild,
			channel,
			cc,
			execData: data,
			stackDepth: 1,
		}).catch(e => logger.warn(`execCC failed: ${e.message}`));
	}, Math.min(ms, Number.MAX_SAFE_INTEGER));
	return null;
}

async function scheduleUniqueCC(guild, ccID, targetChannel, delay, key, data) {
	// One scheduled execution per (guild, key).
	const mapKey = `${guild?.id}:${ccID}:${key}`;
	const ms = Number(delay ?? 0) * 1000;
	if (globalThis.__ccScheduled?.has(mapKey)) return null;
	if (!globalThis.__ccScheduled) globalThis.__ccScheduled = new Set();
	globalThis.__ccScheduled.add(mapKey);

	setTimeout(async () => {
		globalThis.__ccScheduled.delete(mapKey);
		const cc = await CustomCommand.findOne({ guildId: guild?.id, ccid: Number(ccID) }).catch(() => null);
		if (!cc || !cc.enabled) return;
		const channel = guild?.channels?.cache?.get(String(targetChannel ?? '')) ?? null;
		if (!channel) return;
		await runCustomCommand({
			client: guild.client,
			guild,
			channel,
			cc,
			execData: data,
			stackDepth: 1,
		}).catch(e => logger.warn(`scheduleUniqueCC failed: ${e.message}`));
	}, Math.min(ms, Number.MAX_SAFE_INTEGER));
	return null;
}

async function cancelScheduledCC(guild, ccID, key) {
	const mapKey = `${guild?.id}:${ccID}:${key}`;
	if (globalThis.__ccScheduled) globalThis.__ccScheduled.delete(mapKey);
	return null;
}

export { serializeValue, limits };

// Converts YAGPDB-style componentBuilder / cbutton / cmenu / complexMessage /
// cembed template output into real discord.js message payloads.
//
// Two component systems are supported, matching YAGPDB's docs:
//  - Components V2 (containers, sections, galleries, files) built via
//    componentBuilder and sent as V2 messages.
//  - Classic components (buttons & select menus in action rows) built via
//    complexMessage with "buttons"/"menus"/"components".
import {
	ActionRowBuilder,
	AttachmentBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelSelectMenuBuilder,
	ContainerBuilder,
	FileBuilder,
	MediaGalleryBuilder,
	MentionableSelectMenuBuilder,
	RoleSelectMenuBuilder,
	SectionBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	StringSelectMenuBuilder,
	TextDisplayBuilder,
	ThumbnailBuilder,
	UserSelectMenuBuilder,
} from 'discord.js';
import { getAccentColor } from '../color.js';
import { SDict, CSlice } from './engine.js';

export function toJson(value) {
	if (value == null) return value;
	if (value instanceof SDict) return value.toJSON();
	if (value instanceof CSlice) return Array.from(value);
	if (Array.isArray(value)) return value.map(toJson);
	if (typeof value === 'object') {
		const out = {};
		for (const key of Object.keys(value)) {
			if (typeof value[key] === 'function') continue;
			out[key] = toJson(value[key]);
		}
		return out;
	}
	return value;
}

export function normalizeList(value) {
	if (value == null) return [];
	if (Array.isArray(value) || value instanceof CSlice) return Array.from(value);
	return [value];
}

function buttonStyleName(style) {
	if (typeof style === 'number') return style;
	const value = String(style ?? '').toLowerCase();
	const map = {
		primary: ButtonStyle.Primary,
		secondary: ButtonStyle.Secondary,
		success: ButtonStyle.Success,
		danger: ButtonStyle.Danger,
		link: ButtonStyle.Link,
	};
	return map[value] ?? ButtonStyle.Primary;
}

function toEmoji(emoji) {
	if (emoji == null) return null;
	if (typeof emoji === 'string') return emoji;
	return toJson(emoji);
}

/**
 * Builds a ButtonBuilder from a cbutton template value (sdict or key/value object).
 * Matches the docs: style accepts int or alias, `disabled` and `emoji` supported,
 * link buttons require `url` and no custom_id.
 * @param {object} button
 * @returns {ButtonBuilder}
 */
export function buildButton(button) {
	const data = toJson(button) ?? {};
	const url = data.url ? String(data.url) : null;
	const label = String(data.label ?? '');
	const emoji = toEmoji(data.emoji);
	const builder = new ButtonBuilder().setStyle(url ? ButtonStyle.Link : buttonStyleName(data.style));
	if (label) builder.setLabel(label);
	if (url) builder.setURL(url);
	else if (data.custom_id) builder.setCustomId(String(data.custom_id));
	if (data.disabled !== undefined) builder.setDisabled(Boolean(data.disabled));
	if (emoji) builder.setEmoji(emoji);
	return builder;
}

function matchMenuType(type) {
	const value = String(type ?? 'text').toLowerCase();
	switch (value) {
	case 'user':
		return { kind: 'user', Builder: UserSelectMenuBuilder };
	case 'role':
		return { kind: 'role', Builder: RoleSelectMenuBuilder };
	case 'channel':
		return { kind: 'channel', Builder: ChannelSelectMenuBuilder };
	case 'mentionable':
		return { kind: 'mentionable', Builder: MentionableSelectMenuBuilder };
	default:
		return { kind: 'text', Builder: StringSelectMenuBuilder };
	}
}

/**
 * Builds a select menu from a cmenu template value (sdict or key/value object).
 * Matches the docs: type-specific builders, `channel_types`, `default_values`,
 * per-option `default`/`emoji`/`description`, `min_values`/`max_values`.
 * @param {object} menu
 * @returns {StringSelectMenuBuilder|UserSelectMenuBuilder|RoleSelectMenuBuilder|ChannelSelectMenuBuilder|MentionableSelectMenuBuilder}
 */
export function buildMenu(menu) {
	const data = toJson(menu) ?? {};
	const { kind, Builder } = matchMenuType(data.type);
	const builder = new Builder();

	if (data.custom_id) builder.setCustomId(String(data.custom_id));
	if (data.placeholder) builder.setPlaceholder(String(data.placeholder));
	if (data.min_values != null) builder.setMinValues(Number(data.min_values));
	if (data.max_values != null) builder.setMaxValues(Number(data.max_values));
	if (data.disabled !== undefined) builder.setDisabled(Boolean(data.disabled));

	if (kind === 'text') {
		const options = normalizeList(data.options ?? []);
		builder.addOptions(options.map(option => {
			const o = toJson(option) ?? {};
			return {
				label: String(o.label ?? 'Option'),
				value: String(o.value ?? o.label ?? 'option'),
				description: o.description ? String(o.description) : undefined,
				emoji: toEmoji(o.emoji) ?? undefined,
				default: Boolean(o.default),
			};
		}));
	}
	else if (kind === 'channel' && data.channel_types) {
		builder.setChannelTypes(normalizeList(data.channel_types).map(Number));
	}
	if (kind !== 'text' && data.default_values) {
		builder.setDefaultValues(normalizeList(data.default_values).map(toJson));
	}
	return builder;
}

/**
 * Builds classic action rows from a complexMessage payload.
 * - "buttons"  -> one action row per 5 buttons
 * - "menus"    -> one action row per menu
 * - "components" -> either a slice of slices (pre-defined rows) or a slice
 *   of components to be auto-distributed 5-per-row
 * @param {object} content - complex message object
 * @returns {ActionRowBuilder[]}
 */
export function buildClassicRows(content) {
	const rows = [];
	const rowsFrom = (components) => {
		for (let i = 0; i < components.length; i += 5) {
			rows.push(new ActionRowBuilder().addComponents(components.slice(i, i + 5)));
		}
	};

	if (content.buttons) {
		rowsFrom(normalizeList(content.buttons).map(b => buildButton(b)));
	}

	if (content.menus) {
		for (const menu of normalizeList(content.menus)) {
			rows.push(new ActionRowBuilder().addComponents(buildMenu(menu)));
		}
	}

	if (content.components) {
		const components = normalizeList(content.components);
		// Pre-defined rows: each element is itself a slice.
		if (components.every(item => Array.isArray(item))) {
			for (const rowItems of components) {
				if (rowItems.length === 0) continue;
				rows.push(new ActionRowBuilder().addComponents(rowItems.map(item => buildComponentItem(item))));
			}
		}
		else {
			rowsFrom(components.map(item => buildComponentItem(item)));
		}
	}

	return rows;
}

function buildComponentItem(item) {
	const data = toJson(item) ?? {};
	if (Object.prototype.hasOwnProperty.call(data, 'options') || (data.type && data.type !== 'text')) {
		return buildMenu(data);
	}
	return buildButton(data);
}

const COLLECTION_KEYS = new Set(['text', 'section', 'gallery', 'file', 'separator', 'buttons', 'menus', 'interactive_components', 'container']);

/**
 * Accumulates entries into a builder's data object. Collection keys append,
 * meta keys (content, silent, ephemeral...) override.
 */
export function addBuilderEntry(data, key, value) {
	if (COLLECTION_KEYS.has(key)) {
		const list = data[key] ?? [];
		if (Array.isArray(value) || value instanceof CSlice) data[key] = [...list, ...Array.from(value)];
		else data[key] = [...list, value];
	}
	else {
		data[key] = value;
	}
}

/**
 * Builds real Components V2 components + attachments from a componentBuilder
 * data object (or the object returned by componentBuilder).
 * @param {object} data
 * @param {string} [guildId]
 * @returns {Promise<{components: Array, files: Array}>}
 */
export async function buildComponentsV2(data, guildId) {
	const raw = toJson(data) ?? {};
	const files = [];
	const components = [];

	const resolveColor = async (color) => {
		if (color == null) return undefined;
		if (color === 'accent' || color.source === 'accent') return await getAccentColor(guildId);
		if (color.source === 'custom' || typeof color === 'string' && /^#?[0-9a-fA-F]{6}$/.test(color)) {
			const hex = typeof color === 'string' ? color : color.value;
			return parseInt(String(hex).replace('#', ''), 16);
		}
		if (typeof color === 'number') return color;
		return undefined;
	};

	const addText = (container, content) => {
		if (content == null) return;
		for (const piece of normalizeList(content)) {
			container.addTextDisplayComponents(new TextDisplayBuilder().setContent(String(piece)));
		}
	};

	// Flatten a `components` sub-builder/list into the definition object.
	const expandInner = async (definition) => {
		const def = toJson(definition) ?? {};
		if (def.components) {
			const innerData = def.components?.__componentsV2 ? def.components.data : def.components;
			const list = normalizeList(innerData).flat().map(toJson);
			for (const entry of list) {
				for (const key of Object.keys(entry ?? {})) {
					if (!(key in def)) def[key] = entry[key];
				}
			}
		}
		return def;
	};

	const buildContainer = async (definition) => {
		const def = await expandInner(definition);
		const container = new ContainerBuilder();
		if (def.spoiler) container.setSpoiler(true);
		const accent = await resolveColor(def.color ?? def.accentColor);
		if (accent != null) container.setAccentColor(accent);

		if (def.text) addText(container, def.text);

		for (const section of normalizeList(def.section)) {
			const sec = toJson(section);
			const builder = new SectionBuilder();
			addText(builder, sec?.text);
			if (sec?.button) builder.setButtonAccessory(buildButton(sec.button));
			if (sec?.thumbnail) {
				const thumb = toJson(sec.thumbnail);
				const thumbnail = new ThumbnailBuilder().setURL(String(thumb.media ?? thumb.url ?? ''));
				if (thumb.description) thumbnail.setDescription(String(thumb.description));
				thumbnail.setSpoiler(Boolean(thumb.spoiler));
				builder.setThumbnailAccessory(thumbnail);
			}
			container.addSectionComponents(builder);
		}

		for (const item of normalizeList(def.gallery)) {
			const galleryData = toJson(item) ?? {};
			const items = galleryData.media || galleryData.url ? [galleryData] : normalizeList(galleryData.items ?? galleryData);
			const gallery = new MediaGalleryBuilder();
			for (const media of items) {
				const m = typeof media === 'string' ? { media } : toJson(media);
				gallery.addItems(builder => {
					builder.setURL(String(m.media ?? m.url ?? ''));
					builder.setSpoiler(Boolean(m.spoiler));
					if (m.description) builder.setDescription(String(m.description));
					return builder;
				});
			}
			container.addMediaGalleryComponents(gallery);
		}

		for (const file of normalizeList(def.file)) {
			const fileData = toJson(file) ?? {};
			const name = String(fileData.name ?? `file_${files.length + 1}.txt`);
			const content = String(fileData.content ?? '');
			files.push(new AttachmentBuilder(Buffer.from(content, 'utf8'), { name }));
			container.addFileComponents(new FileBuilder().setURL(`attachment://${name}`));
		}

		for (const sep of normalizeList(def.separator)) {
			// true => large, false/nil => small
			const large = sep === true;
			container.addSeparatorComponents(
				new SeparatorBuilder()
					.setDivider(true)
					.setSpacing(large ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small),
			);
		}

		const interactive = [
			...(normalizeList(def.buttons)),
			...(normalizeList(def.interactive_components)),
		];
		const menus = normalizeList(def.menus);

		if (interactive.length) {
			const built = interactive.map(buildComponentItem);
			for (let i = 0; i < built.length; i += 5) {
				container.addActionRowComponents(new ActionRowBuilder().addComponents(built.slice(i, i + 5)));
			}
		}

		for (const menu of menus) {
			container.addActionRowComponents(new ActionRowBuilder().addComponents(buildMenu(menu)));
		}

		return container;
	};

	for (const nested of normalizeList(raw.container)) {
		components.push(await buildContainer(nested));
	}

	// Top-level message fields map to a single container.
	if (raw.text || raw.section || raw.gallery || raw.file || raw.separator || raw.buttons || raw.menus || raw.interactive_components) {
		components.push(await buildContainer(raw));
	}

	return { components, files };
}
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	MediaGalleryBuilder,
	SectionBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	TextDisplayBuilder,
	ThumbnailBuilder,
} from 'discord.js';
import { getAccentColor, getErrorColor } from './color.js';

const LIMITS = {
	maxContainers: 4,
	maxBlocksPerContainer: 10,
	maxTotalComponents: 40,
	maxGalleryItems: 10,
	maxButtons: 5,
	maxTotalTextLength: 4000,
};

function isHttpsUrl(value, maxLength = 2048) {
	if (typeof value !== 'string' || value.length > maxLength) return false;
	try {
		return new URL(value).protocol === 'https:';
	}
	catch {
		return false;
	}
}

function validateText(value, max = 4000) {
	return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function countBlockComponents(block) {
	if (block.type === 'section') return 3;
	if (block.type === 'buttons') return 1 + (block.buttons?.length ?? 0);
	return 1;
}

function validateComponentsV2Template(template) {
	if (template === null || template === undefined) return true;
	if (!template || template.version !== 1 || !Array.isArray(template.containers) || template.containers.length < 1 || template.containers.length > LIMITS.maxContainers) return false;
	let componentCount = template.containers.length;
	let totalTextLength = 0;
	for (const container of template.containers) {
		if (!container || !['accent', 'error', 'custom', 'none'].includes(container.colorSource) || !Array.isArray(container.blocks) || container.blocks.length < 1 || container.blocks.length > LIMITS.maxBlocksPerContainer) return false;
		if (container.spoiler !== undefined && typeof container.spoiler !== 'boolean') return false;
		if (container.colorSource === 'custom' && !/^#[0-9a-fA-F]{6}$/.test(container.customColor)) return false;
		for (const block of container.blocks) {
			if (!block || !['text', 'separator', 'gallery', 'section', 'buttons'].includes(block.type)) return false;
			componentCount += countBlockComponents(block);
			if (block.type === 'text') {
				if (!validateText(block.content)) return false;
				totalTextLength += block.content.length;
			}
			if (block.type === 'separator' && (!['small', 'large'].includes(block.spacing) || (block.divider !== undefined && typeof block.divider !== 'boolean'))) return false;
			if (block.type === 'gallery') {
				if (!Array.isArray(block.items) || block.items.length < 1 || block.items.length > LIMITS.maxGalleryItems) return false;
				if (block.items.some(item => !isHttpsUrl(item.url) || (item.description && !validateText(item.description, 1024)) || (item.spoiler !== undefined && typeof item.spoiler !== 'boolean'))) return false;
			}
			if (block.type === 'section') {
				if (!validateText(block.content) || !['thumbnail', 'button'].includes(block.accessoryType)) return false;
				totalTextLength += block.content.length;
				if (block.accessoryType === 'thumbnail' && (!isHttpsUrl(block.url) || (block.description && !validateText(block.description, 1024)) || (block.spoiler !== undefined && typeof block.spoiler !== 'boolean'))) return false;
				if (block.accessoryType === 'button' && (!validateText(block.label, 80) || !isHttpsUrl(block.url, 512))) return false;
			}
			if (block.type === 'buttons') {
				if (!Array.isArray(block.buttons) || block.buttons.length < 1 || block.buttons.length > LIMITS.maxButtons) return false;
				if (block.buttons.some(button => !validateText(button.label, 80) || !isHttpsUrl(button.url, 512))) return false;
			}
		}
	}
	return componentCount <= LIMITS.maxTotalComponents && totalTextLength <= LIMITS.maxTotalTextLength;
}

function renderTemplateText(value, variables) {
	let result = String(value);
	for (const [key, replacement] of Object.entries(variables)) result = result.replaceAll(`{${key}}`, replacement);
	return result;
}

async function buildComponentsV2Template(guildId, template, variables) {
	if (!validateComponentsV2Template(template)) throw new Error('Invalid Components V2 template');
	const containers = [];
	for (const definition of template.containers) {
		const container = new ContainerBuilder().setSpoiler(Boolean(definition.spoiler));
		if (definition.colorSource === 'accent') container.setAccentColor(await getAccentColor(guildId));
		if (definition.colorSource === 'error') container.setAccentColor(await getErrorColor(guildId));
		if (definition.colorSource === 'custom') container.setAccentColor(parseInt(definition.customColor.replace('#', ''), 16));
		for (const block of definition.blocks) {
			if (block.type === 'text') container.addTextDisplayComponents(new TextDisplayBuilder().setContent(renderTemplateText(block.content, variables)));
			if (block.type === 'separator') container.addSeparatorComponents(new SeparatorBuilder().setDivider(block.divider !== false).setSpacing(block.spacing === 'large' ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small));
			if (block.type === 'gallery') {
				const gallery = new MediaGalleryBuilder();
				for (const item of block.items) {
					gallery.addItems(builder => {
						builder.setURL(item.url).setSpoiler(Boolean(item.spoiler));
						if (item.description) builder.setDescription(renderTemplateText(item.description, variables));
						return builder;
					});
				}
				container.addMediaGalleryComponents(gallery);
			}
			if (block.type === 'section') {
				const section = new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(renderTemplateText(block.content, variables)));
				if (block.accessoryType === 'thumbnail') {
					const thumbnail = new ThumbnailBuilder().setURL(block.url).setSpoiler(Boolean(block.spoiler));
					if (block.description) thumbnail.setDescription(renderTemplateText(block.description, variables));
					section.setThumbnailAccessory(thumbnail);
				}
				else {section.setButtonAccessory(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(block.label).setURL(block.url));}
				container.addSectionComponents(section);
			}
			if (block.type === 'buttons') {
				container.addActionRowComponents(new ActionRowBuilder().addComponents(block.buttons.map(button => new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(button.label).setURL(button.url))));
			}
		}
		containers.push(container);
	}
	return containers;
}

export { buildComponentsV2Template, LIMITS as componentsV2TemplateLimits, validateComponentsV2Template };

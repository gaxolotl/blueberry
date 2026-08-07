import { ContainerBuilder, SeparatorSpacingSize, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { getAccentColor, getErrorColor } from '../color.js';
import { emojis } from '../emoji.js';
import { t } from '../i18n.js';

const HTML_ENTITIES = {
	'amp': '&',
	'lt': '<',
	'gt': '>',
	'quot': '"',
	'#39': '\'',
	'nbsp': ' ',
};

function stripHtml(html) {
	return String(html)
		.replace(/<[^>]*>/g, '')
		.replace(/&([a-z#0-9]+);/gi, (match, entity) => HTML_ENTITIES[entity.toLowerCase()] ?? match)
		.trim();
}

function formatBytes(bytes) {
	if (!bytes) return '';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function buildPatchNoteContainer(guildId, note, options = {}) {
	const { showDownloads = true, showChangelog = true, mentionRoleId = null } = options;
	const color = await getAccentColor(guildId);

	const container = new ContainerBuilder().setAccentColor(color);
	if (mentionRoleId) {
		container.addTextDisplayComponents(textDisplay => textDisplay.setContent(`<@&${mentionRoleId}>`));
	}
	container
		.addTextDisplayComponents(textDisplay =>
			textDisplay.setContent(
				[
					`# ${note.title}`,
					`-# ${note.sourceLabel}${note.publishedAt ? ` • <t:${Math.floor(new Date(note.publishedAt).getTime() / 1000)}:R>` : ''}`,
				].join('\n'),
			),
		);

	if (showChangelog && note.content) {
		const changelog = stripHtml(note.content).slice(0, 1500);
		container.addSeparatorComponents(separator =>
			separator.setSpacing(SeparatorSpacingSize.Small).setDivider(true),
		);
		container.addTextDisplayComponents(textDisplay =>
			textDisplay.setContent(changelog),
		);
	}

	if (showDownloads && note.assets?.length) {
		const downloadsLabel = await t(guildId, 'patch_notes_post_downloads');
		container.addSeparatorComponents(separator =>
			separator.setSpacing(SeparatorSpacingSize.Small).setDivider(true),
		);
		container.addTextDisplayComponents(textDisplay =>
			textDisplay.setContent(
				`### ${emojis.fileimage} ${downloadsLabel}\n` +
				note.assets.slice(0, 5).map(asset =>
					`- [${asset.name}](${asset.url})${asset.size ? ` \`(${formatBytes(asset.size)})\`` : ''}`,
				).join('\n'),
			),
		);
	}

	if (note.link) {
		const viewReleaseLabel = await t(guildId, 'patch_notes_post_view_release');
		container.addSeparatorComponents(separator =>
			separator.setSpacing(SeparatorSpacingSize.Small).setDivider(false),
		);
		container.addActionRowComponents(
			new ActionRowBuilder().addComponents(
				new ButtonBuilder()
					.setLabel(viewReleaseLabel)
					.setStyle(ButtonStyle.Link)
					.setURL(note.link),
			),
		);
	}

	return container;
}

export async function buildPatchNoteTextContainer(guildId, content, isError = false) {
	const color = isError ? await getErrorColor(guildId) : await getAccentColor(guildId);
	return new ContainerBuilder()
		.setAccentColor(color)
		.addTextDisplayComponents(textDisplay => textDisplay.setContent(content));
}

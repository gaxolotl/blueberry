import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelSelectMenuBuilder,
	ChannelType,
	ContainerBuilder,
	MessageFlags,
	ModalBuilder,
	PermissionFlagsBits,
	RoleSelectMenuBuilder,
	SeparatorSpacingSize,
	SlashCommandBuilder,
	StringSelectMenuBuilder,
	TextInputBuilder,
	TextInputStyle,
} from 'discord.js';
import logger from '../../utils/logger.js';
import { addPatchNoteSource, getPatchNoteConfig, getPatchNoteLimits, removePatchNoteSource, updatePatchNoteConfig } from '../../utils/patchNotes/config.js';
import { parseGithubUrl, validateGithubToken } from '../../utils/patchNotes/fetcher.js';
import { buildPatchNoteTextContainer } from '../../utils/patchNotes/formatter.js';
import { t, tError } from '../../utils/i18n.js';
import { emojis } from '../../utils/emoji.js';
import { getAccentColor } from '../../utils/color.js';

const CONFIG_PREFIX = 'pncfg';

async function buildBackRow(guildId) {
	return new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId(`${CONFIG_PREFIX}:home`)
			.setLabel(await t(guildId, 'patch_notes_back_btn'))
			.setEmoji(emojis.chevronleft)
			.setStyle(ButtonStyle.Secondary),
	);
}

async function buildHomeContainer(guildId, patchConfig) {
	const title = await t(guildId, 'patch_notes_cfg_title', { emoji: emojis.chartnoaxescombined });
	const placeholder = await t(guildId, 'patch_notes_cfg_select_placeholder');
	const channelLabel = await t(guildId, 'patch_notes_cfg_nav_channel');
	const channelDescription = await t(guildId, 'patch_notes_cfg_nav_channel_desc');
	const sourcesLabel = await t(guildId, 'patch_notes_cfg_nav_sources');
	const sourcesDescription = await t(guildId, 'patch_notes_cfg_nav_sources_desc');
	const optionsLabel = await t(guildId, 'patch_notes_cfg_nav_options');
	const optionsDescription = await t(guildId, 'patch_notes_cfg_nav_options_desc');
	const enabledText = await t(guildId, patchConfig.enabled ? 'term_enabled_short' : 'term_disabled');
	const notSet = await t(guildId, 'patch_notes_not_set');
	const rssCount = patchConfig.sources.filter(source => source.type === 'rss').length;
	const githubCount = patchConfig.sources.filter(source => source.type === 'github').length;
	const limits = getPatchNoteLimits();
	const summary = await t(guildId, 'patch_notes_cfg_summary', {
		status: enabledText,
		channel: patchConfig.channelId ? `<#${patchConfig.channelId}>` : notSet,
		rssCount: rssCount.toString(),
		maxRss: limits.maxRssFeeds.toString(),
		githubCount: githubCount.toString(),
		maxGithub: limits.maxGithubTrackers.toString(),
	});

	return new ContainerBuilder()
		.setAccentColor(await getAccentColor(guildId))
		.addTextDisplayComponents(display => display.setContent(`## ${title}`))
		.addSeparatorComponents(separator => separator.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
		.addTextDisplayComponents(display => display.setContent(summary))
		.addActionRowComponents(new ActionRowBuilder().addComponents(
			new StringSelectMenuBuilder()
				.setCustomId(`${CONFIG_PREFIX}:nav`)
				.setPlaceholder(placeholder)
				.addOptions([
					{ label: channelLabel, description: channelDescription, value: 'channel', emoji: emojis.folder },
					{ label: sourcesLabel, description: sourcesDescription, value: 'sources', emoji: emojis.folders },
					{ label: optionsLabel, description: optionsDescription, value: 'options', emoji: emojis.settings },
				]),
		));
}

async function buildChannelContainer(guildId, patchConfig) {
	const channel = patchConfig.channelId ? `<#${patchConfig.channelId}>` : await t(guildId, 'patch_notes_not_set');
	const title = await t(guildId, 'patch_notes_cfg_channel_title', { emoji: emojis.folder });
	const current = await t(guildId, 'patch_notes_cfg_channel_current', { channel });
	const placeholder = await t(guildId, 'patch_notes_cfg_channel_placeholder');
	return new ContainerBuilder()
		.setAccentColor(await getAccentColor(guildId))
		.addTextDisplayComponents(display => display.setContent(`## ${title}`))
		.addSeparatorComponents(separator => separator.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
		.addTextDisplayComponents(display => display.setContent(current))
		.addActionRowComponents(new ActionRowBuilder().addComponents(
			new ChannelSelectMenuBuilder()
				.setCustomId(`${CONFIG_PREFIX}:channel:set`)
				.setPlaceholder(placeholder)
				.addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
		))
		.addSeparatorComponents(separator => separator.setSpacing(SeparatorSpacingSize.Small).setDivider(false))
		.addActionRowComponents(await buildBackRow(guildId));
}

async function buildSourcesContainer(guildId, patchConfig) {
	const limits = getPatchNoteLimits();
	const rssCount = patchConfig.sources.filter(source => source.type === 'rss').length;
	const githubCount = patchConfig.sources.filter(source => source.type === 'github').length;
	const atLimit = rssCount >= limits.maxRssFeeds && githubCount >= limits.maxGithubTrackers;
	const title = await t(guildId, 'patch_notes_cfg_sources_title', { emoji: emojis.folders });
	const description = await t(guildId, 'patch_notes_cfg_sources_desc', { rssCount: rssCount.toString(), maxRss: limits.maxRssFeeds.toString(), githubCount: githubCount.toString(), maxGithub: limits.maxGithubTrackers.toString() });
	const noneSet = await t(guildId, 'patch_notes_none_set');
	const container = new ContainerBuilder()
		.setAccentColor(await getAccentColor(guildId))
		.addTextDisplayComponents(display => display.setContent(`## ${title}`))
		.addSeparatorComponents(separator => separator.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
		.addTextDisplayComponents(display => display.setContent(description));

	if (patchConfig.sources.length) {
		container.addTextDisplayComponents(display => display.setContent(patchConfig.sources.map((source, index) =>
			`**${index + 1}. ${source.label}** \`(${source.type.toUpperCase()})\`\n-# ${source.url}`,
		).join('\n')));
	}
	else {
		container.addTextDisplayComponents(display => display.setContent(noneSet));
	}

	container
		.addActionRowComponents(new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId(`${CONFIG_PREFIX}:sources:add`)
				.setLabel(await t(guildId, 'patch_notes_cfg_add_source'))
				.setStyle(ButtonStyle.Primary)
				.setDisabled(atLimit),
			new ButtonBuilder()
				.setCustomId(`${CONFIG_PREFIX}:sources:remove`)
				.setLabel(await t(guildId, 'patch_notes_cfg_remove_source'))
				.setStyle(ButtonStyle.Danger)
				.setDisabled(!patchConfig.sources.length),
		))
		.addSeparatorComponents(separator => separator.setSpacing(SeparatorSpacingSize.Small).setDivider(false))
		.addActionRowComponents(await buildBackRow(guildId));
	return container;
}

async function buildSourceTypeContainer(guildId, patchConfig) {
	const limits = getPatchNoteLimits();
	const rssCount = patchConfig.sources.filter(source => source.type === 'rss').length;
	const githubCount = patchConfig.sources.filter(source => source.type === 'github').length;
	const options = [];
	const title = await t(guildId, 'patch_notes_add_source_title');
	const placeholder = await t(guildId, 'patch_notes_source_type_placeholder');
	if (rssCount < limits.maxRssFeeds) {
		options.push({ label: await t(guildId, 'patch_notes_source_rss'), description: await t(guildId, 'patch_notes_source_rss_desc'), value: 'rss' });
	}
	if (githubCount < limits.maxGithubTrackers) {
		options.push({ label: await t(guildId, 'patch_notes_source_github'), description: await t(guildId, 'patch_notes_source_github_desc'), value: 'github' });
	}
	return new ContainerBuilder()
		.setAccentColor(await getAccentColor(guildId))
		.addTextDisplayComponents(display => display.setContent(`## ${title}`))
		.addActionRowComponents(new ActionRowBuilder().addComponents(
			new StringSelectMenuBuilder()
				.setCustomId(`${CONFIG_PREFIX}:sources:type`)
				.setPlaceholder(placeholder)
				.addOptions(options),
		))
		.addActionRowComponents(await buildBackRow(guildId));
}

async function buildRemoveSourceContainer(guildId, patchConfig) {
	const title = await t(guildId, 'patch_notes_remove_source_title');
	const placeholder = await t(guildId, 'patch_notes_remove_source_placeholder');
	return new ContainerBuilder()
		.setAccentColor(await getAccentColor(guildId))
		.addTextDisplayComponents(display => display.setContent(`## ${title}`))
		.addActionRowComponents(new ActionRowBuilder().addComponents(
			new StringSelectMenuBuilder()
				.setCustomId(`${CONFIG_PREFIX}:sources:remove_select`)
				.setPlaceholder(placeholder)
				.addOptions(patchConfig.sources.map(source => ({ label: source.label.slice(0, 100), value: source.id, description: source.type.toUpperCase() }))),
		))
		.addActionRowComponents(await buildBackRow(guildId));
}

async function buildOptionsContainer(guildId, patchConfig) {
	const enabled = await t(guildId, patchConfig.enabled ? 'term_enabled_short' : 'term_disabled');
	const downloads = await t(guildId, patchConfig.showDownloads ? 'term_enabled_short' : 'term_disabled');
	const changelog = await t(guildId, patchConfig.showChangelog ? 'term_enabled_short' : 'term_disabled');
	const role = patchConfig.mentionRoleId ? `<@&${patchConfig.mentionRoleId}>` : await t(guildId, 'patch_notes_not_set');
	const title = await t(guildId, 'patch_notes_cfg_options_title', { emoji: emojis.settings });
	const summary = await t(guildId, 'patch_notes_cfg_options_summary', { enabled, downloads, changelog, role });
	const rolePlaceholder = await t(guildId, 'patch_notes_cfg_role_placeholder');
	return new ContainerBuilder()
		.setAccentColor(await getAccentColor(guildId))
		.addTextDisplayComponents(display => display.setContent(`## ${title}`))
		.addSeparatorComponents(separator => separator.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
		.addTextDisplayComponents(display => display.setContent(summary))
		.addActionRowComponents(new ActionRowBuilder().addComponents(
			new RoleSelectMenuBuilder()
				.setCustomId(`${CONFIG_PREFIX}:options:role`)
				.setPlaceholder(rolePlaceholder),
		))
		.addActionRowComponents(new ActionRowBuilder().addComponents(
			new ButtonBuilder().setCustomId(`${CONFIG_PREFIX}:options:toggle_downloads`).setLabel(await t(guildId, 'patch_notes_cfg_toggle_downloads')).setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId(`${CONFIG_PREFIX}:options:toggle_changelog`).setLabel(await t(guildId, 'patch_notes_cfg_toggle_changelog')).setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId(`${CONFIG_PREFIX}:options:toggle_enabled`).setLabel(await t(guildId, 'patch_notes_cfg_toggle_enabled')).setStyle(patchConfig.enabled ? ButtonStyle.Success : ButtonStyle.Danger),
			new ButtonBuilder().setCustomId(`${CONFIG_PREFIX}:options:clear_role`).setLabel(await t(guildId, 'patch_notes_cfg_clear_role')).setStyle(ButtonStyle.Secondary).setDisabled(!patchConfig.mentionRoleId),
		))
		.addSeparatorComponents(separator => separator.setSpacing(SeparatorSpacingSize.Small).setDivider(false))
		.addActionRowComponents(await buildBackRow(guildId));
}

async function showSourceModal(interaction, type) {
	const isGithub = type === 'github';
	const modal = new ModalBuilder()
		.setCustomId(`${CONFIG_PREFIX}:sources:modal:${type}`)
		.setTitle(await t(interaction.guildId, isGithub ? 'patch_notes_github_modal_title' : 'patch_notes_rss_modal_title'))
		.addComponents(
			new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('label').setLabel(await t(interaction.guildId, 'patch_notes_source_label')).setStyle(TextInputStyle.Short).setMaxLength(50).setRequired(true)),
			new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('url').setLabel(await t(interaction.guildId, isGithub ? 'patch_notes_github_url' : 'patch_notes_rss_url')).setStyle(TextInputStyle.Short).setMaxLength(500).setRequired(true)),
		);
	if (isGithub) {
		modal.addComponents(new ActionRowBuilder().addComponents(
			new TextInputBuilder().setCustomId('token').setLabel(await t(interaction.guildId, 'patch_notes_github_token')).setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(true),
		));
	}

	await interaction.showModal(modal);
	const submitted = await interaction.awaitModalSubmit({
		filter: modalInteraction => modalInteraction.customId === `${CONFIG_PREFIX}:sources:modal:${type}` && modalInteraction.user.id === interaction.user.id,
		time: 5 * 60 * 1000,
	}).catch(() => null);
	if (!submitted) return;

	const label = submitted.fields.getTextInputValue('label').trim();
	const url = submitted.fields.getTextInputValue('url').trim();
	const token = isGithub ? submitted.fields.getTextInputValue('token').trim() || null : null;
	let parsedUrl;
	try {
		parsedUrl = new URL(url);
	}
	catch {
		parsedUrl = null;
	}
	const validUrl = parsedUrl && ['http:', 'https:'].includes(parsedUrl.protocol) && (!isGithub || Boolean(parseGithubUrl(url)));
	if (!validUrl) {
		await submitted.reply({ components: [await buildPatchNoteTextContainer(submitted.guildId, await tError(submitted.guildId, isGithub ? 'patch_notes_err_invalid_github' : 'patch_notes_err_invalid_rss'), true)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
		return;
	}
	if (isGithub) {
		const repository = parseGithubUrl(url);
		try {
			await validateGithubToken(repository.owner, repository.repo, token);
		}
		catch (error) {
			logger.warn(`GitHub token validation failed for patch note source in guild ${submitted.guildId}: ${error.message}`);
			await submitted.reply({ components: [await buildPatchNoteTextContainer(submitted.guildId, await tError(submitted.guildId, 'patch_notes_err_invalid_github_token'), true)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
			return;
		}
	}

	try {
		await addPatchNoteSource(submitted.guildId, { type, label, url, token });
		await submitted.update({ components: [await buildSourcesContainer(submitted.guildId, await getPatchNoteConfig(submitted.guildId))] });
	}
	catch (error) {
		const key = error.code === 'PATCH_NOTE_SOURCE_LIMIT' ? 'patch_notes_err_source_limit' : 'patch_notes_err_something_wrong';
		await submitted.reply({ components: [await buildPatchNoteTextContainer(submitted.guildId, await tError(submitted.guildId, key, { limit: error.limit?.toString() ?? '' }), true)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
	}
}

async function handleComponent(interaction, patchConfig) {
	if (interaction.customId === `${CONFIG_PREFIX}:nav`) {
		const builders = { channel: buildChannelContainer, sources: buildSourcesContainer, options: buildOptionsContainer };
		await interaction.update({ components: [await builders[interaction.values[0]](interaction.guildId, patchConfig)] });
		return;
	}
	if (interaction.customId === `${CONFIG_PREFIX}:home`) {
		await interaction.update({ components: [await buildHomeContainer(interaction.guildId, patchConfig)] });
		return;
	}

	const [, page, action] = interaction.customId.split(':');
	if (page === 'channel' && action === 'set') {
		patchConfig = await updatePatchNoteConfig(interaction.guildId, { channelId: interaction.values[0] });
		await interaction.update({ components: [await buildChannelContainer(interaction.guildId, patchConfig)] });
		return;
	}
	if (page === 'sources' && action === 'add') {
		await interaction.update({ components: [await buildSourceTypeContainer(interaction.guildId, patchConfig)] });
		return;
	}
	if (page === 'sources' && action === 'type') {
		await showSourceModal(interaction, interaction.values[0]);
		return;
	}
	if (page === 'sources' && action === 'remove') {
		await interaction.update({ components: [await buildRemoveSourceContainer(interaction.guildId, patchConfig)] });
		return;
	}
	if (page === 'sources' && action === 'remove_select') {
		patchConfig = await removePatchNoteSource(interaction.guildId, interaction.values[0]);
		await interaction.update({ components: [await buildSourcesContainer(interaction.guildId, patchConfig)] });
		return;
	}
	if (page !== 'options') return;

	const updates = {};
	if (action === 'toggle_downloads') updates.showDownloads = !patchConfig.showDownloads;
	if (action === 'toggle_changelog') updates.showChangelog = !patchConfig.showChangelog;
	if (action === 'toggle_enabled') updates.enabled = !patchConfig.enabled;
	if (action === 'role') updates.mentionRoleId = interaction.values[0];
	if (action === 'clear_role') updates.mentionRoleId = null;
	patchConfig = await updatePatchNoteConfig(interaction.guildId, updates);
	await interaction.update({ components: [await buildOptionsContainer(interaction.guildId, patchConfig)] });
}

export default {
	data: new SlashCommandBuilder()
		.setName('patch-notes')
		.setDescription('Configure the automated patch note tracker')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

	async execute(interaction) {
		const guildId = interaction.guildId;
		try {
			let patchConfig = await getPatchNoteConfig(guildId);
			await interaction.reply({ components: [await buildHomeContainer(guildId, patchConfig)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
			const reply = await interaction.fetchReply();
			const collector = reply.createMessageComponentCollector({ filter: component => component.user.id === interaction.user.id && component.customId.startsWith(CONFIG_PREFIX), idle: 5 * 60 * 1000, time: 15 * 60 * 1000 });
			collector.on('collect', async component => {
				try {
					patchConfig = await getPatchNoteConfig(guildId);
					await handleComponent(component, patchConfig);
				}
				catch (error) {
					logger.error('Failed to handle patch notes config interaction:', error);
					const payload = { components: [await buildPatchNoteTextContainer(guildId, await tError(guildId, 'patch_notes_err_something_wrong'), true)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
					if (component.replied || component.deferred) await component.followUp(payload).catch(() => null);
					else await component.reply(payload).catch(() => null);
				}
			});
			collector.on('end', async () => {
				await interaction.editReply({ components: [await buildPatchNoteTextContainer(guildId, `-# ${await t(guildId, 'patch_notes_err_session_expired')}`)] }).catch(() => null);
			});
		}
		catch (error) {
			logger.error('Failed to execute /patch-notes:', error);
			const payload = { components: [await buildPatchNoteTextContainer(guildId, await tError(guildId, 'error_generic'), true)], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
			if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
			else await interaction.reply(payload);
		}
	},
};

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, ContainerBuilder, MessageFlags, ModalBuilder, RoleSelectMenuBuilder, SeparatorSpacingSize, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import Guild from '../models/Guild.js';
import OnboardingConfig from '../models/OnboardingConfig.js';
import config from '../config.js';
import logger from './logger.js';
import { t } from './i18n.js';
import { emojis } from './emoji.js';
import { getAccentColor, getErrorColor } from './color.js';
import { addAnnouncement, getAnnouncementLimits, getAnnouncements, removeAnnouncement } from './announcements/config.js';

const CONFIG_PREFIX = 'gcfg';

async function getGuildConfig(guildId) {
	let guildConfig = await Guild.findOne({ guildId });
	if (!guildConfig) {
		guildConfig = await Guild.create({ guildId });
	}
	return guildConfig;
}

async function getOnboardingConfig(guildId) {
	return OnboardingConfig.findOneAndUpdate(
		{ guildId },
		{ $setOnInsert: { guildId } },
		{ upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
	);
}

async function buildTextContainer(content, guildId, color = null) {
	if (color === null) color = await getAccentColor(guildId);
	return new ContainerBuilder()
		.setAccentColor(color)
		.addTextDisplayComponents(textDisplay => textDisplay.setContent(content));
}

async function buildConfigHomeContainer(guildConfig) {
	const guildId = guildConfig.guildId;
	const color = await getAccentColor(guildId);

	// Resolve all strings first
	const currentLangDisplay = guildConfig.language === 'bg' ? '🇧🇬 Bulgarian (bg)' : '🇬🇧 English (en)';
	const title = await t(guildId, 'config_home_title');
	const body = await t(guildId, 'config_home_body', { currentLang: currentLangDisplay });
	const placeholder = await t(guildId, 'config_home_select_placeholder');
	const langLabel = await t(guildId, 'config_home_lang_label');
	const langDesc = await t(guildId, 'config_home_lang_desc');
	const rolesLabel = await t(guildId, 'config_home_roles_label');
	const rolesDesc = await t(guildId, 'config_home_roles_desc');
	const welcomeLabel = await t(guildId, 'config_home_welcome_label');
	const welcomeDesc = await t(guildId, 'config_home_welcome_desc');
	const farewellLabel = await t(guildId, 'config_home_farewell_label');
	const farewellDesc = await t(guildId, 'config_home_farewell_desc');
	const safetyLabel = await t(guildId, 'config_home_safety_label');
	const safetyDesc = await t(guildId, 'config_home_safety_desc');
	const announcementsLabel = await t(guildId, 'config_home_announcements_label');
	const announcementsDesc = await t(guildId, 'config_home_announcements_desc');

	return new ContainerBuilder()
		.setAccentColor(color)
		.addTextDisplayComponents(textDisplay => textDisplay.setContent(`## ${emojis.monitorcog} ${title}`))
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
		.addTextDisplayComponents(textDisplay => textDisplay.setContent(body))
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(false))
		.addActionRowComponents(
			new ActionRowBuilder().addComponents(
				new StringSelectMenuBuilder()
					.setCustomId(`${CONFIG_PREFIX}:nav`)
					.setPlaceholder(placeholder)
					.addOptions([
						{ label: langLabel, description: langDesc, value: 'language', emoji: emojis.folders },
						{ label: rolesLabel, description: rolesDesc, value: 'roles', emoji: emojis.shield },
						{ label: welcomeLabel, description: welcomeDesc, value: 'welcome', emoji: emojis.messagesquarecheck },
						{ label: farewellLabel, description: farewellDesc, value: 'farewell', emoji: emojis.messagesquarex },
						{ label: safetyLabel, description: safetyDesc, value: 'safety', emoji: emojis.shieldcheck },
						{ label: announcementsLabel, description: announcementsDesc, value: 'announcements', emoji: emojis.megaphone },
					]),
			),
		);
}

async function buildOnboardingChannelContainer(guildId, settings, type) {
	const isWelcome = type === 'welcome';
	const title = await t(guildId, isWelcome ? 'config_welcome_title' : 'config_farewell_title');
	const body = await t(guildId, isWelcome ? 'config_welcome_body' : 'config_farewell_body', {
		status: await t(guildId, settings[`${type}Enabled`] ? 'term_enabled_short' : 'term_disabled'),
		channel: settings[`${type}ChannelId`] ? `<#${settings[`${type}ChannelId`]}>` : await t(guildId, 'ticket_cfg_not_set'),
	});
	const channelPlaceholder = await t(guildId, 'config_onboarding_channel_placeholder');
	const toggleLabel = await t(guildId, settings[`${type}Enabled`] ? 'config_onboarding_disable' : 'config_onboarding_enable');
	const backBtn = await t(guildId, 'config_back_button');
	const channelSelect = new ChannelSelectMenuBuilder()
		.setCustomId(`${CONFIG_PREFIX}:${type}:channel`)
		.setPlaceholder(channelPlaceholder)
		.setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
	if (settings[`${type}ChannelId`]) channelSelect.setDefaultChannels(settings[`${type}ChannelId`]);

	return new ContainerBuilder()
		.setAccentColor(await getAccentColor(guildId))
		.addTextDisplayComponents(textDisplay => textDisplay.setContent(`## ${title}`))
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
		.addTextDisplayComponents(textDisplay => textDisplay.setContent(body))
		.addActionRowComponents(new ActionRowBuilder().addComponents(channelSelect))
		.addActionRowComponents(new ActionRowBuilder().addComponents(
			new ButtonBuilder().setCustomId(`${CONFIG_PREFIX}:${type}:toggle`).setLabel(toggleLabel).setStyle(settings[`${type}Enabled`] ? ButtonStyle.Danger : ButtonStyle.Success),
			new ButtonBuilder().setCustomId(`${CONFIG_PREFIX}:home`).setLabel(backBtn).setEmoji(emojis.chevronleft).setStyle(ButtonStyle.Secondary),
		));
}

async function buildSafetyContainer(guildId, settings) {
	const title = await t(guildId, 'config_safety_title');
	const body = await t(guildId, 'config_safety_body', {
		status: await t(guildId, settings.accountAgeAlertEnabled ? 'term_enabled_short' : 'term_disabled'),
		days: settings.accountAgeMinimumDays,
		channel: settings.accountAgeAlertChannelId ? `<#${settings.accountAgeAlertChannelId}>` : await t(guildId, 'ticket_cfg_not_set'),
		roles: settings.autoRoleIds.length ? settings.autoRoleIds.map(id => `<@&${id}>`).join(', ') : await t(guildId, 'ticket_cfg_none_set'),
	});
	const roleSelect = new RoleSelectMenuBuilder()
		.setCustomId(`${CONFIG_PREFIX}:safety:roles`)
		.setPlaceholder(await t(guildId, 'config_safety_roles_placeholder'))
		.setMinValues(0)
		.setMaxValues(config.onboarding.maxAutoRoles);
	if (settings.autoRoleIds.length) roleSelect.setDefaultRoles(settings.autoRoleIds);
	const channelSelect = new ChannelSelectMenuBuilder()
		.setCustomId(`${CONFIG_PREFIX}:safety:channel`)
		.setPlaceholder(await t(guildId, 'config_safety_channel_placeholder'))
		.setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
	if (settings.accountAgeAlertChannelId) channelSelect.setDefaultChannels(settings.accountAgeAlertChannelId);
	const ageSelect = new StringSelectMenuBuilder()
		.setCustomId(`${CONFIG_PREFIX}:safety:age`)
		.setPlaceholder(await t(guildId, 'config_safety_age_placeholder'))
		.addOptions([1, 3, 7, 14, 30, 90].map(days => ({ label: `${days} days`, value: String(days), default: settings.accountAgeMinimumDays === days })));

	return new ContainerBuilder()
		.setAccentColor(await getAccentColor(guildId))
		.addTextDisplayComponents(textDisplay => textDisplay.setContent(`## ${emojis.shield} ${title}`))
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
		.addTextDisplayComponents(textDisplay => textDisplay.setContent(body))
		.addActionRowComponents(new ActionRowBuilder().addComponents(roleSelect))
		.addActionRowComponents(new ActionRowBuilder().addComponents(channelSelect))
		.addActionRowComponents(new ActionRowBuilder().addComponents(ageSelect))
		.addActionRowComponents(new ActionRowBuilder().addComponents(
			new ButtonBuilder().setCustomId(`${CONFIG_PREFIX}:safety:toggle`).setLabel(await t(guildId, settings.accountAgeAlertEnabled ? 'config_onboarding_disable' : 'config_onboarding_enable')).setStyle(settings.accountAgeAlertEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
			new ButtonBuilder().setCustomId(`${CONFIG_PREFIX}:home`).setLabel(await t(guildId, 'config_back_button')).setEmoji(emojis.chevronleft).setStyle(ButtonStyle.Secondary),
		));
}

async function buildConfigLangContainer(guildConfig) {
	const guildId = guildConfig.guildId;
	const color = await getAccentColor(guildId);

	// Resolve all strings first
	const title = await t(guildId, 'config_lang_title');
	const body = await t(guildId, 'config_lang_body');
	const placeholder = await t(guildId, 'config_lang_select_placeholder');
	const labelEn = await t(guildId, 'config_lang_option_en');
	const descEn = await t(guildId, 'config_lang_option_en_desc');
	const labelBg = await t(guildId, 'config_lang_option_bg');
	const descBg = await t(guildId, 'config_lang_option_bg_desc');
	const backBtn = await t(guildId, 'config_back_button');

	const select = new StringSelectMenuBuilder()
		.setCustomId(`${CONFIG_PREFIX}:lang:set`)
		.setPlaceholder(placeholder)
		.addOptions([
			{ label: labelEn, value: 'en', description: descEn, emoji: '🇬🇧', default: guildConfig.language === 'en' },
			{ label: labelBg, value: 'bg', description: descBg, emoji: '🇧🇬', default: guildConfig.language === 'bg' },
		]);

	return new ContainerBuilder()
		.setAccentColor(color)
		.addTextDisplayComponents(textDisplay => textDisplay.setContent(`## ${emojis.folders} ${title}`))
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
		.addTextDisplayComponents(textDisplay => textDisplay.setContent(body))
		.addActionRowComponents(new ActionRowBuilder().addComponents(select))
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(false))
		.addActionRowComponents(
			new ActionRowBuilder().addComponents(
				new ButtonBuilder()
					.setCustomId(`${CONFIG_PREFIX}:home`)
					.setLabel(backBtn)
					.setEmoji(emojis.chevronleft)
					.setStyle(ButtonStyle.Secondary),
			),
		);
}

async function buildConfigRolesContainer(guildConfig) {
	const guildId = guildConfig.guildId;
	const color = await getAccentColor(guildId);

	const title = await t(guildId, 'config_roles_title');
	const body = await t(guildId, 'config_roles_body');
	const placeholder = await t(guildId, 'config_roles_select_placeholder');
	const backBtn = await t(guildId, 'config_back_button');

	const select = new RoleSelectMenuBuilder()
		.setCustomId(`${CONFIG_PREFIX}:roles:set`)
		.setPlaceholder(placeholder)
		.setMinValues(0)
		.setMaxValues(25);

	if (guildConfig.manageRoleIds?.length) {
		select.setDefaultRoles(guildConfig.manageRoleIds.slice(0, 25));
	}

	return new ContainerBuilder()
		.setAccentColor(color)
		.addTextDisplayComponents(textDisplay => textDisplay.setContent(`## ${emojis.shield} ${title}`))
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
		.addTextDisplayComponents(textDisplay => textDisplay.setContent(body))
		.addActionRowComponents(new ActionRowBuilder().addComponents(select))
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(false))
		.addActionRowComponents(
			new ActionRowBuilder().addComponents(
				new ButtonBuilder()
					.setCustomId(`${CONFIG_PREFIX}:home`)
					.setLabel(backBtn)
					.setEmoji(emojis.chevronleft)
					.setStyle(ButtonStyle.Secondary),
			),
		);
}

const ANNOUNCEMENT_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function describeAnnouncementSchedule(guildId, announcement) {
	const time = `${String(announcement.hour).padStart(2, '0')}:${String(announcement.minute).padStart(2, '0')}`;
	if (announcement.frequency === 'weekly') return `every ${ANNOUNCEMENT_WEEKDAYS[announcement.weekday]} at ${time}`;
	if (announcement.frequency === 'monthly') return `on day ${announcement.dayOfMonth} at ${time}`;
	return `every day at ${time}`;
}

async function buildAnnouncementsHome(container, guildId) {
	const backBtn = await t(guildId, 'config_back_button');
	container
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(false))
		.addActionRowComponents(
			new ActionRowBuilder().addComponents(
				new ButtonBuilder()
					.setCustomId(`${CONFIG_PREFIX}:home`)
					.setLabel(backBtn)
					.setEmoji(emojis.chevronleft)
					.setStyle(ButtonStyle.Secondary),
			),
		);
	return container;
}

async function buildAnnouncementsContainer(guildId) {
	const announcements = await getAnnouncements(guildId);
	const limits = getAnnouncementLimits();
	const enabledCount = announcements.filter(item => item.enabled).length;
	const title = await t(guildId, 'config_announcements_title', { emoji: emojis.award });
	const summary = await t(guildId, 'config_announcements_summary', {
		enabled: enabledCount.toString(),
		total: announcements.length.toString(),
		max: limits.maxAnnouncements.toString(),
	});
	const noneSet = await t(guildId, 'announcements_none_set');
	const addLabel = await t(guildId, 'config_announcements_add');
	const addDesc = await t(guildId, 'config_announcements_add_desc');
	const removeLabel = await t(guildId, 'config_announcements_remove');
	const removeDesc = await t(guildId, 'config_announcements_remove_desc');
	const placeholder = await t(guildId, 'config_announcements_select_placeholder');

	const container = new ContainerBuilder()
		.setAccentColor(await getAccentColor(guildId))
		.addTextDisplayComponents(textDisplay => textDisplay.setContent(`## ${title}`))
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
		.addTextDisplayComponents(textDisplay => textDisplay.setContent(summary));

	if (announcements.length) {
		const lines = announcements.map(announcement =>
			`${announcement.enabled ? emojis.check : emojis.x_} **${announcement.label}** — ${describeAnnouncementSchedule(guildId, announcement)}${announcement.nextRunAt ? ` • <t:${Math.floor(new Date(announcement.nextRunAt).getTime() / 1000)}:R>` : ''}`,
		);
		container.addTextDisplayComponents(textDisplay => textDisplay.setContent(lines.join('\n')));
	}
	else {
		container.addTextDisplayComponents(textDisplay => textDisplay.setContent(noneSet));
	}

	container.addActionRowComponents(new ActionRowBuilder().addComponents(
		new StringSelectMenuBuilder()
			.setCustomId(`${CONFIG_PREFIX}:ann:nav`)
			.setPlaceholder(placeholder)
			.addOptions([
				{ label: addLabel, description: addDesc, value: 'add', emoji: emojis.award },
				{ label: removeLabel, description: removeDesc, value: 'remove', emoji: emojis.x_ },
			]),
	));

	return buildAnnouncementsHome(container, guildId);
}

async function buildAnnouncementsAddTypeContainer(guildId) {
	const title = await t(guildId, 'config_announcements_add_title');
	const desc = await t(guildId, 'config_announcements_add_desc');
	const placeholder = await t(guildId, 'config_announcements_add_type_placeholder');
	const dailyLabel = await t(guildId, 'config_announcements_freq_daily');
	const weeklyLabel = await t(guildId, 'config_announcements_freq_weekly');
	const monthlyLabel = await t(guildId, 'config_announcements_freq_monthly');

	const container = new ContainerBuilder()
		.setAccentColor(await getAccentColor(guildId))
		.addTextDisplayComponents(textDisplay => textDisplay.setContent(`## ${title}`))
		.addSeparatorComponents(separator => separator.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
		.addTextDisplayComponents(textDisplay => textDisplay.setContent(desc))
		.addActionRowComponents(new ActionRowBuilder().addComponents(
			new StringSelectMenuBuilder()
				.setCustomId(`${CONFIG_PREFIX}:ann:addtype`)
				.setPlaceholder(placeholder)
				.addOptions([
					{ label: dailyLabel, value: 'daily' },
					{ label: weeklyLabel, value: 'weekly' },
					{ label: monthlyLabel, value: 'monthly' },
				]),
		));

	return buildAnnouncementsHome(container, guildId);
}

async function buildAnnouncementsChannelContainer(guildId) {
	const title = await t(guildId, 'config_announcements_channel_title');
	const desc = await t(guildId, 'config_announcements_channel_desc');
	const placeholder = await t(guildId, 'config_announcements_channel_placeholder');

	const container = new ContainerBuilder()
		.setAccentColor(await getAccentColor(guildId))
		.addTextDisplayComponents(textDisplay => textDisplay.setContent(`## ${title}`))
		.addSeparatorComponents(separator => separator.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
		.addTextDisplayComponents(textDisplay => textDisplay.setContent(desc))
		.addActionRowComponents(new ActionRowBuilder().addComponents(
			new ChannelSelectMenuBuilder()
				.setCustomId(`${CONFIG_PREFIX}:ann:channel`)
				.setPlaceholder(placeholder)
				.setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
		));

	return buildAnnouncementsHome(container, guildId);
}

async function handleAnnouncementModal(interaction, state) {
	const frequency = interaction.values[0];
	const isWeekly = frequency === 'weekly';
	const isMonthly = frequency === 'monthly';

	const modal = new ModalBuilder()
		.setCustomId(`${CONFIG_PREFIX}:ann:modal:${frequency}`)
		.setTitle(await t(interaction.guildId, 'config_announcements_modal_title'))
		.addComponents(
			new ActionRowBuilder().addComponents(
				new TextInputBuilder()
					.setCustomId('label')
					.setLabel(await t(interaction.guildId, 'announcements_label'))
					.setStyle(TextInputStyle.Short)
					.setMaxLength(50)
					.setRequired(true),
			),
			new ActionRowBuilder().addComponents(
				new TextInputBuilder()
					.setCustomId('hour')
					.setLabel(await t(interaction.guildId, 'announcements_hour'))
					.setStyle(TextInputStyle.Short)
					.setMaxLength(2)
					.setRequired(true),
			),
			new ActionRowBuilder().addComponents(
				new TextInputBuilder()
					.setCustomId('minute')
					.setLabel(await t(interaction.guildId, 'announcements_minute'))
					.setStyle(TextInputStyle.Short)
					.setMaxLength(2)
					.setRequired(true),
			),
		);

	if (isWeekly || isMonthly) {
		modal.addComponents(new ActionRowBuilder().addComponents(
			new TextInputBuilder()
				.setCustomId('dayvalue')
				.setLabel(await t(interaction.guildId, isWeekly ? 'announcements_weekday_label' : 'announcements_dayofmonth_label'))
				.setStyle(TextInputStyle.Short)
				.setMaxLength(2)
				.setRequired(true),
		));
	}

	modal.addComponents(new ActionRowBuilder().addComponents(
		new TextInputBuilder()
			.setCustomId('message')
			.setLabel(await t(interaction.guildId, 'announcements_message'))
			.setStyle(TextInputStyle.Paragraph)
			.setMaxLength(4000)
			.setRequired(false),
	));

	await interaction.showModal(modal);

	const submitted = await interaction.awaitModalSubmit({
		filter: modalInteraction => modalInteraction.customId.startsWith(`${CONFIG_PREFIX}:ann:modal:`) && modalInteraction.user.id === interaction.user.id,
		time: 5 * 60 * 1000,
	}).catch(() => null);
	if (!submitted) return;

	const label = submitted.fields.getTextInputValue('label').trim();
	const hour = Number(submitted.fields.getTextInputValue('hour').trim());
	const minute = Number(submitted.fields.getTextInputValue('minute').trim());
	const dayValue = (isWeekly || isMonthly) ? Number(submitted.fields.getTextInputValue('dayvalue').trim()) : null;
	const message = submitted.fields.getTextInputValue('message').trim();

	const validTime = Number.isInteger(hour) && hour >= 0 && hour <= 23 && Number.isInteger(minute) && minute >= 0 && minute <= 59;
	const validDay = !isWeekly || (Number.isInteger(dayValue) && dayValue >= 0 && dayValue <= 6);
	const validMonth = !isMonthly || (Number.isInteger(dayValue) && dayValue >= 1 && dayValue <= 31);

	if (!label || !validTime || !validDay || !validMonth) {
		const errMsg = await t(submitted.guildId, 'announcements_err_invalid');
		await submitted.reply({
			components: [await buildTextContainer(`${emojis.x_} **Error:** ${errMsg}`, submitted.guildId, await getErrorColor(submitted.guildId))],
			flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
		});
		return;
	}

	state.announcementDraft = {
		label,
		frequency,
		hour,
		minute,
		dayValue,
		message,
	};

	await submitted.update({ components: [await buildAnnouncementsChannelContainer(submitted.guildId)] });
}

async function buildAnnouncementsRemoveContainer(guildId) {
	const announcements = await getAnnouncements(guildId);
	const title = await t(guildId, 'config_announcements_remove_title');
	const placeholder = await t(guildId, 'config_announcements_remove_placeholder');
	const noneSet = await t(guildId, 'announcements_none_set');

	const container = new ContainerBuilder()
		.setAccentColor(await getAccentColor(guildId))
		.addTextDisplayComponents(textDisplay => textDisplay.setContent(`## ${title}`))
		.addSeparatorComponents(separator => separator.setSpacing(SeparatorSpacingSize.Small).setDivider(true));

	if (announcements.length) {
		container.addActionRowComponents(new ActionRowBuilder().addComponents(
			new StringSelectMenuBuilder()
				.setCustomId(`${CONFIG_PREFIX}:ann:remove`)
				.setPlaceholder(placeholder)
				.addOptions(announcements.map(announcement => ({
					label: announcement.label.slice(0, 100),
					value: announcement._id.toString(),
				}))),
		));
	}
	else {
		container.addTextDisplayComponents(text => text.setContent(noneSet));
	}

	return buildAnnouncementsHome(container, guildId);
}

async function renderConfigPage(page, guildConfig, onboardingConfig, state) {
	switch (page) {
	case 'language': return await buildConfigLangContainer(guildConfig);
	case 'roles': return await buildConfigRolesContainer(guildConfig);
	case 'welcome': return await buildOnboardingChannelContainer(guildConfig.guildId, onboardingConfig, 'welcome');
	case 'farewell': return await buildOnboardingChannelContainer(guildConfig.guildId, onboardingConfig, 'farewell');
	case 'safety': return await buildSafetyContainer(guildConfig.guildId, onboardingConfig);
	case 'announcements': return await buildAnnouncementsContainer(guildConfig.guildId, state);
	default: return await buildConfigHomeContainer(guildConfig);
	}
}

async function handleConfigComponent(interaction, guildConfig, onboardingConfig, state) {
	if (interaction.customId === `${CONFIG_PREFIX}:nav`) {
		await interaction.update({ components: [await renderConfigPage(interaction.values[0], guildConfig, onboardingConfig, state)] });
		return;
	}

	if (interaction.customId === `${CONFIG_PREFIX}:home`) {
		state.announcementDraft = null;
		await interaction.update({ components: [await buildConfigHomeContainer(guildConfig)] });
		return;
	}

	if (interaction.customId === `${CONFIG_PREFIX}:ann:nav`) {
		if (interaction.values[0] === 'add') {
			await interaction.update({ components: [await buildAnnouncementsAddTypeContainer(guildConfig.guildId)] });
		}
		else {
			await interaction.update({ components: [await buildAnnouncementsRemoveContainer(guildConfig.guildId)] });
		}
		return;
	}

	if (interaction.customId === `${CONFIG_PREFIX}:ann:addtype`) {
		await handleAnnouncementModal(interaction, state);
		return;
	}

	if (interaction.customId === `${CONFIG_PREFIX}:ann:channel`) {
		const draft = state.announcementDraft;
		if (!draft) {
			await interaction.update({ components: [await buildAnnouncementsContainer(guildConfig.guildId)] });
			return;
		}
		const announcement = {
			label: draft.label,
			frequency: draft.frequency,
			hour: draft.hour,
			minute: draft.minute,
			message: draft.message,
			channelId: interaction.values[0],
			enabled: true,
			mentionRoleId: null,
			utcOffsetMinutes: 0,
			template: null,
		};
		if (draft.frequency === 'weekly') announcement.weekday = draft.dayValue;
		if (draft.frequency === 'monthly') announcement.dayOfMonth = draft.dayValue;

		try {
			const created = await addAnnouncement(guildConfig.guildId, announcement);
			state.announcementDraft = null;
			const confirmText = await t(interaction.guildId, 'config_announcements_created', { label: created.label, emoji: emojis.check });
			await interaction.update({ components: [await buildAnnouncementsContainer(guildConfig.guildId)] });
			await interaction.followUp({
				components: [await buildTextContainer(confirmText, guildConfig.guildId)],
				flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
			});
		}
		catch (error) {
			if (error.code === 'ANNOUNCEMENT_LIMIT') {
				const limitMsg = await t(interaction.guildId, 'announcements_err_source_limit', { limit: error.limit.toString() });
				await interaction.followUp({ components: [await buildTextContainer(limitMsg, guildConfig.guildId, await getErrorColor(guildConfig.guildId))], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
			}
			else {
				throw error;
			}
		}
		return;
	}

	if (interaction.customId === `${CONFIG_PREFIX}:ann:remove`) {
		const removed = await removeAnnouncement(guildConfig.guildId, interaction.values[0]);
		if (removed) {
			const confirmText = await t(interaction.guildId, 'config_announcements_removed', { label: removed.label, emoji: emojis.check });
			await interaction.update({ components: [await buildAnnouncementsContainer(guildConfig.guildId)] });
			await interaction.followUp({
				components: [await buildTextContainer(confirmText, guildConfig.guildId)],
				flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
			});
		}
		else {
			await interaction.update({ components: [await buildAnnouncementsContainer(guildConfig.guildId)] });
		}
		return;
	}

	const [, page, action] = interaction.customId.split(':');
	if (page === 'welcome' || page === 'farewell') {
		if (action === 'channel') onboardingConfig[`${page}ChannelId`] = interaction.values[0];
		if (action === 'toggle') onboardingConfig[`${page}Enabled`] = !onboardingConfig[`${page}Enabled`];
		await onboardingConfig.save();
		await interaction.update({ components: [await buildOnboardingChannelContainer(guildConfig.guildId, onboardingConfig, page)] });
		return;
	}

	if (page === 'safety') {
		if (action === 'roles') onboardingConfig.autoRoleIds = interaction.values;
		if (action === 'channel') onboardingConfig.accountAgeAlertChannelId = interaction.values[0];
		if (action === 'age') onboardingConfig.accountAgeMinimumDays = Number(interaction.values[0]);
		if (action === 'toggle') onboardingConfig.accountAgeAlertEnabled = !onboardingConfig.accountAgeAlertEnabled;
		await onboardingConfig.save();
		await interaction.update({ components: [await buildSafetyContainer(guildConfig.guildId, onboardingConfig)] });
		return;
	}

	if (page === 'lang' && action === 'set') {
		const newLang = interaction.values[0];
		guildConfig.language = newLang;
		await guildConfig.save();

		const confirmationText = await t(interaction.guildId, 'lang_updated', {
			language: newLang.toUpperCase(),
			emoji: emojis.check,
		});

		await interaction.update({ components: [await buildConfigLangContainer(guildConfig)] });
		await interaction.followUp({
			components: [await buildTextContainer(confirmationText, guildConfig.guildId)],
			flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
		});
	}

	if (page === 'roles' && action === 'set') {
		guildConfig.manageRoleIds = interaction.values;
		await guildConfig.save();

		const confirmationText = await t(interaction.guildId, 'config_roles_updated', {
			emoji: emojis.check,
		});

		await interaction.update({ components: [await buildConfigRolesContainer(guildConfig)] });
		await interaction.followUp({
			components: [await buildTextContainer(confirmationText, guildConfig.guildId)],
			flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
		});
	}
}

async function startConfigSession(interaction) {
	let guildConfig = await getGuildConfig(interaction.guildId);
	let onboardingConfig = await getOnboardingConfig(interaction.guildId);
	const state = { announcementDraft: null };

	await interaction.reply({
		components: [await buildConfigHomeContainer(guildConfig)],
		flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
	});

	const reply = await interaction.fetchReply();
	const collector = reply.createMessageComponentCollector({
		filter: i => i.user.id === interaction.user.id,
		idle: 5 * 60 * 1000,
		time: 15 * 60 * 1000,
	});

	collector.on('collect', async i => {
		try {
			guildConfig = await getGuildConfig(interaction.guildId);
			onboardingConfig = await getOnboardingConfig(interaction.guildId);
			await handleConfigComponent(i, guildConfig, onboardingConfig, state);
		}
		catch (error) {
			logger.error('Failed to handle guild config interaction:', error);
			const errorMsg = await t(i.guildId, 'error_config_failed');
			const errorContainer = await buildTextContainer(`${emojis.x_} **Error:** ${errorMsg}`, i.guildId, await getErrorColor(i.guildId));
			if (i.deferred || i.replied) {
				await i.followUp({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => null);
			}
			else {
				await i.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => null);
			}
		}
	});

	collector.on('end', async () => {
		const expiredMsg = await t(interaction.guildId, 'error_session_expired');
		await interaction.editReply({
			components: [await buildTextContainer(`-# ${expiredMsg}`, interaction.guildId)],
		}).catch(() => null);
	});
}

export {
	getGuildConfig,
	startConfigSession,
};

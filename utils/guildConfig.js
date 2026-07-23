import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, MessageFlags, SeparatorSpacingSize, StringSelectMenuBuilder } from 'discord.js';
import Guild from '../models/Guild.js';
import config from '../config.js';
import logger from './logger.js';
import { t } from './i18n.js';
import { emojis } from './emoji.js';

const accentColor = parseInt(config.accentColor.replace('#', ''), 16);
const CONFIG_PREFIX = 'gcfg';

async function getGuildConfig(guildId) {
	let guildConfig = await Guild.findOne({ guildId });
	if (!guildConfig) {
		guildConfig = await Guild.create({ guildId });
	}
	return guildConfig;
}

function buildTextContainer(content, color = accentColor) {
	return new ContainerBuilder()
		.setAccentColor(color)
		.addTextDisplayComponents(textDisplay => textDisplay.setContent(content));
}

async function buildConfigHomeContainer(guildConfig) {
	const guildId = guildConfig.guildId;

	// Resolve all strings first
	const currentLangDisplay = guildConfig.language === 'bg' ? '🇧🇬 Bulgarian (bg)' : '🇬🇧 English (en)';
	const title = await t(guildId, 'config_home_title');
	const body = await t(guildId, 'config_home_body', { currentLang: currentLangDisplay });
	const placeholder = await t(guildId, 'config_home_select_placeholder');
	const langLabel = await t(guildId, 'config_home_lang_label');
	const langDesc = await t(guildId, 'config_home_lang_desc');

	return new ContainerBuilder()
		.setAccentColor(accentColor)
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
					]),
			),
		);
}

async function buildConfigLangContainer(guildConfig) {
	const guildId = guildConfig.guildId;

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
		.setAccentColor(accentColor)
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

async function renderConfigPage(page, guildConfig) {
	switch (page) {
	case 'language': return await buildConfigLangContainer(guildConfig);
	default: return await buildConfigHomeContainer(guildConfig);
	}
}

async function handleConfigComponent(interaction, guildConfig) {
	if (interaction.customId === `${CONFIG_PREFIX}:nav`) {
		await interaction.update({ components: [await renderConfigPage(interaction.values[0], guildConfig)] });
		return;
	}

	if (interaction.customId === `${CONFIG_PREFIX}:home`) {
		await interaction.update({ components: [await buildConfigHomeContainer(guildConfig)] });
		return;
	}

	const [, page, action] = interaction.customId.split(':');

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
			components: [buildTextContainer(confirmationText)],
			flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
		});
	}
}

async function startConfigSession(interaction) {
	let guildConfig = await getGuildConfig(interaction.guildId);

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
			await handleConfigComponent(i, guildConfig);
		}
		catch (error) {
			logger.error('Failed to handle guild config interaction:', error);
			const errorMsg = await t(interaction.guildId, 'error_config_failed');
			const errorContainer = buildTextContainer(`${emojis.x_} **Error:** ${errorMsg}`, 0xFF0000);
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
			components: [buildTextContainer(`-# ${expiredMsg}`)],
		}).catch(() => null);
	});
}

export {
	getGuildConfig,
	startConfigSession,
};

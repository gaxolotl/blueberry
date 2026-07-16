const {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ContainerBuilder,
	MessageFlags,
	SeparatorSpacingSize,
	StringSelectMenuBuilder,
} = require('discord.js');
const Guild = require('../models/Guild');
const config = require('../config');
const logger = require('./logger');
const { t } = require('./i18n');

const accentColor = parseInt(config.accentColor.replace('#', ''), 16);
const CONFIG_PREFIX = 'gcfg';

/**
 * @param {string} guildId
 * @returns {Promise<import('mongoose').Document>}
 */
async function getGuildConfig(guildId) {
	let guildConfig = await Guild.findOne({ guildId });
	if (!guildConfig) {
		guildConfig = await Guild.create({ guildId });
	}
	return guildConfig;
}

/**
 * @param {string} content
 * @param {number} [color]
 * @returns {import('discord.js').ContainerBuilder}
 */
function buildTextContainer(content, color = accentColor) {
	return new ContainerBuilder()
		.setAccentColor(color)
		.addTextDisplayComponents(textDisplay => textDisplay.setContent(content));
}

/**
 * @returns {import('discord.js').ActionRowBuilder}
 */
function buildBackRow() {
	return new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId(`${CONFIG_PREFIX}:home`)
			.setLabel('Back')
			.setEmoji({ name: 'chevronleft', id: '1527044793891295402' })
			.setStyle(ButtonStyle.Secondary),
	);
}

/**
 * @param {import('mongoose').Document} guildConfig
 * @returns {import('discord.js').ContainerBuilder}
 */
function buildConfigHomeContainer(guildConfig) {
	const currentLangDisplay = guildConfig.language === 'bg' ? '🇧🇬 Bulgarian (bg)' : '🇬🇧 English (en)';

	return new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents(textDisplay => textDisplay.setContent('## <:monitorcog:1527035219109085234> Server Configuration'))
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
		.addTextDisplayComponents(textDisplay => textDisplay.setContent(
			[
				`**Language:** ${currentLangDisplay}`,
				'-# Configure core server settings below.',
			].join('\n'),
		))
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(false))
		.addActionRowComponents(
			new ActionRowBuilder().addComponents(
				new StringSelectMenuBuilder()
					.setCustomId(`${CONFIG_PREFIX}:nav`)
					.setPlaceholder('Select a section to configure...')
					.addOptions(
						{ label: 'Language', description: 'Set bot response language', value: 'language', emoji: '<:folders:1527035124632522772>' },
					),
			),
		);
}

/**
 * @param {import('mongoose').Document} guildConfig
 * @returns {import('discord.js').ContainerBuilder}
 */
function buildConfigLangContainer(guildConfig) {
	const select = new StringSelectMenuBuilder()
		.setCustomId(`${CONFIG_PREFIX}:lang:set`)
		.setPlaceholder('Select server language...')
		.addOptions([
			{ label: 'English', value: 'en', description: 'Set bot responses to English', emoji: '🇬🇧', default: guildConfig.language === 'en' },
			{ label: 'Bulgarian', value: 'bg', description: 'Set bot responses to Bulgarian', emoji: '🇧🇬', default: guildConfig.language === 'bg' },
		]);

	return new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents(textDisplay => textDisplay.setContent('## <:folders:1527035124632522772> Language Settings'))
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
		.addTextDisplayComponents(textDisplay => textDisplay.setContent('-# Select the primary language for bot responses and interfaces in this server.'))
		.addActionRowComponents(new ActionRowBuilder().addComponents(select))
		.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(false))
		.addActionRowComponents(buildBackRow());
}

/**
 * @param {string} page
 * @param {import('mongoose').Document} guildConfig
 * @returns {import('discord.js').ContainerBuilder}
 */
function renderConfigPage(page, guildConfig) {
	switch (page) {
	case 'language': return buildConfigLangContainer(guildConfig);
	default: return buildConfigHomeContainer(guildConfig);
	}
}

/**
 * @param {import('discord.js').MessageComponentInteraction} interaction
 * @param {import('mongoose').Document} guildConfig
 */
async function handleConfigComponent(interaction, guildConfig) {
	if (interaction.customId === `${CONFIG_PREFIX}:nav`) {
		await interaction.update({ components: [renderConfigPage(interaction.values[0], guildConfig)] });
		return;
	}

	if (interaction.customId === `${CONFIG_PREFIX}:home`) {
		await interaction.update({ components: [buildConfigHomeContainer(guildConfig)] });
		return;
	}

	const [, page, action] = interaction.customId.split(':');

	if (page === 'lang' && action === 'set') {
		const newLang = interaction.values[0];
		guildConfig.language = newLang;
		await guildConfig.save();

		// Fetch the localized confirmation string for this specific server
		const confirmationText = await t(interaction.guildId, 'lang_updated', {
			language: newLang.toUpperCase(),
		});

		await interaction.update({ components: [buildConfigLangContainer(guildConfig)] });
		await interaction.followUp({
			components: [buildTextContainer(confirmationText)],
			flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
		});
	}
}

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function startConfigSession(interaction) {
	let guildConfig = await getGuildConfig(interaction.guildId);

	await interaction.reply({
		components: [buildConfigHomeContainer(guildConfig)],
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
			const errorContainer = buildTextContainer('<:x_:1526217756926808174> **Error:** Something went wrong while updating that setting.', 0xFF0000);
			if (i.deferred || i.replied) {
				await i.followUp({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => null);
			}
			else {
				await i.reply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }).catch(() => null);
			}
		}
	});

	collector.on('end', async () => {
		await interaction.editReply({
			components: [buildTextContainer('-# This configuration session has expired. Run `/config` again.')],
		}).catch(() => null);
	});
}

module.exports = {
	getGuildConfig,
	startConfigSession,
};
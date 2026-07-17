import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ContainerBuilder } from 'discord.js';
import logger from '../../utils/logger.js';
import { startConfigSession } from '../../utils/guildConfig.js';
import config from '../../config.js';
import { tError } from '../../utils/i18n.js';

const accentColor = parseInt(config.accentColor.replace('#', ''), 16);

function buildErrorContainer(content) {
	return new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents(textDisplay => textDisplay.setContent(content));
}

async function requireAdmin(interaction) {
	if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
		await interaction.reply({
			components: [buildErrorContainer(tError(interaction.guildId, 'error_no_manage_server_perms'))],
			flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
		});
		return false;
	}
	return true;
}

async function requireGuild(interaction) {
	if (!interaction.inGuild()) {
		await interaction.reply({
			components: [buildErrorContainer(tError(interaction.guildId, 'error_not_in_guild'))],
			flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
		});
		return false;
	}
	return true;
}

export default {
	data: new SlashCommandBuilder()
		.setName('config')
		.setDescription('Open the interactive server configuration dashboard')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

	async execute(interaction) {
		if (!await requireGuild(interaction)) return;
		if (!await requireAdmin(interaction)) return;

		try {
			await startConfigSession(interaction);
		}
		catch (error) {
			logger.error('Failed to execute /config:', error);
			const errorReply = {
				components: [buildErrorContainer(tError(interaction.guildId, 'error_generic'))],
				flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
			};

			if (interaction.replied || interaction.deferred) {
				await interaction.followUp(errorReply);
			}
			else {
				await interaction.reply(errorReply);
			}
		}
	},
};
import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, ContainerBuilder } from 'discord.js';
import logger from '../../utils/logger.js';
import { startConfigSession } from '../../utils/guildConfig.js';
import Guild from '../../models/Guild.js';
import { tError } from '../../utils/i18n.js';
import { getErrorColor } from '../../utils/color.js';

async function buildErrorContainer(guildId, content) {
	return new ContainerBuilder()
		.setAccentColor(await getErrorColor(guildId))
		.addTextDisplayComponents(textDisplay => textDisplay.setContent(content));
}

async function requireAdmin(interaction) {
	// Owner always passes
	if (interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) return true;

	// Check custom manage roles set via /config or dashboard
	const guildConfig = await Guild.findOne({ guildId: interaction.guildId }, { manageRoleIds: 1 }).lean();
	const allowedIds = guildConfig?.manageRoleIds ?? [];
	if (allowedIds.length > 0 && interaction.member.roles.cache.some(r => allowedIds.includes(r.id))) return true;

	const errorMsg = await tError(interaction.guildId, 'error_no_manage_server_perms');
	await interaction.reply({
		components: [await buildErrorContainer(interaction.guildId, errorMsg)],
		flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
	});
	return false;
}

async function requireGuild(interaction) {
	if (!interaction.inGuild()) {
		const errorMsg = await tError(interaction.guildId, 'error_not_in_guild');
		await interaction.reply({
			components: [await buildErrorContainer(interaction.guildId, errorMsg)],
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
			const errorMsg = await tError(interaction.guildId, 'error_generic');
			const errorReply = {
				components: [await buildErrorContainer(interaction.guildId, errorMsg)],
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
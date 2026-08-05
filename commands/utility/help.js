import { ContainerBuilder, MessageFlags, SeparatorSpacingSize, SlashCommandBuilder } from 'discord.js';
import { emojis } from '../../utils/emoji.js';
import { t, tError } from '../../utils/i18n.js';
import { getAccentColor, getErrorColor } from '../../utils/color.js';
import logger from '../../utils/logger.js';

export default {
	data: new SlashCommandBuilder()
		.setName('help')
		.setDescription('View Blueberry commands and usage information'),

	async execute(interaction) {
		const guildId = interaction.guildId;
		try {
			const commands = [...interaction.client.commands.values()]
				.map(command => command.data.toJSON())
				.sort((a, b) => a.name.localeCompare(b.name));
			const publicCommands = commands.filter(command => command.default_member_permissions === undefined);
			const adminCommands = commands.filter(command => command.default_member_permissions !== undefined);
			const formatCommands = list => list.map(command => `**/${command.name}**\n-# ${command.description}`).join('\n');
			const title = await t(guildId, 'help_title', { emoji: emojis.folders });
			const intro = await t(guildId, 'help_intro', { count: commands.length.toString() });
			const generalTitle = await t(guildId, 'help_general_title', { emoji: emojis.star });
			const adminTitle = await t(guildId, 'help_admin_title', { emoji: emojis.shield });
			const footer = await t(guildId, 'help_footer');

			const container = new ContainerBuilder()
				.setAccentColor(await getAccentColor(guildId))
				.addTextDisplayComponents(display => display.setContent(`## ${title}\n${intro}`));

			if (publicCommands.length) {
				container
					.addSeparatorComponents(separator => separator.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
					.addTextDisplayComponents(display => display.setContent(`### ${generalTitle}\n${formatCommands(publicCommands)}`));
			}
			if (adminCommands.length) {
				container
					.addSeparatorComponents(separator => separator.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
					.addTextDisplayComponents(display => display.setContent(`### ${adminTitle}\n${formatCommands(adminCommands)}`));
			}
			container
				.addSeparatorComponents(separator => separator.setSpacing(SeparatorSpacingSize.Small).setDivider(false))
				.addTextDisplayComponents(display => display.setContent(`-# ${footer}`));

			await interaction.reply({
				components: [container],
				flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
			});
		}
		catch (error) {
			logger.error('Failed to execute help command:', error);
			const message = await tError(guildId, 'help_error');
			const container = new ContainerBuilder()
				.setAccentColor(await getErrorColor(guildId))
				.addTextDisplayComponents(display => display.setContent(message));
			await interaction.reply({
				components: [container],
				flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
			});
		}
	},
};

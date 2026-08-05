import { SlashCommandBuilder, ContainerBuilder, MessageFlags, SeparatorSpacingSize } from 'discord.js';
import { t, tError } from '../../utils/i18n.js';
import { emojis } from '../../utils/emoji.js';
import { getAccentColor, getErrorColor } from '../../utils/color.js';

export default {
	data: new SlashCommandBuilder()
		.setName('ping')
		.setDescription('Replies with Pong!'),

	async execute(interaction) {
		const guildId = interaction.guildId;

		if (!interaction.inGuild()) {
			const errorMsg = await tError(null, 'error_not_in_guild');
			const guildOnly = new ContainerBuilder()
				.setAccentColor(await getErrorColor(guildId))
				.addTextDisplayComponents(textDisplay => textDisplay.setContent(errorMsg));

			return interaction.reply({
				components: [guildOnly],
				flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
			});
		}

		const loadingText = await t(guildId, 'ping_loading', { emoji: emojis.loader });
		const init = new ContainerBuilder()
			.setAccentColor(await getAccentColor(guildId))
			.addTextDisplayComponents(textDisplay => textDisplay.setContent(loadingText));

		await interaction.reply({
			components: [init],
			flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
		});

		const sent = await interaction.fetchReply();
		const messageLatency = sent.createdTimestamp - interaction.createdTimestamp;
		const apiLatency = interaction.client.ws.ping;

		const pongHeader = await t(guildId, 'ping_pong', { emoji: emojis.gauge });
		const latencyMetrics = await t(guildId, 'ping_latency_metrics', {
			msgLatency: messageLatency.toString(),
			apiLatency: apiLatency.toString(),
		});

		const ping = new ContainerBuilder()
			.setAccentColor(await getAccentColor(guildId))
			.addTextDisplayComponents(textDisplay => textDisplay.setContent(pongHeader))
			.addSeparatorComponents(separator =>
				separator.setSpacing(SeparatorSpacingSize.Small),
			)
			.addTextDisplayComponents(textDisplay => textDisplay.setContent(latencyMetrics));

		await interaction.editReply({
			components: [ping],
			flags: MessageFlags.IsComponentsV2,
		});
	},
};

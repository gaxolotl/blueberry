import {
	ActionRowBuilder,
	AttachmentBuilder,
	ContainerBuilder,
	MediaGalleryBuilder,
	MessageFlags,
	SeparatorSpacingSize,
	SlashCommandBuilder,
	StringSelectMenuBuilder,
} from 'discord.js';
import { getActivityStats } from '../../utils/activity.js';
import { renderActivityChart } from '../../utils/activityChart.js';
import { getAccentColor } from '../../utils/color.js';
import { emojis } from '../../utils/emoji.js';
import { t, tError } from '../../utils/i18n.js';
import logger from '../../utils/logger.js';

const PERIODS = ['day', 'week', 'month', 'year'];
const PERIOD_BUCKET_KEYS = {
	day: 'hour',
	week: 'day',
	month: 'day',
	year: 'month',
};

async function buildPeriodSelect(guildId, activePeriod) {
	const options = [];
	for (const period of PERIODS) {
		options.push({
			label: await t(guildId, `activity_period_${period}`),
			value: period,
			default: period === activePeriod,
			description: await t(guildId, `activity_period_desc_${period}`),
		});
	}

	return new ActionRowBuilder().addComponents(
		new StringSelectMenuBuilder()
			.setCustomId('activity:set_period')
			.setPlaceholder(await t(guildId, 'activity_cmd_period_placeholder'))
			.addOptions(options),
	);
}

async function buildActivityPayload(guildId, period) {
	const stats = await getActivityStats(guildId, period);
	const accentColor = await getAccentColor(guildId);
	const png = await renderActivityChart({
		series: stats.series,
		totalMessages: stats.totalMessages,
		activeMembers: stats.activeMembers,
		accentColor,
	});

	const periodLabel = await t(guildId, `activity_period_${period}`);
	const bucketLabel = await t(guildId, `activity_bucket_${PERIOD_BUCKET_KEYS[period]}`);
	const title = await t(guildId, 'activity_cmd_title', { emoji: emojis.chartnoaxescombined, period: periodLabel });
	const summary = await t(guildId, 'activity_cmd_summary', {
		total: stats.totalMessages.toString(),
		members: stats.activeMembers.toString(),
	});

	const pieces = [summary];
	if (stats.totalMessages > 0) {
		pieces.push(await t(guildId, 'activity_cmd_peak', { label: stats.peak.label, value: stats.peak.value.toString() }));
		const average = stats.totalMessages / Math.max(stats.buckets, 1);
		pieces.push(await t(guildId, 'activity_cmd_avg', { avg: average.toFixed(1), bucket: bucketLabel }));
	}
	else {
		pieces.push(await t(guildId, 'activity_cmd_no_peak'));
	}

	const container = new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents(textDisplay => textDisplay.setContent(`# ${title}`))
		.addSeparatorComponents(separator => separator.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
		.addTextDisplayComponents(textDisplay => textDisplay.setContent(pieces.join('\n')));

	if (stats.channelBreakdown.length) {
		const channelHeader = await t(guildId, 'activity_cmd_channel_header');
		const channelLines = await Promise.all(stats.channelBreakdown.slice(0, 5).map(channel =>
			t(guildId, 'activity_cmd_channel_line', { channelId: channel.channelId, count: channel.count.toString() }),
		));
		container
			.addSeparatorComponents(separator => separator.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
			.addTextDisplayComponents(textDisplay => textDisplay.setContent(`${channelHeader}\n${channelLines.join('\n')}`));
	}

	if (stats.topMembers.length) {
		const topHeader = await t(guildId, 'activity_cmd_top_header');
		const topLines = await Promise.all(stats.topMembers.slice(0, 5).map((member, index) =>
			t(guildId, 'activity_cmd_top_line', { rank: (index + 1).toString(), userId: member.userId, count: member.count.toString() }),
		));
		container
			.addSeparatorComponents(separator => separator.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
			.addTextDisplayComponents(textDisplay => textDisplay.setContent(`${topHeader}\n${topLines.join('\n')}`));
	}

	const chartDescription = await t(guildId, 'activity_cmd_chart_description');
	container
		.addMediaGalleryComponents(
			new MediaGalleryBuilder().addItems(item =>
				item.setURL('attachment://activity.png').setDescription(chartDescription),
			),
		)
		.addSeparatorComponents(separator => separator.setDivider(false).setSpacing(SeparatorSpacingSize.Small))
		.addActionRowComponents(await buildPeriodSelect(guildId, period));

	return { container, png };
}

export default {
	data: new SlashCommandBuilder()
		.setName('activity')
		.setDescription('View server activity trends with a dark-mode chart'),

	async execute(interaction) {
		const guildId = interaction.guildId;
		const period = 'week';

		try {
			await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 });

			const { container, png } = await buildActivityPayload(guildId, period);
			await interaction.editReply({
				components: [container],
				files: [new AttachmentBuilder(png, { name: 'activity.png' })],
				flags: MessageFlags.IsComponentsV2,
			});

			const reply = await interaction.fetchReply();
			const collector = reply.createMessageComponentCollector({
				filter: component => component.user.id === interaction.user.id && component.customId === 'activity:set_period',
				idle: 5 * 60 * 1000,
				time: 15 * 60 * 1000,
			});

			collector.on('collect', async component => {
				const selected = PERIODS.includes(component.values[0]) ? component.values[0] : 'week';
				await component.deferUpdate().catch(() => null);
				try {
					const payload = await buildActivityPayload(guildId, selected);
					await component.editReply({
						components: [payload.container],
						files: [new AttachmentBuilder(payload.png, { name: 'activity.png' })],
					});
				}
				catch (error) {
					logger.error(`Failed to refresh /activity period for guild ${guildId}:`, error);
					const errorText = await tError(guildId, 'error_generic');
					const errorContainer = new ContainerBuilder()
						.setAccentColor(await getAccentColor(guildId))
						.addTextDisplayComponents(textDisplay => textDisplay.setContent(errorText));
					await component.update({ components: [errorContainer] }).catch(() => null);
				}
			});
		}
		catch (error) {
			logger.error(`Failed to execute /activity for guild ${guildId}:`, error);

			const errorMsg = await tError(guildId, 'error_generic');
			const errorContainer = new ContainerBuilder()
				.setAccentColor(await getAccentColor(guildId))
				.addTextDisplayComponents(textDisplay => textDisplay.setContent(errorMsg));

			if (interaction.deferred) {
				await interaction.editReply({ components: [errorContainer], flags: MessageFlags.IsComponentsV2 });
			}
			else {
				await interaction.reply({
					components: [errorContainer],
					flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
				});
			}
		}
	},
};
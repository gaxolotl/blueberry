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
import { getRetentionStats } from '../../utils/retention.js';
import { renderRetentionChart } from '../../utils/retentionChart.js';
import { getAccentColor } from '../../utils/color.js';
import { emojis } from '../../utils/emoji.js';
import { t, tError } from '../../utils/i18n.js';
import logger from '../../utils/logger.js';

const PERIODS = ['day', 'week', 'month', 'year'];

function fmtPercent(value) {
	if (value === null || value === undefined) return '—';
	return `${value}%`;
}

function fmtNumber(value) {
	if (value === null || value === undefined) return '—';
	return `${value}`;
}

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
			.setCustomId('retention:set_period')
			.setPlaceholder(await t(guildId, 'retention_cmd_period_placeholder'))
			.addOptions(options),
	);
}

async function buildRetentionPayload(guildId, period) {
	const stats = await getRetentionStats(guildId, period);
	const accentColor = await getAccentColor(guildId);
	const png = await renderRetentionChart({
		series: stats.series,
		totalJoins: stats.totalJoins,
		totalLeaves: stats.totalLeaves,
	});

	const periodLabel = await t(guildId, `activity_period_${period}`);
	const title = await t(guildId, 'retention_cmd_title', { emoji: emojis.chartnoaxescombined, period: periodLabel });
	const summary = await t(guildId, 'retention_cmd_summary', {
		joins: stats.totalJoins.toString(),
		leaves: stats.totalLeaves.toString(),
		net: (stats.netGrowth >= 0 ? '+' : '') + stats.netGrowth.toString(),
	});
	const retention7 = await t(guildId, 'retention_cmd_rate', { days: '7', rate: fmtPercent(stats.retention7) });
	const retention30 = await t(guildId, 'retention_cmd_rate', { days: '30', rate: fmtPercent(stats.retention30) });
	const memberStats = [
		await t(guildId, 'retention_cmd_avg_age', { value: fmtNumber(stats.avgAccountAge) }),
		await t(guildId, 'retention_cmd_new_accounts', { value: stats.newAccountJoins.toString() }),
		await t(guildId, 'retention_cmd_bot_joins', { value: stats.botJoins.toString() }),
		await t(guildId, 'retention_cmd_avg_tenure', { value: fmtNumber(stats.avgTenureDays) }),
	].join('\n');

	const container = new ContainerBuilder()
		.setAccentColor(accentColor)
		.addTextDisplayComponents(textDisplay => textDisplay.setContent(`# ${title}`))
		.addSeparatorComponents(separator => separator.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
		.addTextDisplayComponents(textDisplay => textDisplay.setContent([summary, retention7, retention30, '', memberStats].join('\n')));

	const chartDescription = await t(guildId, 'retention_cmd_chart_description');
	container
		.addMediaGalleryComponents(
			new MediaGalleryBuilder().addItems(item =>
				item.setURL('attachment://retention.png').setDescription(chartDescription),
			),
		)
		.addSeparatorComponents(separator => separator.setDivider(false).setSpacing(SeparatorSpacingSize.Small))
		.addActionRowComponents(await buildPeriodSelect(guildId, period));

	return { container, png };
}

export default {
	data: new SlashCommandBuilder()
		.setName('retention')
		.setDescription('View member join/leave trends and retention rates'),

	async execute(interaction) {
		const guildId = interaction.guildId;
		const period = 'week';

		try {
			await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 });

			const { container, png } = await buildRetentionPayload(guildId, period);
			await interaction.editReply({
				components: [container],
				files: [new AttachmentBuilder(png, { name: 'retention.png' })],
				flags: MessageFlags.IsComponentsV2,
			});

			const reply = await interaction.fetchReply();
			const collector = reply.createMessageComponentCollector({
				filter: component => component.user.id === interaction.user.id && component.customId === 'retention:set_period',
				idle: 5 * 60 * 1000,
				time: 15 * 60 * 1000,
			});

			collector.on('collect', async component => {
				const selected = PERIODS.includes(component.values[0]) ? component.values[0] : 'week';
				await component.deferUpdate().catch(() => null);
				try {
					const payload = await buildRetentionPayload(guildId, selected);
					await component.editReply({
						components: [payload.container],
						files: [new AttachmentBuilder(payload.png, { name: 'retention.png' })],
					});
				}
				catch (error) {
					logger.error(`Failed to refresh /retention period for guild ${guildId}:`, error);
					const errorText = await tError(guildId, 'error_generic');
					const errorContainer = new ContainerBuilder()
						.setAccentColor(await getAccentColor(guildId))
						.addTextDisplayComponents(textDisplay => textDisplay.setContent(errorText));
					await component.update({ components: [errorContainer] }).catch(() => null);
				}
			});
		}
		catch (error) {
			logger.error(`Failed to execute /retention for guild ${guildId}:`, error);

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
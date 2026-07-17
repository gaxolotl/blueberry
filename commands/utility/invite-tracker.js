import { SlashCommandBuilder, ContainerBuilder, SeparatorSpacingSize, MessageFlags } from 'discord.js';
import { getRecentInviteRecords } from '../../utils/inviteTracker.js';
import logger from '../../utils/logger.js';
import config from '../../config.js';
import { t, tError } from '../../utils/i18n.js';

const accentColor = parseInt(config.accentColor.replace('#', ''), 16);

function toUnix(dateLike) {
	const date = new Date(dateLike);
	return Number.isNaN(date.getTime()) ? null : Math.floor(date.getTime() / 1000);
}

function boolBadge(value) {
	return value ? '<:check:1526217602010185959>' : '<:x_:1526217756926808174>';
}

export default {
	data: new SlashCommandBuilder()
		.setName('invites')
		.setDescription('Shows the latest invite join records captured by the bot'),

	async execute(interaction) {
		const guildId = interaction.guildId;

		if (!interaction.inGuild()) {
			const errorMsg = await tError(null, 'error_not_in_guild');
			const guildOnly = new ContainerBuilder()
				.setAccentColor(0xFF0000)
				.addTextDisplayComponents(textDisplay => textDisplay.setContent(errorMsg));

			return interaction.reply({
				components: [guildOnly],
				flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
			});
		}

		let latest;
		try {
			latest = await getRecentInviteRecords(guildId);
		}
		catch (error) {
			logger.error(`Failed to execute ${interaction.commandName}:`, error);

			const errorMsg = await tError(guildId, 'error_fetching_invites');
			const errorContainer = new ContainerBuilder()
				.setAccentColor(0xFF0000)
				.addTextDisplayComponents(textDisplay => textDisplay.setContent(errorMsg));

			return interaction.reply({
				components: [errorContainer],
				flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
			});
		}

		if (!latest.length) {
			const emptyTitle = await t(guildId, 'invites_empty_title');
			const emptySubtitle = await t(guildId, 'invites_empty_subtitle');

			const empty = new ContainerBuilder()
				.setAccentColor(accentColor)
				.addTextDisplayComponents(textDisplay =>
					textDisplay.setContent([emptyTitle, emptySubtitle].join('\n')),
				);

			return interaction.reply({
				components: [empty],
				flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
			});
		}

		// Handle conditional plural string parsing for the header
		const countStr = latest.length.toString();
		const subtitleKey = latest.length === 1 ? 'invites_recent_joins_singular' : 'invites_recent_joins_plural';
		const resolvedSubtitle = await t(guildId, subtitleKey, { count: countStr });

		const container = new ContainerBuilder()
			.setAccentColor(accentColor)
			.addTextDisplayComponents(async textDisplay =>
				textDisplay.setContent(
					[
						await t(guildId, 'invites_title'),
						resolvedSubtitle,
					].join('\n'),
				),
			);

		// Using a for...of loop allows synchronous await cycles across async translations safely
		for (const record of latest) {
			container.addSeparatorComponents(separator =>
				separator.setSpacing(SeparatorSpacingSize.Small).setDivider(true),
			);

			const joinedUnix = toUnix(record.joinedAt);
			const joinedLine = joinedUnix
				? `<t:${joinedUnix}:F> • <t:${joinedUnix}:R>`
				: `${record.joinedAt}`;

			const usesDisplay = `\`${record.uses}\` / \`${record.maxUses === 0 || record.maxUses == null ? '∞' : record.maxUses}\``;

			const joinedTranslated = await t(guildId, 'invites_record_joined', { joinedLine });
			const inviteInfoTranslated = await t(guildId, 'invites_record_invite_info', { code: record.inviteCode, link: record.inviteLink });
			const invitedByTranslated = await t(guildId, 'invites_record_invited_by', { inviterId: record.inviterId });
			const channelTranslated = await t(guildId, 'invites_record_channel', { channelId: record.channelId });
			const metaTranslated = await t(guildId, 'invites_record_meta', {
				usesDisplay,
				temporary: boolBadge(record.temporary),
				vanity: boolBadge(record.vanityUrlJoin),
			});

			container.addTextDisplayComponents(textDisplay =>
				textDisplay.setContent(
					[
						`<:user:1526207642622759134> **<@${record.memberId}>** \`${record.memberId}\``,
						`> ${joinedTranslated}`,
						'',
						inviteInfoTranslated,
						`> ${invitedByTranslated}`,
						'',
						channelTranslated,
						metaTranslated,
					].join('\n'),
				),
			);
		}

		await interaction.reply({
			components: [container],
			flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
		});
	},
};
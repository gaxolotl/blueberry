import { SlashCommandBuilder, ContainerBuilder, SeparatorSpacingSize, MessageFlags } from 'discord.js';
import { getRecentInviteRecords } from '../../utils/inviteTracker.js';
import logger from '../../utils/logger.js';
import { t, tError } from '../../utils/i18n.js';
import { emojis } from '../../utils/emoji.js';
import { getAccentColor, getErrorColor } from '../../utils/color.js';

function toUnix(dateLike) {
	const date = new Date(dateLike);
	return Number.isNaN(date.getTime()) ? null : Math.floor(date.getTime() / 1000);
}

function boolBadge(value) {
	return value ? emojis.check : emojis.x_;
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
				.setAccentColor(await getErrorColor(guildId))
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
				.setAccentColor(await getErrorColor(guildId))
				.addTextDisplayComponents(textDisplay => textDisplay.setContent(errorMsg));

			return interaction.reply({
				components: [errorContainer],
				flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
			});
		}

		if (!latest.length) {
			const emptyTitle = await t(guildId, 'invites_empty_title', { emoji: emojis.usersearch });
			const emptySubtitle = await t(guildId, 'invites_empty_subtitle');

			const empty = new ContainerBuilder()
				.setAccentColor(await getAccentColor(guildId))
				.addTextDisplayComponents(textDisplay =>
					textDisplay.setContent([emptyTitle, emptySubtitle].join('\n')),
				);

			return interaction.reply({
				components: [empty],
				flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
			});
		}

		const countStr = latest.length.toString();
		const subtitleKey = latest.length === 1 ? 'invites_recent_joins_singular' : 'invites_recent_joins_plural';
		const resolvedSubtitle = await t(guildId, subtitleKey, { count: countStr });

		const container = new ContainerBuilder()
			.setAccentColor(await getAccentColor(guildId))
			.addTextDisplayComponents(async textDisplay =>
				textDisplay.setContent(
					[
						await t(guildId, 'invites_title', { emoji: emojis.usersearch }),
						resolvedSubtitle,
					].join('\n'),
				),
			);

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
			const inviteInfoTranslated = await t(guildId, 'invites_record_invite_info', { emoji: emojis.userplus, code: record.inviteCode, link: record.inviteLink });
			const invitedByTranslated = await t(guildId, 'invites_record_invited_by', { inviterId: record.inviterId });
			const channelTranslated = await t(guildId, 'invites_record_channel', { emoji: emojis.useredit, channelId: record.channelId });
			const metaTranslated = await t(guildId, 'invites_record_meta', {
				usesDisplay,
				temporary: boolBadge(record.temporary),
				vanity: boolBadge(record.vanityUrlJoin),
			});

			container.addTextDisplayComponents(textDisplay =>
				textDisplay.setContent(
					[
						`${emojis.user} **<@${record.memberId}>** \`${record.memberId}\``,
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

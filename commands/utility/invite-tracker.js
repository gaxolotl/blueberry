const { SlashCommandBuilder, ContainerBuilder, SeparatorSpacingSize, MessageFlags } = require('discord.js');
const { getRecentInviteRecords } = require('../../utils/inviteTracker');
const logger = require('../../utils/logger');
const config = require('../../config.js');

const accentColor = parseInt(config.accentColor.replace('#', ''), 16);

function toUnix(dateLike) {
	const date = new Date(dateLike);
	return Number.isNaN(date.getTime()) ? null : Math.floor(date.getTime() / 1000);
}

// g #2f8e50
// r #C0392B
function boolBadge(value) {
	return value ? '<:check:1526217602010185959>' : '<:x_:1526217756926808174>';
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('invites')
		.setDescription('Shows the latest invite join records captured by the bot'),

	async execute(interaction) {
		if (!interaction.inGuild()) {
			const guildOnly = new ContainerBuilder()
				.setAccentColor(0xFF0000)
				.addTextDisplayComponents(textDisplay =>
					textDisplay.setContent('<:x_:1526217756926808174> **Error:** This command can only be used inside a server.'),
				);

			return interaction.reply({
				components: [guildOnly],
				flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
			});
		}

		let latest;
		try {
			latest = await getRecentInviteRecords(interaction.guildId);
		}
		catch (error) {
			logger.error(`Failed to execute ${interaction.commandName}:`, error);

			const errorContainer = new ContainerBuilder()
				.setAccentColor(0xFF0000)
				.addTextDisplayComponents(textDisplay =>
					textDisplay.setContent('# <:x_:1526217756926808174> **Error:** Something went wrong while fetching invite records.'),
				);

			return interaction.reply({
				components: [errorContainer],
				flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
			});
		}

		if (!latest.length) {
			const empty = new ContainerBuilder()
				.setAccentColor(accentColor)
				.addTextDisplayComponents(textDisplay =>
					textDisplay.setContent('# <:usersearch:1526207750479020062> **No invite join records have been captured yet.**\n-# Maybe try inviting someone :)'),
				);

			return interaction.reply({
				components: [empty],
				flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
			});
		}

		const container = new ContainerBuilder()
			.setAccentColor(accentColor)
			.addTextDisplayComponents(textDisplay =>
				textDisplay.setContent(
					[
						'## <:usersearch:1526207750479020062> Invite Tracker',
						`-# Showing the ${latest.length} most recent join${latest.length === 1 ? '' : 's'}`,
					].join('\n'),
				),
			);

		latest.forEach((record) => {
			container.addSeparatorComponents(separator =>
				separator.setSpacing(SeparatorSpacingSize.Small).setDivider(true),
			);

			const joinedUnix = toUnix(record.joinedAt);
			const joinedLine = joinedUnix
				? `<t:${joinedUnix}:F> • <t:${joinedUnix}:R>`
				: `${record.joinedAt}`;

			const usesDisplay = `\`${record.uses}\` / \`${record.maxUses === 0 || record.maxUses == null ? '∞' : record.maxUses}\``;

			container.addTextDisplayComponents(textDisplay =>
				textDisplay.setContent(
					[
						`<:user:1526207642622759134> **<@${record.memberId}>** \`${record.memberId}\``,
						`> Joined ${joinedLine}`,
						'',
						`<:userplus:1526207309032984777> Invite \`${record.inviteCode}\` - [Link](${record.inviteLink})`,
						`> Invited by **<@${record.inviterId}>** \`${record.inviterId}\``,
						'',
						`<:useredit:1526207844448211014> Channel: <#${record.channelId}>`,
						`Uses: ${usesDisplay} • Temporary: ${boolBadge(record.temporary)} • Vanity: ${boolBadge(record.vanityUrlJoin)}`,
					].join('\n'),
				),
			);
		});

		await interaction.reply({
			components: [container],
			flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
		});
	},
};
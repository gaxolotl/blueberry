// Builds the template dot-context (`.User`, `.Member`, `.Message`, ...) for a
// custom command execution, mirroring YAGPDB's context data shape.
import { CSlice, SDict, makeSDict } from './engine.js';

function userObject(user) {
	if (!user) return null;
	return {
		ID: user.id,
		Username: user.username,
		Globalname: user.globalName ?? user.username,
		Discriminator: user.discriminator ?? '0',
		Mention: `<@${user.id}>`,
		String: user.username,
		Bot: user.bot ?? false,
		Avatar: user.avatar,
		AvatarURL: size => user.displayAvatarURL({ size }),
		displayAvatarURL: size => user.displayAvatarURL({ size }),
	};
}

function memberObject(member) {
	if (!member) return null;
	return {
		ID: member.id,
		Nick: member.nickname,
		JoinedAt: member.joinedAt?.toISOString(),
		Roles: new CSlice(...(member.roles?.cache?.keys() ?? [])),
		RoleIDs: new CSlice(...(member.roles?.cache?.keys() ?? [])),
		User: userObject(member.user),
		GuildID: member.guild?.id,
		Permissions: member.permissions?.bitfield ?? 0,
		highestRole: () => member.roles?.highest,
	};
}

function channelObject(channel) {
	if (!channel) return null;
	return {
		ID: channel.id,
		Name: channel.name,
		Mention: `<#${channel.id}>`,
		GuildID: channel.guildId,
		Type: channel.type,
		Topic: channel.topic,
		Position: channel.position,
		NSFW: channel.nsfw ?? false,
		ParentID: channel.parentId,
		IsThread: channel.isThread?.() ?? false,
		IsForum: channel.isThread?.() ? false : channel.type === 15,
		IsPrivate: channel.isDMBased?.() ?? false,
	};
}

function guildObject(guild) {
	if (!guild) return null;
	return {
		ID: guild.id,
		Name: guild.name,
		MemberCount: guild.memberCount,
		OwnerID: guild.ownerId,
		Icon: guild.icon,
		IconURL: size => guild.iconURL({ size }) ?? '',
		Roles: new CSlice(...(guild.roles?.cache?.values() ?? [])),
		Channels: new CSlice(...(guild.channels?.cache?.values() ?? [])),
		Emojis: new CSlice(...(guild.emojis?.cache?.values() ?? [])),
		Stickers: new CSlice(...(guild.stickers?.cache?.values() ?? [])),
		Features: new CSlice(...(guild.features ?? [])),
		GetRole: id => guild.roles?.cache?.get(String(id)) ?? null,
		GetChannel: id => guild.channels?.cache?.get(String(id)) ?? null,
		GetMember: id => guild.members?.cache?.get(String(id)) ?? null,
		GetEmoji: id => guild.emojis?.cache?.get(String(id)) ?? null,
		SystemChannelID: guild.systemChannelId,
		VerificationLevel: guild.verificationLevel,
		PremiumTier: guild.premiumTier,
	};
}

function messageObject(message) {
	if (!message) return null;
	return {
		ID: message.id,
		Content: message.content,
		ContentWithMentionsReplaced: message.cleanContent,
		ChannelID: message.channelId,
		GuildID: message.guildId,
		Author: userObject(message.author),
		Member: message.member ? memberObject(message.member) : null,
		Timestamp: message.createdAt?.toISOString(),
		EditedTimestamp: message.editedAt?.toISOString() ?? null,
		Mentions: new CSlice(...(message.mentions?.users?.map(u => userObject(u)) ?? [])),
		Attachments: new CSlice(...(message.attachments?.map(a => a) ?? [])),
		Pinned: message.pinned ?? false,
		Type: message.type,
		Reactions: new CSlice(...(message.reactions?.cache?.map(r => ({ Count: r.count, Emoji: { Name: r.emoji.name, ID: r.emoji.id } })) ?? [])),
		Link: `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`,
	};
}

/**
 * Builds the full template dot context for a custom command run.
 * @param {object} opts
 * @param {object} opts.client - discord.js client
 * @param {object} [opts.guild]
 * @param {object} [opts.channel]
 * @param {object} [opts.member]
 * @param {object} [opts.user]
 * @param {object} [opts.message]
 * @param {import('../../models/CustomCommand.js').default} [opts.cc]
 * @param {string} [opts.prefix]
 * @param {string[]} [opts.args]
 * @param {string[]} [opts.cmdArgs]
 * @param {string} [opts.stripped]
 * @param {string} [opts.matchedText]
 * @param {any} [opts.execData]
 * @param {number} [opts.stackDepth]
 * @param {object} [opts.reaction]
 */
export function buildContext(opts) {
	const {
		client,
		guild,
		channel,
		member,
		user,
		message,
		cc,
		prefix = '-',
		args = [],
		cmdArgs = [],
		stripped = '',
		matchedText = '',
		execData = null,
		stackDepth = 0,
		reaction = null,
		interaction = null,
		interactionData = null,
	} = opts;

	const g = guildObject(guild);
	const u = userObject(user ?? (member ? member.user : null));

	const context = {
		CCID: cc?.ccid ?? 0,
		CCRunCount: cc?.runCount ?? 0,
		CCTrigger: matchedText,
		BotUser: client?.user ? userObject(client.user) : null,
		ServerPrefix: prefix,
		IsMessageEdit: opts.isEdit ?? false,
		ExecData: execData,
		StackDepth: stackDepth,
		Guild: g,
		Channel: channelObject(channel),
		User: u,
		Member: memberObject(member),
		Message: messageObject(message),
		Args: new CSlice(...args),
		Cmd: args.length > 0 ? args[0] : matchedText,
		CmdArgs: new CSlice(...cmdArgs),
		StrippedMsg: stripped,
		Reaction: reaction ? {
			UserID: reaction.userId,
			MessageID: reaction.messageId,
			ChannelID: reaction.channelId,
			GuildID: reaction.guildId,
			Emoji: reaction.emoji ? {
				ID: reaction.emoji.id,
				Name: reaction.emoji.name,
				APIName: reaction.emoji.identifier,
				MessageFormat: reaction.emoji.toString(),
			} : null,
		} : null,
		ReactionAdded: opts.reactionAdded ?? false,
		ReactionMessage: opts.reactionMessage ? messageObject(opts.reactionMessage) : null,
		// Interaction context (component/modal triggers), per YAGPDB's docs.
		Interaction: interaction ? {
			Token: interaction.token,
			ID: interaction.id,
			Locale: interaction.locale,
			ChannelID: interaction.channelId,
			RespondedTo: Boolean(interaction.replied || interaction.deferred),
			Member: interaction.member ? memberObject(interaction.member) : null,
			Message: interaction.message ? {
				ID: interaction.message.id,
				Content: interaction.message.content,
			} : null,
		} : null,
		CustomID: interactionData?.customId ?? null,
		StrippedID: interactionData?.stripped ?? null,
		Values: new CSlice(...(interactionData?.values ?? [])),
		IsButton: interactionData?.isComponent === true && (interaction?.isButton?.() ?? false),
		IsMenu: interactionData?.isComponent === true && (interaction?.isAnySelectMenu?.() ?? false),
		MenuType: interactionData?.isComponent === true && interaction?.isAnySelectMenu?.() ? interaction.component?.type : null,
	};

	// Attach a __ctx reference for the runner (non-enumerable).
	Object.defineProperty(context, '__meta', {
		value: {
			guild,
			channel,
			member,
			user,
			message,
			reaction,
			client,
			cc,
			prefix,
			interaction,
		},
		enumerable: false,
	});

	return context;
}

export { makeSDict, SDict };

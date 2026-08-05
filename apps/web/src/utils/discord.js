export function guildIconUrl(guild) {
	if (!guild?.icon) return null;
	const ext = guild.icon.startsWith('a_') ? 'gif' : 'png';
	return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${ext}?size=64`;
}

export function userAvatarUrl(user) {
	if (!user?.avatar) return null;
	const ext = user.avatar.startsWith('a_') ? 'gif' : 'png';
	return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=64`;
}
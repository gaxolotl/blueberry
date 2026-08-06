import { ContainerBuilder, MessageFlags } from 'discord.js';
import config from '../config.js';
import OnboardingConfig from '../models/OnboardingConfig.js';
import { getAccentColor, getErrorColor } from './color.js';
import { t } from './i18n.js';

async function getOnboardingConfig(guildId) {
	return OnboardingConfig.findOneAndUpdate(
		{ guildId },
		{ $setOnInsert: { guildId } },
		{ upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
	).lean();
}

async function sendOnboardingMessage(channel, guildId, content, error = false) {
	if (!channel?.isTextBased()) return false;
	const container = new ContainerBuilder()
		.setAccentColor(await (error ? getErrorColor(guildId) : getAccentColor(guildId)))
		.addTextDisplayComponents(textDisplay => textDisplay.setContent(content));
	await channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
	return true;
}

function renderOnboardingMessage(template, member, inviteCode = null) {
	return String(template || config.onboarding.welcomeMessage)
		.replaceAll('{user}', `<@${member.id}>`)
		.replaceAll('{username}', member.user.username)
		.replaceAll('{server}', member.guild.name)
		.replaceAll('{invite}', inviteCode && inviteCode !== 'unknown' ? `\`${inviteCode}\`` : 'an invite');
}

async function sendWelcomeMessage(member, inviteCode) {
	const settings = await getOnboardingConfig(member.guild.id);
	if (!settings.welcomeEnabled || !settings.welcomeChannelId) return false;
	const channel = await member.guild.channels.fetch(settings.welcomeChannelId).catch(() => null);
	return sendOnboardingMessage(channel, member.guild.id, renderOnboardingMessage(settings.welcomeMessage, member, inviteCode));
}

async function sendFarewellMessage(member) {
	const settings = await getOnboardingConfig(member.guild.id);
	if (!settings.farewellEnabled || !settings.farewellChannelId) return false;
	const channel = await member.guild.channels.fetch(settings.farewellChannelId).catch(() => null);
	return sendOnboardingMessage(channel, member.guild.id, renderOnboardingMessage(settings.farewellMessage, member));
}

async function applyNewcomerSafety(member, settings = null) {
	if (member.user.bot) return { rolesAdded: 0, alerted: false };
	const onboarding = settings ?? await getOnboardingConfig(member.guild.id);
	let rolesAdded = 0;
	if (onboarding.autoRoleIds.length) {
		const botMember = member.guild.members.me;
		const manageableRoleIds = onboarding.autoRoleIds.filter(roleId => {
			const role = member.guild.roles.cache.get(roleId);
			return role && !role.managed && botMember && role.position < botMember.roles.highest.position;
		});
		if (manageableRoleIds.length) {
			await member.roles.add(manageableRoleIds, 'Blueberry newcomer automatic roles');
			rolesAdded = manageableRoleIds.length;
		}
	}

	let alerted = false;
	const accountAgeDays = Math.floor((Date.now() - member.user.createdTimestamp) / 86_400_000);
	if (onboarding.accountAgeAlertEnabled && onboarding.accountAgeAlertChannelId && accountAgeDays < onboarding.accountAgeMinimumDays) {
		const channel = await member.guild.channels.fetch(onboarding.accountAgeAlertChannelId).catch(() => null);
		const content = await t(member.guild.id, 'onboarding_account_age_alert', {
			userId: member.id,
			age: accountAgeDays,
			minimum: onboarding.accountAgeMinimumDays,
		});
		alerted = await sendOnboardingMessage(channel, member.guild.id, content, true);
	}

	return { rolesAdded, alerted };
}

export {
	getOnboardingConfig,
	renderOnboardingMessage,
	sendWelcomeMessage,
	sendFarewellMessage,
	applyNewcomerSafety,
};

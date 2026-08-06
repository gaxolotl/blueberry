import { Events } from 'discord.js';
import { appendInviteRecord, buildInviteRecord, findInviteThatWasUsed, getStoredInviteSnapshot, snapshotGuildInvites } from '../utils/inviteTracker.js';
import logger from '../utils/logger.js';
import { applyNewcomerSafety, getOnboardingConfig, sendWelcomeMessage } from '../utils/onboarding.js';

export default {
	name: Events.GuildMemberAdd,
	async execute(member) {
		const guild = member.guild;
		const inviteData = {
			code: 'unknown',
			link: 'unknown',
			inviterId: 'unknown',
			inviterTag: 'unknown',
			channelId: 'unknown',
			channel: 'unknown',
			uses: 'unknown',
			maxUses: 'unknown',
			temporary: 'unknown',
			createdTimestamp: 'unknown',
			expiresTimestamp: 'unknown',
			vanityUrlJoin: 'unknown',
		};
		let inviteResolved = false;

		try {
			const previousSnapshot = getStoredInviteSnapshot(guild.id);
			const currentSnapshot = await snapshotGuildInvites(guild);
			const usedInvite = findInviteThatWasUsed(previousSnapshot, currentSnapshot);
			if (usedInvite) {
				Object.assign(inviteData, usedInvite);
				inviteResolved = true;
			}
		}
		catch (error) {
			logger.warn(`Unable to resolve the invite for ${member.user.tag}: ${error.message}`);
		}

		if (inviteData.code === 'unknown') {
			if (guild.vanityURLCode) {
				inviteData.code = guild.vanityURLCode;
				inviteData.link = `https://discord.gg/${guild.vanityURLCode}`;
				inviteData.vanityUrlJoin = true;
			}
			else if (!inviteResolved) {
				inviteData.vanityUrlJoin = 'unknown';
			}
			else {
				inviteData.vanityUrlJoin = false;
			}
		}

		const record = buildInviteRecord(member, guild, inviteData);
		try {
			await appendInviteRecord(record);
			logger.event(`Tracked join for ${member.user.tag} in ${guild.name}`);
		}
		catch (error) {
			logger.error(`Failed to write invite record for ${member.user.tag}: ${error.message}`);
		}

		try {
			const settings = await getOnboardingConfig(guild.id);
			if (settings.welcomeEnabled) await sendWelcomeMessage(member, inviteData.code);
			const safetyResult = await applyNewcomerSafety(member, settings);
			if (safetyResult.rolesAdded || safetyResult.alerted) {
				logger.event(`Applied newcomer safety for ${member.user.tag}: ${safetyResult.rolesAdded} role(s), alert ${safetyResult.alerted ? 'sent' : 'not sent'}`);
			}
		}
		catch (error) {
			logger.error(`Failed to send welcome message for ${member.user.tag}: ${error.message}`);
		}
	},
};

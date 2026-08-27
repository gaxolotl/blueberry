import { Schema, model } from 'mongoose';

const inviteJoinSchema = new Schema({
	guildId: { type: String, required: true, index: true },
	guildName: { type: String, default: 'unknown' },
	memberId: { type: String, required: true },
	memberTag: { type: String, required: true },
	memberAvatar: { type: String, default: null },
	accountAgeDays: { type: Number, default: null },
	isBot: { type: Boolean, default: false },
	inviteCode: { type: String, default: 'unknown' },
	inviteLink: { type: String, default: 'unknown' },
	inviterId: { type: String, default: 'unknown' },
	inviterTag: { type: String, default: 'unknown' },
	inviterAvatar: { type: String, default: null },
	channel: { type: String, default: 'unknown' },
	channelId: { type: String, default: 'unknown' },
	uses: { type: Schema.Types.Mixed, default: 'unknown' },
	maxUses: { type: Schema.Types.Mixed, default: 'unknown' },
	temporary: { type: Schema.Types.Mixed, default: 'unknown' },
	createdTimestamp: { type: Schema.Types.Mixed, default: 'unknown' },
	expiresTimestamp: { type: Schema.Types.Mixed, default: 'unknown' },
	vanityUrlJoin: { type: Schema.Types.Mixed, default: 'unknown' },
	joinedAt: { type: Date, default: Date.now },
});

inviteJoinSchema.index({ guildId: 1, joinedAt: -1 });

export default model('InviteJoin', inviteJoinSchema);
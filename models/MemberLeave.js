import { Schema, model } from 'mongoose';

const memberLeaveSchema = new Schema({
	guildId: { type: String, required: true, index: true },
	guildName: { type: String, default: 'unknown' },
	memberId: { type: String, required: true },
	memberTag: { type: String, default: 'unknown' },
	memberAvatar: { type: String, default: null },
	accountAgeDays: { type: Number, default: null },
	isBot: { type: Boolean, default: false },
	durationDays: { type: Number, default: null },
	joinedAt: { type: Date, default: null },
	leftAt: { type: Date, default: Date.now },
});

memberLeaveSchema.index({ guildId: 1, leftAt: -1 });
memberLeaveSchema.index({ guildId: 1, memberId: 1 });

export default model('MemberLeave', memberLeaveSchema);
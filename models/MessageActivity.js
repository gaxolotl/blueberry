import { Schema, model } from 'mongoose';

const messageActivitySchema = new Schema({
	guildId: { type: String, required: true, index: true },
	day: { type: String, required: true },
	hour: { type: Number, required: true, min: 0, max: 23 },
	userId: { type: String, required: true },
	userTag: { type: String, default: 'Unknown' },
	channelId: { type: String, default: null },
	count: { type: Number, default: 1 },
});

messageActivitySchema.index({ guildId: 1, day: 1, hour: 1 });
messageActivitySchema.index({ guildId: 1, userId: 1, day: 1 });

export default model('MessageActivity', messageActivitySchema);
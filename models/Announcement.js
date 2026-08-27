import { Schema, model } from 'mongoose';

const announcementSchema = new Schema({
	guildId: { type: String, required: true, index: true },
	label: { type: String, required: true },
	channelId: { type: String, default: null },
	enabled: { type: Boolean, default: true },
	mentionRoleId: { type: String, default: null },
	message: { type: String, default: '' },
	template: { type: Schema.Types.Mixed, default: null },
	frequency: { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'daily' },
	hour: { type: Number, min: 0, max: 23, default: 9 },
	minute: { type: Number, min: 0, max: 59, default: 0 },
	weekday: { type: Number, min: 0, max: 6, default: 0 },
	dayOfMonth: { type: Number, min: 1, max: 31, default: 1 },
	utcOffsetMinutes: { type: Number, default: 0 },
	lastRunAt: { type: Date, default: null },
	nextRunAt: { type: Date, default: null },
	runCount: { type: Number, default: 0 },
	createdAt: { type: Date, default: Date.now },
});

announcementSchema.index({ enabled: 1, nextRunAt: 1 });

export default model('Announcement', announcementSchema);
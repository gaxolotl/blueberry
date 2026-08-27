import { Schema, model } from 'mongoose';

const restrictionSchema = new Schema({
	allowRoleIds: { type: [String], default: [] },
	denyRoleIds: { type: [String], default: [] },
	allowChannelIds: { type: [String], default: [] },
	denyChannelIds: { type: [String], default: [] },
}, { _id: false });

const intervalSchema = new Schema({
	unit: { type: String, enum: ['minutes', 'hours'], default: 'hours' },
	value: { type: Number, default: 1 },
	channelId: { type: String, default: null },
	excludeHours: { type: [Number], default: [] },
	excludeWeekdays: { type: [Number], default: [] },
}, { _id: false });

const cronSchema = new Schema({
	expression: { type: String, default: '' },
	channelId: { type: String, default: null },
	excludeHours: { type: [Number], default: [] },
	excludeWeekdays: { type: [Number], default: [] },
}, { _id: false });

const customCommandSchema = new Schema({
	guildId: { type: String, required: true, index: true },
	ccid: { type: Number, required: true },
	name: { type: String, default: '' },
	enabled: { type: Boolean, default: true },
	triggerType: {
		type: String,
		enum: ['command', 'startsWith', 'contains', 'regex', 'exactMatch', 'reaction', 'interval', 'crontab', 'component', 'modal'],
		required: true,
	},
	trigger: { type: String, default: '' },
	caseSensitive: { type: Boolean, default: false },
	editTrigger: { type: Boolean, default: false },
	responses: { type: [String], default: [] },
	responseMode: { type: String, enum: ['text', 'embed', 'componentsV2'], default: 'componentsV2' },
	groupId: { type: String, default: null },
	restrictions: { type: restrictionSchema, default: () => ({}) },
	reactionAdded: { type: Boolean, default: true },
	reactionRemoved: { type: Boolean, default: false },
	interval: { type: intervalSchema, default: null },
	cron: { type: cronSchema, default: null },
	runCount: { type: Number, default: 0 },
	lastRunAt: { type: Date, default: null },
	lastError: { type: String, default: null },
	nextRunAt: { type: Date, default: null },
	createdAt: { type: Date, default: Date.now },
});

customCommandSchema.index({ guildId: 1, ccid: 1 }, { unique: true });

export default model('CustomCommand', customCommandSchema);

import { Schema, model } from 'mongoose';

const patchNoteSourceSchema = new Schema({
	id: { type: String, required: true },
	type: { type: String, enum: ['rss', 'github', 'webhook'], required: true },
	label: { type: String, required: true },
	url: { type: String, default: null },
	token: { type: String, default: null },
	lastGuid: { type: String, default: null },
	lastPublishedAt: { type: Date, default: null },
	lastCheckedAt: { type: Date, default: null },
	retryAt: { type: Date, default: null },
	seenGuids: { type: [String], default: [] },
	enabled: { type: Boolean, default: true },
}, { _id: false });

const patchNoteConfigSchema = new Schema({
	guildId: { type: String, required: true, unique: true, index: true },
	channelId: { type: String, default: null },
	enabled: { type: Boolean, default: false },
	showDownloads: { type: Boolean, default: true },
	showChangelog: { type: Boolean, default: true },
	mentionRoleId: { type: String, default: null },
	sources: { type: [patchNoteSourceSchema], default: [] },
	lastCheckedAt: { type: Date, default: null },
});

patchNoteConfigSchema.index({ guildId: 1, 'sources.id': 1 });
patchNoteConfigSchema.index({ enabled: 1, channelId: 1 });

export default model('PatchNoteConfig', patchNoteConfigSchema);

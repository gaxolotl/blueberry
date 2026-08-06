import { Schema, model } from 'mongoose';

const patchNoteSchema = new Schema({
	guildId: { type: String, required: true, index: true },
	sourceId: { type: String, required: true, default: 'webhook' },
	sourceType: { type: String, enum: ['rss', 'github', 'webhook'], required: true, default: 'webhook' },
	guid: { type: String, required: true },
	title: { type: String, required: true },
	link: { type: String, default: null },
	publishedAt: { type: Date, default: Date.now },
	content: { type: String, default: '' },
	sourceLabel: { type: String, default: 'Webhook' },
	assets: { type: [Schema.Types.Mixed], default: [] },
	published: { type: Boolean, default: false },
	attempts: { type: Number, default: 0 },
	nextAttemptAt: { type: Date, default: Date.now },
	claimedAt: { type: Date, default: null },
	lastError: { type: String, default: null },
	failedAt: { type: Date, default: null },
	createdAt: { type: Date, default: Date.now },
	publishedAtDiscord: { type: Date, default: null },
});

patchNoteSchema.index({ guildId: 1, sourceId: 1, guid: 1 }, { unique: true });
patchNoteSchema.index({ published: 1, failedAt: 1, nextAttemptAt: 1, claimedAt: 1, createdAt: 1 });

export default model('PatchNote', patchNoteSchema);

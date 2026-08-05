import { Schema, model } from 'mongoose';

const patchNoteSchema = new Schema({
	guildId: { type: String, required: true, index: true },
	guid: { type: String, required: true },
	title: { type: String, required: true },
	link: { type: String, default: null },
	publishedAt: { type: Date, default: Date.now },
	content: { type: String, default: '' },
	sourceLabel: { type: String, default: 'Webhook' },
	assets: { type: [Schema.Types.Mixed], default: [] },
	published: { type: Boolean, default: false },
	createdAt: { type: Date, default: Date.now },
});

patchNoteSchema.index({ guildId: 1, published: 1, createdAt: -1 });

export default model('PatchNote', patchNoteSchema);

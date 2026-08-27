import { Schema, model } from 'mongoose';

const customCommandDBEntrySchema = new Schema({
	guildId: { type: String, required: true, index: true },
	userId: { type: String, required: true, default: '0' },
	key: { type: String, required: true },
	value: { type: Schema.Types.Mixed, default: null },
	expiresAt: { type: Date, default: null },
	createdAt: { type: Date, default: Date.now },
	updatedAt: { type: Date, default: Date.now },
});

customCommandDBEntrySchema.index({ guildId: 1, userId: 1, key: 1 }, { unique: true });
customCommandDBEntrySchema.index({ guildId: 1, userId: 1, updatedAt: -1 });

export default model('CustomCommandDBEntry', customCommandDBEntrySchema);

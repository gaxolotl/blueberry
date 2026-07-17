import { Schema, model } from 'mongoose';

const guildSchema = new Schema({
	guildId: { type: String, required: true, unique: true, index: true },
	language: { type: String, default: 'en', enum: ['en', 'bg'] },
	createdAt: { type: Date, default: Date.now },
});

export default model('Guild', guildSchema);
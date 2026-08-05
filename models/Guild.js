import { Schema, model } from 'mongoose';

const guildSchema = new Schema({
	guildId: { type: String, required: true, unique: true, index: true },
	name: { type: String, default: null },
	icon: { type: String, default: null },
	language: { type: String, default: 'en', enum: ['en', 'bg'] },
	manageRoleIds: { type: [String], default: [] },
	createdAt: { type: Date, default: Date.now },
});

export default model('Guild', guildSchema);

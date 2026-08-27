import { Schema, model } from 'mongoose';

const restrictionSchema = new Schema({
	allowRoleIds: { type: [String], default: [] },
	denyRoleIds: { type: [String], default: [] },
	allowChannelIds: { type: [String], default: [] },
	denyChannelIds: { type: [String], default: [] },
}, { _id: false });

const customCommandGroupSchema = new Schema({
	guildId: { type: String, required: true, index: true },
	name: { type: String, required: true },
	restrictions: { type: restrictionSchema, default: () => ({}) },
	createdAt: { type: Date, default: Date.now },
});

customCommandGroupSchema.index({ guildId: 1, name: 1 }, { unique: true });

export default model('CustomCommandGroup', customCommandGroupSchema);

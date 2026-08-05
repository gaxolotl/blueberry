import { Schema, model } from 'mongoose';

const sessionGuildSchema = new Schema({
	id: { type: String, required: true },
	name: { type: String, default: 'unknown' },
	icon: { type: String, default: null },
	owner: { type: Boolean, default: false },
	permissions: { type: String, default: '0' },
}, { _id: false });

const sessionSchema = new Schema({
	token: { type: String, required: true, unique: true, index: true },
	discordId: { type: String, required: true, index: true },
	username: { type: String, default: 'unknown' },
	avatar: { type: String, default: null },
	accessToken: { type: String, required: true },
	accessTokenExpiresAt: { type: Date, required: true },
	refreshToken: { type: String, required: true },
	guilds: { type: [sessionGuildSchema], default: [] },
	createdAt: { type: Date, default: Date.now },
});

export default model('Session', sessionSchema);
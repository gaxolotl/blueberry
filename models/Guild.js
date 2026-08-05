import { Schema, model } from 'mongoose';
import config from '../config.js';

const HEX_VALIDATOR = {
	validator: (value) => /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(value)),
	message: (props) => `${props.value} is not a valid hex color!`,
};

const guildSchema = new Schema({
	guildId: { type: String, required: true, unique: true, index: true },
	name: { type: String, default: null },
	icon: { type: String, default: null },
	language: { type: String, default: 'en', enum: ['en', 'bg'] },
	manageRoleIds: { type: [String], default: [] },
	accentColor: { type: String, default: config.accentColor, validate: HEX_VALIDATOR },
	errorColor: { type: String, default: config.errorColor || '#FF0000', validate: HEX_VALIDATOR },
	createdAt: { type: Date, default: Date.now },
});

export default model('Guild', guildSchema);

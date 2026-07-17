import { Schema, model } from 'mongoose';

const ticketCategorySchema = new Schema({
	id: { type: String, required: true },
	label: { type: String, required: true },
	emoji: { type: String, default: null },
	description: { type: String, default: null },
}, { _id: false });

const ticketConfigSchema = new Schema({
	guildId: { type: String, required: true, unique: true, index: true },
	threadChannelId: { type: String, default: null },
	logChannelId: { type: String, default: null },
	panelChannelId: { type: String, default: null },
	panelMessageId: { type: String, default: null },
	panelTitle: { type: String, default: 'Support Tickets' },
	panelDescription: { type: String, default: 'Select a category below to open a private ticket thread.' },
	categories: { type: [ticketCategorySchema], default: [] },
	supportRoleIds: { type: [String], default: [] },
	maxOpenPerUser: { type: Number, default: 1 },
});

export default model('TicketConfig', ticketConfigSchema);

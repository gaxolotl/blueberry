const { Schema, model } = require('mongoose');

const ticketSchema = new Schema({
	guildId: { type: String, required: true, index: true },
	threadId: { type: String, required: true, unique: true },
	categoryId: { type: String, required: true },
	categoryLabel: { type: String, default: 'General' },
	openerId: { type: String, required: true },
	claimedBy: { type: String, default: null },
	welcomeMessageId: { type: String, default: null },
	participants: { type: [String], default: [] },
	status: { type: String, enum: ['open', 'closed'], default: 'open' },
	createdAt: { type: Date, default: Date.now },
	closedAt: { type: Date, default: null },
	closedBy: { type: String, default: null },
});

ticketSchema.index({ guildId: 1, openerId: 1, status: 1 });
ticketSchema.index({ guildId: 1, status: 1, createdAt: -1 });

module.exports = model('Ticket', ticketSchema);
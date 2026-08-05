import { Schema, model } from 'mongoose';

const transcriptMessageSchema = new Schema({
	authorId: { type: String, required: true },
	authorTag: { type: String, default: 'unknown' },
	content: { type: String, default: '' },
	attachments: { type: [String], default: [] },
	createdAt: { type: Date, default: Date.now },
}, { _id: false });

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
	priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
	notes: { type: String, default: null },
	transcript: { type: [transcriptMessageSchema], default: [] },
	transcriptMessageId: { type: String, default: null },
	lastActivityAt: { type: Date, default: Date.now },
	createdAt: { type: Date, default: Date.now },
	closedAt: { type: Date, default: null },
	closedBy: { type: String, default: null },
	closeReason: { type: String, default: null },
});

ticketSchema.index({ guildId: 1, openerId: 1, status: 1 });
ticketSchema.index({ guildId: 1, status: 1, createdAt: -1 });
ticketSchema.index({ guildId: 1, priority: 1, status: 1 });
ticketSchema.index({ guildId: 1, status: 1, lastActivityAt: 1 });

export default model('Ticket', ticketSchema);
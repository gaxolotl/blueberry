const mongoose = require('mongoose');
const logger = require('./logger');

let isConnected = false;

/**
 * Connect to MongoDB using the MONGODB_URI environment variable.
 * Safe to call multiple times — returns the existing connection if already connected.
 * @returns {Promise<typeof mongoose>}
 */
async function connectDatabase() {
	if (isConnected) return mongoose;

	const uri = process.env.MONGODB_URI;
	if (!uri) {
		throw new Error('MONGODB_URI is not set in environment variables');
	}

	mongoose.connection.on('disconnected', () => {
		isConnected = false;
		logger.warn('MongoDB disconnected');
	});

	await mongoose.connect(uri);
	isConnected = true;
	logger.success('Connected to MongoDB');

	return mongoose;
}

module.exports = {
	connectDatabase,
	mongoose,
};

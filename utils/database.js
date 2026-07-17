import mongoose from 'mongoose';
import logger from './logger.js';

let isConnected = false;

async function connectDatabase() {
	if (isConnected) return mongoose;

	const uri = process.env.MONGODB_URI;
	if (!uri) throw new Error('MONGODB_URI is not set in environment variables');

	mongoose.connection.on('disconnected', () => {
		isConnected = false;
		logger.warn('MongoDB disconnected');
	});

	await mongoose.connect(uri);
	isConnected = true;
	logger.success('Connected to MongoDB');

	return mongoose;
}

export { connectDatabase, mongoose };
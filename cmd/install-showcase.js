// Install the custom-command feature showcase into a guild's custom commands.
// Usage: node cmd/install-showcase.js   (uses config.guildId)
import mongoose from 'mongoose';
import config from '../config.js';
import CustomCommand from '../models/CustomCommand.js';
import logger from '../utils/logger.js';
import { connectDatabase } from '../utils/database.js';
import {
	SHOWCASE_MAIN_TEMPLATE,
	SHOWCASE_CONFIG,
	SHOWCASE_INTERACTIONS,
} from '../utils/customCommands/showcase.js';
import { getCustomCommandLimits, getNextCCID } from '../utils/customCommands/limits.js';
import { validateCommandRuntime } from '../utils/customCommands/crud.js';

async function installOne(guildId, ccConfig, responses, label) {
	validateCommandRuntime({ responses, triggerType: ccConfig.triggerType });

	const existing = await CustomCommand.findOne({ guildId, trigger: ccConfig.trigger, triggerType: ccConfig.triggerType });
	if (existing) {
		existing.set({ ...ccConfig, responses });
		await existing.save();
		logger.success(`Updated ${label} (ccid #${existing.ccid}) for guild ${guildId}`);
		return existing;
	}

	const limits = getCustomCommandLimits();
	const count = await CustomCommand.countDocuments({ guildId, triggerType: ccConfig.triggerType });
	const maxKey = ccConfig.triggerType === 'command' ? 'maxCommands' : 'maxInteractions';
	if (count >= limits[maxKey]) {
		logger.warn(`Guild ${guildId} is at the ${ccConfig.triggerType} limit (${limits[maxKey]}); ${label} not installed.`);
		return null;
	}

	const ccid = await getNextCCID(guildId, CustomCommand);
	const created = await CustomCommand.create({
		guildId,
		ccid,
		enabled: true,
		...ccConfig,
		responses,
	});
	logger.success(`Installed ${label} (ccid #${ccid}) for guild ${guildId}`);
	return created;
}

async function install(guildId) {
	await connectDatabase();

	// Install main command
	await installOne(guildId, SHOWCASE_CONFIG, [SHOWCASE_MAIN_TEMPLATE], 'showcase command');

	// Install interaction commands
	for (const interaction of SHOWCASE_INTERACTIONS) {
		await installOne(guildId, interaction, interaction.responses, `interaction "${interaction.name}"`);
	}

	logger.info(`Try it in Discord with: \`-${SHOWCASE_CONFIG.trigger}\` (server prefix is "-")`);
}

install(config.guildId)
	.then(() => mongoose.disconnect())
	.catch(error => {
		logger.error('Failed to install showcase command:', error);
		mongoose.disconnect();
		process.exit(1);
	});
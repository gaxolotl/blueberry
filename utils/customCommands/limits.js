import config from '../../config.js';

export function getCustomCommandLimits() {
	return {
		maxCommands: config.customCommands?.maxCommands ?? 100,
		maxGroups: config.customCommands?.maxGroups ?? 20,
		maxGroupNameLength: config.customCommands?.maxGroupNameLength ?? 100,
		maxTriggerLength: config.customCommands?.maxTriggerLength ?? 1000,
		maxResponseLength: config.customCommands?.maxResponseLength ?? 10000,
		maxResponses: config.customCommands?.maxResponses ?? 20,
		maxNameLength: config.customCommands?.maxNameLength ?? 100,
		maxDBKeyLength: config.customCommands?.maxDBKeyLength ?? 256,
		maxDBValueBytes: config.customCommands?.maxDBValueBytes ?? 100_000,
		maxDBPatternLength: config.customCommands?.maxDBPatternLength ?? 256,
		responseCharLimit: config.customCommands?.responseCharLimit ?? 2000,
		minIntervalSeconds: config.customCommands?.minIntervalSeconds ?? 300,
		minIntervalMinutes: config.customCommands?.minIntervalMinutes ?? 5,
		maxIntervalSeconds: config.customCommands?.maxIntervalSeconds ?? 2_592_000,
		minCronIntervalSeconds: config.customCommands?.minCronIntervalSeconds ?? 600,
		maxExecDataLength: config.customCommands?.maxExecDataLength ?? 8192,
		schedulerPollSeconds: config.customCommands?.schedulerPollSeconds ?? 15,
	};
}

export async function getNextCCID(guildId, CustomCommand) {
	const last = await CustomCommand.findOne({ guildId }).sort({ ccid: -1 }).select('ccid').lean();
	return (last?.ccid ?? 0) + 1;
}

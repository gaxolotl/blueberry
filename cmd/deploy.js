import { REST, Routes } from 'discord.js';
import config from '../config.js';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import logger from '../utils/logger.js';

const clientId = config.clientId;
const guildId = config.guildId;
const commands = [];
const seenNames = new Set();

const foldersPath = path.join(import.meta.dirname, '../commands');
const commandFolders = fs.readdirSync(foldersPath).filter((f) =>
	fs.statSync(path.join(foldersPath, f)).isDirectory(),
);

for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = (await import(pathToFileURL(filePath).href)).default;

		if ('data' in command && 'execute' in command) {
			const json = command.data.toJSON();

			if (seenNames.has(json.name)) {
				logger.warn(`Duplicate command name "${json.name}" found at ${filePath} — skipping.`);
				continue;
			}

			seenNames.add(json.name);
			commands.push(json);
		}
		else {
			logger.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
	try {
		if (guildId) {
			logger.info(`Clearing guild-scoped commands for guild ${guildId}.`);
			await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
			logger.success('Guild-scoped commands cleared.');
		}

		logger.info(`Started refreshing ${commands.length} global application (/) commands.`);

		const data = await rest.put(Routes.applicationCommands(clientId), { body: commands });

		logger.success(`Successfully reloaded ${data.length} global application (/) commands.`);
	}
	catch (error) {
		console.error(error);
	}
})();
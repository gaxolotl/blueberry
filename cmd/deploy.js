const { REST, Routes } = require('discord.js');
const { clientId, guildId } = require('../config.js');
const fs = require('node:fs');
const path = require('node:path');
const logger = require('../utils/logger');

const commands = [];
const seenNames = new Set();

// Grab all the command folders from the commands directory you created earlier
const foldersPath = path.join(__dirname, '../commands');
const commandFolders = fs.readdirSync(foldersPath).filter((f) =>
	fs.statSync(path.join(foldersPath, f)).isDirectory(),
);

for (const folder of commandFolders) {
	// Grab all the command files from the commands directory you created earlier
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));
	// Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
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

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
	try {
		// Wipe any leftover guild-scoped commands first so they don't sit alongside
		// the global ones (guild commands take priority in a guild and can look like duplicates).
		if (guildId) {
			logger.info(`Clearing guild-scoped commands for guild ${guildId}.`);
			await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
			logger.success('Guild-scoped commands cleared.');
		}

		logger.info(`Started refreshing ${commands.length} global application (/) commands.`);

		// The put method fully refreshes all GLOBAL commands with the current set
		const data = await rest.put(Routes.applicationCommands(clientId), { body: commands });

		logger.success(`Successfully reloaded ${data.length} global application (/) commands.`);
	}
	catch (error) {
		console.error(error);
	}
})();
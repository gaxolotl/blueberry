import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client, Collection, GatewayIntentBits, ActivityType } from 'discord.js';

import logger from './utils/logger.js';
import { connectDatabase } from './utils/database.js';
import pkg from './package.json' with { type: 'json' };

const token = process.env.DISCORD_TOKEN;

const __dirname = path.dirname(new URL(import.meta.url).pathname);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildInvites],
  presence: {
    status: 'online',
    activities: [
      {
        name: `🪽 ${pkg.author} | v${pkg.version}`,
        type: ActivityType.Custom,
      },
    ],
  },
});

client.commands = new Collection();

async function loadCommands() {
  const foldersPath = path.join(__dirname, 'commands');
  const commandFolders = fs.readdirSync(foldersPath);

  for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      const moduleUrl = pathToFileURL(filePath).href;

      const mod = await import(moduleUrl);
      const command = mod.default ?? mod;

      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
      } else {
        logger.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
      }
    }
  }
}

async function loadEvents() {
  const eventsPath = path.join(__dirname, 'events');
  const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith('.js'));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const moduleUrl = pathToFileURL(filePath).href;

    const mod = await import(moduleUrl);
    const event = mod.default ?? mod;

    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }
  }
}

async function start() {
  try {
    await connectDatabase();
    await loadCommands();
    await loadEvents();
    await client.login(token);
  } catch (error) {
    logger.error('Failed to start bot:', error);
    process.exit(1);
  }
}

start();

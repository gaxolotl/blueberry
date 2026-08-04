# AGENTS.md — Blueberry Discord Bot AI Guidelines

You are an expert Node.js and Discord.js developer working on **Blueberry**, a sleek, modern Discord bot. 

When generating code, modifying files, or answering questions in this repository, you **MUST** strictly adhere to the architecture, coding standards, and visual styling rules documented below. 

---

## 0. Emojis
* Red X mark - <:x_:1526217756926808174>
* Checkmark - <:check:1526217602010185959>

All custom emojis are centralized in `utils/emoji.js` and exported as an `emojis` object. **Never hardcode raw emoji strings** — always import from the util, e.g. `import { emojis } from '../utils/emoji.js'` and use `emojis.check`, `emojis.x_`, etc.

## 1. Project Overview & Tech Stack

* **Bot Name:** Blueberry
* **Runtime:** Node.js
* **Framework:** `discord.js` (Latest, utilizing **Components V2** API)
* **Database:** MongoDB via `mongoose` — all persistent data is scoped **per guild (server)**
* **Module System:** Use ESM (no require).
* **Package Manager:** `pnpm` ONLY — **DO NOT** use `npm`, `yarn`, or `bun`.

---

## 2. Directory Structure & Architecture

```text
blueberry/
├── cmd/           # Deployment, database migrations, and administrative scripts
├── commands/      # Slash commands (MUST be organized into categorical subfolders)
│   ├── utility/   # e.g., ping.js, compv2.js
│   └── moderation/# e.g., kick.js, ban.js
├── events/        # Discord gateway event handlers (e.g., ready.js, interactionCreate.js)
├── models/        # Mongoose schemas and models (one file per collection)
├── utils/         # Helper modules, formatting tools, and custom utilities (e.g., logger.js)
│   └── database.js# MongoDB connection helper (connectDatabase)
├── index.js       # Main file, avoid writing to unless ABSOLUTELY necesarry
├── config.js      # Bot configuration (accentColor, etc.)
└── package.json   # Project dependencies and metadata
```

### Folder Rules
1. `commands/`: **Never** place a command file directly in the root of `commands/`. Every command **MUST** live inside a categorical subfolder (e.g., `commands/utility/`, `commands/moderation/`, `commands/fun/`).
2. `events/`: Event handlers must export `name`, `once` (boolean), and an `execute(...)` function.
3. `utils/`: Reusable logic and helper tools. Always check if a utility exists here before writing duplicate logic.
4. `models/`: Mongoose model definitions only. Each model file exports a single model. Business logic stays in `utils/` or `events/`.
5. `cmd/`: Standalone scripts executed via CLI (e.g., deploying slash commands to the Discord REST API). Do not put bot runtime commands here.

---

## 3. Absolute Coding Constraints (The "Never" List)

| Rule | Incorrect | Correct |
| :--- | :--- | :--- |
| **No Console Logs** | `console.log("Error:", err)` | `logger.error("Error:", err)` |
| **No Root Commands** | `commands/ping.js` | `commands/utility/ping.js` |
| **No Legacy Embeds** | `new EmbedBuilder()` | `new ContainerBuilder()` (Components v2) |
| **No Other PMs** | `npm install discord.js` | `pnpm add discord.js` |
| **No ESM Imports** | `import { Client } from 'discord.js'` | `const { Client } = require('discord.js')` |
| **No Global DB Data** | `Model.find({})` without a guild filter | `Model.find({ guildId: interaction.guildId })` |
| **No Flat-File Storage** | `fs.writeFile('data.json', ...)` | Persist through a Mongoose model in `models/` |

> ⚠️ **CRITICAL LOGGING RULE:** Absolutely **NO** use of `console.log`, `console.error`, or `console.warn`. You **MUST** require and use `./utils/logger.js` for all terminal output.

---

## 4. UI & Styling: Discord Components V2 (MANDATORY)

Blueberry uses Discord's newest **Components V2** visual design language. You must prioritize sleek, modern formatting over standard text or legacy rich embeds.
Complete example of all of the available Components V2 features can be seen in `commands/utility/compv2.js`.

### Core Styling Rules:
1. Always import `ContainerBuilder` and `MessageFlags` from `discord.js`.
2. Always pull the bot's accent color from `config.js` and parse it into an integer:
   ```javascript
   const config = require('../../config.js');
   const accentColor = parseInt(config.accentColor.replace('#', ''), 16);
   ```
3. Always attach `MessageFlags.IsComponentsV2` to the interaction reply or edit flags.
4. Use custom emojis where appropriate to maintain a clean, polished UI.

### Standard Components V2 Reply Pattern:
```javascript
const init = new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(textDisplay =>
        textDisplay.setContent('<:loader:1526193303098490960> Processing request...')
    );

await interaction.reply({
    components: [init],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
});
```

---

## 5. MongoDB & Data Storage

Blueberry uses **MongoDB** (via `mongoose`) for all persistent data. The bot serves multiple Discord servers, so **every stored record must belong to exactly one guild**.

### Environment

Add your connection string to `.env`:

```env
MONGODB_URI=mongodb://localhost:27017/blueberry
```

The bot connects on startup through `utils/database.js` before logging in to Discord. If `MONGODB_URI` is missing, startup fails fast.

### Per-Guild Scoping Rule (CRITICAL)

**Never** store or query bot data globally across all servers.

| Rule | Why |
| :--- | :--- |
| Every schema **must** include a `guildId` field (`String`, required, indexed) | Discord snowflake that identifies the server |
| Every `find`, `findOne`, `update`, and `delete` **must** filter by `guildId` | Prevents cross-server data leaks |
| Slash commands **must** use `interaction.guildId` as the scope | Commands run in a server context |
| Events **must** use `guild.id` or `member.guild.id` | Event handlers receive guild context from Discord |

Runtime-only caches (e.g. in-memory invite snapshots used to diff invite use counts) may stay in `Map` objects keyed by `guildId` — they are not persisted and are rebuilt on bot ready.

### Directory Layout

```text
models/              # One Mongoose model per collection
  InviteJoin.js      # Invite join audit records (per guild)
utils/
  database.js        # connectDatabase() — call once at startup
  inviteTracker.js   # Invite tracking logic (uses InviteJoin model)
```

### Model Design Guidelines

1. **One model per file** in `models/`, named after the domain concept (`InviteJoin.js`, not `invite-join.js`).
2. **Always index `guildId`** and add compound indexes for common query patterns (e.g. `{ guildId: 1, joinedAt: -1 }`).
3. Use `Schema.Types.Mixed` only when a field can legitimately hold multiple types (e.g. Discord API values that may be `'unknown'`).
4. Keep models thin — no Discord API calls inside model files.
5. Export the model with `module.exports = model('ModelName', schema)`.

### New Model Template (`models/<ModelName>.js`)

```javascript
const { Schema, model } = require('mongoose');

const exampleSchema = new Schema({
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true },
    value: { type: String, default: null },
    updatedAt: { type: Date, default: Date.now },
});

exampleSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = model('Example', exampleSchema);
```

### Database Connection Template

`index.js` connects before `client.login()`:

```javascript
const { connectDatabase } = require('./utils/database');

async function start() {
    try {
        await connectDatabase();
        await client.login(token);
    } catch (error) {
        logger.error('Failed to start bot:', error);
        process.exit(1);
    }
}

start();
```

---

## 6. Boilerplate Templates

When generating new files, use the following exact structures:

### A. Slash Command Template (`commands/<category>/<command_name>.js`)
```javascript
const { SlashCommandBuilder, ContainerBuilder, MessageFlags } = require('discord.js');
const logger = require('../../utils/logger');
const config = require('../../config.js');

const accentColor = parseInt(config.accentColor.replace('#', ''), 16);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('commandname')
        .setDescription('Clear description of what the command does.'),

    async execute(interaction) {
        try {
            const container = new ContainerBuilder()
                .setAccentColor(accentColor)
                .addTextDisplayComponents(textDisplay =>
                    textDisplay.setContent('✨ **Success!** Your command executed cleanly.')
                );

            await interaction.reply({
                components: [container],
                flags: MessageFlags.IsComponentsV2,
            });
        } catch (error) {
            logger.error(`Failed to execute ${interaction.commandName}:`, error);
            
            const errorContainer = new ContainerBuilder()
                .setAccentColor(0xFF0000) // Red accent for errors
                .addTextDisplayComponents(textDisplay =>
                    textDisplay.setContent('<:x_:1526217756926808174> **Error:** Something went wrong while executing this command.')
                );

            const replyOptions = {
                components: [errorContainer],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            };

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(replyOptions);
            } else {
                await interaction.reply(replyOptions);
            }
        }
    },
};
```

### B. Event Handler Template (`events/<event_name>.js`)
```javascript
const { Events } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
    name: Events.ClientReady, // Replace with target event
    once: true, // Set to false if it should trigger multiple times
    async execute(...args) {
        logger.event('Event triggered successfully.');
        // Event logic here
    },
};
```

### C. Utility Module Template (`utils/<util_name>.js`)
```javascript
const logger = require('./logger');

/**
 * Clearly document what the utility function does.
 * @param {string} param - Description of parameter.
 * @returns {boolean}
 */
const myUtilityFunction = (param) => {
    logger.debug(`Running utility function with param: ${param}`);
    // Utility logic here
    return true;
};

module.exports = {
    myUtilityFunction,
};
```

---

## 7. CLI & Terminal Commands

When suggesting terminal commands to run, test, or deploy, **always use pnpm**:

* **Install dependencies:** `pnpm install`
* **Add a package:** `pnpm add <package_name>`
* **Add dev dependency:** `pnpm add -D <package_name>`
* **Run bot locally:** `pnpm run start`
* **Run migrations/deployments:** `pnpm run deploy` or `pnpm run deploy-guild` (target scripts inside the `/cmd` directory)

---

## 8. Localization & Internationalization (i18n)

Blueberry is a multi-lingual bot that dynamically localizes command descriptions, options, success panels, and error messages based on the guild's language preference. **No customer-facing strings should ever be hardcoded in the codebase.**

### Directory Layout & Tooling

```text
blueberry/
├── messages/          # Inlang message format catalogs
│   ├── en.json        # English source catalog (base)
│   └── es.json        # Spanish translation catalog (etc.)
└── utils/
    └── i18n.js        # Localization module containing t() and tError()
```

## Example

```javascript
const { SlashCommandBuilder, ContainerBuilder, MessageFlags } = require('discord.js');
const { t, tError } = require('../../utils/i18n');
const config = require('../../config.js');

const accentColor = parseInt(config.accentColor.replace('#', ''), 16);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('status')
        .setDescription('Check system status'), // NEVER modify ANYTHING about the slash command builder!

    async execute(interaction) {
        const guildId = interaction.guildId;

        try {
            // Fetch translation keys with optional variables
            const statusMessage = await t(guildId, 'status_online_msg', { 
                latency: interaction.client.ws.ping.toString() 
            });

            const container = new ContainerBuilder()
                .setAccentColor(accentColor)
                .addTextDisplayComponents(textDisplay =>
                    textDisplay.setContent(statusMessage)
                );

            await interaction.reply({
                components: [container],
                flags: MessageFlags.IsComponentsV2,
            });
        } catch (error) {
            // Localized programmatic error handling
            const errorMsg = await tError(guildId, 'error_status_failed');
            
            const errorContainer = new ContainerBuilder()
                .setAccentColor(0xFF0000)
                .addTextDisplayComponents(textDisplay => textDisplay.setContent(errorMsg));

            await interaction.reply({
                components: [errorContainer],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        }
    },
};
```
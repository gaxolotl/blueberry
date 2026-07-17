<p align="center">
  <img src="./assets/blueberry_word_small.png" alt="Blueberry" width="520">
</p>

<p align="center">
  <strong>Blueberry</strong> is a modern Discord bot with advanced features and customization, all completely free.
</p>

---

# Features
- Multi-language - Choose from English or Bulgarian (For now, feel free to contribute)
- Thread based ticket system with claiming, panel, configurator and more
- Useful utility commands
- Quick image manipulation commands
- More to come!

> [!NOTE]
> If you do not like that AI usage is allowed in the repo feel free to fork the project as long as you abide by the [LICENSE](./LICENSE)
---

# Support the project

If you would like to support the work of the contributors, consider giving the repo a ⭐\
It helps more people find the project.

---

# Installation

Requirements:
- A Linux, Windows or MacOS system
- Node.js 22 and Git
- Highly recommended **pnpm** package manager *(npm is not recommended)*

1. Clone the repo
```bash
git clone https://github.com/NotValra/RoValra.git
```

2. Install required packages
```bash
pnpm install
```

3. Copy `config.example.js` and `.env.example` and rename to `config.js` and `.env`\
Fill `.env` with the required vars and adjust `config.js` to your preferences.

4. Build language files
```bash
pnpm run build:i18n
```

4. Deploy commands to single guild or globally
```bash
# deploys globally
pnpm run deploy
```

```bash
# deploys to one guild from config.js
pnpm run deploy-guild
```

5. Start the bot

```bash
pnpm run start
```

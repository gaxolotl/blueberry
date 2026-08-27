import { Events, MessageFlags } from 'discord.js';
import logger from '../utils/logger.js';
import { handleTicketButton } from '../utils/ticketSystem/index.js';
import { handleInteractionCommand } from '../utils/customCommands/interactions.js';

export default {
	name: Events.InteractionCreate,
	async execute(interaction) {
		if (interaction.isButton()) {
			try {
				// Custom-command component triggers take priority; if none match,
				// fall through to the ticket system.
				const ccHandled = await handleInteractionCommand(interaction);
				if (ccHandled) return;

				const handled = await handleTicketButton(interaction);
				if (handled) return;
			}
			catch (error) {
				logger.error('Failed to handle button interaction:', error);
				if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
					await interaction.reply({
						content: 'There was an error while handling that button.',
						flags: MessageFlags.Ephemeral,
					}).catch(replyError => logger.error('Failed to send button error reply:', replyError));
				}
			}
			return;
		}

		if (interaction.isAnySelectMenu() || interaction.isModalSubmit()) {
			try {
				const ccHandled = await handleInteractionCommand(interaction);
				if (ccHandled) return;
			}
			catch (error) {
				logger.error('Failed to handle component custom command:', error);
			}
			if (interaction.isModalSubmit()) return;
		}

		if (!interaction.isChatInputCommand()) return;

		const command = interaction.client.commands.get(interaction.commandName);

		if (!command) {
			logger.error(`No command matching ${interaction.commandName} was found.`);
			return;
		}

		try {
			await command.execute(interaction);
		}
		catch (error) {
			logger.error(`Failed to execute ${interaction.commandName}:`, error);

			if (!interaction.isRepliable()) return;

			try {
				if (interaction.replied || interaction.deferred) {
					await interaction.followUp({
						content: 'There was an error while executing this command!',
						flags: MessageFlags.Ephemeral,
					});
				}
				else {
					await interaction.reply({
						content: 'There was an error while executing this command!',
						flags: MessageFlags.Ephemeral,
					});
				}
			}
			catch (replyError) {
				logger.error(`Failed to send error reply for ${interaction.commandName}:`, replyError);
			}
		}
	},
};
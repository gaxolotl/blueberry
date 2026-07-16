const { SlashCommandBuilder, ContainerBuilder, MessageFlags, SeparatorSpacingSize } = require('discord.js');
const config = require('../../config.js');

const accentColor = parseInt(config.accentColor.replace('#', ''), 16);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Replies with Pong!'),

    async execute(interaction) {
        const init = new ContainerBuilder()
            .setAccentColor(accentColor)
            .addTextDisplayComponents(textDisplay =>
                textDisplay.setContent('# <:loader:1526193303098490960> Pinging...'),
            );

        await interaction.reply({
            components: [init],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        });

        const sent = await interaction.fetchReply();
        const messageLatency = sent.createdTimestamp - interaction.createdTimestamp;
        const apiLatency = interaction.client.ws.ping;

        const ping = new ContainerBuilder()
            .setAccentColor(accentColor)
            .addTextDisplayComponents(textDisplay =>
                textDisplay.setContent(`# <:gauge:1526194499355672666> **Pong!**`)
            )
            .addSeparatorComponents(separator =>
                separator.setSpacing(SeparatorSpacingSize.Small)
            )
            .addTextDisplayComponents(textDisplay =>
                textDisplay.setContent(
                    `**Message Latency:** ${messageLatency}*ms*\n**API Latency:** ${apiLatency}*ms*`,
                )
            );

        await interaction.editReply({ 
            components: [ping], 
            flags: MessageFlags.IsComponentsV2 
        });
    },
};
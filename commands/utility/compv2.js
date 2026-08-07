import { SlashCommandBuilder, ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder, MediaGalleryBuilder, FileBuilder, SeparatorBuilder, SeparatorSpacingSize, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, AttachmentBuilder, MessageFlags } from 'discord.js';
import { getAccentColor } from '../../utils/color.js';

export default {
	data: new SlashCommandBuilder()
		.setName('showcase')
		.setDescription('Shows off every Components V2 building block in one message'),

	async execute(interaction) {
		// Components V2 lets you attach a local file and reference it inside
		// components via the `attachment://<filename>` URI scheme.
		const fileAttachment = new AttachmentBuilder(
			Buffer.from('This file is being rendered through a Components V2 File component.'),
			{ name: 'notes.txt' },
		);

		const heading = new TextDisplayBuilder().setContent(
			'# Components V2 Showcase\n' +
			'-# every builder in one message, generated on demand',
		);

		const thumbnailSection = new SectionBuilder()
			.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(
					'### Section with a Thumbnail accessory\n' +
					'Sections can hold up to 3 text displays next to one image or button.',
				),
			)
			.setThumbnailAccessory(
				new ThumbnailBuilder()
					.setURL('https://cdn.prod.website-files.com/6257adef93867e50d84d30e2/66e3d7f4ef6498ac018f2c55_Symbol.svg')
					.setDescription('Discord logo')
					.setSpoiler(false),
			);

		const buttonSection = new SectionBuilder()
			.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(
					'### Section with a Button accessory\n' +
					'Instead of an image, a Section\'s accessory can be a single button.',
				),
			)
			.setButtonAccessory(
				new ButtonBuilder()
					.setCustomId('showcase_section_button')
					.setLabel('Click me')
					.setStyle(ButtonStyle.Primary),
			);

		const bigSeparator = new SeparatorBuilder()
			.setDivider(true)
			.setSpacing(SeparatorSpacingSize.Large);

		const smallSeparator = new SeparatorBuilder()
			.setDivider(false)
			.setSpacing(SeparatorSpacingSize.Small);

		const gallery = new MediaGalleryBuilder()
			.addItems(
				(mediaGalleryItem) => mediaGalleryItem
					.setURL('https://raw.githubusercontent.com/gaxolotl/gaxolotl.github.io/refs/heads/main/Discord-Banner_1.png'),
				(mediaGalleryItem) => mediaGalleryItem
					.setURL('https://raw.githubusercontent.com/gaxolotl/gaxolotl.github.io/refs/heads/main/Discord-Banner_2.png'),
				(mediaGalleryItem) => mediaGalleryItem
					.setURL('https://raw.githubusercontent.com/gaxolotl/gaxolotl.github.io/refs/heads/main/Discord-Banner_3.png'),
				(mediaGalleryItem) => mediaGalleryItem
					.setURL('https://raw.githubusercontent.com/gaxolotl/gaxolotl.github.io/refs/heads/main/Discord-Banner_4.png'),
				(mediaGalleryItem) => mediaGalleryItem
					.setURL('https://raw.githubusercontent.com/gaxolotl/gaxolotl.github.io/refs/heads/main/Discord-Banner_5.png'),
				(mediaGalleryItem) => mediaGalleryItem
					.setURL('https://raw.githubusercontent.com/gaxolotl/gaxolotl.github.io/refs/heads/main/Discord-Banner_6.png'),
				(mediaGalleryItem) => mediaGalleryItem
					.setURL('https://raw.githubusercontent.com/gaxolotl/gaxolotl.github.io/refs/heads/main/Discord-Banner_7.png'),
				(mediaGalleryItem) => mediaGalleryItem
					.setURL('https://raw.githubusercontent.com/gaxolotl/gaxolotl.github.io/refs/heads/main/Discord-Banner_8.png'),
			);

		// File components must reference an attachment on the same message via attachment://
		const fileDisplay = new FileBuilder().setURL('attachment://notes.txt');

		const buttonRow = new ActionRowBuilder().addComponents(
			new ButtonBuilder().setCustomId('showcase_primary').setLabel('Primary').setStyle(ButtonStyle.Primary),
			new ButtonBuilder().setCustomId('showcase_secondary').setLabel('Secondary').setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId('showcase_success').setLabel('Success').setStyle(ButtonStyle.Success),
			new ButtonBuilder().setCustomId('showcase_danger').setLabel('Danger').setStyle(ButtonStyle.Danger),
			new ButtonBuilder().setLabel('Link').setStyle(ButtonStyle.Link).setURL('https://discord.com'),
		);

		const selectRow = new ActionRowBuilder().addComponents(
			new StringSelectMenuBuilder()
				.setCustomId('showcase_select')
				.setPlaceholder('Pick a Components V2 builder…')
				.addOptions(
					{ label: 'TextDisplay', value: 'text_display', description: 'Freeform markdown text' },
					{ label: 'Section', value: 'section', description: 'Text + thumbnail/button accessory' },
					{ label: 'MediaGallery', value: 'media_gallery', description: 'Grid of images/videos' },
					{ label: 'File', value: 'file', description: 'Uploaded attachment display' },
					{ label: 'Separator', value: 'separator', description: 'Spacing / divider' },
				),
		);

		// Containers can be stacked in a single message
		const nestedContainer = new ContainerBuilder()
			.setAccentColor(await getAccentColor(interaction.guildId))
			.setSpoiler(false)
			.addTextDisplayComponents(
				new TextDisplayBuilder().setContent('A **second Container**, its own accent color and border.'),
			);

		const container = new ContainerBuilder()
			.setAccentColor(await getAccentColor(interaction.guildId))
			.setSpoiler(false)
			.addTextDisplayComponents(heading)
			.addSectionComponents(thumbnailSection, buttonSection)
			.addSeparatorComponents(bigSeparator)
			.addMediaGalleryComponents(gallery)
			.addSeparatorComponents(smallSeparator)
			.addFileComponents(fileDisplay)
			.addActionRowComponents(buttonRow, selectRow);

		await interaction.reply({
			components: [container, nestedContainer],
			files: [fileAttachment],
			flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
		});
	},
};

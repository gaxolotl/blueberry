const {
	SlashCommandBuilder,
	ContainerBuilder,
	MessageFlags,
	SeparatorSpacingSize,
	FileBuilder,
	AttachmentBuilder,
} = require('discord.js');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Resvg } = require('@resvg/resvg-js');
const sizeOf = require('image-size').imageSize || require('image-size');
const logger = require('../../utils/logger');
const config = require('../../config.js');

const accentColor = parseInt(config.accentColor.replace('#', ''), 16);

function escapeXml(value) {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function normalizeHex(value) {
	const trimmed = String(value || '#FFFFFF').trim();
	if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) {
		return trimmed;
	}
	return '#FFFFFF';
}

function inferMimeType(fileName, fallback = 'image/png') {
	const lowerName = String(fileName || '').toLowerCase();
	if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
		return 'image/jpeg';
	}
	if (lowerName.endsWith('.gif')) {
		return 'image/gif';
	}
	if (lowerName.endsWith('.webp')) {
		return 'image/webp';
	}
	if (lowerName.endsWith('.bmp')) {
		return 'image/bmp';
	}
	if (lowerName.endsWith('.svg')) {
		return 'image/svg+xml';
	}
	return fallback;
}

function buildSvg({
	width,
	height,
	text,
	x,
	y,
	fontSize,
	color,
	fontFamily,
	imageDataUri,
	stroke,
	strokeColor,
	strokeSize,
	italic,
	bold,
	underlined,
	centerHorizontal,
	centerVertical,
}) {
	const safeText = escapeXml(text);
	const safeColor = normalizeHex(color);
	const safeFontFamily = escapeXml(fontFamily || 'Arial');
	const safeWidth = Number.isFinite(width) && width > 0 ? width : 1200;
	const safeHeight = Number.isFinite(height) && height > 0 ? height : 800;

	// Determine coordinate overrides and alignments based on boolean flags
	const finalX = centerHorizontal ? (safeWidth / 2) : x;
	const finalY = centerVertical ? (safeHeight / 2) : y;

	const textAnchor = centerHorizontal ? 'text-anchor="middle"' : '';
	const dominantBaseline = centerVertical ? 'dominant-baseline="central"' : 'dominant-baseline="hanging"';

	// Use inline CSS styles for text decoration. This ensures the underline
	// is properly bound to the text width and doesn't span the whole image.
	const textStyles = [];
	if (italic) textStyles.push('font-style: italic;');
	if (bold) textStyles.push('font-weight: bold;');

	// Non-standard attribute for Resvg compatibility for complex paint orders
	const strokeAttrs = [];
	let useStroke = false;
	const safeStrokeSize = Number.isFinite(strokeSize) && strokeSize > 0 ? strokeSize : 2;
	const safeStrokeColor = normalizeHex(strokeColor);

	if (stroke) {
		useStroke = true;
		strokeAttrs.push(`stroke="${safeStrokeColor}"`);
		strokeAttrs.push(`stroke-width="${safeStrokeSize}"`);
		strokeAttrs.push('paint-order="stroke fill"');
	}

	if (underlined) {
		textStyles.push('text-decoration: underline;');

		// Match request: adjust to stroke size.
		// We use CSS property text-decoration-thickness.
		const thickness = useStroke ? safeStrokeSize : Math.max(1, fontSize / 16);
		textStyles.push(`text-decoration-thickness: ${thickness}px;`);

		// We keep the underline color matching the text fill color by default.
		textStyles.push(`text-decoration-color: ${safeColor};`);
	}

	const styleString = textStyles.length > 0 ? ` style="${textStyles.join(' ')}"` : '';
	const strokeAttributesString = strokeAttrs.length > 0 ? ' ' + strokeAttrs.join(' ') : '';
	const textAnchorAttr = textAnchor ? ' ' + textAnchor : '';

	return `
<svg xmlns="http://www.w3.org/2000/svg" width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}">
  <rect width="100%" height="100%" fill="transparent" />
  <image href="${imageDataUri}" x="0" y="0" width="${safeWidth}" height="${safeHeight}" />
  <text x="${finalX}" y="${finalY}" fill="${safeColor}" font-size="${fontSize}" font-family="${safeFontFamily}" ${dominantBaseline}${textAnchorAttr}${strokeAttributesString}${styleString}>${safeText}</text>
</svg>`;
}

async function renderOverlay({
	inputBuffer,
	text,
	x,
	y,
	fontSize,
	color,
	fontPath,
	imageMimeType,
	stroke,
	strokeColor,
	strokeSize,
	italic,
	bold,
	underlined,
	centerHorizontal,
	centerVertical,
}) {
	const dimensions = sizeOf(inputBuffer);
	const width = dimensions.width || 1200;
	const height = dimensions.height || 800;
	const fontFamily = fontPath ? path.basename(fontPath, path.extname(fontPath)) : 'Arial';
	const imageDataUri = `data:${imageMimeType};base64,${inputBuffer.toString('base64')}`;
	const svg = buildSvg({
		width,
		height,
		text,
		x,
		y,
		fontSize,
		color,
		fontFamily,
		imageDataUri,
		stroke,
		strokeColor,
		strokeSize,
		italic,
		bold,
		underlined,
		centerHorizontal,
		centerVertical,
	});

	const options = {
		fitTo: { mode: 'original' },
		font: {
			loadSystemFonts: true,
		},
	};

	if (fontPath) {
		options.font.fontFiles = [fontPath];
		options.font.defaultFontFamily = fontFamily;
	}

	const resvg = new Resvg(svg, options);
	const pngData = resvg.render();
	return pngData.asPng();
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('imagetext')
		.setDescription('Draw custom text onto an uploaded image')
		.addAttachmentOption(option =>
			option.setName('image')
				.setDescription('The image you want to edit')
				.setRequired(true),
		)
		.addStringOption(option =>
			option.setName('text')
				.setDescription('The text to place on the image')
				.setRequired(true),
		)
		.addIntegerOption(option =>
			option.setName('horizontal')
				.setDescription('Horizontal text position in pixels (defaults to 0)')
				.setRequired(false),
		)
		.addIntegerOption(option =>
			option.setName('vertical')
				.setDescription('Vertical text position in pixels (defaults to 0)')
				.setRequired(false),
		)
		.addIntegerOption(option =>
			option.setName('size')
				.setDescription('Text size in pixels (defaults to 48)')
				.setRequired(false),
		)
		.addStringOption(option =>
			option.setName('color')
				.setDescription('Text color as hex (defaults to #FFFFFF)')
				.setRequired(false),
		)
		.addAttachmentOption(option =>
			option.setName('font')
				.setDescription('Optional .ttf font file to use')
				.setRequired(false),
		)
		.addBooleanOption(option =>
			option.setName('stroke')
				.setDescription('Enable outline stroke on the text')
				.setRequired(false),
		)
		.addStringOption(option =>
			option.setName('stroke-color')
				.setDescription('Stroke outline color as hex (defaults to #000000)')
				.setRequired(false),
		)
		.addIntegerOption(option =>
			option.setName('stroke-size')
				.setDescription('Stroke outline size in pixels (defaults to 2)')
				.setRequired(false),
		)
		.addBooleanOption(option =>
			option.setName('italic')
				.setDescription('Render the text in italics')
				.setRequired(false),
		)
		.addBooleanOption(option =>
			option.setName('bold')
				.setDescription('Render the text in bold')
				.setRequired(false),
		)
		.addBooleanOption(option =>
			option.setName('underlined')
				.setDescription('Underline the text')
				.setRequired(false),
		)
		.addBooleanOption(option =>
			option.setName('center-horizontal')
				.setDescription('Centers the text horizontally (ignores your custom horizontal value if enabled)')
				.setRequired(false),
		)
		.addBooleanOption(option =>
			option.setName('center-vertical')
				.setDescription('Centers the text vertically (ignores your custom vertical value if enabled)')
				.setRequired(false),
		),

	async execute(interaction) {
		await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 });
		let tempDir = null;

		try {
			const imageAttachment = interaction.options.getAttachment('image');
			const text = interaction.options.getString('text');
			const horizontal = interaction.options.getInteger('horizontal') ?? 0;
			const vertical = interaction.options.getInteger('vertical') ?? 0;
			const fontSize = interaction.options.getInteger('size') ?? 48;
			const color = interaction.options.getString('color') ?? '#FFFFFF';
			const fontAttachment = interaction.options.getAttachment('font');

			const stroke = interaction.options.getBoolean('stroke') ?? false;
			const strokeColor = interaction.options.getString('stroke-color') ?? '#000000';
			const strokeSize = interaction.options.getInteger('stroke-size') ?? 2;
			const italic = interaction.options.getBoolean('italic') ?? false;
			const bold = interaction.options.getBoolean('bold') ?? false;
			const underlined = interaction.options.getBoolean('underlined') ?? false;

			const centerHorizontal = interaction.options.getBoolean('center-horizontal') ?? false;
			const centerVertical = interaction.options.getBoolean('center-vertical') ?? false;

			if (!imageAttachment?.url) {
				throw new Error('An image attachment is required.');
			}

			if (!text) {
				throw new Error('Text is required.');
			}

			if (fontAttachment && !fontAttachment.name?.toLowerCase().endsWith('.ttf')) {
				throw new Error('The provided font file must be a .ttf file.');
			}

			const inputResponse = await fetch(imageAttachment.url);
			if (!inputResponse.ok) {
				throw new Error(`Failed to download image: ${inputResponse.status}`);
			}
			const inputBuffer = Buffer.from(await inputResponse.arrayBuffer());
			const imageMimeType = imageAttachment.contentType || inferMimeType(imageAttachment.name || imageAttachment.url, 'image/png');

			let fontPath = null;
			if (fontAttachment?.url) {
				const fontResponse = await fetch(fontAttachment.url);
				if (!fontResponse.ok) {
					throw new Error(`Failed to download font: ${fontResponse.status}`);
				}
				const fontBuffer = Buffer.from(await fontResponse.arrayBuffer());
				tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'blueberry-font-'));
				fontPath = path.join(tempDir, fontAttachment.name || 'custom.ttf');
				await fs.writeFile(fontPath, fontBuffer);
			}

			const outputBuffer = await renderOverlay({
				inputBuffer,
				text,
				x: horizontal,
				y: vertical,
				fontSize,
				color,
				fontPath,
				imageMimeType,
				stroke,
				strokeColor,
				strokeSize,
				italic,
				bold,
				underlined,
				centerHorizontal,
				centerVertical,
			});

			const stylingDetails = [];
			if (bold) stylingDetails.push('**Bold**');
			if (italic) stylingDetails.push('*Italic*');
			if (underlined) stylingDetails.push('__Underlined__');
			const stylingString = stylingDetails.length > 0 ? stylingDetails.join(' • ') : 'Normal';

			const strokeDetails = stroke ? `Enabled (*${normalizeHex(strokeColor)}* • ${strokeSize}*px*)` : 'Disabled';

			// Clean dynamic position reading for details panel
			const hPositionDisplay = centerHorizontal ? 'Centered' : `${horizontal}px`;
			const vPositionDisplay = centerVertical ? 'Centered' : `${vertical}px`;

			const generatedAttachment = new AttachmentBuilder(outputBuffer, { name: 'overlay.png' });
			const container = new ContainerBuilder()
				.setAccentColor(accentColor)
				.setSpoiler(false)
				.addTextDisplayComponents(textDisplay =>
					textDisplay.setContent(
						['# <:fileimage:1526977103386509312> **Image overlay complete**', '-# Your image has been processed and is ready for download.'].join('\n'),
					),
				)
				.addSeparatorComponents(separator =>
					separator.setDivider(true).setSpacing(SeparatorSpacingSize.Small),
				)
				.addTextDisplayComponents(textDisplay =>
					textDisplay.setContent(
						[
							'### Details',
							`<:pencil:1526982031144128573> **Text:** \`${escapeXml(text)}\``,
							`<:move:1526983130827722762> **Position:** H: ${hPositionDisplay} • V: ${vPositionDisplay}`,
							`<:scaling:1526982526961324073> **Size:** ${fontSize}*px*`,
							`<:palette:1526982654011117719> **Color:** *${normalizeHex(color)}*`,
							`<:filetype:1526982779701825626> **Font:** ${fontAttachment ? `\`${fontAttachment.name}\`` : 'Default'}`,
							`<:strokeoutline:1526986132817182800> **Stroke:** ${strokeDetails}`,
							`<:pentool:1526986608572764452> **Style:** ${stylingString}`,
						].join('\n'),
					),
				)
				.addSeparatorComponents(separator =>
					separator.setDivider(true).setSpacing(SeparatorSpacingSize.Small),
				)
				.addFileComponents(new FileBuilder().setURL('attachment://overlay.png'));

			await interaction.editReply({
				components: [container],
				files: [generatedAttachment],
				flags: MessageFlags.IsComponentsV2,
			});
		}
		catch (error) {
			logger.error('Failed to render image overlay:', error);

			const errorContainer = new ContainerBuilder()
				.setAccentColor(0xFF0000)
				.addTextDisplayComponents(textDisplay =>
					textDisplay.setContent('<:x_:1526217756926808174> **Unable to render your image.**\n' + (error && error.message ? error.message : 'Please try again with a valid image and parameters.')),
				);

			await interaction.editReply({
				components: [errorContainer],
				flags: MessageFlags.IsComponentsV2,
			});
		}
		finally {
			if (tempDir) {
				await fs.rm(tempDir, { recursive: true, force: true }).catch(err => {
					logger.error('Failed to clean up temp font directory:', err);
				});
			}
		}
	},
};
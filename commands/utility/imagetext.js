import { SlashCommandBuilder, ContainerBuilder, MessageFlags, SeparatorSpacingSize, FileBuilder, AttachmentBuilder } from 'discord.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import sizeOfImport from 'image-size';
import logger from '../../utils/logger.js';
import config from '../../config.js';
import { t, tError } from '../../utils/i18n.js';

const accentColor = parseInt(config.accentColor.replace('#', ''), 16);
const sizeOf = sizeOfImport.imageSize ?? sizeOfImport;

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

	const finalX = centerHorizontal ? (safeWidth / 2) : x;
	const finalY = centerVertical ? (safeHeight / 2) : y;

	const textAnchor = centerHorizontal ? 'text-anchor="middle"' : '';
	const dominantBaseline = centerVertical ? 'dominant-baseline="central"' : 'dominant-baseline="hanging"';

	const textStyles = [];
	if (italic) textStyles.push('font-style: italic;');
	if (bold) textStyles.push('font-weight: bold;');

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
		const thickness = useStroke ? safeStrokeSize : Math.max(1, fontSize / 16);
		textStyles.push(`text-decoration-thickness: ${thickness}px;`);
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

export default {
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
		const guildId = interaction.guildId;
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
				throw new Error(await t(guildId, 'error_img_required'));
			}

			if (!text) {
				throw new Error(await t(guildId, 'error_text_required'));
			}

			if (fontAttachment && !fontAttachment.name?.toLowerCase().endsWith('.ttf')) {
				throw new Error(await t(guildId, 'error_invalid_font'));
			}

			const inputResponse = await fetch(imageAttachment.url);
			if (!inputResponse.ok) {
				throw new Error(await t(guildId, 'error_download_img_failed', { status: inputResponse.status }));
			}
			const inputBuffer = Buffer.from(await inputResponse.arrayBuffer());
			const imageMimeType = imageAttachment.contentType || inferMimeType(imageAttachment.name || imageAttachment.url, 'image/png');

			let fontPath = null;
			if (fontAttachment?.url) {
				const fontResponse = await fetch(fontAttachment.url);
				if (!fontResponse.ok) {
					throw new Error(await t(guildId, 'error_download_font_failed', { status: fontResponse.status }));
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

			// 1. Resolve text formatting styles dynamically
			const stylingDetails = [];
			if (bold) stylingDetails.push(await t(guildId, 'term_bold'));
			if (italic) stylingDetails.push(await t(guildId, 'term_italic'));
			if (underlined) stylingDetails.push(await t(guildId, 'term_underlined'));
			const stylingString = stylingDetails.length > 0 ? stylingDetails.join(' • ') : await t(guildId, 'term_normal');

			// 2. Resolve Stroke details dynamic text
			const strokeDetails = stroke
				? await t(guildId, 'term_enabled', { color: normalizeHex(strokeColor), size: strokeSize })
				: await t(guildId, 'term_disabled');

			// 3. Resolve positioning strings
			const hPositionDisplay = centerHorizontal ? await t(guildId, 'term_centered') : `${horizontal}px`;
			const vPositionDisplay = centerVertical ? await t(guildId, 'term_centered') : `${vertical}px`;

			// 4. Build output details panel using localization strings
			const generatedAttachment = new AttachmentBuilder(outputBuffer, { name: 'overlay.png' });
			const container = new ContainerBuilder()
				.setAccentColor(accentColor)
				.setSpoiler(false)
				.addTextDisplayComponents(textDisplay =>
					textDisplay.setContent(
						[
							t(guildId, 'imagetext_success_title'),
							t(guildId, 'imagetext_success_subtitle'),
						].join('\n'),
					),
				)
				.addSeparatorComponents(separator =>
					separator.setDivider(true).setSpacing(SeparatorSpacingSize.Small),
				)
				.addTextDisplayComponents(async textDisplay =>
					textDisplay.setContent(
						[
							await t(guildId, 'imagetext_details_header'),
							await t(guildId, 'imagetext_details_text', { text: escapeXml(text) }),
							await t(guildId, 'imagetext_details_pos', { hPos: hPositionDisplay, vPos: vPositionDisplay }),
							await t(guildId, 'imagetext_details_size', { size: fontSize }),
							await t(guildId, 'imagetext_details_color', { color: normalizeHex(color) }),
							await t(guildId, 'imagetext_details_font', { font: fontAttachment ? `\`${fontAttachment.name}\`` : await t(guildId, 'term_default') }),
							await t(guildId, 'imagetext_details_stroke', { stroke: strokeDetails }),
							await t(guildId, 'imagetext_details_style', { style: stylingString }),
						].join('\n'),
					),
				)
				.addSeparatorComponents(separator =>
					separator.setDivider(true).setSpacing(SeparatorSpacingSize.Small),
				)
				.addFileComponents(new FileBuilder().setURL('attachment://overlay.png'));

			// Resolving final components inside editReply
			await interaction.editReply({
				components: [container],
				files: [generatedAttachment],
				flags: MessageFlags.IsComponentsV2,
			});
		}
		catch (error) {
			logger.error('Failed to render image overlay:', error);

			// Safely fall back to the error's localized message, otherwise use a translated fallback error body
			const rawErrorMsg = error?.message || await t(guildId, 'error_generic');

			// tError wraps raw text inside the error master template automatically
			const errorText = await tError(guildId, rawErrorMsg, {}, true);

			const errorContainer = new ContainerBuilder()
				.setAccentColor(0xFF0000)
				.addTextDisplayComponents(async textDisplay =>
					textDisplay.setContent(
						[
							`## <:x_:1526217756926808174> ${await t(guildId, 'error_unable_to_render')}`,
							`-# ${errorText}`,
						].join('\n'),
					),
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
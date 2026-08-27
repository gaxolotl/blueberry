import { Resvg } from '@resvg/resvg-js';

const DARK_BG = '#1e1e1e';
const GRID_LINE = '#3c3c3c';
const AXIS_TEXT = '#9d9d9d';
const LABEL_TEXT = '#cccccc';
const TITLE_TEXT = '#e8e8e8';

function escapeXml(value) {
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function niceCeil(value) {
	if (value <= 0) return 1;
	const pow = 10 ** Math.floor(Math.log10(value));
	const normalized = value / pow;
	const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
	return nice * pow;
}

function formatValue(value) {
	if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
	return String(Math.round(value));
}

/**
 * Renders a dark-mode bar chart PNG for the given activity series.
 * @param {object} options
 * @param {Array<{label:string,value:number}>} options.series
 * @param {number} [options.totalMessages]
 * @param {number} [options.activeMembers]
 * @param {number} [options.accentColor] - 24-bit hex integer accent color
 * @returns {Promise<Buffer>}
 */
export async function renderActivityChart({ series, totalMessages = 0, activeMembers = 0, accentColor = 0x5865f2 }) {
	const width = 1200;
	const height = 480;
	const marginLeft = 70;
	const marginRight = 30;
	const marginTop = 100;
	const marginBottom = 70;
	const plotWidth = width - marginLeft - marginRight;
	const plotHeight = height - marginTop - marginBottom;

	const data = series ?? [];
	const values = data.map(point => point.value);
	const maxValue = niceCeil(Math.max(...values, 1));
	const bucketCount = Math.max(data.length, 1);
	const bucketWidth = plotWidth / bucketCount;
	const barWidth = Math.max(bucketWidth * 0.6, 2);
	const yScale = plotHeight / maxValue;

	const gridLines = [];
	const steps = 4;
	for (let i = 0; i <= steps; i += 1) {
		const value = (maxValue / steps) * i;
		const y = marginTop + plotHeight - value * yScale;
		gridLines.push({ value, y });
	}

	const accent = `#${(accentColor >>> 0).toString(16).padStart(6, '0')}`;

	const bars = data.map((point, index) => {
		const x = marginLeft + bucketWidth * index + (bucketWidth - barWidth) / 2;
		const barHeight = point.value * yScale;
		const y = marginTop + plotHeight - barHeight;
		return `<g>
			<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(barHeight, 0).toFixed(1)}" rx="3" fill="${accent}" />
			<text x="${(x + barWidth / 2).toFixed(1)}" y="${(y - 8).toFixed(1)}" fill="${LABEL_TEXT}" font-size="11" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif">${point.value}</text>
		</g>`;
	}).join('');

	const labels = data.map((point, index) => {
		const x = marginLeft + bucketWidth * index + bucketWidth / 2;
		return `<text x="${x.toFixed(1)}" y="${height - 36}" fill="${AXIS_TEXT}" font-size="11" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif">${escapeXml(point.label)}</text>`;
	}).join('');

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
	<rect width="100%" height="100%" fill="${DARK_BG}" />
	<text x="${marginLeft}" y="40" fill="${TITLE_TEXT}" font-size="22" font-weight="bold" font-family="Segoe UI, Arial, sans-serif">Server Activity</text>
	<text x="${marginLeft}" y="68" fill="${AXIS_TEXT}" font-size="13" font-family="Segoe UI, Arial, sans-serif">${escapeXml(`${formatValue(totalMessages)} messages · ${formatValue(activeMembers)} active members`)}</text>
	${gridLines.map(({ value, y }) => `<g><line x1="${marginLeft}" x2="${width - marginRight}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${GRID_LINE}" stroke-width="1" /><text x="${marginLeft - 10}" y="${(y + 4).toFixed(1)}" fill="${AXIS_TEXT}" font-size="11" text-anchor="end" font-family="Segoe UI, Arial, sans-serif">${formatValue(value)}</text></g>`).join('')}
	${bars}
	<line x1="${marginLeft}" x2="${width - marginRight}" y1="${marginTop + plotHeight}" y2="${marginTop + plotHeight}" stroke="${GRID_LINE}" stroke-width="2" />
	${labels}
	</svg>`;

	const resvg = new Resvg(svg, {
		fitTo: { mode: 'width', value: width },
		font: { loadSystemFonts: true },
	});
	const png = resvg.render().asPng();
	return Buffer.from(png);
}
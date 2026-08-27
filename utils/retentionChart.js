import { Resvg } from '@resvg/resvg-js';

const DARK_BG = '#1e1e1e';
const GRID_LINE = '#3c3c3c';
const AXIS_TEXT = '#9d9d9d';
const LABEL_TEXT = '#cccccc';
const TITLE_TEXT = '#e8e8e8';
const JOIN_COLOR = '#89d185';
const LEAVE_COLOR = '#f48771';

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
 * Renders a dark-mode grouped bar chart of joins vs leaves.
 * @param {object} options
 * @param {Array<{label:string,joins:number,leaves:number}>} options.series
 * @param {number} [options.totalJoins]
 * @param {number} [options.totalLeaves]
 * @returns {Promise<Buffer>}
 */
export async function renderRetentionChart({ series, totalJoins = 0, totalLeaves = 0 }) {
	const width = 1200;
	const height = 480;
	const marginLeft = 70;
	const marginRight = 30;
	const marginTop = 110;
	const marginBottom = 70;
	const plotWidth = width - marginLeft - marginRight;
	const plotHeight = height - marginTop - marginBottom;

	const data = series ?? [];
	const allValues = data.flatMap(point => [point.joins, point.leaves]);
	const maxValue = niceCeil(Math.max(...allValues, 1));
	const bucketCount = Math.max(data.length, 1);
	const bucketWidth = plotWidth / bucketCount;
	const barWidth = Math.max(bucketWidth * 0.28, 2);
	const yScale = plotHeight / maxValue;

	const gridLines = [];
	const steps = 4;
	for (let i = 0; i <= steps; i += 1) {
		const value = (maxValue / steps) * i;
		const y = marginTop + plotHeight - value * yScale;
		gridLines.push({ value, y });
	}

	const groups = data.map((point, index) => {
		const groupCenter = marginLeft + bucketWidth * index + bucketWidth / 2;
		const joinX = groupCenter - barWidth - 2;
		const leaveX = groupCenter + 2;
		const joinHeight = point.joins * yScale;
		const leaveHeight = point.leaves * yScale;
		return `<g>
			<rect x="${joinX.toFixed(1)}" y="${(marginTop + plotHeight - joinHeight).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(joinHeight, 0).toFixed(1)}" rx="2" fill="${JOIN_COLOR}" />
			<rect x="${leaveX.toFixed(1)}" y="${(marginTop + plotHeight - leaveHeight).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(leaveHeight, 0).toFixed(1)}" rx="2" fill="${LEAVE_COLOR}" />
		</g>`;
	}).join('');

	const labels = data.map((point, index) => {
		const x = marginLeft + bucketWidth * index + bucketWidth / 2;
		return `<text x="${x.toFixed(1)}" y="${height - 36}" fill="${AXIS_TEXT}" font-size="11" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif">${escapeXml(point.label)}</text>`;
	}).join('');

	const legend = `
		<rect x="${marginLeft}" y="44" width="12" height="12" rx="2" fill="${JOIN_COLOR}" />
		<text x="${marginLeft + 18}" y="54" fill="${LABEL_TEXT}" font-size="12" font-family="Segoe UI, Arial, sans-serif">Joins</text>
		<rect x="${marginLeft + 70}" y="44" width="12" height="12" rx="2" fill="${LEAVE_COLOR}" />
		<text x="${marginLeft + 88}" y="54" fill="${LABEL_TEXT}" font-size="12" font-family="Segoe UI, Arial, sans-serif">Leaves</text>
		<text x="${width - marginRight}" y="54" fill="${AXIS_TEXT}" font-size="12" text-anchor="end" font-family="Segoe UI, Arial, sans-serif">Net: ${formatValue(totalJoins - totalLeaves)}</text>
	`;

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
	<rect width="100%" height="100%" fill="${DARK_BG}" />
	<text x="${marginLeft}" y="28" fill="${TITLE_TEXT}" font-size="22" font-weight="bold" font-family="Segoe UI, Arial, sans-serif">Member Growth</text>
	${legend}
	${gridLines.map(({ value, y }) => `<g><line x1="${marginLeft}" x2="${width - marginRight}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${GRID_LINE}" stroke-width="1" /><text x="${marginLeft - 10}" y="${(y + 4).toFixed(1)}" fill="${AXIS_TEXT}" font-size="11" text-anchor="end" font-family="Segoe UI, Arial, sans-serif">${formatValue(value)}</text></g>`).join('')}
	${groups}
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
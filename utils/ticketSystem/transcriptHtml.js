const IMAGE_EXTENSIONS = /\.(?:avif|gif|jpe?g|png|webp)(?:\?|$)/i;
const VIDEO_EXTENSIONS = /\.(?:mov|mp4|webm)(?:\?|$)/i;
const AUDIO_EXTENSIONS = /\.(?:flac|m4a|mp3|ogg|wav)(?:\?|$)/i;

function escapeHtml(value = '') {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll('\'', '&#039;');
}

function safeUrl(value) {
	if (!value) return null;
	try {
		const url = new URL(value);
		return ['http:', 'https:'].includes(url.protocol) ? escapeHtml(url.href) : null;
	}
	catch {
		return null;
	}
}

function formatBytes(size) {
	if (!Number.isFinite(size) || size < 1) return '';
	const units = ['B', 'KB', 'MB', 'GB'];
	const unit = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
	return `${(size / (1024 ** unit)).toFixed(unit ? 1 : 0)} ${units[unit]}`;
}

function renderDiscordFormatting(value) {
	return value
		.replace(/&lt;a?:(\w+):(\d+)&gt;/g, (_match, name, id) => `<img class="custom-emoji" src="https://cdn.discordapp.com/emojis/${id}.webp?size=48" alt=":${name}:" title=":${name}:">`)
		.replace(/^### (.+)$/gm, '<strong class="markdown-heading h3">$1</strong>')
		.replace(/^## (.+)$/gm, '<strong class="markdown-heading h2">$1</strong>')
		.replace(/^# (.+)$/gm, '<strong class="markdown-heading h1">$1</strong>')
		.replace(/^&gt; (.+)$/gm, '<span class="markdown-quote">$1</span>')
		.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
		.replace(/__(.+?)__/g, '<u>$1</u>')
		.replace(/~~(.+?)~~/g, '<s>$1</s>')
		.replace(/\|\|(.+?)\|\|/g, '<span class="spoiler">$1</span>')
		.replace(/`([^`\n]+)`/g, '<code>$1</code>')
		.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
}

function renderContent(content) {
	return String(content).split(/(https?:\/\/[^\s]+)/g).map((part, index) => {
		if (index % 2 === 1) {
			const url = safeUrl(part);
			if (url) return `<a href="${url}" target="_blank" rel="noreferrer">${escapeHtml(part)}</a>`;
		}

		return renderDiscordFormatting(escapeHtml(part)
			.replace(/&lt;@!?(\d+)&gt;/g, '<span class="mention">@$1</span>')
			.replace(/&lt;@&amp;(\d+)&gt;/g, '<span class="mention">@$1</span>')
			.replace(/&lt;#(\d+)&gt;/g, '<span class="mention">#$1</span>')
			.replace(/\n/g, '<br>'));
	}).join('');
}

function renderAttachment(attachment) {
	const raw = typeof attachment === 'string' ? { url: attachment } : attachment;
	const url = safeUrl(raw?.url);
	if (!url) return '';
	let fallbackName = 'Attachment';
	try {
		fallbackName = decodeURIComponent(new URL(raw.url).pathname.split('/').pop()) || fallbackName;
	}
	catch {
		// Keep the generic filename for malformed legacy attachment URLs.
	}
	const name = escapeHtml(raw.name || fallbackName);
	const contentType = raw.contentType || '';

	if (contentType.startsWith('image/') || IMAGE_EXTENSIONS.test(raw.url)) {
		return `<a class="media-link" href="${url}" target="_blank" rel="noreferrer"><img class="media image" src="${url}" alt="${name}" loading="lazy"></a>`;
	}
	if (contentType.startsWith('video/') || VIDEO_EXTENSIONS.test(raw.url)) {
		return `<video class="media" controls preload="metadata" src="${url}"></video>`;
	}
	if (contentType.startsWith('audio/') || AUDIO_EXTENSIONS.test(raw.url)) {
		return `<audio class="audio" controls preload="metadata" src="${url}"></audio>`;
	}

	const size = formatBytes(raw.size);
	return `<a class="file" href="${url}" target="_blank" rel="noreferrer"><span class="file-icon">↓</span><span><strong>${name}</strong>${size ? `<small>${size}</small>` : ''}</span></a>`;
}

function renderEmbed(embed) {
	if (!embed || typeof embed !== 'object') return '';
	const color = Number.isInteger(embed.color) ? `#${embed.color.toString(16).padStart(6, '0')}` : '#4e5058';
	const authorIcon = safeUrl(embed.author?.icon_url);
	const authorName = escapeHtml(embed.author?.name || '');
	const authorUrl = safeUrl(embed.author?.url);
	const author = embed.author?.name ? `<div class="embed-author">${authorIcon ? `<img src="${authorIcon}" alt="">` : ''}${authorUrl ? `<a href="${authorUrl}" target="_blank" rel="noreferrer">${authorName}</a>` : authorName}</div>` : '';
	const title = embed.title
		? `<div class="embed-title">${embed.url ? `<a href="${safeUrl(embed.url) ?? '#'}" target="_blank" rel="noreferrer">${escapeHtml(embed.title)}</a>` : escapeHtml(embed.title)}</div>`
		: '';
	const description = embed.description ? `<div class="embed-description">${renderContent(embed.description)}</div>` : '';
	const fields = Array.isArray(embed.fields) ? `<div class="embed-fields">${embed.fields.map(field => `<div class="embed-field${field.inline ? ' inline' : ''}"><strong>${escapeHtml(field.name)}</strong><div>${renderContent(field.value)}</div></div>`).join('')}</div>` : '';
	const imageUrl = safeUrl(embed.image?.url);
	const thumbnailUrl = safeUrl(embed.thumbnail?.url);
	const image = imageUrl ? `<img class="embed-image" src="${imageUrl}" alt="" loading="lazy">` : '';
	const thumbnail = thumbnailUrl ? `<img class="embed-thumbnail" src="${thumbnailUrl}" alt="" loading="lazy">` : '';
	const videoUrl = safeUrl(embed.video?.url);
	const video = videoUrl ? `<video class="embed-video" controls preload="metadata" src="${videoUrl}"></video>` : '';
	const footerIcon = safeUrl(embed.footer?.icon_url);
	const timestamp = embed.timestamp ? new Date(embed.timestamp).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '';
	const footerParts = [embed.footer?.text, timestamp].filter(Boolean).map(escapeHtml).join(' • ');
	const footer = footerParts ? `<div class="embed-footer">${footerIcon ? `<img src="${footerIcon}" alt="">` : ''}${footerParts}</div>` : '';
	return `<div class="embed" style="--embed-color:${color}"><div class="embed-body">${author}${title}${description}${fields}${image}${video}${footer}</div>${thumbnail}</div>`;
}

function resolveComponentUrl(value, attachments) {
	if (typeof value !== 'string') return null;
	if (value.startsWith('attachment://')) {
		const name = value.slice('attachment://'.length);
		return safeUrl(attachments.find(attachment => attachment.name === name)?.url);
	}
	return safeUrl(value);
}

function renderComponentButton(component) {
	const label = escapeHtml(component.label || (component.emoji?.name ? component.emoji.name : 'Button'));
	const emoji = component.emoji?.name ? `<span>${escapeHtml(component.emoji.name)}</span>` : '';
	const style = Number(component.style) || 2;
	const className = `component-button style-${style}${component.disabled ? ' disabled' : ''}`;
	const url = style === 5 ? safeUrl(component.url) : null;
	return url
		? `<a class="${className}" href="${url}" target="_blank" rel="noreferrer">${emoji}${label}</a>`
		: `<span class="${className}">${emoji}${label}</span>`;
}

function renderComponent(component, attachments) {
	if (!component || typeof component !== 'object') return '';

	switch (Number(component.type)) {
	case 1:
		return `<div class="component-row">${(component.components ?? []).map(child => renderComponent(child, attachments)).join('')}</div>`;
	case 2:
		return renderComponentButton(component);
	case 3:
	case 5:
	case 6:
	case 7:
	case 8: {
		const placeholder = escapeHtml(component.placeholder || 'Select an option');
		return `<span class="component-select"><span>${placeholder}</span><span class="select-arrow">⌄</span></span>`;
	}
	case 9: {
		const children = (component.components ?? []).map(child => renderComponent(child, attachments)).join('');
		const accessory = component.accessory ? renderComponent(component.accessory, attachments) : '';
		return `<div class="component-section"><div class="component-section-content">${children}</div>${accessory}</div>`;
	}
	case 10:
		return `<div class="component-text">${renderContent(component.content || '')}</div>`;
	case 11: {
		const url = resolveComponentUrl(component.media?.url, attachments);
		const description = escapeHtml(component.description || 'Media');
		return url ? `<a class="component-thumbnail" href="${url}" target="_blank" rel="noreferrer"><img src="${url}" alt="${description}" loading="lazy"></a>` : '';
	}
	case 12: {
		const items = (component.items ?? []).map((item) => {
			const url = resolveComponentUrl(item.media?.url, attachments);
			if (!url) return '';
			const description = escapeHtml(item.description || 'Media');
			return `<a href="${url}" target="_blank" rel="noreferrer"><img src="${url}" alt="${description}" loading="lazy"></a>`;
		}).join('');
		return items ? `<div class="component-gallery">${items}</div>` : '';
	}
	case 13: {
		const url = resolveComponentUrl(component.file?.url, attachments);
		if (!url) return '';
		const rawName = component.file?.url?.replace('attachment://', '') || 'Download file';
		return `<a class="file component-file" href="${url}" target="_blank" rel="noreferrer"><span class="file-icon">↓</span><span><strong>${escapeHtml(rawName)}</strong></span></a>`;
	}
	case 14:
		return `<div class="component-separator${component.divider === false ? ' no-divider' : ''}${Number(component.spacing) === 2 ? ' large' : ''}"></div>`;
	case 17: {
		const color = Number.isInteger(component.accent_color) ? `#${component.accent_color.toString(16).padStart(6, '0')}` : 'transparent';
		const children = (component.components ?? []).map(child => renderComponent(child, attachments)).join('');
		return `<div class="component-container" style="--container-accent:${color}">${children}</div>`;
	}
	default:
		return '';
	}
}

function renderComponents(components, attachments) {
	if (!Array.isArray(components) || components.length === 0) return '';
	return `<div class="components-v2">${components.map(component => renderComponent(component, attachments)).join('')}</div>`;
}

function renderMessage(entry, previousEntry) {
	const compact = previousEntry
		&& previousEntry.authorId === entry.authorId
		&& Math.abs(new Date(entry.createdAt) - new Date(previousEntry.createdAt)) < 7 * 60 * 1000;
	const avatar = safeUrl(entry.authorAvatarUrl);
	const displayName = escapeHtml(entry.authorDisplayName || entry.authorTag || 'Unknown User');
	const timestamp = entry.createdAt ? new Date(entry.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'Unknown time';
	const fallbackAttachments = (entry.attachments ?? []).map(url => ({ url }));
	const attachments = entry.attachmentMetadata?.length ? entry.attachmentMetadata : fallbackAttachments;
	const reply = entry.reference?.authorTag
		? `<div class="reply"><span class="reply-line"></span><strong>${escapeHtml(entry.reference.authorDisplayName || entry.reference.authorTag)}</strong><span>${escapeHtml(entry.reference.content || 'Click to see attachment')}</span></div>`
		: '';
	const media = attachments.map(renderAttachment).join('');
	const embeds = (entry.embeds ?? []).map(renderEmbed).join('');
	const components = renderComponents(entry.components, attachments);
	const stickers = (entry.stickers ?? []).map(sticker => {
		const url = safeUrl(sticker.url);
		return url ? `<img class="sticker" src="${url}" alt="${escapeHtml(sticker.name || 'Sticker')}" loading="lazy">` : '';
	}).join('');

	return `<article class="message${compact ? ' compact' : ''}">${reply}<div class="avatar">${avatar ? `<img src="${avatar}" alt="">` : displayName.slice(0, 1)}</div><div class="message-body"><header><strong>${displayName}</strong>${entry.authorBot ? '<span class="bot">APP</span>' : ''}<time>${escapeHtml(timestamp)}</time></header>${entry.content ? `<div class="content">${renderContent(entry.content)}</div>` : ''}${media}${embeds}${components}${stickers}</div></article>`;
}

/**
 * Builds a standalone Discord-style HTML transcript using Discord CDN URLs for media.
 * @param {object} ticket
 * @returns {string}
 */
export function buildTranscriptHtml(ticket) {
	const messages = ticket.transcript ?? [];
	const channelName = escapeHtml(ticket.transcriptChannelName || `ticket-${ticket.threadId}`);
	const category = escapeHtml(ticket.categoryLabel || 'General');
	const created = ticket.createdAt ? new Date(ticket.createdAt).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' }) : 'Unknown';
	const closed = ticket.closedAt ? new Date(ticket.closedAt).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' }) : 'Unknown';
	const renderedMessages = messages.length
		? messages.map((entry, index) => renderMessage(entry, messages[index - 1])).join('')
		: '<div class="empty">No messages were recorded.</div>';

	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>#${channelName} transcript</title>
<style>
:root{color-scheme:dark;font-family:"gg sans","Noto Sans","Helvetica Neue",Helvetica,Arial,sans-serif;background:#313338;color:#dbdee1}*{box-sizing:border-box}body{margin:0;background:#313338}.shell{min-height:100vh}.topbar{position:sticky;top:0;z-index:2;height:48px;display:flex;align-items:center;gap:8px;padding:0 16px;background:#313338;border-bottom:1px solid #26272d;box-shadow:0 1px 0 rgba(0,0,0,.2)}.hash{font-size:24px;color:#80848e}.topbar strong{color:#f2f3f5}.summary{padding:32px 16px 20px;margin-left:72px;max-width:900px}.channel-icon{width:68px;height:68px;border-radius:50%;display:grid;place-items:center;background:#41434a;color:#f2f3f5;font-size:38px;font-weight:700}.summary h1{margin:12px 0 8px;color:#f2f3f5;font-size:32px}.summary p{margin:4px 0;color:#b5bac1}.meta{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:14px;font-size:13px;color:#949ba4}.divider{height:1px;background:#3f4147;margin:0 16px 14px 88px}.message{position:relative;display:grid;grid-template-columns:56px minmax(0,1fr);gap:16px;padding:2px 16px 2px 16px;min-height:44px}.message:not(.compact){padding-top:10px;margin-top:7px}.message:hover{background:#2e3035}.avatar{grid-column:1;width:40px;height:40px;border-radius:50%;margin-left:16px;display:grid;place-items:center;background:#5865f2;color:white;font-weight:700;overflow:hidden}.avatar img{width:100%;height:100%;object-fit:cover}.message-body{grid-column:2;min-width:0;padding-right:24px}.message header{display:flex;align-items:baseline;gap:6px;min-height:22px}.message header strong{color:#f2f3f5;font-size:16px}.message time{color:#949ba4;font-size:12px}.bot{padding:1px 4px;border-radius:3px;background:#5865f2;color:white;font-size:10px;font-weight:700}.content{font-size:16px;line-height:1.375;overflow-wrap:anywhere}.content a,.embed a{color:#00a8fc;text-decoration:none}.content a:hover,.embed a:hover{text-decoration:underline}.mention{padding:0 2px;border-radius:3px;background:rgba(88,101,242,.3);color:#c9cdfb}.compact{min-height:22px}.compact .avatar,.compact header{display:none}.reply{grid-column:2;display:flex;align-items:center;gap:5px;height:20px;color:#b5bac1;font-size:12px;overflow:hidden}.reply span:last-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.reply-line{width:32px;height:12px;margin-left:-38px;border-left:2px solid #4e5058;border-top:2px solid #4e5058;border-radius:6px 0 0}.media-link{display:block;width:max-content;max-width:100%}.media{display:block;max-width:min(550px,100%);max-height:420px;margin-top:6px;border-radius:8px;background:#1e1f22}.image{object-fit:contain}.audio{display:block;width:min(400px,100%);margin-top:6px}.file{display:flex;align-items:center;gap:12px;width:min(430px,100%);margin-top:6px;padding:12px;border:1px solid #1e1f22;border-radius:4px;background:#2b2d31;color:#00a8fc;text-decoration:none}.file-icon{font-size:24px}.file small{display:block;color:#949ba4;margin-top:3px}.embed{display:flex;width:min(520px,100%);margin-top:4px;padding:8px 12px;border-left:4px solid var(--embed-color);border-radius:4px;background:#2b2d31}.embed-body{min-width:0;flex:1}.embed-author,.embed-title{margin:4px 0;font-weight:600;color:#f2f3f5}.embed-description{font-size:14px;line-height:1.3}.embed-fields{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:8px}.embed-field{flex-basis:100%;font-size:14px}.embed-field.inline{flex:1;min-width:120px}.embed-field strong{display:block;color:#f2f3f5}.embed-image{display:block;max-width:100%;max-height:300px;margin-top:12px;border-radius:4px}.embed-thumbnail{width:80px;height:80px;margin-left:16px;object-fit:cover;border-radius:4px}.embed-footer{margin-top:8px;color:#b5bac1;font-size:12px}.sticker{width:160px;height:160px;object-fit:contain}.empty{margin:40px 88px;color:#949ba4}.footer{margin:28px 88px;padding:16px 0;border-top:1px solid #3f4147;color:#949ba4;font-size:12px}@media(max-width:600px){.summary{margin-left:16px}.message{grid-template-columns:44px;gap:10px;padding-left:4px}.avatar{margin-left:4px}.message-body{padding-right:6px}.divider{margin-left:60px}.footer,.empty{margin-left:60px}.embed-thumbnail{display:none}}
</style><style>
.embed-author{display:flex;align-items:center;gap:8px}.embed-author img,.embed-footer img{width:20px;height:20px;border-radius:50%;object-fit:cover}.embed-footer{display:flex;align-items:center;gap:6px}.embed-video{display:block;max-width:100%;max-height:300px;margin-top:12px;border-radius:4px}.components-v2{width:min(600px,100%);margin-top:4px}.component-container{display:flex;flex-direction:column;gap:8px;padding:12px 16px;border:1px solid #1e1f22;border-left:4px solid var(--container-accent);border-radius:8px;background:#2b2d31}.component-text{font-size:16px;line-height:1.375;overflow-wrap:anywhere}.component-text a{color:#00a8fc;text-decoration:none}.component-section{display:flex;align-items:center;justify-content:space-between;gap:16px}.component-section-content{min-width:0;flex:1;display:flex;flex-direction:column;gap:6px}.component-thumbnail{flex:0 0 85px;width:85px;height:85px;border-radius:8px;overflow:hidden}.component-thumbnail img{width:100%;height:100%;object-fit:cover}.component-gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;overflow:hidden;border-radius:8px}.component-gallery a:only-child{grid-column:1/-1}.component-gallery img{display:block;width:100%;height:190px;object-fit:cover;background:#1e1f22}.component-row{display:flex;flex-wrap:wrap;gap:8px}.component-button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:32px;min-height:32px;padding:2px 16px;border-radius:3px;color:#fff;font-size:14px;font-weight:500;text-decoration:none;user-select:none}.component-button.style-1{background:#5865f2}.component-button.style-2{background:#4e5058}.component-button.style-3{background:#248046}.component-button.style-4{background:#da373c}.component-button.style-5{background:#4e5058}.component-button.disabled{opacity:.5}.component-select{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:40px;flex:1;padding:8px 12px;border:1px solid #1e1f22;border-radius:3px;background:#1e1f22;color:#949ba4;font-size:14px}.select-arrow{font-size:18px}.component-separator{height:1px;margin:4px 0;background:#3f4147}.component-separator.large{margin:12px 0}.component-separator.no-divider{background:transparent}.component-file{margin-top:0;background:#1e1f22}.component-container>.component-container{background:#313338}.markdown-heading{display:block;color:#f2f3f5;line-height:1.2;margin:2px 0}.markdown-heading.h1{font-size:24px}.markdown-heading.h2{font-size:20px}.markdown-heading.h3{font-size:16px}.markdown-quote{display:block;padding-left:12px;border-left:4px solid #4e5058}.custom-emoji{width:22px;height:22px;vertical-align:middle;object-fit:contain}.spoiler{padding:0 2px;border-radius:3px;background:#1e1f22;color:transparent}.spoiler:hover{color:#dbdee1}code{padding:2px 4px;border-radius:3px;background:#1e1f22;font-family:Consolas,monospace;font-size:85%}@media(max-width:600px){.component-gallery img{height:130px}.component-section{align-items:flex-start}.component-thumbnail{flex-basis:64px;width:64px;height:64px}}
</style></head><body><main class="shell"><div class="topbar"><span class="hash">#</span><strong>${channelName}</strong></div><section class="summary"><div class="channel-icon">#</div><h1>Welcome to #${channelName}!</h1><p>This is the beginning of the ${category} ticket transcript.</p><div class="meta"><span>Opened ${escapeHtml(created)}</span><span>Closed ${escapeHtml(closed)}</span><span>${messages.length} messages</span>${ticket.closeReason ? `<span>Reason: ${escapeHtml(ticket.closeReason)}</span>` : ''}</div></section><div class="divider"></div>${renderedMessages}<footer class="footer">Exported by Blueberry · Media is loaded from Discord's CDN and remains subject to Discord's retention.</footer></main></body></html>`;
}

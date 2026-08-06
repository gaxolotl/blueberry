import { ArrowDown, ArrowUp, Copy, Image, Link, Minus, PanelTop, Plus, Rows3, Trash2, Type } from 'lucide-react';
import { useI18n } from '../../hooks/useI18n.jsx';

const BLOCK_TYPES = [
	{ value: 'text', icon: Type },
	{ value: 'separator', icon: Minus },
	{ value: 'gallery', icon: Image },
	{ value: 'section', icon: PanelTop },
	{ value: 'buttons', icon: Link },
];

function newBlock(type) {
	if (type === 'separator') return { type, divider: true, spacing: 'small' };
	if (type === 'gallery') return { type, items: [{ url: '', description: '', spoiler: false }] };
	if (type === 'section') return { type, content: '### Section title\nSection content', accessoryType: 'thumbnail', url: '', description: '', label: 'Open link', spoiler: false };
	if (type === 'buttons') return { type, buttons: [{ label: 'Open link', url: '' }] };
	return { type: 'text', content: '## Message title\nWrite your message here.' };
}

function newContainer(content = '## Message title\nWrite your message here.') {
	return { colorSource: 'accent', customColor: '#476797', spoiler: false, blocks: [{ type: 'text', content }] };
}

function replacePreviewVariables(value) {
	return String(value ?? '')
		.replaceAll('{user}', '@new-member')
		.replaceAll('{username}', 'new-member')
		.replaceAll('{server}', 'Blueberry Community')
		.replaceAll('{invite}', '`blueberry`');
}

function PreviewBlock({ block }) {
	if (block.type === 'separator') return <div className={`cv2-preview-separator ${block.divider === false ? 'spacing-only' : ''} ${block.spacing}`} />;
	if (block.type === 'gallery') return <div className="cv2-preview-gallery">{block.items.map((item, index) => item.url ? <img key={`${item.url}-${index}`} src={item.url} alt={replacePreviewVariables(item.description) || ''} /> : <div className="cv2-preview-media-empty" key={index}><Image size={18} /></div>)}</div>;
	if (block.type === 'section') return <div className="cv2-preview-section"><div className="cv2-preview-markdown">{replacePreviewVariables(block.content)}</div>{block.accessoryType === 'thumbnail' ? (block.url ? <img src={block.url} alt={replacePreviewVariables(block.description) || ''} /> : <div className="cv2-preview-thumbnail-empty"><Image size={18} /></div>) : <a href={block.url || '#'} onClick={event => event.preventDefault()}>{block.label || 'Link'}</a>}</div>;
	if (block.type === 'buttons') return <div className="cv2-preview-buttons">{block.buttons.map((button, index) => <a href={button.url || '#'} onClick={event => event.preventDefault()} key={index}>{button.label || 'Link'}</a>)}</div>;
	return <div className="cv2-preview-markdown">{replacePreviewVariables(block.content)}</div>;
}

function BlockEditor({ block, index, total, canDuplicate, onChange, onMove, onDuplicate, onRemove }) {
	const { t } = useI18n();
	const update = (key, value) => onChange({ ...block, [key]: value });
	const updateListItem = (key, itemIndex, field, value) => update(key, block[key].map((item, current) => current === itemIndex ? { ...item, [field]: value } : item));
	const addListItem = (key, item) => update(key, [...block[key], item]);
	const removeListItem = (key, itemIndex) => update(key, block[key].filter((_, current) => current !== itemIndex));
	const Icon = BLOCK_TYPES.find(item => item.value === block.type)?.icon ?? Rows3;

	return (
		<div className="cv2-block">
			<div className="cv2-block-titlebar">
				<span><Icon size={14} /> {t(`componentsV2.block.${block.type}`)}</span>
				<div className="cv2-toolbar">
					<button type="button" className="icon-btn" disabled={index === 0} onClick={() => onMove(-1)} title={t('componentsV2.moveUp')}><ArrowUp size={13} /></button>
					<button type="button" className="icon-btn" disabled={index === total - 1} onClick={() => onMove(1)} title={t('componentsV2.moveDown')}><ArrowDown size={13} /></button>
					<button type="button" className="icon-btn" disabled={!canDuplicate} onClick={onDuplicate} title={t('componentsV2.duplicate')}><Copy size={13} /></button>
					<button type="button" className="icon-btn danger" disabled={total === 1} onClick={onRemove} title={t('componentsV2.remove')}><Trash2 size={13} /></button>
				</div>
			</div>

			{block.type === 'text' && <textarea className="form-input form-textarea cv2-code-input" maxLength={4000} value={block.content} onChange={event => update('content', event.target.value)} />}
			{block.type === 'separator' && <div className="cv2-inline-fields"><label className="switch-row"><input type="checkbox" checked={block.divider !== false} onChange={event => update('divider', event.target.checked)} /><span>{t('componentsV2.divider')}</span></label><select className="form-input form-select" value={block.spacing} onChange={event => update('spacing', event.target.value)}><option value="small">{t('componentsV2.spacingSmall')}</option><option value="large">{t('componentsV2.spacingLarge')}</option></select></div>}
			{block.type === 'gallery' && <div className="cv2-list-editor">{block.items.map((item, itemIndex) => <div className="cv2-list-row" key={itemIndex}><input className="form-input" type="url" placeholder="https://example.com/image.png" value={item.url} onChange={event => updateListItem('items', itemIndex, 'url', event.target.value)} /><input className="form-input" placeholder={t('componentsV2.altText')} maxLength={1024} value={item.description} onChange={event => updateListItem('items', itemIndex, 'description', event.target.value)} /><label className="switch-row cv2-spoiler"><input type="checkbox" checked={Boolean(item.spoiler)} onChange={event => updateListItem('items', itemIndex, 'spoiler', event.target.checked)} /><span>{t('componentsV2.spoiler')}</span></label><button type="button" className="icon-btn danger" disabled={block.items.length === 1} onClick={() => removeListItem('items', itemIndex)}><Trash2 size={13} /></button></div>)}<button type="button" className="btn btn-secondary btn-compact" disabled={block.items.length >= 10} onClick={() => addListItem('items', { url: '', description: '', spoiler: false })}><Plus size={13} /> {t('componentsV2.addImage')}</button></div>}
			{block.type === 'section' && <div className="cv2-section-editor"><textarea className="form-input form-textarea cv2-code-input" maxLength={4000} value={block.content} onChange={event => update('content', event.target.value)} /><div className="cv2-inline-fields"><select className="form-input form-select" value={block.accessoryType} onChange={event => update('accessoryType', event.target.value)}><option value="thumbnail">{t('componentsV2.thumbnail')}</option><option value="button">{t('componentsV2.linkButton')}</option></select><input className="form-input" type="url" placeholder="https://..." value={block.url} onChange={event => update('url', event.target.value)} /></div>{block.accessoryType === 'thumbnail' ? <div className="cv2-inline-fields"><input className="form-input" placeholder={t('componentsV2.altText')} maxLength={1024} value={block.description} onChange={event => update('description', event.target.value)} /><label className="switch-row"><input type="checkbox" checked={Boolean(block.spoiler)} onChange={event => update('spoiler', event.target.checked)} /><span>{t('componentsV2.spoiler')}</span></label></div> : <input className="form-input" maxLength={80} placeholder={t('componentsV2.buttonLabel')} value={block.label} onChange={event => update('label', event.target.value)} />}</div>}
			{block.type === 'buttons' && <div className="cv2-list-editor">{block.buttons.map((button, buttonIndex) => <div className="cv2-list-row cv2-button-row" key={buttonIndex}><input className="form-input" maxLength={80} placeholder={t('componentsV2.buttonLabel')} value={button.label} onChange={event => updateListItem('buttons', buttonIndex, 'label', event.target.value)} /><input className="form-input" type="url" placeholder="https://..." value={button.url} onChange={event => updateListItem('buttons', buttonIndex, 'url', event.target.value)} /><button type="button" className="icon-btn danger" disabled={block.buttons.length === 1} onClick={() => removeListItem('buttons', buttonIndex)}><Trash2 size={13} /></button></div>)}<button type="button" className="btn btn-secondary btn-compact" disabled={block.buttons.length >= 5} onClick={() => addListItem('buttons', { label: 'Open link', url: '' })}><Plus size={13} /> {t('componentsV2.addButton')}</button></div>}
		</div>
	);
}

export default function ComponentsV2Editor({ value, fallbackMessage, onChange, variablesHint, limits }) {
	const { t } = useI18n();
	const template = value;
	const maxContainers = limits?.maxContainers ?? 4;
	const maxBlocks = limits?.maxBlocksPerContainer ?? 10;
	const updateContainer = (containerIndex, next) => onChange({ ...template, containers: template.containers.map((container, index) => index === containerIndex ? next : container) });
	const removeContainer = containerIndex => onChange({ ...template, containers: template.containers.filter((_, index) => index !== containerIndex) });

	if (!template) return <div className="cv2-enable"><div><strong>{t('componentsV2.basicMode')}</strong><span>{t('componentsV2.basicModeDescription')}</span></div><button type="button" className="btn btn-secondary" onClick={() => onChange({ version: 1, containers: [newContainer(fallbackMessage)] })}><PanelTop size={14} /> {t('componentsV2.enable')}</button></div>;

	return (
		<div className="cv2-editor">
			<div className="cv2-editor-header"><div><strong>{t('componentsV2.title')}</strong><span>{variablesHint}</span></div><button type="button" className="btn btn-secondary btn-compact" onClick={() => onChange(null)}>{t('componentsV2.useBasic')}</button></div>
			<div className="cv2-workbench">
				<div className="cv2-canvas">
					{template.containers.map((container, containerIndex) => {
						const update = (key, nextValue) => updateContainer(containerIndex, { ...container, [key]: nextValue });
						const updateBlock = (blockIndex, nextBlock) => update('blocks', container.blocks.map((block, index) => index === blockIndex ? nextBlock : block));
						const moveBlock = (blockIndex, direction) => { const blocks = [...container.blocks]; const [block] = blocks.splice(blockIndex, 1); blocks.splice(blockIndex + direction, 0, block); update('blocks', blocks); };
						return <section className="cv2-container-editor" key={containerIndex}><div className="cv2-container-titlebar"><span>{t('componentsV2.container', { number: containerIndex + 1 })}</span><div className="cv2-container-options"><select className="form-input form-select" value={container.colorSource} onChange={event => update('colorSource', event.target.value)}><option value="accent">{t('componentsV2.colorAccent')}</option><option value="error">{t('componentsV2.colorError')}</option><option value="custom">{t('componentsV2.colorCustom')}</option><option value="none">{t('componentsV2.colorNone')}</option></select>{container.colorSource === 'custom' && <input type="color" className="form-color-picker cv2-color" value={container.customColor || '#476797'} onChange={event => update('customColor', event.target.value)} />}<label className="switch-row"><input type="checkbox" checked={Boolean(container.spoiler)} onChange={event => update('spoiler', event.target.checked)} /><span>{t('componentsV2.spoiler')}</span></label><button type="button" className="icon-btn danger" disabled={template.containers.length === 1} onClick={() => removeContainer(containerIndex)}><Trash2 size={13} /></button></div></div><div className="cv2-block-list">{container.blocks.map((block, blockIndex) => <BlockEditor key={blockIndex} block={block} index={blockIndex} total={container.blocks.length} canDuplicate={container.blocks.length < maxBlocks} onChange={next => updateBlock(blockIndex, next)} onMove={direction => moveBlock(blockIndex, direction)} onDuplicate={() => update('blocks', [...container.blocks.slice(0, blockIndex + 1), structuredClone(block), ...container.blocks.slice(blockIndex + 1)])} onRemove={() => update('blocks', container.blocks.filter((_, index) => index !== blockIndex))} />)}</div><div className="cv2-add-block">{BLOCK_TYPES.map(({ value: type, icon: Icon }) => <button type="button" key={type} disabled={container.blocks.length >= maxBlocks} onClick={() => update('blocks', [...container.blocks, newBlock(type)])}><Icon size={13} /> {t(`componentsV2.block.${type}`)}</button>)}</div></section>;
					})}
					<button type="button" className="btn btn-secondary" disabled={template.containers.length >= maxContainers} onClick={() => onChange({ ...template, containers: [...template.containers, newContainer()] })}><Plus size={14} /> {t('componentsV2.addContainer')}</button>
				</div>
				<aside className="cv2-preview-pane"><div className="cv2-preview-title">{t('componentsV2.preview')}</div><div className="cv2-discord-preview">{template.containers.map((container, index) => <div className={`cv2-preview-container ${container.spoiler ? 'spoiler' : ''}`} style={{ '--preview-accent': container.colorSource === 'custom' ? container.customColor : container.colorSource === 'error' ? '#f04747' : container.colorSource === 'none' ? 'transparent' : '#5865f2' }} key={index}>{container.blocks.map((block, blockIndex) => <PreviewBlock block={block} key={blockIndex} />)}</div>)}</div><div className="cv2-preview-note">{t('componentsV2.previewNote')}</div></aside>
			</div>
		</div>
	);
}

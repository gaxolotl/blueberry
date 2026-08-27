import { useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { useI18n } from '../hooks/useI18n.jsx';

export function RoleSelect({ roles, value, onChange, allowNone = true }) {
	const { t } = useI18n();
	const missingValue = value && !roles.some(role => role.id === value);
	return (
		<select className="form-input form-select" value={value ?? ''} onChange={event => onChange(event.target.value)}>
			{allowNone && <option value="">{t('resources.noRole')}</option>}
			{missingValue && <option value={value}>{t('resources.unknownRole', { id: value })}</option>}
			{roles.map(role => <option key={role.id} value={role.id}>@{role.name}</option>)}
		</select>
	);
}

export function ChannelSelect({ channels, value, onChange, allowNone = true }) {
	const { t } = useI18n();
	const missingValue = value && !channels.some(channel => channel.id === value);
	return (
		<select className="form-input form-select" value={value ?? ''} onChange={event => onChange(event.target.value)}>
			{allowNone && <option value="">{t('resources.noChannel')}</option>}
			{missingValue && <option value={value}>{t('resources.unknownChannel', { id: value })}</option>}
			{channels.map(channel => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}
		</select>
	);
}

/**
 * Searchable multi-select used for allow/deny channel & role restriction lists.
 * @param {object} props
 * @param {Array<{id:string, name:string}>} props.options - The pickable options.
 * @param {string[]} props.value - Currently selected IDs.
 * @param {(next:string[]) => void} props.onChange
 * @param {string} [props.kind] - 'channel' or 'role' for the display prefix.
 * @param {string} [props.emptyText] - Message shown when no options exist.
 */
export function ResourceMultiSelect({ options, value = [], onChange, kind = 'channel', emptyText, open }) {
	const { t } = useI18n();
	const [query, setQuery] = useState('');
	const [isOpen, setIsOpen] = useState(open ?? false);

	const selected = value ?? [];
	const selectedSet = new Set(selected);
	const available = (options ?? []).filter(opt => opt.id && !selectedSet.has(opt.id));
	const filtered = available.filter(opt => opt.name?.toLowerCase().includes(query.trim().toLowerCase()));

	const toggle = (id) => {
		const next = selectedSet.has(id) ? selected.filter(x => x !== id) : [...selected, id];
		onChange(next);
	};

	const remove = (id) => onChange(selected.filter(x => x !== id));

	const selectionItems = (options ?? []).filter(opt => selectedSet.has(opt.id));
	const noisyIds = selected.filter(id => !(options ?? []).some(opt => opt.id === id));

	return (
		<div className="res-multiselect">
			<div className="res-multiselect-trigger" onClick={() => setIsOpen(current => !current)}>
				<div className="res-multiselect-chips">
					{selectionItems.length + noisyIds.length === 0 && <span className="res-multiselect-placeholder">{t('resources.noneSelected')}</span>}
					{selectionItems.map(opt => (
						<span key={opt.id} className="res-chip">
							{kind === 'channel' ? '#' : '@'}{opt.name}
							<span role="button" className="res-chip-x" onClick={event => { event.stopPropagation(); remove(opt.id); }}><X size={11} /></span>
						</span>
					))}
					{noisyIds.map(id => (
						<span key={id} className="res-chip res-chip-missing">{t(kind === 'channel' ? 'resources.unknownChannel' : 'resources.unknownRole', { id })}
							<span role="button" className="res-chip-x" onClick={event => { event.stopPropagation(); remove(id); }}><X size={11} /></span>
						</span>
					))}
				</div>
				<span className="res-multiselect-caret">{isOpen ? <X size={14} /> : <Search size={14} />}</span>
			</div>

			{isOpen && (
				<div className="res-multiselect-dropdown">
					<div className="res-multiselect-search">
						<Search size={13} />
						<input
							className="res-multiselect-input"
							placeholder={t(kind === 'channel' ? 'resources.searchChannels' : 'resources.searchRoles')}
							value={query}
							onChange={event => setQuery(event.target.value)}
							autoFocus
						/>
					</div>
					<div className="res-multiselect-options">
						{filtered.length === 0 && <div className="res-multiselect-none">{emptyText ?? t('resources.noneMatching')}</div>}
						{filtered.map(opt => (
							<label key={opt.id} className="res-multiselect-option">
								<input type="checkbox" checked={false} onChange={() => toggle(opt.id)} />
								<span>{kind === 'channel' ? '#' : '@'}{opt.name}</span>
								{opt.categoryName && <em>{opt.categoryName}</em>}
								{selectedSet.has(opt.id) && <Check size={13} className="res-option-check" />}
							</label>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

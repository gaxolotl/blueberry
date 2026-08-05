import { useI18n } from '../hooks/useI18n.jsx';

export function RoleSelect({ roles, value, onChange, allowNone = true }) {
	const { t } = useI18n();
	const missingValue = value && !roles.some(role => role.id === value);
	return (
		<select className="form-input" value={value ?? ''} onChange={event => onChange(event.target.value)}>
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
		<select className="form-input" value={value ?? ''} onChange={event => onChange(event.target.value)}>
			{allowNone && <option value="">{t('resources.noChannel')}</option>}
			{missingValue && <option value={value}>{t('resources.unknownChannel', { id: value })}</option>}
			{channels.map(channel => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}
		</select>
	);
}

import { Plus, Trash2 } from 'lucide-react';
import { useI18n } from '../../hooks/useI18n.jsx';
import { Field } from './SettingField.jsx';
import { RoleSelect } from '../DiscordResourceSelect.jsx';

export default function RoleListField({ field, value, onChange, resources }) {
	const { t } = useI18n();
	const roles = value ?? [];

	function addRole() {
		const available = resources?.roles?.find(role => !roles.includes(role.id));
		if (available) onChange([...roles, available.id]);
	}

	function updateRole(index, nextValue) {
		const next = [...roles];
		next[index] = nextValue;
		onChange(next);
	}

	function removeRole(index) {
		onChange(roles.filter((_, i) => i !== index));
	}

	return (
		<Field label={t(field.labelKey)}>
			<div className="form-stack">
				{roles.map((role, index) => (
					<div className="form-row" key={index}>
						<RoleSelect roles={resources?.roles ?? []} value={role} onChange={next => updateRole(index, next)} allowNone={false} />
						<button className="icon-btn icon-btn-danger" onClick={() => removeRole(index)} title={t(field.removeKey)}>
							<Trash2 size={14} />
						</button>
					</div>
				))}
				<button className="btn btn-secondary" onClick={addRole} disabled={!resources?.roles?.some(role => !roles.includes(role.id))}>
					<Plus size={14} />
					{t(field.addKey)}
				</button>
			</div>
		</Field>
	);
}

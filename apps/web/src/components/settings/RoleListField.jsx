import { Plus, Trash2 } from 'lucide-react';
import { useI18n } from '../../hooks/useI18n.jsx';
import { Field } from './SettingField.jsx';

export default function RoleListField({ field, value, onChange }) {
	const { t } = useI18n();
	const roles = value ?? [];

	function addRole() {
		onChange([...roles, '']);
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
						<input className="form-input" placeholder={t(field.placeholderKey)} value={role} onChange={(e) => updateRole(index, e.target.value)} />
						<button className="icon-btn icon-btn-danger" onClick={() => removeRole(index)} title={t(field.removeKey)}>
							<Trash2 size={14} />
						</button>
					</div>
				))}
				<button className="btn btn-secondary" onClick={addRole}>
					<Plus size={14} />
					{t(field.addKey)}
				</button>
			</div>
		</Field>
	);
}
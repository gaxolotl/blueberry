import { Plus, Trash2 } from 'lucide-react';
import { useI18n } from '../../hooks/useI18n.jsx';

export default function CategoryListField({ field, value, onChange }) {
	const { t } = useI18n();
	const categories = value ?? [];
	const addCategory = () => onChange([...categories, { id: '', label: '', emoji: null, description: null, priority: null, supportRoleIds: [] }]);
	const updateCategory = (index, key, nextValue) => {
		const next = [...categories];
		next[index] = { ...next[index], [key]: nextValue };
		onChange(next);
	};
	const removeCategory = (index) => onChange(categories.filter((_, i) => i !== index));

	return (
		<>
			{categories.map((category, index) => (
				<div className="category-block" key={index}>
					<div className="category-row">
						<input className="form-input" placeholder={t('settings.categoryId')} value={category.id ?? ''} onChange={(e) => updateCategory(index, 'id', e.target.value)} />
						<input className="form-input" placeholder={t('settings.categoryLabel')} value={category.label ?? ''} onChange={(e) => updateCategory(index, 'label', e.target.value)} />
						<input className="form-input form-input-narrow" placeholder={t('settings.categoryEmoji')} value={category.emoji ?? ''} onChange={(e) => updateCategory(index, 'emoji', e.target.value)} />
						<button className="icon-btn icon-btn-danger" onClick={() => removeCategory(index)} title={t(field.removeKey)}><Trash2 size={14} /></button>
					</div>
					<div className="category-row">
						<input className="form-input" placeholder={t('settings.categoryDescription')} value={category.description ?? ''} onChange={(e) => updateCategory(index, 'description', e.target.value)} />
						<select className="form-input form-input-narrow" value={category.priority ?? ''} onChange={(e) => updateCategory(index, 'priority', e.target.value || null)}>
							<option value="">—</option>
							<option value="low">{t('settings.priorityLow')}</option>
							<option value="medium">{t('settings.priorityMedium')}</option>
							<option value="high">{t('settings.priorityHigh')}</option>
						</select>
					</div>
					<div className="category-row">
						<input className="form-input" placeholder={t('settings.categorySupportRoles')} value={(category.supportRoleIds ?? []).join(', ')} onChange={(e) => updateCategory(index, 'supportRoleIds', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} />
					</div>
				</div>
			))}
			<button className="btn btn-secondary" onClick={addCategory}><Plus size={14} />{t(field.addKey)}</button>
		</>
	);
}
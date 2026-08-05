import { useI18n } from '../../hooks/useI18n.jsx';
import SettingField from './SettingField.jsx';
import RoleListField from './RoleListField.jsx';
import CategoryListField from './CategoryListField.jsx';

const LIST_RENDERERS = { roleList: RoleListField, categoryList: CategoryListField };

export default function SettingCategory({ category, values, onChange }) {
	const { t } = useI18n();
	const Icon = category.icon;
	const renderField = (field) => {
		const Renderer = LIST_RENDERERS[field.type] ?? SettingField;
		const cb = (next) => onChange(field.key, next);
		return <Renderer key={field.key} field={field} value={values[field.key]} onChange={cb} />;
	};
	return (
		<section className="panel">
			<h2 className="panel-title">
				<Icon size={16} className="panel-title-icon" />
				{t(category.titleKey)}
			</h2>
			{category.fields.map(renderField)}
		</section>
	);
}
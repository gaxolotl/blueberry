import { useI18n } from '../../hooks/useI18n.jsx';

export function Field({ label, children }) {
	return (
		<div className="form-row">
			<label className="form-label">{label}</label>
			{children}
		</div>
	);
}

export function TextField({ field, value, onChange }) {
	const { t } = useI18n();
	return (
		<Field label={t(field.labelKey)}>
			<div className="form-stack">
				<input
					className="form-input"
					value={value ?? ''}
					placeholder={field.placeholderKey ? t(field.placeholderKey) : undefined}
					onChange={(e) => onChange(e.target.value)}
				/>
				{field.hintKey && <span className="form-hint">{t(field.hintKey)}</span>}
			</div>
		</Field>
	);
}

export function TextareaField({ field, value, onChange }) {
	const { t } = useI18n();
	return (
		<Field label={t(field.labelKey)}>
			<textarea
				className="form-input form-textarea"
				value={value ?? ''}
				onChange={(e) => onChange(e.target.value)}
			/>
		</Field>
	);
}

export function NumberField({ field, value, onChange }) {
	const { t } = useI18n();
	return (
		<Field label={t(field.labelKey)}>
			<input
				className="form-input form-input-narrow"
				type="number"
				min={field.min}
				value={value ?? 0}
				onChange={(e) => onChange(e.target.value)}
			/>
		</Field>
	);
}

export function SelectField({ field, value, onChange }) {
	const { t } = useI18n();
	return (
		<Field label={t(field.labelKey)}>
			<select
				className="form-input form-input-narrow"
				value={String(value ?? field.default ?? '')}
				onChange={(e) => onChange(e.target.value)}
			>
				{field.options.map((option) => (
					<option key={option.value} value={option.value}>
						{t(option.labelKey)}
					</option>
				))}
			</select>
		</Field>
	);
}

const SIMPLE_RENDERERS = {
	text: TextField,
	textarea: TextareaField,
	number: NumberField,
	select: SelectField,
};

export default function SettingField({ field, value, onChange }) {
	const Renderer = SIMPLE_RENDERERS[field.type] ?? TextField;
	return <Renderer field={field} value={value} onChange={onChange} />;
}

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../../hooks/useI18n.jsx';
import { ChannelSelect } from '../DiscordResourceSelect.jsx';

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

export function ColorField({ field, value, onChange }) {
	const { t } = useI18n();
	const [textValue, setTextValue] = useState(value ?? field.default ?? '#000000');
	const [isValid, setIsValid] = useState(true);

	const normalize = useCallback((raw) => {
		if (typeof raw !== 'string') return '#000000';
		const trimmed = raw.trim();
		if (/^[0-9a-fA-F]{3}$/.test(trimmed)) return `#${trimmed.split('').map(char => char.repeat(2)).join('')}`;
		if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed}`;
		if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) return `#${trimmed.slice(1).split('').map(char => char.repeat(2)).join('')}`;
		if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
		return null;
	}, []);

	useEffect(() => {
		setTextValue(value ?? field.default ?? '#000000');
		setIsValid(true);
	}, [field.default, value]);

	const handleTextChange = useCallback((e) => {
		const raw = e.target.value;
		setTextValue(raw);
		const norm = normalize(raw);
		if (norm) {
			setIsValid(true);
			onChange(norm);
		} else {
			setIsValid(false);
		}
	}, [onChange, normalize]);

	const handleColorPicker = useCallback((e) => {
		const hex = e.target.value.toUpperCase();
		setTextValue(hex);
		setIsValid(true);
		onChange(hex);
	}, [onChange]);

	const currentColor = isValid ? (normalize(textValue) ?? '#000000') : '#000000';

	return (
		<Field label={t(field.labelKey)}>
			<div className="form-color-row">
				<input
					type="color"
					className="form-color-picker"
					value={currentColor}
					onChange={handleColorPicker}
				/>
				<input
					className={`form-input form-color-text ${!isValid ? 'form-input-error' : ''}`}
					value={textValue}
					placeholder={field.placeholderKey ? t(field.placeholderKey) : '#000000'}
					onChange={handleTextChange}
					maxLength={7}
				/>
			</div>
		</Field>
	);
}

const SIMPLE_RENDERERS = {
	text: TextField,
	textarea: TextareaField,
	number: NumberField,
	select: SelectField,
	color: ColorField,
};

function ChannelField({ field, value, onChange, resources }) {
	const { t } = useI18n();
	return <Field label={t(field.labelKey)}><ChannelSelect channels={resources?.channels ?? []} value={value} onChange={onChange} /></Field>;
}

export default function SettingField({ field, value, onChange, resources }) {
	const Renderer = field.type === 'channel' ? ChannelField : SIMPLE_RENDERERS[field.type] ?? TextField;
	return <Renderer field={field} value={value} onChange={onChange} resources={resources} />;
}

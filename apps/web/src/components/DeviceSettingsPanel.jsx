import { X, Palette, Languages } from 'lucide-react';
import { useI18n } from '../hooks/useI18n.jsx';
import { useDeviceSettings } from '../hooks/useDeviceSettings.js';

export default function DeviceSettingsPanel({ onClose }) {
	const { t } = useI18n();
	const { prefs, setPref } = useDeviceSettings();

	return (
		<div className="device-panel">
			<div className="device-panel-header">
				<span className="device-panel-title">{t('device.title')}</span>
				<button className="icon-btn" onClick={onClose} title={t('device.close')}>
					<X size={14} />
				</button>
			</div>
<div className="device-panel-body">
			<div className="form-row">
				<label className="form-label">
					<Languages size={13} />
					{t('device.language')}
				</label>
				<select
					className="form-input form-select"
					value={prefs.language}
					onChange={(e) => setPref('language', e.target.value)}
				>
					<option value="en">{t('device.languageEn')}</option>
					<option value="bg">{t('device.languageBg')}</option>
				</select>
			</div>
			<div className="form-row">
				<label className="form-label">
					<Palette size={13} />
					{t('device.theme')}
				</label>
				<select
					className="form-input form-select"
					value={prefs.theme}
					onChange={(e) => setPref('theme', e.target.value)}
				>
					<option value="dark">{t('device.themeDark')}</option>
					<option value="light">{t('device.themeLight')}</option>
				</select>
			</div>
		</div>
		</div>
	);
}

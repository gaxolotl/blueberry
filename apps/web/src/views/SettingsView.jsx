import { Save } from 'lucide-react';
import { useEffect } from 'react';
import { useI18n } from '../hooks/useI18n.jsx';
import { useGuildSettings } from '../hooks/useGuildSettings.js';
import { SETTING_CATEGORIES } from '../utils/settingsRegistry.js';
import { Loading, Error, Empty } from '../components/State.jsx';
import SettingCategory from '../components/settings/SettingCategory.jsx';
import { useToast } from '../components/Toast.jsx';
import { useGuildResources } from '../hooks/useGuildResources.js';

export default function SettingsView({ guildId }) {
	const { t } = useI18n();
	const settings = useGuildSettings(guildId);
	const { showToast } = useToast();
	const resources = useGuildResources(guildId);

	useEffect(() => {
		if (settings.savedAt) showToast(t('settings.saved'), 'success');
	}, [settings.savedAt, showToast, t]);

	if (!guildId) return <Empty message={t('app.selectServer')} />;
	if (settings.loading) return <Loading />;
	if (settings.error) return <Error message={settings.error} />;

	return (
		<div className="view">
			<h1 className="view-title">{t('settings.title')}</h1>
			{SETTING_CATEGORIES.map((category) => (
				<SettingCategory
					key={category.id}
					category={category}
					values={settings.values}
					onChange={settings.update}
					resources={resources}
				/>
			))}
			<div className="form-actions form-actions-sticky">
				<button className="btn" onClick={settings.save} disabled={settings.saving}>
					<Save size={14} />
					{settings.saving ? t('settings.saving') : t('settings.saveAll')}
				</button>
			</div>
		</div>
	);
}

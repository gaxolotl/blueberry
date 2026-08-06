import { Save, ShieldCheck, UserMinus, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ChannelSelect } from '../components/DiscordResourceSelect.jsx';
import { Empty, Error, Loading } from '../components/State.jsx';
import { useToast } from '../components/Toast.jsx';
import { useGuildResources } from '../hooks/useGuildResources.js';
import { useI18n } from '../hooks/useI18n.jsx';
import { apiFetch } from '../utils/api.js';
import ComponentsV2Editor from '../components/componentsV2/ComponentsV2Editor.jsx';

export default function OnboardingView({ guildId }) {
	const { t } = useI18n();
	const { showToast } = useToast();
	const resources = useGuildResources(guildId);
	const [settings, setSettings] = useState(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState(null);

	useEffect(() => {
		let cancelled = false;
		if (!guildId) return undefined;
		setLoading(true);
		setError(null);
		apiFetch(`/api/guilds/${guildId}/onboarding-config`)
			.then(data => { if (!cancelled) setSettings(data); })
			.catch(fetchError => { if (!cancelled) setError(fetchError.message); })
			.finally(() => { if (!cancelled) setLoading(false); });
		return () => { cancelled = true; };
	}, [guildId]);

	if (!guildId) return <Empty message={t('app.selectServer')} />;
	if (loading) return <Loading />;
	if (error) return <Error message={error} />;

	const update = (key, value) => setSettings(current => ({ ...current, [key]: value }));
	const toggleRole = (roleId) => {
		const selected = settings.autoRoleIds.includes(roleId);
		if (!selected && settings.autoRoleIds.length >= settings.limits.maxAutoRoles) return;
		update('autoRoleIds', selected ? settings.autoRoleIds.filter(id => id !== roleId) : [...settings.autoRoleIds, roleId]);
	};
	const save = async () => {
		setSaving(true);
		try {
			const updated = await apiFetch(`/api/guilds/${guildId}/onboarding-config`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(settings),
			});
			setSettings(updated);
			showToast(t('onboarding.saved'), 'success');
		}
		catch (saveError) {
			showToast(saveError.message, 'error');
		}
		finally {
			setSaving(false);
		}
	};

	return (
		<div className="view onboarding-view">
			<div className="patch-notes-header">
				<div><h1 className="view-title">{t('onboarding.title')}</h1><p className="view-subtitle">{t('onboarding.subtitle')}</p></div>
				<button className="btn" onClick={save} disabled={saving}><Save size={14} /> {saving ? t('settings.saving') : t('onboarding.save')}</button>
			</div>

			<section className="panel onboarding-panel">
				<div className="onboarding-panel-heading"><UserPlus size={20} /><div><h2>{t('onboarding.welcomeTitle')}</h2><p>{t('onboarding.welcomeDescription')}</p></div><label className="switch-row"><input type="checkbox" checked={settings.welcomeEnabled} onChange={event => update('welcomeEnabled', event.target.checked)} /><span>{t('onboarding.enabled')}</span></label></div>
				<div className="onboarding-grid"><label className="form-stack"><span className="form-label">{t('onboarding.channel')}</span><ChannelSelect channels={resources.channels} value={settings.welcomeChannelId} onChange={value => update('welcomeChannelId', value || null)} /></label>{!settings.welcomeTemplate && <label className="form-stack onboarding-message"><span className="form-label">{t('onboarding.message')}</span><textarea className="form-input form-textarea" maxLength={1000} value={settings.welcomeMessage} onChange={event => update('welcomeMessage', event.target.value)} /><span className="form-hint">{t('onboarding.welcomeVariables')}</span></label>}</div>
				<ComponentsV2Editor value={settings.welcomeTemplate} fallbackMessage={settings.welcomeMessage} onChange={value => update('welcomeTemplate', value)} variablesHint={t('onboarding.welcomeVariables')} limits={settings.limits.componentsV2} />
			</section>

			<section className="panel onboarding-panel">
				<div className="onboarding-panel-heading"><UserMinus size={20} /><div><h2>{t('onboarding.farewellTitle')}</h2><p>{t('onboarding.farewellDescription')}</p></div><label className="switch-row"><input type="checkbox" checked={settings.farewellEnabled} onChange={event => update('farewellEnabled', event.target.checked)} /><span>{t('onboarding.enabled')}</span></label></div>
				<div className="onboarding-grid"><label className="form-stack"><span className="form-label">{t('onboarding.channel')}</span><ChannelSelect channels={resources.channels} value={settings.farewellChannelId} onChange={value => update('farewellChannelId', value || null)} /></label>{!settings.farewellTemplate && <label className="form-stack onboarding-message"><span className="form-label">{t('onboarding.message')}</span><textarea className="form-input form-textarea" maxLength={1000} value={settings.farewellMessage} onChange={event => update('farewellMessage', event.target.value)} /><span className="form-hint">{t('onboarding.farewellVariables')}</span></label>}</div>
				<ComponentsV2Editor value={settings.farewellTemplate} fallbackMessage={settings.farewellMessage} onChange={value => update('farewellTemplate', value)} variablesHint={t('onboarding.farewellVariables')} limits={settings.limits.componentsV2} />
			</section>

			<section className="panel onboarding-panel">
				<div className="onboarding-panel-heading"><ShieldCheck size={20} /><div><h2>{t('onboarding.safetyTitle')}</h2><p>{t('onboarding.safetyDescription')}</p></div><label className="switch-row"><input type="checkbox" checked={settings.accountAgeAlertEnabled} onChange={event => update('accountAgeAlertEnabled', event.target.checked)} /><span>{t('onboarding.alertsEnabled')}</span></label></div>
				<div className="onboarding-grid"><label className="form-stack"><span className="form-label">{t('onboarding.alertChannel')}</span><ChannelSelect channels={resources.channels} value={settings.accountAgeAlertChannelId} onChange={value => update('accountAgeAlertChannelId', value || null)} /></label><label className="form-stack"><span className="form-label">{t('onboarding.minimumAge')}</span><input className="form-input" type="number" min="1" max={settings.limits.maxAccountAgeDays} value={settings.accountAgeMinimumDays} onChange={event => update('accountAgeMinimumDays', Number(event.target.value))} /></label></div>
				<div className="form-stack"><span className="form-label">{t('onboarding.autoRoles', { count: settings.autoRoleIds.length, max: settings.limits.maxAutoRoles })}</span><div className="onboarding-role-grid">{resources.roles.map(role => <label className="onboarding-role" key={role.id}><input type="checkbox" checked={settings.autoRoleIds.includes(role.id)} disabled={!settings.autoRoleIds.includes(role.id) && settings.autoRoleIds.length >= settings.limits.maxAutoRoles} onChange={() => toggleRole(role.id)} /><span>@{role.name}</span></label>)}</div></div>
			</section>
		</div>
	);
}

import { Plus, Save, Tags, Trash2, WandSparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Empty, Error, Loading } from '../components/State.jsx';
import { useToast } from '../components/Toast.jsx';
import { useI18n } from '../hooks/useI18n.jsx';
import { apiFetch } from '../utils/api.js';
import { useGuildResources } from '../hooks/useGuildResources.js';
import { RoleSelect } from '../components/DiscordResourceSelect.jsx';

const DEFAULT_LIMITS = { maxRules: 20, maxPatternLength: 200 };

function normalizeConfig(data) {
	return {
		...data,
		automationEnabled: Boolean(data?.automationEnabled),
		automationRules: Array.isArray(data?.automationRules)
			? data.automationRules.map(rule => ({
				...rule,
				categoryId: rule.categoryId ?? '',
				tag: rule.tag ?? '',
				assignRoleId: rule.assignRoleId ?? '',
				priority: rule.priority ?? '',
				response: rule.response ?? '',
			}))
			: [],
		automationLimits: { ...DEFAULT_LIMITS, ...data?.automationLimits },
		categories: Array.isArray(data?.categories) ? data.categories : [],
	};
}

function createRule() {
	return {
		id: crypto.randomUUID(), label: '', matchMode: 'keywords', pattern: '', categoryId: '',
		tag: '', assignRoleId: '', priority: '', response: '', enabled: true,
	};
}

export default function TicketAutomationView({ guildId }) {
	const { t } = useI18n();
	const { showToast } = useToast();
	const resources = useGuildResources(guildId);
	const [config, setConfig] = useState(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState(null);

	useEffect(() => {
		let cancelled = false;
		if (!guildId) return undefined;
		setLoading(true);
		setError(null);
		apiFetch(`/api/guilds/${guildId}/ticket-config`)
			.then(data => { if (!cancelled) setConfig(normalizeConfig(data)); })
			.catch(fetchError => { if (!cancelled) setError(fetchError.message); })
			.finally(() => { if (!cancelled) setLoading(false); });
		return () => { cancelled = true; };
	}, [guildId]);

	if (!guildId) return <Empty message={t('app.selectServer')} />;
	if (loading) return <Loading />;
	if (error) return <Error message={error} />;
	if (!config) return <Error message={t('app.error', { message: t('ticketAutomation.loadFailed') })} />;

	const updateRule = (id, key, value) => setConfig(current => ({
		...current,
		automationRules: current.automationRules.map(rule => rule.id === id ? { ...rule, [key]: value } : rule),
	}));
	const addRule = () => setConfig(current => ({ ...current, automationRules: [...current.automationRules, createRule()] }));
	const removeRule = id => setConfig(current => ({ ...current, automationRules: current.automationRules.filter(rule => rule.id !== id) }));
	const save = async () => {
		setSaving(true);
		try {
			const automationRules = config.automationRules.map(rule => ({
				...rule,
				label: rule.label.trim(), pattern: rule.pattern.trim(),
				categoryId: rule.categoryId || null, tag: rule.tag.trim() || null,
				assignRoleId: rule.assignRoleId.trim() || null, priority: rule.priority || null,
				response: rule.response.trim() || null,
			}));
			const updated = await apiFetch(`/api/guilds/${guildId}/ticket-config`, {
				method: 'PATCH', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ automationEnabled: config.automationEnabled, automationRules }),
			});
			setConfig(normalizeConfig(updated));
			showToast(t('ticketAutomation.saved'), 'success');
		}
		catch (saveError) { showToast(saveError.message, 'error'); }
		finally { setSaving(false); }
	};

	return (
		<div className="view automation-view">
			<div className="automation-header">
				<div><h1 className="view-title">{t('ticketAutomation.title')}</h1><p className="view-subtitle">{t('ticketAutomation.subtitle')}</p></div>
				<button className="btn" onClick={save} disabled={saving}><Save size={14} /> {saving ? t('settings.saving') : t('ticketAutomation.save')}</button>
			</div>
			<section className="panel automation-status">
				<div><h2><WandSparkles size={16} /> {t('ticketAutomation.engine')}</h2><p>{t('ticketAutomation.engineDescription')}</p></div>
				<label className="switch-row"><input type="checkbox" checked={config.automationEnabled} onChange={event => setConfig(current => ({ ...current, automationEnabled: event.target.checked }))} /><span>{t('ticketAutomation.enabled')}</span></label>
			</section>
			<div className="automation-rule-heading">
				<div><h2>{t('ticketAutomation.rules')}</h2><p>{t('ticketAutomation.ruleCount', { count: config.automationRules.length, max: config.automationLimits.maxRules })}</p></div>
				<button className="btn btn-secondary" onClick={addRule} disabled={config.automationRules.length >= config.automationLimits.maxRules}><Plus size={14} /> {t('ticketAutomation.addRule')}</button>
			</div>
			{config.automationRules.length === 0 && <section className="panel automation-empty"><Tags size={24} /><p>{t('ticketAutomation.noRules')}</p></section>}
			{config.automationRules.map((rule, index) => (
				<section className="panel automation-rule" key={rule.id}>
					<div className="automation-rule-title">
						<strong>{t('ticketAutomation.ruleNumber', { number: index + 1 })}</strong>
						<label className="switch-row"><input type="checkbox" checked={rule.enabled} onChange={event => updateRule(rule.id, 'enabled', event.target.checked)} /><span>{t('ticketAutomation.ruleEnabled')}</span></label>
						<button className="icon-btn danger" title={t('ticketAutomation.removeRule')} onClick={() => removeRule(rule.id)}><Trash2 size={15} /></button>
					</div>
					<div className="automation-grid">
						<label className="form-stack"><span className="form-label">{t('ticketAutomation.label')}</span><input className="form-input" value={rule.label} maxLength={50} onChange={event => updateRule(rule.id, 'label', event.target.value)} /></label>
						<label className="form-stack"><span className="form-label">{t('ticketAutomation.matchMode')}</span><select className="form-input form-select" value={rule.matchMode} onChange={event => updateRule(rule.id, 'matchMode', event.target.value)}><option value="keywords">{t('ticketAutomation.keywords')}</option><option value="regex">{t('ticketAutomation.regex')}</option></select></label>
					</div>
					<label className="form-stack automation-full"><span className="form-label">{rule.matchMode === 'regex' ? t('ticketAutomation.regexPattern') : t('ticketAutomation.keywordPattern')}</span><input className="form-input" value={rule.pattern} maxLength={config.automationLimits.maxPatternLength} placeholder={rule.matchMode === 'regex' ? 'refund|chargeback' : 'refund, charged twice, payment'} onChange={event => updateRule(rule.id, 'pattern', event.target.value)} /></label>
					<div className="automation-grid automation-actions-grid">
						<label className="form-stack"><span className="form-label">{t('ticketAutomation.category')}</span><select className="form-input form-select" value={rule.categoryId ?? ''} onChange={event => updateRule(rule.id, 'categoryId', event.target.value)}><option value="">{t('ticketAutomation.keepCategory')}</option>{config.categories.map(category => <option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
						<label className="form-stack"><span className="form-label">{t('ticketAutomation.priority')}</span><select className="form-input form-select" value={rule.priority ?? ''} onChange={event => updateRule(rule.id, 'priority', event.target.value)}><option value="">{t('ticketAutomation.keepPriority')}</option><option value="low">{t('settings.priorityLow')}</option><option value="medium">{t('settings.priorityMedium')}</option><option value="high">{t('settings.priorityHigh')}</option></select></label>
						<label className="form-stack"><span className="form-label">{t('ticketAutomation.tag')}</span><input className="form-input" value={rule.tag ?? ''} maxLength={30} onChange={event => updateRule(rule.id, 'tag', event.target.value)} /></label>
						<label className="form-stack"><span className="form-label">{t('ticketAutomation.assignRole')}</span><RoleSelect roles={resources.roles} value={rule.assignRoleId} onChange={value => updateRule(rule.id, 'assignRoleId', value)} /></label>
					</div>
					<label className="form-stack automation-full"><span className="form-label">{t('ticketAutomation.response')}</span><textarea className="form-input form-textarea" value={rule.response ?? ''} maxLength={1500} onChange={event => updateRule(rule.id, 'response', event.target.value)} /></label>
				</section>
			))}
		</div>
	);
}

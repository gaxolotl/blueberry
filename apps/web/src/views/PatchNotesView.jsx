import { Download, ExternalLink, GitFork, Pencil, Plus, Rss, Save, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Empty, Error, Loading } from '../components/State.jsx';
import { useToast } from '../components/Toast.jsx';
import { useI18n } from '../hooks/useI18n.jsx';
import { apiFetch } from '../utils/api.js';
import { useGuildResources } from '../hooks/useGuildResources.js';
import { ChannelSelect, RoleSelect } from '../components/DiscordResourceSelect.jsx';

const EMPTY_SOURCE = { type: 'rss', label: '', url: '', token: '' };

export default function PatchNotesView({ guildId }) {
	const { t } = useI18n();
	const { showToast } = useToast();
	const resources = useGuildResources(guildId);
	const [config, setConfig] = useState(null);
	const [source, setSource] = useState(EMPTY_SOURCE);
	const [editingSourceId, setEditingSourceId] = useState(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState(null);

	useEffect(() => {
		let cancelled = false;
		if (!guildId) return undefined;
		setLoading(true);
		setError(null);
		apiFetch(`/api/guilds/${guildId}/patch-notes-config`)
			.then(data => {
				if (!cancelled) setConfig(data);
			})
			.catch(fetchError => {
				if (!cancelled) setError(fetchError.message);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [guildId]);

	if (!guildId) return <Empty message={t('app.selectServer')} />;
	if (loading) return <Loading />;
	if (error) return <Error message={error} />;

	const rssCount = config.sources.filter(item => item.type === 'rss').length;
	const githubCount = config.sources.filter(item => item.type === 'github').length;
	const selectedCount = source.type === 'rss' ? rssCount : githubCount;
	const selectedLimit = source.type === 'rss' ? config.limits.maxRssFeeds : config.limits.maxGithubTrackers;

	const updateConfig = (key, value) => setConfig(current => ({ ...current, [key]: value }));
	const saveConfig = async () => {
		setSaving(true);
		try {
			const updated = await apiFetch(`/api/guilds/${guildId}/patch-notes-config`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					channelId: config.channelId || null,
					mentionRoleId: config.mentionRoleId || null,
					enabled: config.enabled,
					showDownloads: config.showDownloads,
					showChangelog: config.showChangelog,
				}),
			});
			setConfig(current => ({ ...current, ...updated }));
			showToast(t('patchNotes.saved'), 'success');
		}
		catch (saveError) {
			showToast(saveError.message, 'error');
		}
		finally {
			setSaving(false);
		}
	};

	const saveSource = async (event) => {
		event.preventDefault();
		setSaving(true);
		try {
			const path = editingSourceId
				? `/api/guilds/${guildId}/patch-notes-config/sources/${editingSourceId}`
				: `/api/guilds/${guildId}/patch-notes-config/sources`;
			const updated = await apiFetch(path, {
				method: editingSourceId ? 'PATCH' : 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(source),
			});
			setConfig(updated);
			setSource(EMPTY_SOURCE);
			setEditingSourceId(null);
			showToast(t(editingSourceId ? 'patchNotes.sourceUpdated' : 'patchNotes.sourceAdded'), 'success');
		}
		catch (addError) {
			showToast(addError.message, 'error');
		}
		finally {
			setSaving(false);
		}
	};

	const editSource = (item) => {
		setEditingSourceId(item.id);
		setSource({ type: item.type, label: item.label, url: item.url, token: '', enabled: item.enabled, hasToken: item.hasToken });
	};

	const cancelEdit = () => {
		setEditingSourceId(null);
		setSource(EMPTY_SOURCE);
	};

	const removeSource = async (sourceId) => {
		try {
			const updated = await apiFetch(`/api/guilds/${guildId}/patch-notes-config/sources/${sourceId}`, { method: 'DELETE' });
			setConfig(updated);
			if (editingSourceId === sourceId) cancelEdit();
			showToast(t('patchNotes.sourceRemoved'), 'success');
		}
		catch (removeError) {
			showToast(removeError.message, 'error');
		}
	};

	return (
		<div className="view patch-notes-view">
			<div className="patch-notes-header">
				<div>
					<h1 className="view-title">{t('patchNotes.title')}</h1>
					<p className="view-subtitle">{t('patchNotes.subtitle')}</p>
				</div>
				<button className="btn" onClick={saveConfig} disabled={saving}>
					<Save size={14} /> {saving ? t('settings.saving') : t('patchNotes.save')}
				</button>
			</div>

			<section className="panel patch-notes-settings">
				<div className="patch-notes-section-title">
					<h2>{t('patchNotes.publishing')}</h2>
					<label className="switch-row">
						<input type="checkbox" checked={config.enabled} onChange={event => updateConfig('enabled', event.target.checked)} />
						<span>{t('patchNotes.enabled')}</span>
					</label>
				</div>
				<div className="patch-notes-grid">
					<label className="form-stack">
						<span className="form-label">{t('patchNotes.channel')}</span>
						<ChannelSelect channels={resources.channels} value={config.channelId} onChange={value => updateConfig('channelId', value)} />
					</label>
					<label className="form-stack">
						<span className="form-label">{t('patchNotes.mentionRole')}</span>
						<RoleSelect roles={resources.roles} value={config.mentionRoleId} onChange={value => updateConfig('mentionRoleId', value)} />
					</label>
				</div>
				<div className="patch-notes-toggles">
					<label className="switch-row"><input type="checkbox" checked={config.showChangelog} onChange={event => updateConfig('showChangelog', event.target.checked)} /><span>{t('patchNotes.showChangelog')}</span></label>
					<label className="switch-row"><input type="checkbox" checked={config.showDownloads} onChange={event => updateConfig('showDownloads', event.target.checked)} /><span><Download size={14} /> {t('patchNotes.showDownloads')}</span></label>
				</div>
			</section>

			<section className="panel">
				<div className="patch-notes-section-title">
					<div>
						<h2>{t('patchNotes.sources')}</h2>
						<p>{t('patchNotes.sourceCounts', { rss: rssCount, maxRss: config.limits.maxRssFeeds, github: githubCount, maxGithub: config.limits.maxGithubTrackers })}</p>
					</div>
				</div>
				<div className="patch-source-list">
					{config.sources.length === 0 && <div className="patch-source-empty">{t('patchNotes.noSources')}</div>}
					{config.sources.map(item => {
						const Icon = item.type === 'github' ? GitFork : Rss;
						return (
							<div className="patch-source-row" key={item.id}>
								<div className={`patch-source-icon ${item.type}`}><Icon size={18} /></div>
								<div className="patch-source-details">
									<strong>{item.label}</strong>
									<a href={item.url} target="_blank" rel="noreferrer">{item.url} <ExternalLink size={11} /></a>
								</div>
								<span className="patch-source-type">{item.type === 'github' ? `GitHub · ${item.hasToken ? t('patchNotes.tokenSet') : t('patchNotes.tokenMissing')}` : 'RSS'}</span>
								<button className="icon-btn" title={t('patchNotes.edit')} onClick={() => editSource(item)}><Pencil size={15} /></button>
								<button className="icon-btn danger" title={t('patchNotes.remove')} onClick={() => removeSource(item.id)}><Trash2 size={15} /></button>
							</div>
						);
					})}
				</div>
			</section>

			<section className="panel">
				<div className="patch-notes-section-title">
					<h2 className="patch-add-title">{editingSourceId ? <Pencil size={16} /> : <Plus size={16} />} {t(editingSourceId ? 'patchNotes.editSource' : 'patchNotes.addSource')}</h2>
					{editingSourceId && <button className="icon-btn" title={t('patchNotes.cancelEdit')} onClick={cancelEdit}><X size={15} /></button>}
				</div>
				<form className="patch-source-form" onSubmit={saveSource}>
					<div className="source-type-control">
						<button disabled={Boolean(editingSourceId)} type="button" className={source.type === 'rss' ? 'active' : ''} onClick={() => setSource(current => ({ ...current, type: 'rss' }))}><Rss size={15} /> RSS</button>
						<button disabled={Boolean(editingSourceId)} type="button" className={source.type === 'github' ? 'active' : ''} onClick={() => setSource(current => ({ ...current, type: 'github' }))}><GitFork size={15} /> GitHub</button>
					</div>
					<div className="patch-notes-grid">
						<label className="form-stack"><span className="form-label">{t('patchNotes.label')}</span><input className="form-input" required maxLength={50} value={source.label} onChange={event => setSource(current => ({ ...current, label: event.target.value }))} /></label>
						<label className="form-stack"><span className="form-label">{t('patchNotes.url')}</span><input className="form-input" required type="url" value={source.url} placeholder={source.type === 'github' ? 'https://github.com/owner/repo' : 'https://example.com/feed.xml'} onChange={event => setSource(current => ({ ...current, url: event.target.value }))} /></label>
					</div>
					{source.type === 'github' && <label className="form-stack"><span className="form-label">{t('patchNotes.token')}</span><input className="form-input" required={!editingSourceId || !source.hasToken} type="password" autoComplete="off" value={source.token} placeholder={editingSourceId && source.hasToken ? t('patchNotes.keepToken') : ''} onChange={event => setSource(current => ({ ...current, token: event.target.value }))} /><span className="form-hint">{t('patchNotes.tokenHint')}</span></label>}
					{editingSourceId && <label className="switch-row patch-source-enabled"><input type="checkbox" checked={source.enabled !== false} onChange={event => setSource(current => ({ ...current, enabled: event.target.checked }))} /><span>{t('patchNotes.sourceEnabled')}</span></label>}
					<div className="patch-source-form-footer">
						<span>{editingSourceId ? t('patchNotes.editTokenNotice') : t('patchNotes.slotsAvailable', { count: Math.max(0, selectedLimit - selectedCount) })}</span>
						<button className="btn" disabled={saving || (!editingSourceId && selectedCount >= selectedLimit)}>{editingSourceId ? <Save size={14} /> : <Plus size={14} />} {t(editingSourceId ? 'patchNotes.update' : 'patchNotes.add')}</button>
					</div>
				</form>
			</section>
		</div>
	);
}

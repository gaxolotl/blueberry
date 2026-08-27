import { useCallback, useEffect, useState } from 'react';
import { Database, Pencil, Plus, Save, Terminal, Trash2, X, Play, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import { Empty, Error, Loading } from '../components/State.jsx';
import { useToast } from '../components/Toast.jsx';
import { useGuildResources } from '../hooks/useGuildResources.js';
import { useI18n } from '../hooks/useI18n.jsx';
import { apiFetch } from '../utils/api.js';
import { ResourceMultiSelect } from '../components/DiscordResourceSelect.jsx';
import TemplateEditor from '../components/TemplateEditor.jsx';

const TRIGGER_TYPES = ['command', 'startsWith', 'contains', 'regex', 'exactMatch', 'reaction', 'interval', 'crontab'];
const RESPONSE_MODES = ['text', 'embed', 'componentsV2'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const EMPTY = {
	name: '',
	enabled: true,
	triggerType: 'command',
	trigger: '',
	caseSensitive: false,
	editTrigger: false,
	responses: ['Edit this to change the output of the custom command!'],
	responseMode: 'componentsV2',
	groupId: null,
	restrictions: { allowRoleIds: [], denyRoleIds: [], allowChannelIds: [], denyChannelIds: [] },
	restrictionsEnabled: false,
	reactionAdded: true,
	reactionRemoved: false,
	interval: { unit: 'hours', value: 1, channelId: null, excludeHours: [], excludeWeekdays: [] },
	cron: { expression: '', channelId: null, excludeHours: [], excludeWeekdays: [] },
};

function triggerLabel(t, type) {
	return t(`customCommands.triggerType.${type}`);
}

function triggerSummary(t, command) {
	return t(`customCommands.triggerHint.${command.triggerType}`, { trigger: command.trigger || '—' });
}

function formatRunCount(command) {
	return command.runCount ?? 0;
}

export default function CustomCommandsView({ guildId }) {
	const { t } = useI18n();
	const { showToast } = useToast();
	const resources = useGuildResources(guildId);
	const [tab, setTab] = useState('commands');
	const [commands, setCommands] = useState(null);
	const [groups, setGroups] = useState(null);
	const [limits, setLimits] = useState(null);
	const [editing, setEditing] = useState(null);
	const [creating, setCreating] = useState(false);
	const [form, setForm] = useState(EMPTY);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState(null);
	const [expanded, setExpanded] = useState({});
	const [copied, setCopied] = useState(false);
	const [dbEntries, setDbEntries] = useState(null);
	const [dbSearch, setDbSearch] = useState('');
	const [groupForm, setGroupForm] = useState({ name: '', restrictions: EMPTY.restrictions });
	const [showGroupForm, setShowGroupForm] = useState(false);

	const load = useCallback(() => {
		if (!guildId) return;
		setLoading(true);
		setError(null);
		apiFetch(`/api/guilds/${guildId}/custom-commands`)
			.then(data => {
				setCommands(data.commands);
				setGroups(data.groups);
				setLimits(data.limits);
			})
			.catch(fetchError => setError(fetchError.message))
			.finally(() => setLoading(false));
	}, [guildId]);

	useEffect(() => {
		load();
	}, [load]);

	const loadDb = useCallback((search = '') => {
		if (!guildId) return;
		apiFetch(`/api/guilds/${guildId}/custom-commands/db?search=${encodeURIComponent(search)}`)
			.then(data => setDbEntries(data.entries))
			.catch(() => setDbEntries([]));
	}, [guildId]);

	useEffect(() => {
		if (tab === 'db') loadDb('');
	}, [tab, loadDb]);

	if (!guildId) return <Empty message={t('app.selectServer')} />;
	if (loading && tab === 'commands') return <Loading />;
	if (error && tab === 'commands') return <Error message={error} />;

	const beginCreate = () => {
		setCreating(true);
		setEditing(null);
		setForm(EMPTY);
		setShowGroupForm(false);
	};

	const beginEdit = (command) => {
		setCreating(false);
		setEditing(command.ccid);
		const restrictions = {
			allowRoleIds: command.restrictions?.allowRoleIds ?? [],
			denyRoleIds: command.restrictions?.denyRoleIds ?? [],
			allowChannelIds: command.restrictions?.allowChannelIds ?? [],
			denyChannelIds: command.restrictions?.denyChannelIds ?? [],
		};
		setForm({
			...EMPTY,
			...command,
			restrictions,
			restrictionsEnabled: Object.values(restrictions).some(list => list.length > 0),
		});
		setShowGroupForm(false);
	};

	const cancelEdit = () => {
		setCreating(false);
		setEditing(null);
		setForm(EMPTY);
	};

	const update = (key, value) => setForm(current => ({ ...current, [key]: value }));

	const updateRestriction = (key, value) => setForm(current => ({
		...current,
		restrictions: { ...current.restrictions, [key]: value },
	}));

	const updateResponse = (index, value) => setForm(current => ({
		...current,
		responses: current.responses.map((r, i) => i === index ? value : r),
	}));

	const addResponse = () => setForm(current => ({ ...current, responses: [...current.responses, ''] }));
	const removeResponse = (index) => setForm(current => ({ ...current, responses: current.responses.filter((_, i) => i !== index) }));

	const save = async (event) => {
		event.preventDefault();
		setSaving(true);
		try {
			const payload = JSON.parse(JSON.stringify(form));
			delete payload.restrictionsEnabled;
			if (payload.triggerType !== 'interval') delete payload.interval;
			if (payload.triggerType !== 'crontab') delete payload.cron;
			if (!payload.name) delete payload.name;

			const updated = await apiFetch(
				editing != null ? `/api/guilds/${guildId}/custom-commands/${editing}` : `/api/guilds/${guildId}/custom-commands`,
				{
					method: editing != null ? 'PATCH' : 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload),
				},
			);

			setCommands(current => {
				const existing = current ?? [];
				if (editing != null) return existing.map(item => item.ccid === editing ? updated : item);
				return [...existing, updated];
			});
			cancelEdit();
			showToast(t(editing != null ? 'customCommands.updated' : 'customCommands.added'), 'success');
		}
		catch (saveError) {
			showToast(saveError.message, 'error');
		}
		finally {
			setSaving(false);
		}
	};

	const remove = async (command) => {
		try {
			await apiFetch(`/api/guilds/${guildId}/custom-commands/${command.ccid}`, { method: 'DELETE' });
			setCommands(current => (current ?? []).filter(item => item.ccid !== command.ccid));
			if (editing === command.ccid) cancelEdit();
			showToast(t('customCommands.removed'), 'success');
		}
		catch (removeError) {
			showToast(removeError.message, 'error');
		}
	};

	const saveGroup = async (event) => {
		event.preventDefault();
		if (!groupForm.name.trim()) return;
		setSaving(true);
		try {
			const payload = { name: groupForm.name, restrictions: groupForm.restrictions };
			const created = await apiFetch(`/api/guilds/${guildId}/custom-commands/groups`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			});
			setGroups(current => [...(current ?? []), created]);
			setGroupForm({ name: '', restrictions: EMPTY.restrictions });
			setShowGroupForm(false);
			showToast(t('customCommands.groupAdded'), 'success');
		}
		catch (groupError) {
			showToast(groupError.message, 'error');
		}
		finally {
			setSaving(false);
		}
	};

	const removeGroup = async (group) => {
		try {
			await apiFetch(`/api/guilds/${guildId}/custom-commands/groups/${group._id}`, { method: 'DELETE' });
			setGroups(current => (current ?? []).filter(item => item._id !== group._id));
			setCommands(current => (current ?? []).map(item => item.groupId === group._id ? { ...item, groupId: null } : item));
			showToast(t('customCommands.groupRemoved'), 'success');
		}
		catch (removeError) {
			showToast(removeError.message, 'error');
		}
	};

	const validateTemplate = async (source) => {
		try {
			const result = await apiFetch(`/api/guilds/${guildId}/custom-commands/validate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ response: source }),
			});
			showToast(t('customCommands.validateOk'), 'success');
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
			return result;
		}
		catch (validateError) {
			showToast(validateError.message, 'error');
			return null;
		}
	};

	const copyResponse = (source) => {
		navigator.clipboard?.writeText(source);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

	const deleteDbEntry = async (entry) => {
		try {
			await apiFetch(`/api/guilds/${guildId}/custom-commands/db/${entry.ID}`, { method: 'DELETE' });
			setDbEntries(current => (current ?? []).filter(item => item.ID !== entry.ID));
			showToast(t('customCommands.dbRemoved'), 'success');
		}
		catch (dbError) {
			showToast(dbError.message, 'error');
		}
	};

	const groupName = (groupId) => groups?.find(g => g._id === groupId)?.name ?? null;

	return (
		<div className="view custom-commands-view">
			<div className="patch-notes-header">
				<div>
					<h1 className="view-title">{t('customCommands.title')}</h1>
					<p className="view-subtitle">{t('customCommands.subtitle')}</p>
				</div>
				<button className="btn" onClick={() => { if (tab === 'commands') { beginCreate(); } else if (tab === 'groups') { setShowGroupForm(true); } else { setTab('commands'); beginCreate(); } }}>
					<Plus size={14} />
					{tab === 'commands' ? t('customCommands.add') : tab === 'groups' ? t('customCommands.addGroup') : t('customCommands.add')}
				</button>
			</div>

			<div className="cc-docs">
				<span className="cc-docs-label">{t('customCommands.docs')}</span>
				<a href="https://help.yagpdb.xyz/docs/custom-commands/commands/" target="_blank" rel="noopener noreferrer">
					{t('customCommands.docsCommands')}
				</a>
				<a href="https://help.yagpdb.xyz/docs/reference/components-v2/" target="_blank" rel="noopener noreferrer">
					{t('customCommands.docsComponentsV2')}
				</a>
				<a href="https://help.yagpdb.xyz/docs/reference/custom-interactions/" target="_blank" rel="noopener noreferrer">
					{t('customCommands.docsInteractions')}
				</a>
				<a href="https://help.yagpdb.xyz/docs/reference/custom-embeds/" target="_blank" rel="noopener noreferrer">
					{t('customCommands.docsEmbeds')}
				</a>
			</div>

			<div className="cc-tabs">
				<button className={`cc-tab${tab === 'commands' ? ' active' : ''}`} onClick={() => setTab('commands')}><Terminal size={14} /> {t('customCommands.tabCommands')}</button>
				<button className={`cc-tab${tab === 'groups' ? ' active' : ''}`} onClick={() => setTab('groups')}>{t('customCommands.tabGroups')}</button>
				<button className={`cc-tab${tab === 'db' ? ' active' : ''}`} onClick={() => setTab('db')}><Database size={14} /> {t('customCommands.tabDb')}</button>
			</div>

			{tab === 'commands' && (
				<>
					{!creating && !editing && editing !== 0 && (
						<section className="panel">
							<div className="patch-notes-section-title">
								<div>
									<h2>{t('customCommands.list')}</h2>
									<p>{t('customCommands.count', { count: commands?.length ?? 0, max: limits?.maxCommands ?? 100 })}</p>
								</div>
							</div>
							<div className="announcement-list">
								{commands?.length === 0 && <div className="patch-source-empty"><Terminal size={16} /> {t('customCommands.empty')}</div>}
								{commands?.map(command => (
									<div className="announcement-row" key={command.ccid}>
										<div className={`patch-source-icon ${command.triggerType}`} onClick={() => setExpanded(current => ({ ...current, [command.ccid]: !current[command.ccid] }))}>
											{expanded[command.ccid] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
										</div>
										<div className="patch-source-details">
											<strong>
												<Terminal size={13} style={{ marginRight: 6 }} />
												{command.name || `#${command.ccid}`}
												{command.groupId && <span className="cc-group-badge">{groupName(command.groupId)}</span>}
											</strong>
											<span className="announcement-schedule">{triggerSummary(t, command)}</span>
											<span className="announcement-next">{t('customCommands.runCount', { count: formatRunCount(command) })}</span>
										</div>
										<span className="patch-source-type">{triggerLabel(t, command.triggerType)}</span>
										<span className={`announcement-status${command.enabled ? ' on' : ' off'}`}>{command.enabled ? t('customCommands.enabledShort') : t('customCommands.disabled')}</span>
										<button className="icon-btn" title={t('customCommands.edit')} onClick={() => beginEdit(command)}><Pencil size={15} /></button>
										<button className="icon-btn danger" title={t('customCommands.remove')} onClick={() => remove(command)}><Trash2 size={15} /></button>
									</div>
								))}
							</div>
						</section>
					)}

					{(creating || editing != null || editing === 0) && (
						<section className="panel">
							<div className="patch-notes-section-title">
								<h2 className="patch-add-title"><Pencil size={16} /> {t(creating ? 'customCommands.add' : 'customCommands.edit')}</h2>
								<button className="icon-btn" title={t('customCommands.cancel')} onClick={cancelEdit}><X size={15} /></button>
							</div>
							<form onSubmit={save}>
								<div className="patch-notes-grid">
									<label className="form-stack">
										<span className="form-label">{t('customCommands.name')}</span>
										<input className="form-input" placeholder={t('customCommands.namePlaceholder')} maxLength={limits?.maxNameLength ?? 100} value={form.name} onChange={event => update('name', event.target.value)} />
									</label>
									<label className="form-stack">
										<span className="form-label">{t('customCommands.group')}</span>
										<select className="form-input form-select" value={form.groupId ?? ''} onChange={event => update('groupId', event.target.value || null)}>
											<option value="">{t('customCommands.noGroup')}</option>
											{groups?.map(group => <option key={group._id} value={group._id}>{group.name}</option>)}
										</select>
									</label>
								</div>

								<div className="patch-notes-grid">
									<label className="form-stack">
										<span className="form-label">{t('customCommands.triggerType')}</span>
										<select className="form-input form-select" value={form.triggerType} onChange={event => update('triggerType', event.target.value)}>
											{TRIGGER_TYPES.map(type => <option key={type} value={type}>{triggerLabel(t, type)}</option>)}
										</select>
									</label>
									<label className="form-stack">
										<span className="form-label">{t('customCommands.trigger')}</span>
										<input className="form-input" required maxLength={limits?.maxTriggerLength ?? 1000} value={form.trigger} onChange={event => update('trigger', event.target.value)} />
										<span className="form-hint">{triggerSummary(t, form)}</span>
									</label>
								</div>

								{form.triggerType === 'reaction' && (
									<div className="cc-inline-toggles">
										<label className="switch-row">
											<input type="checkbox" checked={form.reactionAdded} onChange={event => update('reactionAdded', event.target.checked)} />
											<span>{t('customCommands.reactionAdded')}</span>
										</label>
										<label className="switch-row">
											<input type="checkbox" checked={form.reactionRemoved} onChange={event => update('reactionRemoved', event.target.checked)} />
											<span>{t('customCommands.reactionRemoved')}</span>
										</label>
									</div>
								)}

								{form.triggerType === 'command' && (
									<div className="cc-inline-toggles">
										<label className="switch-row">
											<input type="checkbox" checked={form.caseSensitive} onChange={event => update('caseSensitive', event.target.checked)} />
											<span>{t('customCommands.caseSensitive')}</span>
										</label>
									</div>
								)}

								{['command', 'startsWith', 'contains', 'regex', 'exactMatch'].includes(form.triggerType) && (
									<label className="switch-row">
										<input type="checkbox" checked={form.editTrigger} onChange={event => update('editTrigger', event.target.checked)} />
										<span>{t('customCommands.editTrigger')}</span>
									</label>
								)}

								{form.triggerType === 'interval' && (
									<div className="patch-notes-grid">
										<label className="form-stack">
											<span className="form-label">{t('customCommands.intervalValue')}</span>
											<input className="form-input" type="number" min="1" value={form.interval.value} onChange={event => update('interval', { ...form.interval, value: Number(event.target.value) })} />
										</label>
										<label className="form-stack">
											<span className="form-label">{t('customCommands.intervalUnit')}</span>
											<select className="form-input form-select" value={form.interval.unit} onChange={event => update('interval', { ...form.interval, unit: event.target.value })}>
												<option value="minutes">{t('customCommands.unit.minutes')}</option>
												<option value="hours">{t('customCommands.unit.hours')}</option>
											</select>
										</label>
										<label className="form-stack">
											<span className="form-label">{t('customCommands.channel')}</span>
											<select className="form-input form-select" value={form.interval.channelId ?? ''} onChange={event => update('interval', { ...form.interval, channelId: event.target.value || null })}>
												<option value="">{t('customCommands.noChannel')}</option>
												{resources.channels.map(channel => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}
											</select>
										</label>
									</div>
								)}

								{form.triggerType === 'crontab' && (
									<div className="patch-notes-grid">
										<label className="form-stack">
											<span className="form-label">{t('customCommands.cronExpression')}</span>
											<input className="form-input" placeholder="0 0 * * *" value={form.cron.expression} onChange={event => update('cron', { ...form.cron, expression: event.target.value })} />
											<span className="form-hint">{t('customCommands.cronHint')}</span>
										</label>
										<label className="form-stack">
											<span className="form-label">{t('customCommands.channel')}</span>
											<select className="form-input form-select" value={form.cron.channelId ?? ''} onChange={event => update('cron', { ...form.cron, channelId: event.target.value || null })}>
												<option value="">{t('customCommands.noChannel')}</option>
												{resources.channels.map(channel => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}
											</select>
										</label>
									</div>
								)}

								<div className="patch-notes-grid">
									<label className="form-stack">
										<span className="form-label">{t('customCommands.responseMode')}</span>
										<select className="form-input form-select" value={form.responseMode} onChange={event => update('responseMode', event.target.value)}>
											{RESPONSE_MODES.map(mode => <option key={mode} value={mode}>{t(`customCommands.responseMode.${mode}`)}</option>)}
										</select>
									</label>
								</div>

								<div className="cc-responses">
									<span className="form-label">{t('customCommands.responses')}</span>
									{form.responses.map((response, index) => (
								<div className="cc-response-row" key={index}>
									<TemplateEditor
										value={response}
										placeholder={t('customCommands.responsePlaceholder')}
										onChange={value => updateResponse(index, value)}
										maxLength={limits?.maxResponseLength ?? 10000}
									/>
									<div className="cc-response-actions">
										<button type="button" className="icon-btn" title={t('customCommands.validate')} onClick={() => validateTemplate(response)}><Check size={15} /></button>
										<button type="button" className="icon-btn" title={t('customCommands.copy')} onClick={() => copyResponse(response)}>{copied ? <Check size={15} /> : <Copy size={15} />}</button>
										{form.responses.length > 1 && (
											<button type="button" className="icon-btn danger" title={t('customCommands.removeResponse')} onClick={() => removeResponse(index)}><X size={15} /></button>
										)}
									</div>
								</div>
									))}
									<button type="button" className="btn btn-secondary" onClick={addResponse}><Plus size={14} /> {t('customCommands.addResponse')}</button>
								</div>

								<div className="cc-restrictions">
									<div className="cc-restrictions-head">
										<span className="form-label">{t('customCommands.restrictions')}</span>
										<label className="switch-row cc-restrictions-toggle">
											<input
												type="checkbox"
												checked={form.restrictionsEnabled ?? false}
												onChange={event => update('restrictionsEnabled', event.target.checked)}
											/>
											<span>{t('customCommands.restrictionsToggle')}</span>
										</label>
									</div>
								{form.restrictionsEnabled && (
									<div className="cc-restrictions-grid">
										<div className="form-stack">
											<span className="form-label">{t('customCommands.allowChannels')}</span>
											<ResourceMultiSelect
												kind="channel"
												options={resources.channels.map(c => ({ id: c.id, name: c.name, categoryName: c.parentName }))}
												value={form.restrictions.allowChannelIds}
												onChange={value => updateRestriction('allowChannelIds', value)}
											/>
										</div>
										<div className="form-stack">
											<span className="form-label">{t('customCommands.denyChannels')}</span>
											<ResourceMultiSelect
												kind="channel"
												options={resources.channels.map(c => ({ id: c.id, name: c.name, categoryName: c.parentName }))}
												value={form.restrictions.denyChannelIds}
												onChange={value => updateRestriction('denyChannelIds', value)}
											/>
										</div>
										<div className="form-stack">
											<span className="form-label">{t('customCommands.allowRoles')}</span>
											<ResourceMultiSelect
												kind="role"
												options={resources.roles.map(r => ({ id: r.id, name: r.name }))}
												value={form.restrictions.allowRoleIds}
												onChange={value => updateRestriction('allowRoleIds', value)}
											/>
										</div>
										<div className="form-stack">
											<span className="form-label">{t('customCommands.denyRoles')}</span>
											<ResourceMultiSelect
												kind="role"
												options={resources.roles.map(r => ({ id: r.id, name: r.name }))}
												value={form.restrictions.denyRoleIds}
												onChange={value => updateRestriction('denyRoleIds', value)}
											/>
										</div>
									</div>
								)}
							</div>

							<label className="switch-row announcements-enabled">
								<input type="checkbox" checked={form.enabled} onChange={event => update('enabled', event.target.checked)} />
								<span>{t('customCommands.enabled')}</span>
							</label>

								<div className="patch-source-form-footer">
									<span>{editing != null ? t('customCommands.editNotice') : t('customCommands.slots', { count: Math.max(0, (limits?.maxCommands ?? 100) - (commands?.length ?? 0)) })}</span>
									<button className="btn" disabled={saving}>{saving ? t('settings.saving') : <><Save size={14} /> {t('customCommands.save')}</>}</button>
								</div>
							</form>
						</section>
					)}
				</>
			)}

			{tab === 'groups' && (
				<section className="panel">
					<div className="patch-notes-section-title">
						<div>
							<h2>{t('customCommands.tabGroups')}</h2>
							<p>{t('customCommands.groupsHint')}</p>
						</div>
					</div>
					{showGroupForm && (
						<form className="cc-group-form" onSubmit={saveGroup}>
							<label className="form-stack">
								<span className="form-label">{t('customCommands.groupName')}</span>
								<input className="form-input" required maxLength={limits?.maxGroupNameLength ?? 100} value={groupForm.name} onChange={event => setGroupForm(current => ({ ...current, name: event.target.value }))} />
							</label>
							<button className="btn" disabled={saving}><Save size={14} /> {t('customCommands.saveGroup')}</button>
						</form>
					)}
					<div className="announcement-list">
						{groups?.length === 0 && <div className="patch-source-empty">{t('customCommands.groupsEmpty')}</div>}
						{groups?.map(group => (
							<div className="announcement-row" key={group._id}>
								<div className="patch-source-icon" style={{ marginRight: 0 }}><ChevronRight size={16} /></div>
								<div className="patch-source-details">
									<strong>{group.name}</strong>
									<span className="announcement-schedule">{t('customCommands.groupCommandCount', { count: commands?.filter(c => c.groupId === group._id).length ?? 0 })}</span>
								</div>
								<button className="icon-btn danger" title={t('customCommands.removeGroup')} onClick={() => removeGroup(group)}><Trash2 size={15} /></button>
							</div>
						))}
					</div>
				</section>
			)}

			{tab === 'db' && (
				<section className="panel">
					<div className="patch-notes-section-title">
						<div>
							<h2>{t('customCommands.tabDb')}</h2>
							<p>{t('customCommands.dbHint')}</p>
						</div>
					</div>
					<form className="cc-db-search" onSubmit={event => { event.preventDefault(); loadDb(dbSearch); }}>
						<input
							className="form-input"
							placeholder={t('customCommands.dbSearch')}
							value={dbSearch}
							onChange={event => setDbSearch(event.target.value)}
						/>
						<button className="btn" type="submit"><Play size={14} /> {t('customCommands.dbGo')}</button>
					</form>
					<div className="cc-db-list">
						{dbEntries?.length === 0 && <div className="patch-source-empty"><Database size={16} /> {t('customCommands.dbEmpty')}</div>}
						{dbEntries?.map(entry => (
							<div className="cc-db-row" key={entry.ID}>
								<code className="cc-db-key">{entry.Key}</code>
								<code className="cc-db-user">@{entry.UserID}</code>
								<code className="cc-db-value">{entry.Value != null ? String(entry.Value).slice(0, 80) : ''}</code>
								<button className="icon-btn danger" title={t('customCommands.remove')} onClick={() => deleteDbEntry(entry)}><Trash2 size={15} /></button>
							</div>
						))}
					</div>
				</section>
			)}
		</div>
	);
}
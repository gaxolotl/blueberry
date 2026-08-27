import { BellRing, CalendarDays, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ChannelSelect, RoleSelect } from '../components/DiscordResourceSelect.jsx';
import { Empty, Error, Loading } from '../components/State.jsx';
import { useToast } from '../components/Toast.jsx';
import { useGuildResources } from '../hooks/useGuildResources.js';
import { useI18n } from '../hooks/useI18n.jsx';
import { apiFetch } from '../utils/api.js';
import ComponentsV2Editor from '../components/componentsV2/ComponentsV2Editor.jsx';

const FREQUENCIES = ['daily', 'weekly', 'monthly'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const VARIABLES_HINT = 'announcements.variables';

const EMPTY = {
	label: '',
	channelId: null,
	enabled: true,
	mentionRoleId: null,
	message: '',
	template: null,
	frequency: 'daily',
	hour: 12,
	minute: 0,
	weekday: 1,
	dayOfMonth: 1,
	utcOffsetMinutes: 0,
};

function frequencyLabel(t, frequency) {
	return t(`announcements.frequency.${frequency}`);
}

function scheduleSummary(t, announcement) {
	if (announcement.frequency === 'daily') {
		return t('announcements.schedule.daily', { time: `${String(announcement.hour).padStart(2, '0')}:${String(announcement.minute).padStart(2, '0')}` });
	}
	if (announcement.frequency === 'weekly') {
		return t('announcements.schedule.weekly', { day: WEEKDAYS[announcement.weekday], time: `${String(announcement.hour).padStart(2, '0')}:${String(announcement.minute).padStart(2, '0')}` });
	}
	return t('announcements.schedule.monthly', { day: announcement.dayOfMonth, time: `${String(announcement.hour).padStart(2, '0')}:${String(announcement.minute).padStart(2, '0')}` });
}

function formatNextRun(nextRunAt) {
	if (!nextRunAt) return '—';
	const date = new Date(nextRunAt);
	return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AnnouncementsView({ guildId }) {
	const { t } = useI18n();
	const { showToast } = useToast();
	const resources = useGuildResources(guildId);
	const [announcements, setAnnouncements] = useState(null);
	const [limits, setLimits] = useState(null);
	const [editing, setEditing] = useState(null);
	const [form, setForm] = useState(EMPTY);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState(null);

	useEffect(() => {
		let cancelled = false;
		if (!guildId) return undefined;
		setLoading(true);
		setError(null);
		apiFetch(`/api/guilds/${guildId}/announcements`)
			.then(data => {
				if (!cancelled) {
					setAnnouncements(data.announcements);
					setLimits(data.limits);
				}
			})
			.catch(fetchError => {
				if (!cancelled) setError(fetchError.message);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => { cancelled = true; };
	}, [guildId]);

	if (!guildId) return <Empty message={t('app.selectServer')} />;
	if (loading) return <Loading />;
	if (error) return <Error message={error} />;

	const beginCreate = () => {
		setEditing(null);
		setForm(EMPTY);
	};

	const beginEdit = (announcement) => {
		setEditing(announcement._id);
		setForm({
			label: announcement.label,
			channelId: announcement.channelId,
			enabled: announcement.enabled,
			mentionRoleId: announcement.mentionRoleId,
			message: announcement.message,
			template: announcement.template,
			frequency: announcement.frequency,
			hour: announcement.hour,
			minute: announcement.minute,
			weekday: announcement.weekday,
			dayOfMonth: announcement.dayOfMonth,
			utcOffsetMinutes: announcement.utcOffsetMinutes,
		});
	};

	const cancelEdit = () => {
		setEditing(null);
		setForm(EMPTY);
	};

	const update = (key, value) => setForm(current => ({ ...current, [key]: value }));

	const save = async (event) => {
		event.preventDefault();
		setSaving(true);
		try {
			const payload = { ...form };
			if (form.frequency !== 'weekly') delete payload.weekday;
			if (form.frequency !== 'monthly') delete payload.dayOfMonth;

			const updated = await apiFetch(
				editing ? `/api/guilds/${guildId}/announcements/${editing}` : `/api/guilds/${guildId}/announcements`,
				{
					method: editing ? 'PATCH' : 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload),
				},
			);

			setAnnouncements(current => {
				const existing = current ?? [];
				if (editing) return existing.map(item => item._id === editing ? updated : item);
				return [...existing, updated];
			});
			cancelEdit();
			showToast(t(editing ? 'announcements.updated' : 'announcements.added'), 'success');
		}
		catch (saveError) {
			showToast(saveError.message, 'error');
		}
		finally {
			setSaving(false);
		}
	};

	const remove = async (announcement) => {
		try {
			await apiFetch(`/api/guilds/${guildId}/announcements/${announcement._id}`, { method: 'DELETE' });
			setAnnouncements(current => (current ?? []).filter(item => item._id !== announcement._id));
			if (editing === announcement._id) cancelEdit();
			showToast(t('announcements.removed'), 'success');
		}
		catch (removeError) {
			showToast(removeError.message, 'error');
		}
	};

	return (
		<div className="view announcements-view">
			<div className="patch-notes-header">
				<div>
					<h1 className="view-title">{t('announcements.title')}</h1>
					<p className="view-subtitle">{t('announcements.subtitle')}</p>
				</div>
				<button className="btn" onClick={beginCreate}><Plus size={14} /> {t('announcements.add')}</button>
			</div>

			<section className="panel">
				<div className="patch-notes-section-title">
					<h2 className="patch-add-title">{editing ? <Pencil size={16} /> : <Plus size={16} />} {t(editing ? 'announcements.edit' : 'announcements.add')}</h2>
					{editing && <button className="icon-btn" title={t('announcements.cancel')} onClick={cancelEdit}><X size={15} /></button>}
				</div>
					<form onSubmit={save}>
						<div className="patch-notes-grid">
							<label className="form-stack">
								<span className="form-label">{t('announcements.label')}</span>
								<input className="form-input" required maxLength={limits.maxLabelLength} value={form.label} onChange={event => update('label', event.target.value)} />
							</label>
							<label className="form-stack">
								<span className="form-label">{t('announcements.channel')}</span>
								<ChannelSelect channels={resources.channels} value={form.channelId} onChange={value => update('channelId', value || null)} />
							</label>
						</div>

						<div className="patch-notes-grid">
							<label className="form-stack">
								<span className="form-label">{t('announcements.frequency.label')}</span>
								<select className="form-input form-select" value={form.frequency} onChange={event => update('frequency', event.target.value)}>
									{FREQUENCIES.map(frequency => <option key={frequency} value={frequency}>{frequencyLabel(t, frequency)}</option>)}
								</select>
							</label>
							<label className="form-stack">
								<span className="form-label">{t('announcements.time')}</span>
								<input className="form-input" type="time" value={`${String(form.hour).padStart(2, '0')}:${String(form.minute).padStart(2, '0')}`} onChange={event => {
									const [hour, minute] = event.target.value.split(':').map(Number);
									update('hour', hour);
									update('minute', minute);
								}} />
							</label>
						</div>

						{form.frequency === 'weekly' && (
							<div className="form-stack">
								<span className="form-label">{t('announcements.weekday')}</span>
								<div className="announcement-weekdays">
									{WEEKDAYS.map((day, index) => (
										<label key={day} className={`announcement-weekday${form.weekday === index ? ' active' : ''}`}>
											<input type="radio" name="weekday" checked={form.weekday === index} onChange={() => update('weekday', index)} />
											<span>{day}</span>
										</label>
									))}
								</div>
							</div>
						)}

						{form.frequency === 'monthly' && (
							<div className="patch-notes-grid">
								<label className="form-stack">
									<span className="form-label">{t('announcements.dayOfMonth')}</span>
									<input className="form-input" type="number" min="1" max="31" value={form.dayOfMonth} onChange={event => update('dayOfMonth', Number(event.target.value))} />
								</label>
							</div>
						)}

						<div className="patch-notes-grid">
							<label className="form-stack">
								<span className="form-label">{t('announcements.mentionRole')}</span>
								<RoleSelect roles={resources.roles} value={form.mentionRoleId} onChange={value => update('mentionRoleId', value || null)} />
							</label>
							<label className="form-stack">
								<span className="form-label">{t('announcements.utcOffset')}</span>
								<input className="form-input" type="number" min="-720" max="840" value={form.utcOffsetMinutes} onChange={event => update('utcOffsetMinutes', Number(event.target.value))} />
								<span className="form-hint">{t('announcements.utcOffsetHint')}</span>
							</label>
						</div>

						{!form.template && (
							<label className="form-stack announcements-message">
								<span className="form-label">{t('announcements.message')}</span>
								<textarea className="form-input form-textarea" maxLength={limits.maxMessageLength} value={form.message} onChange={event => update('message', event.target.value)} />
								<span className="form-hint">{t(VARIABLES_HINT)}</span>
							</label>
						)}
						<ComponentsV2Editor value={form.template} fallbackMessage={form.message} onChange={value => update('template', value)} variablesHint={t(VARIABLES_HINT)} limits={{ maxContainers: 4, maxBlocksPerContainer: 10 }} />

						<label className="switch-row announcements-enabled">
							<input type="checkbox" checked={form.enabled} onChange={event => update('enabled', event.target.checked)} />
							<span>{t('announcements.enabled')}</span>
						</label>

						<div className="patch-source-form-footer">
							<span>{editing ? t('announcements.editNotice') : t('announcements.slots', { count: Math.max(0, limits.maxAnnouncements - (announcements?.length ?? 0)) })}</span>
							<button className="btn" disabled={saving}><Save size={14} /> {saving ? t('settings.saving') : t(editing ? 'announcements.save' : 'announcements.add')}</button>
						</div>
					</form>
				</section>

			<section className="panel">
				<div className="patch-notes-section-title">
					<div>
						<h2>{t('announcements.list')}</h2>
						<p>{t('announcements.count', { count: announcements?.length ?? 0, max: limits.maxAnnouncements })}</p>
					</div>
				</div>
				<div className="announcement-list">
					{announcements?.length === 0 && <div className="patch-source-empty"><BellRing size={16} /> {t('announcements.empty')}</div>}
					{announcements?.map(item => (
						<div className="announcement-row" key={item._id}>
							<div className={`patch-source-icon ${item.frequency}`}><CalendarDays size={18} /></div>
							<div className="patch-source-details">
								<strong>{item.label}</strong>
								<span className="announcement-schedule">{scheduleSummary(t, item)}</span>
								<span className="announcement-next">{t('announcements.nextRun', { time: formatNextRun(item.nextRunAt) })}</span>
							</div>
							<span className="patch-source-type">{item.channelId ? `#${resources.channels.find(channel => channel.id === item.channelId)?.name ?? item.channelId}` : t('announcements.noChannel')}</span>
							<span className={`announcement-status${item.enabled ? ' on' : ' off'}`}>{item.enabled ? t('announcements.enabledShort') : t('announcements.disabled')}</span>
							<button className="icon-btn" title={t('announcements.edit')} onClick={() => beginEdit(item)}><Pencil size={15} /></button>
							<button className="icon-btn danger" title={t('announcements.remove')} onClick={() => remove(item)}><Trash2 size={15} /></button>
						</div>
					))}
				</div>
			</section>
		</div>
	);
}
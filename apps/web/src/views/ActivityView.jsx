import { BarChart3, CalendarDays, Clock, MessageSquare, TrendingUp, UserMinus, UserPlus, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Empty, Error, Loading } from '../components/State.jsx';
import { useI18n } from '../hooks/useI18n.jsx';
import { userAvatarUrl } from '../utils/discord.js';

const PERIODS = ['day', 'week', 'month', 'year'];
const PERIOD_ICONS = { day: Clock, week: CalendarDays, month: CalendarDays, year: CalendarDays };

function authHeaders() {
	const token = localStorage.getItem('bb_token');
	return token ? { Authorization: `Bearer ${token}` } : {};
}

function fmt(value) {
	return value === null || value === undefined || value === '' ? '—' : value;
}

function fmtPercent(value) {
	return value === null || value === undefined ? '—' : `${value}%`;
}

function fmtDays(value) {
	return value === null || value === undefined ? '—' : `${value}d`;
}

function StatCard({ label, value, Icon }) {
	return (
		<div className="stat-card">
			<div className="stat-card-header">
				<Icon size={16} className="stat-card-icon" />
				<span className="stat-card-label">{label}</span>
			</div>
			<span className="stat-card-value">{value}</span>
		</div>
	);
}

function MemberCell({ id, tag, avatar }) {
	const avatarUrl = userAvatarUrl({ id, avatar });
	return (
		<span className="cell-with-icon">
			{avatarUrl ? <img className="cell-avatar" src={avatarUrl} alt="" /> : <UserPlus size={13} />}
			<span className="cell-with-icon-text">{fmt(tag)}</span>
		</span>
	);
}

export default function ActivityView({ guildId }) {
	const { t } = useI18n();
	const [period, setPeriod] = useState('week');
	const [stats, setStats] = useState(null);
	const [retention, setRetention] = useState(null);
	const [chartUrl, setChartUrl] = useState(null);
	const [retentionChartUrl, setRetentionChartUrl] = useState(null);
	const [loading, setLoading] = useState(true);
	const [imageLoading, setImageLoading] = useState(true);
	const [error, setError] = useState(null);

	useEffect(() => {
		let cancelled = false;
		let activityObjectUrl = null;
		let retentionObjectUrl = null;
		if (!guildId) return undefined;

		setLoading(true);
		setError(null);
		setStats(null);
		setRetention(null);
		setChartUrl(null);
		setRetentionChartUrl(null);
		setImageLoading(true);

		async function load() {
			try {
				const [statsRes, retentionRes] = await Promise.all([
					fetch(`/api/guilds/${guildId}/activity?period=${period}`, { headers: authHeaders() }),
					fetch(`/api/guilds/${guildId}/retention?period=${period}`, { headers: authHeaders() }),
				]);
				if (!statsRes.ok) {
					const data = await statsRes.json().catch(() => null);
					throw new Error(data?.error ?? `Request failed: ${statsRes.status}`);
				}
				if (!retentionRes.ok) {
					const data = await retentionRes.json().catch(() => null);
					throw new Error(data?.error ?? `Request failed: ${retentionRes.status}`);
				}
				const [statsData, retentionData] = await Promise.all([statsRes.json(), retentionRes.json()]);
				if (!cancelled) {
					setStats(statsData);
					setRetention(retentionData);
				}
			}
			catch (loadError) {
				if (!cancelled) setError(loadError.message);
			}
			finally {
				if (!cancelled) setLoading(false);
			}

			try {
				const [activityRes, retentionRes] = await Promise.all([
					fetch(`/api/guilds/${guildId}/activity/chart?period=${period}`, { headers: authHeaders() }),
					fetch(`/api/guilds/${guildId}/retention/chart?period=${period}`, { headers: authHeaders() }),
				]);
				if (activityRes.ok) {
					const blob = await activityRes.blob();
					if (!cancelled) {
						activityObjectUrl = URL.createObjectURL(blob);
						setChartUrl(activityObjectUrl);
					}
				}
				if (retentionRes.ok) {
					const blob = await retentionRes.blob();
					if (!cancelled) {
						retentionObjectUrl = URL.createObjectURL(blob);
						setRetentionChartUrl(retentionObjectUrl);
					}
				}
			}
			catch {
				// charts stay empty on failure
			}
			finally {
				if (!cancelled) setImageLoading(false);
			}
		}

		load();

		return () => {
			cancelled = true;
			if (activityObjectUrl) URL.revokeObjectURL(activityObjectUrl);
			if (retentionObjectUrl) URL.revokeObjectURL(retentionObjectUrl);
		};
	}, [guildId, period]);

	if (!guildId) return <Empty message={t('app.selectServer')} />;
	if (loading) return <Loading />;
	if (error) return <Error message={error} />;

	return (
		<div className="view activity-view">
			<div className="patch-notes-header">
				<div>
					<h1 className="view-title">{t('activity.title')}</h1>
					<p className="view-subtitle">{t('activity.subtitle')}</p>
				</div>
				<div className="activity-periods">
					{PERIODS.map(key => {
						const Icon = PERIOD_ICONS[key];
						return (
							<button key={key} className={`activity-period${period === key ? ' active' : ''}`} onClick={() => setPeriod(key)}>
								<Icon size={14} /> {t(`activity.period.${key}`)}
							</button>
						);
					})}
				</div>
			</div>

			<div className="stat-grid">
				<StatCard label={t('activity.totalMessages')} value={stats?.totalMessages ?? 0} Icon={MessageSquare} />
				<StatCard label={t('activity.activeMembers')} value={stats?.activeMembers ?? 0} Icon={Users} />
				<StatCard label={t('activity.peak')} value={stats?.peak?.value ?? 0} Icon={BarChart3} />
				<StatCard label={t('activity.peakTime')} value={stats?.peak?.label ?? '—'} Icon={Clock} />
			</div>

			<section className="panel">
				<h2 className="panel-title">
					<BarChart3 size={16} className="panel-title-icon" />
					{t('activity.chartTitle')}
				</h2>
				{imageLoading ? (
					<Loading />
				) : chartUrl ? (
					<div className="activity-chart-frame">
						<img src={chartUrl} alt={t('activity.chartTitle')} className="activity-chart-img" />
					</div>
				) : (
					<div className="patch-source-empty">{t('activity.emptyChart')}</div>
				)}
			</section>

			<section className="panel">
				<h2 className="panel-title">
					<Users size={16} className="panel-title-icon" />
					{t('activity.topMembers')}
				</h2>
				{!stats?.topMembers?.length ? (
					<div className="patch-source-empty">{t('activity.noMembers')}</div>
				) : (
					<table className="table">
						<thead>
							<tr>
								<th>#</th>
								<th>{t('activity.member')}</th>
								<th>{t('activity.messages')}</th>
							</tr>
						</thead>
						<tbody>
							{stats.topMembers.map((member, index) => (
								<tr key={member.userId}>
									<td>{index + 1}</td>
									<td><MemberCell id={member.userId} tag={member.tag} avatar={null} /></td>
									<td>{member.count}</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</section>

			<section className="panel">
				<h2 className="panel-title">
					<TrendingUp size={16} className="panel-title-icon" />
					{t('retention.title')}
				</h2>
				<div className="stat-grid">
					<StatCard label={t('retention.joins')} value={retention?.totalJoins ?? 0} Icon={UserPlus} />
					<StatCard label={t('retention.leaves')} value={retention?.totalLeaves ?? 0} Icon={UserMinus} />
					<StatCard label={t('retention.netGrowth')} value={(retention?.netGrowth ?? 0) > 0 ? `+${retention.netGrowth}` : retention?.netGrowth ?? 0} Icon={TrendingUp} />
					<StatCard label={t('retention.retention7')} value={fmtPercent(retention?.retention7)} Icon={UserPlus} />
					<StatCard label={t('retention.retention30')} value={fmtPercent(retention?.retention30)} Icon={UserPlus} />
				</div>
				<div className="stat-grid">
					<StatCard label={t('retention.avgAccountAge')} value={fmtDays(retention?.avgAccountAge)} Icon={Users} />
					<StatCard label={t('retention.newAccountJoins')} value={retention?.newAccountJoins ?? 0} Icon={UserPlus} />
					<StatCard label={t('retention.botJoins')} value={retention?.botJoins ?? 0} Icon={UserPlus} />
					<StatCard label={t('retention.avgTenure')} value={fmtDays(retention?.avgTenureDays)} Icon={Clock} />
				</div>

				{imageLoading ? (
					<Loading />
				) : retentionChartUrl ? (
					<div className="activity-chart-frame">
						<img src={retentionChartUrl} alt={t('retention.chartTitle')} className="activity-chart-img" />
					</div>
				) : (
					<div className="patch-source-empty">{t('retention.emptyChart')}</div>
				)}

				{retention?.recentLeaves?.length > 0 && (
					<table className="table retention-leaves-table">
						<thead>
							<tr>
								<th>{t('retention.member')}</th>
								<th>{t('retention.leftAt')}</th>
								<th>{t('retention.duration')}</th>
								<th>{t('retention.accountAge')}</th>
								<th>{t('retention.type')}</th>
							</tr>
						</thead>
						<tbody>
							{retention.recentLeaves.map(leave => (
								<tr key={`${leave.memberId}-${leave.leftAt}`}>
									<td><MemberCell id={leave.memberId} tag={leave.memberTag} avatar={leave.memberAvatar} /></td>
									<td>{new Date(leave.leftAt).toLocaleString()}</td>
									<td>{fmtDays(leave.durationDays)}</td>
									<td>{fmtDays(leave.accountAgeDays)}</td>
									<td>{leave.isBot ? t('retention.bot') : t('retention.human')}</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</section>
		</div>
	);
}
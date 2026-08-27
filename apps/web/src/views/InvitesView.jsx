import { Calendar, Hash, Link2, Repeat, Trophy, User, UserPlus, Users } from 'lucide-react';
import { useApi } from '../hooks/useApi.js';
import { useI18n } from '../hooks/useI18n.jsx';
import { Loading, Error, Empty } from '../components/State.jsx';
import { userAvatarUrl } from '../utils/discord.js';

function formatDate(value) {
	if (!value) return '—';
	return new Date(value).toLocaleString();
}

function fmt(value) {
	return value === 'unknown' || value === null || value === undefined || value === '' ? '—' : value;
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
			{avatarUrl ? <img className="cell-avatar" src={avatarUrl} alt="" /> : <User size={13} />}
			<span className="cell-with-icon-text">{fmt(tag)}</span>
			<span className="cell-id">`{id}`</span>
		</span>
	);
}

export default function InvitesView({ guildId }) {
	const { t } = useI18n();
	const invites = useApi(guildId ? `/api/guilds/${guildId}/invites?limit=200` : null);
	const stats = useApi(guildId ? `/api/guilds/${guildId}/invites/stats` : null);

	if (!guildId) return <Empty message={t('app.selectServer')} />;
	if (invites.loading || stats.loading) return <Loading />;
	if (invites.error) return <Error message={invites.error} />;

	const topInvites = stats.data?.topInvites ?? [];
	const topInviters = stats.data?.topInviters ?? [];

	return (
		<div className="view">
			<h1 className="view-title">{t('invites.title')}</h1>

			{stats.data && (
				<div className="stat-grid">
					<StatCard label={t('invites.total')} value={stats.data.total ?? 0} Icon={UserPlus} />
					<StatCard label={t('invites.known')} value={stats.data.known ?? 0} Icon={Link2} />
					<StatCard label={t('invites.unknown')} value={stats.data.unknown ?? 0} Icon={UserPlus} />
					<StatCard label={t('invites.vanity')} value={stats.data.vanity ?? 0} Icon={Trophy} />
					<StatCard label={t('invites.last7')} value={stats.data.last7Days ?? 0} Icon={Calendar} />
					<StatCard label={t('invites.last30')} value={stats.data.last30Days ?? 0} Icon={Calendar} />
				</div>
			)}

			{invites.data?.length === 0 ? (
				<Empty message={t('invites.noInvites')} />
			) : (
				<table className="table">
					<thead>
						<tr>
							<th>{t('invites.member')}</th>
							<th>{t('invites.inviteCode')}</th>
							<th>{t('invites.inviter')}</th>
							<th>{t('invites.channel')}</th>
							<th>{t('invites.uses')}</th>
							<th>{t('invites.joined')}</th>
						</tr>
					</thead>
					<tbody>
						{invites.data?.map((join) => (
							<tr key={join._id}>
								<td>
									<MemberCell id={join.memberId} tag={join.memberTag} avatar={join.memberAvatar} />
								</td>
								<td>
									<span className="cell-with-icon">
										<Link2 size={13} />
										{join.vanityUrlJoin === true ? (
											<a href={join.inviteLink} target="_blank" rel="noreferrer">{fmt(join.inviteCode)}</a>
										) : join.inviteCode === 'unknown' ? (
											t('invites.unknownJoin')
										) : (
											<a href={join.inviteLink} target="_blank" rel="noreferrer">{join.inviteCode}</a>
										)}
									</span>
								</td>
								<td>
									<MemberCell id={join.inviterId} tag={join.inviterTag} avatar={join.inviterAvatar} />
								</td>
								<td>
									<span className="cell-with-icon">
										<Hash size={13} />
										{fmt(join.channel)}
									</span>
								</td>
								<td>
									<span className="cell-with-icon">
										<Repeat size={13} />
										{fmt(join.uses)} {join.maxUses !== 'unknown' && join.maxUses !== null && `/${join.maxUses}`}
									</span>
								</td>
								<td>
									<span className="cell-with-icon">
										<Calendar size={13} />
										{formatDate(join.joinedAt)}
									</span>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}

			{(topInvites.length > 0 || topInviters.length > 0) && (
				<div className="invite-stats-grid">
					{topInvites.length > 0 && (
						<section className="panel">
							<h2 className="panel-title">
								<Link2 size={16} className="panel-title-icon" />
								{t('invites.topInvites')}
							</h2>
							<table className="table">
								<thead>
									<tr>
										<th>{t('invites.inviteCode')}</th>
										<th>{t('invites.joinsCount')}</th>
									</tr>
								</thead>
								<tbody>
									{topInvites.map((item) => (
										<tr key={item._id}>
											<td>{item._id}</td>
											<td>{item.count}</td>
										</tr>
									))}
								</tbody>
							</table>
						</section>
					)}
					{topInviters.length > 0 && (
						<section className="panel">
							<h2 className="panel-title">
								<Users size={16} className="panel-title-icon" />
								{t('invites.topInviters')}
							</h2>
							<table className="table">
								<thead>
									<tr>
										<th>{t('invites.inviter')}</th>
										<th>{t('invites.joinsCount')}</th>
									</tr>
								</thead>
								<tbody>
									{topInviters.map((item) => (
										<tr key={item._id}>
											<td>
												<MemberCell id={item._id} tag={item.tag} avatar={null} />
											</td>
											<td>{item.count}</td>
										</tr>
									))}
								</tbody>
							</table>
						</section>
					)}
				</div>
			)}
		</div>
	);
}
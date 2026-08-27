import { BarChart3, CalendarClock, Hash, MessageSquare, Ticket, TicketX, Trophy, UserPlus, Users } from 'lucide-react';
import { useApi } from '../hooks/useApi.js';
import { useI18n } from '../hooks/useI18n.jsx';
import { Loading, Error, Empty } from '../components/State.jsx';
import { guildIconUrl, userAvatarUrl } from '../utils/discord.js';

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
			<span className="cell-with-icon-text">{tag ?? id}</span>
		</span>
	);
}

export default function OverviewView({ guildId, guild }) {
	const { t } = useI18n();
	const guildData = useApi(guildId ? `/api/guilds/${guildId}` : null);
	const ticketStats = useApi(guildId ? `/api/guilds/${guildId}/tickets/stats` : null);
	const inviteStats = useApi(guildId ? `/api/guilds/${guildId}/invites/stats` : null);
	const activity = useApi(guildId ? `/api/guilds/${guildId}/activity?period=week` : null);
	const announcements = useApi(guildId ? `/api/guilds/${guildId}/announcements` : null);

	if (!guildId) return <Empty message={t('app.selectServer')} />;
	if (guildData.loading || ticketStats.loading || inviteStats.loading || activity.loading || announcements.loading) return <Loading />;
	if (guildData.error) return <Error message={guildData.error} />;

	const iconUrl = guildIconUrl(guild);
	const topInvites = inviteStats.data?.topInvites ?? [];
	const topInviters = inviteStats.data?.topInviters ?? [];
	const topMembers = activity.data?.topMembers ?? [];
	const channels = activity.data?.channelBreakdown ?? [];
	const enabledAnnouncements = (announcements.data?.announcements ?? []).filter(item => item.enabled).length;

	return (
		<div className="view">
			<div className="guild-header">
				{iconUrl ? (
					<img className="guild-header-icon" src={iconUrl} alt="" />
				) : (
					<span className="guild-header-fallback">{guild?.name?.charAt(0) ?? '?'}</span>
				)}
				<div className="guild-header-text">
					<h1 className="view-title">{guild?.name ?? t('overview.title')}</h1>
					<p className="view-subtitle">
						{t('overview.server', { id: guildId })}
						<span className="guild-header-lang">
							{t('overview.language')}: {guildData.data?.language ?? 'en'}
						</span>
					</p>
				</div>
			</div>

			<div className="stat-grid">
				<StatCard label={t('overview.openTickets')} value={ticketStats.data?.open ?? 0} Icon={Ticket} />
				<StatCard label={t('overview.totalTickets')} value={ticketStats.data?.total ?? 0} Icon={TicketX} />
				<StatCard label={t('overview.totalInvites')} value={inviteStats.data?.total ?? 0} Icon={UserPlus} />
				<StatCard label={t('overview.messagesWeek')} value={activity.data?.totalMessages ?? 0} Icon={MessageSquare} />
				<StatCard label={t('overview.activeMembers')} value={activity.data?.activeMembers ?? 0} Icon={Users} />
				<StatCard label={t('overview.peak')} value={activity.data?.peak?.value ?? 0} Icon={BarChart3} />
				<StatCard label={t('overview.announcements')} value={`${enabledAnnouncements}/${announcements.data?.announcements?.length ?? 0}`} Icon={CalendarClock} />
			</div>

			{(topInvites.length > 0 || topInviters.length > 0) && (
				<div className="invite-stats-grid">
					{topInvites.length > 0 && (
						<section className="panel">
							<h2 className="panel-title">
								<Trophy size={16} className="panel-title-icon" />
								{t('overview.topInvites')}
							</h2>
							<table className="table">
								<thead>
									<tr>
										<th>{t('overview.inviteCode')}</th>
										<th>{t('overview.uses')}</th>
									</tr>
								</thead>
								<tbody>
									{topInvites.slice(0, 6).map((invite) => (
										<tr key={invite._id}>
											<td>{invite._id}</td>
											<td>{invite.count}</td>
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
								{t('overview.topInviters')}
							</h2>
							<table className="table">
								<thead>
									<tr>
										<th>{t('overview.inviter')}</th>
										<th>{t('overview.uses')}</th>
									</tr>
								</thead>
								<tbody>
									{topInviters.slice(0, 6).map((inviter) => (
										<tr key={inviter._id}>
											<td><MemberCell id={inviter._id} tag={inviter.tag} avatar={null} /></td>
											<td>{inviter.count}</td>
										</tr>
									))}
								</tbody>
							</table>
						</section>
					)}
				</div>
			)}

			{(topMembers.length > 0 || channels.length > 0) && (
				<div className="invite-stats-grid">
					{topMembers.length > 0 && (
						<section className="panel">
							<h2 className="panel-title">
								<Trophy size={16} className="panel-title-icon" />
								{t('overview.mostActive')}
							</h2>
							<table className="table">
								<thead>
									<tr>
										<th>{t('overview.member')}</th>
										<th>{t('overview.messages')}</th>
									</tr>
								</thead>
								<tbody>
									{topMembers.slice(0, 6).map((member) => (
										<tr key={member.userId}>
											<td><MemberCell id={member.userId} tag={member.tag} avatar={null} /></td>
											<td>{member.count}</td>
										</tr>
									))}
								</tbody>
							</table>
						</section>
					)}
					{channels.length > 0 && (
						<section className="panel">
							<h2 className="panel-title">
								<Hash size={16} className="panel-title-icon" />
								{t('overview.busiestChannels')}
							</h2>
							<table className="table">
								<thead>
									<tr>
										<th>{t('overview.channel')}</th>
										<th>{t('overview.messages')}</th>
									</tr>
								</thead>
								<tbody>
									{channels.slice(0, 6).map((channel) => (
										<tr key={channel.channelId}>
											<td><span className="cell-with-icon"><Hash size={13} />#{channel.channelId}</span></td>
											<td>{channel.count}</td>
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
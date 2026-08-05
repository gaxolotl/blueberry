import { Languages, Ticket, TicketCheck, TicketX, UserPlus, Trophy } from 'lucide-react';
import { useApi } from '../hooks/useApi.js';
import { useI18n } from '../hooks/useI18n.jsx';
import { Loading, Error, Empty } from '../components/State.jsx';
import { guildIconUrl } from '../utils/discord.js';

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

export default function OverviewView({ guildId, guild }) {
	const { t } = useI18n();
	const guildData = useApi(guildId ? `/api/guilds/${guildId}` : null);
	const ticketStats = useApi(guildId ? `/api/guilds/${guildId}/tickets/stats` : null);
	const inviteStats = useApi(guildId ? `/api/guilds/${guildId}/invites/stats` : null);

	if (!guildId) return <Empty message={t('app.selectServer')} />;
	if (guildData.loading || ticketStats.loading || inviteStats.loading) return <Loading />;
	if (guildData.error) return <Error message={guildData.error} />;

	const iconUrl = guildIconUrl(guild);

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
				<StatCard label={t('overview.language')} value={guildData.data?.language ?? '—'} Icon={Languages} />
				<StatCard label={t('overview.openTickets')} value={ticketStats.data?.open ?? 0} Icon={Ticket} />
				<StatCard label={t('overview.closedTickets')} value={ticketStats.data?.closed ?? 0} Icon={TicketCheck} />
				<StatCard label={t('overview.totalTickets')} value={ticketStats.data?.total ?? 0} Icon={TicketX} />
				<StatCard label={t('overview.totalInvites')} value={inviteStats.data?.total ?? 0} Icon={UserPlus} />
			</div>

			{inviteStats.data?.topInvites?.length > 0 && (
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
							{inviteStats.data.topInvites.map((invite) => (
								<tr key={invite._id}>
									<td>{invite._id}</td>
									<td>{invite.count}</td>
								</tr>
							))}
						</tbody>
					</table>
				</section>
			)}
		</div>
	);
}
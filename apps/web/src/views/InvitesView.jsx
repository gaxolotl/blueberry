import { User, Link2, UserPlus, Hash, Repeat, Calendar } from 'lucide-react';
import { useApi } from '../hooks/useApi.js';
import { useI18n } from '../hooks/useI18n.jsx';
import { Loading, Error, Empty } from '../components/State.jsx';

function formatDate(value) {
	if (!value) return '—';
	return new Date(value).toLocaleString();
}

export default function InvitesView({ guildId }) {
	const { t } = useI18n();
	const invites = useApi(guildId ? `/api/guilds/${guildId}/invites?limit=200` : null);

	if (!guildId) return <Empty message={t('app.selectServer')} />;
	if (invites.loading) return <Loading />;
	if (invites.error) return <Error message={invites.error} />;

	return (
		<div className="view">
			<h1 className="view-title">{t('invites.title')}</h1>

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
									<span className="cell-with-icon">
										<User size={13} />
										{join.memberTag}
									</span>
								</td>
								<td>
									<span className="cell-with-icon">
										<Link2 size={13} />
										{join.inviteCode}
									</span>
								</td>
								<td>
									<span className="cell-with-icon">
										<UserPlus size={13} />
										{join.inviterTag}
									</span>
								</td>
								<td>
									<span className="cell-with-icon">
										<Hash size={13} />
										{join.channel}
									</span>
								</td>
								<td>
									<span className="cell-with-icon">
										<Repeat size={13} />
										{join.uses}
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
		</div>
	);
}
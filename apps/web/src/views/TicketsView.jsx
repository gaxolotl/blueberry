import { useEffect, useState } from 'react';
import { Ticket, User, UserCheck, Calendar, CalendarX, StickyNote, FileText, Eye, Download, X, Tags, Shield } from 'lucide-react';
import { useApi } from '../hooks/useApi.js';
import { useI18n } from '../hooks/useI18n.jsx';
import { Loading, Error, Empty } from '../components/State.jsx';

const STATUS_FILTERS = [
	{ key: '', labelKey: 'tickets.all' },
	{ key: 'open', labelKey: 'tickets.open' },
	{ key: 'closed', labelKey: 'tickets.closed' },
];

function formatDate(value) {
	if (!value) return '—';
	return new Date(value).toLocaleString();
}

function TranscriptModal({ guildId, ticket, onClose }) {
	const { t } = useI18n();
	const [transcript, setTranscript] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	useEffect(() => {
		let cancelled = false;

		async function load() {
			try {
				const headers = {};
				const token = localStorage.getItem('bb_token');
				if (token) headers.Authorization = `Bearer ${token}`;
				const res = await fetch(`/api/guilds/${guildId}/tickets/${ticket.threadId}/transcript`, { headers });
				if (!res.ok) throw new Error('Failed to load transcript');
				const data = await res.json();
				if (!cancelled) setTranscript(data);
			}
			catch (err) {
				if (!cancelled) setError(err.message);
			}
			finally {
				if (!cancelled) setLoading(false);
			}
		}
		load();

		return () => {
			cancelled = true;
		};
	}, [guildId, ticket.threadId]);

	function download() {
		if (!transcript) return;
		const blob = new Blob([transcript.html], { type: 'text/html' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = transcript.filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	return (
		<div className="modal-overlay" onClick={onClose}>
			<div className="modal transcript-modal" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<h2 className="modal-title">{t('tickets.transcriptTitle', { id: ticket.threadId })}</h2>
					<div className="modal-actions">
						{transcript && (
							<button className="btn btn-secondary" onClick={download}>
								<Download size={14} />
								{t('tickets.downloadTranscript')}
							</button>
						)}
						<button className="icon-btn" onClick={onClose} title={t('tickets.close')}>
							<X size={14} />
						</button>
					</div>
				</div>
				<div className="modal-body transcript-modal-body">
					{loading && <Loading />}
					{error && <Error message={error} />}
					{transcript && <iframe className="transcript-frame" srcDoc={transcript.html} title={t('tickets.transcriptTitle', { id: ticket.threadId })} sandbox="allow-popups allow-popups-to-escape-sandbox" />}
				</div>
			</div>
		</div>
	);
}

export default function TicketsView({ guildId }) {
	const { t } = useI18n();
	const [status, setStatus] = useState('');
	const [viewingTicket, setViewingTicket] = useState(null);
	const tickets = useApi(
		guildId ? `/api/guilds/${guildId}/tickets${status ? `?status=${status}` : ''}` : null,
		[status],
	);

	if (!guildId) return <Empty message={t('app.selectServer')} />;
	if (tickets.loading) return <Loading />;
	if (tickets.error) return <Error message={tickets.error} />;

	const priorityLabel = {
		low: t('tickets.priorityLow'),
		medium: t('tickets.priorityMedium'),
		high: t('tickets.priorityHigh'),
	};

	return (
		<div className="view">
			<h1 className="view-title">{t('tickets.title')}</h1>

			<div className="filter-bar">
				{STATUS_FILTERS.map((filter) => (
					<button
						key={filter.key}
						className={`filter-btn${status === filter.key ? ' active' : ''}`}
						onClick={() => setStatus(filter.key)}
					>
						{t(filter.labelKey)}
					</button>
				))}
			</div>

			{tickets.data?.length === 0 ? (
				<Empty message={t('tickets.noTickets')} />
			) : (
				<table className="table">
					<thead>
						<tr>
							<th>{t('tickets.status')}</th>
							<th>{t('tickets.priority')}</th>
							<th>{t('tickets.category')}</th>
							<th>{t('tickets.opener')}</th>
							<th>{t('tickets.claimedBy')}</th>
							<th>{t('tickets.assignedRole')}</th>
							<th>{t('tickets.tags')}</th>
							<th>{t('tickets.notes')}</th>
							<th>{t('tickets.transcript')}</th>
							<th>{t('tickets.created')}</th>
							<th>{t('tickets.closed')}</th>
						</tr>
					</thead>
					<tbody>
						{tickets.data?.map((ticket) => (
							<tr key={ticket.threadId}>
								<td>
									<span className={`badge badge-${ticket.status}`}>
										{ticket.status}
									</span>
								</td>
								<td>
									<span className={`badge badge-priority-${ticket.priority ?? 'medium'}`}>
										{priorityLabel[ticket.priority ?? 'medium']}
									</span>
								</td>
								<td>
									<span className="cell-with-icon">
										<Ticket size={13} />
										{ticket.categoryLabel}
									</span>
								</td>
								<td>
									<span className="cell-with-icon">
										<User size={13} />
										{ticket.openerId}
									</span>
								</td>
							<td>
								<span className="cell-with-icon">
									<UserCheck size={13} />
									{ticket.claimedBy ?? '—'}
								</span>
							</td>
							<td><span className="cell-with-icon"><Shield size={13} />{ticket.assignedRoleId ?? '—'}</span></td>
							<td><span className="cell-with-icon"><Tags size={13} />{ticket.tags?.length ? ticket.tags.join(', ') : '—'}</span></td>
								<td>
									<span className="cell-with-icon" title={ticket.notes ?? ''}>
										<StickyNote size={13} />
										{ticket.notes ? ticket.notes.slice(0, 30) : t('tickets.noNotes')}
									</span>
								</td>
								<td>
									{ticket.transcript?.length ? (
										<button className="link-btn" onClick={() => setViewingTicket(ticket)}>
											<Eye size={13} />
											{t('tickets.viewTranscript')}
										</button>
									) : (
										<span className="cell-with-icon">
											<FileText size={13} />
											{t('tickets.noTranscript')}
										</span>
									)}
								</td>
								<td>
									<span className="cell-with-icon">
										<Calendar size={13} />
										{formatDate(ticket.createdAt)}
									</span>
								</td>
								<td>
									<span className="cell-with-icon">
										<CalendarX size={13} />
										{formatDate(ticket.closedAt)}
									</span>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}

			{viewingTicket && (
				<TranscriptModal
					guildId={guildId}
					ticket={viewingTicket}
					onClose={() => setViewingTicket(null)}
				/>
			)}
		</div>
	);
}

import { Download, ExternalLink, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth.jsx';
import { useI18n } from '../hooks/useI18n.jsx';
import { apiFetch, authHeaders } from '../utils/api.js';

export default function AccountPrivacyView() {
	const { t } = useI18n();
	const { deleteAccount } = useAuth();
	const [confirmation, setConfirmation] = useState('');
	const [busy, setBusy] = useState(false);

	async function exportData() {
		setBusy(true);
		try {
			const response = await fetch('/api/me/export', { headers: authHeaders() });
			if (!response.ok) throw new Error('Export failed');
			const data = await response.json();
			const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = `blueberry-data-${data.discordId}.json`;
			anchor.click();
			URL.revokeObjectURL(url);
		}
		finally {
			setBusy(false);
		}
	}

	async function eraseAccount() {
		if (confirmation !== 'DELETE') return;
		setBusy(true);
		try {
			await apiFetch('/api/me', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ confirmation }),
			});
			deleteAccount();
		}
		finally {
			setBusy(false);
		}
	}

	return (
		<div className="view account-view">
			<h1 className="view-title">{t('account.title')}</h1>
			<p className="view-subtitle">{t('account.subtitle')}</p>

			<section className="panel account-panel">
				<div className="account-panel-icon"><ShieldCheck size={20} /></div>
				<div><h2>{t('account.yourData')}</h2><p>{t('account.yourDataDescription')}</p></div>
				<button className="btn btn-secondary" disabled={busy} onClick={exportData}><Download size={14} /> {t('account.export')}</button>
			</section>

			<section className="panel account-panel danger-zone">
				<div className="account-panel-icon"><Trash2 size={20} /></div>
				<div><h2>{t('account.deleteTitle')}</h2><p>{t('account.deleteDescription')}</p></div>
				<div className="account-delete-controls">
					<input className="form-input" value={confirmation} placeholder={t('account.deletePlaceholder')} onChange={event => setConfirmation(event.target.value)} />
					<button className="btn btn-danger" disabled={busy || confirmation !== 'DELETE'} onClick={eraseAccount}><Trash2 size={14} /> {t('account.delete')}</button>
				</div>
			</section>

			<div className="account-legal-links">
				<a href="/privacy" target="_blank">{t('legal.privacy')} <ExternalLink size={12} /></a>
				<a href="/terms" target="_blank">{t('legal.terms')} <ExternalLink size={12} /></a>
			</div>
		</div>
	);
}

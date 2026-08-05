import { Server, Wifi, WifiOff, Loader2, Settings } from 'lucide-react';
import { useI18n } from '../hooks/useI18n.jsx';
import DeviceSettingsPanel from './DeviceSettingsPanel.jsx';
import { useState } from 'react';

export default function StatusBar({ apiStatus, guildCount }) {
	const { t } = useI18n();
	const [showSettings, setShowSettings] = useState(false);

	const statusConfig = {
		connecting: { label: t('status.connecting'), Icon: Loader2, className: 'status-connecting' },
		online: { label: t('status.online'), Icon: Wifi, className: 'status-online' },
		offline: { label: t('status.offline'), Icon: WifiOff, className: 'status-offline' },
		error: { label: t('status.error'), Icon: WifiOff, className: 'status-error' },
	}[apiStatus];

	const { label, Icon, className } = statusConfig;

	return (
		<>
			{showSettings && <DeviceSettingsPanel onClose={() => setShowSettings(false)} />}
			<footer className="statusbar">
				<div className="statusbar-left">
					<span className="statusbar-item">
						<Icon size={12} className={className} />
						{label}
					</span>
				</div>
				<div className="statusbar-right">
					<span className="statusbar-item">
						<Server size={12} />
						{t('status.servers', { count: guildCount })}
					</span>
					<button
						className="statusbar-item statusbar-btn"
						onClick={() => setShowSettings((v) => !v)}
						title={t('device.title')}
					>
						<Settings size={12} />
					</button>
				</div>
			</footer>
		</>
	);
}
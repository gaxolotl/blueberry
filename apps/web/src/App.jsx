import { useEffect, useState } from 'react';
import { LayoutDashboard, Ticket, UserPlus, Settings, Loader2 } from 'lucide-react';
import { I18nProvider, useI18n } from './hooks/useI18n.jsx';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import ActivityBar from './components/ActivityBar.jsx';
import Sidebar from './components/Sidebar.jsx';
import StatusBar from './components/StatusBar.jsx';
import TitleBar from './components/TitleBar.jsx';
import OverviewView from './views/OverviewView.jsx';
import TicketsView from './views/TicketsView.jsx';
import InvitesView from './views/InvitesView.jsx';
import SettingsView from './views/SettingsView.jsx';
import { ToastProvider } from './components/Toast.jsx';

const VIEWS = {
	overview: { labelKey: 'nav.overview', icon: LayoutDashboard, component: OverviewView },
	tickets: { labelKey: 'nav.tickets', icon: Ticket, component: TicketsView },
	invites: { labelKey: 'nav.invites', icon: UserPlus, component: InvitesView },
	settings: { labelKey: 'nav.settings', icon: Settings, component: SettingsView },
};

function LoginScreen() {
	const { login } = useAuth();
	return (
		<div className="login-screen">
			<div className="login-card">
				<h1 className="login-title">Blueberry</h1>
				<p className="login-subtitle">Dashboard</p>
				<button className="btn login-btn" onClick={login}>
					Login with Discord
				</button>
			</div>
		</div>
	);
}

function AppContent() {
	const { t } = useI18n();
	const { user } = useAuth();
	const [activeView, setActiveView] = useState('overview');
	const [selectedGuildId, setSelectedGuildId] = useState(null);
	const [apiStatus, setApiStatus] = useState('connecting');

	// Use the session's guilds (with names/icons) directly
	const guilds = user?.guilds ?? [];

	useEffect(() => {
		if (guilds.length > 0 && !selectedGuildId) {
			setSelectedGuildId(guilds[0].id);
		}
	}, [guilds, selectedGuildId]);

	useEffect(() => {
		async function checkHealth() {
			try {
				const headers = {};
				const token = localStorage.getItem('bb_token');
				if (token) headers.Authorization = `Bearer ${token}`;
				const res = await fetch('/api/health', { headers });
				const health = await res.json();
				setApiStatus(health.status === 'ok' ? 'online' : 'error');
			}
			catch {
				setApiStatus('offline');
			}
		}
		checkHealth();
	}, []);

	const ActiveComponent = VIEWS[activeView].component;

	return (
		<I18nProvider guildId={selectedGuildId}>
			<ToastProvider>
				<div className="app">
					<TitleBar />
					<div className="app-body">
						<ActivityBar
							views={VIEWS}
							activeView={activeView}
							onSelect={setActiveView}
						/>
						<Sidebar
							title={t(VIEWS[activeView].labelKey)}
							guilds={guilds}
							selectedGuildId={selectedGuildId}
							onSelectGuild={setSelectedGuildId}
						/>
						<main className="main-content">
							<ActiveComponent
								guildId={selectedGuildId}
								guild={guilds.find(g => g.id === selectedGuildId)}
							/>
						</main>
					</div>
					<StatusBar apiStatus={apiStatus} guildCount={guilds.length} />
				</div>
			</ToastProvider>
		</I18nProvider>
	);
}

function Root() {
	const { user, loading } = useAuth();

	if (loading) {
		return (
			<div className="login-screen">
				<Loader2 className="spin" size={32} />
			</div>
		);
	}

	if (!user) return <LoginScreen />;

	return <AppContent />;
}

export default function App() {
	return (
		<AuthProvider>
			<Root />
		</AuthProvider>
	);
}
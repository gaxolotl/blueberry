import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import AuthCallback from './pages/AuthCallback.jsx';
import LegalPage from './pages/LegalPage.jsx';
import { I18nProvider } from './hooks/useI18n.jsx';
import './styles.css';

const isCallback = window.location.pathname === '/auth/callback';
const legalType = window.location.pathname === '/privacy' ? 'privacy' : window.location.pathname === '/terms' ? 'terms' : null;

ReactDOM.createRoot(document.getElementById('root')).render(
	<React.StrictMode>
		{legalType ? <I18nProvider guildId={null}><LegalPage type={legalType} /></I18nProvider> : isCallback ? <AuthCallback /> : <App />}
	</React.StrictMode>,
);

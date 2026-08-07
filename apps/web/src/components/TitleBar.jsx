import { Cherry } from 'lucide-react';
import { useI18n } from '../hooks/useI18n.jsx';

export default function TitleBar() {
	const { t } = useI18n();

	return (
		<header className="titlebar">
			<div className="titlebar-left">
				<Cherry size={18} className="titlebar-logo" />
				<span className="titlebar-title">{t('app.title')}</span>
			</div>
		</header>
	);
}
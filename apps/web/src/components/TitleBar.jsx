import { Minus, Square, X, Cherry } from 'lucide-react';
import { useI18n } from '../hooks/useI18n.jsx';

export default function TitleBar() {
	const { t } = useI18n();

	return (
		<header className="titlebar">
			<div className="titlebar-left">
				<Cherry size={18} className="titlebar-logo" />
				<span className="titlebar-title">{t('app.title')}</span>
			</div>
			{/*
			<div className="titlebar-window-controls">
				<span className="window-btn">
					<Minus size={14} />
				</span>
				<span className="window-btn">
					<Square size={12} />
				</span>
				<span className="window-btn window-btn-close">
					<X size={14} />
				</span>
			</div>
			*/}
		</header>
	);
}
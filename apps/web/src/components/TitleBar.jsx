import { Menu, Minus, Square, X, Cherry } from 'lucide-react';
import { useI18n } from '../hooks/useI18n.jsx';
import { useState, useEffect } from 'react';

export default function TitleBar({ onSidebarToggle }) {
	const { t } = useI18n();
	const [isMobile, setIsMobile] = useState(false);

	useEffect(() => {
		const checkMobile = () => setIsMobile(window.innerWidth <= 760);
		checkMobile();
		window.addEventListener('resize', checkMobile);
		return () => window.removeEventListener('resize', checkMobile);
	}, []);

	return (
		<header className="titlebar">
			<div className="titlebar-left">
				{isMobile && (
					<button className="window-btn sidebar-toggle" onClick={onSidebarToggle} aria-label="Toggle sidebar">
						<Menu size={18} />
					</button>
				)}
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
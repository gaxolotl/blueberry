import { Settings } from 'lucide-react';
import { useI18n } from '../hooks/useI18n.jsx';

export default function ActivityBar({ views, activeView, onSelect }) {
	const { t } = useI18n();

	return (
		<nav className="activitybar">
			{Object.entries(views).map(([key, view]) => {
				const Icon = view.icon;
				return (
					<button
						key={key}
						className={`activitybar-item${activeView === key ? ' active' : ''}`}
						title={t(view.labelKey)}
						onClick={() => onSelect(key)}
					>
						<Icon size={22} strokeWidth={1.5} />
					</button>
				);
			})}
			<div className="activitybar-spacer" />
		</nav>
	);
}
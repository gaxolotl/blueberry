import { useI18n } from '../hooks/useI18n.jsx';
import { guildIconUrl } from '../utils/discord.js';

export default function Sidebar({ title, guilds, selectedGuildId, onSelectGuild, isOpen, onClose }) {
	const { t } = useI18n();

	return (
		<aside className={`sidebar${isOpen ? ' open' : ''}`}>
			<div className="sidebar-header">
				<span className="sidebar-title">{title}</span>
			</div>
			<div className="sidebar-section">
				<span className="sidebar-section-label">{t('app.servers')}</span>
				{guilds.length === 0 && (
					<span className="sidebar-empty">{t('app.noServers')}</span>
				)}
				{guilds.map((guild) => {
					const iconUrl = guildIconUrl(guild);
					return (
						<button
							key={guild.id}
							className={`sidebar-item${selectedGuildId === guild.id ? ' active' : ''}`}
							onClick={() => {
								onSelectGuild(guild.id);
								onClose?.();
							}}
						>
							{iconUrl ? (
								<img className="sidebar-item-icon-img" src={iconUrl} alt="" />
							) : (
								<span className="sidebar-item-icon-fallback">{guild.name?.charAt(0) ?? '?'}</span>
							)}
							<span className="sidebar-item-text">
								<span className="sidebar-item-name">{guild.name ?? guild.id}</span>
								<span className="sidebar-item-id">{guild.id}</span>
							</span>
						</button>
					);
				})}
			</div>
		</aside>
	);
}
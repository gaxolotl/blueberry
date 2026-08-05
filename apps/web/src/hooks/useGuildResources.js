import { useEffect, useState } from 'react';
import { apiFetch } from '../utils/api.js';

export function useGuildResources(guildId) {
	const [resources, setResources] = useState({ roles: [], channels: [] });
	const [loading, setLoading] = useState(Boolean(guildId));
	const [error, setError] = useState(null);

	useEffect(() => {
		let cancelled = false;
		if (!guildId) {
			setResources({ roles: [], channels: [] });
			setLoading(false);
			return undefined;
		}
		setLoading(true);
		setError(null);
		apiFetch(`/api/guilds/${guildId}/resources`)
			.then(data => { if (!cancelled) setResources(data); })
			.catch(fetchError => { if (!cancelled) setError(fetchError.message); })
			.finally(() => { if (!cancelled) setLoading(false); });
		return () => { cancelled = true; };
	}, [guildId]);

	return { ...resources, loading, error };
}

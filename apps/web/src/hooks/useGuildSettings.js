import { useEffect, useMemo, useState } from 'react';
import { SETTING_CATEGORIES, buildSettingPayloads } from '../utils/settingsRegistry.js';
import { apiFetch } from '../utils/api.js';

const defaults = (() => {
	const d = {};
	for (const cat of SETTING_CATEGORIES) for (const f of cat.fields) if (f.default !== undefined) d[f.key] = f.default;
	return d;
})();

function endpoints(guildId) {
	const list = [];
	for (const cat of SETTING_CATEGORIES) {
		const e = cat.endpoint(guildId);
		if (!list.includes(e)) list.push(e);
	}
	return list;
}

export function useGuildSettings(guildId) {
	const eps = useMemo(() => (guildId ? endpoints(guildId) : []), [guildId]);
	const [values, setValues] = useState(defaults);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [saving, setSaving] = useState(false);
	const [savedAt, setSavedAt] = useState(null);

	useEffect(() => {
		if (!guildId) return;
		let cancelled = false;
		setLoading(true);
		setError(null);
		(async () => {
			const merged = { ...defaults };
			try {
				for (const e of eps) Object.assign(merged, await apiFetch(e));
				if (!cancelled) setValues(merged);
			}
			catch (err) {
				if (!cancelled) setError(err.message);
			}
			finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => { cancelled = true; };
	}, [guildId]);

	function update(key, next) {
		setValues((prev) => ({ ...prev, [key]: next }));
	}

	async function save() {
		if (!guildId) return;
		setSaving(true);
		try {
			for (const [e, body] of buildSettingPayloads(guildId, values)) {
				await apiFetch(e, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body),
				});
			}
			setSavedAt(new Date());
		}
		finally {
			setSaving(false);
		}
	}

	return { values, update, save, saving, savedAt, loading, error };
}
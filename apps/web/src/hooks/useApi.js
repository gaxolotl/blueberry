import { useEffect, useState } from 'react';

function getToken() {
	return localStorage.getItem('bb_token');
}

export function useApi(path, deps = []) {
	const [data, setData] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);

	useEffect(() => {
		let cancelled = false;

		async function load() {
			setLoading(true);
			setError(null);
			try {
				const headers = {};
				const token = getToken();
				if (token) headers.Authorization = `Bearer ${token}`;
				const res = await fetch(path, { headers });
				if (!res.ok) throw new Error(`Request failed: ${res.status}`);
				const json = await res.json();
				if (!cancelled) setData(json);
			}
			catch (err) {
				if (!cancelled) setError(err.message);
			}
			finally {
				if (!cancelled) setLoading(false);
			}
		}

		if (path) load();

		return () => {
			cancelled = true;
		};
	}, [path, ...deps]);

	return { data, loading, error };
}
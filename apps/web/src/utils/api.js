export function getToken() {
	return localStorage.getItem('bb_token');
}

export function authHeaders(extra = {}) {
	const headers = { ...extra };
	const token = getToken();
	if (token) headers.Authorization = `Bearer ${token}`;
	return headers;
}

export async function apiFetch(path, options = {}) {
	const res = await fetch(path, {
		...options,
		headers: authHeaders(options.headers),
	});

	if (!res.ok) {
		let message = `Request failed: ${res.status}`;
		try {
			const data = await res.json();
			if (data?.error) message = data.error;
		}
		catch {
			// keep default message
		}
		throw new Error(message);
	}

	return res.json();
}
import { useEffect, useState } from 'react';

export default function AuthCallback() {
	const [error, setError] = useState(null);

	useEffect(() => {
		async function handleCallback() {
			const params = new URLSearchParams(window.location.search);
			const code = params.get('code');
			if (!code) {
				setError('No authorization code received.');
				return;
			}

			try {
				const res = await fetch('/api/auth/callback', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ code }),
				});
				if (!res.ok) throw new Error('Login failed');
				const data = await res.json();
				localStorage.setItem('bb_token', data.token);
				window.location.href = '/';
			}
			catch (err) {
				setError(err.message);
			}
		}
		handleCallback();
	}, []);

	return (
		<div className="auth-callback">
			{error ? (
				<div className="state state-error">Error: {error}</div>
			) : (
				<div className="state">Logging you in…</div>
			)}
		</div>
	);
}
import { createContext, useContext, useEffect, useState } from 'react';

const AuthContext = createContext({ user: null, token: null, login: () => {}, logout: () => {}, loading: true });

export function AuthProvider({ children }) {
	const [token, setToken] = useState(() => localStorage.getItem('bb_token'));
	const [user, setUser] = useState(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		async function validate() {
			if (!token) {
				setLoading(false);
				return;
			}
			try {
				const res = await fetch('/api/me', {
					headers: { Authorization: `Bearer ${token}` },
				});
				if (res.ok) {
					const me = await res.json();
					setUser(me);
				}
				else {
					localStorage.removeItem('bb_token');
					setToken(null);
				}
			}
			catch {
				localStorage.removeItem('bb_token');
				setToken(null);
			}
			finally {
				setLoading(false);
			}
		}
		validate();
	}, [token]);

	async function login() {
		const res = await fetch('/api/auth/login');
		const data = await res.json();
		window.location.href = data.url;
	}

	async function logout() {
		await fetch('/api/auth/logout', {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}` },
		});
		localStorage.removeItem('bb_token');
		setToken(null);
		setUser(null);
	}

	function deleteAccount() {
		localStorage.removeItem('bb_token');
		localStorage.removeItem('bb_device_prefs');
		setToken(null);
		setUser(null);
	}

	return (
		<AuthContext.Provider value={{ user, token, login, logout, deleteAccount, loading }}>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth() {
	return useContext(AuthContext);
}

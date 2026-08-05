import { createContext, useContext, useEffect, useState } from 'react';
import en from '../i18n/en.json';
import bg from '../i18n/bg.json';
import { getDevicePrefs, subscribeDevicePrefs } from './useDeviceSettings.js';

const catalogs = { en, bg };

const I18nContext = createContext({ t: (key, params) => key, locale: 'en' });

export function I18nProvider({ guildId, children }) {
	const [locale, setLocale] = useState(getDevicePrefs().language ?? 'en');

	// React to language changes made in the bottom device settings panel
	useEffect(() => {
		return subscribeDevicePrefs((prefs) => {
			if (prefs.language) setLocale(prefs.language);
		});
	}, []);

	useEffect(() => {
		if (!guildId) return;
		let cancelled = false;

		async function load() {
			try {
				const headers = {};
				const token = localStorage.getItem('bb_token');
				if (token) headers.Authorization = `Bearer ${token}`;
				const res = await fetch(`/api/guilds/${guildId}`, { headers });
				if (!res.ok) return;
				const guild = await res.json();
				if (!cancelled) {
					setLocale(getDevicePrefs().language ?? guild.language ?? 'en');
				}
			}
			catch {
				// keep default locale
			}
		}

		load();
		return () => {
			cancelled = true;
		};
	}, [guildId]);

	function t(key, params = {}) {
		const catalog = catalogs[locale] ?? catalogs.en;
		let template = catalog[key] ?? catalogs.en[key] ?? key;
		for (const [name, value] of Object.entries(params)) {
			template = template.replaceAll(`{${name}}`, String(value));
		}
		return template;
	}

	return (
		<I18nContext.Provider value={{ t, locale }}>
			{children}
		</I18nContext.Provider>
	);
}

export function useI18n() {
	return useContext(I18nContext);
}
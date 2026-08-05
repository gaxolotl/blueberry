import { useEffect, useState } from 'react';

const STORAGE_KEY = 'bb_device_prefs';
const listeners = new Set();

export function subscribeDevicePrefs(fn) {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

function emit(prefs) {
	for (const fn of listeners) fn(prefs);
}

export function getDevicePrefs() {
	try {
		return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
	}
	catch {
		return {};
	}
}

const PREF_DEFAULTS = {
	language: 'en',
	theme: 'dark',
};

export function useDeviceSettings() {
	const [prefs, setPrefs] = useState(() => ({ ...PREF_DEFAULTS, ...getDevicePrefs() }));

	useEffect(() => {
		document.documentElement.dataset.theme = prefs.theme;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
		}
		catch {
			// storage unavailable
		}
		emit(prefs);
	}, [prefs]);

	function setPref(key, value) {
		setPrefs((prev) => ({ ...prev, [key]: value }));
	}

	return { prefs, setPref };
}
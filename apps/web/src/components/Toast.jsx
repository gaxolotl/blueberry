import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useI18n } from '../hooks/useI18n.jsx';

const ToastContext = createContext({ showToast: () => {} });

export function useToast() {
	return useContext(ToastContext);
}

const AUTO_DISMISS_MS = 4000;

export function ToastProvider({ children }) {
	const { t } = useI18n();
	const [toast, setToast] = useState(null);
	const timerRef = useRef(null);

	const clearTimer = () => {
		if (timerRef.current) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
	};

	const showToast = useCallback((message, type = 'info') => {
		clearTimer();
		setToast({ message, type });
		timerRef.current = setTimeout(() => {
			setToast(null);
			timerRef.current = null;
		}, AUTO_DISMISS_MS);
	}, []);
	const dismissToast = useCallback(() => {
		clearTimer();
		setToast(null);
	}, []);

	useEffect(() => () => clearTimer(), []);

	return (
		<ToastContext.Provider value={{ showToast }}>
			{children}
			{toast && (() => {
				const Icon = toast.type === 'success' ? CheckCircle2 : toast.type === 'error' ? XCircle : Info;
				return <div className={`toast toast-${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'} aria-live={toast.type === 'error' ? 'assertive' : 'polite'}>
					<Icon className="toast-icon" size={16} />
					<span className="toast-message">{toast.message}</span>
					<button type="button" className="toast-dismiss" onClick={dismissToast} aria-label={t('toast.dismiss')}><X size={14} /></button>
				</div>
			})()}
		</ToastContext.Provider>
	);
}

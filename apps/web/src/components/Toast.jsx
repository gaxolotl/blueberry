import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const ToastContext = createContext({ showToast: () => {} });

export function useToast() {
	return useContext(ToastContext);
}

const AUTO_DISMISS_MS = 1000;

export function ToastProvider({ children }) {
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

	useEffect(() => () => clearTimer(), []);

	return (
		<ToastContext.Provider value={{ showToast }}>
			{children}
			{toast && (
				<div className={`toast toast-${toast.type}`}>
					<span className="toast-message">{toast.message}</span>
				</div>
			)}
		</ToastContext.Provider>
	);
}
import { AlertCircle, Loader2 } from 'lucide-react';

export function Loading() {
	return <div className="state"><Loader2 className="state-icon spin" size={16} /> Loading…</div>;
}

export function Error({ message }) {
	return <div className="state state-error" role="alert"><AlertCircle className="state-icon" size={16} /> Error: {message}</div>;
}

export function Empty({ message }) {
	return <div className="state">{message}</div>;
}

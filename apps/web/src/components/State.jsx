export function Loading() {
	return <div className="state">Loading…</div>;
}

export function Error({ message }) {
	return <div className="state state-error">Error: {message}</div>;
}

export function Empty({ message }) {
	return <div className="state">{message}</div>;
}
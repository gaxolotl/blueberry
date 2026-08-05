import config from '../../config.js';

export function getTicketAutomationLimits() {
	return {
		maxRules: config.ticketAutomation?.maxRules ?? 20,
		maxPatternLength: config.ticketAutomation?.maxPatternLength ?? 200,
	};
}

export function isSafeRegex(pattern) {
	if (!pattern || pattern.length > getTicketAutomationLimits().maxPatternLength) return false;
	if (/\([^)]*[+*][^)]*\)[+*{]/.test(pattern)) return false;
	try {
		new RegExp(pattern, 'i');
		return true;
	}
	catch {
		return false;
	}
}

function matchesRule(text, rule) {
	if (rule.matchMode === 'regex') {
		return isSafeRegex(rule.pattern) && new RegExp(rule.pattern, 'i').test(text);
	}
	const keywords = rule.pattern.split(',').map(keyword => keyword.trim().toLocaleLowerCase()).filter(Boolean);
	const normalized = text.toLocaleLowerCase();
	return keywords.length > 0 && keywords.some(keyword => normalized.includes(keyword));
}

export function matchTicketAutomationRule(text, ticketConfig) {
	if (!ticketConfig.automationEnabled || !text) return null;
	return ticketConfig.automationRules.find(rule => rule.enabled && matchesRule(text, rule)) ?? null;
}

export function validateAutomationRules(rules) {
	const limits = getTicketAutomationLimits();
	if (!Array.isArray(rules) || rules.length > limits.maxRules) return false;
	return rules.every(rule => {
		if (!rule?.id || !rule.label || !['keywords', 'regex'].includes(rule.matchMode)) return false;
		if (typeof rule.pattern !== 'string' || !rule.pattern.trim() || rule.pattern.length > limits.maxPatternLength) return false;
		if (rule.matchMode === 'regex' && !isSafeRegex(rule.pattern)) return false;
		if (rule.priority && !['low', 'medium', 'high'].includes(rule.priority)) return false;
		return true;
	});
}

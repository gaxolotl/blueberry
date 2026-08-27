import { Languages, Ticket, Users, Hash } from 'lucide-react';

const guildEndpoint = (guildId) => `/api/guilds/${guildId}`;
const ticketEndpoint = (guildId) => `/api/guilds/${guildId}/ticket-config`;

export const SETTING_CATEGORIES = [
	{
		id: 'general',
		titleKey: 'settings.categoryGeneral',
		icon: Languages,
		endpoint: guildEndpoint,
		fields: [
			{
				type: 'color',
				key: 'accentColor',
				labelKey: 'settings.accentColor',
				placeholderKey: 'settings.accentColorPlaceholder',
				default: '#476797',
				serialize: (v) => (/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(v))
					? `#${String(v).replace(/^#/, '').toUpperCase()}`
					: '#476797'),
			},
			{
				type: 'color',
				key: 'errorColor',
				labelKey: 'settings.errorColor',
				placeholderKey: 'settings.errorColorPlaceholder',
				default: '#FF0000',
				serialize: (v) => (/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(v))
					? `#${String(v).replace(/^#/, '').toUpperCase()}`
					: '#FF0000'),
			},
			{
				type: 'select',
				key: 'language',
				labelKey: 'settings.language',
				default: 'en',
				options: [
					{ value: 'en', labelKey: 'settings.languageEn' },
					{ value: 'bg', labelKey: 'settings.languageBg' },
				],
			},
			{
				type: 'text',
				key: 'commandPrefix',
				labelKey: 'settings.commandPrefix',
				hintKey: 'settings.commandPrefixHint',
				placeholderKey: 'settings.commandPrefixPlaceholder',
				maxLength: 10,
				default: '-',
			},
			{
				type: 'roleList',
				key: 'manageRoleIds',
				labelKey: 'settings.manageRoles',
				placeholderKey: 'settings.roleId',
				addKey: 'settings.addRole',
				removeKey: 'settings.removeRole',
				default: [],
			},
		],
	},
	{
		id: 'tickets',
		titleKey: 'settings.categoryTickets',
		icon: Ticket,
		endpoint: ticketEndpoint,
		fields: [
			{ type: 'text', key: 'panelTitle', labelKey: 'settings.panelTitle' },
			{ type: 'textarea', key: 'panelDescription', labelKey: 'settings.panelDescription' },
			{
				type: 'text',
				key: 'threadNameTemplate',
				labelKey: 'settings.threadNameTemplate',
				hintKey: 'settings.threadNameTemplateHint',
			},
			{ type: 'number', key: 'maxOpenPerUser', labelKey: 'settings.maxOpenPerUser', min: 1, default: 1 },
			{
				type: 'channel',
				key: 'transcriptChannelId',
				labelKey: 'settings.transcriptChannel',
				placeholderKey: 'settings.channelIdPlaceholder',
			},
			{ type: 'number', key: 'autoCloseMinutes', labelKey: 'settings.autoClose', min: 0, default: 0 },
			{
				type: 'select',
				key: 'requireCloseReason',
				labelKey: 'settings.requireCloseReason',
				default: false,
				options: [
					{ value: 'false', labelKey: 'settings.no' },
					{ value: 'true', labelKey: 'settings.yes' },
				],
				serialize: (v) => v === 'true',
			},
			{
				type: 'select',
				key: 'defaultPriority',
				labelKey: 'settings.defaultPriority',
				default: 'medium',
				options: [
					{ value: 'low', labelKey: 'settings.priorityLow' },
					{ value: 'medium', labelKey: 'settings.priorityMedium' },
					{ value: 'high', labelKey: 'settings.priorityHigh' },
				],
			},
		],
	},
	{
		id: 'supportRoles',
		titleKey: 'settings.categorySupportRoles',
		icon: Users,
		endpoint: ticketEndpoint,
		fields: [
			{
				type: 'roleList',
				key: 'supportRoleIds',
				labelKey: 'settings.supportRoles',
				placeholderKey: 'settings.roleId',
				addKey: 'settings.addRole',
				removeKey: 'settings.removeRole',
				default: [],
			},
		],
	},
	{
		id: 'categories',
		titleKey: 'settings.categoryCategories',
		icon: Hash,
		endpoint: ticketEndpoint,
		fields: [
			{
				type: 'categoryList',
				key: 'categories',
				labelKey: 'settings.categories',
				addKey: 'settings.addCategory',
				removeKey: 'settings.removeCategory',
				default: [],
			},
		],
	},
];

export function buildSettingPayloads(guildId, values) {
	const payloads = new Map();
	for (const category of SETTING_CATEGORIES) {
		const endpoint = category.endpoint(guildId);
		if (!payloads.has(endpoint)) payloads.set(endpoint, {});
		for (const field of category.fields) {
			let value = values[field.key];
			if (field.serialize) value = field.serialize(value);
			if (value === undefined) continue;
			payloads.get(endpoint)[field.key] = value;
		}
	}
	return payloads;
}

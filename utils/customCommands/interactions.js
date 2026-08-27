// Dispatches and responds to component/modal custom-command interactions.
// Mirrors YAGPDB's custom-interactions docs:
//   - Trigger matched via regex on the custom ID.
//   - Context exposes .Interaction, .CustomID, .StrippedID, .Values.
//   - Output text becomes the initial response (honors ephemeralResponse).
//   - sendResponse handles initial reply + followups; sendModal shows a modal;
//     updateMessage edits the triggering message.
import {
	ActionRowBuilder,
	MessageFlags,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
} from 'discord.js';
import { getMatchingInteractionCommands, checkRestrictions } from './triggers.js';
import { renderCustomCommand, buildComponentsV2 as buildResponsePayload } from './runner.js';

async function getChannelContext(interaction) {
	const guild = interaction.guild ?? null;
	const channel = interaction.channel ?? null;
	const member = interaction.member ?? null;
	return { guild, channel, member, user: interaction.user ?? member?.user ?? null };
}

function buildInteractionValues(interaction) {
	if (interaction.isMessageComponent()) {
		if (interaction.isStringSelectMenu() || interaction.isUserSelectMenu() || interaction.isRoleSelectMenu() || interaction.isMentionableSelectMenu() || interaction.isChannelSelectMenu()) {
			return interaction.values ?? [];
		}
		return [];
	}
	if (interaction.isModalSubmit()) {
		const values = [];
		for (const row of interaction.fields?.fields?.values?.() ?? []) {
			values.push(row.value ?? '');
		}
		return values;
	}
	return [];
}

/**
 * Builds the interaction object exposed to templates (.Interaction.*).
 */
function buildModal(modal) {
	const data = modal == null ? {} : (typeof modal.toJSON === 'function' ? modal.toJSON() : modal);
	const title = data.title ?? 'Modal';
	const builder = new ModalBuilder().setTitle(String(title)).setCustomId(String(data.custom_id ?? `modal_${Date.now()}`));
	for (const field of data.fields ?? []) {
		const f = typeof field.toJSON === 'function' ? field.toJSON() : field;
		const input = new TextInputBuilder()
			.setCustomId(String(f.custom_id ?? `field_${Math.random().toString(36).slice(2, 8)}`))
			.setLabel(String(f.label ?? 'Field'))
			.setStyle(f.style === 2 || f.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short);
		if (f.placeholder !== undefined) input.setPlaceholder(String(f.placeholder));
		if (f.value !== undefined) input.setValue(String(f.value));
		if (f.min_length !== undefined) input.setMinLength(Number(f.min_length));
		if (f.max_length !== undefined) input.setMaxLength(Number(f.max_length));
		if (f.required !== undefined) input.setRequired(Boolean(f.required));
		builder.addComponents(new ActionRowBuilder().addComponents(input));
	}
	return builder;
}

/**
 * Full pipeline for a component/modal interaction: match -> render -> respond.
 */
export async function handleInteractionCommand(interaction) {
	if (!interaction.guildId) return false;
	const customId = interaction.customId ?? '';
	const isComponent = interaction.isMessageComponent();
	const isModal = interaction.isModalSubmit();
	if (!isComponent && !isModal) return false;

	const kind = isComponent ? 'component' : 'modal';
	const matches = await getMatchingInteractionCommands(interaction.guildId, customId, kind);
	if (matches.length === 0) return false;

	const { guild, channel, member } = await getChannelContext(interaction);

	for (const { cc, result } of matches) {
		const allowed = await checkRestrictions(guild, member, channel, cc);
		if (!allowed) continue;

		const values = buildInteractionValues(interaction);
		const valuesList = Array.isArray(values) ? values : [values];

		const ctx = {
			client: interaction.client,
			guild,
			channel,
			member,
			user: interaction.user ?? member?.user,
			cc,
			prefix: '-',
			args: [],
			cmdArgs: [],
			stripped: result.stripped ?? '',
			matchedText: customId,
			stackDepth: 0,
			interactionData: {
				customId,
				stripped: result.stripped ?? '',
				values: valuesList,
				token: interaction.token,
				isComponent,
				isModal,
			},
		};

		// Merge interaction response hooks so template functions can send
		// modals / responses / updateMessage during the render.
		Object.assign(ctx, (await createInteractionFunctionCtx(interaction)).ctx);

		const rendered = await renderCustomCommand(ctx);
		const interactionState = ctx.interactionState ?? {};
		if (!interactionState.responded) {
			await respondToInteraction(interaction, rendered, ctx);
		}
		return true;
	}

	// All matched CCs were blocked by restrictions.
	return false;
}

async function respondToInteraction(interaction, rendered, ctx) {
	const interactionState = ctx.interactionState ?? { responded: false };

	// If the template used sendModal/updateMessage/sendResponse directly, it is
	// already handled via ctx hooks; otherwise fall back to text output.
	if (interactionState.responded) return;

	const content = rendered?.output;
	if (rendered && content != null && String(content).trim() !== '') {
		const ephemeral = interactionState.ephemeral ?? rendered.ephemeral ?? false;
		const flags = ephemeral ? MessageFlags.Ephemeral : undefined;
		if (interaction.deferred || interaction.replied) {
			await interaction.followUp({ content: String(content), flags }).catch(() => null);
		}
		else {
			await interaction.reply({ content: String(content), flags }).catch(() => null);
			interactionState.responded = true;
		}
	}
}

/**
 * Exposes interaction response hooks that template functions call.
 */
export async function createInteractionFunctionCtx(interaction) {
	const state = { responded: false };

	const ctx = {
		interaction,
		interactionState: state,
		setEphemeral: () => { state.ephemeral = true; },
		// sendModal via template function
		sendModalFn: async (modal) => {
			const builder = buildModal(modal);
			if (!interaction.replied && !interaction.deferred) {
				await interaction.showModal(builder);
				state.responded = true;
				return '';
			}
			return '';
		},
		// updateMessage
		updateMessage: async (content) => {
			const payload = await buildResponsePayload(content, interaction.guildId);
			if (interaction.isMessageComponent() && interaction.message) {
				await interaction.update({ ...payload }).catch(() => null);
				state.responded = true;
			}
			return '';
		},
		// sendResponse: initial reply or followup
		sendInteractionResponse: async (token, content) => {
			const payload = await buildResponsePayload(content, interaction.guildId);
			const flags = (payload.flags ?? 0) | (state.ephemeral ? MessageFlags.Ephemeral : 0);
			delete payload.flags;
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp({ ...payload, flags });
			}
			else {
				await interaction.reply({ ...payload, flags });
				state.responded = true;
			}
			return '';
		},
		sendModal: ctx.sendModalFn,
	};

	return { ctx, state };
}
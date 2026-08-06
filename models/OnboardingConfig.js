import { Schema, model } from 'mongoose';
import config from '../config.js';

const onboardingSchema = new Schema({
	guildId: { type: String, required: true, unique: true, index: true },
	welcomeEnabled: { type: Boolean, default: false },
	welcomeChannelId: { type: String, default: null },
	welcomeMessage: { type: String, default: config.onboarding.welcomeMessage },
	farewellEnabled: { type: Boolean, default: false },
	farewellChannelId: { type: String, default: null },
	farewellMessage: { type: String, default: config.onboarding.farewellMessage },
	autoRoleIds: { type: [String], default: [] },
	accountAgeAlertEnabled: { type: Boolean, default: false },
	accountAgeAlertChannelId: { type: String, default: null },
	accountAgeMinimumDays: { type: Number, default: config.onboarding.accountAgeMinimumDays, min: 1, max: config.onboarding.maxAccountAgeDays },
});

export default model('OnboardingConfig', onboardingSchema);

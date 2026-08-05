import config from '../../config.js';
import { emojis } from '../emoji.js';
import { ButtonStyle } from 'discord.js';

export const accentColor = parseInt(config.accentColor.replace('#', ''), 16);
export const BUTTON_PREFIX = 'ticket';
export const CONFIG_PREFIX = 'tcfg';
export const CATEGORY_BUTTON_STYLES = [ButtonStyle.Primary, ButtonStyle.Success, ButtonStyle.Secondary];
export const errorEmoji = emojis.x_;
export const checkEmoji = emojis.check;
// Lightweight Go-template syntax highlighting editor for custom command
// responses. Renders a transparent textarea over a highlighted <pre> layer so
// colours and caret stay in sync without any external highlighting library.
import { useMemo, useRef } from 'react';

const TOKEN_RE = /(\{\{-?|\-?\}\}|[{}]|"(?:[^"\\]|\\.)*"|`[^`]*`|##?[^\n]*|\/[^*][^\n]*|\S+)/g;

function tokenize(src) {
	const tokens = [];
	for (const m of src.matchAll(TOKEN_RE)) {
		tokens.push({ text: m[0], index: m.index });
	}
	return tokens;
}

function classify(prevToken, token) {
	const text = token.text;
	if (text.startsWith('{{') || text.endsWith('}}')) return 'tok-brace';
	if (text.startsWith('{{/*') || text.startsWith('{{-/*')) return 'tok-comment';
	if (text.startsWith('"') || text.startsWith('`')) return 'tok-string';
	if (/^\d+(\.\d+)?$/.test(text)) return 'tok-number';
	if (/^(true|false|nil)$/.test(text)) return 'tok-bool';
	if (/^\$/.test(text)) return 'tok-var';
	if (/^\.[A-Za-z]/.test(text)) return 'tok-field';
	if (/^#/.test(text)) return 'tok-heading';
	if (/^\/(?!\/)/) return 'tok-regex';
	if (/^[|:=,()[\]<>]/.test(text)) return 'tok-punct';
	if (/^-?\|$/.test(text)) return 'tok-pipe';

	// Keywords and known functions.
	if (KEYWORDS.has(text)) return 'tok-keyword';
	if (FUNCTIONS.has(text)) return 'tok-func';
	if (prevToken && (prevToken.text.startsWith('{{') || prevToken.class === 'tok-pipe' || prevToken.class === 'tok-brace')) return 'tok-func';
	return 'tok-plain';
}

const KEYWORDS = new Set(['if', 'else', 'end', 'range', 'with', 'while', 'try', 'catch', 'define', 'template', 'block', 'return', 'break', 'continue', 'and', 'or', 'not', 'eq', 'ne', 'lt', 'le', 'gt', 'ge', 'index', 'len', 'print', 'printf', 'println', 'call', 'slice']);
const FUNCTIONS = new Set([
	'add', 'sub', 'mult', 'div', 'fdiv', 'mod', 'pow', 'sqrt', 'cbrt', 'abs', 'min', 'max',
	'randInt', 'round', 'roundCeil', 'roundFloor', 'roundEven', 'upper', 'lower', 'title',
	'trim', 'trimPrefix', 'trimSuffix', 'split', 'joinStr', 'replace', 'replaceRegex',
	'contains', 'hasPrefix', 'hasSuffix', 'substring', 'str', 'seq', 'shuffle', 'randomChoice',
	'cslice', 'sdict', 'dict', 'cstringDict', 'json', 'jsonToSdict', 'encodeBase64',
	'decodeBase64', 'hash', 'reMatch', 'reFind', 'reFindAll', 'reReplace', 'reSplit',
	'currentTime', 'unixToTime', 'formatTime', 'formatTimeDelta', 'newDate', 'addDate',
	'monthName', 'weekdayName', 'mentionEveryone', 'mentionHere', 'mentionRoleID',
	'mentionChannelID', 'mentionUsername', 'emoji', 'sleep', 'getMember', 'getUser',
	'getUserID', 'hasRole', 'hasRoleID', 'hasRoleName', 'targetHasRole', 'targetHasRoleID',
	'targetHasRoleName', 'addRoleID', 'addRoleName', 'removeRoleID', 'removeRoleName',
	'editNickname', 'memberAbove', 'memberAboveRole', 'onlineCount', 'onlineCountBots',
	'getChannel', 'getChannelOrThread', 'getThread', 'createThread', 'closeThread',
	'openThread', 'deleteThread', 'editChannelName', 'editChannelTopic', 'getRole',
	'getRoles', 'sendMessage', 'sendMessageNoEscape', 'sendMessageRetID', 'editMessage',
	'deleteMessage', 'deleteTrigger', 'addReactions', 'addMessageReactions',
	'addResponseReactions', 'deleteMessageReaction', 'getMessage', 'dbGet', 'dbSet',
	'dbSetExpire', 'dbDel', 'dbDelByID', 'dbDelMultiple', 'dbIncr', 'dbCount',
	'dbGetPattern', 'dbGetPatternReverse', 'dbTopEntries', 'dbBottomEntries', 'dbRank',
	'execCC', 'execTemplate', 'scheduleUniqueCC', 'cancelScheduledUniqueCC',
	'componentBuilder', 'cbutton', 'cmenu', 'cmodal', 'ctextDisplay', 'ctextInput',
	'clabel', 'ccheckbox', 'ccheckboxGroup', 'cradioGroup', 'cembed', 'complexMessage',
	'complexMessageEdit', 'ephemeralResponse', 'sendResponse', 'sendResponseRetID',
	'throw', 'in', 'inFold', 'toString', 'toInt', 'toInt64', 'toFloat', 'toStr', 'toBool',
]);

function highlight(src) {
	const tokens = tokenize(src);
	let html = '';
	let last = 0;
	let prev = null;
	for (const token of tokens) {
		if (token.index > last) html += escapeHtml(src.slice(last, token.index));
		const cls = classify(prev, token);
		html += `<span class="${cls}">${escapeHtml(token.text)}</span>`;
		prev = { text: token.text, class: cls };
		last = token.index + token.text.length;
	}
	if (last < src.length) html += escapeHtml(src.slice(last));
	return html;
}

function escapeHtml(str) {
	return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default function TemplateEditor({ value, onChange, placeholder, maxLength }) {
	const textRef = useRef(null);
	const preRef = useRef(null);

	const html = useMemo(() => highlight(value ?? ''), [value]);

	const handleScroll = () => {
		if (preRef.current && textRef.current) {
			preRef.current.scrollTop = textRef.current.scrollTop;
			preRef.current.scrollLeft = textRef.current.scrollLeft;
		}
	};

	return (
		<div className="cc-editor">
			<textarea
				ref={textRef}
				className="cc-editor-area"
				value={value ?? ''}
				placeholder={placeholder}
				spellCheck={false}
				autoCapitalize="off"
				autoCorrect="off"
				maxLength={maxLength}
				onChange={(event) => onChange(event.target.value)}
				onScroll={handleScroll}
			/>
			<pre
				ref={preRef}
				className="cc-editor-highlight"
				aria-hidden="true"
				dangerouslySetInnerHTML={{ __html: html }}
			/>
		</div>
	);
}
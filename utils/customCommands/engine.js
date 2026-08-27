// Go text/template compatible engine for Blueberry custom commands.
// Implements the YAGPDB template subset: dot context, $ variables, pipes,
// if/else/range/with/while/try/catch, define/template/block/return,
// trim markers, comments, cslice/sdict custom types, and a function library
// hook. Pure module — no Discord/MongoDB imports.

export class TemplateSyntaxError extends Error {
	constructor(message) {
		super(message);
		this.name = 'TemplateSyntaxError';
	}
}

export class TemplateRuntimeError extends Error {
	constructor(message) {
		super(message);
		this.name = 'TemplateRuntimeError';
	}
}

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------

export class CSlice extends Array {
	Append(...values) {
		this.push(...values);
	}

	AppendSlice(slice) {
		if (slice == null) return;
		for (const v of slice) this.push(v);
	}

	Join(sep) {
		return this.join(sep ?? ' ');
	}
}

export class SDict {
	constructor(entries = []) {
		this._map = new Map();
		for (const [k, v] of entries) this._map.set(String(k), v);
	}

	get size() {
		return this._map.size;
	}

	hasKey(key) {
		return this._map.has(String(key));
	}

	get(key) {
		return this._map.has(String(key)) ? this._map.get(String(key)) : null;
	}

	Set(key, value) {
		this._map.set(String(key), value);
		return this;
	}

	Delete(key) {
		return this._map.delete(String(key));
	}

	Has(key) {
		return this._map.has(String(key));
	}

	Keys() {
		return new CSlice(...this._map.keys());
	}

	Get(key) {
		return this.get(key);
	}

	GetString(key) {
		const v = this.get(key);
		return v == null ? '' : String(v);
	}

	GetInt(key) {
		const v = this.get(key);
		const n = Number(v);
		return Number.isNaN(n) ? 0 : Math.trunc(n);
	}

	GetFloat(key) {
		const v = this.get(key);
		const n = Number(v);
		return Number.isNaN(n) ? 0 : n;
	}

	GetBool(key) {
		return Boolean(this.get(key));
	}

	entries() {
		return this._map.entries();
	}

	keys() {
		return this._map.keys();
	}

	values() {
		return this._map.values();
	}

	toJSON() {
		return Object.fromEntries(this._map);
	}
}

export function makeSDict(values) {
	const entries = [];
	for (let i = 0; i < values.length; i += 2) {
		entries.push([values[i], values[i + 1]]);
	}
	return new SDict(entries);
}

export function isTruthy(v) {
	if (v == null) return false;
	if (typeof v === 'boolean') return v;
	if (typeof v === 'number') return v !== 0;
	if (typeof v === 'string') return v.length > 0;
	if (Array.isArray(v)) return v.length > 0;
	if (v instanceof SDict) return v.size > 0;
	if (v instanceof Map) return v.size > 0;
	if (typeof v === 'object') return Object.keys(v).length > 0;
	return true;
}

export function fmtString(v) {
	if (v == null) return '<no value>';
	if (typeof v === 'string') return v;
	if (typeof v === 'number') return Number.isNaN(v) ? 'NaN' : String(v);
	if (typeof v === 'boolean') return v ? 'true' : 'false';
	if (v instanceof Date) return v.toISOString();
	if (v instanceof SDict) {
		const parts = [];
		for (const [k, val] of v.entries()) parts.push(`${k}:${fmtString(val)}`);
		return `map[${parts.join(' ')}]`;
	}
	if (v instanceof Map) {
		const parts = [];
		for (const [k, val] of v.entries()) parts.push(`${String(k)}:${fmtString(val)}`);
		return `map[${parts.join(' ')}]`;
	}
	if (Array.isArray(v)) return `[${v.map(fmtString).join(' ')}]`;
	if (typeof v === 'object' && v != null) {
		if (typeof v.toString === 'function' && v.toString !== Object.prototype.toString) return v.toString();
		try {
			return JSON.stringify(v);
		}
		catch {
			return String(v);
		}
	}
	return String(v);
}

// ---------------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------------

const KEYWORDS = new Set(['if', 'else', 'end', 'range', 'with', 'while', 'try', 'catch', 'define', 'template', 'block', 'return', 'break', 'continue']);

// Splits a template source into a list of items:
//   { type: 'text', value }
//   { type: 'action', tokens: [...] }
// Comments are dropped entirely.
function tokenize(src) {
	const items = [];
	let pos = 0;
	const len = src.length;

	while (pos < len) {
		const open = src.indexOf('{{', pos);
		if (open === -1) {
			items.push({ type: 'text', value: src.slice(pos) });
			break;
		}

		let text = src.slice(pos, open);
		const leftTrim = src[open + 2] === '-';
		let innerStart = open + 2;
		if (leftTrim) innerStart = open + 3;

		// Skip whitespace so `{{- /* ... */ -}}` is recognised as a comment.
		let probe = innerStart;
		while (probe < len && /\s/.test(src[probe])) probe += 1;
		const isComment = src[probe] === '/' && src[probe + 1] === '*';
		if (isComment) {
			const contentEnd = src.indexOf('*/', probe + 2);
			if (contentEnd === -1) throw new TemplateSyntaxError(`unclosed comment at position ${open}`);
			if (leftTrim) text = text.replace(/\s+$/, '');
			let rightTrim = false;
			let j = contentEnd + 2;
			while (j < len && /\s/.test(src[j])) j += 1;
			if (src[j] === '-' && src[j + 1] === '}' && src[j + 2] === '}') {
				rightTrim = true;
				pos = j + 3;
			}
			else if (src[j] === '}' && src[j + 1] === '}') {
				pos = j + 2;
			}
			else {
				throw new TemplateSyntaxError(`unclosed comment at position ${open}`);
			}
			items.push({ type: 'text', value: text });
			if (rightTrim) {
				const next = items[items.length - 1];
				next.rightTrim = true;
			}
			continue;
		}

		// Find the matching close, respecting string literals inside the action.
		let i = innerStart;
		let quote = null;
		let closeIdx = -1;
		let rightTrim = false;
		while (i < len) {
			const ch = src[i];
			if (quote) {
				if (ch === '\\' && quote === '"') {
					i += 2;
					continue;
				}
				if (ch === quote) quote = null;
				i += 1;
				continue;
			}
			if (ch === '"' || ch === '`') {
				quote = ch;
				i += 1;
				continue;
			}
			if (ch === '-' && src[i + 1] === '}' && src[i + 2] === '}') {
				closeIdx = i;
				rightTrim = true;
				break;
			}
			if (ch === '}' && src[i + 1] === '}') {
				closeIdx = i;
				break;
			}
			i += 1;
		}
		if (closeIdx === -1) throw new TemplateSyntaxError(`unclosed action at position ${open}`);

		const raw = src.slice(innerStart, closeIdx);
		const tokens = lexAction(raw);
		if (leftTrim) text = text.replace(/\s+$/, '');

		items.push({ type: 'text', value: text });
		items.push({ type: 'action', tokens });

		pos = closeIdx + 2;
		if (rightTrim) {
			items[items.length - 1].rightTrim = true;
			pos = closeIdx + 3;
		}
	}

	// Post-process: apply rightTrim by stripping leading whitespace of the next text item.
	const result = [];
	for (let idx = 0; idx < items.length; idx++) {
		const item = items[idx];
		if (item.rightTrim) {
			const next = items[idx + 1];
			if (next && next.type === 'text') {
				next.value = next.value.replace(/^\s+/, '');
			}
			delete item.rightTrim;
		}
		if (item.type === 'text' && item.value.length === 0) continue;
		result.push(item);
	}
	return result;
}

function lexAction(raw) {
	const tokens = [];
	let i = 0;
	const len = raw.length;
	const skipWs = () => {
		while (i < len && /\s/.test(raw[i])) i += 1;
	};

	while (i < len) {
		skipWs();
		if (i >= len) break;
		const ch = raw[i];

		if (ch === '|') {
			tokens.push({ type: 'pipe', value: '|' });
			i += 1;
			continue;
		}
		if (ch === '(') {
			tokens.push({ type: 'lparen', value: '(' });
			i += 1;
			continue;
		}
		if (ch === ')') {
			tokens.push({ type: 'rparen', value: ')' });
			i += 1;
			continue;
		}
		if (ch === ',') {
			tokens.push({ type: 'comma', value: ',' });
			i += 1;
			continue;
		}
		if (ch === ':' && raw[i + 1] === '=') {
			tokens.push({ type: 'assign', value: ':=' });
			i += 2;
			continue;
		}
		if (ch === '=') {
			tokens.push({ type: 'assignEq', value: '=' });
			i += 1;
			continue;
		}
		if (ch === '"') {
			// double-quoted string with escapes
			let j = i + 1;
			let out = '';
			while (j < len) {
				const c = raw[j];
				if (c === '\\') {
					const n = raw[j + 1];
					const map = { n: '\n', t: '\t', r: '\r', '\\': '\\', '"': '"', '\'': '\'', '0': '\0' };
					if (n !== undefined && map[n] !== undefined) {
						out += map[n];
						j += 2;
					}
					else if (n !== undefined) {
						out += '\\' + n;
						j += 2;
					}
					else {
						out += '\\';
						j += 1;
					}
					continue;
				}
				if (c === '"') {
					tokens.push({ type: 'string', value: out });
					i = j + 1;
					break;
				}
				out += c;
				j += 1;
			}
			if (j >= len && raw[j - 1] !== '"') throw new TemplateSyntaxError('unterminated string literal');
			continue;
		}
		if (ch === '`') {
			const close = raw.indexOf('`', i + 1);
			if (close === -1) throw new TemplateSyntaxError('unterminated raw string literal');
			tokens.push({ type: 'string', value: raw.slice(i + 1, close) });
			i = close + 1;
			continue;
		}
		if (ch === '$') {
			// $ or $name or $.a.b or $name.a.b
			let j = i + 1;
			const chain = [];
			let rootMode = false;
			if (raw[j] === '.') {
				chain.push('');
				j += 1;
				rootMode = true;
			}
			else {
				const m = /^[\w]+/.exec(raw.slice(j));
				if (m) {
					chain.push(m[0]);
					j += m[0].length;
				}
			}
			if (chain.length === 0) {
				tokens.push({ type: 'var', chain: [] });
				i += 1;
				continue;
			}
			if (rootMode) {
				while (true) {
					const m = /^[\w]+/.exec(raw.slice(j));
					if (!m) break;
					chain.push(m[0]);
					j += m[0].length;
					if (raw[j] !== '.') break;
					j += 1;
				}
			}
			else {
				while (raw[j] === '.') {
					const m = /^[\w]+/.exec(raw.slice(j + 1));
					if (!m) break;
					chain.push(m[0]);
					j += m[0].length + 1;
				}
			}
			tokens.push({ type: 'var', chain });
			i = j;
			continue;
		}
		if (ch === '.') {
			// . or .a.b
			if (!/[\w]/.test(raw[i + 1] ?? '')) {
				tokens.push({ type: 'dot', value: '.' });
				i += 1;
				continue;
			}
			let j = i;
			const chain = [];
			while (raw[j] === '.' && /[\w]/.test(raw[j + 1] ?? '')) {
				const m = /^[\w]+/.exec(raw.slice(j + 1));
				chain.push(m[0]);
				j += m[0].length + 1;
			}
			tokens.push({ type: 'field', chain });
			i = j;
			continue;
		}
		if (/[\d]/.test(ch)) {
			// Support Go-style hex literals (0xFF) and floats.
			const hex = /^0[xX][0-9a-fA-F]+/.exec(raw.slice(i));
			if (hex) {
				tokens.push({ type: 'number', value: parseInt(hex[0], 16) });
				i += hex[0].length;
				continue;
			}
			const m = /^[\d]+(?:\.[\d]+)?/.exec(raw.slice(i));
			tokens.push({ type: 'number', value: Number(m[0]) });
			i += m[0].length;
			continue;
		}
		if (/[\w]/.test(ch)) {
			const m = /^[\w]+/.exec(raw.slice(i));
			const word = m[0];
			if (word === 'true') tokens.push({ type: 'bool', value: true });
			else if (word === 'false') tokens.push({ type: 'bool', value: false });
			else if (word === 'nil') tokens.push({ type: 'nil', value: null });
			else tokens.push({ type: 'ident', value: word });
			i += m[0].length;
			continue;
		}

		throw new TemplateSyntaxError(`unexpected character "${ch}" in action`);
	}
	return tokens;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

function parseTemplate(src) {
	const items = tokenize(src);
	const parser = new Parser(items);
	const nodes = parser.parseNodes();
	return { nodes, tmpls: parser.tmpls };
}

class Parser {
	constructor(items) {
		this.items = items;
		this.pos = 0;
		this.tmpls = new Map();
	}

	parseNodes(stopKeywords = null) {
		const nodes = [];
		while (this.pos < this.items.length) {
			const item = this.items[this.pos];
			if (item.type === 'text') {
				nodes.push({ type: 'text', value: item.value });
				this.pos += 1;
				continue;
			}
			const first = item.tokens[0];
			const kw = first && first.type === 'ident' ? first.value : null;
			if (kw && stopKeywords && stopKeywords.has(kw)) break;
			this.pos += 1;
			if (kw && KEYWORDS.has(kw)) {
				nodes.push(this.parseControl(item));
			}
			else {
				nodes.push(this.parseOutput(item));
			}
		}
		return nodes;
	}

	parseOutput(item) {
		const tokens = item.tokens;
		if (tokens[0] && tokens[0].type === 'var' && tokens[1] && (tokens[1].type === 'assign' || tokens[1].type === 'assignEq')) {
			const name = tokens[0].chain.length ? tokens[0].chain[0] : '$';
			const op = tokens[1].type === 'assign' ? ':=' : '=';
			const { pipeline } = this.parsePipeline(tokens, 2);
			return { type: 'assign', name, op, pipeline };
		}
		const { pipeline } = this.parsePipeline(tokens, 0);
		return { type: 'output', pipeline };
	}

	parseControl(item) {
		const tokens = item.tokens;
		const kw = tokens[0].value;

		switch (kw) {
		case 'if': {
			const { varName, pipeline } = this.parseIfDecl(tokens, 1);
			const branches = [];
			const body = this.parseNodes(new Set(['else', 'end']));
			branches.push({ pipeline, body, varName });
			let elseNodes = [];
			while (this.atKeyword('else')) {
				const elseItem = this.items[this.pos];
				this.pos += 1;
				if (elseItem.tokens[1] && elseItem.tokens[1].type === 'ident' && elseItem.tokens[1].value === 'if') {
					const decl = this.parseIfDecl(elseItem.tokens, 2);
					const b = this.parseNodes(new Set(['else', 'end']));
					branches.push({ pipeline: decl.pipeline, body: b, varName: decl.varName });
				}
				else {
					elseNodes = this.parseNodes(new Set(['end']));
					break;
				}
			}
			this.expectKeyword('end');
			return { type: 'if', branches, elseNodes };
		}
		case 'range': {
			const { varNames, pipeline } = this.parseRangeDecl(tokens, 1, 'range');
			const body = this.parseNodes(new Set(['else', 'end']));
			let elseNodes = [];
			if (this.atKeyword('else')) {
				this.pos += 1;
				elseNodes = this.parseNodes(new Set(['end']));
			}
			this.expectKeyword('end');
			return { type: 'range', varNames, pipeline, body, elseNodes };
		}
		case 'with': {
			const { varNames, pipeline } = this.parseRangeDecl(tokens, 1, 'with');
			const body = this.parseNodes(new Set(['else', 'end']));
			let elseNodes = [];
			if (this.atKeyword('else')) {
				this.pos += 1;
				elseNodes = this.parseNodes(new Set(['end']));
			}
			this.expectKeyword('end');
			return { type: 'with', varName: varNames ? varNames[0] : null, pipeline, body, elseNodes };
		}
		case 'while': {
			const pipeline = this.requirePipeline(tokens, 1, 'while');
			const body = this.parseNodes(new Set(['end']));
			this.expectKeyword('end');
			return { type: 'while', pipeline, body };
		}
		case 'try': {
			const tryBody = this.parseNodes(new Set(['catch', 'end']));
			if (!this.atKeyword('catch')) throw new TemplateSyntaxError('missing "catch" after try');
			this.pos += 1;
			const catchBody = this.parseNodes(new Set(['end']));
			this.expectKeyword('end');
			return { type: 'try', tryBody, catchBody };
		}
		case 'define': {
			const name = this.expectString(tokens, 1, 'define');
			const body = this.parseNodes(new Set(['end']));
			this.expectKeyword('end');
			this.tmpls.set(name, body);
			return { type: 'define', name };
		}
		case 'block': {
			const name = this.expectString(tokens, 1, 'block');
			const pipeline = this.requirePipeline(tokens, 2, 'block');
			const body = this.parseNodes(new Set(['end']));
			this.expectKeyword('end');
			this.tmpls.set(name, body);
			return { type: 'template', name, pipeline };
		}
		case 'template': {
			const name = this.expectString(tokens, 1, 'template');
			let pipeline = null;
			if (tokens.length > 2) pipeline = this.requirePipeline(tokens, 2, 'template');
			return { type: 'template', name, pipeline };
		}
		case 'return': {
			let pipeline = null;
			if (tokens.length > 1) pipeline = this.requirePipeline(tokens, 1, 'return');
			return { type: 'return', pipeline };
		}
		case 'break':
			return { type: 'break' };
		case 'continue':
			return { type: 'continue' };
		default:
			throw new TemplateSyntaxError(`unknown keyword "${kw}"`);
		}
	}

	parseRangeDecl(tokens, start, kw) {
		let idx = start;
		let varNames = null;

		if (tokens[idx] && tokens[idx].type === 'var') {
			const first = tokens[idx].chain.length ? tokens[idx].chain[0] : '$';
			if (tokens[idx + 1] && (tokens[idx + 1].type === 'assign' || tokens[idx + 1].type === 'comma')) {
				idx += 1;
				varNames = [first];
				if (tokens[idx] && tokens[idx].type === 'comma') {
					const v = tokens[idx + 1];
					if (!v || v.type !== 'var') throw new TemplateSyntaxError(`expected variable after "," in ${kw}`);
					varNames.push(v.chain.length ? v.chain[0] : '$');
					idx += 2;
				}
				if (tokens[idx] && tokens[idx].type !== 'assign') throw new TemplateSyntaxError(`expected ":=" in ${kw}`);
				if (tokens[idx]) idx += 1;
			}
		}
		else if (tokens[idx] && tokens[idx].type === 'lparen') {
			// ($k, $v := ...)
			let j = idx + 1;
			const vars = [];
			if (tokens[j] && tokens[j].type === 'var') {
				vars.push(tokens[j].chain.length ? tokens[j].chain[0] : '$');
				j += 1;
			}
			if (tokens[j] && tokens[j].type === 'comma') {
				const v = tokens[j + 1];
				vars.push(v && v.type === 'var' ? (v.chain.length ? v.chain[0] : '$') : undefined);
				j += 2;
			}
			if (tokens[j] && tokens[j].type === 'rparen') j += 1;
			if (tokens[j] && tokens[j].type === 'assign') j += 1;
			varNames = vars;
			idx = j;
		}

		const { pipeline, next } = this.parsePipeline(tokens, idx);
		return { varNames, pipeline, next };
	}

	parseIfDecl(tokens, start) {
		// Supports the optional `{{if $x := pipeline}}` form.
		let idx = start;
		let varName = null;
		if (tokens[idx] && tokens[idx].type === 'var' && tokens[idx + 1] && tokens[idx + 1].type === 'assign') {
			varName = tokens[idx].chain.length ? tokens[idx].chain[0] : '$';
			idx += 2;
		}
		const { pipeline } = this.parsePipeline(tokens, idx);
		return { varName, pipeline };
	}

	parsePipeline(tokens, start) {
		const commands = [];
		let idx = start;
		while (true) {
			const { command, next } = this.parseCommand(tokens, idx);
			commands.push(command);
			idx = next;
			if (tokens[idx] && tokens[idx].type === 'pipe') {
				idx += 1;
				continue;
			}
			break;
		}
		return { pipeline: { commands }, next: idx };
	}

	parseCommand(tokens, start) {
		const first = tokens[start];
		if (!first) throw new TemplateSyntaxError('unexpected end of pipeline');

		if (first.type === 'ident') {
			const args = [];
			let idx = start + 1;
			while (idx < tokens.length) {
				if (tokens[idx].type === 'pipe' || tokens[idx].type === 'rparen') break;
				const { expr, next } = this.parseOperand(tokens, idx);
				args.push(expr);
				idx = next;
			}
			return { command: { type: 'call', name: first.value, args }, next: idx };
		}

		const { expr, next } = this.parseOperand(tokens, start);
		const args = [];
		let idx = next;
		while (idx < tokens.length) {
			if (tokens[idx].type === 'pipe' || tokens[idx].type === 'rparen') break;
			const arg = this.parseOperand(tokens, idx);
			args.push(arg.expr);
			idx = arg.next;
		}
		return { command: { type: 'value', firstExpr: expr, args }, next: idx };
	}

	parseOperand(tokens, i) {
		const t = tokens[i];
		if (!t) throw new TemplateSyntaxError('unexpected end of pipeline');

		switch (t.type) {
		case 'number':
			return { expr: { type: 'literal', value: t.value }, next: i + 1 };
		case 'string':
			return { expr: { type: 'literal', value: t.value }, next: i + 1 };
		case 'bool':
			return { expr: { type: 'literal', value: t.value }, next: i + 1 };
		case 'nil':
			return { expr: { type: 'literal', value: null }, next: i + 1 };
		case 'dot':
			return { expr: { type: 'root' }, next: i + 1 };
		case 'field':
			return { expr: { type: 'field', chain: t.chain }, next: i + 1 };
		case 'var':
			return { expr: { type: 'var', chain: t.chain }, next: i + 1 };
		case 'lparen': {
			const { pipeline, next } = this.parsePipeline(tokens, i + 1);
			if (!tokens[next] || tokens[next].type !== 'rparen') throw new TemplateSyntaxError('missing ")"');
			return { expr: { type: 'pipeline', pipeline }, next: next + 1 };
		}
		case 'ident':
			return { expr: { type: 'call', name: t.value, args: [] }, next: i + 1 };
		default:
			throw new TemplateSyntaxError('unexpected token in pipeline');
		}
	}

	requirePipeline(tokens, start, kw) {
		const { pipeline } = this.parsePipeline(tokens, start);
		if (pipeline.commands.length === 0) throw new TemplateSyntaxError(`expected pipeline after "${kw}"`);
		return pipeline;
	}

	atKeyword(kw) {
		const item = this.items[this.pos];
		if (!item || item.type !== 'action') return false;
		const first = item.tokens[0];
		return first && first.type === 'ident' && first.value === kw;
	}

	expectKeyword(kw) {
		if (!this.atKeyword(kw)) throw new TemplateSyntaxError(`expected "{{${kw}}}"`);
		this.pos += 1;
	}

	expectString(tokens, idx, kw) {
		const t = tokens[idx];
		if (!t || t.type !== 'string') throw new TemplateSyntaxError(`expected string literal after "${kw}"`);
		return t.value;
	}
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

class BreakSignal extends Error {}
class ContinueSignal extends Error {}
class ReturnSignal extends Error {
	constructor(value) {
		super('return');
		this.value = value;
	}
}

class Scope {
	constructor(parent = null) {
		this.parent = parent;
		this.map = new Map();
	}

	set(name, value) {
		this.map.set(name, value);
	}

	assign(name, value) {
		if (this.map.has(name)) {
			this.map.set(name, value);
			return;
		}
		if (this.parent) this.parent.assign(name, value);
		else this.map.set(name, value);
	}

	get(name) {
		if (this.map.has(name)) return this.map.get(name);
		if (this.parent) return this.parent.get(name);
		return undefined;
	}
}

class Executor {
	constructor(functions = {}) {
		this.funcs = functions;
	}

	async execute(ast, context) {
		this.tmpls = ast.tmpls;
		this.root = context;
		this.output = '';
		this.vars = new Scope();
		this.vars.set('$', context);
		this.maxExecSteps = 1_000_000;
		this.steps = 0;
		this.ops = 0;
		this.funcs.execTemplate = (name, data) => this.execAssociated(name, data);

		try {
			await this.execNodes(ast.nodes, context);
		}
		catch (e) {
			if (e instanceof ReturnSignal) return this.output;
			throw e;
		}
		return this.output;
	}

	async execAssociated(name, data) {
		const body = this.tmpls.get(name);
		if (!body) throw new TemplateRuntimeError(`template "${name}" not defined`);
		const start = this.output.length;
		let returned = null;
		let hasReturned = false;
		try {
			await this.withScope(async () => {
				this.vars.set('$', this.root);
				await this.execNodes(body, data);
			});
		}
		catch (e) {
			if (e instanceof ReturnSignal) {
				returned = e.value;
				hasReturned = true;
			}
			else {
				throw e;
			}
		}
		if (hasReturned) return returned;
		return this.output.slice(start);
	}

	async execNodes(nodes, dot) {
		for (const node of nodes) {
			if (++this.steps > this.maxExecSteps) {
				throw new TemplateRuntimeError('template exceeded maximum execution steps (1M)');
			}
			await this.execNode(node, dot);
		}
	}

	async execNode(node, dot) {
		switch (node.type) {
		case 'text':
			this.output += node.value;
			return;
		case 'output': {
			const { value, ok } = await this.evalPipeline(node.pipeline, dot);
			if (ok) this.output += fmtString(value);
			return;
		}
		case 'assign': {
			const { value } = await this.evalPipeline(node.pipeline, dot);
			if (node.op === ':=') this.vars.set(node.name, value);
			else this.vars.assign(node.name, value);
			return;
		}
		case 'if': {
			await this.withScope(async () => {
				for (const branch of node.branches) {
					const { value } = await this.evalPipeline(branch.pipeline, dot);
					if (branch.varName) this.vars.set(branch.varName, value);
					if (isTruthy(value)) {
						await this.execNodes(branch.body, dot);
						return;
					}
				}
				await this.execNodes(node.elseNodes, dot);
			});
			return;
		}
		case 'range': {
			await this.execRange(node, dot);
			return;
		}
		case 'with': {
			const { value } = await this.evalPipeline(node.pipeline, dot);
			if (isTruthy(value)) {
				await this.withScope(async () => {
					if (node.varName) this.vars.set(node.varName, value);
					await this.execNodes(node.body, value);
				});
			}
			else {
				await this.withScope(() => this.execNodes(node.elseNodes, dot));
			}
			return;
		}
		case 'while': {
			await this.withScope(async () => {
				let guard = 0;
				while (isTruthy((await this.evalPipeline(node.pipeline, dot)).value)) {
					if (++guard > 100_000) throw new TemplateRuntimeError('while loop exceeded 100k iterations');
					try {
						await this.execNodes(node.body, dot);
					}
					catch (e) {
						if (e instanceof BreakSignal) break;
						if (e instanceof ContinueSignal) continue;
						throw e;
					}
				}
			});
			return;
		}
		case 'try': {
			try {
				await this.execNodes(node.tryBody, dot);
			}
			catch (e) {
				if (e instanceof TemplateRuntimeError) {
					await this.withScope(() => this.execNodes(node.catchBody, e));
					return;
				}
				throw e;
			}
			return;
		}
		case 'template': {
			const body = this.tmpls.get(node.name);
			if (!body) throw new TemplateRuntimeError(`template "${node.name}" not defined`);
			const subDot = node.pipeline ? (await this.evalPipeline(node.pipeline, dot)).value : null;
			await this.withScope(async () => {
				this.vars.set('$', this.root);
				await this.execNodes(body, subDot);
			});
			return;
		}
		case 'return': {
			const value = node.pipeline ? (await this.evalPipeline(node.pipeline, dot)).value : undefined;
			throw new ReturnSignal(value);
		}
		case 'break':
			throw new BreakSignal();
		case 'continue':
			throw new ContinueSignal();
		case 'define':
			return;
		default:
			throw new TemplateRuntimeError(`unknown node type "${node.type}"`);
		}
	}

	async execRange(node, dot) {
		const { value } = await this.evalPipeline(node.pipeline, dot);

		const items = [];
		let empty = true;
		if (typeof value === 'number' && Number.isInteger(value)) {
			empty = value <= 0;
			for (let i = 0; i < value; i++) items.push([i, i]);
		}
		else if (Array.isArray(value)) {
			empty = value.length === 0;
			value.forEach((el, i) => items.push([i, el]));
		}
		else if (value instanceof SDict) {
			empty = value.size === 0;
			for (const [k, v] of value.entries()) items.push([k, v]);
		}
		else if (value instanceof Map) {
			empty = value.size === 0;
			for (const [k, v] of value.entries()) items.push([k, v]);
		}
		else if (value && typeof value === 'object') {
			const keys = Object.keys(value);
			empty = keys.length === 0;
			for (const k of keys) items.push([k, value[k]]);
		}

		if (empty) {
			await this.withScope(() => this.execNodes(node.elseNodes, dot));
			return;
		}

		await this.withScope(async () => {
			for (const [k, v] of items) {
				try {
					if (node.varNames) {
						if (node.varNames.length === 2) {
							this.vars.set(node.varNames[0], k);
							this.vars.set(node.varNames[1], v);
						}
						else {
							this.vars.set(node.varNames[0], v);
						}
					}
					await this.execNodes(node.body, v);
				}
				catch (e) {
					if (e instanceof BreakSignal) return;
					if (e instanceof ContinueSignal) continue;
					throw e;
				}
			}
		});
	}

	async withScope(fn) {
		const prev = this.vars;
		this.vars = new Scope(prev);
		try {
			await fn();
		}
		finally {
			this.vars = prev;
		}
	}

	async evalPipeline(pipeline, dot) {
		let value;
		let has = false;
		for (const command of pipeline.commands) {
			value = await this.evalCommand(command, dot, has ? value : undefined, has);
			has = true;
		}
		return { value, ok: has };
	}

	async evalCommand(command, dot, pipedValue, hasPipe) {
		if (command.type === 'call') {
			const fn = this.funcs[command.name];
			if (typeof fn !== 'function') throw new TemplateRuntimeError(`function "${command.name}" not defined`);
			const args = [];
			for (const a of command.args) args.push(await this.evalExpr(a, dot));
			if (hasPipe) args.push(pipedValue);
			return this.callFunction(fn, command.name, args);
		}

		const v = await this.evalExpr(command.firstExpr, dot);
		if (typeof v === 'function') {
			if (command.args.length > 0) {
				const args = [];
				for (const a of command.args) args.push(await this.evalExpr(a, dot));
				return this.callFunction(v, '<method>', args);
			}
			return this.callFunction(v, '<method>', []);
		}
		if (command.args.length > 0) {
			throw new TemplateRuntimeError(`can't call non-function ${fmtString(v)}`);
		}
		if (hasPipe) {
			if (typeof v === 'function') return this.callFunction(v, '<method>', [pipedValue]);
			return v;
		}
		return v;
	}

	async callFunction(fn, name, args) {
		if (typeof fn.arity === 'number' && fn.arity >= 0 && args.length !== fn.arity) {
			throw new TemplateRuntimeError(`wrong number of args for "${name}": want ${fn.arity} got ${args.length}`);
		}
		return fn(...args);
	}

	async evalExpr(expr, dot) {
		switch (expr.type) {
		case 'literal':
			return expr.value;
		case 'root':
			return dot;
		case 'field':
			return this.evalChain(dot, expr.chain);
		case 'var':
			return this.evalVarChain(expr.chain);
		case 'pipeline':
			return (await this.evalPipeline(expr.pipeline, dot)).value;
		case 'call': {
			const fn = this.funcs[expr.name];
			if (typeof fn !== 'function') throw new TemplateRuntimeError(`function "${expr.name}" not defined`);
			const args = [];
			for (const a of expr.args) args.push(await this.evalExpr(a, dot));
			return this.callFunction(fn, expr.name, args);
		}
		default:
			throw new TemplateRuntimeError(`unknown expression "${expr.type}"`);
		}
	}

	async evalVarChain(chain) {
		if (chain.length === 0) return this.vars.get('$');
		const name = chain[0];
		const v = name === '' ? this.vars.get('$') : this.vars.get(name);
		if (chain.length === 1) return v;
		return this.evalChainFrom(v, chain.slice(1));
	}

	async evalChain(base, chain) {
		return this.evalChainFrom(base, chain);
	}

	async evalChainFrom(base, chain) {
		let v = base;
		for (let i = 0; i < chain.length; i++) {
			v = getRawProperty(v, chain[i]);
			if (v == null && i < chain.length - 1) return undefined;
			if (i < chain.length - 1 && typeof v === 'function') {
				v = await this.callFunction(v, chain[i], []);
			}
		}
		return v;
	}
}

function getRawProperty(v, part) {
	if (v == null) return undefined;
	if (v instanceof SDict) {
		if (v.hasKey(part)) return v.get(part);
		if (typeof v[part] === 'function') return v[part].bind(v);
		return undefined;
	}
	if (v instanceof Map) {
		if (v.has(part)) return v.get(part);
	}
	if (typeof v === 'object' || typeof v === 'function') {
		if (typeof part === 'string' && part in v) {
			const p = v[part];
			if (typeof p === 'function' && v !== p) return p.bind(v);
			return p;
		}
	}
	return undefined;
}

// ---------------------------------------------------------------------------
// Built-in function library (Go text/template stdlib equivalents)
// ---------------------------------------------------------------------------

function compare(a, b) {
	if (a == null || b == null) {
		if (a === b) return 0;
		return NaN;
	}
	if (typeof a === 'number' && typeof b === 'number') {
		return a < b ? -1 : a > b ? 1 : 0;
	}
	if (typeof a === 'string' && typeof b === 'string') {
		return a < b ? -1 : a > b ? 1 : 0;
	}
	const aN = Number(a);
	const bN = Number(b);
	if (!Number.isNaN(aN) && !Number.isNaN(bN) && (typeof a === 'number' || typeof b === 'number')) {
		return aN < bN ? -1 : aN > bN ? 1 : 0;
	}
	return NaN;
}

function looseEqual(a, b) {
	const c = compare(a, b);
	if (!Number.isNaN(c)) return c === 0;
	return a === b;
}

const BUILTIN_FUNCTIONS = {
	eq(...args) {
		if (args.length < 2) throw new TemplateRuntimeError('eq requires at least 2 arguments');
		const first = args[0];
		for (let i = 1; i < args.length; i++) {
			if (looseEqual(first, args[i])) return true;
		}
		return false;
	},
	ne(a, b) {
		if (arguments.length < 2) throw new TemplateRuntimeError('ne requires 2 arguments');
		return !looseEqual(a, b);
	},
	lt(a, b) {
		const c = compare(a, b);
		if (Number.isNaN(c)) throw new TemplateRuntimeError('incompatible types for comparison');
		return c < 0;
	},
	le(a, b) {
		const c = compare(a, b);
		if (Number.isNaN(c)) throw new TemplateRuntimeError('incompatible types for comparison');
		return c <= 0;
	},
	gt(a, b) {
		const c = compare(a, b);
		if (Number.isNaN(c)) throw new TemplateRuntimeError('incompatible types for comparison');
		return c > 0;
	},
	ge(a, b) {
		const c = compare(a, b);
		if (Number.isNaN(c)) throw new TemplateRuntimeError('incompatible types for comparison');
		return c >= 0;
	},
	and(...args) {
		for (const a of args) {
			if (!isTruthy(a)) return a;
		}
		return args[args.length - 1];
	},
	or(...args) {
		for (const a of args) {
			if (isTruthy(a)) return a;
		}
		return args[args.length - 1];
	},
	not(v) {
		return !isTruthy(v);
	},
	len(v) {
		if (v == null) return 0;
		if (typeof v === 'string' || Array.isArray(v)) return v.length;
		if (v instanceof SDict || v instanceof Map) return v.size;
		if (typeof v === 'object') return Object.keys(v).length;
		throw new TemplateRuntimeError(`len of type ${typeof v}`);
	},
	index(container, ...keys) {
		let v = container;
		for (const key of keys) {
			if (v == null) return undefined;
			if (Array.isArray(v)) v = v[Number(key)];
			else if (v instanceof SDict) v = v.get(key);
			else if (v instanceof Map) v = v.get(key);
			else if (typeof v === 'string') v = v[Number(key)];
			else if (typeof v === 'object') v = v[String(key)];
			else v = undefined;
			if (v == null) return undefined;
		}
		return v;
	},
	slice(v, start, end) {
		if (typeof v === 'string') return v.slice(start, end);
		if (Array.isArray(v)) return v.slice(start, end);
		throw new TemplateRuntimeError(`slice of type ${typeof v}`);
	},
	call(fn, ...args) {
		if (typeof fn !== 'function') throw new TemplateRuntimeError('call: first argument is not a function');
		return fn(...args);
	},
	print(...args) {
		let out = '';
		let lastWasString = false;
		for (const a of args) {
			const s = fmtString(a);
			if (out !== '' && !(lastWasString && typeof a === 'string')) out += ' ';
			out += s;
			lastWasString = typeof a === 'string';
		}
		return out;
	},
	println(...args) {
		const parts = args.map(fmtString);
		return parts.join(' ') + '\n';
	},
	printf(...args) {
		if (args.length === 0) return '';
		return formatGo(args[0], args.slice(1));
	},
	html(v) {
		return String(v ?? '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&#34;')
			.replace(/'/g, '&#39;');
	},
	js(v) {
		return String(v ?? '')
			.replace(/\\/g, '\\\\')
			.replace(/'/g, '\\\'')
			.replace(/"/g, '\\"')
			.replace(/\n/g, '\\n')
			.replace(/\r/g, '\\r')
			.replace(/\u2028/g, '\\u2028');
	},
	urlquery(v) {
		return encodeURIComponent(String(v ?? ''));
	},
	urlescape(v) {
		return encodeURIComponent(String(v ?? ''));
	},
	urlunescape(v) {
		try {
			return decodeURIComponent(String(v ?? ''));
		}
		catch {
			return String(v ?? '');
		}
	},
};

// Minimal Go-style printf/sprintf implementation.
function formatGo(format, args) {
	let out = '';
	let argIdx = 0;
	let i = 0;

	while (i < format.length) {
		const ch = format[i];
		if (ch !== '%') {
			out += ch;
			i += 1;
			continue;
		}
		if (format[i + 1] === '%') {
			out += '%';
			i += 2;
			continue;
		}

		let j = i + 1;
		let flags = '';
		while (j < format.length && /[-+ 0#]/.test(format[j])) {
			flags += format[j];
			j += 1;
		}

		let width = '';
		let starWidth = false;
		if (format[j] === '*') {
			starWidth = true;
			j += 1;
		}
		else {
			while (j < format.length && /\d/.test(format[j])) {
				width += format[j];
				j += 1;
			}
		}

		let precision = null;
		if (format[j] === '.') {
			j += 1;
			precision = '';
			if (format[j] === '*') {
				precision = '*';
				j += 1;
			}
			else {
				while (j < format.length && /\d/.test(format[j])) {
					precision += format[j];
					j += 1;
				}
			}
		}

		const verb = format[j];
		j += 1;
		if (!verb) break;

		let w = width ? parseInt(width, 10) : null;
		if (starWidth) w = Number(args[argIdx++]);
		let prec = null;
		if (precision === '*') prec = Number(args[argIdx++]);
		else if (precision !== null) prec = parseInt(precision, 10);

		const arg = args[argIdx++];
		let rendered = formatVerb(verb, arg, prec);

		if (w !== null) {
			const padChar = flags.includes('0') && !flags.includes('-') ? '0' : ' ';
			if (rendered.length < w) {
				const pad = padChar.repeat(w - rendered.length);
				if (flags.includes('-')) rendered = rendered + pad;
				else if (padChar === '0' && /^[+-]/.test(rendered)) rendered = rendered[0] + pad + rendered.slice(1);
				else rendered = pad + rendered;
			}
		}
		out += rendered;
		i = j;
	}
	return out;
}

function formatVerb(verb, arg, prec) {
	const num = Number(arg);
	switch (verb) {
	case 'v':
	case 's':
		return fmtString(arg);
	case 'q':
		return JSON.stringify(String(arg ?? ''));
	case 'd':
	case 'i':
		return Math.trunc(Number.isNaN(num) ? 0 : num).toString();
	case 'f':
	case 'F': {
		const p = prec ?? 6;
		return Number.isNaN(num) ? 'NaN' : num.toFixed(p);
	}
	case 'e':
	case 'E': {
		const p = prec ?? 6;
		return Number.isNaN(num) ? 'NaN' : num.toExponential(p).replace('e', verb === 'E' ? 'E' : 'e');
	}
	case 'g':
	case 'G': {
		const p = prec ?? -1;
		if (Number.isNaN(num)) return 'NaN';
		const s = p >= 0 ? num.toPrecision(p) : num.toString();
		return verb === 'G' ? s.toUpperCase() : s;
	}
	case 'x':
		if (typeof arg === 'string') return Buffer.from(arg, 'utf8').toString('hex');
		return Number.isNaN(num) ? '0' : Math.trunc(num).toString(16);
	case 'X':
		if (typeof arg === 'string') return Buffer.from(arg, 'utf8').toString('hex').toUpperCase();
		return Number.isNaN(num) ? '0' : Math.trunc(num).toString(16).toUpperCase();
	case 'o':
		return Number.isNaN(num) ? '0' : Math.trunc(num).toString(8);
	case 'b':
		return Number.isNaN(num) ? '0' : Math.trunc(num).toString(2);
	case 'c':
		return String.fromCodePoint(Number.isNaN(num) ? 0 : num);
	case 't':
		return isTruthy(arg) ? 'true' : 'false';
	case 'T':
		return arg == null ? '<nil>' : arg.constructor?.name ?? typeof arg;
	case 'p':
		return '0x' + (Number.isNaN(num) ? 0 : Math.trunc(num).toString(16));
	default:
		return '%' + verb;
	}
}

export function getBuiltinFunctions() {
	return { ...BUILTIN_FUNCTIONS };
}

/**
 * Compiles and executes a template.
 * @param {string} source - The template source.
 * @param {any} context - The initial dot value.
 * @param {Object} functions - Extra functions merged over the builtins.
 * @returns {Promise<string>}
 */
export async function renderTemplate(source, context, functions = {}) {
	const ast = parseTemplate(source);
	const executor = new Executor({ ...BUILTIN_FUNCTIONS, ...functions });
	return executor.execute(ast, context);
}

export function compileTemplate(source) {
	return parseTemplate(source);
}

export async function executeCompiled(ast, context, functions = {}) {
	const executor = new Executor({ ...BUILTIN_FUNCTIONS, ...functions });
	return executor.execute(ast, context);
}

export { Executor };

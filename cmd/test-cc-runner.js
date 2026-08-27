// Realistic YAGPDB-style command integration test. Run: node cmd/test-cc-runner.js
import { renderTemplate, getBuiltinFunctions } from '../utils/customCommands/engine.js';
import { createContextFunctions } from '../utils/customCommands/functions.js';
import { createDatabase } from '../utils/customCommands/database.js';

const ctx = {
	client: { channels: { cache: new Map() }, users: { cache: new Map() } },
	guild: null,
	channel: null,
	member: {
		id: '1',
		roles: new Map(),
		user: { id: '1', username: 'bob' },
	},
	guildId: '999',
	db: createDatabase('999'),
	ccid: 1,
	scheduleExec: null,
	scheduleUnique: null,
	cancelScheduled: null,
	setEphemeral: () => undefined,
	sendModalFn: null,
	sendInteractionResponse: null,
	updateMessage: null,
	buildV2: d => d,
};

const fns = { ...getBuiltinFunctions(), ...createContextFunctions(ctx) };

const cases = [
	['simple', '{{add 1 2}}', '3'],
	['range', '{{range seq 1 5}}{{.}}{{end}}', '1234'],
	['join', '{{joinStr ", " (cslice "a" "b" "c")}}', 'a, b, c'],
	['sdict', '{{$d := sdict "a" 1}}{{$d.Get "a"}}', '1'],
	['vars', '{{$x := 5}}{{$y := 3}}{{mult $x $y}}', '15'],
	['if-else', '{{if eq 1 2}}no{{else if eq 2 2}}two{{else}}other{{end}}', 'two'],
	['string', '{{upper "hello"}} {{len "hello"}}', 'HELLO 5'],
	['printf', '{{printf "%s has %d" "bob" 3}}', 'bob has 3'],
	['hex color', '{{printf "%d" 0xF5CDF6}}', '16109046'],
	['componentBuilder flag', '{{$b := componentBuilder "text" "hi"}}{{$b.__componentsV2}}', 'true'],
	['builder Add + Get len', '{{$b := componentBuilder}}{{$b.Add "text" "a"}}{{$b.Get "text" | len}}', '1'],
	['builder AddSlice spreads', '{{$b := componentBuilder}}{{$b.AddSlice "text" (cslice "a" "b" "c")}}{{$b.Get "text" | len}}', '3'],
	['builder Get content', '{{$b := componentBuilder}}{{$b.Add "content" "x"}}{{$b.Get "content"}}', 'x'],
	['cbutton sdict form', '{{$b := cbutton (sdict "label" "D" "custom_id" "x" "style" "success")}}{{$b.style}}', 'success'],
	['cmenu type', '{{$m := cmenu "type" "channel" "custom_id" "c" "max_values" 3}}{{$m.type}}:{{$m.max_values}}', 'channel:3'],
	['cembed returns embeds', '{{$e := cembed "title" "T" "description" "D"}}{{$e.embeds | len}}', '1'],
];

let pass = 0;
let fail = 0;
for (const [label, src, expected] of cases) {
	try {
		const result = await renderTemplate(src, ctx, fns);
		if (result === expected) {
			pass += 1;
			console.log(`PASS ${label}: ${result}`);
		}
		else {
			fail += 1;
			console.log(`FAIL ${label}: got "${result}" expected "${expected}"`);
		}
	}
	catch (e) {
		fail += 1;
		console.log(`FAIL ${label}: ${e.message}`);
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
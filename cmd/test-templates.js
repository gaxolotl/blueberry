// Template engine test harness. Run: node cmd/test-templates.js
import { renderTemplate, compileTemplate, executeCompiled, getBuiltinFunctions } from '../utils/customCommands/engine.js';
import { PURE_FUNCTIONS } from '../utils/customCommands/functions.js';

let passed = 0;
let failed = 0;
const failures = [];

function assertEqual(actual, expected, label) {
	const a = JSON.stringify(actual);
	const e = JSON.stringify(expected);
	if (a === e) {
		passed += 1;
	}
	else {
		failed += 1;
		failures.push(`${label}\n  expected: ${e}\n  actual:   ${a}`);
	}
}

async function t(src, ctx, fns) {
	return renderTemplate(src, ctx, fns);
}

const fns = { ...getBuiltinFunctions(), ...PURE_FUNCTIONS };

const ctx = {
	User: { ID: '123', Username: 'alice', Mention: '<@123>', Bot: false, Discriminator: '0001' },
	Member: { Nick: 'Al', JoinedAt: '2024-01-01T00:00:00Z', Roles: ['111', '222'] },
	Guild: { ID: '999', Name: 'Blueberry Server', MemberCount: 42 },
	Message: { ID: '777', Content: 'hello world', ChannelID: '555' },
	Args: ['cmd', 'arg1', 'arg2'],
	CmdArgs: ['arg1', 'arg2'],
	StrippedMsg: 'arg1 arg2',
	CCID: 1,
	CCRunCount: 3,
	ExecData: null,
};

const cases = [
	['plain text', 'Hello, World!', 'Hello, World!'],
	['field access', '{{.User.Username}}', 'alice'],
	['field id', '{{.User.ID}}', '123'],
	['add', '{{add 1 2}}', '3'],
	['add variadic', '{{add 1 2 3}}', '6'],
	['sub', '{{sub 10 4}}', '6'],
	['mult', '{{mult 3 4}}', '12'],
	['div int', '{{div 10 4}}', '2'],
	['fdiv', '{{fdiv 10 4}}', '2.5'],
	['mod', '{{mod 10 3}}', '1'],
	['pow', '{{pow 2 10}}', '1024'],
	['sqrt', '{{sqrt 16}}', '4'],
	['max', '{{max 3 7}}', '7'],
	['min', '{{min 3 7}}', '3'],
	['multiple actions', '{{add 1 2}} {{mult 2 3}}', '3 6'],
	['pipe into last arg', '{{40| add 2}}', '42'],
	['var declare', '{{$x := 42}}{{$x}}', '42'],
	['var assign', '{{$x := 1}}{{$x = 5}}{{$x}}', '5'],
	['string var', '{{$x := "yag"}}{{$x}}', 'yag'],
	['var via pipe', '{{$x := 40| add 2}}{{$x}}', '42'],
	['if eq true', '{{if eq .User.ID "123"}}yes{{else}}no{{end}}', 'yes'],
	['if eq false', '{{if eq .User.ID "456"}}yes{{else}}no{{end}}', 'no'],
	['if lt', '{{if lt 2 3}}a{{else}}b{{end}}', 'a'],
	['if and', '{{if and (gt 5 1) (lt 5 10)}}y{{else}}n{{end}}', 'y'],
	['if or', '{{if or (eq 1 2) (eq 2 2)}}y{{else}}n{{end}}', 'y'],
	['if not', '{{if not .User.Bot}}human{{else}}bot{{end}}', 'human'],
	['else if chain', '{{if eq 1 2}}a{{else if eq 2 3}}b{{else if eq 3 3}}c{{else}}d{{end}}', 'c'],
	['if zero falsy', '{{if 0}}a{{else}}b{{end}}', 'b'],
	['if empty string falsy', '{{if ""}}a{{else}}b{{end}}', 'b'],
	['range int', '{{range 3}}x{{end}}', 'xxx'],
	['range int dot', '{{range 3}}{{.}}{{end}}', '012'],
	['range seq', '{{range seq 1 5}}{{.}}{{end}}', '1234'],
	['range k,v', '{{range $k, $v := cslice 0 1 2}}[{{$k}}:{{$v}}]{{end}}', '[0:0][1:1][2:2]'],
	['range over slice', '{{range .Args}}{{.}}|{{end}}', 'cmd|arg1|arg2|'],
	['range over roles', '{{range .Member.Roles}}{{.}}{{end}}', '111222'],
	['with', '{{with .User}}U={{.Username}}{{end}}', 'U=alice'],
	['with else', '{{with 0}}a{{else}}b{{end}}', 'b'],
	['with var', '{{with $u := .User}}{{$u.Username}}{{end}}', 'alice'],
	['upper', '{{upper "hello"}}', 'HELLO'],
	['lower', '{{lower "HELLO"}}', 'hello'],
	['len string', '{{len "hello"}}', '5'],
	['len slice', '{{len .Args}}', '3'],
	['printf', '{{printf "%s-%s" "a" "b"}}', 'a-b'],
	['printf %d', '{{printf "%d" 42}}', '42'],
	['printf precision', '{{printf "%.2f" 3.14159}}', '3.14'],
	['printf pad', '{{printf "%05d" 42}}', '00042'],
	['printf left pad', '{{printf "%-5s|" "ab"}}', 'ab   |'],
	['index', '{{index .Args 1}}', 'arg1'],
	['joinStr', '{{joinStr "," .CmdArgs}}', 'arg1,arg2'],
	['comment removed', 'a{{/* comment */}}b', 'ab'],
	['comment trims', 'a{{- /* c */ -}}  b', 'ab'],
	['left trim', '  {{- if true}}x{{end}}  ', 'x  '],
	['define+template', '{{define "say"}}{{.}}{{end}}{{template "say" "hi"}}', 'hi'],
	['execTemplate factorial', '{{define "fact"}}{{$n := 1}}{{range seq 2 (add . 1)}}{{$n = mult $n .}}{{end}}{{return $n}}{{end}}{{execTemplate "fact" 5}}', '120'],
	['top-level return', '{{$x := 5}}{{return $x}}ignored', ''],
	['block', '{{block "hi" .User}}{{.Username}}{{end}}', 'alice'],
	['while', '{{$i := 0}}{{while lt $i 5}}{{$i}}{{$i = add $i 1}}{{end}}', '01234'],
	['break in range', '{{range 5}}{{if eq . 2}}{{break}}{{end}}{{.}}{{end}}', '01'],
	['continue in range', '{{range 5}}{{if eq . 2}}{{continue}}{{end}}{{.}}{{end}}', '0134'],
	['sdict get', '{{$d := sdict "a" 1 "b" 2}}{{$d.Get "b"}}', '2'],
	['sdict len', '{{len (sdict "a" 1 "b" 2)}}', '2'],
	['global dot in range', '{{range .Args}}{{$x := .}}{{$.User.Username}}{{end}}', 'alicealicealice'],
	['docs pipe', '{{$x:=40| add 2}}{{$x}}', '42'],
	['docs eq channel', '{{if eq .Message.ChannelID 123}}y{{else}}n{{end}}', 'n'],
	['docs ne', '{{$y := 8}}{{ne 7 $y}}', 'true'],
	['docs ge', '{{$y := 8}}{{ge 7 $y}}', 'false'],
	['docs range else', '{{range (seq 1 1)}}no{{else}}output{{end}}', 'output'],
	['docs with else', '{{with false}}dot{{else}}printing here {{.CCID}}{{end}}', 'printing here 1'],
	['seq with step', '{{joinStr "," (seq 1 7 2)}}', '1,3,5'],
	['string replace', '{{replace "a-b-c" "-" "+"}}', 'a+b+c'],
	['hasPrefix', '{{hasPrefix "hello" "he"}}', 'true'],
	['base64', '{{decodeBase64 (encodeBase64 "hi")}}', 'hi'],
	['json', '{{json (sdict "a" 1)}}', '{"a":1}'],
	['reMatch', '{{reMatch "^\\d+$" "123"}}', 'true'],
	['shuffle length', '{{len (shuffle (cslice 1 2 3 4))}}', '4'],
	['randomChoice in set', '{{in (cslice 1 2 3) (randomChoice (cslice 1 2 3))}}', 'true'],
	['nested with + root', '{{with .User}}{{with $ := .}}{{.Username}}{{end}}{{end}}', 'alice'],
	['if var declare', '{{if $u := .User}}{{$u.Username}}{{else}}none{{end}}', 'alice'],
	['if var declare false', '{{if $x := 0}}a{{else}}{{$x}}b{{end}}', '0b'],
	['else if var declare', '{{if $a := 1}}{{$a}}{{else if $b := 2}}{{$b}}{{end}}', '1'],
	['hex literal', '{{0xFF}}', '255'],
	['hex literal in arg', '{{printf "%d" 0x10}}', '16'],
];

for (const [label, src, expected] of cases) {
	try {
		const result = await t(src, ctx, fns);
		assertEqual(result, expected, label);
	}
	catch (e) {
		failed += 1;
		failures.push(`${label}\n  threw: ${e.message}`);
	}
}

// compile once / execute many
{
	const ast = compileTemplate('{{add 1 2}}');
	assertEqual(await executeCompiled(ast, ctx, fns), '3', 'executeCompiled');
}

// errors
async function assertThrows(label, fn, match) {
	try {
		await fn();
		failed += 1;
		failures.push(`${label}\n  expected to throw, but did not`);
	}
	catch (e) {
		if (match && !String(e.message).includes(match)) {
			failed += 1;
			failures.push(`${label}\n  threw different error: ${e.message}`);
		}
		else {
			passed += 1;
		}
	}
}
await assertThrows('undefined function', () => t('{{nonexistent 1}}', ctx, fns), 'not defined');
await assertThrows('syntax error', () => t('{{if true}}no end', ctx, fns), 'expected');
await assertThrows('missing end', () => t('{{range 3}}x', ctx, fns), 'expected');

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
	console.log('\nFailures:');
	for (const f of failures) console.log(`  - ${f}`);
	process.exit(1);
}

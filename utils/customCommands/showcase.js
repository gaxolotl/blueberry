// Blueberry custom command showcase — interactive version
// Main panel with select menu to choose which example to view.
// Each example is loaded via a custom interaction when selected.

export const SHOWCASE_MAIN_TEMPLATE = [
	'{{/* run with the guild prefix + "showcase", e.g. -showcase */}}',
	'{{ define "badge" }}✦{{ end }}',
	'',
	'{{ $embed := sdict',
	'  "title" "Blueberry Custom Commands Showcase"',
	'  "description" "Select an example below to see it in action. Each demonstrates different message types and features."',
	'  "color" 0x5865F2',
	'  "fields" (cslice',
	'    (sdict "name" "📦 Components V2" "value" "Modern Discord layout with containers, sections, galleries, files, buttons & menus" "inline" false)',
	'    (sdict "name" "📄 Embed (cembed)" "value" "Rich embeds with fields, thumbnails, footers, colors" "inline" false)',
	'    (sdict "name" "🔘 Classic Components" "value" "Traditional action rows with buttons and select menus" "inline" false)',
	'  )',
	'  "footer" (sdict "text" "Blueberry • Use the menu below to explore")',
	'  "thumbnail" (sdict "url" "https://http.cat/200")',
	'}}',
	'',
	'{{/* Main panel with select menu */}}',
	'{{ sendMessage nil (complexMessage',
	'  "content" (cembed $embed)',
	'  "menus" (cslice',
	'    (cmenu',
	'      "custom_id" "showcase:example"',
	'      "placeholder" "Choose an example to display…"',
	'      "options" (cslice',
	'        (sdict "label" "Components V2 Layout" "value" "componentsv2" "description" "Containers, sections, galleries, files, buttons & menus" "emoji" "📦")',
	'        (sdict "label" "Embed via cembed" "value" "embed" "description" "Rich embeds with fields, thumbnails, footers" "emoji" "📄")',
	'        (sdict "label" "Classic Buttons & Menus" "value" "classic" "description" "Action rows with buttons and select menus" "emoji" "🔘")',
	'      )',
	'    )',
	'  )',
	')) }}',
	'',
	'{{/* Instructions */}}',
	'**Tip:** The examples are loaded dynamically via custom interactions. Try each one!',
].join('\n');

// Components V2 Example - triggered by interaction
export const SHOWCASE_COMPONENTS_V2_TEMPLATE = [
	'{{/* Components V2 Example - triggered via interaction */}}',
	'{{ $section := sdict "text" "🍲 **Section** with a button accessory" "button" (cbutton "label" "Set Servings" "custom_id" "sc_servings" "style" "primary") }}',
	'{{ $pasta := cslice "### Ingredients" "`200g` pasta sheets" "`500g` minced beef" "`300ml` tomato sauce" }}',
	'{{ $gallery := cslice (sdict "media" "https://http.cat/420" "description" "Step 1") (sdict "media" "https://http.cat/451" "description" "Step 2" "spoiler" true) }}',
	'{{ $file := cslice (sdict "content" "Step 1: Boil pasta\\nStep 2: Cook beef\\nStep 3: Layer & bake" "name" "lasagna_recipe") }}',
	'{{ $buttons := cslice (cbutton "label" "➖ Less Cheese" "custom_id" "sc_less" "style" "danger") (cbutton "label" "➕ More Cheese" "custom_id" "sc_more" "style" "success") }}',
	'{{ $menu := cmenu "custom_id" "sc_sauce" "placeholder" "Pick a sauce" "options" (cslice (sdict "label" "Tomato" "value" "tomato") (sdict "label" "White" "value" "bechamel" "default" true)) }}',
	'{{ sendMessage nil (componentBuilder "container" (sdict "color" 0xF5CDF6 "components" (componentBuilder "section" $section "text" $pasta "separator" true "gallery" $gallery "file" $file "separator" true "buttons" $buttons "menus" $menu))) }}',
	'',
	'**Components V2 Features Demonstrated:**',
	'• Container with accent color',
	'• Section with button accessory',
	'• Markdown text blocks',
	'• Separators (small & large)',
	'• Media gallery with spoiler',
	'• File attachment',
	'• Buttons (primary, danger, success)',
	'• String select menu',
].join('\n');

// Embed Example - triggered by interaction
export const SHOWCASE_EMBED_TEMPLATE = [
	'{{/* Embed Example - triggered via interaction */}}',
	'{{ sendMessage nil (cembed',
	'  "title" "Embed via cembed"',
	'  "description" "Built with `cembed` — title, description, color, fields, footer, thumbnail & more."',
	'  "color" 0xF5CDF6',
	'  "fields" (cslice',
	'    (sdict "name" "Members" "value" (toString .Guild.MemberCount) "inline" true)',
	'    (sdict "name" "Guild ID" "value" (toString .Guild.ID) "inline" true)',
	'    (sdict "name" "Channel" "value" .Channel.Mention "inline" true)',
	'    (sdict "name" "Your ID" "value" (toString .User.ID) "inline" true)',
	'  )',
	'  "footer" (sdict "text" "Custom Embeds • Blueberry")',
	'  "thumbnail" (sdict "url" "https://http.cat/200")',
	'  "image" (sdict "url" "https://http.cat/201")',
	')) }}',
	'',
	'**Embed Features Demonstrated:**',
	'• Title, description, color',
	'• Multiple inline fields',
	'• Footer with text',
	'• Thumbnail image',
	'• Main image',
].join('\n');

// Classic Components Example - triggered by interaction
export const SHOWCASE_CLASSIC_TEMPLATE = [
	'{{/* Classic Components Example - triggered via interaction */}}',
	'{{ sendMessage nil (complexMessage',
	'  "content" "### Classic Components (Action Rows)\\nTraditional Discord buttons and select menus in action rows.",
	'  "buttons" (cslice',
	'    (cbutton "label" "Primary" "custom_id" "sc_primary" "style" "primary")',
	'    (cbutton "label" "Secondary" "custom_id" "sc_secondary" "style" "secondary")',
	'    (cbutton "label" "Success" "custom_id" "sc_success" "style" "success")',
	'    (cbutton "label" "Danger" "custom_id" "sc_danger" "style" "danger")',
	'    (cbutton "label" "Link" "url" "https://yagpdb.xyz" "style" "link")',
	'  )',
	'  "menus" (cslice',
	'    (cmenu "custom_id" "sc_pick" "placeholder" "Choose an option…" "options" (cslice',
	'      (sdict "label" "Option A" "value" "a" "description" "First option" "emoji" "🇦"),',
	'      (sdict "label" "Option B" "value" "b" "description" "Second option" "emoji" "🇧"),',
	'      (sdict "label" "Option C" "value" "c" "description" "Third option" "emoji" "🇨" "default" true)',
	'    ))',
	'    (cmenu "custom_id" "sc_channel" "placeholder" "Pick a channel…" "type" "channel")',
	'    (cmenu "custom_id" "sc_role" "placeholder" "Pick a role…" "type" "role")',
	'    (cmenu "custom_id" "sc_user" "placeholder" "Pick a user…" "type" "user")',
	'  )',
	')) }}',
	'',
	'**Classic Components Demonstrated:**',
	'• 5 button styles (primary, secondary, success, danger, link)',
	'• String select menu with descriptions & emojis',
	'• Channel select menu',
	'• Role select menu',
	'• User select menu',
].join('\n');

// Interaction commands configuration
export const SHOWCASE_INTERACTIONS = [
	{
		// Main panel interaction - re-shows the main panel
		triggerType: 'component',
		trigger: '^showcase:main$',
		name: 'Showcase Main Panel',
		responseMode: 'componentsV2',
		responses: [SHOWCASE_MAIN_TEMPLATE],
	},
	{
		// Components V2 example
		triggerType: 'component',
		trigger: '^showcase:example:componentsv2$',
		name: 'Showcase Components V2',
		responseMode: 'componentsV2',
		responses: [SHOWCASE_COMPONENTS_V2_TEMPLATE],
	},
	{
		// Embed example
		triggerType: 'component',
		trigger: '^showcase:example:embed$',
		name: 'Showcase Embed',
		responseMode: 'componentsV2',
		responses: [SHOWCASE_EMBED_TEMPLATE],
	},
	{
		// Classic components example
		triggerType: 'component',
		trigger: '^showcase:example:classic$',
		name: 'Showcase Classic',
		responseMode: 'componentsV2',
		responses: [SHOWCASE_CLASSIC_TEMPLATE],
	},
	{
		// Demo buttons in Components V2 example
		triggerType: 'component',
		trigger: '^sc_(servings|less|more)$',
		name: 'Showcase Demo Buttons',
		responseMode: 'componentsV2',
		responses: [
			'{{ $clicked := .Interaction.StrippedID }}' +
			'{{ if eq $clicked "servings" }}**You clicked: Set Servings** 🍽️' +
			'{{ else if eq $clicked "less" }}**Less Cheese** 🧀➖' +
			'{{ else }}**More Cheese** 🧀➕{{ end }}' +
			'\\n\\n*This is a demo button response via custom interaction.*'
		],
	},
	{
		// Demo select menu in Components V2 example
		triggerType: 'component',
		trigger: '^sc_sauce$',
		name: 'Showcase Demo Sauce Menu',
		responseMode: 'componentsV2',
		responses: [
			'{{ $sauce := index .Interaction.Values 0 }}' +
			'{{ if eq $sauce "tomato" }}**Selected: Tomato Sauce** 🍅' +
			'{{ else }}**Selected: White Sauce** 🥛{{ end }}' +
			'\\n\\n*Select menu interaction works!*'
		],
	},
	{
		// Demo classic buttons
		triggerType: 'component',
		trigger: '^sc_(primary|secondary|success|danger)$',
		name: 'Showcase Classic Buttons',
		responseMode: 'componentsV2',
		responses: [
			'{{ $style := .Interaction.StrippedID }}' +
			'**Button clicked:** {{ title $style }}' +
			'{{ if eq $style "primary" }} 🔵{{ else if eq $style "secondary" }} ⚪{{ else if eq $style "success" }} 🟢{{ else }} 🔴{{ end }}' +
			'\\n\\n*Ephemeral response from classic button.*'
		],
	},
	{
		// Demo classic select menus
		triggerType: 'component',
		trigger: '^sc_(pick|channel|role|user)$',
		name: 'Showcase Classic Menus',
		responseMode: 'componentsV2',
		responses: [
			'{{ $menu := .Interaction.StrippedID }}' +
			'{{ $values := .Interaction.Values }}' +
			'{{ if eq $menu "pick" }}**Selected:** {{ index $values 0 }}' +
			'{{ else if eq $menu "channel" }}**Channel:** <#{{ index $values 0 }}>' +
			'{{ else if eq $menu "role" }}**Role:** <@&{{ index $values 0 }}>' +
			'{{ else }}**User:** <@{{ index $values 0 }}>{{ end }}' +
			'\\n\\n*Select menu interaction works!*'
		],
	},
];

// Main showcase command configuration
export const SHOWCASE_CONFIG = {
	triggerType: 'command',
	trigger: 'showcase',
	name: 'Feature Showcase',
	caseSensitive: false,
	editTrigger: false,
	responseMode: 'componentsV2',
	restrictions: {},
	responses: [SHOWCASE_MAIN_TEMPLATE],
};
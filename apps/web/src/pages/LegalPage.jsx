const OPERATOR = import.meta.env.VITE_LEGAL_ENTITY || 'the operator of Blueberry';
const EMAIL = import.meta.env.VITE_PRIVACY_EMAIL || 'privacy contact not configured';
const JURISDICTION = import.meta.env.VITE_LEGAL_JURISDICTION || 'the operator’s applicable jurisdiction';
const UPDATED = '5 August 2026';

const privacySections = [
	['Who we are', `Blueberry is operated by ${OPERATOR}. For privacy requests, contact ${EMAIL}. When a Discord server enables Blueberry, that server’s owner or administrator may also act as a controller for server content processed through the bot.`],
	['Data we process', 'We process Discord account identifiers, username, avatar, OAuth credentials, manageable-server metadata, ticket messages and attachments, ticket activity, invite-join records, server configuration, and changelog integration settings. GitHub tokens are stored as write-only integration credentials and are never returned by the dashboard.'],
	['Purposes and lawful bases', 'We process account and server data to authenticate users, provide requested bot features, secure the service, prevent abuse, and maintain support and audit functions. Depending on context, the lawful basis is performance of a contract, legitimate interests in operating and securing the service, compliance with legal obligations, or consent where specifically requested.'],
	['Sharing and processors', 'Data may be processed by Discord, GitHub when a repository source is configured, MongoDB or the selected database host, and the infrastructure provider hosting Blueberry. These providers process data under their own terms and may process data outside the EEA using applicable safeguards such as adequacy decisions or Standard Contractual Clauses. Blueberry does not sell personal data.'],
	['Retention', 'OAuth sessions are retained until logout, expiry, or account deletion. Guild configuration is retained while the service is installed or needed by the guild. Ticket transcripts and invite audit records are retained for the guild’s operational needs and should be subject to the guild’s configured or documented retention period. Backups may persist for a limited recovery period before rotation. Data may be retained longer where required for legal obligations, security, or legal claims.'],
	['Your GDPR rights', 'Where the GDPR applies, you may request access, correction, erasure, restriction, portability, or object to processing based on legitimate interests. You may withdraw consent without affecting prior processing. You may also complain to your local supervisory authority. The dashboard provides a JSON export and account deletion. We may verify identity and may retain narrowly necessary data where law permits or requires it.'],
	['Deletion behavior', 'Account deletion revokes Discord OAuth access, deletes all dashboard sessions for your Discord account, and anonymizes matching identifiers in locally stored tickets and invite records. It does not delete guild-owned configuration or content still held by Discord, GitHub, server administrators, downloaded transcript copies, or third parties. Contact the relevant server administrator or platform for those copies.'],
	['Security and children', 'We use access controls and secret redaction appropriate to the service, but no system is completely secure. Blueberry is not directed to children below the minimum age required by Discord or local law. Do not use the service if you cannot lawfully agree to its terms.'],
	['Changes and contact', `We may update this policy and will revise the date above. Material changes should be communicated through the service. Questions and requests can be sent to ${EMAIL}.`],
];

const termsSections = [
	['Agreement and eligibility', `These Terms govern use of Blueberry, operated by ${OPERATOR}. You must meet Discord’s minimum age, have authority to configure the relevant server, and comply with applicable law, Discord’s terms, and GitHub’s terms when using GitHub integrations.`],
	['Service and acceptable use', 'Blueberry provides ticketing, invite analytics, changelog tracking, and related administration tools. Do not use it to violate rights, collect unlawful content, distribute malware, evade platform limits, harass users, access systems without permission, or process data without a valid lawful basis and required notices.'],
	['Server administrator responsibilities', 'Server administrators control feature configuration, access, retention, and how server content is used. They must provide appropriate notices to members, limit staff access, handle requests for Discord-hosted or downloaded copies, and avoid entering secrets or sensitive personal data unless necessary and lawful.'],
	['Credentials and security', 'You are responsible for safeguarding Discord sessions and GitHub tokens. Each GitHub source requires a token with only the repository access needed. Notify the operator and rotate credentials promptly if compromise is suspected.'],
	['Availability and changes', 'The service may change, be suspended, or discontinue. Features may depend on Discord, GitHub, hosting providers, and network availability. We do not guarantee uninterrupted or error-free operation, and you should retain independent copies of data you must preserve.'],
	['Intellectual property', 'Blueberry and its original code, branding, and interface remain owned by their respective rights holders and are licensed as stated in the project license. You retain rights in content you submit and grant the permissions necessary to process and display it for the service.'],
	['Disclaimer and liability', 'To the extent permitted by law, the service is provided as is and without implied warranties. The operator is not liable for indirect, incidental, special, consequential, or lost-profit damages. Nothing excludes liability that cannot lawfully be excluded, including mandatory consumer rights.'],
	['Termination', 'You may stop using the service, remove the bot, log out, or delete your dashboard account. Access may be suspended for security, legal, abuse, or platform-compliance reasons. Provisions that by nature survive termination remain effective.'],
	['Governing law and contact', `These Terms are governed by ${JURISDICTION}, without overriding mandatory protections available in your country of residence. Contact ${EMAIL} with legal or privacy questions.`],
];

export default function LegalPage({ type }) {
	const privacy = type === 'privacy';
	const sections = privacy ? privacySections : termsSections;
	const plainText = new URLSearchParams(window.location.search).get('format') === 'text';
	const title = privacy ? 'Privacy Policy' : 'Terms of Service';
	const text = [
		title.toUpperCase(),
		`Last updated ${UPDATED}`,
		'',
		...sections.flatMap(([sectionTitle, content], index) => [`${index + 1}. ${sectionTitle}`, content, '']),
	].join('\n');

	if (plainText) {
		return (
			<main className="legal-plain-page">
				<nav><a href={`/${type}`}>Styled version</a><a href="/">Return to Blueberry</a></nav>
				<pre>{text}</pre>
			</main>
		);
	}

	return (
		<div className="app legal-app">
			<TitleBar />
			<div className="app-body">
				<nav className="activitybar legal-activitybar">
					<a className="activitybar-item" href="/" title="Dashboard"><LayoutDashboard size={22} strokeWidth={1.5} /></a>
					<a className="activitybar-item active" href={`/${type}`} title={title}>{privacy ? <ShieldCheck size={22} strokeWidth={1.5} /> : <FileText size={22} strokeWidth={1.5} />}</a>
				</nav>
				<aside className="sidebar legal-sidebar">
					<div className="sidebar-header"><span className="sidebar-title">Legal</span></div>
					<div className="sidebar-section">
						<span className="sidebar-section-label">Documents</span>
						<a className={`sidebar-item${privacy ? ' active' : ''}`} href="/privacy"><ShieldCheck size={16} /><span className="sidebar-item-name">Privacy Policy</span></a>
						<a className={`sidebar-item${privacy ? '' : ' active'}`} href="/terms"><FileText size={16} /><span className="sidebar-item-name">Terms of Service</span></a>
					</div>
					<div className="sidebar-section legal-sidebar-actions">
						<span className="sidebar-section-label">Options</span>
						<a className="sidebar-item" href={`/${type}?format=text`}><FileText size={16} /><span className="sidebar-item-name">Plain text</span></a>
						<a className="sidebar-item" href="/"><ArrowLeft size={16} /><span className="sidebar-item-name">Back to dashboard</span></a>
					</div>
				</aside>
				<main className="main-content">
					<div className="view legal-view">
						<h1 className="view-title">{title}</h1>
						<p className="view-subtitle">{privacy ? 'How Blueberry handles personal data and how you can exercise your rights.' : 'The rules for using Blueberry responsibly.'}</p>
						<section className="panel legal-summary"><span className="badge badge-open">{privacy ? 'GDPR' : 'SERVICE'}</span><span>Last updated {UPDATED}</span></section>
						{sections.map(([sectionTitle, content], index) => <section className="panel legal-section" key={sectionTitle}><span className="legal-section-number">{String(index + 1).padStart(2, '0')}</span><div><h2 className="panel-title">{sectionTitle}</h2><p>{content}</p></div></section>)}
						<div className="account-legal-links"><a href={privacy ? '/terms' : '/privacy'}>{privacy ? 'Read Terms of Service' : 'Read Privacy Policy'}</a><a href="/">Return to Blueberry</a></div>
					</div>
				</main>
			</div>
		</div>
	);
}
import { ArrowLeft, FileText, LayoutDashboard, ShieldCheck } from 'lucide-react';
import TitleBar from '../components/TitleBar.jsx';

export default {
	clientId: '1234567890123456789',
	guildId: '1234567890123456789',
	accentColor: '#476797',
	errorColor: '#FF0000',
	patchNotes: {
		maxRssFeeds: 3,
		maxGithubTrackers: 3,
		maxReleasesPerPoll: 3,
		pollIntervalSeconds: 300,
		githubPollIntervalSeconds: 300,
		rssRateLimitRetrySeconds: 300,
		requestTimeoutMs: 15_000,
	},
	ticketAutomation: {
		maxRules: 20,
		maxPatternLength: 200,
	},
};

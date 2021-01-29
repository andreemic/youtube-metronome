// This background page runs like a separate page with a js script
chrome.runtime.onInstalled.addListener(function() {
	chrome.declarativeContent.onPageChanged.removeRules(undefined, function() {
		chrome.declarativeContent.onPageChanged.addRules([{
			conditions: [new chrome.declarativeContent.PageStateMatcher({
				pageUrl: {hostEquals: 'www.youtube.com', pathContains: 'watch'},
				css: ['#player']
			})], 
			actions: [new chrome.declarativeContent.ShowPageAction()]
		}]);
	});
});


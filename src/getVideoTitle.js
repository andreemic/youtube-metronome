chrome.runtime.sendMessage({
	vidTitle: document.querySelector("#container > h1 > yt-formatted-string").innerHTML
}, function(res) {
	console.log(res.farewell)
});

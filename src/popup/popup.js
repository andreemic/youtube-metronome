    /*
 * Global variables
 */
var spinner, loadingMsg, playBtn, con, playBtnVal;
var body, bodyOverlay;
var restoreButton, restoreButtonArea;
var navCon, navButton, navOpen;
var followVidInput, followVidCheckbox, autoSyncInput, autoSyncCheckbox, creditsNavItem;
var bpmText, bpmLabel, bpmOverlay, bpmTapper;
var songTextCon, songText, keyText;
var errorMsg, shortMsg;
var bpmErrorCon, bpmErrorSong, bpmErrorPrompt, bpmErrorInput, titleErrorPrompt, titleErrorInput, titleErrorButton;
var wrongSongPrompt, customSongCon, newTitleInput, submitNewTitleButton;
var creditsCon;


var tabId, port;
var firstTime = false;


const error_messages = {
	NOT_FOUND: "Don't know that song :(",
	TOO_MANY_REQ: "Wait a minute. You're going too fast.",
	SERVER_ERROR: "My server is broken... Try later?"
};
const MAX_BPM = 300;
const MIN_BPM = 20;
const WRONG_SONG_PROMPT = "Wrong song?";
const INPUT_SONG_PROMPT = "Input song title"


/*
 * HTMLElement prototype extensions
 */
HTMLElement.prototype.hide = function() {
	this.style.display = 'none';
};
HTMLElement.prototype.hideFade = function(ms) {
  this.style.opacity = '0';
  setTimeout(() => this.style.display = 'none', ms);
};
HTMLElement.prototype.unhide = function() {
	this.style.display = '';
};
HTMLElement.prototype.unhideFade = function() {
	this.style.display = '';
  this.style.opacity = '1';
};

/*
 * Returns average of dist. of each consequent element to the next
 */
function cscDiffAvg(arr) {
    if (arr.length < 2) return 0;
    let sum = 0;
    for (let i = 0; i < arr.length - 1; i++) {
        let d = arr[i+1] - arr[i];
        sum += d;
    }
    return sum / (arr.length - 1);
}

/*
 * Divides a by 2 until a < b.
 * @param {number} a 
 * @param {number} b
 */
function scaleBelow(a, b) {
   return a / 2**Math.ceil(Math.log2(a/b)); 
}

/*
 * DOM Helpers.
 */

var invalidViewTimeout;
/*
 * Shows a red border around the body.
 */
function showInvalid() {
    body.classList.add('invalid');
    if (invalidViewTimeout) {
        clearTimeout(invalidViewTimeout);
    }
    invalidViewTimeout = setTimeout(() => body.classList.remove('invalid'), 800);
}

function toggleNav() {
    if (navOpen) {
        navCon.classList.remove('open');
        bodyOverlay.classList.remove('active');
        navButton.classList.remove('open');
        closeCredits();
        navOpen = false;
    } else {
        navCon.classList.add('open');
        bodyOverlay.classList.add('active');
        navButton.classList.add('open');
        navOpen = true;
    }
}
function openCredits() {
    //Hide nav but do not change the navButton
    navCon.classList.remove('open');
    bodyOverlay.classList.remove('active');
    creditsCon.unhide();
}
function closeCredits() {
    creditsCon.hide();
}

function removeNL(str) {
    return str.replace(/(\r\n|\n|\r)/gm, "");
}
function preventNL(e) {
    e.target.value = removeNL(e.target.value); //prevent new line input
}

var state = {
	bpm: undefined,	//bpm of the song
	bpmArtist: undefined,	//title of the song, from which the bpm is taken
	bpmTitle: undefined,	//title of the song, from which the bpm is taken
	running: false,	//metronome running state
	loading: true,	//UI loading state
	error: undefined,
    settings: {
        followVid: true
    }
};

//Connects to content script 
function connectPort(firstTimeConn, second_try) {
	if (!tabId) return;

	let name = firstTimeConn ? 'first_time_conn' : 'subseq_conn';

	// Here I'm misusing the `name` field that is going to be passed 
	// into the `onConnect` event in the content script to mark first time connections.
	// All connections that aren't first, will instantly get a message with the up-to-date state.

	port = chrome.tabs.connect(tabId, {name: name});
	port.onDisconnect.addListener((p) => {
		console.log('PORT FAILED TO CONNECT');
		if (chrome.runtime.lastError) {
			console.log(chrome.runtime.lastError);
		}
	});
	port.onMessage.addListener(handleMessage);
}


function showError(msg) {
	errorMsg.unhide();
	errorMsg.innerHTML = msg;
}

/*
 * Listener triggered once content script sends a message
 */
function handleMessage(req, sender, sendRes) {
    resetDOM();
	let CState = req.state; //Content Script State
    console.log(CState);

	//Check for errors
	if (chrome.runtime.lastError) {
		showError("Issue receiving message from content script. (Error 2)");
		return;
	} else if (CState.error) {
        switch (CState.error) {
            case "NOT_FOUND":
                //Display manual bpm entry interface
                bpmErrorCon.unhide();
                bpmErrorSong.innerHTML = CState.title;
                break;
            default:
                showError(error_messages[CState.error] || `Try again after reloading the page.: <i>${CState.error}</i>`);
        }
		return;
	}

    //Handle settings
    if (CState.settings) {
        followVidCheckbox.checked = CState.settings.followVid;
        autoSyncCheckbox.checked = CState.settings. autoSync;
    }

  //Update short message
  if (CState.shortMsg) {
    shortMsg.innerText = CState.shortMsg;
    shortMsg.unhide();
    setTimeout(() => shortMsg.hideFade(300), 2000);
  }

	//Update spinner 
	if (CState.loading === false) {
		con.unhide();
	} else if (CState.loading === true) {
		spinner.unhide();
    loadingMsg.innerText = CState.loadingMsg || '';
	}


	//Update metronome running state
	playBtnVal.checked = !CState.running;

	//Update Title and Key display
	if (CState.bpmArtist && CState.bpmTitle) {
        songTextCon.unhide();
		songText.innerHTML = `${CState.bpmTitle} by ${CState.bpmArtist} ${CState.customBPM ? '(Custom Bpm)' : ''}`;
        
        wrongSongPrompt.innerText = WRONG_SONG_PROMPT;
	} else {
        wrongSongPrompt.innerText = INPUT_SONG_PROMPT;
    }

    if (CState.keyString) {
        keyText.innerHTML = CState.keyString;
    }

	//Update BPM display
	bpmText.value = CState.bpm;

	//Handle Events.
	switch (req.event) {
		case "navigated":
			window.close();
			break;
		case undefined:
			break;
		default:
			console.error(`Unhandeled event from content script: ${req.event}`);
	}

    //Display restore button
	if (CState.altered) {
        restoreButton.style.display = "";
        restoreButtonArea.unhide();
    }

    //merge received state and local state
	state = CState; 
};




function onWindowLoad() {
	chrome.tabs.query({active: true}, (tabs) => {
		tabId = tabs[0].id;
		//Send one-time message to see if content script is already in place
		chrome.tabs.sendMessage(tabId, {event: 'popup-ready'}, {}, (response) => {
			let lastError = chrome.runtime.lastError;
			if (lastError) {
				console.log(lastError);
				//Content scripts are not in place. Execute them.

				chrome.tabs.executeScript(null, {
					file: 'src/util.js' //helper functions
				});
				chrome.tabs.executeScript(null, {
					file: 'src/metro.js' //metronome-sound script
				});
				chrome.tabs.executeScript(null, {
					file: 'src/metroCScript.js' //main script, gateway to pop-up
				});
				
				//Now waiting on message with 'port-ready' event from metroCScript 
				console.log('Running first time!');
				firstTime = true;
			} else if (response.event == 'port-ready') {
				//Content scripts already in place.

				console.log('Running not first time!');
				connectPort(false);
			}
		});
	});

    // Add maxlength support to number inputs
    let inputElements = document.querySelectorAll("input[type=number]");     
    console.log(inputElements);
    for (el of inputElements) { 
        el.onkeypress = (e) => {
            let me = e.target;

            if (me.value.length == me.maxLength && e.keyCode >= 48 && e.keyCode <= 57) { 
                return false;
            }
        };
    }



    body = document.body;
    bodyOverlay = document.getElementById('bodyOverlay');
    spinner = document.getElementById('spinner');
    loadingMsg = document.getElementById('loadingMsg');
    
    // Nav bindings
    navCon = document.getElementById('navCon');
    navButton = document.getElementById('navButton');
    navOpen = false;
    navButton.addEventListener('click', toggleNav);

    followVidInput = document.getElementById('followVidInput');
    followVidCheckbox = document.getElementById('followVidCheckbox');
    followVidCheckbox.checked = state.settings.followVid;
    followVidInput.addEventListener('click', () => {
        followVidCheckbox.checked = !followVidCheckbox.checked;
        state.settings.followVid = followVidCheckbox.checked;
        sendSettings();
        toggleNav();
    });

    autoSyncInput = document.getElementById('autoSyncInput');
    autoSyncCheckbox = document.getElementById('autoSyncCheckbox');
    autoSyncCheckbox.checked = state.settings.autoSync;
    autoSyncInput.addEventListener('click', () => {
        autoSyncCheckbox.checked = !autoSyncCheckbox.checked;
        state.settings.autoSync= autoSyncCheckbox.checked;
        sendSettings();
        toggleNav();
    });

    creditsNavItem = document.getElementById('creditsNavItem');
    creditsNavItem.addEventListener('click', openCredits);


    // Main View
	con = document.getElementById('con');

    restoreButton = document.getElementById('restoreButton');
    restoreButtonArea = document.getElementById('restoreButtonArea');
    restoreButtonArea.addEventListener('click', () => {
        sendRestore();
    });

	playBtn = document.getElementById('playBtn');
	playBtnVal = document.getElementById('playpause');
	playBtnVal.checked = state.running;
	playBtn.addEventListener('mousedown', (e) => {
        if (playBtnVal.checked = !playBtnVal.checked) {
            sendStop();
        } else {
            sendStart();
        }
	});
    playBtn.addEventListener('mouseup', () => {
        playBtnVal.checked = !playBtnVal.checked;
    });

    songTextCon = document.getElementById('songTextCon');
	songText = document.getElementById('songText');
	keyText = document.getElementById('keyText');

    // Interactive BPM label
	bpmText = document.getElementById('bpm');
    bpmLabel = document.getElementById('bpmLabel');
    bpmOverlay = document.getElementById('bpmOverlay');
    bpmText.addEventListener('focus', () => {
        bpmLabel.classList.add('hidden');
        submitNewBPMButton.unhide();
    });
    submitNewBPMButton = document.getElementById('submitNewBPMButton');
    submitNewBPMButton.addEventListener('mousedown', (e) => {
        e.preventDefault();
    });
    submitNewBPMButton.addEventListener('click', () => { 
        //Send bpm and Clear bpm input style
        sendBpm(bpmText.value)

        submitNewBPMButton.hide();
        bpmLabel.classList.remove('hidden');
        bpmLabel.value = state.bpm;
        bpmText.blur();
    });
    bpmText.addEventListener('keyup', (e) => {
        if (e.keyCode == 13) { //Enter
            //Send bpm and Clear bpm input style
            sendBpm(bpmText.value);

            submitNewBPMButton.hide();
            bpmLabel.classList.remove('hidden');
            bpmLabel.value = state.bpm;
        }
    });
	bpmText.addEventListener('blur', (e) => {
        submitNewBPMButton.hide();
        bpmLabel.classList.remove('hidden');
        bpmText.value = state.bpm;
	});
       
    // BPM tapper
    bpmTapper = document.getElementById('bpmTapper');
    bpmTapper.taps = [];
    bpmTapper.addEventListener('click', () => {
        bpmText.classList.add('force-focus');
        bpmLabel.classList.add('hidden');
        submitNewBPMButton.unhide();
        

        let t = Date.now();

        let tapsNum = bpmTapper.taps.length;
        let lastTap = bpmTapper.taps[tapsNum - 1];
        if (tapsNum > 0 && t - lastTap > 4000) {
            //4s since last tap, start over
            bpmTapper.taps = [];
        } else if (state.running) {
            //Stop metronome if running.
            sendStop(); 
        }
        bpmOverlay.style.display = "none";
  
        bpmTapper.taps.push(t);
        tapsNum++;

        //Calculate average dt between taps
        let avgDT = cscDiffAvg(bpmTapper.taps);
        let bpm = Math.round(60 / (avgDT / 1000));
        if (avgDT > 0) {
            bpmText.value = bpm;
        }

        //Update tap icon
        bpmTapper.className = 'bpm-tapper';
        let numToShow = bpmTapper.taps.length % state.timeSig + 1;
        bpmTapper.classList.add(`bpm-tapper-${tapsNum == 1 ? 1 : numToShow}`);
    });
    bpmTapper.addEventListener('mouseleave', () => {
        bpmTapper.taps = [];
        bpmTapper.className = 'bpm-tapper';
    });
    body.addEventListener('mouseleave', () => {
        //Return to normal bpm input style in case it was changed by bpm tapping
        bpmOverlay.style.display = '';
        bpmText.classList.remove('force-focus');
        bpmText.value = state.bpm;
        submitNewBPMButton.hide();
        bpmLabel.classList.remove('hidden');
        bpmText.blur();
    });

    // Manual Title Input UI
    wrongSongPrompt = document.getElementById('wrongSongPrompt');
    customSongCon = document.getElementById('customSongCon');
    wrongSongPrompt.addEventListener('click', () => {
        //Open custom song title view
        sendStop();
        resetDOM();
        customSongCon.unhide();
        newTitleInput.focus();
    });

	errorMsg = document.getElementById('errorMsg');
  shortMsg = document.getElementById('shortMsg');
  

    // Wrong Bpm View
    bpmErrorCon = document.getElementById('bpmErrorCon');
    bpmErrorSong = document.getElementById('bpmErrorSong');

    bpmErrorPrompt = document.getElementById('bpmErrorPrompt');
    bpmErrorInput= document.getElementById('bpmErrorInput');
    bpmErrorButton = document.getElementById('bpmErrorButton');
    bpmErrorPrompt.addEventListener('click', () => {
        //Hide Prompts, show input
        bpmErrorPrompt.hide();
        titleErrorPrompt.hide();
        
        bpmErrorInput.unhide();
        bpmErrorButton.unhide();

        bpmErrorInput.focus();
    });
    bpmErrorButton.addEventListener('click', () => { 
        sendBpm(bpmErrorInput.value);
    });
    bpmErrorInput.addEventListener('keyup', (e) => {
        if (e.keyCode == 13) { //Enter
            bpmErrorInput.value = bpmErrorInput.value.trim();
            sendBpm(bpmErrorInput.value);
        }
    });

    titleErrorPrompt = document.getElementById('titleErrorPrompt');
    titleErrorInput= document.getElementById('titleErrorInput');
    titleErrorInput.addEventListener('input', preventNL);
    titleErrorInput.addEventListener('keyup', (e) => {
        if (e.keyCode == 13) {
            if (sendSongTitle(titleErrorInput.value)) {
                titleErrorInput.value = '';
            }
        } else if (titleErrorInput.value.length != 0) {
            titleErrorButton.classList.add('active');
        } else {
            titleErrorButton.classList.remove('active');
        }
    });
    titleErrorButton = document.getElementById('titleErrorButton');
    titleErrorButton.addEventListener('click', () => {
        if(sendSongTitle(titleErrorInput.value)) {
            titleErrorInput.value = '';
        }
    });
    titleErrorPrompt.addEventListener('click', () => {
        //Hide prompts, show input.
        titleErrorPrompt.hide();
        bpmErrorPrompt.hide();

        titleErrorInput.unhide();
        titleErrorButton.unhide();

        titleErrorInput.focus();
    });

    // Custom Song Title View
    newTitleInput = document.getElementById('newTitleInput');
    submitNewTitleButton = document.getElementById('submitNewTitleButton');
    newTitleInput.addEventListener('input', preventNL);
    newTitleInput.addEventListener('keyup', (e) => { 
        if (e.keyCode == 13) { //Enter
            if (sendSongTitle(newTitleInput.value)) {
                newTitleInput.value = '';
            }
        } else if (newTitleInput.value.length != 0) {
            submitNewTitleButton.classList.add('active');
        } else {
            submitNewTitleButton.classList.remove('active');
        }
    });
    submitNewTitleButton.addEventListener('click', () => {
        if (sendSongTitle(newTitleInput.value)) {
            newTitleInput.value = '';
        }
    });

    //Credits
    creditsCon = document.getElementById('creditsCon');

    resetDOM();
    spinner.unhide();
}

/*
 * Hide all DOM parts. Basically return to a zero state.
 */
function resetDOM() {
    spinner.hide();
    con.hide();
    errorMsg.hide();
    shortMsg.hide();
    customSongCon.hide();
    songTextCon.hide();

    bpmErrorCon.hide();
    bpmErrorInput.hide();
    bpmErrorButton.hide();
    titleErrorInput.hide();
    titleErrorButton.hide();
    bpmErrorPrompt.unhide();
    titleErrorPrompt.unhide();

    submitNewBPMButton.hide();

    restoreButtonArea.hide();
    restoreButton.style.display = "none";

    creditsCon.hide();
}


/*
 * Accept one-time message from content script to avoid creating a port before content script is ready.
 */
chrome.runtime.onMessage.addListener((req, sender, sendRes) => {
	if (req.event && req.event == "port-ready") {
		connectPort(firstTime);
	}
});

function sendBpm(bpm) {
    if (bpm < MIN_BPM) { 
        showInvalid();
        return false;
    } else if (bpm > MAX_BPM) {
        bpm = scaleBelow(bpm, MAX_BPM); 
    }

    console.log(`Sending BPM ${bpm}`);
    try {
        port.postMessage({
            action: "ENTER_BPM",
            bpm: bpm
        });
        return true;
    } catch (e) {
        console.log(e.message);
        showInvalid();
        return false;
    }
}
function sendSongTitle(title) {
    if (title.trim().length == 0 || typeof(title) != 'string') {
        showInvalid();
        return false;
    };

    console.log(`Sending title ${title}`);
    try {
        port.postMessage({
            action: "ENTER_TITLE",
            title: title
        });
        return true;
    } catch (e) {
        console.log(e.message);
        showInvalid();
        return false;
    }
}
function sendStart() {
    port.postMessage({action: 'START_METRO'});
}
function sendStop() {
    port.postMessage({action: 'STOP_METRO'});
}
function sendRestore() {
    port.postMessage({action: 'RESTORE'});
}
function sendSettings() {
    port.postMessage({
        action: 'ENTER_SETTINGS',
        settings: state.settings
    });
}

window.onload = onWindowLoad;

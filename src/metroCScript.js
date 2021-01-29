/**
 @module metroCScript
*/
function s(){

    var port, metro, vid, beatListener, myTabId;
    var audioContext = new (window.AudioContext || window.webkitAudioContext)();
    var knownBeat = 0; // Stores timestamp of a known beat. Is filled when user presses Play.
    /* To-Do: 
     *	  Add visualisation
     *	  Fix that scheduled ticks still play
     *	  Fix that one tick plays when play is pressed while video is paused
     *	  Make State a class instead of object.
    */
    var state = {
        bpm: undefined,	//bpm of the song
        bpmArtist: undefined,	//title of the song, from which the bpm is taken
        bpmTitle: undefined,	//title of the song, from which the bpm is taken
        running: false,	//metronome running state
        loading: true,	//UI loading state
        altered: false,

        error: undefined,
        keyString: undefined, //string containing a key (e.g. 'C Minor')
        timeSig: undefined, //the signature is `timeSig`/4
        settings: {
            followVid: true
        }
    };
    var OGState = {}; //Stores original state after query. assigned to state on RESTORE message from pop-up 
    
    /*
     * Resets state
     */
    function resetState() {
        state = {
            bpm: undefined,	
            bpmArtist: undefined,
            bpmTitle: undefined,
            running: false,       // whether metronome is active (making sound)
            playing: false,       // whether metronome is playing (UI play button shows a triangle)
            loading: true,	
            loadingMsg: undefined,
            shortMsg: undefined,
            altered: false,       // whether initial state has been altered (by inputting a new song title, bpm, etc.
            error: undefined,
            keyString: undefined, // song key (e.g. "Db Major")
            timeSig: undefined,   // enumerator of time signature (e.g. 3 for 3/4)
            settings: {
                followVid: true,
                autoSync: true
            }
        };
    }

    /*
     * Handles new settings. Used when receiving settings from UI.
     * @param {object} settings - Settings object. 
     */
    function handleSettings(settings) {
      if (state.settings.followVid != settings.followVid) {
        state.settings.followVid = settings.followVid;
        
        if (vid.paused && state.playing && state.running) {
          stopMetro(false);
        }
        metro.setFollowVid(settings.followVid);
      }

      if (state.settings.autoSync != settings.autoSync) {
        state.settings.autoSync = settings.autoSync;

        setAutoSync(settings.autoSync);
      }

      state.settings = settings;
    }


    /*
     * Initialize metronome by extracting video title, quering bpm etc.
     * startMetro - bool (describes if metro should be started after init)
     */
    function initMetro(startMetroAfterInit, title) {
        if (!title) {

            //Extract video title from HTML
            try {
                state.title = document.querySelector("#container > h1 > yt-formatted-string").innerText;
            } catch {
                throw new Error("Could not retrieve the Video title"); 
                //To-Do: send message back to popup, notify me (yt might've changed)
            }
        } else {
            state.title = title;
        }

        // Query BPM
        queryBPM(state.title).then(queryRes => {
            if (!queryRes) return;

            state.error = null;
            setLoading(false);
            state.altered = false;

            //Save query results to state
            state.bpm = Math.round(queryRes.tempo);
            state.bpmArtist = queryRes.artist;
            state.bpmTitle = queryRes.title;
            state.keyString = keyToString(queryRes.key, queryRes.mode, queryRes.time_signature);

            state.timeSig = queryRes.time_signature;

            //Start metronome if query returned a bpm
            if (state.bpm){
                metro.setTempo(state.bpm);
                metro.setSound(1);
                if (startMetroAfterInit) {
                    if (state.settings.autoSync) {
                      startMetroAfterSync();
                    } else {
                      startMetro();
                    }
                }
            }

            OGState = Object.assign({}, state);

            sendState(); //Send current state back to pop-up 
        }).catch(err => {
            //Send error message back to UI	
            setLoading(false);
            state.error = err.message;
            sendState();
            OGState = Object.assign({}, state);
            console.error(err);
        }); 
    }

    function init() {
        metro = new MetronomeSound(audioContext);

        // Find video element and attach event listeners.        
        vid_els = document.getElementsByTagName('video');
        if (vid_els.length > 0) {
            vid = vid_els[0];
            vid.onplaying = onPlay;
            vid.onpause = onPause;
            vid.onwaiting = onPause;
            if (!beatListener) {
              beatListener = new BeatListener(audioContext, vid);
            } else {
              beatListener.setAudioContext(audioContext);
              beatListener.setVideo(vid);
            }

            metro.setVideo(vid);
            metro.setFollowVid(state.settings.followVid);
        } else {
            //Couldn't find video element, don't follow.
            state.settings.followVid = false;
            metro.setFollowVid(false);
        }

        initMetro(false);
    }

    /*
     * Listener gets called every time the pop-up connects.
     * The pop-up doesn't have a clue whether it has already been started on this page.
     */
    chrome.runtime.onConnect.addListener(function(_port) {
        port = _port;
            
        if (port.name == 'first_time_conn') {
            init(); //init if first connection
        } else {
            if (state.bpm == undefined) {
                init(); //there was no query made for this song (occurs when pop-up opened on a newly navigated page)
            } else {
                sendState(); //send state if subsequent connection
            }
        }
        port.onMessage.addListener((msg) => {
            switch (msg.action) {
                case 'STOP_METRO':
                    stopMetro();
                    break;
                case 'START_METRO':
                    if (state.settings.autoSync) {
                      // Auto syncing. Start after sync
                      // no matter if following or not.
                      startMetroAfterSync();
                    } else if (!state.settings.followVid) {
                      // Not following video and not auto syncing, just start.
                      startMetro();
                      knownBeat = vid.currentTime;
                    } else if (vid && !vid.paused) {
                      // Following but not auto-syncing. 
                      // Count this moment as a known beat.
                      knownBeat = vid.currentTime;
                      startMetro();
                    } else {
                      // Following the paused video.
                      // Metronome will start in vid.onplay handler when video is played.
                      if (!knownBeat) {
                        knownBeat = vid.currentTime;
                      }
                      state.playing = true;
                    }

                    break;
                case 'ENTER_BPM':
                    if (msg.bpm != state.bpm) {
                        state.customBPM = true;
                        state.error = null;
                        setLoading(false);
                        state.bpm = msg.bpm;
                        stopMetro();
                        metro.setTempo(state.bpm);
                        state.altered = true;
                        sendState();
                    }

                    break;
                case 'ENTER_TITLE':
                    resetState();

                    setLoading(true);
                    sendState();
                    initMetro(false, msg.title);

                    break;
                case 'RESTORE':
                    state = Object.assign({}, OGState);
                    stopMetro();
                    metro.setTempo(state.bpm);
                    sendState();

                    break;
                case 'ENTER_SETTINGS':
                    handleSettings(msg.settings);

                    break;
            }
        });
        port.onDisconnect.addListener((_port) => {
            port = null;
        });
    });

    function onPlay(e) {
        if (state.settings.followVid && state.playing) {
          // Start metronome if playing but not actually running.
          startMetro(calcOffset());
        } 
    }
    function onPause(e) {
        if (state.settings.followVid && state.playing && state.running) {
          // Pause metronome without changing UI.
          stopMetro(false);
        }
    }


    /*
     * Calculates offset after which Metronome should start to stay in tempo.
     *
     * @returns {number} time (s) after which metronome should start
     */
    function calcOffset() {
        if (!vid) return 0;

        let beatPeriod = 60 /state.bpm; //how many s are inbetween beats
        let t = vid.currentTime;

        let dt = t - knownBeat; //time between knownBeat and t
        let dtBeat = dt - ((dt) % beatPeriod) + beatPeriod; //time between knownBeat and next beat
        let startTime = dtBeat + knownBeat;
        let offset = startTime - t; 
        return offset;
    }

    /* 
     * Captures a 5s clip of tab audio and analzyes for bpm and first beat.
     * 
     * @returns {number} beat_t - time (s) of the first detected beat within the 5s window.
     * @returns {number} bpm - estimated bpm.
     */
    function startMetroAfterSync() {

      setLoading(true, 'Listening...');
      sendState();
      beatListener.getKnownBeat(parseInt(state.bpm)).then((t) => {
        /* Play peeps
        vid.currentTime = beatListener.recStartT;
        beatListener.planPeepsOnBeat(); */
        
        if (t) {
          if (state.settings.autoSync) {
            knownBeat = t;
            startMetro(calcOffset());
          }
        } else {
          state.shortMsg = 'Try again with higher video volume.';
        }
        setLoading(false);
        sendState();
        state.shortMsg = null;
      });
;
    }

    function setAutoSync(autoSync) {
      if (autoSync && state.playing) {
        stopMetro();
        startMetroAfterSync();
      } 
    }

    function setLoading(loading, msg) {
      if (state.loading != loading) {
        state.loading = loading;
        if (loading) {
          state.loadingMsg = msg;
        } else {
          state.loadingMsg = null;
        }
      }
    }


    /*
     * Starts metronome and updates state.
     *
     * @param {number} [sToStart - time (s) after which metronome should start
     * @param {boolean} [transparent] - whether to update state.playing along with state.running. Only state.playing is affecting UI.
     */
    function startMetro(sToStart=0, transparent=true) {
        if (isNaN(state.bpm) || isNaN(sToStart)) return;
        
        metro.start(sToStart);
        state.running = metro.running;
        if (transparent) {
          state.playing = metro.running;
        }
    }

    /*
     * Stops metronome and updates state if told to. 
     *
     * @param {boolean} [transparent] - whether to update state.playing along with state.running. Only state.playing is affecting UI.
     */
    function stopMetro(transparent=true) {
        metro.stop();

        state.running = metro.running;
        if (transparent) {
          state.playing = metro.running;
        }
    }

    /* 
     * Sends state if port is active
     * @param {string} [event] - event name that should be sent along with state
     */
    function sendState(event) {
        if (port){
            try {
                let msg = {};
                msg.state = Object.assign({}, state);
                msg.event = event; //add event if passed
                port.postMessage(msg);
            } catch(e) {
                console.error('Port from content script to pop-up faulty.');
            }
        } 
    }


    /*
     * Notify Pop-up that port is ready when js file first runs and when it asks
     */
    chrome.runtime.onMessage.addListener((req, sender, sendResp) => {
        if (!req.event) return;
        if (req.event === 'popup-ready') {
          sendResp({event: 'port-ready'});
        } 
    });



    /*
     * Monitor navigation
     */
    var oldHref = document.location.href;

    var bodyList = document.querySelector("body");

    var observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (oldHref != document.location.href) {
                oldHref = document.location.href;
                
                // Navigation to new video started, forget the old state. `init` will be called when pop-up connects next time
                resetState();
                setLoading(false);
                if (metro) stopMetro();
                // Send message to pop-up so it can close itself
                sendState('navigated');
            }
        });
    });

    var config = {
        childList: true,
        subtree: true
    };

    observer.observe(bodyList, config);

    // Notify pop-up to avoid connections to unready port.
    chrome.runtime.sendMessage({event: 'port-ready'});
};

// Prevent starting before window is loaded.
// This might run after document loaded though.
if (document.readyState == 'complete'){
	s();
} else {
	document.onreadystatechange = () => {
        if (document.readyState == 'complete') {
            s();
        }
    };
}

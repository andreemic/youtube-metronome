/*
 * Config
 */
const scheduleEvery = 100; //how often `scheduler` is called (ms)
const scheduleAheadTime = 400; //how far `scheduler` is going to schedule (ms)

const SOUNDS_PATH = 'audio/';
const sounds = ['Low Seiko SQ50.wav', 'High Seiko SQ50.wav']; //Sounds in pairs (second one is alt. sound)

class MetronomeSound {
    constructor(context, listener) {
        const dummyListener = { setTempo: (t) => {}, setStartTime: (t) => {} };
        this.listener = listener || dummyListener;

        this.running = false;
        this.intervalID = -1;

        this.timeSrc = null; //current time coordinate system (switches between `this.vid` and `this.audioContext`
        this.vid = null;
            
        this.secondsPerBeat = 1; //seconds between beats
        this.tempoBpm = 60;
	
        this.selectedSound = 0;
	
        this.currentBeat = 0; //current quarter note idx (0-3)
        this.nextBeatTime = 0;
	
        this.audioContext = context;
        const urls = sounds.map(name => SOUNDS_PATH + name);
        this.soundFiles = new SoundFiles(this.audioContext, urls);
    }

        schedNum = 0;
    /**
     * Sets the tempo.
     * @param bpm tempo in beats per minute
     */
    setTempo(bpm) {
        this.tempoBpm = bpm;
        this.secondsPerBeat = 60/bpm;
    }

    /**
     * Sets the metronome sound.
     * @param number sound index in `SOUNDS` array.
     */
    setSound(number) {
        if (number >= 0 && number < sounds.length / 2) {
            this.selectedSound = number;
        }
    }

    nextNote() {
        this.nextBeatTime += this.secondsPerBeat;

        this.currentBeat++;
        if (this.currentBeat == 4) {
            this.currentBeat = 0;
        }
    }

    /*
     * Schedules a beat to be played after dt seconds.
     * @param {number} dt - Time (s) after which the beat is played.
     * @param {number} beatNumber - Number of the beat (1-4) to be played.
     */
    planSound(beatNumber, dt) {
        this.source = this.audioContext.createBufferSource();
	
        let soundNum = this.selectedSound * 2;
        /* Feature: Alt. sound for one-beat 
        if (beatNumber == 0) {
            soundNum++; //select alt. sound for beat 1
        } */

        this.source.buffer = this.soundFiles.buffers[soundNum];
        this.source.connect(this.audioContext.destination);
        //console.log(`Tick at ${this.timeSrc.currentTime + dt} s`);
        this.source.start(this.audioContext.currentTime + dt);
    }

    /*
     * Scheduler called every `scheduleEvery` ms.
     * Schedules one or more notes in the window of length `scheduleAheadTime` ms
     * @param {number} t - Time in s in the currently relevant time coordinate system. (either time of vid or audio context)
     */
    scheduler(t) {
        //console.log(t, this.nextBeatTime);
        while (this.nextBeatTime < (t + scheduleAheadTime/1000)) {
            if (this.nextBeatTime > t) {
                this.planSound(this.currentBeat, this.nextBeatTime - t);
            }
            this.nextNote()
        }
        
    }

    /** Toggles the running state of the metronome */
    toggle(offset=0) { 
        if (this.running = !this.running) {
            // Play
            this.currentBeat = 0;
            this.intervalID = setInterval(() => { 
                //Call scheduler regularly.
                this.scheduler(this.timeSrc.currentTime)
            }, scheduleEvery);
            this.nextBeatTime = this.timeSrc.currentTime + offset;

            if (offset == 0) {
                this.planSound(this.currentBeat, 0);
                this.nextNote();
            }
            
        } else {
            // Stop
            clearInterval(this.intervalID);
            this.intervalID = null;
        
            if (this.source) {
                this.source.disconnect();
                this.source.stop();
                this.source = undefined;
            }
        }
    }

    setVideo(v) {
        this.vid = v;
    }

    /*
     * Sets `followVid` variable and translates `nextBeatTime` into the appropriate time coordinate space.
     */
    setFollowVid(followVid) {
        if (!this.followVid && followVid) {
            //Were not following, now are following video
            let dt = this.nextBeatTime - this.audioContext.currentTime;
            this.nextBeatTime = this.vid.currentTime + dt;
            this.timeSrc = this.vid;
        } else if (this.followVid && !followVid) {
            //Were following, now are not following video
            //Translate this.nextBeatTime into time coordinate space of audioContext
            let dt = this.nextBeatTime - this.vid.currentTime; 
            this.nextBeatTime = this.audioContext.currentTime + dt;
            this.timeSrc = this.audioContext;
        }
        this.followVid = followVid;
    }

    start(offset) {
        if (this.running) return;
        this.toggle(offset);

        this.startPhase = this.audioContext.currentTime - this.vid.currentTime;
        //console.log(`audioTime = ${this.audioContext.currentTime}   videoTime = ${this.vid.currentTime} d = ${this.startPhase}`);
    }
    stop() {
        if (!this.running) return;
        this.running = true;
        this.toggle();
    }

}

class SoundFiles {
    constructor(context, urlList) {
        this.buffers = [];
        const self = this;

        urlList.forEach((url, index) => {
            const xhr = new XMLHttpRequest();
            xhr.responseType = "arraybuffer";
            xhr.onload = () => context.decodeAudioData(xhr.response,
                (buffer) => self.buffers[index] = buffer,
                (error) => console.error('decodeAudioData error', error));
            xhr.open("GET", chrome.runtime.getURL(url));
            xhr.send();
        });
    }
}






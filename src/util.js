const MIN_BPM = 20;
const MAX_BPM = 300;
function slugify(string) {
  const a = 'àáâäæãåāăąçćčđďèéêëēėęěğǵḧîïíīįìłḿñńǹňôöòóœøōõőṕŕřßśšşșťțûüùúūǘůűųẃẍÿýžźż·/_,:;'
  const b = 'aaaaaaaaaacccddeeeeeeeegghiiiiiilmnnnnoooooooooprrsssssttuuuuuuuuuwxyyzzz------'
  const p = new RegExp(a.split('').join('|'), 'g');
  return string.toString().toLowerCase()
    .replace(p, c => b.charAt(a.indexOf(c))) // Replace special characters
    .replace(/&/g, 'and') // remove &
	.replace(/^-+/, '') // Trim - from start of text
    .replace(/-+$/, '') // Trim - from end of text
}

/*
 * Strips title of anything after parenthesis (e.g "(Official Music Video)")
 */
function stripTitle(title) {
    const splitChars = ['(', '[', 'ft', 'feat', '|'];
    for (c of splitChars) {
        title = title.split(c)[0];
    }
    return title.trimEnd();
}

function vidTitleToURL(title) {
	title = stripTitle(title);
	return `https://andreev.work/app/yt-metro/bpm?q=${encodeURIComponent(slugify(title))}&a=NjUxZmQyZTI0NDYyYzM0YjUyMjllODM4NDFkNTBmN2E0ZGViMjUyYmRmNjg5MmM5NjJmNWNhYTI5MzFiNTFmNGZhMjJlNmI5MTYyOWMyN2Q5MzMwOGEyMWYyY2Y4NWM4MzFiOGY0MTJhOWM0Mzg5ZGQxMWU5OWZlMDE3YjRhZjk=`;
}

const FAKE_JSON = {
danceability: 0.936,
energy: 0.523,
key: 5,
loudness: -6.71,
mode: 1,
speechiness: 0.0597,
acousticness: 0.239,
instrumentalness: 0,
liveness: 0.117,
valence: 0.699,
tempo: 175,
type: "audio_features",
id: "43ZyHQITOjhciSUUNPVRHc",
uri: "spotify:track:43ZyHQITOjhciSUUNPVRHc",
track_href: "https://api.spotify.com/v1/tracks/43ZyHQITOjhciSUUNPVRHc",
analysis_url: "https://api.spotify.com/v1/audio-analysis/43ZyHQITOjhciSUUNPVRHc",
duration_ms: 124056,
time_signature: 4,
artist: "Lil Pump",
title: "Wonderwall"
}; 
  //Returns Promise which resolves with a QueryRes JSON object (bpm:int, bpmTitle:string, bpmArtist:string, keyString:string) or Error
async function queryBPM(title) {
	if (!title) return undefined;
	let url = vidTitleToURL(title);

  //OFFLINE MODE
  //return FAKE_JSON;
	
	const res = await fetch(url);
	switch (res.status) {
		case 404:
			throw new Error('NOT_FOUND');
			break;
		case 429:
			throw new Error('TOO_MANY_REQ');
			break;
		case 500:
			throw new Error('SERVER_ERROR');
			break;
		case 200:
			const json = await res.json();	
            if (!json.tempo) {
                throw new Error('NOT_FOUND');
            } else {
                return json;
            }
	}
}

/*
 * pitch_class - int representing tonic note (C=0, C#=1, etc.) 
 * mode - int representing mode (1=Major, 0=Minor)
 * Returns: string("C Minor")
 */
function keyToString(pitch_class, mode_class, time_sig) {
	pitch_class %= 12; // wrap around if >12
	const notes = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
	const modes = ['Major', 'Minor'];
	
  let res = `${notes[pitch_class]} ${(modes[mode_class] || 'something'.italics() || 'something')}`;
	if (time_sig && time_sig != 4) {
    res += ` (${time_sig}/4)`;
  }
  return res;
}

/*
 * Returns 0 if x < 0, x otherwise.
 */
function clamp(x, a, b) {
  if (a !== undefined && x < a) return a;
  if (b !== undefined && x > b) return b;
  return x;
}

/*
 * Compute mean of Array in interval a - b.
 */
function meanInInterval(arr, a, b) {
  if (a >= b  || !arr.length || a < 0 || b < 0) return 0;

  return arr.slice(a, b).reduce((a, b) => a+b) / (b - a);
}


/*
 * Play 100ms oscillator sound.
 *
 * @param {AudioContext} context - Audio context to play in
 * @param {number} gain -  Intensity (0-1)
 * @param {number} offset - Time (s) to start
 */
function planPeep(context, gain, offset) {
  let osc = context.createOscillator();
  osc.frequency.value = 953;
  offset = clamp(offset, 0);

  if (gain < 1 && gain >= 0) {
    // Apply gain
    let gainNode = context.createGain();
    gainNode.gain.value = gain;
    osc.connect(gainNode);
    gainNode.connect(context.destination);
  } else {
    // Play without gain
    osc.connect(context.destination);
  }

  osc.start(context.currentTime + offset);
  osc.stop(context.currentTime + offset + 0.1);
}

function everyNthElement(arr, n) {
  let newArr = [];

  for (let i = 0; i < arr.length; i += n) {
    newArr.push(arr[i]);
  }

  return newArr;
}

const fakePlotter = {
  plot: (a,b,c) => {},
  plotFunc: (a,b,c) => {},
  vertLine: (a,b) => {}
};
class BeatListener {
  constructor(context, vid, plotter) {
    this.setAudioContext(context);
    this.plotter = plotter || fakePlotter;
    
    this.setVideo(vid);

    this.recStartT = 0;
    this.listenInterval;
    
    this.spectrogram = [];              // Frequency content as Array for each timestep
    this.noveltyCurve = [];            

    this.sendResult = () => {};         // resolves promise

    this.TIME_FRAME = 5.2;
    this.TIME_STEP = 0.005;
  }

  /*
   * Sets video and creates MediaSource
   */
  setVideo(vid) {
    this.vid = vid;

    // Connect source to dest. through analyser
    if (!this.source) {
      // Create source
      try {
        this.source = this.context.createMediaElementSource(vid);
      } catch(e) {
        //Already connected
      }
    }

    //Connect AudioNodes
    this.source.connect(this.analyser);
    this.analyser.connect(this.context.destination);
  }

  /*
   * Sets audio context and creates according AudioNodes.
   * Needs to be called before this.setVideo
   */
  setAudioContext(context) {
    // Create analyser
    this.analyser = context.createAnalyser();
        
    this.context = context;
  }

  async getKnownBeat(bpm) {
    this.bpm = bpm;
    this.TIME_FRAME = (60 / this.bpm) * 9;
    this.spectrogram = [];              // Frequency content as Array for each timestep
    this.noveltyCurve = [];            


    return new Promise((resolve, reject) => {
      let now = this.vid.currentTime;
      this.recStartT = now;


      this.listenInterval = setInterval(() => this.listenToAudio(this.NCprocess.bind(this)), this.TIME_STEP * 1000);
      this.sendResult = resolve;
    });
  }

  NCprocess() {
    // Turn recorded spectrogram into novelty curve
    this.NCfromSpectrogram();

    // Subtract local averages
    this.NCsubLocalAvg(); 
    this.plotter.plot(this.noveltyCurve, 0, 'NC');

    this.extractBeatTime();
  }

  listenToAudio(cb) {
    let t = this.vid.currentTime;

    //Read momentary frequency data
    let freqData = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(freqData);

    this.spectrogram.push(freqData);
    
    if (t - this.recStartT > this.TIME_FRAME) {
      // Time frame passed, data is collected.
      
      clearInterval(this.listenInterval);
      cb();
    }
  }

  logCompress(x, max) {
    return Math.log(1 + x * 10000) / Math.log(1 + 10000 * max);
  }
  /*
   * Differentiates each frequency band (of which there are this.sqrtFftSize). 
   * Summmed diff. band values for time t give the novelty at t.
   * Writes it to this.noveltyCurve.
   */
  NCfromSpectrogram() {
    for (let t = 1; t < this.spectrogram.length - 1; t++) {
      let prevData = this.spectrogram[t - 1];
      let freqData = this.spectrogram[t];
      let nextData = this.spectrogram[t + 1];

      let sum = 0;
      for (let f = 0; f < freqData.length; f++) {
        //1. Apply log compression and decrease high frequency influence.
        let val = this.logCompress(freqData[f], 255);
        let prevVal = this.logCompress(prevData[f], 255);
        let nextVal = this.logCompress(nextData[f], 255);

        //2. Calculate rate of change. Cut off at 0.
        let diff = clamp(((val - prevVal) + (nextVal - val)) / 2, 0); 


        //3. Add difference to sum
        sum += diff;
      }

      // Normalize sum
      sum = sum / freqData.length;
      
      // Add to Novelty Curve
      this.noveltyCurve.push(sum);
    }
  }

  /*
   * Calls cb with a beat time. Called once noveltyCurve is ready.
   */
  extractBeatTime(cb) { 
    // Find first beat.
    const nonZero = this.noveltyCurveNonZeroIdx;
    const NC = this.noveltyCurve;

    let period = 60 / this.bpm;
    const lookUntilIdx = Math.floor(4 * period / this.TIME_STEP);
    
    let correctBeatScore = -1;
    let correctBeatIdx = -1;
    let correctSin = () => {};

    // Calculate score for every unredundant point 
    // Pick max.
    for (let i = 0; i < NC.length; i++) {
      if (i > lookUntilIdx) {
        // Stop if 5 beats should've appeared
        break;
      }

      // Calculate potential beat time
      let startT = i * this.TIME_STEP + this.recStartT;

      // Calculate score of potential beat time
      let result = this.calculateBeatScore(startT);
      
      if (correctBeatScore < result.score) {
        correctBeatScore = result.score;
        correctBeatIdx = i;
        correctSin = result.sin;
      }
    }

    if (correctBeatScore == 0) {
      this.knownBeat = null;
    } else {
      this.knownBeat = correctBeatIdx * this.TIME_STEP + this.recStartT;
      console.log(`${this.knownBeat} s won with ${correctBeatScore})`);
      this.drawResult(correctBeatScore, correctBeatIdx, correctSin);
    }

    this.sendResult(this.knownBeat);
  }

  drawResult(correctBeatScore, correctBeatIdx, correctSin) {
    // Draw Lines
    this.plotter.vertLine(correctBeatIdx / this.noveltyCurve.length, correctBeatScore);
    let beatT = correctBeatIdx * this.TIME_STEP + this.recStartT;
    let period = 60 / this.bpm;
    beatT = correctBeatIdx * this.TIME_STEP;
    while (beatT < this.TIME_FRAME) {
      this.plotter.vertLine(beatT / this.TIME_FRAME, 0.2);

      beatT += period;
    }
    // Plot sin. Tranfsorm it so f(0) corrseponds to f(this.recStartT) 
    // and f(1) to f(this.recStartT + this.TIME_FRAME)
    this.plotter.plotFunc((x) => correctSin((x * this.TIME_FRAME + this.recStartT)), 3, `Best sinusoid (c = ${correctBeatScore}`);

  }

  /* 
   * Applies a sin function to this.noveltyCurve
   * to calculate the correlation.
   */
  calculateBeatScore(startT) {
    const NC = this.noveltyCurve;

      // Multiply novelty curve with a sinusuoid starting at startT 
      // with frequency this.bpm / 60 an.
      let beatScore = 0;
      let sin = (t) =>  
        Math.sin(
          Math.PI * (
            (t - startT) * 2 * this.bpm / 60 
            + 0.5
          )
        ) * 3 - 2;
      for (let j = Math.floor(0.1 / this.TIME_STEP); j < NC.length; j++) {
        let t = j * this.TIME_STEP + this.recStartT;

        // Multiply actual value by value of 
        // a sinusoid with pulses where the beats should be. 
        // Negative values are discarded.
        beatScore += clamp(sin(t), 0) * NC[j] ** 2;
      }

      return {score: beatScore, sin: sin};
  }

  /*
   * Subtract local average and half-wave rectify.
   */
  NCsubLocalAvg() {
    let meanInterval = Math.round(this.noveltyCurve.length * 0.1/ this.TIME_FRAME); //~0.2s

    let newCurve = [];
    let localAvg = [];

    for (let i = 0; i < this.noveltyCurve.length; i++) {
      let localMean = meanInInterval(this.noveltyCurve, 
        clamp(i - meanInterval, 0), 
        clamp(i + meanInterval, 0, this.noveltyCurve.length - 1)
      );
      
      let newVal = clamp(this.noveltyCurve[i] - localMean, 0); 
      newCurve.push(newVal);
      localAvg.push(localMean);
    }
    
    this.noveltyCurve = newCurve;
    this.noveltyCurveLocalAvg = localAvg;
  }

  /* 
   * Replays video with clicks
   */
  planPeepsOnBeat() {
    let period = 60 / this.bpm;
    let beatT = this.knownBeat - period * Math.floor((this.knownBeat - this.recStartT) / period);

    while (beatT < this.recStartT + this.TIME_FRAME) {
      let offset = beatT - this.vid.currentTime;
      planPeep(this.context, 1, offset);

      beatT += period;
    }
  }
}

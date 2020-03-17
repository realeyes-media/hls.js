/**
 * passthrough remuxer
*/
import Event from '../events';
import { parseInitSegment, parseUserData, parseSei } from '../utils/mp4-tools';

class PassThroughRemuxer {
  constructor (observer) {
    this.observer = observer;
    this.initData = {};
    this.initPTS = 0;
    this.initSegment = {};
    this.initTracks = {};
  }

  destroy () {
  }

  resetTimeStamp (defaultInitPTS) {
    this.initPTS = defaultInitPTS;
    this.lastEndDTS = null;
  }

  resetNextTimestamp () {
    this.lastEndDTS = null;
  }

  resetInitSegment (initSegment, audioCodec, videoCodec) {
    this.audioCodec = audioCodec;
    this.videoCodec = videoCodec;
    this.generateInitSegment(initSegment);
    this.emitInitSegment = true;
  }

  generateInitSegment (initSegment) {
    let { audioCodec, videoCodec } = this;
    if (!initSegment || !initSegment.byteLength) {
      this.initTracks = undefined;
      this.initData = undefined;
      return;
    }
    const initData = this.initData = parseInitSegment(initSegment);

    // default audio codec if nothing specified
    // TODO : extract that from initsegment
    if (!audioCodec) {
      audioCodec = 'mp4a.40.5';
    }

    if (!videoCodec) {
      videoCodec = 'avc1.42e01e';
    }

    const tracks = {};
    if (initData.audio && initData.video) {
      tracks.audiovideo = {
        container: 'video/mp4',
        codec: audioCodec + ',' + videoCodec,
        initSegment,
        id: 'main'
      };
    } else {
      if (initData.audio) {
        tracks.audio = { container: 'audio/mp4', codec: audioCodec, initSegment, id: 'audio' };
      }

      if (initData.video) {
        tracks.video = { container: 'video/mp4', codec: videoCodec, initSegment, id: 'main' };
      }
    }
    this.initTracks = tracks;
  }

  remux (audioTrack, videoTrack, id3Track, textTrack, timeOffset, contiguous, accurateTimeOffset, rawData) {
    let observer = this.observer,
      streamType = '',
      computePTSDTS = (this.initPTS === undefined),
      initPTS,
      textSamples = textTrack && textTrack.samples,
      inputTimeScale = videoTrack && videoTrack.timescale;

    let initData = this.initData;
    if (!initData || !initData.length) {
      this.generateInitSegment(data);
      initData = this.initData;
    }

    if (computePTSDTS && textSamples && textSamples.length) {
      initPTS = Infinity;
      this.initPTS = Math.min(initPTS, textSamples[0].pts - inputTimeScale * timeOffset);
    }
    if (audioTrack) {
      streamType += 'audio';
    }

    if (videoTrack) {
      streamType += 'video';
    }

    if (textTrack.samples.length) {
      this.remuxText(textTrack, timeOffset);
    }

    observer.trigger(Event.FRAG_PARSING_DATA, {
      data1: rawData,
      startPTS: timeOffset,
      startDTS: timeOffset,
      type: streamType,
      hasAudio: !!audioTrack,
      hasVideo: !!videoTrack,
      nb: 1,
      dropped: 0
    });
    // notify end of parsing
    observer.trigger(Event.FRAG_PARSED);
  }

  remuxText (track) {
    track.samples.sort(function (a, b) {
      return (a.pts - b.pts);
    });

    let length = track.samples.length, sample;
    const inputTimeScale = track.timescale;
    const initPTS = this.initPTS;
    track.samples = track.samples.map(sample => {
      const seiNalUnits = parseSei(sample.escapedRBSP);
      const userData = parseUserData(seiNalUnits);
      return {
        type: 3,
        trackId: sample.trackId,
        pts: sample.pts,
        dts: sample.dts,
        bytes: userData
      };
    });
    // consume samples
    if (length) {
      for (let index = 0; index < length; index++) {
        sample = track.samples[index];
        // setting text pts, dts to relative time
        // using this._initPTS and this._initDTS to calculate relative time
        sample.pts = ((sample.pts - initPTS) / inputTimeScale);
      }
      this.observer.trigger(Event.FRAG_PARSING_USERDATA, {
        samples: track.samples
      });
    }

    // track.samples = [];
  }
}

export default PassThroughRemuxer;

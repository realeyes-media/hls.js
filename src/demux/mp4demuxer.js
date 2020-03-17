/**
 * MP4 demuxer
 */
import { logger } from '../utils/logger';
import Event from '../events';
import { parseInitSegment, getStartDTS, offsetStartDTS, parseCaptionNals, findBox } from '../utils/mp4-tools'

class MP4Demuxer {
  constructor (observer, remuxer) {
    this.observer = observer;
    this.remuxer = remuxer;
  }

  resetTimeStamp (initPTS) {
    this.initPTS = initPTS;
  }

  resetInitSegment (initSegment, audioCodec, videoCodec, duration) {
    // jshint unused:false
    if (initSegment && initSegment.byteLength) {
      const initData = this.initData = parseInitSegment(initSegment);

      // default audio codec if nothing specified
      // TODO : extract that from initsegment
      if (audioCodec == null) {
        audioCodec = 'mp4a.40.5';
      }

      if (videoCodec == null) {
        videoCodec = 'avc1.42e01e';
      }

      const tracks = {};
      if (initData.audio && initData.video) {
        tracks.audiovideo = { container: 'video/mp4', codec: audioCodec + ',' + videoCodec, initSegment: duration ? initSegment : null };
      } else {
        if (initData.audio) {
          tracks.audio = { container: 'audio/mp4', codec: audioCodec, initSegment: duration ? initSegment : null };
        }

        if (initData.video) {
          tracks.video = { container: 'video/mp4', codec: videoCodec, initSegment: duration ? initSegment : null };
        }
      }
      this.observer.trigger(Event.FRAG_PARSING_INIT_SEGMENT, { tracks });
    } else {
      if (audioCodec) {
        this.audioCodec = audioCodec;
      }

      if (videoCodec) {
        this.videoCodec = videoCodec;
      }
    }
  }

  // feed incoming data to the front of the parsing pipeline
  append (data, timeOffset, contiguous, accurateTimeOffset) {
    let initData = this.initData;
    const textTrack = {
      samples: []
    };
    if (!initData) {
      this.resetInitSegment(data, this.audioCodec, this.videoCodec, false);
      initData = this.initData;
    }
    let startDTS, initPTS = this.initPTS;
    if (initPTS === undefined) {
      let startDTS = getStartDTS(initData, data);
      this.initPTS = initPTS = startDTS - timeOffset;
      this.observer.trigger(Event.INIT_PTS_FOUND, { initPTS: initPTS });
    }
    if (initData && initData[1] && initData[1].type === 'video') {
      // parse shit here
      const trackId = initData.video && initData.video.id;
      const timescale = initData.video && initData.video.timescale;
      if (trackId && timescale) {
        console.log('gotcha');
        textTrack.samples = parseCaptionNals(data, trackId)[1];
        textTrack.timescale = timescale;
        textTrack.initPTS = this.initPTS;
        // console.log(captionNals)
      }
    }
    offsetStartDTS(initData, data, initPTS);
    startDTS = getStartDTS(initData, data);
    this.remuxer.remux(initData.audio, initData.video, null, textTrack, startDTS, contiguous, accurateTimeOffset, data);
  }

  static probe (data) {
    // ensure we find a moof box in the first 16 kB
    return findBox({ data: data, start: 0, end: Math.min(data.length, 16384) }, ['moof']).length > 0;
  }

  destroy () {}
}

export default MP4Demuxer;

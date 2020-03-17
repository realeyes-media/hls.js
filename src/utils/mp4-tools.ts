import { ElementaryStreamTypes } from '../loader/fragment';

var USER_DATA_REGISTERED_ITU_T_T35 = 4,
    RBSP_TRAILING_BITS = 128;
const UINT32_MAX = Math.pow(2, 32) - 1;

export function bin2str (buffer): string {
    return String.fromCharCode.apply(null, buffer);
}

export function readUint32 (buffer, offset): number {
if (buffer.data) {
    offset += buffer.start;
    buffer = buffer.data;
}

const val = buffer[offset] << 24 |
    buffer[offset + 1] << 16 |
    buffer[offset + 2] << 8 |
    buffer[offset + 3];
return val < 0 ? 4294967296 + val : val;
}

export function readUint16 (buffer, offset) {
    if (buffer.data) {
      offset += buffer.start;
      buffer = buffer.data;
    }

    const val = buffer[offset] << 8 |
                buffer[offset + 1];

    return val < 0 ? 65536 + val : val;
  }

export function writeUint32 (buffer, offset, value) {
    if (buffer.data) {
      offset += buffer.start;
      buffer = buffer.data;
    }
    buffer[offset] = value >> 24;
    buffer[offset + 1] = (value >> 16) & 0xff;
    buffer[offset + 2] = (value >> 8) & 0xff;
    buffer[offset + 3] = value & 0xff;
  }

export function probe (data) {
  // ensure we find a moof box in the first 16 kB
  return findBox({ data: data, start: 0, end: Math.min(data.length, 16384) }, ['moof']).length > 0;
}

  // Find the data for a box specified by its path
export function findBox (data, path): Array<any> {
    let results = [] as Array<any>;
    let i;
    let size;
    let type;
    let end;
    let subresults;
    let start;
    let endbox;
  
    if (data.data) {
      start = data.start;
      end = data.end;
      data = data.data;
    } else {
      start = 0;
      end = data.byteLength;
    }
  
    if (!path.length) {
      // short-circuit the search for empty paths
      return results;
    }
  
    for (i = start; i < end;) {
      size = readUint32(data, i);
      type = bin2str(data.subarray(i + 4, i + 8));
      endbox = size > 1 ? i + size : end;
  
      if (type === path[0]) {
        if (path.length === 1) {
          // this is the end of the path and we've found the box we were
          // looking for
          results.push({ data: data, start: i + 8, end: endbox });
        } else {
          // recursively search for the next box along the path
          subresults = findBox({ data: data, start: i + 8, end: endbox }, path.slice(1));
          if (subresults.length) {
            results = results.concat(subresults);
          }
        }
      }
      i = endbox;
    }
  
    // we've finished searching all of data
    return results;
  }

  function findBox2(data, path) {
    var results = [] as any,
        i, size, type, end, subresults;

    if (!path.length) {
      // short-circuit the search for empty paths
      return null;
    }

    for (i = 0; i < data.byteLength;) {
      size  = toUnsigned(data[i]     << 24 |
                         data[i + 1] << 16 |
                         data[i + 2] <<  8 |
                         data[i + 3]);

      type = parseType(data.subarray(i + 4, i + 8));

      end = size > 1 ? i + size : data.byteLength;

      if (type === path[0]) {
        if (path.length === 1) {
          // this is the end of the path and we've found the box we were
          // looking for
          results.push(data.subarray(i + 8, end));
        } else {
          // recursively search for the next box along the path
          subresults = findBox(data.subarray(i + 8, end), path.slice(1));
          if (subresults.length) {
            results = results.concat(subresults);
          }
        }
      }
      i = end;
    }

    // we've finished searching all of data
    return results;
  }
/**
 * Parses an MP4 initialization segment and extracts stream type and
 * timescale values for any declared tracks. Timescale values indicate the
 * number of clock ticks per second to assume for time-based values
 * elsewhere in the MP4.
 *
 * To determine the start time of an MP4, you need two pieces of
 * information: the timescale unit and the earliest base media decode
 * time. Multiple timescales can be specified within an MP4 but the
 * base media decode time is always expressed in the timescale from
 * the media header box for the track:
 * ```
 * moov > trak > mdia > mdhd.timescale
 * moov > trak > mdia > hdlr
 * ```
 * @param init {Uint8Array} the bytes of the init segment
 * @return {InitData} a hash of track type to timescale values or null if
 * the init segment is malformed.
 */

interface InitDataTrack {
    timescale: number,
    id: number,
    codec: string
  }

  type HdlrType = ElementaryStreamTypes.AUDIO | ElementaryStreamTypes.VIDEO;

export interface InitData extends Array<any> {
    [index: number]: { timescale: number, type: HdlrType };
    audio?: InitDataTrack
    video?: InitDataTrack
}

export function parseInitSegment (initSegment): InitData {
    const result: InitData = [];
    const traks = findBox(initSegment, ['moov', 'trak']);
  
    traks.forEach(trak => {
      const tkhd = findBox(trak, ['tkhd'])[0];
      if (tkhd) {
        let version = tkhd.data[tkhd.start];
        let index = version === 0 ? 12 : 20;
        const trackId = readUint32(tkhd, index);
  
        const mdhd = findBox(trak, ['mdia', 'mdhd'])[0];
        if (mdhd) {
          version = mdhd.data[mdhd.start];
          index = version === 0 ? 12 : 20;
          const timescale = readUint32(mdhd, index);
  
          const hdlr = findBox(trak, ['mdia', 'hdlr'])[0];
          if (hdlr) {
            const hdlrType = bin2str(hdlr.data.subarray(hdlr.start + 8, hdlr.start + 12));
            const type: HdlrType = { soun: ElementaryStreamTypes.AUDIO, vide: ElementaryStreamTypes.VIDEO }[hdlrType];
            if (type) {
              // TODO: Parse codec details to be able to build MIME type.
              const codexBoxes = findBox(trak, ['mdia', 'minf', 'stbl', 'stsd']);
              let codec;
              if (codexBoxes.length) {
                const codecBox = codexBoxes[0];
                codec = bin2str(codecBox.data.subarray(codecBox.start + 12, codecBox.start + 16));
              }
              result[trackId] = { timescale, type };
              result[type] = { timescale, id: trackId, codec };
            }
          }
        }
      }
    });
    return result;
  }

export function parseUserData (sei) {
    // itu_t_t35_contry_code must be 181 (United States) for
    // captions
    if (sei.payload[0] !== 181) {
      return null;
    }
  
    // itu_t_t35_provider_code should be 49 (ATSC) for captions
    if (((sei.payload[1] << 8) | sei.payload[2]) !== 49) {
      return null;
    }
  
    // the user_identifier should be "GA94" to indicate ATSC1 data
    if (String.fromCharCode(sei.payload[3],
                            sei.payload[4],
                            sei.payload[5],
                            sei.payload[6]) !== 'GA94') {
      return null;
    }
  
    // finally, user_data_type_code should be 0x03 for caption data
    if (sei.payload[7] !== 0x03) {
      return null;
    }
  
    // return the user_data_type_structure and strip the trailing
    // marker bits
    return sei.payload.subarray(8, sei.payload.length - 1);
  };

  /**
    * Parse a supplemental enhancement information (SEI) NAL unit.
    * Stops parsing once a message of type ITU T T35 has been found.
    *
    * @param bytes {Uint8Array} the bytes of a SEI NAL unit
    * @return {object} the parsed SEI payload
    * @see Rec. ITU-T H.264, 7.3.2.3.1
    */
   export function parseSei (bytes) {
    var
      i = 0,
      result = {
        payloadType: -1,
        payloadSize: 0,
        payload: null
      },
      payloadType = 0,
      payloadSize = 0;
  
    // go through the sei_rbsp parsing each each individual sei_message
    while (i < bytes.byteLength) {
      // stop once we have hit the end of the sei_rbsp
      if (bytes[i] === RBSP_TRAILING_BITS) {
        break;
      }
  
      // Parse payload type
      while (bytes[i] === 0xFF) {
        payloadType += 255;
        i++;
      }
      payloadType += bytes[i++];
  
      // Parse payload size
      while (bytes[i] === 0xFF) {
        payloadSize += 255;
        i++;
      }
      payloadSize += bytes[i++];
  
      // this sei_message is a 608/708 caption so save it and break
      // there can only ever be one caption message in a frame's sei
      if (!result.payload && payloadType === USER_DATA_REGISTERED_ITU_T_T35) {
        result.payloadType = payloadType;
        result.payloadSize = payloadSize;
        result.payload = bytes.subarray(i, i + payloadSize);
        break;
      }
  
      // skip the payload and parse the next message
      i += payloadSize;
      payloadType = 0;
      payloadSize = 0;
    }
  
    return result;
  };

/**
* Parses out inband captions from an MP4 container and returns
* caption objects that can be used by WebVTT and the TextTrack API.
* @see https://developer.mozilla.org/en-US/docs/Web/API/VTTCue
* @see https://developer.mozilla.org/en-US/docs/Web/API/TextTrack
* Assumes that `probe.getVideoTrackIds` and `probe.timescale` have been called first
*
* @param {Uint8Array} segment - The fmp4 segment containing embedded captions
* @param {Number} trackId - The id of the video track to parse
* @param {Number} timescale - The timescale for the video track from the init segment
*
* @return {?Object[]} parsedCaptions - A list of captions or null if no video tracks
* @return {Number} parsedCaptions[].startTime - The time to show the caption in seconds
* @return {Number} parsedCaptions[].endTime - The time to stop showing the caption in seconds
* @return {String} parsedCaptions[].text - The visible content of the caption
**/
  export function parseEmbeddedCaptions (segment, trackId, timescale) {
    let seiNals;

    // the ISO-BMFF spec says that trackId can't be zero, but there's some broken content out there
    if (trackId === null) {
      return null;
    }

    seiNals = parseCaptionNals(segment, trackId);

    return {
      seiNals: seiNals[trackId],
      timescale: timescale
    };
  }
  /**
  * Parses out caption nals from an FMP4 segment's video tracks.
  *
  * @param {Uint8Array} segment - The bytes of a single segment
  * @param {Number} videoTrackId - The trackId of a video track in the segment
  * @return {Object.<Number, Object[]>} A mapping of video trackId to
  *   a list of seiNals found in that track
  **/
  export function parseCaptionNals(data, videoTrackId) {
  // To get the samples
    let trafs = findBox(data, ['moof', 'traf']);
    // To get SEI NAL units
    let mdats = findBox(data, ['mdat']);
    let captionNals = {};
    let mdatTrafPairs = [] as any;

    // Pair up each traf with a mdat as moofs and mdats are in pairs
    mdats.forEach(function (mdat, index) {
      let matchingTraf = trafs[index];
      mdatTrafPairs.push({
        mdat: mdat,
        traf: matchingTraf
      });
    });

    mdatTrafPairs.forEach(function (pair) {
      let mdat = pair.mdat;
      let mdatBytes = mdat.data.subarray(mdat.start, mdat.end);
      let traf = pair.traf;
      let trafBytes = traf.data.subarray(traf.start, traf.end);
      let tfhd = findBox(trafBytes, ['tfhd']);
      // Exactly 1 tfhd per traf
      let headerInfo = parseTfhd(tfhd[0]);
      let trackId = headerInfo.trackId;
      let tfdt = findBox(trafBytes, ['tfdt']);
      // Either 0 or 1 tfdt per traf
      let baseMediaDecodeTime = (tfdt.length > 0) ? parseTfdt(tfdt[0]).baseMediaDecodeTime : 0;
      let truns = findBox(trafBytes, ['trun']);
      let samples;
      let seiNals;

      // Only parse video data for the chosen video track
      if (videoTrackId === trackId && truns.length > 0) {
        samples = parseSamples(truns, baseMediaDecodeTime, headerInfo);

        seiNals = findSeiNals(mdatBytes, samples, trackId);

        if (!captionNals[trackId]) {
          captionNals[trackId] = [];
        }

        captionNals[trackId] = captionNals[trackId].concat(seiNals);
      }
    });

    return captionNals;
  }

  export function parseTfhd (tfhd) {
    const data = tfhd.data.subarray(tfhd.start, tfhd.end);
    let
      view = new DataView(data.buffer, data.byteOffset, data.byteLength),
      result = {
        version: data[0],
        flags: new Uint8Array(data.subarray(1, 4)),
        trackId: view.getUint32(4)
      } as any,
      baseDataOffsetPresent = result.flags[2] & 0x01,
      sampleDescriptionIndexPresent = result.flags[2] & 0x02,
      defaultSampleDurationPresent = result.flags[2] & 0x08,
      defaultSampleSizePresent = result.flags[2] & 0x10,
      defaultSampleFlagsPresent = result.flags[2] & 0x20,
      durationIsEmpty = result.flags[0] & 0x010000,
      defaultBaseIsMoof = result.flags[0] & 0x020000,
      i;

    i = 8;
    if (baseDataOffsetPresent) {
      i += 4; // truncate top 4 bytes
      // FIXME: should we read the full 64 bits?
      result.baseDataOffset = view.getUint32(12);
      i += 4;
    }
    if (sampleDescriptionIndexPresent) {
      result.sampleDescriptionIndex = view.getUint32(i);
      i += 4;
    }
    if (defaultSampleDurationPresent) {
      result.defaultSampleDuration = view.getUint32(i);
      i += 4;
    }
    if (defaultSampleSizePresent) {
      result.defaultSampleSize = view.getUint32(i);
      i += 4;
    }
    if (defaultSampleFlagsPresent) {
      result.defaultSampleFlags = view.getUint32(i);
    }
    if (durationIsEmpty) {
      result.durationIsEmpty = true;
    }
    if (!baseDataOffsetPresent && defaultBaseIsMoof) {
      result.baseDataOffsetIsMoof = true;
    }
    return result;
  }

  export function parseTfdt (tfdt) {
    const data = tfdt.data.subarray(tfdt.start, tfdt.end);
    let result = {
      version: data[0],
      flags: new Uint8Array(data.subarray(1, 4)),
      baseMediaDecodeTime: toUnsigned(data[4] << 24 | data[5] << 16 | data[6] << 8 | data[7])
    };
    if (result.version === 1) {
      result.baseMediaDecodeTime *= Math.pow(2, 32);
      result.baseMediaDecodeTime += toUnsigned(data[8] << 24 | data[9] << 16 | data[10] << 8 | data[11]);
    }
    return result;
  }

  export function parseSamples (truns, baseMediaDecodeTime, tfhd) {
    let currentDts = baseMediaDecodeTime;
    let defaultSampleDuration = tfhd.defaultSampleDuration || 0;
    let defaultSampleSize = tfhd.defaultSampleSize || 0;
    let trackId = tfhd.trackId;
    let allSamples = [] as any;

    truns.forEach(function (trun) {
      // Note: We currently do not parse the sample table as well
      // as the trun. It's possible some sources will require this.
      // moov > trak > mdia > minf > stbl
      let trackRun = parseTrun(trun);
      let samples = trackRun.samples as any[];

      samples.forEach(function (sample) {
        if (sample.duration === undefined) {
          sample.duration = defaultSampleDuration;
        }
        if (sample.size === undefined) {
          sample.size = defaultSampleSize;
        }
        sample.trackId = trackId;
        sample.dts = currentDts;
        if (sample.compositionTimeOffset === undefined) {
          sample.compositionTimeOffset = 0;
        }
        sample.pts = currentDts + sample.compositionTimeOffset;

        currentDts += sample.duration;
      });

      allSamples = allSamples.concat(samples);
    });

    return allSamples;
  }

   /**
  * Finds SEI nal units contained in a Media Data Box.
  * Assumes that `parseSamples` has been called first.
  *
  * @param {Uint8Array} avcStream - The bytes of the mdat
  * @param {Object[]} samples - The samples parsed out by `parseSamples`
  * @param {Number} trackId - The trackId of this video track
  * @return {Object[]} seiNals - the parsed SEI NALUs found.
  *   The contents of the seiNal should match what is expected by
  *   CaptionStream.push (nalUnitType, size, data, escapedRBSP, pts, dts)
  *
  * @see ISO-BMFF-12/2015, Section 8.1.1
  * @see Rec. ITU-T H.264, 7.3.2.3.1
  **/
 export function findSeiNals (avcStream, samples, trackId) {
    let
      avcView = new DataView(avcStream.buffer, avcStream.byteOffset, avcStream.byteLength),
      result = [] as any,
      seiNal,
      i,
      length,
      lastMatchedSample;

    for (i = 0; i + 4 < avcStream.length; i += length) {
      length = avcView.getUint32(i);
      i += 4;

      // Bail if this doesn't appear to be an H264 stream
      if (length <= 0) {
        continue;
      }

      switch (avcStream[i] & 0x1F) {
      case 0x06:
        var data = avcStream.subarray(i + 1, i + 1 + length);
        var matchingSample = mapToSample(i, samples);

        seiNal = {
          nalUnitType: 'sei_rbsp',
          size: length,
          data: data,
          escapedRBSP: discardEmulationPreventionBytes(data),
          trackId: trackId
        };

        if (matchingSample) {
          seiNal.pts = matchingSample.pts;
          seiNal.dts = matchingSample.dts;
          lastMatchedSample = matchingSample;
        } else if (lastMatchedSample) {
          // If a matching sample cannot be found, use the last
          // sample's values as they should be as close as possible
          seiNal.pts = lastMatchedSample.pts;
          seiNal.dts = lastMatchedSample.dts;
        } else {
          // eslint-disable-next-line no-console
          console.log('We\'ve encountered a nal unit without data. See mux.js#233.');
          break;
        }

        result.push(seiNal);
        break;
      default:
        break;
      }
    }

    return result;
  }

  export function parseTrun (trun) {
    const data = trun.data.subarray(trun.start, trun.end);
    let
      result = {
        version: data[0],
        flags: new Uint8Array(data.subarray(1, 4)),
        samples: []
      } as any,
      view = new DataView(data.buffer, data.byteOffset, data.byteLength),
      // Flag interpretation
      dataOffsetPresent = result.flags[2] & 0x01, // compare with 2nd byte of 0x1
      firstSampleFlagsPresent = result.flags[2] & 0x04, // compare with 2nd byte of 0x4
      sampleDurationPresent = result.flags[1] & 0x01, // compare with 2nd byte of 0x100
      sampleSizePresent = result.flags[1] & 0x02, // compare with 2nd byte of 0x200
      sampleFlagsPresent = result.flags[1] & 0x04, // compare with 2nd byte of 0x400
      sampleCompositionTimeOffsetPresent = result.flags[1] & 0x08, // compare with 2nd byte of 0x800
      sampleCount = view.getUint32(4),
      offset = 8,
      sample;

    if (dataOffsetPresent) {
      // 32 bit signed integer
      result.dataOffset = view.getInt32(offset);
      offset += 4;
    }

    // Overrides the flags for the first sample only. The order of
    // optional values will be: duration, size, compositionTimeOffset
    if (firstSampleFlagsPresent && sampleCount) {
      sample = {
        flags: parseSampleFlags(data.subarray(offset, offset + 4))
      };
      offset += 4;
      if (sampleDurationPresent) {
        sample.duration = view.getUint32(offset);
        offset += 4;
      }
      if (sampleSizePresent) {
        sample.size = view.getUint32(offset);
        offset += 4;
      }
      if (sampleCompositionTimeOffsetPresent) {
        // Note: this should be a signed int if version is 1
        sample.compositionTimeOffset = view.getUint32(offset);
        offset += 4;
      }
      result.samples.push(sample);
      sampleCount--;
    }

    while (sampleCount--) {
      sample = {};
      if (sampleDurationPresent) {
        sample.duration = view.getUint32(offset);
        offset += 4;
      }
      if (sampleSizePresent) {
        sample.size = view.getUint32(offset);
        offset += 4;
      }
      if (sampleFlagsPresent) {
        sample.flags = parseSampleFlags(data.subarray(offset, offset + 4));
        offset += 4;
      }
      if (sampleCompositionTimeOffsetPresent) {
        // Note: this should be a signed int if version is 1
        sample.compositionTimeOffset = view.getUint32(offset);
        offset += 4;
      }
      result.samples.push(sample);
    }
    return result;
  }

  export function parseSampleFlags (flags) {
    return {
      isLeading: (flags[0] & 0x0c) >>> 2,
      dependsOn: flags[0] & 0x03,
      isDependedOn: (flags[1] & 0xc0) >>> 6,
      hasRedundancy: (flags[1] & 0x30) >>> 4,
      paddingValue: (flags[1] & 0x0e) >>> 1,
      isNonSyncSample: flags[1] & 0x01,
      degradationPriority: (flags[2] << 8) | flags[3]
    };
  }

  /**
    * Maps an offset in the mdat to a sample based on the the size of the samples.
    * Assumes that `parseSamples` has been called first.
    *
    * @param {Number} offset - The offset into the mdat
    * @param {Object[]} samples - An array of samples, parsed using `parseSamples`
    * @return {?Object} The matching sample, or null if no match was found.
    *
    * @see ISO-BMFF-12/2015, Section 8.8.8
  **/
  export function mapToSample (offset, samples) {
    let approximateOffset = offset;

    for (let i = 0; i < samples.length; i++) {
      let sample = samples[i];

      if (approximateOffset < sample.size) {
        return sample;
      }

      approximateOffset -= sample.size;
    }

    return null;
  }

  /**
 * Determine the base media decode start time, in seconds, for an MP4
 * fragment. If multiple fragments are specified, the earliest time is
 * returned.
 *
 * The base media decode time can be parsed from track fragment
 * metadata:
 * ```
 * moof > traf > tfdt.baseMediaDecodeTime
 * ```
 * It requires the timescale value from the mdhd to interpret.
 *
 * @param timescale {object} a hash of track ids to timescale values.
 * @return {number} the earliest base media decode start time for the
 * fragment, in seconds
 */
export function getStartDTS (initData, fragment) {
    let trafs, baseTimes, result;

    // we need info from two childrend of each track fragment box
    trafs = findBox(fragment, ['moof', 'traf']);

    // determine the start times for each track
    baseTimes = [].concat.apply([], trafs.map(function (traf) {
      return findBox(traf, ['tfhd']).map(function (tfhd) {
        let id, scale, baseTime;

        // get the track id from the tfhd
        id = readUint32(tfhd, 4);
        // assume a 90kHz clock if no timescale was specified
        scale = initData[id].timescale || 90e3;

        // get the base media decode time from the tfdt
        baseTime = findBox(traf, ['tfdt']).map(function (tfdt) {
          let version, result;

          version = tfdt.data[tfdt.start];
          result = readUint32(tfdt, 4);
          if (version === 1) {
            result *= Math.pow(2, 32);

            result += readUint32(tfdt, 8);
          }
          return result;
        })[0];
        // convert base time to seconds
        return baseTime / scale;
      });
    }));

    // return the minimum
    result = Math.min.apply(null, baseTimes);
    return isFinite(result) ? result : 0;
  }

  export function offsetStartDTS (initData, fragment, timeOffset) {
    findBox(fragment, ['moof', 'traf']).map(function (traf) {
      return findBox(traf, ['tfhd']).map(function (tfhd) {
      // get the track id from the tfhd
        let id = readUint32(tfhd, 4);
        // assume a 90kHz clock if no timescale was specified
        let timescale = initData[id].timescale || 90e3;

        // get the base media decode time from the tfdt
        findBox(traf, ['tfdt']).map(function (tfdt) {
          let version = tfdt.data[tfdt.start];
          let baseMediaDecodeTime = readUint32(tfdt, 4);
          if (version === 0) {
            writeUint32(tfdt, 4, baseMediaDecodeTime - timeOffset * timescale);
          } else {
            baseMediaDecodeTime *= Math.pow(2, 32);
            baseMediaDecodeTime += readUint32(tfdt, 8);
            baseMediaDecodeTime -= timeOffset * timescale;
            baseMediaDecodeTime = Math.max(baseMediaDecodeTime, 0);
            const upper = Math.floor(baseMediaDecodeTime / (UINT32_MAX + 1));
            const lower = Math.floor(baseMediaDecodeTime % (UINT32_MAX + 1));
            writeUint32(tfdt, 4, upper);
            writeUint32(tfdt, 8, lower);
          }
        });
      });
    });
  }

  export function discardEmulationPreventionBytes (data) {
    let
      length = data.byteLength,
      emulationPreventionBytesPositions = [] as any,
      i = 1,
      newLength, newData;

    // Find all `Emulation Prevention Bytes`
    while (i < length - 2) {
      if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0x03) {
        emulationPreventionBytesPositions.push(i + 2);
        i += 2;
      } else {
        i++;
      }
    }

    // If no Emulation Prevention Bytes were found just return the original
    // array
    if (emulationPreventionBytesPositions.length === 0) {
      return data;
    }

    // Create a new array to hold the NAL unit data
    newLength = length - emulationPreventionBytesPositions.length;
    newData = new Uint8Array(newLength);
    let sourceIndex = 0;

    for (i = 0; i < newLength; sourceIndex++, i++) {
      if (sourceIndex === emulationPreventionBytesPositions[0]) {
        // Skip this byte
        sourceIndex++;
        // Remove this position index
        emulationPreventionBytesPositions.shift();
      }
      newData[i] = data[sourceIndex];
    }

    return newData;
  }

  export function parseSegmentIndex (initSegment) {
    const moov = findBox(initSegment, ['moov'])[0];
    const moovEndOffset = moov ? moov.end : null; // we need this in case we need to chop of garbage of the end of current data

    let index = 0;
    let sidx = findBox(initSegment, ['sidx']) as any;
    let references;

    if (!sidx || !sidx[0]) {
      return null;
    }

    references = [];
    sidx = sidx[0];

    const version = sidx.data[0];

    // set initial offset, we skip the reference ID (not needed)
    index = version === 0 ? 8 : 16;

    const timescale = readUint32(sidx, index);
    index += 4;

    // TODO: parse earliestPresentationTime and firstOffset
    // usually zero in our case
    let earliestPresentationTime = 0;
    let firstOffset = 0;

    if (version === 0) {
      index += 8;
    } else {
      index += 16;
    }

    // skip reserved
    index += 2;

    let startByte = sidx.end + firstOffset;

    const referencesCount = readUint16(sidx, index);
    index += 2;

    for (let i = 0; i < referencesCount; i++) {
      let referenceIndex = index;

      const referenceInfo = readUint32(sidx, referenceIndex);
      referenceIndex += 4;

      const referenceSize = referenceInfo & 0x7FFFFFFF;
      const referenceType = (referenceInfo & 0x80000000) >>> 31;

      if (referenceType === 1) {
        console.warn('SIDX has hierarchical references (not supported)');
        return;
      }

      const subsegmentDuration = readUint32(sidx, referenceIndex);
      referenceIndex += 4;

      references.push({
        referenceSize,
        subsegmentDuration, // unscaled
        info: {
          duration: subsegmentDuration / timescale,
          start: startByte,
          end: startByte + referenceSize - 1
        }
      });

      startByte += referenceSize;

      // Skipping 1 bit for |startsWithSap|, 3 bits for |sapType|, and 28 bits
      // for |sapDelta|.
      referenceIndex += 4;

      // skip to next ref
      index = referenceIndex;
    }

    return {
      earliestPresentationTime,
      timescale,
      version,
      referencesCount,
      references,
      moovEndOffset
    };
  }

  var toUnsigned = function(value) {
    return value >>> 0;
  };
  
  let toHexString = function (value) {
    return ('00' + value.toString(16)).slice(-2);
  };

  /**
   * Returns the string representation of an ASCII encoded four byte buffer.
   * @param buffer {Uint8Array} a four-byte buffer to translate
   * @return {string} the corresponding string
   */
  var parseType = function(buffer) {
    var result = '';
    result += String.fromCharCode(buffer[0]);
    result += String.fromCharCode(buffer[1]);
    result += String.fromCharCode(buffer[2]);
    result += String.fromCharCode(buffer[3]);
    return result;
  }

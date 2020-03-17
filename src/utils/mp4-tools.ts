import { ElementaryStreamTypes } from '../loader/fragment';

var USER_DATA_REGISTERED_ITU_T_T35 = 4,
    RBSP_TRAILING_BITS = 128;

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

  

  var toUnsigned = function(value) {
    return value >>> 0;
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


export function sendAddTrackEvent (track: TextTrack, videoEl: HTMLMediaElement) {
  let event: Event;
  try {
    event = new Event('addtrack');
  } catch (err) {
    // for IE11
    event = document.createEvent('Event');
    event.initEvent('addtrack', false, false);
  }
  (event as any).track = track;
  videoEl.dispatchEvent(event);
}

<<<<<<< HEAD:src/utils/texttrack-utils.js
export function sendRemoveTrackEvent (track, videoEl) {
  // As of 05/2018 there is no working browser removetrack event
  // Disabling the track doesn't remove it but does signify it isn't in use
  track.mode = 'disabled';
}

export function clearCurrentCues (track) {
=======
export function clearCurrentCues (track: TextTrack) {
>>>>>>> cmaf-map-tag:src/utils/texttrack-utils.ts
  if (track && track.cues) {
    while (track.cues.length > 0) {
      track.removeCue(track.cues[0]);
    }
  }
}

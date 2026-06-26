# SuperMe

SuperMe is a browser-based AI character recorder prototype. It records a composited canvas with camera, screen capture, microphone audio, selectable animated characters, and browser face-landmark reactions for head movement, blink, smile, and mouth-open effects.

## Local Preview

Run a local static server from this folder:

```bash
python3 -m http.server 4173
```

Then open:

```text
http://localhost:4173
```

Camera, microphone, and screen recording require browser permissions. Face tracking loads MediaPipe Tasks Vision from a CDN at runtime.

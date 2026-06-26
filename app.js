const canvas = document.querySelector("#recordingCanvas");
const ctx = canvas.getContext("2d");
const cameraVideo = document.querySelector("#cameraVideo");
const screenVideo = document.querySelector("#screenVideo");
const previewWrap = document.querySelector(".preview-wrap");
const dragFrame = document.querySelector("#dragFrame");
const recordBtn = document.querySelector("#recordBtn");
const stopBtn = document.querySelector("#stopBtn");
const downloadBtn = document.querySelector("#downloadBtn");
const cameraToggle = document.querySelector("#cameraToggle");
const screenToggle = document.querySelector("#screenToggle");
const micToggle = document.querySelector("#micToggle");
const cameraSelect = document.querySelector("#cameraSelect");
const qualitySelect = document.querySelector("#qualitySelect");
const characterGrid = document.querySelector("#characterGrid");
const backgroundGrid = document.querySelector("#backgroundGrid");
const statusText = document.querySelector("#statusText");
const faceToggle = document.querySelector("#faceToggle");

const mascot = new Image();
mascot.src = "./assets/superme-mustache.png";

let cameraStream;
let screenStream;
let micStream;
let recorder;
let chunks = [];
let downloadUrl = "";
let selectedCharacter = "sunny";
let backgroundColor = "#ffffff";
let frame = { x: 0.08, y: 0.68, w: 0.25, h: 0.25 };
let faceLandmarker;
let faceLoopStarted = false;
let lastFaceVideoTime = -1;
let faceState = {
  active: false,
  x: 0.52,
  y: 0.56,
  scale: 1,
  tilt: 0,
  blink: 0,
  smile: 0,
  mouthOpen: 0,
  landmarks: null
};

const characterProfile = {
  sunny: {
    scale: 0.28,
    screenScale: 0.17,
    eye: { x: 0.5, y: 0.245, w: 0.28, h: 0.09 },
    mouth: { x: 0.5, y: 0.36, w: 0.3, h: 0.075 }
  },
  green: {
    scale: 0.25,
    screenScale: 0.16,
    eye: { x: 0.52, y: 0.235, w: 0.23, h: 0.085 },
    mouth: { x: 0.51, y: 0.315, w: 0.18, h: 0.052 }
  },
  potato: {
    scale: 0.19,
    screenScale: 0.12,
    eye: { x: 0.51, y: 0.265, w: 0.28, h: 0.08 },
    mouth: { x: 0.5, y: 0.39, w: 0.23, h: 0.07 }
  }
};

const qualityMap = {
  "1080": { width: 1920, height: 1080, fps: 30 },
  "720": { width: 1280, height: 720, fps: 30 },
  "72060": { width: 1280, height: 720, fps: 60 }
};

function setStatus(text, recording = false) {
  statusText.textContent = text;
  statusText.classList.toggle("is-recording", recording);
}

function supportedMimeType() {
  const types = [
    "video/mp4;codecs=h264,aac",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm"
  ];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function setCanvasQuality() {
  const quality = qualityMap[qualitySelect.value];
  canvas.width = quality.width;
  canvas.height = quality.height;
}

async function startCamera() {
  stopCamera();
  if (!cameraToggle.checked) return;

  const facingMode = cameraSelect.value;
  cameraStream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode,
      width: { ideal: 1280 },
      height: { ideal: 720 }
    },
    audio: false
  });
  cameraVideo.srcObject = cameraStream;
  await cameraVideo.play();
  startFaceTracking();
}

async function startScreen() {
  stopScreen();
  if (!screenToggle.checked || !navigator.mediaDevices.getDisplayMedia) return;

  screenStream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 30 },
    audio: true
  });
  screenVideo.srcObject = screenStream;
  screenStream.getVideoTracks()[0].addEventListener("ended", () => {
    screenToggle.checked = false;
    stopScreen();
  });
  await screenVideo.play();
}

async function startMic() {
  stopMic();
  if (!micToggle.checked) return;

  micStream = await navigator.mediaDevices.getUserMedia({
    video: false,
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  });
}

function stopTracks(stream) {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
}

function stopCamera() {
  stopTracks(cameraStream);
  cameraStream = undefined;
  cameraVideo.srcObject = null;
  faceState.active = false;
}

function stopScreen() {
  stopTracks(screenStream);
  screenStream = undefined;
  screenVideo.srcObject = null;
}

function stopMic() {
  stopTracks(micStream);
  micStream = undefined;
}

function drawCover(video, x, y, w, h, mirror = false) {
  if (!video.videoWidth || !video.videoHeight) return;

  const videoRatio = video.videoWidth / video.videoHeight;
  const targetRatio = w / h;
  let sourceW = video.videoWidth;
  let sourceH = video.videoHeight;
  let sourceX = 0;
  let sourceY = 0;

  if (videoRatio > targetRatio) {
    sourceW = video.videoHeight * targetRatio;
    sourceX = (video.videoWidth - sourceW) / 2;
  } else {
    sourceH = video.videoWidth / targetRatio;
    sourceY = (video.videoHeight - sourceH) / 2;
  }

  ctx.save();
  if (mirror) {
    ctx.translate(x + w, y);
    ctx.scale(-1, 1);
    ctx.drawImage(video, sourceX, sourceY, sourceW, sourceH, 0, 0, w, h);
  } else {
    ctx.drawImage(video, sourceX, sourceY, sourceW, sourceH, x, y, w, h);
  }
  ctx.restore();
}

function drawRoundRect(x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCameraLayer() {
  const x = frame.x * canvas.width;
  const y = frame.y * canvas.height;
  const w = frame.w * canvas.width;
  const h = frame.h * canvas.height;

  ctx.save();
  drawRoundRect(x, y, w, h, 44);
  ctx.clip();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, w, h);

  if (cameraStream && cameraVideo.videoWidth) {
    drawCover(cameraVideo, x, y, w, h, cameraSelect.value === "user");
  } else {
    ctx.fillStyle = "#f6f7f4";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#171717";
    ctx.font = "700 28px ui-rounded, system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Camera preview", x + w / 2, y + h / 2);
  }
  ctx.restore();

  ctx.save();
  ctx.shadowColor = "rgba(23, 23, 23, 0.16)";
  ctx.shadowBlur = 28;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
  ctx.lineWidth = 10;
  drawRoundRect(x, y, w, h, 44);
  ctx.stroke();
  ctx.restore();
}

function drawCharacter() {
  if (!mascot.complete) return;

  const t = performance.now() / 1000;
  const profile = characterProfile[selectedCharacter] || characterProfile.sunny;
  const trackingScale = faceState.active ? faceState.scale : 1;
  const baseW = canvas.width * (screenStream ? profile.screenScale : profile.scale) * trackingScale;
  const aspect = mascot.height / mascot.width;
  const expressionBounce = faceState.active ? faceState.mouthOpen * 0.035 : Math.sin(t * 1.4) * 0.012;
  const w = baseW * (1 + expressionBounce);
  const h = w * aspect * (1 - (faceState.active ? faceState.smile * 0.018 : 0));
  const anchorX = faceState.active
    ? faceState.x * canvas.width
    : screenStream
      ? frame.x * canvas.width + frame.w * canvas.width * 0.66
      : canvas.width * 0.52;
  const anchorY = faceState.active
    ? faceState.y * canvas.height
    : screenStream
      ? frame.y * canvas.height + frame.h * canvas.height * 0.6
      : canvas.height * 0.57;
  const sway = faceState.active ? 0 : Math.sin(t * 1.8) * canvas.width * 0.006;
  const x = anchorX - w / 2 + sway;
  const y = anchorY - h * 0.55 + (faceState.active ? 0 : Math.sin(t * 2.2) * 7);

  ctx.save();
  ctx.translate(anchorX, anchorY);
  ctx.rotate(faceState.active ? faceState.tilt * 0.72 : 0);
  ctx.shadowColor = "rgba(255, 107, 26, 0.22)";
  ctx.shadowBlur = 26;
  ctx.drawImage(mascot, -w / 2 + sway, -h * 0.55, w, h);
  ctx.restore();

  drawLiveFaceCutouts(x, y, w, h, profile, anchorX, anchorY);
}

function drawOvalVideo(video, centerX, centerY, width, height, source) {
  if (!video.videoWidth || !video.videoHeight) return;

  const sourceX = video.videoWidth * source.x;
  const sourceY = video.videoHeight * source.y;
  const sourceW = video.videoWidth * source.w;
  const sourceH = video.videoHeight * source.h;

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(centerX, centerY, width / 2, height / 2, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.filter = "saturate(1.08) contrast(1.05)";
  ctx.drawImage(
    video,
    sourceX,
    sourceY,
    sourceW,
    sourceH,
    centerX - width / 2,
    centerY - height / 2,
    width,
    height
  );
  ctx.restore();
}

function drawLiveFaceCutouts(x, y, w, h, profile, anchorX, anchorY) {
  if (!faceToggle.checked || !cameraStream || !cameraVideo.videoWidth) return;

  const mirror = cameraSelect.value === "user";
  const eyeX = x + w * profile.eye.x;
  const eyeY = y + h * profile.eye.y;
  const mouthX = x + w * profile.mouth.x;
  const mouthY = y + h * profile.mouth.y;
  const blinkHeight = Math.max(0.08, 1 - faceState.blink * 0.86);
  const smileWidth = 1 + faceState.smile * 0.12;
  const mouthHeight = 1 + faceState.mouthOpen * 0.58;
  const eyeSource = faceState.landmarks ? landmarkSourceBox("eyes") : {
    x: 0.36,
    y: 0.24,
    w: 0.28,
    h: 0.13
  };
  const mouthSource = faceState.landmarks ? landmarkSourceBox("mouth") : {
    x: 0.38,
    y: 0.52,
    w: 0.24,
    h: 0.11
  };

  ctx.save();
  if (faceState.active) {
    ctx.translate(anchorX, anchorY);
    ctx.rotate(faceState.tilt * 0.72);
    ctx.translate(-anchorX, -anchorY);
  }
  if (mirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    drawOvalVideo(cameraVideo, canvas.width - eyeX, eyeY, w * profile.eye.w, h * profile.eye.h * blinkHeight, eyeSource);
    drawOvalVideo(cameraVideo, canvas.width - mouthX, mouthY, w * profile.mouth.w * smileWidth, h * profile.mouth.h * mouthHeight, mouthSource);
  } else {
    drawOvalVideo(cameraVideo, eyeX, eyeY, w * profile.eye.w, h * profile.eye.h * blinkHeight, eyeSource);
    drawOvalVideo(cameraVideo, mouthX, mouthY, w * profile.mouth.w * smileWidth, h * profile.mouth.h * mouthHeight, mouthSource);
  }
  ctx.restore();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(current, next, amount) {
  return current + (next - current) * amount;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function averagePoint(points) {
  return points.reduce(
    (sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }),
    { x: 0, y: 0 }
  );
}

function landmarkSourceBox(kind) {
  const landmarks = faceState.landmarks;
  const ids = kind === "eyes"
    ? [33, 133, 159, 145, 362, 263, 386, 374]
    : [61, 291, 13, 14, 78, 308];
  const points = ids.map((id) => landmarks[id]);
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const padX = kind === "eyes" ? 0.07 : 0.035;
  const padY = kind === "eyes" ? 0.035 : 0.03;

  return {
    x: clamp(minX - padX, 0, 1),
    y: clamp(minY - padY, 0, 1),
    w: clamp(maxX - minX + padX * 2, 0.05, 0.7),
    h: clamp(maxY - minY + padY * 2, 0.04, 0.45)
  };
}

async function ensureFaceLandmarker() {
  if (faceLandmarker) return faceLandmarker;

  try {
    setStatus("Loading face");
    const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14");
    const filesetResolver = await vision.FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );
    faceLandmarker = await vision.FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    setStatus("Face ready");
    return faceLandmarker;
  } catch (error) {
    console.error(error);
    setStatus("No face model");
    return undefined;
  }
}

function updateFaceState(landmarks) {
  const leftEyeOpen = (distance(landmarks[159], landmarks[145]) + distance(landmarks[160], landmarks[144])) / 2;
  const rightEyeOpen = (distance(landmarks[386], landmarks[374]) + distance(landmarks[387], landmarks[373])) / 2;
  const faceWidth = Math.max(0.01, distance(landmarks[234], landmarks[454]));
  const eyeOpen = (leftEyeOpen + rightEyeOpen) / 2 / faceWidth;
  const mouthOpen = distance(landmarks[13], landmarks[14]) / faceWidth;
  const smileWidth = distance(landmarks[61], landmarks[291]) / faceWidth;
  const eyeCenter = averagePoint([landmarks[33], landmarks[133], landmarks[362], landmarks[263]]);
  const mouthCenter = averagePoint([landmarks[13], landmarks[14], landmarks[61], landmarks[291]]);
  const faceCenter = averagePoint([eyeCenter, mouthCenter, landmarks[10], landmarks[152]]);
  const tilt = Math.atan2(landmarks[263].y - landmarks[33].y, landmarks[263].x - landmarks[33].x);
  const mirroredX = cameraSelect.value === "user" ? 1 - faceCenter.x : faceCenter.x;

  const targetX = screenStream
    ? frame.x + frame.w * (0.35 + mirroredX * 0.3)
    : 0.5 + (mirroredX - 0.5) * 0.75;
  const targetY = screenStream
    ? frame.y + frame.h * (0.38 + faceCenter.y * 0.22)
    : 0.54 + (faceCenter.y - 0.5) * 0.58;
  const targetScale = clamp(0.78 + faceWidth * 2.1, 0.72, 1.32);

  faceState.active = true;
  faceState.x = lerp(faceState.x, clamp(targetX, 0.23, 0.78), 0.28);
  faceState.y = lerp(faceState.y, clamp(targetY, 0.32, 0.78), 0.28);
  faceState.scale = lerp(faceState.scale, targetScale, 0.2);
  faceState.tilt = lerp(faceState.tilt, tilt, 0.24);
  faceState.blink = lerp(faceState.blink, clamp((0.08 - eyeOpen) / 0.055, 0, 1), 0.38);
  faceState.smile = lerp(faceState.smile, clamp((smileWidth - 0.38) / 0.22, 0, 1), 0.28);
  faceState.mouthOpen = lerp(faceState.mouthOpen, clamp((mouthOpen - 0.025) / 0.12, 0, 1), 0.34);
  faceState.landmarks = landmarks;
}

async function startFaceTracking() {
  if (faceLoopStarted) return;
  faceLoopStarted = true;
  const model = await ensureFaceLandmarker();

  const loop = () => {
    if (model && cameraVideo.readyState >= 2 && cameraVideo.currentTime !== lastFaceVideoTime) {
      lastFaceVideoTime = cameraVideo.currentTime;
      try {
        const result = model.detectForVideo(cameraVideo, performance.now());
        if (result.faceLandmarks?.[0]) {
          updateFaceState(result.faceLandmarks[0]);
        } else {
          faceState.active = false;
          faceState.landmarks = null;
        }
      } catch (error) {
        console.error(error);
      }
    }
    requestAnimationFrame(loop);
  };

  loop();
}

function drawIdlePrompt() {
  if (screenStream || cameraStream) return;
  const w = canvas.width;
  const h = canvas.height;

  ctx.save();
  ctx.fillStyle = "#171717";
  ctx.font = `900 ${Math.round(w * 0.055)}px ui-rounded, system-ui`;
  ctx.textAlign = "center";
  ctx.fillText("Press Record", w / 2, h * 0.2);
  ctx.fillStyle = "#74716b";
  ctx.font = `700 ${Math.round(w * 0.018)}px ui-rounded, system-ui`;
  ctx.fillText("Choose camera, screen, or both.", w / 2, h * 0.25);
  ctx.restore();
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (screenStream && screenVideo.videoWidth) {
    drawCover(screenVideo, 0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (cameraToggle.checked || cameraStream) {
    drawCameraLayer();
  }

  drawCharacter();
  drawIdlePrompt();
  requestAnimationFrame(render);
}

async function prepareStreams() {
  setStatus("Preparing");
  await startCamera();
  await startScreen();
  await startMic();
  setStatus("Ready");
}

async function startRecording() {
  try {
    setCanvasQuality();
    await prepareStreams();

    const quality = qualityMap[qualitySelect.value];
    const canvasStream = canvas.captureStream(quality.fps);
    const audioTracks = [
      ...(micStream?.getAudioTracks() || []),
      ...(screenStream?.getAudioTracks() || [])
    ];
    const outputStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioTracks
    ]);
    const mimeType = supportedMimeType();

    chunks = [];
    recorder = new MediaRecorder(outputStream, mimeType ? { mimeType } : undefined);
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) chunks.push(event.data);
    });
    recorder.addEventListener("stop", () => {
      const type = recorder.mimeType || "video/webm";
      const extension = type.includes("mp4") ? "mp4" : "webm";
      const blob = new Blob(chunks, { type });
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      downloadUrl = URL.createObjectURL(blob);
      downloadBtn.disabled = false;
      downloadBtn.dataset.filename = `superme-recording.${extension}`;
      setStatus("Saved");
    });

    recorder.start(250);
    recordBtn.disabled = true;
    stopBtn.disabled = false;
    downloadBtn.disabled = true;
    setStatus("Recording", true);
  } catch (error) {
    console.error(error);
    setStatus(error.name === "NotAllowedError" ? "Permission needed" : "Try again");
    recordBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

function stopRecording() {
  if (recorder?.state === "recording") recorder.stop();
  recordBtn.disabled = false;
  stopBtn.disabled = true;
  stopScreen();
  stopMic();
  setStatus("Processing");
}

function downloadRecording() {
  if (!downloadUrl) return;
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = downloadBtn.dataset.filename || "superme-recording.webm";
  link.click();
}

function syncDragFrame() {
  dragFrame.style.left = `${frame.x * 100}%`;
  dragFrame.style.top = `${frame.y * 100}%`;
  dragFrame.style.width = `${frame.w * 100}%`;
}

function pointerPosition(event) {
  const rect = previewWrap.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / rect.width,
    y: (event.clientY - rect.top) / rect.height
  };
}

function initDrag() {
  let dragState = null;

  dragFrame.addEventListener("pointerdown", (event) => {
    const isResize = event.target.classList.contains("resize-handle");
    const point = pointerPosition(event);
    dragState = {
      isResize,
      start: point,
      frame: { ...frame }
    };
    dragFrame.setPointerCapture(event.pointerId);
  });

  dragFrame.addEventListener("pointermove", (event) => {
    if (!dragState) return;
    const point = pointerPosition(event);
    const dx = point.x - dragState.start.x;
    const dy = point.y - dragState.start.y;

    if (dragState.isResize) {
      const nextW = Math.min(0.54, Math.max(0.16, dragState.frame.w + dx));
      frame.w = nextW;
      frame.h = nextW * 0.62;
    } else {
      frame.x = Math.min(0.94 - frame.w, Math.max(0.02, dragState.frame.x + dx));
      frame.y = Math.min(0.94 - frame.h, Math.max(0.02, dragState.frame.y + dy));
    }

    syncDragFrame();
  });

  dragFrame.addEventListener("pointerup", () => {
    dragState = null;
  });
}

recordBtn.addEventListener("click", startRecording);
stopBtn.addEventListener("click", stopRecording);
downloadBtn.addEventListener("click", downloadRecording);

cameraToggle.addEventListener("change", async () => {
  if (cameraToggle.checked) {
    try {
      await startCamera();
    } catch (error) {
      console.error(error);
      cameraToggle.checked = false;
      setStatus("Camera blocked");
    }
  } else {
    stopCamera();
  }
});

screenToggle.addEventListener("change", async () => {
  if (screenToggle.checked) {
    try {
      await startScreen();
    } catch (error) {
      console.error(error);
      screenToggle.checked = false;
      setStatus("Screen blocked");
    }
  } else {
    stopScreen();
  }
});

micToggle.addEventListener("change", async () => {
  if (micToggle.checked) {
    try {
      await startMic();
    } catch (error) {
      console.error(error);
      micToggle.checked = false;
      setStatus("Mic blocked");
    }
  } else {
    stopMic();
  }
});

cameraSelect.addEventListener("change", () => {
  if (cameraToggle.checked) startCamera().catch(() => setStatus("Camera blocked"));
});

qualitySelect.addEventListener("change", setCanvasQuality);

characterGrid.addEventListener("click", (event) => {
  const option = event.target.closest(".character-option");
  if (!option) return;
  selectedCharacter = option.dataset.character;
  mascot.src = option.dataset.src;
  document.querySelectorAll(".character-option").forEach((button) => {
    const active = button === option;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active);
  });
});

backgroundGrid.addEventListener("click", (event) => {
  const option = event.target.closest(".swatch");
  if (!option) return;
  backgroundColor = option.dataset.bg;
  document.querySelectorAll(".swatch").forEach((button) => {
    const active = button === option;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active);
  });
});

window.addEventListener("beforeunload", () => {
  stopCamera();
  stopScreen();
  stopMic();
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
});

setCanvasQuality();
syncDragFrame();
initDrag();
render();

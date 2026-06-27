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
const debugToggle = document.querySelector("#debugToggle");

const mascot = new Image();
mascot.src = "./assets/superme-mustache.png";
const featureBuffer = document.createElement("canvas");
const featureCtx = featureBuffer.getContext("2d", { willReadFrequently: true });
const maskBuffer = document.createElement("canvas");
const maskCtx = maskBuffer.getContext("2d", { willReadFrequently: true });

let cameraStream;
let screenStream;
let micStream;
let recorder;
let chunks = [];
let downloadUrl = "";
let fps = 0;
let frameCount = 0;
let lastFpsTime = performance.now();
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
  lastSeen: 0,
  landmarks: null
};

const characterProfile = {
  sunny: {
    scale: 0.34,
    screenScale: 0.19,
    eyeLeft: { x: 0.405, y: 0.245, w: 0.18, h: 0.092 },
    eyeRight: { x: 0.595, y: 0.245, w: 0.18, h: 0.092 },
    eye: { x: 0.5, y: 0.245, w: 0.34, h: 0.1 },
    mouth: { x: 0.5, y: 0.374, w: 0.32, h: 0.105 },
    moustache: { x: 0.5, y: 0.315, w: 0.68, h: 0.22 }
  },
  green: {
    scale: 0.25,
    screenScale: 0.16,
    eyeLeft: { x: 0.42, y: 0.225, w: 0.14, h: 0.094 },
    eyeRight: { x: 0.57, y: 0.222, w: 0.14, h: 0.094 },
    eye: { x: 0.52, y: 0.235, w: 0.23, h: 0.085 },
    mouth: { x: 0.51, y: 0.36, w: 0.22, h: 0.09 },
    moustache: { x: 0.5, y: 0.315, w: 0.58, h: 0.2 }
  },
  potato: {
    scale: 0.19,
    screenScale: 0.12,
    eyeLeft: { x: 0.43, y: 0.27, w: 0.125, h: 0.068 },
    eyeRight: { x: 0.59, y: 0.27, w: 0.125, h: 0.068 },
    eye: { x: 0.51, y: 0.265, w: 0.28, h: 0.08 },
    mouth: { x: 0.5, y: 0.39, w: 0.19, h: 0.078 },
    moustache: null
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

function drawStoryBackground() {
  const w = canvas.width;
  const h = canvas.height;
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.72);
  sky.addColorStop(0, "#39aaff");
  sky.addColorStop(0.54, "#8bd7ff");
  sky.addColorStop(1, "#fff7d8");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.globalAlpha = 0.84;
  ctx.fillStyle = "#ffffff";
  [
    [0.1, 0.13, 0.18, 0.035],
    [0.2, 0.12, 0.26, 0.045],
    [0.78, 0.22, 0.25, 0.038],
    [0.9, 0.2, 0.17, 0.03]
  ].forEach(([cx, cy, rw, rh]) => {
    ctx.beginPath();
    ctx.ellipse(w * cx, h * cy, w * rw, h * rh, -0.04, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  const drawHill = (color, y, amp, offset) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += w / 18) {
      const py = h * y + Math.sin(x / w * Math.PI * 3 + offset) * h * amp;
      ctx.lineTo(x, py);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  };

  drawHill("#99d44d", 0.68, 0.035, 0.5);
  drawHill("#5bb95c", 0.77, 0.045, 1.7);
  drawHill("#2f9a54", 0.87, 0.035, 2.6);

  ctx.save();
  ctx.globalAlpha = 0.58;
  ctx.strokeStyle = "#2b93dd";
  ctx.lineWidth = Math.max(8, w * 0.012);
  ctx.beginPath();
  ctx.moveTo(w * 0.68, h);
  ctx.bezierCurveTo(w * 0.58, h * 0.91, w * 0.8, h * 0.84, w * 0.72, h * 0.76);
  ctx.bezierCurveTo(w * 0.62, h * 0.67, w * 0.82, h * 0.66, w * 0.92, h * 0.58);
  ctx.stroke();
  ctx.restore();
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
  setStatus("Finding face");
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

function drawLensOverlayBackdrop() {
  const x = frame.x * canvas.width;
  const y = frame.y * canvas.height;
  const w = frame.w * canvas.width;
  const h = frame.h * canvas.height;

  ctx.save();
  ctx.shadowColor = "rgba(23, 23, 23, 0.15)";
  ctx.shadowBlur = 26;
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  drawRoundRect(x, y, w, h, 44);
  ctx.fill();
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

  drawLensFeatures(x, y, w, h, profile, anchorX, anchorY, sway);
}

function drawFeatureShape(centerX, centerY, width, height, shape) {
  const left = centerX - width / 2;
  const right = centerX + width / 2;
  const top = centerY - height / 2;
  const bottom = centerY + height / 2;

  ctx.beginPath();
  if (shape === "eye") {
    ctx.moveTo(left, centerY);
    ctx.bezierCurveTo(left + width * 0.2, top - height * 0.08, right - width * 0.18, top, right, centerY);
    ctx.bezierCurveTo(right - width * 0.2, bottom + height * 0.08, left + width * 0.18, bottom, left, centerY);
  } else {
    ctx.moveTo(left, centerY);
    ctx.bezierCurveTo(left + width * 0.18, top, right - width * 0.18, top, right, centerY);
    ctx.bezierCurveTo(right - width * 0.18, bottom, left + width * 0.18, bottom, left, centerY);
  }
  ctx.closePath();
}

function featureEdgeAlpha(edge, featherStart = 0.68) {
  if (edge <= featherStart) return 1;
  if (edge >= 1) return 0;
  const t = (edge - featherStart) / (1 - featherStart);
  return 1 - t * t * (3 - 2 * t);
}

const featureLandmarkIds = {
  leftEye: [33, 160, 158, 133, 153, 144],
  rightEye: [362, 385, 387, 263, 373, 380],
  mouth: [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95]
};

function featurePolygon(kind, source, patchW, patchH) {
  if (!faceState.landmarks) return null;
  const ids = featureLandmarkIds[kind];
  if (!ids?.every((id) => faceState.landmarks[id])) return null;

  return ids.map((id) => ({
    x: ((faceState.landmarks[id].x - source.x) / source.w) * patchW,
    y: ((faceState.landmarks[id].y - source.y) / source.h) * patchH
  }));
}

function buildFeatureMask(kind, source, patchW, patchH) {
  maskBuffer.width = patchW;
  maskBuffer.height = patchH;
  maskCtx.clearRect(0, 0, patchW, patchH);
  maskCtx.fillStyle = "#fff";

  const polygon = featurePolygon(kind, source, patchW, patchH);
  if (polygon?.length) {
    maskCtx.beginPath();
    polygon.forEach((point, index) => {
      if (index === 0) maskCtx.moveTo(point.x, point.y);
      else maskCtx.lineTo(point.x, point.y);
    });
    maskCtx.closePath();
    maskCtx.fill();
  } else {
    const rx = patchW * (kind === "mouth" ? 0.42 : 0.44);
    const ry = patchH * (kind === "mouth" ? 0.34 : 0.36);
    maskCtx.beginPath();
    maskCtx.ellipse(patchW / 2, patchH / 2, rx, ry, 0, 0, Math.PI * 2);
    maskCtx.fill();
  }

  const maskData = maskCtx.getImageData(0, 0, patchW, patchH);
  const data = maskData.data;
  const passes = 2;

  for (let pass = 0; pass < passes; pass += 1) {
    const copy = new Uint8ClampedArray(data);
    for (let y = 1; y < patchH - 1; y += 1) {
      for (let x = 1; x < patchW - 1; x += 1) {
        const i = (y * patchW + x) * 4 + 3;
        data[i] = (
          copy[i] * 4 +
          copy[i - 4] +
          copy[i + 4] +
          copy[i - patchW * 4] +
          copy[i + patchW * 4]
        ) / 8;
      }
    }
  }

  return maskData;
}

function pupilOffset(kind) {
  if (!faceState.landmarks) return { x: 0, y: 0 };
  const landmarks = faceState.landmarks;
  const irisIds = kind === "left" ? [468, 469, 470, 471, 472] : [473, 474, 475, 476, 477];
  if (!landmarks[irisIds[0]]) return { x: 0, y: 0 };

  const iris = averagePoint(irisIds.map((id) => landmarks[id]));
  const outer = kind === "left" ? landmarks[33] : landmarks[362];
  const inner = kind === "left" ? landmarks[133] : landmarks[263];
  const top = kind === "left" ? landmarks[159] : landmarks[386];
  const bottom = kind === "left" ? landmarks[145] : landmarks[374];
  const eyeCenter = averagePoint([outer, inner, top, bottom]);
  const eyeWidth = Math.max(0.001, distance(outer, inner));
  const eyeHeight = Math.max(0.001, distance(top, bottom));

  return {
    x: clamp((iris.x - eyeCenter.x) / eyeWidth, -0.22, 0.22),
    y: clamp((iris.y - eyeCenter.y) / eyeHeight, -0.18, 0.18)
  };
}

function extractEyePatch(video, source, kind) {
  if (!video.videoWidth || !video.videoHeight) return;

  const sourceX = video.videoWidth * source.x;
  const sourceY = video.videoHeight * source.y;
  const sourceW = video.videoWidth * source.w;
  const sourceH = video.videoHeight * source.h;
  const patchW = 150;
  const patchH = Math.max(48, Math.round(patchW * (sourceH / Math.max(1, sourceW))));

  featureBuffer.width = patchW;
  featureBuffer.height = patchH;
  featureCtx.clearRect(0, 0, patchW, patchH);
  featureCtx.drawImage(video, sourceX, sourceY, sourceW, sourceH, 0, 0, patchW, patchH);

  const imageData = featureCtx.getImageData(0, 0, patchW, patchH);
  const data = imageData.data;
  const mask = buildFeatureMask(kind === "left" ? "leftEye" : "rightEye", source, patchW, patchH).data;
  const cx = patchW / 2;
  const cy = patchH / 2;
  const rx = patchW * 0.46;
  const ry = patchH * 0.38;

  for (let i = 0; i < data.length; i += 4) {
    const index = i / 4;
    const x = index % patchW;
    const y = Math.floor(index / patchW);
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const brightness = (r + g + b) / 3;
    const saturation = max ? (max - min) / max : 0;
    const edge = Math.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2);
    const maskAlpha = mask[i + 3] / 255;
    const softAlpha = maskAlpha * featureEdgeAlpha(edge, 0.7);
    const nearOuterEdge = edge > 0.48;
    const nearTopOrSide = y < patchH * 0.34 || x < patchW * 0.18 || x > patchW * 0.82;
    const isSpecular = brightness > 216 && saturation < 0.18;
    const isFrameLike = brightness < 58 && (nearOuterEdge || nearTopOrSide);
    const isGlassesGlare = brightness > 176 && saturation < 0.14 && (nearOuterEdge || nearTopOrSide);
    const isSkinTone = r > g * 1.12 && g > b * 1.02 && brightness > 92 && saturation > 0.18;

    if (!softAlpha || isSpecular || isFrameLike || isGlassesGlare || (isSkinTone && edge > 0.52)) {
      data[i + 3] = 0;
      continue;
    }

    data[i] = clamp(r * 1.02, 0, 255);
    data[i + 1] = clamp(g * 1.01, 0, 255);
    data[i + 2] = clamp(b * 0.98, 0, 255);
    data[i + 3] = Math.round(255 * softAlpha);
  }

  featureCtx.putImageData(imageData, 0, 0);
  return featureBuffer;
}

function drawWarpedEyeFeature(video, centerX, centerY, width, height, source, kind) {
  const blink = faceState.active ? faceState.blink : 0;
  const side = kind === "left" ? -1 : 1;
  const open = clamp(1 - blink * 0.94, 0.05, 1);
  const squash = faceState.active ? 0.82 + faceState.smile * 0.08 : 0.86;
  const eyeHeight = height * open * squash;
  const patch = extractEyePatch(video, source, kind);
  if (!patch) return;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(side * -0.08);
  ctx.scale(1.18, 0.76 + open * 0.22);
  ctx.translate(-centerX, -centerY);
  drawFeatureShape(centerX, centerY, width, eyeHeight, "eye");
  ctx.clip();
  ctx.globalAlpha = 1;
  ctx.filter = "saturate(1.03) contrast(1.08) brightness(0.96)";
  ctx.drawImage(patch, centerX - width * 0.52, centerY - eyeHeight * 0.52, width * 1.04, eyeHeight * 1.04);
  ctx.restore();

}

function warpedMouthMetrics(centerX, centerY, width, height) {
  const open = clamp(faceState.active ? faceState.mouthOpen : 0.28, 0, 0.7);
  const smile = clamp(faceState.active ? faceState.smile : 0.15, 0, 1);
  const archedY = centerY - height * (0.04 + smile * 0.06);
  const visibleWidth = width * (0.76 + smile * 0.16 - open * 0.03);
  const visibleHeight = Math.max(height * 0.16, height * (0.22 + open * 0.58));
  const skew = (faceState.landmarks ? pupilOffset("left").x + pupilOffset("right").x : 0) * width * 0.05;

  return {
    x: centerX + skew,
    y: archedY,
    w: visibleWidth,
    h: visibleHeight,
    open,
    smile
  };
}

function extractInnerMouthPatch(video, source) {
  if (!video.videoWidth || !video.videoHeight) return;

  const sourceX = video.videoWidth * source.x;
  const sourceY = video.videoHeight * source.y;
  const sourceW = video.videoWidth * source.w;
  const sourceH = video.videoHeight * source.h;
  const patchW = 180;
  const patchH = Math.max(60, Math.round(patchW * (sourceH / Math.max(1, sourceW))));

  featureBuffer.width = patchW;
  featureBuffer.height = patchH;
  featureCtx.clearRect(0, 0, patchW, patchH);
  featureCtx.drawImage(video, sourceX, sourceY, sourceW, sourceH, 0, 0, patchW, patchH);

  const imageData = featureCtx.getImageData(0, 0, patchW, patchH);
  const data = imageData.data;
  const mask = buildFeatureMask("mouth", source, patchW, patchH).data;
  const cx = patchW / 2;
  const cy = patchH / 2;
  const rx = patchW * 0.44;
  const ry = patchH * 0.34;

  for (let i = 0; i < data.length; i += 4) {
    const index = i / 4;
    const x = index % patchW;
    const y = Math.floor(index / patchW);
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const brightness = (r + g + b) / 3;
    const saturation = max ? (max - min) / max : 0;
    const edge = Math.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2);
    const maskAlpha = mask[i + 3] / 255;
    const softAlpha = maskAlpha * featureEdgeAlpha(edge, 0.66);
    const isTeeth = brightness > 142 && saturation < 0.34;
    const isInnerMouth = brightness < 82 || (r > g * 1.12 && r > b * 1.08 && brightness < 118);
    const isSkinOrLipEdge = brightness > 108 && r > g * 1.08 && g > b * 0.96 && saturation > 0.18;
    const isSpecularEdge = brightness > 218 && saturation < 0.16;

    if (!softAlpha || (!isTeeth && !isInnerMouth) || isSkinOrLipEdge || isSpecularEdge) {
      data[i + 3] = 0;
      continue;
    }

    data[i] = clamp(r * 1.04 + 4, 0, 255);
    data[i + 1] = clamp(g * 1.02 + 2, 0, 255);
    data[i + 2] = clamp(b * 0.96, 0, 255);
    data[i + 3] = Math.round(255 * softAlpha);
  }

  featureCtx.putImageData(imageData, 0, 0);
  return featureBuffer;
}

function drawMouthFeature(video, centerX, centerY, width, height, source) {
  const mouth = warpedMouthMetrics(centerX, centerY, width, height);
  const patch = extractInnerMouthPatch(video, source);
  if (!patch) return;

  ctx.save();
  ctx.translate(mouth.x, mouth.y);
  ctx.scale(1.05, 0.88 + mouth.open * 0.18);
  ctx.translate(-mouth.x, -mouth.y);
  drawFeatureShape(mouth.x, mouth.y, mouth.w, mouth.h, "mouth");
  ctx.clip();
  ctx.globalAlpha = 1;
  ctx.filter = "saturate(1.02) contrast(1.15) brightness(0.98)";
  ctx.drawImage(patch, mouth.x - mouth.w * 0.52, mouth.y - mouth.h * 0.52, mouth.w * 1.04, mouth.h * 1.04);
  ctx.restore();
}

function drawMustacheFrontLayer(x, y, w, h, profile) {
  if (!profile.moustache || !mascot.complete) return;
  const m = profile.moustache;
  const sourceX = mascot.width * clamp(m.x - m.w / 2, 0, 1);
  const sourceY = mascot.height * clamp(m.y - m.h / 2, 0, 1);
  const sourceW = mascot.width * clamp(m.w, 0.01, 1);
  const sourceH = mascot.height * clamp(m.h, 0.01, 1);
  const destX = x + w * (m.x - m.w / 2);
  const destY = y + h * (m.y - m.h / 2);
  const destW = w * m.w;
  const destH = h * m.h;
  const leftX = destX + destW * 0.34;
  const rightX = destX + destW * 0.66;
  const lobeY = destY + destH * 0.55;
  const lobeW = destW * 0.43;
  const lobeH = destH * 0.72;
  const centerY = destY + destH * 0.36;

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(leftX, lobeY, lobeW * 0.55, lobeH * 0.5, -0.18, 0, Math.PI * 2);
  ctx.ellipse(rightX, lobeY, lobeW * 0.55, lobeH * 0.5, 0.18, 0, Math.PI * 2);
  ctx.ellipse(destX + destW * 0.5, centerY, destW * 0.18, destH * 0.2, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.shadowColor = "rgba(61, 24, 5, 0.16)";
  ctx.shadowBlur = Math.max(6, w * 0.018);
  ctx.drawImage(mascot, sourceX, sourceY, sourceW, sourceH, destX, destY, destW, destH);
  ctx.restore();
}

function drawFeatureSeats(x, y, w, h, profile) {
  const seats = [
    profile.eyeLeft && { ...profile.eyeLeft, shape: "eye" },
    profile.eyeRight && { ...profile.eyeRight, shape: "eye" },
    profile.mouth && { ...profile.mouth, shape: "mouth" }
  ].filter(Boolean);

  for (const seat of seats) {
    const cx = x + w * seat.x;
    const cy = y + h * seat.y;
    const sw = w * seat.w * (seat.shape === "mouth" ? 0.96 : 0.88);
    const sh = h * seat.h * (seat.shape === "mouth" ? 0.86 : 0.72);

    ctx.save();
    ctx.shadowColor = seat.shape === "mouth" ? "rgba(63, 21, 7, 0.42)" : "rgba(58, 25, 5, 0.34)";
    ctx.shadowBlur = Math.max(10, w * 0.018);
    ctx.fillStyle = seat.shape === "mouth" ? "rgba(53, 19, 8, 0.54)" : "rgba(46, 20, 8, 0.5)";
    drawFeatureShape(cx, cy, sw, sh, seat.shape);
    ctx.fill();
    ctx.restore();
  }
}

function drawLensFeatures(x, y, w, h, profile, anchorX, anchorY) {
  if (!faceToggle.checked || !cameraStream || !cameraVideo.videoWidth) return;

  const leftEyeX = x + w * (profile.eyeLeft?.x ?? profile.eye.x - profile.eye.w * 0.28);
  const rightEyeX = x + w * (profile.eyeRight?.x ?? profile.eye.x + profile.eye.w * 0.28);
  const leftEyeY = y + h * (profile.eyeLeft?.y ?? profile.eye.y);
  const rightEyeY = y + h * (profile.eyeRight?.y ?? profile.eye.y);
  const mouthX = x + w * profile.mouth.x;
  const mouthY = y + h * profile.mouth.y;
  const smileWidth = 1 + faceState.smile * 0.12;
  const mouthHeight = 1 + clamp(faceState.mouthOpen, 0, 0.7) * 0.26;
  const mouthSource = faceState.landmarks ? landmarkSourceBox("mouth") : {
    x: 0.41,
    y: 0.54,
    w: 0.18,
    h: 0.09
  };
  const leftEyeSource = faceState.landmarks ? landmarkSourceBox("leftEye") : {
    x: 0.35,
    y: 0.24,
    w: 0.14,
    h: 0.1
  };
  const rightEyeSource = faceState.landmarks ? landmarkSourceBox("rightEye") : {
    x: 0.51,
    y: 0.24,
    w: 0.14,
    h: 0.1
  };
  const leftEyeWidth = w * (profile.eyeLeft?.w ?? profile.eye.w * 0.44);
  const rightEyeWidth = w * (profile.eyeRight?.w ?? profile.eye.w * 0.44);
  const leftEyeHeight = h * (profile.eyeLeft?.h ?? profile.eye.h);
  const rightEyeHeight = h * (profile.eyeRight?.h ?? profile.eye.h);

  ctx.save();
  if (faceState.active) {
    ctx.translate(anchorX, anchorY);
    ctx.rotate(faceState.tilt * 0.72);
    ctx.translate(-anchorX, -anchorY);
  }
  drawFeatureSeats(x, y, w, h, profile);
  drawWarpedEyeFeature(cameraVideo, leftEyeX, leftEyeY, leftEyeWidth, leftEyeHeight, leftEyeSource, "left");
  drawWarpedEyeFeature(cameraVideo, rightEyeX, rightEyeY, rightEyeWidth, rightEyeHeight, rightEyeSource, "right");
  drawMouthFeature(cameraVideo, mouthX, mouthY, w * profile.mouth.w * smileWidth, h * profile.mouth.h * mouthHeight, mouthSource);
  drawMustacheFrontLayer(x, y, w, h, profile);
  drawDebugOverlay(x, y, w, h, profile);
  ctx.restore();
}

function drawDebugOverlay(x, y, w, h, profile) {
  if (!debugToggle?.checked) return;

  const seats = [
    profile.eyeLeft && { ...profile.eyeLeft, shape: "eye", color: "#37d67a" },
    profile.eyeRight && { ...profile.eyeRight, shape: "eye", color: "#37d67a" },
    profile.mouth && { ...profile.mouth, shape: "mouth", color: "#ff4f7b" }
  ].filter(Boolean);

  ctx.save();
  ctx.lineWidth = Math.max(3, w * 0.004);
  for (const seat of seats) {
    ctx.strokeStyle = seat.color;
    drawFeatureShape(x + w * seat.x, y + h * seat.y, w * seat.w, h * seat.h, seat.shape);
    ctx.stroke();
  }

  if (faceState.landmarks) {
    ctx.fillStyle = "rgba(55, 214, 122, 0.74)";
    [...featureLandmarkIds.leftEye, ...featureLandmarkIds.rightEye, ...featureLandmarkIds.mouth].forEach((id) => {
      const point = faceState.landmarks[id];
      if (!point) return;
      const px = cameraSelect.value === "user" ? (1 - point.x) * canvas.width : point.x * canvas.width;
      const py = point.y * canvas.height;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(2, canvas.width * 0.002), 0, Math.PI * 2);
      ctx.fill();
    });
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
  ctx.fillRect(18, 18, 220, 92);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 24px ui-rounded, system-ui";
  ctx.textAlign = "left";
  ctx.fillText(`FPS ${fps}`, 34, 54);
  ctx.font = "700 18px ui-rounded, system-ui";
  ctx.fillText(faceState.active ? "Tracking face" : "No face", 34, 84);
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
  const ids = kind === "leftEye"
    ? featureLandmarkIds.leftEye
    : kind === "rightEye"
      ? featureLandmarkIds.rightEye
      : featureLandmarkIds.mouth;
  const points = ids.map((id) => landmarks[id]);
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const padX = kind.includes("Eye") ? 0.01 : 0.012;
  const padY = kind.includes("Eye") ? 0.008 : 0.01;

  return {
    x: clamp(minX - padX, 0, 1),
    y: clamp(minY - padY, 0, 1),
    w: clamp(maxX - minX + padX * 2, kind.includes("Eye") ? 0.035 : 0.05, kind.includes("Eye") ? 0.2 : 0.22),
    h: clamp(maxY - minY + padY * 2, kind.includes("Eye") ? 0.024 : 0.035, kind.includes("Eye") ? 0.12 : 0.18)
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
    faceLandmarker = undefined;
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
  faceState.lastSeen = performance.now();
  faceState.landmarks = landmarks;
}

async function startFaceTracking() {
  if (faceLoopStarted) return;
  faceLoopStarted = true;
  const model = await ensureFaceLandmarker();
  if (!model) {
    faceLoopStarted = false;
    return;
  }

  const loop = () => {
    if (model && cameraVideo.readyState >= 2 && cameraVideo.currentTime !== lastFaceVideoTime) {
      lastFaceVideoTime = cameraVideo.currentTime;
      try {
        const result = model.detectForVideo(cameraVideo, performance.now());
        if (result.faceLandmarks?.[0]) {
          updateFaceState(result.faceLandmarks[0]);
          if (!statusText.classList.contains("is-recording")) setStatus("Face tracking");
        } else {
          faceState.active = false;
          faceState.landmarks = null;
          if (cameraStream && !statusText.classList.contains("is-recording")) setStatus("Find face");
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
  frameCount += 1;
  const now = performance.now();
  if (now - lastFpsTime > 500) {
    fps = Math.round((frameCount * 1000) / (now - lastFpsTime));
    frameCount = 0;
    lastFpsTime = now;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (backgroundColor === "story") {
    drawStoryBackground();
  } else {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (screenStream && screenVideo.videoWidth) {
    drawCover(screenVideo, 0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (screenStream && cameraToggle.checked) {
    drawLensOverlayBackdrop();
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

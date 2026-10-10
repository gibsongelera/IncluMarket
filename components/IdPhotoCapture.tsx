"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

export interface CapturedPhoto {
  blob: Blob;
  url: string;
}

export type PhotoKind = "front" | "back" | "selfie";

/** Long side of the saved photo. Enough to read an ID; well under 2 MB as JPEG. */
const MAX_SIDE = 1600;
const MAX_BYTES = 1_900_000;
/** Refuse absurd source files before decoding them. */
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

/**
 * Re-encode through a canvas. This is what strips EXIF and GPS data: the
 * canvas holds pixels only. Orientation is applied first, so the saved photo
 * is upright.
 */
async function encode(source: CanvasImageSource, width: number, height: number): Promise<Blob> {
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no-canvas");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.86, 0.75, 0.62, 0.5]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= MAX_BYTES) return blob;
  }
  throw new Error("too-large");
}

async function decodeFile(file: File): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      // Fall back to an <img>, which also honours orientation.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function cameraError(err: unknown): string {
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera access was not allowed. You can upload a photo instead, or allow the camera in your browser settings.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "We could not find a camera on this device. Upload a photo instead.";
  }
  if (name === "NotReadableError") {
    return "Another app is using the camera. Close it and try again, or upload a photo instead.";
  }
  return "The camera could not start. Upload a photo instead.";
}

/**
 * One photo slot in the verification flow: the camera with a framing guide
 * and a retake button, or a file upload — always both offered, because many
 * Windows desktops have no camera and a person may deny permission.
 */
export function IdPhotoCapture({
  kind,
  title,
  hint,
  value,
  onChange,
  error,
}: {
  kind: PhotoKind;
  title: string;
  hint: string;
  value: CapturedPhoto | null;
  onChange: (photo: CapturedPhoto | null) => void;
  error?: string | null;
}) {
  const id = useId();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"idle" | "starting" | "camera">("idle");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [hasCamera, setHasCamera] = useState(false);

  useEffect(() => {
    setHasCamera(typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia));
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setMode("idle");
  }, []);

  useEffect(() => stop, [stop]);

  // The <video> mounts when mode becomes "camera"; attach the stream then.
  useEffect(() => {
    const video = videoRef.current;
    if (mode !== "camera" || !video || !streamRef.current) return;
    video.srcObject = streamRef.current;
    void video.play().catch(() => {});
  }, [mode]);

  async function startCamera() {
    setMessage(null);
    setMode("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: kind === "selfie" ? "user" : { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      streamRef.current = stream;
      setMode("camera");
    } catch (err) {
      stop();
      setMessage(cameraError(err));
    }
  }

  async function takePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setMessage("The camera is still starting. Try again in a moment.");
      return;
    }
    setBusy(true);
    try {
      const blob = await encode(video, video.videoWidth, video.videoHeight);
      stop();
      onChange({ blob, url: URL.createObjectURL(blob) });
      setMessage(null);
    } catch {
      setMessage("We could not save that photo. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMessage(null);
    if (!/^image\/(jpeg|png)$/.test(file.type)) {
      setMessage("Choose a JPEG or PNG photo.");
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setMessage("That file is too large. Choose a photo under 25 MB.");
      return;
    }
    setBusy(true);
    try {
      const { source, width, height } = await decodeFile(file);
      if (Math.min(width, height) < 320) {
        setMessage("That photo is too small to read. Choose a larger, clearer photo.");
        return;
      }
      const blob = await encode(source, width, height);
      if ("close" in source && typeof source.close === "function") source.close();
      stop();
      onChange({ blob, url: URL.createObjectURL(blob) });
    } catch {
      setMessage("We could not open that photo. Try another one, or use the camera.");
    } finally {
      setBusy(false);
    }
  }

  const hintId = `${id}-hint`;
  const msgId = `${id}-msg`;
  const shown = message || error;

  return (
    <fieldset className="capture" aria-describedby={`${hintId}${shown ? ` ${msgId}` : ""}`}>
      <legend className="capture__title">{title}</legend>
      <p className="hint" id={hintId}>
        {hint}
      </p>

      {value && mode === "idle" ? (
        <div className="capture__preview">
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
          <img src={value.url} alt={`Preview: ${title}`} />
          <p className="capture__ok">
            <span aria-hidden="true">✓</span> Photo added
          </p>
        </div>
      ) : null}

      {mode !== "idle" ? (
        <div className={`capture__stage capture__stage--${kind}`}>
          <video
            ref={videoRef}
            className="capture__video"
            playsInline
            muted
            autoPlay
            aria-label={kind === "selfie" ? "Camera view of you" : "Camera view of your ID"}
          />
          {kind === "selfie" ? (
            <p className="capture__guide-text">Hold your ID next to your face. Keep both in the frame.</p>
          ) : (
            <div className="capture__guide" aria-hidden="true" />
          )}
        </div>
      ) : null}

      {shown ? (
        <p className="field-error" id={msgId} role="alert">
          {shown}
        </p>
      ) : null}

      <div className="capture__actions">
        {mode === "camera" ? (
          <>
            <button type="button" className="btn btn--primary" onClick={takePhoto} disabled={busy}>
              {busy ? "Saving…" : "Take photo"}
            </button>
            <button type="button" className="btn btn--ghost" onClick={stop}>
              Cancel
            </button>
          </>
        ) : (
          <>
            {hasCamera ? (
              <button
                type="button"
                className={`btn ${value ? "btn--outline" : "btn--primary"}`}
                onClick={startCamera}
                disabled={busy || mode === "starting"}
              >
                {mode === "starting" ? "Starting camera…" : value ? "Retake with camera" : "Use camera"}
              </button>
            ) : null}
            <button
              type="button"
              className={`btn ${hasCamera || value ? "btn--outline" : "btn--primary"}`}
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              {value ? "Choose a different photo" : "Upload a photo"}
            </button>
            {value ? (
              <button type="button" className="btn btn--ghost" onClick={() => onChange(null)}>
                Remove
              </button>
            ) : null}
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={onFile}
        />
      </div>
    </fieldset>
  );
}

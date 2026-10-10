/**
 * Resize and re-encode a photo in the browser before upload: smaller files,
 * and no EXIF or GPS data (the canvas holds pixels only). Browser-only.
 */
export async function toJpeg(file: File, maxSide = 1200, maxBytes = 1_000_000): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of [0.85, 0.75, 0.62]) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q));
      if (blob && blob.size <= maxBytes) return blob;
    }
    throw new Error("too-large");
  } finally {
    URL.revokeObjectURL(url);
  }
}

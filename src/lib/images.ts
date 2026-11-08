/**
 * Pictures for team visual questions: read an image file the person chose, scale it down and re-encode
 * it in the browser (WebP where supported, JPEG otherwise), so it fits in one team record. Re-encoding
 * also drops anything but the pixels (metadata such as GPS position, embedded scripts in odd formats).
 */

const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** Largest picture kept: about 250 KB of data URL (a record holds up to 900 KB). */
export const MAX_PICTURE_BYTES = 260_000;

export interface Picture {
  dataUrl: string;
  width: number;
  height: number;
}

async function decode(file: Blob): Promise<{ draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; width: number; height: number; close: () => void }> {
  if ('createImageBitmap' in window) {
    const bmp = await createImageBitmap(file);
    return { draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h), width: bmp.width, height: bmp.height, close: () => bmp.close() };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h), width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

/** Scale a picture so its longer side is at most `maxSide` pixels and its data URL fits `maxBytes`. */
export async function pictureFromFile(file: File, maxSide = 1200, maxBytes = MAX_PICTURE_BYTES): Promise<Picture> {
  if (!TYPES.includes(file.type)) throw new Error('Choose a JPEG, PNG, WebP or GIF picture.');
  if (file.size > 25_000_000) throw new Error('That picture is over 25 MB. Choose a smaller one.');
  const src = await decode(file).catch(() => {
    throw new Error('That file could not be read as a picture.');
  });
  try {
    let side = maxSide;
    for (let attempt = 0; attempt < 6; attempt++) {
      const scale = Math.min(1, side / Math.max(src.width, src.height));
      const w = Math.max(1, Math.round(src.width * scale));
      const h = Math.max(1, Math.round(src.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('This browser cannot resize pictures.');
      // Transparent areas (PNG, GIF) become white, as on a printed worksheet.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      src.draw(ctx, w, h);
      for (const quality of [0.85, 0.75, 0.65, 0.55, 0.45]) {
        let url = canvas.toDataURL('image/webp', quality);
        if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', quality);
        if (url.length <= maxBytes) return { dataUrl: url, width: w, height: h };
      }
      side = Math.round(side * 0.75);
    }
    throw new Error('That picture is too detailed to keep small enough. Try cropping it.');
  } finally {
    src.close();
  }
}

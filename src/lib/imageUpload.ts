import { ref, uploadBytes } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { storage, functions } from './firebase';

const BUCKET = 'havitalk';

/** Mirrors PUBLIC_CACHE_CONTROL in functions/src/publishUpload.ts. */
const PUBLIC_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** Formats a canvas can re-encode without losing something that matters. */
const RE_ENCODABLE = /^image\/(jpeg|png|webp)$/;

/** Longest edge to keep, per kind of image. */
export const MAX_DIM = {
  /** Avatars render at 80px in the list and 160px on the profile; 512 covers 3x. */
  avatar: 512,
  /** QR codes must stay scannable, so they keep far more detail than they display. */
  qr: 1024,
  /** Blog covers and in-article images can go full-bleed on a wide screen. */
  article: 1600,
} as const;

/** Public URL for an object. Only valid once publishUpload has made it public. */
export function publicImageUrl(path: string): string {
  return `https://storage.googleapis.com/${BUCKET}/${path}`;
}

/**
 * Downscales and re-encodes to WebP in the browser.
 *
 * Returns null whenever the original should be kept as-is: an unsupported type
 * (an SVG is already tiny, a GIF would lose its animation), a decode failure, or
 * a re-encode that came out no smaller — small PNG logos routinely beat their
 * WebP copies.
 */
async function optimize(
  file: File,
  maxDim: number,
  quality: number
): Promise<Blob | null> {
  if (!RE_ENCODABLE.test(file.type)) return null;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }

  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return null;
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', quality)
  );
  return blob && blob.size < file.size ? blob : null;
}

export interface UploadPublicImageOptions {
  /** Directory inside the bucket, e.g. `teacher-profiles`. No trailing slash. */
  dir: string;
  file: File;
  /** Longest edge to keep — pick one of MAX_DIM. */
  maxDim: number;
  /** WebP quality, 0-1. Raise it for images that must stay crisp. */
  quality?: number;
  /** Optional label in the file name, e.g. the QR slot. */
  namePrefix?: string;
}

/**
 * Uploads an image and returns a URL that serves from Google's edge cache.
 *
 * Three things have to happen together for that to hold, which is why they live
 * in one helper rather than at each call site: the bytes are downscaled, the
 * object is stored with a long `cacheControl`, and it is given a public ACL so
 * the `storage.googleapis.com` URL resolves instead of returning 403.
 */
export async function uploadPublicImage({
  dir,
  file,
  maxDim,
  quality = 0.85,
  namePrefix,
}: UploadPublicImageOptions): Promise<string> {
  const optimized = await optimize(file, maxDim, quality);
  const ext = optimized ? 'webp' : file.name.split('.').pop() || 'jpg';
  const label = namePrefix ? `${namePrefix}-` : '';
  const path = `${dir}/${label}${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;

  await uploadBytes(ref(storage, path), optimized ?? file, {
    cacheControl: PUBLIC_CACHE_CONTROL,
    contentType: optimized ? 'image/webp' : file.type,
  });

  await httpsCallable<{ path: string }, { url: string }>(
    functions,
    'publishUpload'
  )({ path });

  return publicImageUrl(path);
}

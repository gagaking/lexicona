import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export async function getCompressedImageDataUrl(
  input: string,
  maxSize = 1600,
  quality = 0.9,
): Promise<string> {
  let blob: Blob;
  try {
    const response = await fetch(input);
    blob = await response.blob();
  } catch {
    return input;
  }

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    const fallbackToOriginal = () => {
      URL.revokeObjectURL(objectUrl);
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(input);
      reader.readAsDataURL(blob);
    };

    img.onload = () => {
      try {
        const sourceWidth = img.naturalWidth || 1;
        const sourceHeight = img.naturalHeight || 1;
        const scale = Math.min(1, maxSize / Math.max(sourceWidth, sourceHeight));
        const width = Math.max(1, Math.round(sourceWidth * scale));
        const height = Math.max(1, Math.round(sourceHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Cannot get 2D context");
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        URL.revokeObjectURL(objectUrl);
        resolve(dataUrl);
      } catch {
        fallbackToOriginal();
      }
    };
    img.onerror = fallbackToOriginal;
    img.src = objectUrl;
  });
}

export function getDirectImageUrl(url: string | undefined, size: number | 'original' = 1000): string {
  if (!url) return '';
  const cleanUrl = url.trim();
  if (!cleanUrl) return '';
  
  const sizeParam = size === 'original' ? 's0' : `w${size}`;
  
  // Convert Google Drive links to direct thumbnail links
  const driveMatch1 = cleanUrl.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (driveMatch1 && driveMatch1[1]) {
    return `https://drive.google.com/thumbnail?id=${driveMatch1[1]}&sz=${sizeParam}`;
  }
  
  const driveMatch2 = cleanUrl.match(/drive\.google\.com\/(?:open|uc)\?id=([^&]+)/);
  if (driveMatch2 && driveMatch2[1]) {
    return `https://drive.google.com/thumbnail?id=${driveMatch2[1]}&sz=${sizeParam}`;
  }
  
  // General resizing via wsrv.nl to guarantee thumbnail size and save bandwidth
  // Exclude data URLs
  if (size !== 'original' && !cleanUrl.startsWith('data:')) {
    // If it's an ImgBB link or other links, use the wsrv.nl proxy to forcefully resize
    // because ImgBB direct links don't support simple .th.jpg extension swaps (the hash changes).
    return `https://wsrv.nl/?url=${encodeURIComponent(cleanUrl)}&w=${size}&output=webp`;
  }
  
  if (cleanUrl.startsWith('ttps://')) {
    return 'h' + cleanUrl;
  }
  
  return cleanUrl;
}

export function mirrorPrompt(text: string): string {
  if (!text) return "";
  const map: Record<string, string> = {
    '左': '右',
    '右': '左',
    'left': 'right',
    'right': 'left',
    'Left': 'Right',
    'Right': 'Left',
    'LEFT': 'RIGHT',
    'RIGHT': 'LEFT'
  };
  const regex = /left|right|Left|Right|LEFT|RIGHT|左|右/g;
  return text.replace(regex, (match) => map[match] || match);
}










import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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











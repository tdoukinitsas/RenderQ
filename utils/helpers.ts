// Utility functions for the application

/**
 * Parse a frame range string into an array of frame numbers
 * Supports formats like: "1-10", "1,5,10", "1-10, 20-30, 50"
 */
export function parseFrameRanges(rangeString: string): number[] {
  if (!rangeString || rangeString.trim() === '') {
    return [];
  }
  
  const frames: number[] = [];
  const parts = rangeString.split(',').map(s => s.trim());
  
  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-').map(s => s.trim());
      const start = parseInt(startStr);
      const end = parseInt(endStr);
      if (!isNaN(start) && !isNaN(end)) {
        for (let i = start; i <= end; i++) {
          if (!frames.includes(i)) {
            frames.push(i);
          }
        }
      }
    } else {
      const frame = parseInt(part);
      if (!isNaN(frame) && !frames.includes(frame)) {
        frames.push(frame);
      }
    }
  }
  
  return frames.sort((a, b) => a - b);
}

/**
 * Convert an array of frame numbers back to a compact range string
 */
export function framesToRangeString(frames: number[]): string {
  if (frames.length === 0) return '';
  
  const sorted = [...frames].sort((a, b) => a - b);
  const ranges: string[] = [];
  
  let start = sorted[0];
  let end = start;
  
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push(start === end ? `${start}` : `${start}-${end}`);
      start = sorted[i];
      end = start;
    }
  }
  ranges.push(start === end ? `${start}` : `${start}-${end}`);
  
  return ranges.join(', ');
}

/**
 * Format milliseconds to a human-readable time string
 */
export function formatTime(ms: number): string {
  if (ms <= 0) return '0s';
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Format bytes to a human-readable size string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get file name from a full path
 */
export function getFileName(path: string): string {
  return path.split('\\').pop() || path.split('/').pop() || path;
}

/**
 * Get directory from a full path
 */
export function getDirectory(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  parts.pop();
  return parts.join('/');
}

/**
 * Validate a frame range string
 */
export function validateFrameRange(rangeString: string): { valid: boolean; error?: string } {
  if (!rangeString || rangeString.trim() === '') {
    return { valid: false, error: 'Frame range is empty' };
  }
  
  const parts = rangeString.split(',').map(s => s.trim());
  
  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-').map(s => s.trim());
      const start = parseInt(startStr);
      const end = parseInt(endStr);
      
      if (isNaN(start) || isNaN(end)) {
        return { valid: false, error: `Invalid range: ${part}` };
      }
      
      if (start > end) {
        return { valid: false, error: `Start frame (${start}) is greater than end frame (${end})` };
      }
      
      if (start < 0 || end < 0) {
        return { valid: false, error: 'Frame numbers cannot be negative' };
      }
    } else {
      const frame = parseInt(part);
      if (isNaN(frame)) {
        return { valid: false, error: `Invalid frame number: ${part}` };
      }
      if (frame < 0) {
        return { valid: false, error: 'Frame numbers cannot be negative' };
      }
    }
  }
  
  return { valid: true };
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Throttle function
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a thumbnail from a video file
 * @param videoFile - The video file to generate thumbnail from
 * @param timeOffset - Time in seconds to capture the frame (default: 1 second)
 * @returns Promise<string> - Base64 data URL of the thumbnail
 */
export function generateVideoThumbnail(
  videoFile: File,
  timeOffset: number = 1
): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    // Create object URL for the video file
    const objectUrl = URL.createObjectURL(videoFile);
    video.src = objectUrl;

    video.onloadedmetadata = () => {
      // Set canvas dimensions
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Seek to the specified time
      video.currentTime = Math.min(timeOffset, video.duration * 0.1); // Use 10% of video or timeOffset, whichever is smaller
    };

    video.onseeked = () => {
      try {
        // Draw the video frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Convert to base64
        const thumbnail = canvas.toDataURL('image/jpeg', 0.8);
        URL.revokeObjectURL(objectUrl);
        resolve(thumbnail);
      } catch (error) {
        URL.revokeObjectURL(objectUrl);
        reject(error);
      }
    };

    video.onerror = (error) => {
      URL.revokeObjectURL(objectUrl);
      reject(error);
    };
  });
}

/**
 * Convert base64 data URL to File object
 * @param dataUrl - Base64 data URL
 * @param filename - Name for the file
 * @returns File object
 */
export function dataURLtoFile(dataUrl: string, filename: string): File {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  
  return new File([u8arr], filename, { type: mime });
}

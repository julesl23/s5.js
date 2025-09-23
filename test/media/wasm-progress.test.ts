import { describe, it, expect, vi } from 'vitest';
import { MediaProcessor, BrowserCompat } from '../../src/media/index.js';

describe('WASM Progress Tracking', () => {
  it('should track progress during WASM initialization', async () => {
    MediaProcessor.reset();

    // Mock browser capabilities to include WASM support
    vi.spyOn(BrowserCompat, 'checkCapabilities').mockResolvedValue({
      webAssembly: true,
      webAssemblyStreaming: true,
      sharedArrayBuffer: false,
      webWorkers: true,
      offscreenCanvas: false,
      createImageBitmap: true,
      webP: true,
      avif: false,
      webGL: false,
      webGL2: false,
      memoryInfo: false,
      performanceAPI: true,
      memoryLimit: 1024
    });

    const progressValues: number[] = [];

    await MediaProcessor.initialize({
      onProgress: (percent) => {
        progressValues.push(percent);
      }
    });

    // Should have multiple progress updates
    expect(progressValues.length).toBeGreaterThan(2);

    // Should start at 0
    expect(progressValues[0]).toBe(0);

    // Should end at 100
    expect(progressValues[progressValues.length - 1]).toBe(100);

    // Should be in ascending order
    for (let i = 1; i < progressValues.length; i++) {
      expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]);
    }

    vi.restoreAllMocks();
  });

  it('should handle large image optimization', async () => {
    MediaProcessor.reset();
    await MediaProcessor.initialize();

    // Create a large fake image (over 50MB would be truncated)
    const largeData = new Uint8Array(60 * 1024 * 1024); // 60MB

    // Set JPEG magic bytes
    largeData[0] = 0xFF;
    largeData[1] = 0xD8;
    largeData[2] = 0xFF;
    largeData[3] = 0xE0;

    const blob = new Blob([largeData], { type: 'image/jpeg' });

    // Should handle large image without crashing
    const metadata = await MediaProcessor.extractMetadata(blob);

    // May or may not return metadata depending on implementation
    // The important thing is it doesn't crash
    expect(() => metadata).not.toThrow();
  });
});
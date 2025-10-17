import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FS5 } from '../../src/fs/fs5.js';
import { JSCryptoImplementation } from '../../src/api/crypto/js.js';
import type { DirV1 } from '../../src/fs/dirv1/types.js';
import type { PutImageOptions, GetThumbnailOptions, CreateImageGalleryOptions } from '../../src/fs/media-types.js';

// Mock browser APIs for media processing
let lastCreatedBlob: Blob | null = null;

global.Image = class Image {
  public src: string = '';
  public onload: (() => void) | null = null;
  public onerror: (() => void) | null = null;
  public width: number = 800;
  public height: number = 600;

  constructor() {
    setTimeout(() => {
      if (this.src === 'blob:mock-url' && lastCreatedBlob) {
        if (lastCreatedBlob.size < 10) {
          if (this.onerror) this.onerror();
          return;
        }
      }
      if (this.onload) this.onload();
    }, 0);
  }
} as any;

global.URL = {
  createObjectURL: (blob: Blob) => {
    lastCreatedBlob = blob;
    return 'blob:mock-url';
  },
  revokeObjectURL: (url: string) => {
    lastCreatedBlob = null;
  },
} as any;

global.document = {
  createElement: (tag: string) => {
    if (tag === 'canvas') {
      const canvas = {
        _width: 0,
        _height: 0,
        get width() { return this._width; },
        set width(val) { this._width = val; },
        get height() { return this._height; },
        set height(val) { this._height = val; },
        getContext: () => ({
          imageSmoothingEnabled: true,
          imageSmoothingQuality: 'high',
          fillStyle: '',
          drawImage: () => {},
          fillRect: () => {},
          getImageData: (x: number, y: number, w: number, h: number) => ({
            width: w,
            height: h,
            data: new Uint8ClampedArray(w * h * 4),
          }),
        }),
        toBlob: (callback: (blob: Blob | null) => void, type: string, quality?: number) => {
          const baseSize = Math.max(canvas._width * canvas._height, 100);
          const qualityFactor = quality !== undefined ? quality : 0.92;
          const size = Math.floor(baseSize * qualityFactor * 0.5) + 50;
          const mockBlob = new Blob([new Uint8Array(size)], { type });
          setTimeout(() => callback(mockBlob), 0);
        },
      };
      return canvas;
    }
    return {};
  },
} as any;

// Create a minimal mock API similar to path-api-simple.test.ts
class SimpleMockAPI {
  crypto: JSCryptoImplementation;
  private blobs: Map<string, Uint8Array> = new Map();
  private registry: Map<string, any> = new Map();

  constructor() {
    this.crypto = new JSCryptoImplementation();
  }

  async uploadBlob(blob: Blob): Promise<{ hash: Uint8Array; size: number }> {
    const data = new Uint8Array(await blob.arrayBuffer());
    const hash = await this.crypto.hashBlake3(data);
    const fullHash = new Uint8Array([0x1e, ...hash]);
    const key = Buffer.from(hash).toString('hex');
    this.blobs.set(key, data);
    return { hash: fullHash, size: blob.size };
  }

  async downloadBlobAsBytes(hash: Uint8Array): Promise<Uint8Array> {
    const actualHash = hash[0] === 0x1e ? hash.slice(1) : hash;
    const key = Buffer.from(actualHash).toString('hex');
    const data = this.blobs.get(key);
    if (!data) throw new Error(`Blob not found: ${key}`);
    return data;
  }

  async registryGet(publicKey: Uint8Array): Promise<any> {
    const key = Buffer.from(publicKey).toString('hex');
    return this.registry.get(key);
  }

  async registrySet(entry: any): Promise<void> {
    const key = Buffer.from(entry.pk).toString('hex');
    this.registry.set(key, entry);
  }
}

// Simple mock identity
class SimpleMockIdentity {
  fsRootKey = new Uint8Array(32).fill(42);
}

describe('FS5 Media Extensions', () => {
  let fs: FS5;
  let api: SimpleMockAPI;
  let identity: SimpleMockIdentity;
  let directories: Map<string, DirV1>;

  // Helper to create test image blob
  const createTestImageBlob = (): Blob => {
    const jpegData = new Uint8Array([
      0xFF, 0xD8, 0xFF, 0xE0, // JPEG SOI and APP0
      0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00,
      0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
      0xFF, 0xD9 // EOI
    ]);
    return new Blob([jpegData], { type: 'image/jpeg' });
  };

  beforeEach(() => {
    api = new SimpleMockAPI();
    identity = new SimpleMockIdentity();
    fs = new FS5(api as any, identity as any);

    // Initialize directory structure
    directories = new Map();
    directories.set("", {
      magic: "S5.pro",
      header: {},
      dirs: new Map(),
      files: new Map()
    });

    // Mock _loadDirectory to return from our directory map
    (fs as any)._loadDirectory = async (path: string) => {
      const dir = directories.get(path || "");
      if (!dir) {
        // Create directory if it doesn't exist
        const newDir: DirV1 = {
          magic: "S5.pro",
          header: {},
          dirs: new Map(),
          files: new Map()
        };
        directories.set(path, newDir);
        return newDir;
      }
      return dir;
    };

    // Mock _updateDirectory to update our directory map
    (fs as any)._updateDirectory = async (path: string, updater: any) => {
      const segments = path.split('/').filter(s => s);

      // Ensure all parent directories exist
      for (let i = 0; i < segments.length; i++) {
        const currentPath = segments.slice(0, i + 1).join('/');
        const parentPath = segments.slice(0, i).join('/') || '';
        const dirName = segments[i];

        if (!directories.has(currentPath)) {
          const newDir: DirV1 = {
            magic: "S5.pro",
            header: {},
            dirs: new Map(),
            files: new Map()
          };
          directories.set(currentPath, newDir);

          const parent = directories.get(parentPath);
          if (parent) {
            parent.dirs.set(dirName, {
              link: { type: 'fixed_hash_blake3', hash: new Uint8Array(32) }
            });
          }
        }
      }

      const dir = directories.get(path || "") || {
        magic: "S5.pro",
        header: {},
        dirs: new Map(),
        files: new Map()
      };

      const result = await updater(dir, new Uint8Array(32));
      if (result) {
        directories.set(path || "", result);
      }
    };
  });

  describe('putImage', () => {
    it('should upload an image and return reference', async () => {
      const blob = createTestImageBlob();
      const result = await fs.putImage('gallery/photo.jpg', blob);

      expect(result).toBeDefined();
      expect(result.path).toBe('gallery/photo.jpg');
    });

    it('should generate thumbnail by default', async () => {
      const blob = createTestImageBlob();
      const result = await fs.putImage('gallery/photo.jpg', blob);

      expect(result.thumbnailPath).toBeDefined();
      expect(result.thumbnailPath).toBe('gallery/.thumbnails/photo.jpg');
    });

    it('should extract metadata by default', async () => {
      const blob = createTestImageBlob();
      const result = await fs.putImage('gallery/photo.jpg', blob);

      expect(result.metadata).toBeDefined();
      expect(result.metadata?.width).toBeGreaterThan(0);
      expect(result.metadata?.height).toBeGreaterThan(0);
      expect(result.metadata?.format).toBe('jpeg');
    });

    it('should skip thumbnail generation when disabled', async () => {
      const blob = createTestImageBlob();
      const options: PutImageOptions = {
        generateThumbnail: false
      };
      const result = await fs.putImage('gallery/photo.jpg', blob, options);

      expect(result.thumbnailPath).toBeUndefined();
    });

    it('should skip metadata extraction when disabled', async () => {
      const blob = createTestImageBlob();
      const options: PutImageOptions = {
        extractMetadata: false
      };
      const result = await fs.putImage('gallery/photo.jpg', blob, options);

      expect(result.metadata).toBeUndefined();
    });

    it('should support custom thumbnail options', async () => {
      const blob = createTestImageBlob();
      const options: PutImageOptions = {
        thumbnailOptions: {
          maxWidth: 128,
          maxHeight: 128,
          quality: 75
        }
      };
      const result = await fs.putImage('gallery/photo.jpg', blob, options);

      expect(result.thumbnailPath).toBeDefined();
    });

    it('should handle nested paths', async () => {
      const blob = createTestImageBlob();
      const result = await fs.putImage('photos/2024/vacation/beach.jpg', blob);

      expect(result.path).toBe('photos/2024/vacation/beach.jpg');
      expect(result.thumbnailPath).toBe('photos/2024/vacation/.thumbnails/beach.jpg');
    });

    it('should handle unicode filenames', async () => {
      const blob = createTestImageBlob();
      const result = await fs.putImage('gallery/照片.jpg', blob);

      expect(result.path).toBe('gallery/照片.jpg');
    });
  });

  describe('getThumbnail', () => {
    it('should return pre-generated thumbnail', async () => {
      const blob = createTestImageBlob();
      await fs.putImage('gallery/photo.jpg', blob);

      const thumbnail = await fs.getThumbnail('gallery/photo.jpg');

      expect(thumbnail).toBeInstanceOf(Blob);
      expect(thumbnail.type).toContain('image');
    });

    it('should generate thumbnail on-demand if missing', async () => {
      const blob = createTestImageBlob();
      await fs.putImage('gallery/photo.jpg', blob, {
        generateThumbnail: false
      });

      const thumbnail = await fs.getThumbnail('gallery/photo.jpg');

      expect(thumbnail).toBeInstanceOf(Blob);
    });

    it('should cache generated thumbnail by default', async () => {
      const blob = createTestImageBlob();
      await fs.putImage('gallery/photo.jpg', blob, {
        generateThumbnail: false
      });

      const thumbnail1 = await fs.getThumbnail('gallery/photo.jpg');
      const thumbnail2 = await fs.getThumbnail('gallery/photo.jpg');

      expect(thumbnail1).toBeInstanceOf(Blob);
      expect(thumbnail2).toBeInstanceOf(Blob);
    });

    it('should support custom thumbnail options', async () => {
      const blob = createTestImageBlob();
      await fs.putImage('gallery/photo.jpg', blob, {
        generateThumbnail: false
      });

      const options: GetThumbnailOptions = {
        thumbnailOptions: {
          maxWidth: 64,
          maxHeight: 64
        }
      };
      const thumbnail = await fs.getThumbnail('gallery/photo.jpg', options);

      expect(thumbnail).toBeInstanceOf(Blob);
    });

    it('should throw error for non-existent image', async () => {
      await expect(
        fs.getThumbnail('nonexistent/photo.jpg')
      ).rejects.toThrow();
    });

    it('should throw error for non-image file', async () => {
      await fs.put('documents/text.txt', new TextEncoder().encode('hello'));

      await expect(
        fs.getThumbnail('documents/text.txt')
      ).rejects.toThrow();
    });
  });

  describe('getImageMetadata', () => {
    it('should return stored metadata', async () => {
      const blob = createTestImageBlob();
      await fs.putImage('gallery/photo.jpg', blob);

      const metadata = await fs.getImageMetadata('gallery/photo.jpg');

      expect(metadata).toBeDefined();
      expect(metadata.width).toBeGreaterThan(0);
      expect(metadata.height).toBeGreaterThan(0);
      expect(metadata.format).toBe('jpeg');
    });

    it('should extract fresh metadata if not stored', async () => {
      const blob = createTestImageBlob();
      await fs.putImage('gallery/photo.jpg', blob, {
        extractMetadata: false
      });

      const metadata = await fs.getImageMetadata('gallery/photo.jpg');

      expect(metadata).toBeDefined();
      expect(metadata.width).toBeGreaterThan(0);
    });

    it('should throw error for non-existent image', async () => {
      await expect(
        fs.getImageMetadata('nonexistent/photo.jpg')
      ).rejects.toThrow();
    });

    it('should throw error for non-image file', async () => {
      await fs.put('documents/text.txt', new TextEncoder().encode('hello'));

      await expect(
        fs.getImageMetadata('documents/text.txt')
      ).rejects.toThrow();
    });
  });

  describe('createImageGallery', () => {
    it('should upload multiple images', async () => {
      const images = [
        { name: 'photo1.jpg', blob: createTestImageBlob() },
        { name: 'photo2.jpg', blob: createTestImageBlob() },
        { name: 'photo3.jpg', blob: createTestImageBlob() }
      ];

      const results = await fs.createImageGallery('gallery', images);

      expect(results).toHaveLength(3);
      expect(results.every(r => r.path)).toBe(true);
    });

    it('should generate thumbnails for all images', async () => {
      const images = [
        { name: 'photo1.jpg', blob: createTestImageBlob() },
        { name: 'photo2.jpg', blob: createTestImageBlob() }
      ];

      const results = await fs.createImageGallery('gallery', images);

      expect(results.every(r => r.thumbnailPath !== undefined)).toBe(true);
    });

    it('should create manifest.json by default', async () => {
      const images = [
        { name: 'photo1.jpg', blob: createTestImageBlob() },
        { name: 'photo2.jpg', blob: createTestImageBlob() }
      ];

      await fs.createImageGallery('gallery', images);

      const manifestData = await fs.get('gallery/manifest.json');
      expect(manifestData).toBeDefined();

      // FS5.get() auto-decodes JSON files to objects
      const manifest = typeof manifestData === 'object' && manifestData !== null
        ? manifestData
        : (typeof manifestData === 'string'
          ? JSON.parse(manifestData)
          : JSON.parse(new TextDecoder().decode(manifestData as Uint8Array)));

      expect(manifest.count).toBe(2);
      expect(manifest.images).toHaveLength(2);
    });

    it('should skip manifest creation when disabled', async () => {
      const images = [
        { name: 'photo1.jpg', blob: createTestImageBlob() }
      ];

      const options: CreateImageGalleryOptions = {
        createManifest: false
      };
      await fs.createImageGallery('gallery', images, options);

      const manifestData = await fs.get('gallery/manifest.json');
      expect(manifestData).toBeUndefined();
    });

    it('should call progress callback', async () => {
      const images = [
        { name: 'photo1.jpg', blob: createTestImageBlob() },
        { name: 'photo2.jpg', blob: createTestImageBlob() },
        { name: 'photo3.jpg', blob: createTestImageBlob() }
      ];

      const progressCalls: [number, number][] = [];
      const options: CreateImageGalleryOptions = {
        onProgress: (completed, total) => {
          progressCalls.push([completed, total]);
        }
      };

      await fs.createImageGallery('gallery', images, options);

      expect(progressCalls.length).toBeGreaterThan(0);
      expect(progressCalls[progressCalls.length - 1]).toEqual([3, 3]);
    });

    it('should respect concurrency limit', async () => {
      const images = Array.from({ length: 10 }, (_, i) => ({
        name: `photo${i}.jpg`,
        blob: createTestImageBlob()
      }));

      const options: CreateImageGalleryOptions = {
        concurrency: 2
      };

      const results = await fs.createImageGallery('gallery', images, options);

      expect(results).toHaveLength(10);
    });

    it('should handle empty image list', async () => {
      const results = await fs.createImageGallery('gallery', []);

      expect(results).toHaveLength(0);
    });

    it('should handle metadata in image uploads', async () => {
      const images = [
        {
          name: 'photo1.jpg',
          blob: createTestImageBlob(),
          metadata: { format: 'jpeg' as const }
        }
      ];

      const results = await fs.createImageGallery('gallery', images);

      expect(results[0].metadata).toBeDefined();
    });
  });

  describe('Integration', () => {
    it('should work with regular FS5 operations', async () => {
      // Upload image
      const blob = createTestImageBlob();
      await fs.putImage('photos/sunset.jpg', blob);

      // List directory
      const entries = [];
      for await (const entry of fs.list('photos')) {
        entries.push(entry);
      }

      expect(entries.some(e => e.name === 'sunset.jpg')).toBe(true);
    });

    it('should support delete operations', async () => {
      const blob = createTestImageBlob();
      await fs.putImage('temp/photo.jpg', blob);

      await fs.delete('temp/photo.jpg');

      const result = await fs.get('temp/photo.jpg');
      expect(result).toBeUndefined();
    });

    it('should handle thumbnails directory structure', async () => {
      const blob = createTestImageBlob();
      await fs.putImage('gallery/photo.jpg', blob);

      const entries = [];
      for await (const entry of fs.list('gallery/.thumbnails')) {
        entries.push(entry);
      }

      expect(entries.some(e => e.name === 'photo.jpg')).toBe(true);
    });
  });
});

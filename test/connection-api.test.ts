import { describe, test, expect, beforeEach, vi } from "vitest";
import { P2P } from "../src/node/p2p.js";
import { JSCryptoImplementation } from "../src/api/crypto/js.js";

/**
 * Mock WebSocket class that simulates WebSocket behavior for testing.
 * Allows triggering onopen, onclose, onerror events programmatically.
 */
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  binaryType: string = 'arraybuffer';
  readyState: number = MockWebSocket.CONNECTING;

  onopen: ((event: any) => void) | null = null;
  onclose: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onmessage: ((event: any) => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  send(data: any): void {
    // Mock send - does nothing in tests
  }

  close(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSING;
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED;
      if (this.onclose) {
        this.onclose({ code: code || 1000, reason: reason || '' });
      }
    }, 0);
  }

  // Test helpers to simulate events
  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) {
      this.onopen({});
    }
  }

  simulateClose(code: number = 1000, reason: string = ''): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({ code, reason });
    }
  }

  simulateError(): void {
    if (this.onerror) {
      this.onerror(new Error('WebSocket error'));
    }
  }

  simulateMessage(data: ArrayBuffer): void {
    if (this.onmessage) {
      this.onmessage({ data });
    }
  }
}

// Store created mock WebSockets for test access
let createdWebSockets: MockWebSocket[] = [];

/**
 * Creates a P2P instance with mock WebSocket for testing.
 * Replaces global WebSocket with MockWebSocket.
 */
async function createTestP2P(): Promise<P2P> {
  createdWebSockets = [];

  // Mock global WebSocket
  (globalThis as any).WebSocket = class extends MockWebSocket {
    constructor(url: string) {
      super(url);
      createdWebSockets.push(this);
    }
  };

  const crypto = new JSCryptoImplementation();
  const p2p = await P2P.create(crypto);
  return p2p;
}

/**
 * Gets the last created MockWebSocket for a given URI.
 */
function getLastMockWebSocket(): MockWebSocket | undefined {
  return createdWebSockets[createdWebSockets.length - 1];
}

describe("Connection API", () => {
  describe("Sub-phase 1.1: Test Infrastructure", () => {
    test("initial status is 'disconnected' before any connections", async () => {
      const p2p = await createTestP2P();

      // P2P has no peers yet, should report disconnected
      expect(p2p.peers.size).toBe(0);
      expect(p2p.isConnectedToNetwork).toBe(false);
      // TODO: Once getConnectionStatus() is implemented, test it here
      // expect(p2p.getConnectionStatus()).toBe('disconnected');
    });
  });
});

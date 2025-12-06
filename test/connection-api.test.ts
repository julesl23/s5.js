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
      expect(p2p.getConnectionStatus()).toBe('disconnected');
    });
  });

  describe("Sub-phase 1.2: getConnectionStatus()", () => {
    test("status is 'connecting' after connectToNode() called", async () => {
      const p2p = await createTestP2P();

      // Connect to a node - socket is created but not yet open
      p2p.connectToNode('wss://test-node.example.com/s5/p2p');

      // Should have one peer in connecting state
      expect(p2p.peers.size).toBe(1);
      const ws = getLastMockWebSocket()!;
      expect(ws.readyState).toBe(MockWebSocket.CONNECTING);
      expect(p2p.getConnectionStatus()).toBe('connecting');
    });

    test("status is 'connecting' after socket opens but before handshake", async () => {
      const p2p = await createTestP2P();

      p2p.connectToNode('wss://test-node.example.com/s5/p2p');
      const ws = getLastMockWebSocket()!;

      // Socket opens - handshake begins but not complete
      ws.simulateOpen();

      // Peer exists but isConnected is still false (handshake not done)
      const peer = p2p.peers.get('wss://test-node.example.com/s5/p2p')!;
      expect(peer.isConnected).toBe(false);
      expect(ws.readyState).toBe(MockWebSocket.OPEN);
      expect(p2p.getConnectionStatus()).toBe('connecting');
    });

    test("status is 'connected' after handshake completes", async () => {
      const p2p = await createTestP2P();

      p2p.connectToNode('wss://test-node.example.com/s5/p2p');
      const ws = getLastMockWebSocket()!;
      ws.simulateOpen();

      // Simulate successful handshake by directly setting isConnected
      // (In real code, this happens after protocolMethodHandshakeDone message)
      const peer = p2p.peers.get('wss://test-node.example.com/s5/p2p')!;
      (peer as any).isConnected = true;

      expect(p2p.isConnectedToNetwork).toBe(true);
      expect(p2p.getConnectionStatus()).toBe('connected');
    });

    test("status is 'disconnected' after socket closes", async () => {
      const p2p = await createTestP2P();

      p2p.connectToNode('wss://test-node.example.com/s5/p2p');
      const ws = getLastMockWebSocket()!;
      ws.simulateOpen();

      // Complete handshake
      const peer = p2p.peers.get('wss://test-node.example.com/s5/p2p')!;
      (peer as any).isConnected = true;
      expect(p2p.isConnectedToNetwork).toBe(true);

      // Socket closes
      ws.simulateClose();

      // onclose handler sets isConnected = false
      expect(peer.isConnected).toBe(false);
      expect(p2p.getConnectionStatus()).toBe('disconnected');
    });

    test("status is 'connected' if ANY peer is connected (multi-peer)", async () => {
      const p2p = await createTestP2P();

      // Connect to two nodes
      p2p.connectToNode('wss://node1.example.com/s5/p2p');
      p2p.connectToNode('wss://node2.example.com/s5/p2p');

      expect(p2p.peers.size).toBe(2);

      // Open both sockets
      const ws1 = createdWebSockets[0];
      const ws2 = createdWebSockets[1];
      ws1.simulateOpen();
      ws2.simulateOpen();

      // Only complete handshake on first peer
      const peer1 = p2p.peers.get('wss://node1.example.com/s5/p2p')!;
      (peer1 as any).isConnected = true;

      // Second peer still connecting (handshake not complete)
      const peer2 = p2p.peers.get('wss://node2.example.com/s5/p2p')!;
      expect(peer2.isConnected).toBe(false);

      // Overall status should be 'connected' because at least one peer is connected
      expect(p2p.isConnectedToNetwork).toBe(true);
      expect(p2p.getConnectionStatus()).toBe('connected');
    });

    test("status is 'connecting' if one peer connecting, none connected", async () => {
      const p2p = await createTestP2P();

      // Connect to two nodes
      p2p.connectToNode('wss://node1.example.com/s5/p2p');
      p2p.connectToNode('wss://node2.example.com/s5/p2p');

      // Open both sockets but don't complete handshake on either
      const ws1 = createdWebSockets[0];
      const ws2 = createdWebSockets[1];
      ws1.simulateOpen();
      ws2.simulateOpen();

      // Neither peer has completed handshake
      const peer1 = p2p.peers.get('wss://node1.example.com/s5/p2p')!;
      const peer2 = p2p.peers.get('wss://node2.example.com/s5/p2p')!;
      expect(peer1.isConnected).toBe(false);
      expect(peer2.isConnected).toBe(false);

      // isConnectedToNetwork is false, but we have open sockets
      expect(p2p.isConnectedToNetwork).toBe(false);
      expect(p2p.getConnectionStatus()).toBe('connecting');
    });
  });

  describe("Sub-phase 1.3: onConnectionChange()", () => {
    test("callback is called immediately with current status on subscribe", async () => {
      const p2p = await createTestP2P();
      const callback = vi.fn();

      // Subscribe when disconnected
      const unsubscribe = p2p.onConnectionChange(callback);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith('disconnected');
    });

    test("callback is called when status changes to 'connected'", async () => {
      const p2p = await createTestP2P();
      const callback = vi.fn();

      const unsubscribe = p2p.onConnectionChange(callback);
      callback.mockClear(); // Clear the immediate call

      p2p.connectToNode('wss://test-node.example.com/s5/p2p');
      const ws = getLastMockWebSocket()!;
      ws.simulateOpen();

      // Complete handshake - should trigger callback via notifyConnectionChange
      const peer = p2p.peers.get('wss://test-node.example.com/s5/p2p')!;
      (peer as any).isConnected = true;
      p2p.notifyConnectionChange();

      expect(callback).toHaveBeenCalledWith('connected');
    });

    test("callback is called when status changes to 'disconnected'", async () => {
      const p2p = await createTestP2P();
      const callback = vi.fn();

      // Connect and complete handshake
      p2p.connectToNode('wss://test-node.example.com/s5/p2p');
      const ws = getLastMockWebSocket()!;
      ws.simulateOpen();
      const peer = p2p.peers.get('wss://test-node.example.com/s5/p2p')!;
      (peer as any).isConnected = true;

      const unsubscribe = p2p.onConnectionChange(callback);
      callback.mockClear(); // Clear the immediate call ('connected')

      // Socket closes - should trigger callback with 'disconnected' via onclose handler
      ws.simulateClose();

      expect(callback).toHaveBeenCalledWith('disconnected');
    });

    test("unsubscribe function stops callbacks", async () => {
      const p2p = await createTestP2P();
      const callback = vi.fn();

      const unsubscribe = p2p.onConnectionChange(callback);
      expect(callback).toHaveBeenCalledTimes(1); // Immediate call

      unsubscribe();
      callback.mockClear();

      // Connect and complete handshake
      p2p.connectToNode('wss://test-node.example.com/s5/p2p');
      const ws = getLastMockWebSocket()!;
      ws.simulateOpen();
      const peer = p2p.peers.get('wss://test-node.example.com/s5/p2p')!;
      (peer as any).isConnected = true;
      p2p.notifyConnectionChange();

      // Callback should NOT have been called after unsubscribe
      expect(callback).not.toHaveBeenCalled();
    });

    test("multiple listeners all receive notifications", async () => {
      const p2p = await createTestP2P();
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      p2p.onConnectionChange(callback1);
      p2p.onConnectionChange(callback2);
      p2p.onConnectionChange(callback3);

      // All should receive immediate call
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
      expect(callback3).toHaveBeenCalledTimes(1);

      callback1.mockClear();
      callback2.mockClear();
      callback3.mockClear();

      // Connect and trigger status change
      p2p.connectToNode('wss://test-node.example.com/s5/p2p');
      const ws = getLastMockWebSocket()!;
      ws.simulateOpen();
      const peer = p2p.peers.get('wss://test-node.example.com/s5/p2p')!;
      (peer as any).isConnected = true;
      p2p.notifyConnectionChange();

      // All should receive the notification
      expect(callback1).toHaveBeenCalledWith('connected');
      expect(callback2).toHaveBeenCalledWith('connected');
      expect(callback3).toHaveBeenCalledWith('connected');
    });

    test("listener errors don't break other listeners", async () => {
      const p2p = await createTestP2P();
      const errorCallback = vi.fn(() => {
        throw new Error('Listener error');
      });
      const goodCallback = vi.fn();

      p2p.onConnectionChange(errorCallback);
      p2p.onConnectionChange(goodCallback);

      // Both should receive immediate call (error callback throws but is caught)
      expect(errorCallback).toHaveBeenCalledTimes(1);
      expect(goodCallback).toHaveBeenCalledTimes(1);

      errorCallback.mockClear();
      goodCallback.mockClear();

      // Trigger status change
      p2p.connectToNode('wss://test-node.example.com/s5/p2p');
      const ws = getLastMockWebSocket()!;
      ws.simulateOpen();
      const peer = p2p.peers.get('wss://test-node.example.com/s5/p2p')!;
      (peer as any).isConnected = true;
      p2p.notifyConnectionChange();

      // Error callback throws, but good callback should still be called
      expect(errorCallback).toHaveBeenCalled();
      expect(goodCallback).toHaveBeenCalledWith('connected');
    });
  });

  describe("Sub-phase 1.4: reconnect()", () => {
    test("reconnect() closes all existing sockets", async () => {
      const p2p = await createTestP2P();

      // Connect to multiple nodes
      p2p.connectToNode('wss://node1.example.com/s5/p2p');
      p2p.connectToNode('wss://node2.example.com/s5/p2p');

      const ws1 = createdWebSockets[0];
      const ws2 = createdWebSockets[1];

      // Open and complete handshake
      ws1.simulateOpen();
      ws2.simulateOpen();
      const peer1 = p2p.peers.get('wss://node1.example.com/s5/p2p')!;
      const peer2 = p2p.peers.get('wss://node2.example.com/s5/p2p')!;
      (peer1 as any).isConnected = true;
      (peer2 as any).isConnected = true;

      expect(p2p.isConnectedToNetwork).toBe(true);

      // Spy on socket close methods
      const close1Spy = vi.spyOn(ws1, 'close');
      const close2Spy = vi.spyOn(ws2, 'close');

      // Start reconnect - need to simulate new connection completing
      const reconnectPromise = p2p.reconnect();

      // Simulate new connections completing
      await new Promise(r => setTimeout(r, 10));
      const newWs1 = createdWebSockets[2];
      const newWs2 = createdWebSockets[3];
      newWs1.simulateOpen();
      newWs2.simulateOpen();
      const newPeer1 = p2p.peers.get('wss://node1.example.com/s5/p2p')!;
      const newPeer2 = p2p.peers.get('wss://node2.example.com/s5/p2p')!;
      (newPeer1 as any).isConnected = true;
      (newPeer2 as any).isConnected = true;

      await reconnectPromise;

      expect(close1Spy).toHaveBeenCalled();
      expect(close2Spy).toHaveBeenCalled();
    });

    test("reconnect() reconnects to all initial peer URIs", async () => {
      const p2p = await createTestP2P();

      // Connect to initial peers
      p2p.connectToNode('wss://node1.example.com/s5/p2p');
      p2p.connectToNode('wss://node2.example.com/s5/p2p');

      expect(createdWebSockets.length).toBe(2);

      // Open and complete handshake
      createdWebSockets[0].simulateOpen();
      createdWebSockets[1].simulateOpen();
      const peer1 = p2p.peers.get('wss://node1.example.com/s5/p2p')!;
      const peer2 = p2p.peers.get('wss://node2.example.com/s5/p2p')!;
      (peer1 as any).isConnected = true;
      (peer2 as any).isConnected = true;

      const initialCount = createdWebSockets.length;
      const reconnectPromise = p2p.reconnect();

      // Simulate new connections completing
      await new Promise(r => setTimeout(r, 10));

      // Should have created 2 new WebSockets (one for each initial peer)
      expect(createdWebSockets.length).toBe(initialCount + 2);

      // New sockets should be for the same URIs
      const newWs1 = createdWebSockets[initialCount];
      const newWs2 = createdWebSockets[initialCount + 1];
      expect(newWs1.url).toBe('wss://node1.example.com/s5/p2p');
      expect(newWs2.url).toBe('wss://node2.example.com/s5/p2p');

      // Complete the handshake so reconnect resolves
      newWs1.simulateOpen();
      newWs2.simulateOpen();
      const newPeer1 = p2p.peers.get('wss://node1.example.com/s5/p2p')!;
      (newPeer1 as any).isConnected = true;

      await reconnectPromise;
    });

    test("reconnect() resolves when connection established", async () => {
      const p2p = await createTestP2P();

      // Connect to a node
      p2p.connectToNode('wss://test-node.example.com/s5/p2p');
      const ws = createdWebSockets[0];
      ws.simulateOpen();
      const peer = p2p.peers.get('wss://test-node.example.com/s5/p2p')!;
      (peer as any).isConnected = true;

      const reconnectPromise = p2p.reconnect();

      // Simulate new connection completing
      await new Promise(r => setTimeout(r, 10));
      const newWs = createdWebSockets[createdWebSockets.length - 1];
      newWs.simulateOpen();
      const newPeer = p2p.peers.get('wss://test-node.example.com/s5/p2p')!;
      (newPeer as any).isConnected = true;

      // reconnect should resolve
      await expect(reconnectPromise).resolves.toBeUndefined();
    });

    test("reconnect() throws after 10s timeout", async () => {
      vi.useFakeTimers();

      try {
        const p2p = await createTestP2P();

        // Connect to a node
        p2p.connectToNode('wss://test-node.example.com/s5/p2p');
        const ws = createdWebSockets[0];
        ws.simulateOpen();
        const peer = p2p.peers.get('wss://test-node.example.com/s5/p2p')!;
        (peer as any).isConnected = true;

        const reconnectPromise = p2p.reconnect();

        // Don't complete the new connection - let it timeout
        // Advance time by 10 seconds
        await vi.advanceTimersByTimeAsync(10100);

        // Should throw timeout error
        await expect(reconnectPromise).rejects.toThrow('Reconnection timeout');
      } finally {
        vi.useRealTimers();
      }
    });

    test("concurrent reconnect() calls wait for first to complete", async () => {
      const p2p = await createTestP2P();

      // Connect to a node
      p2p.connectToNode('wss://test-node.example.com/s5/p2p');
      const ws = createdWebSockets[0];
      ws.simulateOpen();
      const peer = p2p.peers.get('wss://test-node.example.com/s5/p2p')!;
      (peer as any).isConnected = true;

      // Start two reconnects simultaneously
      const reconnect1 = p2p.reconnect();
      const reconnect2 = p2p.reconnect();

      // Simulate connection completing
      await new Promise(r => setTimeout(r, 10));
      const newWs = createdWebSockets[createdWebSockets.length - 1];
      newWs.simulateOpen();
      const newPeer = p2p.peers.get('wss://test-node.example.com/s5/p2p')!;
      (newPeer as any).isConnected = true;

      // Both should resolve (second one waited for first)
      await expect(reconnect1).resolves.toBeUndefined();
      await expect(reconnect2).resolves.toBeUndefined();

      // Should only have created new sockets once (not twice)
      // Initial socket + 1 reconnect = 2 total
      expect(createdWebSockets.length).toBe(2);
    });

    test("status changes to 'connecting' during reconnect", async () => {
      const p2p = await createTestP2P();
      const callback = vi.fn();

      // Connect to a node
      p2p.connectToNode('wss://test-node.example.com/s5/p2p');
      const ws = createdWebSockets[0];
      ws.simulateOpen();
      const peer = p2p.peers.get('wss://test-node.example.com/s5/p2p')!;
      (peer as any).isConnected = true;

      p2p.onConnectionChange(callback);
      callback.mockClear(); // Clear immediate call

      // Start reconnect (don't await)
      const reconnectPromise = p2p.reconnect();

      // Status should transition to 'connecting' (called by reconnect after clearing peers)
      expect(callback).toHaveBeenCalledWith('connecting');

      // Complete the connection
      await new Promise(r => setTimeout(r, 10));
      const newWs = createdWebSockets[createdWebSockets.length - 1];
      newWs.simulateOpen();
      const newPeer = p2p.peers.get('wss://test-node.example.com/s5/p2p')!;
      (newPeer as any).isConnected = true;

      await reconnectPromise;
    });
  });
});

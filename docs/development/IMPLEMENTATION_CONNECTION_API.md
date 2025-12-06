# Connection API Implementation Plan

## Overview

Add 3 methods to the S5 class for mobile WebSocket connection management:
- `getConnectionStatus()` - Returns 'connected' | 'connecting' | 'disconnected'
- `onConnectionChange(callback)` - Subscribe to status changes, returns unsubscribe function
- `reconnect()` - Force close and re-establish all connections

## Root Cause

The `WebSocketPeer` class in `src/node/p2p.ts:84-101` has `onmessage` and `onopen` handlers but **no `onclose` or `onerror` handlers**. When WebSockets die silently on mobile (background tabs, network switching, device sleep), there's no detection or notification.

## API Behavior Decisions

1. **Immediate callback**: `onConnectionChange(callback)` calls callback immediately with current status on subscribe
2. **Timeout with error**: `reconnect()` throws error if no peer connects within 10 seconds
3. **Reconnect lock**: Concurrent `reconnect()` calls wait for existing attempt to complete

---

## Phase 1: Write Connection API Tests

### Sub-phase 1.1: Create Test Infrastructure

**Goal**: Set up test file and mock WebSocket infrastructure for testing connection state.

**Time Estimate**: 30 minutes

**Line Budget**: 80 lines

#### Tasks
- [x] Create test file `test/connection-api.test.ts`
- [x] Create mock WebSocket class that can simulate open/close/error events
- [x] Create helper to instantiate P2P with mock WebSocket
- [x] Write test: initial status is 'disconnected' before any connections

**Test Files:**
- `test/connection-api.test.ts` (NEW, ~80 lines initial setup)

**Success Criteria:**
- [x] Mock WebSocket can trigger onopen, onclose, onerror events
- [x] P2P can be instantiated with mock WebSocket factory
- [x] First test passes: initial status is 'disconnected'

**Test Results:** ✅ **1 passed** (15ms execution time)

---

### Sub-phase 1.2: Write Tests for getConnectionStatus()

**Goal**: Test all connection status states and transitions.

**Time Estimate**: 30 minutes

**Line Budget**: 60 lines

#### Tasks
- [ ] Write test: status is 'connecting' after connectToNode() called
- [ ] Write test: status is 'connected' after handshake completes
- [ ] Write test: status is 'disconnected' after socket closes
- [ ] Write test: status is 'connected' if ANY peer is connected (multi-peer)
- [ ] Write test: status is 'connecting' if one peer connecting, none connected

**Test Files:**
- `test/connection-api.test.ts` (ADD ~60 lines)

**Success Criteria:**
- [ ] 5 tests written for getConnectionStatus()
- [ ] Tests cover all 3 states: connected, connecting, disconnected
- [ ] Tests verify multi-peer aggregate logic

---

### Sub-phase 1.3: Write Tests for onConnectionChange()

**Goal**: Test subscription/notification behavior.

**Time Estimate**: 30 minutes

**Line Budget**: 80 lines

#### Tasks
- [ ] Write test: callback is called immediately with current status on subscribe
- [ ] Write test: callback is called when status changes to 'connected'
- [ ] Write test: callback is called when status changes to 'disconnected'
- [ ] Write test: unsubscribe function stops callbacks
- [ ] Write test: multiple listeners all receive notifications
- [ ] Write test: listener errors don't break other listeners

**Test Files:**
- `test/connection-api.test.ts` (ADD ~80 lines)

**Success Criteria:**
- [ ] 6 tests written for onConnectionChange()
- [ ] Immediate callback on subscribe is tested
- [ ] Unsubscribe functionality is tested

---

### Sub-phase 1.4: Write Tests for reconnect()

**Goal**: Test reconnection behavior including timeout and lock.

**Time Estimate**: 45 minutes

**Line Budget**: 100 lines

#### Tasks
- [ ] Write test: reconnect() closes all existing sockets
- [ ] Write test: reconnect() reconnects to all initial peer URIs
- [ ] Write test: reconnect() resolves when connection established
- [ ] Write test: reconnect() throws after 10s timeout (use fake timers)
- [ ] Write test: concurrent reconnect() calls wait for first to complete
- [ ] Write test: status changes to 'connecting' during reconnect

**Test Files:**
- `test/connection-api.test.ts` (ADD ~100 lines)

**Success Criteria:**
- [ ] 6 tests written for reconnect()
- [ ] Timeout behavior tested with fake timers
- [ ] Race condition protection tested

---

## Phase 2: Implement WebSocketPeer Lifecycle Handlers

### Sub-phase 2.1: Add onclose and onerror Handlers

**Goal**: Add missing WebSocket lifecycle event handlers to detect disconnections.

**Time Estimate**: 20 minutes

**Line Budget**: 30 lines

#### Tasks
- [ ] Add `uri` parameter to WebSocketPeer constructor
- [ ] Add `socket.onclose` handler that sets `isConnected = false`
- [ ] Add `socket.onerror` handler that sets `isConnected = false`
- [ ] Call `p2p.notifyConnectionChange()` from both handlers
- [ ] Update `connectToNode()` to pass URI to WebSocketPeer constructor

**Implementation Files:**
- `src/node/p2p.ts` (MODIFY WebSocketPeer class, ~30 lines)

**Success Criteria:**
- [ ] WebSocketPeer has onclose handler
- [ ] WebSocketPeer has onerror handler
- [ ] Both handlers set isConnected = false
- [ ] Both handlers notify P2P of state change

---

### Sub-phase 2.2: Notify on Successful Handshake

**Goal**: Trigger status notification when connection is fully established.

**Time Estimate**: 10 minutes

**Line Budget**: 5 lines

#### Tasks
- [ ] Add `this.p2p.notifyConnectionChange()` after `this.isConnected = true` in handshake completion

**Implementation Files:**
- `src/node/p2p.ts` (MODIFY onmessage method, ~2 lines)

**Success Criteria:**
- [ ] Status notification fires when handshake completes
- [ ] Status changes from 'connecting' to 'connected'

---

## Phase 3: Implement P2P Connection State Management

### Sub-phase 3.1: Add Connection State Properties

**Goal**: Add properties to track connection listeners and initial peer URIs.

**Time Estimate**: 15 minutes

**Line Budget**: 20 lines

#### Tasks
- [ ] Add `ConnectionStatus` type: `'connected' | 'connecting' | 'disconnected'`
- [ ] Add `connectionListeners: Set<(status: ConnectionStatus) => void>` property
- [ ] Add `initialPeerUris: string[]` property
- [ ] Add `reconnectLock: boolean` property
- [ ] Modify `connectToNode()` to store URI in `initialPeerUris`

**Implementation Files:**
- `src/node/p2p.ts` (MODIFY P2P class, ~20 lines)

**Success Criteria:**
- [ ] ConnectionStatus type defined
- [ ] Properties added to P2P class
- [ ] initialPeerUris populated when connecting

---

### Sub-phase 3.2: Implement getConnectionStatus()

**Goal**: Calculate aggregate connection status from all peers.

**Time Estimate**: 20 minutes

**Line Budget**: 25 lines

#### Tasks
- [ ] Implement `getConnectionStatus(): ConnectionStatus` method
- [ ] Return 'connected' if any peer has `isConnected === true`
- [ ] Return 'connecting' if any peer socket is OPEN/CONNECTING but not handshaked
- [ ] Return 'disconnected' if no peers or all closed
- [ ] Handle edge case: check `socket.readyState` for accurate state

**Implementation Files:**
- `src/node/p2p.ts` (ADD method, ~25 lines)

**Success Criteria:**
- [ ] Method returns correct status for all states
- [ ] Multi-peer logic correctly aggregates status
- [ ] Tests from Sub-phase 1.2 pass

---

### Sub-phase 3.3: Implement onConnectionChange() and notifyConnectionChange()

**Goal**: Add subscription mechanism and notification logic.

**Time Estimate**: 25 minutes

**Line Budget**: 35 lines

#### Tasks
- [ ] Implement `onConnectionChange(callback): () => void` method
- [ ] Add callback to `connectionListeners` set
- [ ] Call callback immediately with current status
- [ ] Return unsubscribe function that removes from set
- [ ] Implement `notifyConnectionChange()` private method
- [ ] Calculate status and call all listeners
- [ ] Wrap each listener call in try-catch to isolate errors

**Implementation Files:**
- `src/node/p2p.ts` (ADD methods, ~35 lines)

**Success Criteria:**
- [ ] onConnectionChange adds listener and returns unsubscribe
- [ ] Callback called immediately on subscribe
- [ ] notifyConnectionChange calls all listeners
- [ ] Listener errors don't break other listeners
- [ ] Tests from Sub-phase 1.3 pass

---

### Sub-phase 3.4: Implement reconnect()

**Goal**: Add reconnection with timeout and race protection.

**Time Estimate**: 30 minutes

**Line Budget**: 50 lines

#### Tasks
- [ ] Implement `reconnect(): Promise<void>` method
- [ ] Check `reconnectLock` - if true, wait for existing reconnect
- [ ] Set `reconnectLock = true` at start
- [ ] Close all existing sockets with `peer.socket.close()`
- [ ] Clear `peers` Map
- [ ] Reconnect to all URIs in `initialPeerUris`
- [ ] Wait for `isConnectedToNetwork` with polling loop
- [ ] Throw error after 10 second timeout
- [ ] Set `reconnectLock = false` in finally block

**Implementation Files:**
- `src/node/p2p.ts` (ADD method, ~50 lines)

**Success Criteria:**
- [ ] reconnect() closes existing connections
- [ ] reconnect() re-establishes to initial peers
- [ ] 10s timeout throws error
- [ ] Concurrent calls wait for first to complete
- [ ] Tests from Sub-phase 1.4 pass

---

## Phase 4: Implement S5 Public API

### Sub-phase 4.1: Add Public Methods to S5 Class

**Goal**: Expose connection API methods on the main S5 class.

**Time Estimate**: 20 minutes

**Line Budget**: 30 lines

#### Tasks
- [ ] Add `initialPeers: string[]` private property to S5 class
- [ ] Store initialPeers in constructor
- [ ] Pass initialPeers from `S5.create()` to constructor
- [ ] Implement `getConnectionStatus()` delegating to `this.node.p2p.getConnectionStatus()`
- [ ] Implement `onConnectionChange(callback)` delegating to `this.node.p2p.onConnectionChange(callback)`
- [ ] Implement `reconnect()` delegating to `this.node.p2p.reconnect()`

**Implementation Files:**
- `src/s5.ts` (MODIFY, ~30 lines)

**Success Criteria:**
- [ ] S5 class has all 3 public methods
- [ ] Methods delegate to P2P layer correctly
- [ ] initialPeers stored for potential future use

---

### Sub-phase 4.2: Export Types

**Goal**: Export ConnectionStatus type for library consumers.

**Time Estimate**: 10 minutes

**Line Budget**: 10 lines

#### Tasks
- [ ] Export `ConnectionStatus` type from `src/node/p2p.ts`
- [ ] Re-export from `src/index.ts`
- [ ] Re-export from `src/exports/core.ts`

**Implementation Files:**
- `src/node/p2p.ts` (ADD export, ~2 lines)
- `src/index.ts` (ADD re-export, ~2 lines)
- `src/exports/core.ts` (ADD re-export, ~2 lines)

**Success Criteria:**
- [ ] ConnectionStatus type exported from main entry points
- [ ] TypeScript consumers can import the type

---

## Phase 5: Integration Testing and Cleanup

### Sub-phase 5.1: Run All Tests and Fix Issues

**Goal**: Ensure all tests pass and fix any integration issues.

**Time Estimate**: 30 minutes

**Line Budget**: 20 lines (fixes only)

#### Tasks
- [ ] Run `npm run test:run test/connection-api.test.ts`
- [ ] Fix any failing tests
- [ ] Run full test suite `npm run test:run`
- [ ] Ensure no regressions in existing tests
- [ ] Run type check `npm run type-check`

**Success Criteria:**
- [ ] All connection API tests pass
- [ ] No regressions in existing 437 tests
- [ ] TypeScript compilation succeeds

---

### Sub-phase 5.2: Manual Testing

**Goal**: Verify the API works in a real scenario.

**Time Estimate**: 15 minutes

#### Tasks
- [ ] Create simple test script that connects, subscribes, and logs status changes
- [ ] Verify status transitions: disconnected → connecting → connected
- [ ] Simulate disconnect (close WebSocket) and verify callback fires
- [ ] Test reconnect() and verify it re-establishes connection

**Success Criteria:**
- [ ] Status changes logged correctly
- [ ] Disconnect detection works
- [ ] Reconnect successfully re-establishes connection

---

## Summary

**Total Time Estimate**: ~5 hours

**Total Line Budget**: ~625 lines
- Tests: ~320 lines
- Implementation: ~305 lines

**Files to Create:**
- `test/connection-api.test.ts` (~320 lines)

**Files to Modify:**
- `src/node/p2p.ts` (~160 lines added)
- `src/s5.ts` (~30 lines added)
- `src/index.ts` (~2 lines added)
- `src/exports/core.ts` (~2 lines added)

**Test Count**: ~18 new tests

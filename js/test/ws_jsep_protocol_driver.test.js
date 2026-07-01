/**
 * @jest-environment jsdom
 */
/*
 * Copyright 2026 The Android Open Source Project
 *
 * Licensed under the Apache License, Version 2.0 (the "License")
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import WsJsepProtocol from "../src/components/emulator/net/ws_jsep_protocol_driver";
import logger from "../src/components/emulator/net/logger";
import Proto from "../src/proto/emulator_controller_pb";

describe("WsJsepProtocol Reconnection", () => {
  let mockWebSocketInstance;
  let mockPeerConnectionInstance;
  let onConnected;
  let onDisconnected;
  let onError;

  beforeEach(() => {
    jest.useFakeTimers();

    onConnected = jest.fn();
    onDisconnected = jest.fn();
    onError = jest.fn();

    mockWebSocketInstance = {
      send: jest.fn(),
      close: jest.fn(),
    };

    global.WebSocket = jest.fn().mockImplementation(() => mockWebSocketInstance);

    mockPeerConnectionInstance = {
      addTransceiver: jest.fn(),
      createDataChannel: jest.fn().mockReturnValue({}),
      createOffer: jest.fn().mockResolvedValue({ type: "offer", sdp: "sdp" }),
      setLocalDescription: jest.fn().mockResolvedValue(null),
      setRemoteDescription: jest.fn().mockResolvedValue(null),
      close: jest.fn(),
    };

    global.RTCPeerConnection = jest.fn().mockImplementation(() => mockPeerConnectionInstance);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test("Attempts to reconnect when WebSocket closes before WebRTC is connected", () => {
    const jsep = new WsJsepProtocol("ws://foo/jsep", null, {
      onError,
      reconnectDelay: 1000,
      maxReconnectAttempts: 3,
    });

    jsep.startStream({ onConnected, onDisconnected });

    expect(global.WebSocket).toHaveBeenCalledTimes(1);

    // Simulate WebSocket close
    mockWebSocketInstance.onclose({ code: 1006 });

    // Should not have reconnected immediately
    expect(global.WebSocket).toHaveBeenCalledTimes(1);

    // Fast-forward time
    jest.advanceTimersByTime(1000);

    // Should have attempted reconnect
    expect(global.WebSocket).toHaveBeenCalledTimes(2);
  });

  test("Stops reconnecting after maxReconnectAttempts is reached", () => {
    const jsep = new WsJsepProtocol("ws://foo/jsep", null, {
      onError,
      reconnectDelay: 1000,
      maxReconnectAttempts: 2,
    });

    jsep.startStream({ onConnected, onDisconnected });

    // Attempt 1 fails
    mockWebSocketInstance.onclose({ code: 1006 });
    jest.advanceTimersByTime(1000); // Trigger attempt 2

    // Attempt 2 fails
    mockWebSocketInstance.onclose({ code: 1006 });
    jest.advanceTimersByTime(2000); // Trigger attempt 3 (delay is 2000 due to backoff)

    expect(global.WebSocket).toHaveBeenCalledTimes(3); // Initial + 2 retries

    // Attempt 3 fails
    mockWebSocketInstance.onclose({ code: 1006 });
    jest.advanceTimersByTime(4000);

    // Should NOT have attempted a 4th time (3rd retry)
    expect(global.WebSocket).toHaveBeenCalledTimes(3);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  test("Does not reconnect if disconnect() is called explicitly", () => {
    const jsep = new WsJsepProtocol("ws://foo/jsep", null, {
      onError,
      reconnectDelay: 1000,
    });

    jsep.startStream({ onConnected, onDisconnected });
    jsep.disconnect();

    jest.advanceTimersByTime(1000);
    expect(global.WebSocket).toHaveBeenCalledTimes(1); // No new attempts
  });

  test("Nullifies peerConnection event handlers on disconnect to prevent memory leaks", async () => {
    const jsep = new WsJsepProtocol("ws://foo/jsep", null);
    jsep.startStream({ onConnected, onDisconnected });

    // Simulate start signal to instantiate peerConnection
    const startSignal = { start: {} };
    await jsep._handleSignal(startSignal);

    expect(jsep.peerConnection).not.toBeNull();
    expect(mockPeerConnectionInstance.ontrack).not.toBeNull();

    // Disconnect
    jsep.disconnect();

    expect(mockPeerConnectionInstance.ontrack).toBeNull();
    expect(mockPeerConnectionInstance.onicecandidate).toBeNull();
    expect(mockPeerConnectionInstance.onconnectionstatechange).toBeNull();
    expect(mockPeerConnectionInstance.ondatachannel).toBeNull();
  });

  describe("Event sending and fallbacks", () => {
    let mockMsg;
    let mockEmulator;

    beforeEach(() => {
      mockMsg = {
        serializeBinary: jest.fn().mockReturnValue(new Uint8Array([1, 2, 3])),
      };
      mockEmulator = {
        sendMouse: jest.fn(),
        sendKey: jest.fn(),
        sendTouch: jest.fn(),
      };
    });

    test("Sends via DataChannel when connected and channel is open", () => {
      const jsep = new WsJsepProtocol("ws://foo/jsep", mockEmulator);
      const mockChannel = {
        readyState: "open",
        send: jest.fn(),
      };
      jsep.connected = true;
      jsep.event_forwarders["input"] = mockChannel;

      // Mock Proto.InputEvent and its serialization
      const mockInputEvent = {
        setMouseEvent: jest.fn(),
        serializeBinary: jest.fn().mockReturnValue(new Uint8Array([9, 9, 9])),
      };
      const originalInputEvent = Proto.InputEvent;
      Proto.InputEvent = jest.fn().mockImplementation(() => mockInputEvent);

      try {
        jsep.send("mouse", mockMsg);

        expect(mockInputEvent.setMouseEvent).toHaveBeenCalledWith(mockMsg);
        expect(mockChannel.send).toHaveBeenCalledWith(new Uint8Array([9, 9, 9]));
        expect(mockEmulator.sendMouse).not.toHaveBeenCalled();
      } finally {
        Proto.InputEvent = originalInputEvent;
      }
    });

    test("Falls back to emulator controller when WebRTC is not connected", () => {
      const jsep = new WsJsepProtocol("ws://foo/jsep", mockEmulator);
      jsep.connected = false;

      jsep.send("mouse", mockMsg);
      expect(mockEmulator.sendMouse).toHaveBeenCalledWith(mockMsg);

      jsep.send("keyboard", mockMsg);
      expect(mockEmulator.sendKey).toHaveBeenCalledWith(mockMsg);

      jsep.send("touch", mockMsg);
      expect(mockEmulator.sendTouch).toHaveBeenCalledWith(mockMsg);
    });

    test("Drops event and logs warning if neither WebRTC nor emulator fallback is available", () => {
      const loggerWarnSpy = jest.spyOn(logger, "warn").mockImplementation(() => {});
      const jsep = new WsJsepProtocol("ws://foo/jsep", null); // No emulator fallback
      jsep.connected = false;

      jsep.send("mouse", mockMsg);

      expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Event was dropped"));
      loggerWarnSpy.mockRestore();
    });
  });
});

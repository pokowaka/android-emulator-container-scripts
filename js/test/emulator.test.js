/**
 * @jest-environment jsdom
 */
/*
 * Copyright 2020 The Android Open Source Project
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
import "@testing-library/jest-dom";
import "babel-polyfill";
import React from "react";
import { render, waitFor } from "@testing-library/react";
import Emulator from "../src/components/emulator/emulator";
import * as Proto from "../src/proto/emulator_controller_pb";
import WsJsepProtocol from "../src/components/emulator/net/ws_jsep_protocol_driver";

const mockDisconnect = jest.fn();
const mockStartStream = jest.fn();
const mockSend = jest.fn();
const mockCleanup = jest.fn();

jest.mock("../src/components/emulator/net/ws_jsep_protocol_driver", () => {
  return {
    __esModule: true,
    default: jest.fn(),
  };
});

describe("The emulator", () => {
  beforeEach(() => {
    WsJsepProtocol.mockReset();
    WsJsepProtocol.mockImplementation(() => {
      console.log("WsJsepProtocol mock constructor called!");
      return {
        disconnect: mockDisconnect,
        startStream: mockStartStream,
        send: mockSend,
        cleanup: mockCleanup,
      };
    });

    mockDisconnect.mockClear();
    mockStartStream.mockClear();
    mockSend.mockClear();
    mockCleanup.mockClear();

    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: "success", hardwareConfig: {} }),
      })
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const renderEmulator = async (ui, options) => {
    const result = render(ui, options);
    await waitFor(() => {
      const statusCalls = global.fetch.mock.calls.filter(call => call[0].endsWith("/api/v1/emulator/status"));
      expect(statusCalls).toHaveLength(1);
    });
    return result;
  };

  test("Creates WsJsepProtocol with correct URL", async () => {
    await renderEmulator(<Emulator uri="localhost:8080" width={300} height={300} />);
    expect(WsJsepProtocol).toHaveBeenCalledWith(
      "ws://localhost:8080/api/v1/emulator/ws-jsep",
      null,
      expect.objectContaining({ onError: expect.any(Function) })
    );
  });

  test("Creates WsJsepProtocol with correct URL when HTTPS is used", async () => {
    await renderEmulator(<Emulator uri="https://example.com" width={300} height={300} />);
    expect(WsJsepProtocol).toHaveBeenCalledWith(
      "wss://example.com/api/v1/emulator/ws-jsep",
      null,
      expect.objectContaining({ onError: expect.any(Function) })
    );
  });

  test("Tries to establish a WebRTC connection", async () => {
    await renderEmulator(
      <Emulator
        uri="localhost:8080"
        width={300}
        height={300}
      />
    );

    expect(mockStartStream).toHaveBeenCalled();
  });

  test("Sends a gps location to the emulator via REST", async () => {
    await renderEmulator(
      <Emulator
        uri="localhost:8080"
        width={300}
        height={300}
        gps={{ latitude: 47.6062, longitude: 122.3321 }}
      />
    );

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8080/api/v1/emulator/gps",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          latitude: 47.6062,
          longitude: 122.3321,
        }),
      })
    ));
  });

  test("Exposes sendKey via ref", async () => {
    const ref = React.createRef();
    await renderEmulator(<Emulator uri="localhost:8080" width={300} height={300} ref={ref} />);
    expect(ref.current).toBeDefined();
    expect(ref.current.sendKey).toBeDefined();

    ref.current.sendKey("Enter");
    expect(mockSend).toHaveBeenCalledWith("keyboard", expect.any(Proto.KeyboardEvent));
    const callArg = mockSend.mock.calls[0][1];
    expect(callArg.getKey()).toBe("Enter");
    expect(callArg.getEventtype()).toBe(Proto.KeyboardEvent.KeyEventType.KEYPRESS);
  });

  test("Sends a gps location to the emulator on update", async () => {
    const { rerender } = await renderEmulator(
      <Emulator
        uri="localhost:8080"
        width={300}
        height={300}
        gps={{ latitude: 47.6062, longitude: 122.3321 }}
      />
    );

    // Update GPS
    rerender(
      <Emulator
        uri="localhost:8080"
        width={300}
        height={300}
        gps={{ latitude: 48.0, longitude: 122.0 }}
      />
    );

    await waitFor(() => {
      const gpsCalls = global.fetch.mock.calls.filter(call => call[0] === "http://localhost:8080/api/v1/emulator/gps");
      expect(gpsCalls).toHaveLength(2);
      expect(gpsCalls[1][1].body).toBe(JSON.stringify({
        latitude: 48.0,
        longitude: 122.0,
      }));
    });
  });

  test("Invokes onError callback when GPS update REST call fails", async () => {
    const onErrorMock = jest.fn();
    
    // Mock fetch to return a 500 Server Error
    global.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 500,
      })
    );

    await renderEmulator(
      <Emulator
        uri="localhost:8080"
        width={300}
        height={300}
        gps={{ latitude: 47.6062, longitude: 122.3321 }}
        onError={onErrorMock}
      />
    );

    await waitFor(() => {
      expect(onErrorMock).toHaveBeenCalledWith(expect.any(Error));
      expect(onErrorMock.mock.calls[0][0].message).toContain("Failed to update GPS: HTTP 500");
    });
  });

  test("Does not re-send GPS coordinates on unrelated rerenders", async () => {
    const { rerender } = await renderEmulator(
      <Emulator
        uri="localhost:8080"
        width={300}
        height={300}
        gps={{ latitude: 47.6062, longitude: 122.3321 }}
      />
    );

    // Clear fetch mocks
    global.fetch.mockClear();

    // Rerender with the same GPS coordinates but different width/height
    rerender(
      <Emulator
        uri="localhost:8080"
        width={400}
        height={400}
        gps={{ latitude: 47.6062, longitude: 122.3321 }}
      />
    );

    // Wait a brief moment to ensure no async calls were triggered
    await new Promise((resolve) => setTimeout(resolve, 20));
    const gpsCalls = global.fetch.mock.calls.filter(call => call[0] === "http://localhost:8080/api/v1/emulator/gps");
    expect(gpsCalls).toHaveLength(0);
  });

  test("Cleans up JsepProtocol on unmount", async () => {
    const { unmount } = await renderEmulator(
      <Emulator uri="localhost:8080" width={300} height={300} />
    );
    unmount();
    expect(mockCleanup).toHaveBeenCalled();
  });
});

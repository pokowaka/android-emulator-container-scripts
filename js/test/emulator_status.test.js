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
import EmulatorStatus from "../src/components/emulator/net/emulator_status";

describe("EmulatorStatus", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("Returns null status initially", () => {
    const status = new EmulatorStatus("http://foo/status");
    expect(status.getStatus()).toBeNull();
  });

  test("Does not fetch if statusUrl is empty", () => {
    global.fetch = jest.fn();
    const status = new EmulatorStatus("");
    status.updateStatus(jest.fn());
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("Fetches status and notifies on success", async () => {
    const mockStatus = { status: "running", hardwareConfig: { "hw.lcd.width": "1080" } };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockStatus),
    });

    const status = new EmulatorStatus("http://foo/status");
    const notify = jest.fn();

    status.updateStatus(notify);

    expect(global.fetch).toHaveBeenCalledWith("http://foo/status", {
      headers: { Accept: "application/json" },
    });

    // Wait for promise resolution
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(notify).toHaveBeenCalledWith(mockStatus);
    expect(status.getStatus()).toEqual(mockStatus);
  });

  test("Appends auth headers if auth service is provided", () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const mockAuth = {
      authHeader: () => ({ Authorization: "Bearer token" }),
    };

    const status = new EmulatorStatus("http://foo/status", mockAuth);
    status.updateStatus(jest.fn());

    expect(global.fetch).toHaveBeenCalledWith("http://foo/status", {
      headers: {
        Accept: "application/json",
        Authorization: "Bearer token",
      },
    });
  });

  test("Uses cached status if cache is true", async () => {
    const mockStatus = { status: "running" };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockStatus),
    });

    const status = new EmulatorStatus("http://foo/status");
    const notify1 = jest.fn();
    const notify2 = jest.fn();

    status.updateStatus(notify1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Call again with cache = true
    status.updateStatus(notify2, true);
    expect(global.fetch).toHaveBeenCalledTimes(1); // No second fetch
    expect(notify2).toHaveBeenCalledWith(mockStatus);
  });

  test("Handles fetch errors gracefully", async () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    global.fetch = jest.fn().mockRejectedValue(new Error("Network error"));

    const status = new EmulatorStatus("http://foo/status");
    const notify = jest.fn();

    status.updateStatus(notify);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(notify).not.toHaveBeenCalled();
    expect(status.getStatus()).toBeNull();
    consoleErrorSpy.mockRestore();
  });
});

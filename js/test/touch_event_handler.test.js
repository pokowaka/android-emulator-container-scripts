/**
 * @jest-environment jsdom
 */
/*
 * Copyright 2021 The Android Open Source Project
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
import React from "react";
import { render, fireEvent, screen, waitFor, act } from "@testing-library/react";
import withMouseKeyHandler from "../src/components/emulator/views/event_handler";
import * as Proto from "../src/proto/emulator_controller_pb";

class FakeEmulator extends React.Component {
  render() {
    return (
      <div
        data-testid="fake"
        style={{ height: "200px", width: "200px", backgroundColor: "#555" }}
      ></div>
    );
  }
}

const fakeTouchEvent = (tp, x, y, force, props = {}) => {
  const event = new TouchEvent(tp, {
    bubbles: true,
    cancelable: true,
    ...props,
  });

  Object.defineProperty(event, "changedTouches", {
    get: () => [
      { clientX: x, clientY: y, radiusX: 4, radiusY: 4, force: force },
    ],
  });
  return event;
};

const TestView = withMouseKeyHandler(FakeEmulator);

describe("The event handler", () => {
  let mockJsep, fakeScreen;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockJsep = {
      send: jest.fn(),
    };

    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          status: "success",
          hardwareConfig: {
            "hw.lcd.width": "200",
            "hw.lcd.height": "200",
          }
        }),
      })
    );

    render(<TestView statusUrl="http://foo/status" jsep={mockJsep} />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("http://foo/status", expect.any(Object));
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    fakeScreen = screen.getByTestId("fake").parentElement;
    Object.defineProperty(fakeScreen, "clientWidth", { get: () => 200 });
    Object.defineProperty(fakeScreen, "clientHeight", { get: () => 200 });

    expect(fakeScreen).toBeInTheDocument();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("Normalizes touch pressure of 1.0 to EV_MAX", () => {
    fireEvent(fakeScreen, fakeTouchEvent("touchstart", 10, 10, 1.0));

    expect(mockJsep.send).toHaveBeenCalledTimes(1);
    const touchEvent = mockJsep.send.mock.calls[0][1];
    expect(touchEvent.getTouchesList()[0].getPressure()).toBe(32767);
  });

  test("Normalizes touch pressure >1.0 to EV_MAX", () => {
    fireEvent(fakeScreen, fakeTouchEvent("touchstart", 10, 10, 10.0));

    expect(mockJsep.send).toHaveBeenCalledTimes(1);
    const touchEvent = mockJsep.send.mock.calls[0][1];
    expect(touchEvent.getTouchesList()[0].getPressure()).toBe(32767);
  });

  test("A touch start event has a minimum value >0.01", () => {
    fireEvent(fakeScreen, fakeTouchEvent("touchstart", 10, 10, 0.0));

    expect(mockJsep.send).toHaveBeenCalledTimes(1);
    const touchEvent = mockJsep.send.mock.calls[0][1];
    expect(touchEvent.getTouchesList()[0].getPressure()).toBeGreaterThanOrEqual(327);
  });

  test("Normalizes touch end event to a pressure of 0.0 to EV_MIN", () => {
    fireEvent(fakeScreen, fakeTouchEvent("touchend", 10, 10, 0.0));

    expect(mockJsep.send).toHaveBeenCalledTimes(1);
    const touchEvent = mockJsep.send.mock.calls[0][1];
    expect(touchEvent.getTouchesList()[0].getPressure()).toBe(0);
  });

  test("Normalizes touch pressure of 0.5 to an integer of of +/- EV_MAX", () => {
    fireEvent(fakeScreen, fakeTouchEvent("touchstart", 10, 10, 0.5));

    expect(mockJsep.send).toHaveBeenCalledTimes(1);
    const touchEvent = mockJsep.send.mock.calls[0][1];
    expect(touchEvent.getTouchesList()[0].getPressure()).toBeGreaterThan(16380);
    expect(touchEvent.getTouchesList()[0].getPressure()).toBeLessThan(16387);
  });
});

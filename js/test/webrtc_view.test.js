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
import "@testing-library/jest-dom";
import React from "react";
import { render, act } from "@testing-library/react";
import EmulatorWebrtcView from "../src/components/emulator/views/webrtc_view";

describe("EmulatorWebrtcView", () => {
  let mockJsep;

  beforeEach(() => {
    mockJsep = {
      startStream: jest.fn(),
      disconnect: jest.fn(),
    };
  });

  test("Applies volume updates to the video DOM element directly", () => {
    const { container, rerender } = render(
      <EmulatorWebrtcView jsep={mockJsep} volume={0.5} muted={false} />
    );

    const videoElement = container.querySelector("video");
    expect(videoElement).toBeInTheDocument();
    expect(videoElement.volume).toBe(0.5);

    // Update volume prop
    rerender(<EmulatorWebrtcView jsep={mockJsep} volume={0.8} muted={false} />);
    expect(videoElement.volume).toBe(0.8);
  });

  test("Applies muted updates to the video DOM element directly", () => {
    const { container, rerender } = render(
      <EmulatorWebrtcView jsep={mockJsep} muted={true} />
    );

    const videoElement = container.querySelector("video");
    expect(videoElement).toBeInTheDocument();
    expect(videoElement.muted).toBe(true);

    // Update muted prop
    rerender(<EmulatorWebrtcView jsep={mockJsep} muted={false} />);
    expect(videoElement.muted).toBe(false);
  });

  test("Does not add duplicate tracks to the media stream", () => {
    // Mock MediaStream and MediaStreamTrack for the JSDOM environment
    const mockTracks = [];
    const mockStream = {
      addTrack: jest.fn((track) => mockTracks.push(track)),
      getTracks: jest.fn(() => mockTracks),
    };
    
    global.MediaStream = jest.fn(() => mockStream);

    const { container } = render(
      <EmulatorWebrtcView jsep={mockJsep} />
    );

    const videoElement = container.querySelector("video");
    expect(videoElement).toBeInTheDocument();

    // Get the startStream callbacks
    expect(mockJsep.startStream).toHaveBeenCalled();
    const { onConnected } = mockJsep.startStream.mock.calls[0][0];

    const track = { id: "audio-track-1", kind: "audio" };

    // Simulate connecting the track twice
    act(() => {
      onConnected(track);
    });
    act(() => {
      onConnected(track);
    });

    expect(mockStream.addTrack).toHaveBeenCalledTimes(1);
    expect(mockStream.getTracks()).toHaveLength(1);
  });
});

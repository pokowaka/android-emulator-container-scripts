/*
 * Copyright 2019 The Android Open Source Project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
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
import React, { useEffect, useRef, useState } from "react";
import logger from "../net/logger";
import WsJsepProtocol from "../net/ws_jsep_protocol_driver";

export interface EmulatorWebrtcViewProps {
  /** The JSEP protocol driver instance. */
  jsep: WsJsepProtocol;
  /** Callback for connection state changes ("connecting", "connected", "disconnected"). */
  onStateChange?: (state: string) => void;
  /** Callback when audio track status changes. */
  onAudioStateChange?: (audio: boolean) => void;
  /** Whether the audio should be muted. */
  muted?: boolean;
  /** Audio volume (between 0.0 and 1.0). */
  volume?: number;
  /** Callback invoked on signaling or playback errors. */
  onError?: (error: Error) => void;
  /** Component width. */
  width?: number;
  /** Component height. */
  height?: number;
}

/**
 * A React component that renders the WebRTC video stream of the emulator.
 * Handles establishing the stream via the JSEP protocol driver and managing
 * local playback (including handling autoplay constraints).
 */
const EmulatorWebrtcView: React.FC<EmulatorWebrtcViewProps> = ({
  jsep,
  onStateChange,
  onAudioStateChange,
  muted = true,
  volume = 1.0,
  onError = (e) => logger.error("WebRTC error: " + e),
  width,
  height,
}) => {
  const [audio, setAudio] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [connect, setConnect] = useState<string>("connecting");

  useEffect(() => {
    if (onStateChange) {
      onStateChange(connect);
    }
  }, [connect, onStateChange]);

  useEffect(() => {
    if (onAudioStateChange) {
      onAudioStateChange(audio);
    }
  }, [audio, onAudioStateChange]);

  const onDisconnect = () => {
    setConnect("disconnected");
    setAudio(false);
  };

  const onConnect = (track: MediaStreamTrack) => {
    setConnect("connected");
    const video = videoRef.current;
    if (!video) {
      // Component was unmounted.
      return;
    }

    if (!video.srcObject) {
      video.srcObject = new MediaStream();
    }
    
    const stream = video.srcObject as MediaStream;
    if (!stream.getTracks().find((t) => t.id === track.id)) {
      stream.addTrack(track);
    }

    if (track.kind === "audio") {
      setAudio(true);
    }
  };

  const safePlay = async () => {
    const video = videoRef.current;
    if (!video) {
      // Component was unmounted.
      return;
    }

    try {
      await video.play();
      logger.debug("Automatic playback started!");
    } catch (error: any) {
      // Notify listeners that we cannot start.
      onError(error);
    }
  };

  const onCanPlay = () => {
    safePlay();
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  useEffect(() => {
    jsep.startStream({
      onConnected: onConnect,
      onDisconnected: onDisconnect,
    });

    setConnect("connecting");

    return () => {
      jsep.disconnect();
    };
  }, []);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = muted;
    }
  }, [muted]);

  return (
    <video
      ref={videoRef}
      style={{
        display: "block",
        position: "relative",
        width: width ? `${width}px` : "100%",
        height: height ? `${height}px` : "100%",
        objectFit: "contain",
        objectPosition: "center",
      }}
      onContextMenu={onContextMenu}
      onCanPlay={onCanPlay}
    />
  );
};

export default EmulatorWebrtcView;

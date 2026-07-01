/*
 * Copyright 2019 The Android Open Source Project
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
import React, {
  useState,
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useMemo,
} from "react";
import EmulatorWebrtcView from "./views/webrtc_view";
import withMouseKeyHandler from "./views/event_handler";
import WsJsepProtocol from "./net/ws_jsep_protocol_driver";
import logger from "./net/logger";
import Proto from "../../proto/emulator_controller_pb";

const RtcView = withMouseKeyHandler(EmulatorWebrtcView);

export interface EmulatorProps {
  /** Endpoint where we can reach the emulator gateway (host:port or http(s)://host:port). */
  uri: string;
  /** The authentication service to use, or null for no authentication. */
  auth?: any;
  /** True if the audio should be disabled. */
  muted?: boolean;
  /** Volume between [0, 1] when audio is enabled. 0 is muted, 1.0 is 100% */
  volume?: number;
  /** Called upon state change, one of ["connecting", "connected", "disconnected"] */
  onStateChange?: (state: string) => void;
  /** Called when the audio becomes (un)available. True if audio is available, false otherwise. */
  onAudioStateChange?: (audio: boolean) => void;
  /** The width of the component */
  width?: number;
  /** The height of the component */
  height?: number;
  /** A [GeolocationCoordinates](https://developer.mozilla.org/en-US/docs/Web/API/GeolocationCoordinates) like object indicating where the device is. */
  gps?: {
    latitude: number;
    longitude: number;
    altitude?: number;
    heading?: number;
    speed?: number;
  };
  /** Callback that will be invoked in case of errors. */
  onError?: (error: any) => void;
}

export interface EmulatorRef {
  sendKey(key: string): void;
}

/**
 * Resolves the given URI into the required REST and WebSocket endpoints for the emulator.
 *
 * @param uri The base URI of the emulator gateway.
 * @returns An object containing the resolved REST and WebSocket URLs.
 */
const getUrls = (uri: string) => {
  let restBase = uri;
  if (!/^https?:\/\//i.test(uri)) {
    restBase = "http://" + uri;
  }
  let wsUrl = restBase.replace(/^http/i, "ws");
  restBase = restBase.replace(/\/$/, "");
  wsUrl = wsUrl.replace(/\/$/, "");

  return {
    status: `${restBase}/api/v1/emulator/status`,
    gps: `${restBase}/api/v1/emulator/gps`,
    jsep: `${wsUrl}/api/v1/emulator/ws-jsep`,
  };
};

/**
 * A React component that displays a remote android emulator.
 *
 * The emulator will mount a webrtc view component to display the current state
 * of the emulator. It will translate mouse and touch events on this component and send them
 * to the actual emulator over WebRTC Data Channels.
 *
 * #### Authentication Service
 *
 * The authentication service should implement the following methods:
 *
 * - `authHeader()` which must return a set of headers that should be send along with a request.
 * - `unauthorized()` a function that gets called when a 401 was received.
 *
 * Note that chrome will not autoplay the video if it is not muted and no interaction
 * with the page has taken place. See https://developers.google.com/web/updates/2017/09/autoplay-policy-changes.
 *
 * #### Pressing hardware buttons
 *
 * This component has a method `sendKey` that sends a key to the emulator.
 * You can use this to send physical button events to the emulator for example:
 *
 * "AudioVolumeDown" - 	Decreases the audio volume.
 * "AudioVolumeUp"   -	Increases the audio volume.
 * "Power"	         -  The Power button or key, turn off the device.
 * "AppSwitch"       -  Should bring up the application switcher dialog.
 * "GoHome"          -  Go to the home screen.
 * "GoBack"          -  Open the previous screen you were looking at.
 *
 */
const Emulator = forwardRef<EmulatorRef, EmulatorProps>(
  (
    {
      uri,
      auth = null,
      muted = true,
      volume = 1.0,
      onStateChange = (s) => {
        logger.debug("emulator state: " + s);
      },
      onAudioStateChange = (s) => {
        logger.debug("emulator audio: " + s);
      },
      width,
      height,
      gps,
      onError = (e) => {
        logger.error(e);
      },
    },
    ref
  ) => {
    const [audio, setAudio] = useState<boolean>(false);
    const jsep = useRef<WsJsepProtocol | null>(null);
    const viewRef = useRef<any>(null);

    const onErrorRef = useRef<(error: any) => void>(onError);
    useEffect(() => {
      onErrorRef.current = onError;
    }, [onError]);

    const urls = useMemo(() => getUrls(uri), [uri]);

    if (!jsep.current) {
      jsep.current = new WsJsepProtocol(urls.jsep, null, {
        onError: (err) => {
          if (onErrorRef.current) {
            onErrorRef.current(err);
          }
        },
      });
      logger.info("Created JSEP:", jsep.current);
    }

    useEffect(() => {
      if (typeof gps === "undefined") {
        return;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (auth && auth.authHeader) {
        Object.assign(headers, auth.authHeader());
      }

      const body = JSON.stringify({
        latitude: gps.latitude,
        longitude: gps.longitude,
        altitude: gps.altitude,
        heading: gps.heading,
        speed: gps.speed,
      });

      fetch(urls.gps, {
        method: 'POST',
        headers,
        body,
      })
        .then((res) => {
          if (!res.ok) {
            throw new Error(`Failed to update GPS: HTTP ${res.status}`);
          }
        })
        .catch(err => {
          if (onError) onError(err);
        });
    }, [
      gps?.latitude,
      gps?.longitude,
      gps?.altitude,
      gps?.heading,
      gps?.speed,
      urls.gps,
      auth
    ]);

    useEffect(() => {
      return () => {
        if (jsep.current) {
          jsep.current.cleanup();
        }
      };
    }, []);

    useImperativeHandle(ref, () => ({
      sendKey: (key) => {
        const request = new Proto.KeyboardEvent();
        request.setEventtype(Proto.KeyboardEvent.KeyEventType.KEYPRESS);
        request.setKey(key);
        jsep.current?.send("keyboard", request);
      },
    }));

    const _onAudioStateChange = (s: boolean) => {
      setAudio(s);
      onAudioStateChange(s);
    };

    logger.debug(`render ${width}x${height}`);
    return (
      <RtcView
        ref={viewRef}
        width={width}
        height={height}
        statusUrl={urls.status}
        jsep={jsep.current}
        onStateChange={onStateChange}
        muted={muted}
        volume={volume}
        onError={onError}
        onAudioStateChange={_onAudioStateChange}
        auth={auth}
      />
    );
  }
);

export default Emulator;

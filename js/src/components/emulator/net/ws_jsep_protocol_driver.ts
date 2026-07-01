/*
 * Copyright 2026 The Android Open Source Project
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
import logger from "./logger";
import Proto from "../../../proto/emulator_controller_pb";

export interface WsJsepConfig {
  enableLogging?: boolean;
  onError?: (error: Error | Event) => void;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  reconnectBackoffFactor?: number;
  [key: string]: any;
}

export interface StreamCallbacks {
  onConnected?: (track: MediaStreamTrack) => void;
  onDisconnected?: (driver: WsJsepProtocol) => void;
}

export interface EmulatorController {
  sendMouse?(msg: any): void;
  sendKey?(msg: any): void;
  sendTouch?(msg: any): void;
}

export interface JsepSignal {
  start?: RTCConfiguration;
  type?: "offer" | "answer";
  sdp?: RTCSessionDescriptionInit | string;
  candidate?: RTCIceCandidateInit | string;
  bye?: boolean;
}

/**
 * A JSEP protocol driver that uses WebSockets for signaling.
 *
 * @export
 * @class WsJsepProtocol
 */
export default class WsJsepProtocol {
  wsUrl: string;
  emulator: EmulatorController | null;
  config: WsJsepConfig;
  onError?: (error: Error | Event) => void;
  maxReconnectAttempts: number;
  reconnectDelay: number;
  reconnectBackoffFactor: number;

  connected: boolean;
  event_forwarders: Record<string, RTCDataChannel>;
  peerConnection: RTCPeerConnection | null;
  ws: WebSocket | null;

  pendingCandidates: (RTCIceCandidateInit | string)[];
  remoteDescriptionSet: boolean;

  signalQueue: JsepSignal[];
  isProcessingSignal: boolean;

  onConnected: ((track: MediaStreamTrack) => void) | null;
  onDisconnected: ((driver: WsJsepProtocol) => void) | null;

  reconnectAttempts: number;
  reconnectTimeoutId: any | null;

  /**
   * Creates an instance of WsJsepProtocol.
   *
   * @param wsUrl The WebSocket JSEP signaling URL.
   * @param emulator Fallback emulator controller for sending events when WebRTC is unavailable.
   * @param config Configuration options.
   */
  constructor(wsUrl: string, emulator: EmulatorController | null = null, config: WsJsepConfig = {}) {
    this.wsUrl = wsUrl;
    this.emulator = emulator;
    this.config = {
      enableLogging: false,
      ...config
    };
    this.onError = this.config.onError;
    this.maxReconnectAttempts = this.config.maxReconnectAttempts ?? 5;
    this.reconnectDelay = this.config.reconnectDelay ?? 1000;
    this.reconnectBackoffFactor = this.config.reconnectBackoffFactor ?? 2;

    this.connected = false;
    this.event_forwarders = {};
    this.peerConnection = null;
    this.ws = null;

    // WebRTC signaling state
    this.pendingCandidates = [];
    this.remoteDescriptionSet = false;

    // Signaling message queue to prevent concurrent mutations
    this.signalQueue = [];
    this.isProcessingSignal = false;

    // Callbacks set during startStream
    this.onConnected = null;
    this.onDisconnected = null;

    // Reconnection state
    this.reconnectAttempts = 0;
    this.reconnectTimeoutId = null;
  }

  /**
   * Establishes the WebSocket connection and starts the signaling process.
   * Cleans up any existing connection beforehand.
   *
   * @param callbacks Callbacks for stream lifecycle events.
   */
  startStream = (callbacks: StreamCallbacks = {}) => {
    this.cleanup();
    this.reconnectAttempts = 0;

    this.onConnected = callbacks.onConnected || this.onConnected;
    this.onDisconnected = callbacks.onDisconnected || this.onDisconnected;

    this.connected = true;
    this._connect();
  };

  /**
   * Internal method to establish WebSocket connection.
   *
   * @private
   */
  _connect = () => {
    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    this.ws = new WebSocket(this.wsUrl);
    this.ws.onmessage = this._handleWsMessage;
    this.ws.onclose = this._handleWsClose;
    this.ws.onerror = this._handleWsError;
  };

  /**
   * Queues a reconnection attempt with exponential backoff.
   *
   * @private
   */
  _queueReconnect = () => {
    if (this.reconnectTimeoutId) return;

    this.reconnectAttempts++;
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      logger.error(`Max reconnect attempts (${this.maxReconnectAttempts}) reached. Giving up.`);
      if (this.onError) {
        this.onError(new Error("Connection failed: Max reconnect attempts reached."));
      }
      this.disconnect();
      return;
    }

    const delay = this.reconnectDelay * Math.pow(this.reconnectBackoffFactor, this.reconnectAttempts - 1);
    logger.info(`Queueing reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);

    this.reconnectTimeoutId = setTimeout(() => {
      this.reconnectTimeoutId = null;
      // Partially disconnect to clean up the failed peer connection/websocket,
      // but keep this.connected = true so we know we want to reconnect.
      this._disconnectState();
      this._connect();
    }, delay);
  };

  /**
   * Internal handler for incoming WebSocket messages. Parses the signal
   * and queues it for sequential processing.
   *
   * @private
   * @param event The WebSocket message event.
   */
  _handleWsMessage = (event: MessageEvent) => {
    try {
      const signal = JSON.parse(event.data);
      // Push to queue instead of handling immediately
      this.signalQueue.push(signal);
      this._processSignalQueue();
    } catch (e) {
      logger.error("Failed to handle WS message:", e, "Raw payload:", event.data);
    }
  };

  /**
   * Sequentially processes JSEP signals from the queue.
   *
   * @private
   */
  _processSignalQueue = async () => {
    if (this.isProcessingSignal) return;
    this.isProcessingSignal = true;

    while (this.signalQueue.length > 0) {
      const signal = this.signalQueue.shift();
      await this._handleSignal(signal);
    }

    this.isProcessingSignal = false;
  };

  /**
   * Handles WebSocket connection close events.
   *
   * @private
   * @param event The WebSocket close event.
   */
  _handleWsClose = (event: CloseEvent) => {
    logger.debug("WebSocket closed:", event);
    if (this.connected) {
      this._queueReconnect();
    } else {
      this.disconnect();
    }
  };

  /**
   * Handles WebSocket error events.
   *
   * @private
   * @param error The WebSocket error event.
   */
  _handleWsError = (error: Event) => {
    logger.error("WebSocket error:", error);
    if (this.connected) {
      this._queueReconnect();
    } else {
      if (this.onError) {
        this.onError(error);
      }
      this.disconnect();
    }
  };

  /**
   * Processes a single JSEP signal (e.g., start, offer, answer, candidate, bye).
   *
   * @private
   * @param signal The JSEP signaling message.
   */
  _handleSignal = async (signal: JsepSignal) => {
    logger.debug("JSEP << [Received from Server]:", JSON.stringify(signal, null, 2));
    
    try {
      if (signal.start) {
        await this._handleStart(signal.start);
      }
      
      if (signal.type === "offer" || signal.type === "answer") {
        await this._handleSDP(signal as RTCSessionDescriptionInit); // Pass the whole signal object
      } else if (signal.sdp && typeof signal.sdp === "object" && signal.sdp.type) {
        await this._handleSDP(signal.sdp); // Pass the nested object
      }
      
      if (signal.candidate) {
        this._handleCandidate(signal.candidate);
      }
      if (signal.bye) {
        this._handleBye();
      }
    } catch (e) {
      logger.error("Error processing signal:", e);
    }
  };

  /**
   * Initializes the RTCPeerConnection and local data channels based on the start configuration.
   *
   * @private
   * @param config The signaling start configuration.
   */
  _handleStart = async (config: RTCConfiguration) => {
    const localOnlyConfig: RTCConfiguration = {
      ...config,
      iceServers: []
    };

    this.peerConnection = new RTCPeerConnection(localOnlyConfig);
    this.peerConnection.ontrack = this._handlePeerConnectionTrack;
    this.peerConnection.onicecandidate = this._handlePeerIceCandidate;
    this.peerConnection.onconnectionstatechange = this._handlePeerConnectionStateChange;
    this.peerConnection.ondatachannel = this._handleDataChannel;

    this.peerConnection.addTransceiver("video", { direction: "recvonly" });
    this.peerConnection.addTransceiver("audio", { direction: "recvonly" });

    const input = this.peerConnection.createDataChannel("input");

    this._setupDataChannel(input);

    this.connected = true;

    try {
      const offer = await this.peerConnection.createOffer();
      if (!this.peerConnection) return;

      await this.peerConnection.setLocalDescription(offer);
      if (!this.peerConnection) return;

      this._sendJsep({ sdp: offer });
    } catch (e) {
      logger.error("Failed to create or set local offer:", e);
    }
  };

  /**
   * Handles incoming media track events from the RTCPeerConnection.
   *
   * @private
   * @param e The track event.
   */
  _handlePeerConnectionTrack = (e: RTCTrackEvent) => {
    if (this.onConnected) {
      this.onConnected(e.track);
    }
  };

  /**
   * Handles ICE candidate generation from the local RTCPeerConnection.
   *
   * @private
   * @param e The ICE candidate event.
   */
  _handlePeerIceCandidate = (e: RTCPeerConnectionIceEvent) => {
    if (e.candidate === null) return;
    this._sendJsep({ candidate: e.candidate });
  };

  /**
   * Monitors connection state changes on the RTCPeerConnection to trigger disconnection.
   *
   * @private
   * @param e The state change event.
   */
  _handlePeerConnectionStateChange = (e: Event) => {
    if (!this.peerConnection) return;
    switch (this.peerConnection.connectionState) {
      case "disconnected":
      case "failed":
      case "closed":
        this.disconnect();
    }
  };

  /**
   * Registers a data channel for event forwarding.
   *
   * @private
   * @param channel The data channel.
   */
  _setupDataChannel = (channel: RTCDataChannel) => {
    this.event_forwarders[channel.label] = channel;
  };

  /**
   * Handles remote data channel creation.
   *
   * @private
   * @param e The data channel event.
   */
  _handleDataChannel = (e: RTCDataChannelEvent) => {
    this._setupDataChannel(e.channel);
  };

  /**
   * Processes a remote SDP offer or answer, applying it to the RTCPeerConnection.
   *
   * @private
   * @param sdp The session description.
   */
  _handleSDP = async (sdp: RTCSessionDescriptionInit) => {
    if (!this.peerConnection) return;

    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
      if (!this.peerConnection) return;

      this.remoteDescriptionSet = true;

      logger.debug(`Processing ${this.pendingCandidates.length} queued ICE candidates.`);
      while (this.pendingCandidates.length > 0) {
        const candidate = this.pendingCandidates.shift();
        this._addIceCandidate(candidate);
      }

      if (sdp.type === "offer") {
        const answer = await this.peerConnection.createAnswer();
        if (!this.peerConnection) return;

        await this.peerConnection.setLocalDescription(answer);
        if (!this.peerConnection) return; 

        this._sendJsep({ sdp: answer });
      }
    } catch (e) {
      logger.error("Failed to process remote SDP:", e);
    }
  };

  /**
   * Adds a remote ICE candidate to the RTCPeerConnection.
   *
   * @private
   * @param candidate The ICE candidate object or string.
   */
  _addIceCandidate = (candidate: RTCIceCandidateInit | string) => {
    try {
      const candidateInit = typeof candidate === 'string'
        ? { candidate: candidate, sdpMid: "0", sdpMLineIndex: 0 }
        : candidate;
      this.peerConnection?.addIceCandidate(new RTCIceCandidate(candidateInit));
    } catch (e) {
      logger.warn("Failed to add ICE candidate:", e, candidate);
    }
  };

  /**
   * Handles an incoming remote ICE candidate, queueing it if the remote description is not yet set.
   *
   * @private
   * @param candidate The remote ICE candidate.
   */
  _handleCandidate = (candidate: RTCIceCandidateInit | string) => {
    if (!this.peerConnection) return;
    if (!this.remoteDescriptionSet) {
      logger.debug("Queueing ICE candidate until remote description is set:", candidate);
      this.pendingCandidates.push(candidate);
    } else {
      this._addIceCandidate(candidate);
    }
  };

  /**
   * Handles the 'bye' signal from the remote side, triggering disconnection.
   *
   * @private
   */
  _handleBye = () => {
    this.disconnect();
  };

  /**
   * Serializes and sends a JSEP JSON message over the WebSocket.
   *
   * @private
   * @param jsonObject The JSON payload.
   */
  _sendJsep = (jsonObject: JsepSignal) => {
    logger.debug("JSEP >> [Sending to Server]:", JSON.stringify(jsonObject, null, 2));
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(jsonObject));
    }
  };

  /**
   * Sends a control message (mouse, keyboard, touch) over either the corresponding
   * WebRTC DataChannel or via the fallback emulator controller.
   *
   * @param label The channel label ("mouse", "keyboard", "touch").
   * @param msg The protobuf message instance.
   */
  send = (label: string, msg: any) => {
    let forwarder = this.event_forwarders["input"];
    if (this.connected && forwarder && forwarder.readyState === "open") {
      const inputEvent = new Proto.InputEvent();
      switch (label) {
        case "mouse":
          inputEvent.setMouseEvent(msg);
          break;
        case "keyboard":
          inputEvent.setKeyEvent(msg);
          break;
        case "touch":
          inputEvent.setTouchEvent(msg);
          break;
        default:
          logger.warn(`Unsupported event label '${label}' for WebRTC data channel.`);
          return;
      }
      let bytes = inputEvent.serializeBinary();
      forwarder.send(bytes);
    } else if (this.emulator) {
      switch (label) {
        case "mouse":
          if (this.emulator.sendMouse) this.emulator.sendMouse(msg);
          break;
        case "keyboard":
          if (this.emulator.sendKey) this.emulator.sendKey(msg);
          break;
        case "touch":
          if (this.emulator.sendTouch) this.emulator.sendTouch(msg);
          break;
      }
    } else {
      logger.warn(`Data channel 'input' is not open. Event was dropped.`);
    }
  };

  /**
   * Cleans up the current connection's WebSocket and PeerConnection state,
   * but does not mark the driver as permanently disconnected or trigger
   * the onDisconnected callback. Used during reconnection.
   *
   * @private
   */
  _disconnectState = () => {
    this.signalQueue = [];
    this.isProcessingSignal = false;

    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }
    if (this.peerConnection) {
      this.peerConnection.ontrack = null;
      this.peerConnection.onicecandidate = null;
      this.peerConnection.onconnectionstatechange = null;
      this.peerConnection.ondatachannel = null;
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.pendingCandidates = [];
    this.remoteDescriptionSet = false;
    this.event_forwarders = {};
  };

  /**
   * Disconnects both the WebSocket signaling connection and the WebRTC PeerConnection.
   */
  disconnect = () => {
    this.connected = false;

    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }
    this.reconnectAttempts = 0;

    this._disconnectState();

    if (this.onDisconnected) {
      this.onDisconnected(this);
    }
  };

  /**
   * Fully cleans up signaling and WebRTC state.
   */
  cleanup = () => {
    this.disconnect();
    this.event_forwarders = {};
  };
}

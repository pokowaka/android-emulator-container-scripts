import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from "react";
import Proto from "../../../proto/emulator_controller_pb";
import EmulatorStatus from "../net/emulator_status";
import logger from "../net/logger";
import WsJsepProtocol from "../net/ws_jsep_protocol_driver";

const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 2424;

export interface MouseKeyHandlerProps {
  /** The REST endpoint to retrieve status. */
  statusUrl: string;
  /** Jsep protocol driver, used to send mouse & touch events. */
  jsep: WsJsepProtocol;
  /** The authentication service to use. */
  auth?: any;
  /** The width of the component. */
  width?: number;
  /** The height of the component. */
  height?: number;
  [key: string]: any;
}

export interface MouseKeyHandlerRef {
  scaleCoordinates(xp: number, yp: number): { x: number; y: number; scaleX: number; scaleY: number };
  setDeviceWidth: React.Dispatch<React.SetStateAction<number>>;
  setDeviceHeight: React.Dispatch<React.SetStateAction<number>>;
  handlerRef: React.RefObject<HTMLDivElement>;
}

interface MouseState {
  xp: number;
  yp: number;
  mouseDown: boolean;
  mouseButton: number;
}

/**
 * Scales an axis to linux input codes that the emulator understands.
 *
 * @param value The value to scale.
 * @param minIn The minimum input value.
 * @param maxIn The maximum input value.
 * @returns The scaled value mapped to the EV_ABS range.
 */
const scaleAxis = (value: number, minIn: number, maxIn: number) => {
  const minOut = 0x0; // EV_ABS_MIN
  const maxOut = 0x7fff; // EV_ABS_MAX
  const rangeOut = maxOut - minOut;
  const rangeIn = maxIn - minIn;
  if (rangeIn < 1) {
    return minOut + rangeOut / 2;
  }
  return (((value - minIn) * rangeOut) / rangeIn + minOut) | 0;
};

/**
 * A handler that extends a view to send key/mouse events to the emulator.
 * It wraps the inner component in a div, and will use the jsep handler
 * to send key/mouse/touch events over the proper channel.
 *
 * It will translate the mouse events based upon the returned display size of
 * the emulator.
 *
 * You usually want to wrap a EmulatorRtcview, or EmulatorPngView in it.
 */
export default function withMouseKeyHandler<P extends object>(
  WrappedComponent: React.ComponentType<P>
) {
  const MouseKeyHandler = forwardRef<MouseKeyHandlerRef, MouseKeyHandlerProps & P>((props, ref) => {
    const { statusUrl, auth, jsep, width, height } = props;

    const [deviceWidth, setDeviceWidth] = useState<number>(DEFAULT_WIDTH);
    const [deviceHeight, setDeviceHeight] = useState<number>(DEFAULT_HEIGHT);
    const [mouse, setMouse] = useState<MouseState>({
      xp: 0,
      yp: 0,
      mouseDown: false,
      mouseButton: 0,
    });

    const handlerRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      scaleCoordinates,
      setDeviceWidth,
      setDeviceHeight,
      handlerRef,
    }));

    useEffect(() => {
      const status = new EmulatorStatus(statusUrl, auth);
      status.updateStatus((state) => {
        setDeviceWidth(parseInt(state.hardwareConfig?.["hw.lcd.width"] || "") || DEFAULT_WIDTH);
        setDeviceHeight(parseInt(state.hardwareConfig?.["hw.lcd.height"] || "") || DEFAULT_HEIGHT);
      });
    }, [statusUrl, auth]);

    const onContextMenu = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
    }, []);

    /**
     * Translates and scales HTML coordinates (xp, yp) from the event handler's
     * container element to the emulator's internal device coordinate system.
     * 
     * This method accounts for letterboxing or pillarboxing that occurs when
     * the container's aspect ratio differs from the emulator's native screen aspect ratio,
     * ensuring that clicks on black borders are ignored and clicks on the active area
     * are correctly mapped.
     *
     * @param xp The horizontal coordinate relative to the container element.
     * @param yp The vertical coordinate relative to the container element.
     * @returns An object containing the scaled x/y coordinates and scaling factors.
     */
    const scaleCoordinates = useCallback((xp: number, yp: number) => {
      const { clientHeight, clientWidth } = handlerRef.current!;

      const deviceRatio = deviceWidth / deviceHeight;
      const containerRatio = clientWidth / clientHeight;

      let renderedWidth = clientWidth;
      let renderedHeight = clientHeight;
      let offsetX = 0;
      let offsetY = 0;

      if (containerRatio > deviceRatio) {
        // Pillarboxed (bars on left and right)
        renderedWidth = clientHeight * deviceRatio;
        offsetX = (clientWidth - renderedWidth) / 2;
      } else {
        // Letterboxed (bars on top and bottom)
        renderedHeight = clientWidth / deviceRatio;
        offsetY = (clientHeight - renderedHeight) / 2;
      }

      // Adjust coordinate relative to the actual rendered video area
      const adjustedXp = xp - offsetX;
      const adjustedYp = yp - offsetY;

      const scaleX = deviceWidth / renderedWidth;
      const scaleY = deviceHeight / renderedHeight;

      const x = Math.round(adjustedXp * scaleX);
      const y = Math.round(adjustedYp * scaleY);

      logger.debug(
        `scaleCoordinates: input(${xp}, ${yp}), container(${clientWidth}x${clientHeight}), ` +
        `device(${deviceWidth}x${deviceHeight}), offset(${Math.round(offsetX)}, ${Math.round(offsetY)}), ` +
        `adjusted(${Math.round(adjustedXp)}, ${Math.round(adjustedYp)}), scale(${scaleX.toFixed(3)}, ${scaleY.toFixed(3)}), output(${x}, ${y})`
      );

      // Guard against out of bounds or division by zero
      if (
        isNaN(x) ||
        isNaN(y) ||
        adjustedXp < 0 ||
        adjustedXp > renderedWidth ||
        adjustedYp < 0 ||
        adjustedYp > renderedHeight
      ) {
        logger.debug("Ignoring out of bounds or invalid click: x: " + x + ", y:" + y);
        return { x: -1, y: -1, scaleX, scaleY };
      }

      return { x, y, scaleX, scaleY };
    }, [deviceWidth, deviceHeight]);

    const sendMouseCoordinates = useCallback((currentMouse: MouseState) => {
      const { mouseDown, mouseButton, xp, yp } = currentMouse;
      const { x, y } = scaleCoordinates(xp, yp);
      if (x < 0 || y < 0) {
        return;
      }
      const request = new Proto.MouseEvent();
      request.setX(x);
      request.setY(y);
      request.setButtons(mouseDown ? mouseButton : 0);
      jsep.send("mouse", request);
    }, [scaleCoordinates, jsep]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
      // Disable jumping to next control when pressing the space bar.
      if (e.keyCode === 32) {
        e.preventDefault();
      }
      const request = new Proto.KeyboardEvent();
      request.setEventtype(Proto.KeyboardEvent.KeyEventType.KEYDOWN);
      request.setKey(e.key);
      jsep.send("keyboard", request);
    }, [jsep]);

    const handleKeyUp = useCallback((e: React.KeyboardEvent) => {
      // Disable jumping to next control when pressing the space bar.
      if (e.keyCode === 32) {
        e.preventDefault();
      }
      const request = new Proto.KeyboardEvent();
      request.setEventtype(Proto.KeyboardEvent.KeyEventType.KEYUP);
      request.setKey(e.key);
      jsep.send("keyboard", request);
    }, [jsep]);

    const getRelativeCoords = useCallback((e: React.MouseEvent) => {
      const rect = handlerRef.current ? handlerRef.current.getBoundingClientRect() : null;
      const xp = rect && rect.width > 0 ? e.clientX - rect.left : e.nativeEvent.offsetX || 0;
      const yp = rect && rect.height > 0 ? e.clientY - rect.top : e.nativeEvent.offsetY || 0;
      return { xp, yp };
    }, []);

    // Properly handle the mouse events.
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
      const { xp, yp } = getRelativeCoords(e);
      const newMouse = {
        xp,
        yp,
        mouseDown: true,
        // In browser's MouseEvent.button property,
        // 0 stands for left button and 2 stands for right button.
        mouseButton: e.button === 0 ? 1 : e.button === 2 ? 2 : 0,
      };
      setMouse(newMouse);
      sendMouseCoordinates(newMouse);
    }, [getRelativeCoords, sendMouseCoordinates]);

    const handleMouseUp = useCallback((e: React.MouseEvent) => {
      const { xp, yp } = getRelativeCoords(e);
      const newMouse = { xp, yp, mouseDown: false, mouseButton: 0 };
      setMouse(newMouse);
      sendMouseCoordinates(newMouse);
    }, [getRelativeCoords, sendMouseCoordinates]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
      // Let's not overload the endpoint with useless events.
      if (!mouse.mouseDown) return;

      const { xp, yp } = getRelativeCoords(e);
      const newMouse = { ...mouse, xp, yp };
      setMouse(newMouse);
      sendMouseCoordinates(newMouse);
    }, [mouse, getRelativeCoords, sendMouseCoordinates]);

    const setTouchCoordinates = useCallback((type: string, touches: TouchList, minForce: number, maxForce: number) => {
      // We need to calculate the offset of the touch events.
      const rect = handlerRef.current!.getBoundingClientRect();
      const touchesToSend: any[] = [];

      for (let i = 0; i < touches.length; i++) {
        const touch = touches[i];
        const { clientX, clientY, identifier, force, radiusX, radiusY } = touch;
        const offsetX = clientX - rect.left;
        const offsetY = clientY - rect.top;
        const { x, y, scaleX, scaleY } = scaleCoordinates(offsetX, offsetY);

        if (x < 0 || y < 0) {
          continue;
        }

        const scaledRadiusX = 2 * radiusX * scaleX;
        const scaledRadiusY = 2 * radiusY * scaleY;

        const protoTouch = new Proto.Touch();
        protoTouch.setX(x | 0);
        protoTouch.setY(y | 0);
        protoTouch.setIdentifier(identifier);

        // Normalize the force
        const MT_PRESSURE = scaleAxis(
          Math.max(minForce, Math.min(maxForce, force)),
          0,
          1
        );
        protoTouch.setPressure(MT_PRESSURE);
        protoTouch.setTouchMajor(Math.max(scaledRadiusX, scaledRadiusY) | 0);
        protoTouch.setTouchMinor(Math.min(scaledRadiusX, scaledRadiusY) | 0);

        touchesToSend.push(protoTouch);
      }

      if (touchesToSend.length === 0) {
        return;
      }

      // Make the grpc call.
      const requestTouchEvent = new Proto.TouchEvent();
      requestTouchEvent.setTouchesList(touchesToSend);
      jsep.send("touch", requestTouchEvent);
    }, [scaleCoordinates, jsep]);

    const handleTouchActive = useCallback((e: React.TouchEvent) => {
      if (e.cancelable) {
        e.preventDefault();
      }
      setTouchCoordinates(
        e.nativeEvent.type,
        e.nativeEvent.changedTouches,
        0.01,
        1.0
      );
    }, [setTouchCoordinates]);

    const handleTouchInactive = useCallback((e: React.TouchEvent) => {
      if (e.cancelable) {
        e.preventDefault();
      }
      setTouchCoordinates(
        e.nativeEvent.type,
        e.nativeEvent.changedTouches,
        0.0,
        0.0
      );
    }, [setTouchCoordinates]);

    const onMouseOut = useCallback((e: React.MouseEvent) => {
      handleMouseUp(e);
    }, [handleMouseUp]);

    return (
      <div
        onTouchStart={handleTouchActive}
        onTouchMove={handleTouchActive}
        onTouchEnd={handleTouchInactive}
        onTouchCancel={handleTouchInactive}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseOut={onMouseOut}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onContextMenu={onContextMenu}
        tabIndex={0}
        ref={handlerRef}
        style={{
          pointerEvents: "all",
          outline: "none",
          margin: "0",
          padding: "0",
          border: "0",
          display: "inline-block",
          width: width ? `${width}px` : "100%",
          height: height ? `${height}px` : "auto",
        }}
      >
        <WrappedComponent {...props as P} />
      </div>
    );
  });

  MouseKeyHandler.displayName = `WithMouseKeyHandler(${WrappedComponent.displayName || WrappedComponent.name || "Component"})`;

  return MouseKeyHandler;
}

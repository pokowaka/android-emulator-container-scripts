export class MouseEvent {
  getX(): number;
  setX(x: number): void;
  getY(): number;
  setY(y: number): void;
  getButtons(): number;
  setButtons(buttons: number): void;
  serializeBinary(): Uint8Array;
}

export namespace KeyboardEvent {
  export enum KeyEventType {
    KEYDOWN = 0,
    KEYUP = 1,
    KEYPRESS = 2,
  }
}

export class KeyboardEvent {
  getEventtype(): KeyboardEvent.KeyEventType;
  setEventtype(type: KeyboardEvent.KeyEventType): void;
  getKey(): string;
  setKey(key: string): void;
  serializeBinary(): Uint8Array;
}

export class Touch {
  getX(): number;
  setX(x: number): void;
  getY(): number;
  setY(y: number): void;
  getIdentifier(): number;
  setIdentifier(id: number): void;
  getPressure(): number;
  setPressure(pressure: number): void;
  getTouchMajor(): number;
  setTouchMajor(major: number): void;
  getTouchMinor(): number;
  setTouchMinor(minor: number): void;
}

export class TouchEvent {
  getTouchesList(): Touch[];
  setTouchesList(touches: Touch[]): void;
  serializeBinary(): Uint8Array;
}

declare const Proto: {
  MouseEvent: typeof MouseEvent;
  KeyboardEvent: typeof KeyboardEvent;
  Touch: typeof Touch;
  TouchEvent: typeof TouchEvent;
};

export default Proto;

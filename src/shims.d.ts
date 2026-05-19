declare module 'react' {
  export type ReactNode = unknown;
  export type SetStateAction<S> = S | ((previousState: S) => S);
  export type Dispatch<A> = (value: A) => void;

  export interface MutableRefObject<T> {
    current: T;
  }

  export interface MouseEvent<T = Element> {
    currentTarget: T;
    clientX: number;
    clientY: number;
    stopPropagation(): void;
    preventDefault(): void;
  }

  export interface Touch {
    clientX: number;
    clientY: number;
  }

  export interface TouchEvent<T = Element> {
    currentTarget: T;
    touches: Touch[];
    stopPropagation(): void;
    preventDefault(): void;
  }

  export function useState<S>(initialState: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: readonly unknown[]): T;
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  export function useRef<T>(initialValue: T): MutableRefObject<T>;
  export function useRef<T>(initialValue: T | null): MutableRefObject<T | null>;

  const React: {
    StrictMode: (props: { children?: ReactNode }) => unknown;
  };

  export default React;
}

declare module 'react/jsx-runtime' {
  export const Fragment: unique symbol;
  export function jsx(type: unknown, props: unknown, key?: unknown): unknown;
  export function jsxs(type: unknown, props: unknown, key?: unknown): unknown;
}

declare module 'react-dom/client' {
  const ReactDOM: {
    createRoot(element: Element): {
      render(node: unknown): void;
    };
  };

  export default ReactDOM;
}

declare module 'yjs' {
  export class Doc {
    clientID: number;
    getArray<T>(name: string): Array<T>;
    destroy(): void;
  }

  export class Array<T> {
    push(content: T[]): void;
    toArray(): T[];
    observe(listener: () => void): void;
    unobserve(listener: () => void): void;
  }
}

declare module 'y-protocols/awareness' {
  export interface Awareness {
    getStates(): Map<number, unknown>;
    setLocalState(state: unknown): void;
    setLocalStateField(key: string, value: unknown): void;
    on(eventName: 'change', listener: () => void): void;
    off(eventName: 'change', listener: () => void): void;
  }
}

declare module 'y-webrtc' {
  import type { Awareness } from 'y-protocols/awareness';

  export class WebrtcProvider {
    awareness: Awareness;
    constructor(roomName: string, doc: unknown, options?: unknown);
    on(eventName: 'status', listener: (event: { status: 'connected' | 'disconnected' }) => void): void;
    destroy(): void;
  }
}

declare namespace JSX {
  interface IntrinsicElements {
    div: any;
    h1: any;
    h2: any;
    h3: any;
    p: any;
    span: any;
    button: any;
    svg: any;
    path: any;
  }
}

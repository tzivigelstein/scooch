// Live values during a pointer gesture (drag or resize), kept outside React:
// the parts that preview them (selection frame, properties) subscribe
// directly, so moving the pointer never re-renders components.

import { createStore } from 'zustand/vanilla';
import type { Piece } from './document.ts';

export interface GestureState {
  /** Copies of the pieces being moved or resized, with their live values; null outside a gesture. */
  drafts: readonly Piece[] | null;
  /** A gesture moved past the drag threshold. */
  dragging: boolean;
  /** That gesture moves pieces (with «Imán», onto the grid). */
  moving: boolean;
}

export const gestureStore = createStore<GestureState>()(() => ({ drafts: null, dragging: false, moving: false }));

export const isDragging = () => gestureStore.getState().dragging;

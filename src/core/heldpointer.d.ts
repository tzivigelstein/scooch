/** What a gesture keeps of the press that started it. */
export interface HeldPointer {
  pointerId: number;
  pointerType: string;
  /** The bit of its button in PointerEvent.buttons. */
  bit: number;
}

type PointerFields = Pick<PointerEvent, 'type' | 'pointerId' | 'pointerType' | 'isPrimary' | 'buttons'>;

/** What a gesture keeps of the press that started it: the pointer and the bit of its button. */
export function heldPointer(press: Pick<PointerEvent, 'pointerId' | 'pointerType' | 'button'>): HeldPointer;

/** Does `e` (a move or a press; other events say nothing) show that `held` was let go unseen? */
export function letGo(held: HeldPointer, e: PointerFields): boolean;

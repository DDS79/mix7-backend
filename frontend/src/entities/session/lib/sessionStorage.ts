'use client';

export type RuntimeSessionState = {
  buyerRef: string;
  sessionId: string;
  actorId: string;
  authAccountId: string;
  trustLevel: string;
  sessionType?: string;
  sessionStatus?: string;
};

const SESSION_STORAGE_KEY = 'mix7.phase1.session';
const CHECKOUT_STORAGE_KEY = 'mix7.phase1.pendingCheckout';
export const SESSION_STATE_CHANGED_EVENT = 'mix7:session-state-changed';

export type PendingCheckoutContext = {
  orderId: string;
  eventSlug: string;
  totalMinor: number;
  currency: string;
};

function getStorage() {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.sessionStorage;
}

export function readSessionState(): RuntimeSessionState | null {
  const storage = getStorage();
  const raw = storage?.getItem(SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as RuntimeSessionState;
  } catch {
    return null;
  }
}

export function writeSessionState(value: RuntimeSessionState) {
  getStorage()?.setItem(SESSION_STORAGE_KEY, JSON.stringify(value));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SESSION_STATE_CHANGED_EVENT, { detail: value }));
  }
}

export function clearSessionState() {
  getStorage()?.removeItem(SESSION_STORAGE_KEY);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SESSION_STATE_CHANGED_EVENT, { detail: null }));
  }
}

export function readPendingCheckout(orderId: string): PendingCheckoutContext | null {
  const storage = getStorage();
  const raw = storage?.getItem(CHECKOUT_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const value = JSON.parse(raw) as PendingCheckoutContext;
    return value.orderId === orderId ? value : null;
  } catch {
    return null;
  }
}

export function writePendingCheckout(value: PendingCheckoutContext) {
  getStorage()?.setItem(CHECKOUT_STORAGE_KEY, JSON.stringify(value));
}

export function clearPendingCheckout(orderId: string) {
  const current = readPendingCheckout(orderId);
  if (current) {
    getStorage()?.removeItem(CHECKOUT_STORAGE_KEY);
  }
}

'use client';

import { useEffect, useState } from 'react';

import {
  readSessionState,
  SESSION_STATE_CHANGED_EVENT,
  type RuntimeSessionState,
} from '@/entities/session/lib/sessionStorage';

export function useRuntimeSessionState() {
  const [session, setSession] = useState<RuntimeSessionState | null>(null);

  useEffect(() => {
    setSession(readSessionState());

    function refreshFromStorage() {
      setSession(readSessionState());
    }

    window.addEventListener(SESSION_STATE_CHANGED_EVENT, refreshFromStorage);
    window.addEventListener('storage', refreshFromStorage);

    return () => {
      window.removeEventListener(SESSION_STATE_CHANGED_EVENT, refreshFromStorage);
      window.removeEventListener('storage', refreshFromStorage);
    };
  }, []);

  return session;
}

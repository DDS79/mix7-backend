'use client';

import { useEffect, useState } from 'react';

import { issueAnonymousSession } from '@/entities/session/api/session.api';
import {
  readSessionState,
  type RuntimeSessionState,
  writeSessionState,
} from '@/entities/session/lib/sessionStorage';

function ensureBuyerRef() {
  const existing = readSessionState();
  if (existing?.buyerRef) {
    return existing.buyerRef;
  }

  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `buyer-${Date.now()}`;
}

export function useSessionBootstrap() {
  const [state, setState] = useState<RuntimeSessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const existing = readSessionState();
        if (existing) {
          if (active) {
            setState(existing);
            setLoading(false);
          }
          return;
        }

        const buyerRef = ensureBuyerRef();
        const response = await issueAnonymousSession(buyerRef);
        const nextState: RuntimeSessionState = {
          buyerRef,
          sessionId: response.data.sessionId,
          actorId: response.data.actorId,
          authAccountId: response.data.authAccountId,
          trustLevel: response.data.trustLevel,
          sessionType: response.data.sessionType,
          sessionStatus: response.data.sessionStatus,
        };
        writeSessionState(nextState);

        if (active) {
          setState(nextState);
          setLoading(false);
        }
      } catch (nextError) {
        if (active) {
          setError(nextError instanceof Error ? nextError.message : 'Session bootstrap failed.');
          setLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  return {
    session: state,
    loading,
    error,
  };
}

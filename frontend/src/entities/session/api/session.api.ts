import { apiRequest } from '@/shared/api/client';

export type IssueSessionResponse = {
  ok: true;
  data: {
    actorId: string;
    authAccountId: string;
    sessionId: string;
    sessionType: string;
    sessionStatus: string;
    trustLevel: string;
  };
};

export async function issueAnonymousSession(buyerRef: string) {
  return apiRequest<IssueSessionResponse>({
    path: '/session/issue',
    method: 'POST',
    body: {
      buyerRef,
      authType: 'anonymous',
      authStatus: 'provisional',
      loginRef: `guest-${buyerRef}`,
      trustLevel: 'provisional',
    },
  });
}

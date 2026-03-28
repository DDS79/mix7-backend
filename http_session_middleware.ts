import { runtimeErrorResponse, resolveHttpRuntimeContext } from './http_runtime';
import type { RegistrationPolicyAction } from './product_auth_session_identity_trust';

export async function withRuntimeActorContext<T>(args: {
  request: Request;
  action: RegistrationPolicyAction;
  handler: (context: Awaited<ReturnType<typeof resolveHttpRuntimeContext>>) => Promise<T>;
  toResponse: (value: T) => Response;
}): Promise<Response> {
  let context: Awaited<ReturnType<typeof resolveHttpRuntimeContext>>;

  try {
    context = await resolveHttpRuntimeContext({
      request: args.request,
      action: args.action,
    });
  } catch (error) {
    return runtimeErrorResponse(error);
  }

  const value = await args.handler(context);
  return args.toResponse(value);
}

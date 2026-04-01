export type ApiErrorDetails = Array<{
  field: string;
  message: string;
}>;

export type ApiErrorPayload = {
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetails;
  };
};

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: ApiErrorDetails;

  constructor(args: {
    code: string;
    message: string;
    status: number;
    details?: ApiErrorDetails;
  }) {
    super(args.message);
    this.name = 'ApiError';
    this.code = args.code;
    this.status = args.status;
    this.details = args.details;
  }
}

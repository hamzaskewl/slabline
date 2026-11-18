import { ApiError, SdkError } from "@gemini-markets/sdk/server";

/** Public-read diagnostics only. Never log provider bodies, headers or credentials. */
export function publicProviderError(error: unknown) {
  const safeCode = (value: unknown) =>
    typeof value === "string" && /^[A-Za-z0-9_.-]{1,100}$/.test(value)
      ? value
      : undefined;
  return {
    name: error instanceof Error ? safeCode(error.name) : "UnknownError",
    ...(error instanceof ApiError
      ? {
          status: error.status,
          reason: safeCode(error.reason),
          code: safeCode(error.code),
        }
      : {}),
    ...(error instanceof SdkError
      ? {
          operation: safeCode(error.operationContext?.operation),
          responseTooLarge:
            /^HTTP response exceeded the configured \d+-byte limit$/.test(
              error.message,
            ) || undefined,
        }
      : {}),
  };
}

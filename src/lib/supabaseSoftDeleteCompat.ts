/**
 * Read paths that add `.eq('is_deleted', false)` should retry once without that filter
 * when the first attempt fails: missing `is_deleted` often surfaces as HTTP 400 with a
 * sparse PostgREST error body, so we do not try to classify the failure.
 */
export function shouldRetryReadWithoutIsDeletedFilter(error: unknown): boolean {
  return error != null;
}

/** Only explicitly rejected requests are known not to have been accepted. Raw
 * provider errors never reach the journal or browser. Unknown failures are uncertain. */
export class DeliveryError extends Error {
  constructor(
    readonly outcome: 'retryable' | 'rejected' | 'uncertain',
    readonly retryAfterMs = 0,
  ) {
    super(`Notification delivery ${outcome}`);
  }
}

export const retryWindowMs = 23 * 60 * 60 * 1000;
export const maxDeliveryAttempts = 5;

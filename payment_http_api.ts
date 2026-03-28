import {
  CheckoutPaymentConfirmDomainError,
  type ConfirmPaymentInput,
  type ConfirmPaymentResult,
} from './payment_confirm';
import {
  CheckoutPaymentIntentDomainError,
  type InitiatePaymentIntentInput,
  type InitiatePaymentIntentResult,
} from './payment_intent';
import {
  runtimeConfirmPayment,
  runtimeInitiatePaymentIntent,
} from './payment_runtime_store';

export {
  CheckoutPaymentConfirmDomainError,
  CheckoutPaymentIntentDomainError,
};

export async function initiatePaymentIntent(
  input: InitiatePaymentIntentInput,
): Promise<InitiatePaymentIntentResult> {
  return runtimeInitiatePaymentIntent(input);
}

export async function confirmPayment(
  input: ConfirmPaymentInput,
): Promise<ConfirmPaymentResult> {
  return runtimeConfirmPayment(input);
}

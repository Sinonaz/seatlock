ALTER TABLE "payments" ALTER COLUMN "stripeCheckoutSessionId" DROP NOT NULL;
ALTER TABLE "payments" ADD COLUMN "checkoutRequest" JSONB;
ALTER TABLE "payments" ADD COLUMN "refundRequested" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "payments_refundRequested_status_idx" ON "payments"("refundRequested", "status");

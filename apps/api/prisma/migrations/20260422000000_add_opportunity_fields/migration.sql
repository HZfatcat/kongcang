-- Add missing columns to BusinessOpportunity table
ALTER TABLE "BusinessOpportunity" ADD COLUMN IF NOT EXISTS "username" TEXT;
ALTER TABLE "BusinessOpportunity" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "BusinessOpportunity" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "BusinessOpportunity" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "BusinessOpportunity" ADD COLUMN IF NOT EXISTS "companyName" TEXT;
ALTER TABLE "BusinessOpportunity" ADD COLUMN IF NOT EXISTS "requestType" TEXT;
ALTER TABLE "BusinessOpportunity" ADD COLUMN IF NOT EXISTS "requestDetails" TEXT;
ALTER TABLE "BusinessOpportunity" ADD COLUMN IF NOT EXISTS "feedbackChannel" TEXT;
ALTER TABLE "BusinessOpportunity" ADD COLUMN IF NOT EXISTS "feedbackPerson" TEXT;
ALTER TABLE "BusinessOpportunity" ADD COLUMN IF NOT EXISTS "feedbackResult" TEXT;

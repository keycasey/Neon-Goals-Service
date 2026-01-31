-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ItemCategory" ADD VALUE 'vehicle_parts';
ALTER TYPE "ItemCategory" ADD VALUE 'technology';
ALTER TYPE "ItemCategory" ADD VALUE 'sporting_goods';
ALTER TYPE "ItemCategory" ADD VALUE 'clothing';
ALTER TYPE "ItemCategory" ADD VALUE 'pets';

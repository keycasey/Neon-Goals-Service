-- CreateTable
CREATE TABLE "PlaidSecurity" (
    "id" TEXT NOT NULL,
    "securityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tickerSymbol" TEXT,
    "type" TEXT,
    "closePrice" DOUBLE PRECISION,
    "closePriceAsOf" TIMESTAMP(3),
    "currency" TEXT DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaidSecurity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaidInvestmentHolding" (
    "id" TEXT NOT NULL,
    "plaidAccountId" TEXT NOT NULL,
    "plaidSecurityId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "institutionPrice" DOUBLE PRECISION,
    "institutionPriceAsOf" TIMESTAMP(3),
    "institutionValue" DOUBLE PRECISION,
    "costBasis" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "lastSync" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaidInvestmentHolding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaidInvestmentTransaction" (
    "id" TEXT NOT NULL,
    "plaidAccountId" TEXT NOT NULL,
    "investmentTransactionId" TEXT NOT NULL,
    "plaidSecurityId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "quantity" DOUBLE PRECISION,
    "fees" DOUBLE PRECISION,
    "price" DOUBLE PRECISION,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "subtype" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "lastSync" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaidInvestmentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlaidSecurity_securityId_key" ON "PlaidSecurity"("securityId");

-- CreateIndex
CREATE INDEX "PlaidSecurity_tickerSymbol_idx" ON "PlaidSecurity"("tickerSymbol");

-- CreateIndex
CREATE UNIQUE INDEX "PlaidInvestmentHolding_plaidAccountId_plaidSecurityId_key" ON "PlaidInvestmentHolding"("plaidAccountId", "plaidSecurityId");

-- CreateIndex
CREATE INDEX "PlaidInvestmentHolding_plaidAccountId_idx" ON "PlaidInvestmentHolding"("plaidAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaidInvestmentTransaction_plaidAccountId_investmentTransactionI_key" ON "PlaidInvestmentTransaction"("plaidAccountId", "investmentTransactionId");

-- CreateIndex
CREATE INDEX "PlaidInvestmentTransaction_plaidAccountId_date_idx" ON "PlaidInvestmentTransaction"("plaidAccountId", "date");

-- AddForeignKey
ALTER TABLE "PlaidInvestmentHolding" ADD CONSTRAINT "PlaidInvestmentHolding_plaidAccountId_fkey" FOREIGN KEY ("plaidAccountId") REFERENCES "PlaidAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidInvestmentHolding" ADD CONSTRAINT "PlaidInvestmentHolding_plaidSecurityId_fkey" FOREIGN KEY ("plaidSecurityId") REFERENCES "PlaidSecurity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidInvestmentTransaction" ADD CONSTRAINT "PlaidInvestmentTransaction_plaidAccountId_fkey" FOREIGN KEY ("plaidAccountId") REFERENCES "PlaidAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaidInvestmentTransaction" ADD CONSTRAINT "PlaidInvestmentTransaction_plaidSecurityId_fkey" FOREIGN KEY ("plaidSecurityId") REFERENCES "PlaidSecurity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

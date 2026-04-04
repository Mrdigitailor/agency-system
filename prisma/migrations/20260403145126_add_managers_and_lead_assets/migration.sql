-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_clients" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "manager" TEXT NOT NULL DEFAULT '',
    "campaignManager" TEXT NOT NULL DEFAULT '',
    "campaignManagerId" TEXT,
    "accountManager" TEXT NOT NULL DEFAULT '',
    "accountManagerId" TEXT,
    "platforms" TEXT NOT NULL DEFAULT '[]',
    "monthlyBudget" REAL NOT NULL DEFAULT 0,
    "clientType" TEXT NOT NULL DEFAULT 'לידים',
    "status" TEXT NOT NULL DEFAULT 'active',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    "metaAdAccount" TEXT NOT NULL DEFAULT '',
    "googleAdAccount" TEXT NOT NULL DEFAULT '',
    "tiktokAdAccount" TEXT NOT NULL DEFAULT '',
    "facebookPage" TEXT NOT NULL DEFAULT '',
    "instagram" TEXT NOT NULL DEFAULT '',
    "linkedin" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "budgetUsed" REAL NOT NULL DEFAULT 0,
    "avgCostPerConversion" REAL NOT NULL DEFAULT 0,
    "targetCostPerConversion" REAL NOT NULL DEFAULT 0,
    "conversionsThisMonth" INTEGER NOT NULL DEFAULT 0,
    "targetConversions" INTEGER NOT NULL DEFAULT 0,
    "lastOptimization" TEXT NOT NULL DEFAULT '',
    "managerId" TEXT,
    CONSTRAINT "clients_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_clients" ("avgCostPerConversion", "budgetUsed", "clientType", "contactEmail", "contactPhone", "conversionsThisMonth", "createdAt", "deletedAt", "facebookPage", "googleAdAccount", "id", "instagram", "lastOptimization", "linkedin", "manager", "managerId", "metaAdAccount", "monthlyBudget", "name", "notes", "platforms", "status", "targetConversions", "targetCostPerConversion", "tiktokAdAccount", "updatedAt", "website") SELECT "avgCostPerConversion", "budgetUsed", "clientType", "contactEmail", "contactPhone", "conversionsThisMonth", "createdAt", "deletedAt", "facebookPage", "googleAdAccount", "id", "instagram", "lastOptimization", "linkedin", "manager", "managerId", "metaAdAccount", "monthlyBudget", "name", "notes", "platforms", "status", "targetConversions", "targetCostPerConversion", "tiktokAdAccount", "updatedAt", "website" FROM "clients";
DROP TABLE "clients";
ALTER TABLE "new_clients" RENAME TO "clients";
CREATE TABLE "new_leads" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "company" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "digitalAssets" TEXT NOT NULL DEFAULT '',
    "leadFacebookPage" TEXT NOT NULL DEFAULT '',
    "leadInstagram" TEXT NOT NULL DEFAULT '',
    "leadLinkedin" TEXT NOT NULL DEFAULT '',
    "leadTiktok" TEXT NOT NULL DEFAULT '',
    "leadGoogleAds" TEXT NOT NULL DEFAULT '',
    "leadMetaAds" TEXT NOT NULL DEFAULT '',
    "estimatedBudget" TEXT NOT NULL DEFAULT '',
    "salesPerson" TEXT NOT NULL DEFAULT '',
    "interestedServices" TEXT NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL DEFAULT 'other',
    "status" TEXT NOT NULL DEFAULT 'new',
    "value" REAL NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "nextFollowUp" TEXT NOT NULL DEFAULT '',
    "hasProposal" BOOLEAN NOT NULL DEFAULT false,
    "proposalDate" TEXT NOT NULL DEFAULT '',
    "proposalFileName" TEXT NOT NULL DEFAULT '',
    "internalNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "clientId" TEXT,
    CONSTRAINT "leads_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_leads" ("clientId", "company", "createdAt", "digitalAssets", "email", "estimatedBudget", "hasProposal", "id", "interestedServices", "internalNotes", "name", "nextFollowUp", "notes", "phone", "proposalDate", "proposalFileName", "salesPerson", "source", "status", "updatedAt", "value", "website") SELECT "clientId", "company", "createdAt", "digitalAssets", "email", "estimatedBudget", "hasProposal", "id", "interestedServices", "internalNotes", "name", "nextFollowUp", "notes", "phone", "proposalDate", "proposalFileName", "salesPerson", "source", "status", "updatedAt", "value", "website" FROM "leads";
DROP TABLE "leads";
ALTER TABLE "new_leads" RENAME TO "leads";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

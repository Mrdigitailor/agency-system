// שליפת הנכסים הזמינים למשתמש ב-Meta

import { metaApiGetAll } from "./client";

export interface MetaAdAccount {
  id: string; // act_XXXXX
  name: string;
  account_id: string;
  currency: string;
  account_status: number;
  business?: { id: string; name: string };
}

export interface MetaPage {
  id: string;
  name: string;
  access_token: string;
  category: string;
  followers_count?: number;
  instagram_business_account?: { id: string };
}

export interface MetaInstagramAccount {
  id: string;
  username: string;
  name?: string;
  followers_count?: number;
  profile_picture_url?: string;
}

export async function fetchAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  return metaApiGetAll<MetaAdAccount>("/me/adaccounts", {
    accessToken,
    params: { fields: "id,name,account_id,currency,account_status,business" },
  });
}

export async function fetchPages(accessToken: string): Promise<MetaPage[]> {
  return metaApiGetAll<MetaPage>("/me/accounts", {
    accessToken,
    params: { fields: "id,name,access_token,category,followers_count,instagram_business_account" },
  });
}

/**
 * שליפת חשבונות אינסטגרם מחוברים לעמודים
 */
export async function fetchInstagramAccounts(pages: MetaPage[], accessToken: string): Promise<MetaInstagramAccount[]> {
  const results: MetaInstagramAccount[] = [];
  const { metaApiGet } = await import("./client");

  for (const page of pages) {
    if (!page.instagram_business_account?.id) continue;
    try {
      const ig = await metaApiGet<MetaInstagramAccount>(`/${page.instagram_business_account.id}`, {
        accessToken: page.access_token || accessToken,
        params: { fields: "id,username,name,followers_count,profile_picture_url" },
      });
      results.push(ig);
    } catch (err) {
      console.warn(`[Meta] Failed to fetch IG for page ${page.id}:`, err);
    }
  }

  return results;
}

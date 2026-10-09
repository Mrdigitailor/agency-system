# מתכוני Google Ads לסוכן

כל הפעולות נעשות דרך הכלי `gads` (ראה `bin/gads`). הכלי שולח את הבקשה למערכת, והמערכת מבצעת אותה ב-Google Ads API (REST).
לפני כל `mutate` מריצים `validate` על אותו קובץ. רק אם עבר, מבצעים.

בכל הדוגמאות `CID` הוא מספר החשבון בלי מקפים. כסף נכתב ב-micros: 1 ₪ = 1,000,000.

מעקות שהמערכת אוכפת, ואין טעם לנסות לעקוף:
- קמפיין נוצר תמיד במצב PAUSED.
- הסוכן לא מדליק קמפיין ולא מוחק קמפיין.
- אפשר לפעול רק בחשבונות של המשפך.

## 1. מה כבר יש בחשבון (קריאה)

```
gads search CID "SELECT campaign.id, campaign.name, campaign.status FROM campaign WHERE campaign.status != 'REMOVED'"
gads search CID "SELECT conversion_action.resource_name, conversion_action.name, conversion_action.status, conversion_action.primary_for_goal FROM conversion_action"
gads search CID "SELECT customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer"
```

## 2. תקציב (service: campaignBudgets)

תקציב יומי = תקציב חודשי חלקי 30.4.

```json
[{ "create": { "name": "משפך | תקציב", "amountMicros": "131000000", "deliveryMethod": "STANDARD", "explicitlyShared": false } }]
```

התשובה מחזירה `resourceName` של התקציב. צריך אותו לקמפיין.

## 3. קמפיין חיפוש (service: campaigns)

מקסימום קליקים עם תקרת מחיר לקליק נכתב כ-`targetSpend` עם `cpcBidCeilingMicros`.

```json
[{ "create": {
  "name": "משפך | חיפוש | <מוצר>",
  "status": "PAUSED",
  "advertisingChannelType": "SEARCH",
  "campaignBudget": "customers/CID/campaignBudgets/BUDGET_ID",
  "targetSpend": { "cpcBidCeilingMicros": "9000000" },
  "networkSettings": { "targetGoogleSearch": true, "targetSearchNetwork": false, "targetContentNetwork": false, "targetPartnerSearchNetwork": false },
  "geoTargetTypeSetting": { "positiveGeoTargetType": "PRESENCE", "negativeGeoTargetType": "PRESENCE" },
  "finalUrlSuffix": "utm_source=google&utm_medium=cpc&utm_campaign=<שם קצר באנגלית>&utm_term={keyword}",
  "containsEuPoliticalAdvertising": "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING"
} }]
```

אם ה-API דוחה שדה (גרסאות משתנות), קוראים את הודעת השגיאה, מתקנים ומריצים שוב `validate`.

## 4. מיקום ושפה (service: campaignCriteria)

ישראל = `geoTargetConstants/2376`. עברית = `languageConstants/1027`. אנגלית = `languageConstants/1000`.
לאזור בתוך ישראל מחפשים את הקוד:

```
gads search CID "SELECT geo_target_constant.resource_name, geo_target_constant.name, geo_target_constant.target_type FROM geo_target_constant WHERE geo_target_constant.country_code = 'IL' AND geo_target_constant.name LIKE '%Haifa%'"
```

```json
[
  { "create": { "campaign": "customers/CID/campaigns/CAMPAIGN_ID", "location": { "geoTargetConstant": "geoTargetConstants/2376" } } },
  { "create": { "campaign": "customers/CID/campaigns/CAMPAIGN_ID", "language": { "languageConstant": "languageConstants/1027" } } }
]
```

## 5. שלילות ברמת הקמפיין (service: campaignCriteria)

```json
[{ "create": { "campaign": "customers/CID/campaigns/CAMPAIGN_ID", "negative": true, "keyword": { "text": "חינם", "matchType": "PHRASE" } } }]
```

`matchType`: `EXACT` למונח בודד, `PHRASE` למילה שחוסמת כל מה שמכיל אותה.

## 6. קבוצת מודעות (service: adGroups)

```json
[{ "create": { "name": "<מוצר>", "campaign": "customers/CID/campaigns/CAMPAIGN_ID", "status": "ENABLED", "type": "SEARCH_STANDARD" } }]
```

## 7. מילות חיפוש (service: adGroupCriteria)

```json
[{ "create": { "adGroup": "customers/CID/adGroups/ADGROUP_ID", "status": "ENABLED", "keyword": { "text": "פרסום בגוגל לעסקים", "matchType": "PHRASE" } } }]
```

## 8. מודעת חיפוש רספונסיבית (service: adGroupAds)

כותרת עד 30 תווים, תיאור עד 90 תווים. לפחות 3 כותרות ו-2 תיאורים, עד 15 ו-4. לספור תווים לפני השליחה.

```json
[{ "create": {
  "adGroup": "customers/CID/adGroups/ADGROUP_ID",
  "status": "ENABLED",
  "ad": {
    "finalUrls": ["https://example.co.il/lp"],
    "responsiveSearchAd": {
      "headlines": [ { "text": "כותרת ראשונה" }, { "text": "כותרת שנייה" }, { "text": "כותרת שלישית" } ],
      "descriptions": [ { "text": "תיאור ראשון." }, { "text": "תיאור שני." } ],
      "path1": "בדיקה", "path2": "חינם"
    }
  }
} }]
```

## 9. תוספים: קישורי אתר ויתרונות (services: assets, campaignAssets)

קודם יוצרים את הנכס, אחר כך מקשרים אותו לקמפיין. תוסף שיחת טלפון לא יוצרים.

קישור אתר (טקסט עד 25 תווים, כל שורת תיאור עד 35):
```json
[{ "create": { "finalUrls": ["https://example.co.il/lp"], "sitelinkAsset": { "linkText": "איך זה עובד", "description1": "שתי דקות בצ'אט", "description2": "ודוח עם המספרים שלכם" } } }]
```

יתרון (עד 25 תווים):
```json
[{ "create": { "calloutAsset": { "calloutText": "בלי התחייבות" } } }]
```

קישור לקמפיין (service: campaignAssets), `fieldType` הוא `SITELINK` או `CALLOUT`:
```json
[{ "create": { "campaign": "customers/CID/campaigns/CAMPAIGN_ID", "asset": "customers/CID/assets/ASSET_ID", "fieldType": "SITELINK" } }]
```

## 10. יעד המרה ספציפי לקמפיין

מטרה: שהקמפיין יספור ויכוון רק להמרת "השאיר פרטים" של המשפך, ולא להמרות ישנות בחשבון.

1. יוצרים יעד מותאם (service: customConversionGoals):
```json
[{ "create": { "name": "משפך | השאיר פרטים", "conversionActions": ["customers/CID/conversionActions/ACTION_ID"], "status": "ENABLED" } }]
```
2. מחילים אותו על הקמפיין (service: conversionGoalCampaignConfigs):
```json
[{ "update": { "resourceName": "customers/CID/conversionGoalCampaignConfigs/CAMPAIGN_ID", "goalConfigLevel": "CAMPAIGN", "customConversionGoal": "customers/CID/customConversionGoals/GOAL_ID" }, "updateMask": "goalConfigLevel,customConversionGoal" }]
```

אם השלב הזה נכשל אחרי שני ניסיונות, לא נתקעים: מדווחים עליו בדוח ההקמה כפעולה שנשארה לבעל החשבון.

## 11. בדיקה בסוף

```
gads search CID "SELECT campaign.name, campaign.status, campaign_budget.amount_micros, campaign.target_spend.cpc_bid_ceiling_micros, campaign.final_url_suffix FROM campaign WHERE campaign.id = CAMPAIGN_ID"
gads search CID "SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type FROM ad_group_criterion WHERE campaign.id = CAMPAIGN_ID AND ad_group_criterion.type = 'KEYWORD'"
gads search CID "SELECT ad_group_ad.ad.id, ad_group_ad.policy_summary.approval_status FROM ad_group_ad WHERE campaign.id = CAMPAIGN_ID"
```

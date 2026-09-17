export interface NavItem {
  label: string;
  href: string;
  icon: string;
  roles: string[];
  /** פריט שמוצג רק כשקיים המשאב — למשל דוח מדיה, שיש רק לחלק מהלקוחות */
  requires?: "mediaReport";
}

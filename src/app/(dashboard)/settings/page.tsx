"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Plus, Pencil, Trash2, Globe, KeyRound, Copy, Check } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { useApp } from "@/lib/data/context";
import type { Employee, AgencyDigitalAssets } from "@/lib/data/types";

const roleOptions = [
  { value: "admin", label: "בעלים" },
  { value: "manager", label: "סמנכ״ל / מנהל תיקים" },
  { value: "campaignManager", label: "מנהל קמפיינים" },
  { value: "client", label: "לקוח קצה" },
];

function generatePassword(length = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export default function SettingsPage() {
  const {
    settings, updateSettings,
    employees, addEmployee, updateEmployee, deleteEmployee,
    clients, refreshEmployees,
  } = useApp();
  const { data: session, update: updateSession } = useSession();

  // המשתמש המחובר מ-DB
  const currentUser = employees.find((e) => e.email === session?.user?.email);

  // פרופיל
  const [profileForm, setProfileForm] = useState({
    name: "",
    email: "",
    phone: "",
  });
  const [savedProfile, setSavedProfile] = useState(false);

  // סנכרון טופס פרופיל עם המשתמש המחובר
  useEffect(() => {
    if (currentUser) {
      setProfileForm({
        name: currentUser.name,
        email: currentUser.email,
        phone: currentUser.phone,
      });
    }
  }, [currentUser]);

  // סוכנות
  const [agencyForm, setAgencyForm] = useState({ agencyName: "" });
  const [savedAgency, setSavedAgency] = useState(false);

  // סנכרון טופס סוכנות
  useEffect(() => {
    setAgencyForm({ agencyName: settings.agencyName });
  }, [settings.agencyName]);

  // נכסים דיגיטליים
  const [assetsForm, setAssetsForm] = useState<AgencyDigitalAssets>({
    googleMyBusiness: "",
    facebookPage: "",
    instagram: "",
    linkedin: "",
    metaAdAccount: "",
    googleAdAccount: "",
    tiktokAdAccount: "",
    googleAnalytics: "",
  });
  const [savedAssets, setSavedAssets] = useState(false);

  // סנכרון טופס נכסים
  useEffect(() => {
    if (settings.agencyAssets) setAssetsForm(settings.agencyAssets);
  }, [settings.agencyAssets]);

  // עובדים
  const [isEmpModalOpen, setIsEmpModalOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [empForm, setEmpForm] = useState({
    name: "",
    email: "",
    phone: "",
    role: "campaignManager",
    assignedClientIds: [] as string[],
    password: "",
    sendEmail: true,
  });

  // מודל פרטי כניסה לאחר יצירה
  const [credentialsModal, setCredentialsModal] = useState(false);
  const [createdEmail, setCreatedEmail] = useState("");
  const [createdPassword, setCreatedPassword] = useState("");
  const [createdSendEmail, setCreatedSendEmail] = useState(false);
  const [copiedCredentials, setCopiedCredentials] = useState(false);

  // איפוס סיסמה
  const [resetPasswordModal, setResetPasswordModal] = useState(false);
  const [resetEmp, setResetEmp] = useState<Employee | null>(null);
  const [resetPasswordForm, setResetPasswordForm] = useState({
    newPassword: "",
    sendEmail: true,
  });
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetError, setResetError] = useState("");

  // שינוי סיסמה עצמית
  const [changePasswordForm, setChangePasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [changePasswordSuccess, setChangePasswordSuccess] = useState(false);
  const [changePasswordError, setChangePasswordError] = useState("");

  const handleSaveProfile = async () => {
    if (!currentUser) return;
    const res = await fetch(`/api/employees/${currentUser.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: profileForm.name,
        email: profileForm.email,
        phone: profileForm.phone,
      }),
    });
    if (res.ok) {
      await refreshEmployees();
      // עדכון session עם השם החדש
      await updateSession({ name: profileForm.name });
      setSavedProfile(true);
      setTimeout(() => setSavedProfile(false), 2000);
    }
  };

  const handleSaveAgency = () => {
    updateSettings(agencyForm);
    setSavedAgency(true);
    setTimeout(() => setSavedAgency(false), 2000);
  };

  const handleSaveAssets = () => {
    updateSettings({ agencyAssets: assetsForm });
    setSavedAssets(true);
    setTimeout(() => setSavedAssets(false), 2000);
  };

  const openNewEmp = () => {
    setEditingEmp(null);
    setEmpForm({ name: "", email: "", phone: "", role: "campaignManager", assignedClientIds: [], password: generatePassword(), sendEmail: true });
    setIsEmpModalOpen(true);
  };

  const openEditEmp = (emp: Employee) => {
    setEditingEmp(emp);
    setEmpForm({
      name: emp.name,
      email: emp.email,
      phone: emp.phone,
      role: emp.role,
      assignedClientIds: emp.assignedClientIds,
      password: "",
      sendEmail: true,
    });
    setIsEmpModalOpen(true);
  };

  const handleToggleClient = (clientId: string) => {
    setEmpForm((prev) => ({
      ...prev,
      assignedClientIds: prev.assignedClientIds.includes(clientId)
        ? prev.assignedClientIds.filter((id) => id !== clientId)
        : [...prev.assignedClientIds, clientId],
    }));
  };

  const handleSubmitEmp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empForm.name.trim() || !empForm.email.trim()) return;

    if (editingEmp) {
      updateEmployee(editingEmp.id, {
        name: empForm.name,
        email: empForm.email,
        phone: empForm.phone,
        role: empForm.role,
        assignedClientIds: empForm.assignedClientIds,
      });
      setIsEmpModalOpen(false);
    } else {
      // יצירת עובד חדש עם סיסמה — קריאה ישירה ל-API
      try {
        const res = await fetch("/api/employees", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: empForm.name,
            email: empForm.email,
            phone: empForm.phone,
            role: empForm.role,
            assignedClientIds: empForm.assignedClientIds,
            password: empForm.password,
            sendEmail: empForm.sendEmail,
          }),
        });

        if (!res.ok) throw new Error("Failed to create employee");

        await refreshEmployees();

        // שמירת פרטי הכניסה להצגה
        setCreatedEmail(empForm.email);
        setCreatedPassword(empForm.password);
        setCreatedSendEmail(empForm.sendEmail);
        setCopiedCredentials(false);

        setIsEmpModalOpen(false);
        setCredentialsModal(true);
      } catch {
        // fallback — ניסיון דרך ה-context
        addEmployee({
          name: empForm.name,
          email: empForm.email,
          phone: empForm.phone,
          role: empForm.role,
          assignedClientIds: empForm.assignedClientIds,
        });
        setIsEmpModalOpen(false);
      }
    }
  };

  const handleCopyCredentials = async () => {
    const text = `אימייל: ${createdEmail}\nסיסמה: ${createdPassword}`;
    await navigator.clipboard.writeText(text);
    setCopiedCredentials(true);
    setTimeout(() => setCopiedCredentials(false), 2000);
  };

  // איפוס סיסמה לעובד
  const openResetPassword = (emp: Employee) => {
    setResetEmp(emp);
    setResetPasswordForm({ newPassword: generatePassword(), sendEmail: true });
    setResetSuccess(false);
    setResetError("");
    setResetPasswordModal(true);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmp || !resetPasswordForm.newPassword.trim()) return;

    try {
      const res = await fetch(`/api/employees/${resetEmp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newPassword: resetPasswordForm.newPassword,
          sendEmail: resetPasswordForm.sendEmail,
        }),
      });

      if (!res.ok) throw new Error("Failed to reset password");

      setResetSuccess(true);
      setResetError("");
    } catch {
      setResetError("שגיאה באיפוס הסיסמה. נסה שוב.");
    }
  };

  // שינוי סיסמה עצמית
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePasswordError("");
    setChangePasswordSuccess(false);

    if (changePasswordForm.newPassword !== changePasswordForm.confirmPassword) {
      setChangePasswordError("הסיסמאות אינן תואמות");
      return;
    }

    if (changePasswordForm.newPassword.length < 6) {
      setChangePasswordError("הסיסמה חייבת להכיל לפחות 6 תווים");
      return;
    }

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: changePasswordForm.currentPassword,
          newPassword: changePasswordForm.newPassword,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "שגיאה בשינוי הסיסמה");
      }

      setChangePasswordSuccess(true);
      setChangePasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setTimeout(() => setChangePasswordSuccess(false), 3000);
    } catch (err) {
      setChangePasswordError(err instanceof Error ? err.message : "שגיאה בשינוי הסיסמה");
    }
  };

  const inputClass =
    "w-full rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-sm text-brand-dark placeholder:text-brand-muted focus:border-brand-gold focus:bg-brand-light focus:outline-none focus:ring-1 focus:ring-brand-gold";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-brand-dark">הגדרות</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* פרופיל */}
        <div className="rounded-lg border border-brand-border bg-brand-light p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-brand-dark">פרטי פרופיל</h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">שם</label>
              <input type="text" value={profileForm.name} onChange={(e) => setProfileForm((p) => ({ ...p, name: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">אימייל</label>
              <input type="email" value={profileForm.email} onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))} className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">טלפון</label>
              <input type="tel" value={profileForm.phone} onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value }))} className={inputClass} placeholder="050-0000000" />
            </div>
            <button onClick={handleSaveProfile} className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-gold/80">
              {savedProfile ? "נשמר!" : "שמור פרופיל"}
            </button>
          </div>
        </div>

        {/* סוכנות */}
        <div className="rounded-lg border border-brand-border bg-brand-light p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-brand-dark">הגדרות סוכנות</h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">שם הסוכנות</label>
              <input type="text" value={agencyForm.agencyName} onChange={(e) => setAgencyForm((p) => ({ ...p, agencyName: e.target.value }))} className={inputClass} />
            </div>
            <button onClick={handleSaveAgency} className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-gold/80">
              {savedAgency ? "נשמר!" : "שמור הגדרות"}
            </button>
          </div>
        </div>
      </div>

      {/* שינוי סיסמה */}
      <div className="rounded-lg border border-brand-border bg-brand-light p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-brand-dark">שינוי סיסמה</h2>
        <form onSubmit={handleChangePassword} className="max-w-md space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-dark">סיסמה נוכחית</label>
            <input
              type="password"
              value={changePasswordForm.currentPassword}
              onChange={(e) => setChangePasswordForm((p) => ({ ...p, currentPassword: e.target.value }))}
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-dark">סיסמה חדשה</label>
            <input
              type="password"
              value={changePasswordForm.newPassword}
              onChange={(e) => setChangePasswordForm((p) => ({ ...p, newPassword: e.target.value }))}
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-dark">אישור סיסמה חדשה</label>
            <input
              type="password"
              value={changePasswordForm.confirmPassword}
              onChange={(e) => setChangePasswordForm((p) => ({ ...p, confirmPassword: e.target.value }))}
              className={inputClass}
              required
            />
          </div>
          {changePasswordError && (
            <p className="text-sm text-brand-danger">{changePasswordError}</p>
          )}
          {changePasswordSuccess && (
            <p className="text-sm text-brand-success">הסיסמה שונתה בהצלחה!</p>
          )}
          <button type="submit" className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-gold/80">
            שנה סיסמה
          </button>
        </form>
      </div>

      {/* נכסים דיגיטליים של הסוכנות */}
      <div className="rounded-lg border border-brand-border bg-brand-light p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Globe className="h-5 w-5 text-brand-gold" />
          <h2 className="text-lg font-semibold text-brand-dark">נכסים דיגיטליים של הסוכנות</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-dark">Google My Business</label>
            <input
              type="text"
              value={assetsForm.googleMyBusiness}
              onChange={(e) => setAssetsForm((p) => ({ ...p, googleMyBusiness: e.target.value }))}
              className={inputClass}
              placeholder="קישור או מזהה"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-dark">עמוד פייסבוק</label>
            <input
              type="text"
              value={assetsForm.facebookPage}
              onChange={(e) => setAssetsForm((p) => ({ ...p, facebookPage: e.target.value }))}
              className={inputClass}
              placeholder="קישור לעמוד"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-dark">אינסטגרם</label>
            <input
              type="text"
              value={assetsForm.instagram}
              onChange={(e) => setAssetsForm((p) => ({ ...p, instagram: e.target.value }))}
              className={inputClass}
              placeholder="שם משתמש או קישור"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-dark">לינקדאין</label>
            <input
              type="text"
              value={assetsForm.linkedin}
              onChange={(e) => setAssetsForm((p) => ({ ...p, linkedin: e.target.value }))}
              className={inputClass}
              placeholder="קישור לעמוד"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-dark">חשבון Meta Ads</label>
            <input
              type="text"
              value={assetsForm.metaAdAccount}
              onChange={(e) => setAssetsForm((p) => ({ ...p, metaAdAccount: e.target.value }))}
              className={inputClass}
              placeholder="מזהה חשבון"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-dark">חשבון Google Ads</label>
            <input
              type="text"
              value={assetsForm.googleAdAccount}
              onChange={(e) => setAssetsForm((p) => ({ ...p, googleAdAccount: e.target.value }))}
              className={inputClass}
              placeholder="מזהה חשבון"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-dark">חשבון TikTok Ads</label>
            <input
              type="text"
              value={assetsForm.tiktokAdAccount}
              onChange={(e) => setAssetsForm((p) => ({ ...p, tiktokAdAccount: e.target.value }))}
              className={inputClass}
              placeholder="מזהה חשבון"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-dark">Google Analytics</label>
            <input
              type="text"
              value={assetsForm.googleAnalytics}
              onChange={(e) => setAssetsForm((p) => ({ ...p, googleAnalytics: e.target.value }))}
              className={inputClass}
              placeholder="מזהה נכס (GA4)"
            />
          </div>
        </div>
        <div className="mt-4">
          <button onClick={handleSaveAssets} className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-gold/80">
            {savedAssets ? "נשמר!" : "שמור נכסים דיגיטליים"}
          </button>
        </div>
      </div>

      {/* ניהול עובדים */}
      <div className="rounded-lg border border-brand-border bg-brand-light p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-brand-dark">ניהול עובדים</h2>
          <button onClick={openNewEmp} className="flex items-center gap-2 rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-gold/80">
            <Plus className="h-4 w-4" />
            עובד חדש
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border bg-brand-bg/50">
                <th className="px-4 py-3 text-right font-medium text-brand-muted">שם</th>
                <th className="px-4 py-3 text-right font-medium text-brand-muted">אימייל</th>
                <th className="px-4 py-3 text-right font-medium text-brand-muted">טלפון</th>
                <th className="px-4 py-3 text-right font-medium text-brand-muted">תפקיד</th>
                <th className="px-4 py-3 text-right font-medium text-brand-muted">לקוחות משויכים</th>
                <th className="px-4 py-3 text-right font-medium text-brand-muted">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {employees.filter((e) => e.role !== "client").map((emp) => {
                const role = roleOptions.find((r) => r.value === emp.role);
                const assignedClients = clients.filter((c) => emp.assignedClientIds.includes(c.id));
                return (
                  <tr key={emp.id} className="border-b border-brand-border transition-colors duration-200 hover:bg-brand-bg/30">
                    <td className="px-4 py-3 font-medium text-brand-dark">{emp.name}</td>
                    <td className="px-4 py-3 text-brand-muted">{emp.email}</td>
                    <td className="px-4 py-3 text-brand-muted">{emp.phone}</td>
                    <td className="px-4 py-3 text-brand-muted">{role?.label}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {assignedClients.length === 0 && <span className="text-xs text-brand-muted">—</span>}
                        {assignedClients.map((c) => (
                          <span key={c.id} className="rounded-md bg-brand-bg px-2 py-0.5 text-xs text-brand-muted">{c.name}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openResetPassword(emp)} className="rounded-lg p-1.5 text-brand-muted transition-colors duration-200 hover:bg-brand-bg hover:text-brand-dark" title="איפוס סיסמה">
                          <KeyRound className="h-4 w-4" />
                        </button>
                        <button onClick={() => openEditEmp(emp)} className="rounded-lg p-1.5 text-brand-muted transition-colors duration-200 hover:bg-brand-bg hover:text-brand-dark">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => deleteEmployee(emp.id)} className="rounded-lg p-1.5 text-brand-muted transition-colors duration-200 hover:bg-red-50 hover:text-brand-danger">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ניהול לקוחות קצה */}
      <div className="rounded-lg border border-brand-border bg-brand-light p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-brand-dark">ניהול לקוחות קצה (גישה לפורטל)</h2>
          <button
            onClick={() => {
              setEditingEmp(null);
              setEmpForm({ name: "", email: "", phone: "", role: "client", assignedClientIds: [], password: generatePassword(), sendEmail: true });
              setIsEmpModalOpen(true);
            }}
            className="flex items-center gap-2 rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-gold/80"
          >
            <Plus className="h-4 w-4" />
            לקוח חדש
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-border bg-brand-bg/50">
                <th className="px-4 py-3 text-right font-medium text-brand-muted">שם</th>
                <th className="px-4 py-3 text-right font-medium text-brand-muted">אימייל</th>
                <th className="px-4 py-3 text-right font-medium text-brand-muted">טלפון</th>
                <th className="px-4 py-3 text-right font-medium text-brand-muted">לקוח משויך</th>
                <th className="px-4 py-3 text-right font-medium text-brand-muted">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {employees.filter((e) => e.role === "client").length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-brand-muted">אין לקוחות קצה עדיין</td></tr>
              )}
              {employees.filter((e) => e.role === "client").map((emp) => {
                const assignedClients = clients.filter((c) => emp.assignedClientIds.includes(c.id));
                return (
                  <tr key={emp.id} className="border-b border-brand-border transition-colors duration-200 hover:bg-brand-bg/30">
                    <td className="px-4 py-3 font-medium text-brand-dark">{emp.name}</td>
                    <td className="px-4 py-3 text-brand-muted">{emp.email}</td>
                    <td className="px-4 py-3 text-brand-muted">{emp.phone || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {assignedClients.length === 0 && <span className="text-xs text-brand-muted">—</span>}
                        {assignedClients.map((c) => (
                          <span key={c.id} className="rounded-md bg-brand-bg px-2 py-0.5 text-xs text-brand-muted">{c.name}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openResetPassword(emp)} className="rounded-lg p-1.5 text-brand-muted transition-colors duration-200 hover:bg-brand-bg hover:text-brand-dark" title="איפוס סיסמה">
                          <KeyRound className="h-4 w-4" />
                        </button>
                        <button onClick={() => deleteEmployee(emp.id)} className="rounded-lg p-1.5 text-brand-muted transition-colors duration-200 hover:bg-red-50 hover:text-brand-danger">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* מודל עובד */}
      <Modal isOpen={isEmpModalOpen} onClose={() => setIsEmpModalOpen(false)} title={editingEmp ? "עריכת עובד" : "עובד חדש"}>
        <form onSubmit={handleSubmitEmp} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-dark">שם</label>
            <input type="text" value={empForm.name} onChange={(e) => setEmpForm((p) => ({ ...p, name: e.target.value }))} className={inputClass} placeholder="שם מלא" required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-dark">אימייל</label>
            <input type="email" value={empForm.email} onChange={(e) => setEmpForm((p) => ({ ...p, email: e.target.value }))} className={inputClass} placeholder="email@example.com" required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-dark">טלפון</label>
            <input type="tel" value={empForm.phone} onChange={(e) => setEmpForm((p) => ({ ...p, phone: e.target.value }))} className={inputClass} placeholder="050-0000000" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-dark">תפקיד</label>
            <select value={empForm.role} onChange={(e) => setEmpForm((p) => ({ ...p, role: e.target.value }))} className={inputClass}>
              {roleOptions.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          {/* שדה סיסמה — רק ביצירת עובד חדש */}
          {!editingEmp && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-dark">סיסמה ראשונית</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={empForm.password}
                    onChange={(e) => setEmpForm((p) => ({ ...p, password: e.target.value }))}
                    className={inputClass}
                    placeholder="סיסמה"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setEmpForm((p) => ({ ...p, password: generatePassword() }))}
                    className="shrink-0 rounded-lg border border-brand-border px-3 py-2 text-sm font-medium text-brand-muted transition-colors duration-200 hover:bg-brand-bg"
                  >
                    צור סיסמה אקראית
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="sendEmail"
                  checked={empForm.sendEmail}
                  onChange={(e) => setEmpForm((p) => ({ ...p, sendEmail: e.target.checked }))}
                  className="h-4 w-4 rounded border-brand-border text-brand-gold focus:ring-brand-gold"
                />
                <label htmlFor="sendEmail" className="text-sm font-medium text-brand-dark">שלח מייל ברוכים הבאים</label>
              </div>
            </>
          )}

          <div>
            <label className="mb-2 block text-sm font-medium text-brand-dark">שיוך לקוחות</label>
            <div className="flex flex-wrap gap-2">
              {clients.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleToggleClient(c.id)}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition-colors duration-200 ${
                    empForm.assignedClientIds.includes(c.id)
                      ? "border-brand-gold bg-brand-gold/20 text-brand-dark"
                      : "border-brand-border bg-brand-bg text-brand-muted hover:border-brand-gold"
                  }`}
                >
                  {c.name}
                </button>
              ))}
              {clients.length === 0 && <span className="text-xs text-brand-muted">אין לקוחות להצגה</span>}
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t border-brand-border pt-4">
            <button type="button" onClick={() => setIsEmpModalOpen(false)} className="rounded-lg border border-brand-border px-4 py-2 text-sm font-medium text-brand-muted transition-colors duration-200 hover:bg-brand-bg">
              ביטול
            </button>
            <button type="submit" className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-gold/80">
              {editingEmp ? "עדכן" : "הוסף עובד"}
            </button>
          </div>
        </form>
      </Modal>

      {/* מודל פרטי כניסה לאחר יצירה */}
      <Modal isOpen={credentialsModal} onClose={() => setCredentialsModal(false)} title="העובד נוצר בהצלחה!">
        <div className="space-y-4">
          <div className="rounded-lg border border-brand-border bg-brand-bg p-4">
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium text-brand-dark">אימייל:</span>
                <span className="text-brand-muted">{createdEmail}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-brand-dark">סיסמה:</span>
                <span className="font-mono text-brand-muted">{createdPassword}</span>
              </div>
            </div>
          </div>

          <button
            onClick={handleCopyCredentials}
            className="flex items-center gap-2 rounded-lg border border-brand-border px-4 py-2 text-sm font-medium text-brand-muted transition-colors duration-200 hover:bg-brand-bg"
          >
            {copiedCredentials ? <Check className="h-4 w-4 text-brand-success" /> : <Copy className="h-4 w-4" />}
            {copiedCredentials ? "הועתק!" : "העתק פרטים"}
          </button>

          {createdSendEmail && (
            <p className="text-sm text-brand-success">מייל נשלח בהצלחה</p>
          )}

          <div className="flex justify-end border-t border-brand-border pt-4">
            <button
              onClick={() => setCredentialsModal(false)}
              className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-gold/80"
            >
              סגור
            </button>
          </div>
        </div>
      </Modal>

      {/* מודל איפוס סיסמה */}
      <Modal isOpen={resetPasswordModal} onClose={() => setResetPasswordModal(false)} title={`איפוס סיסמה ל-${resetEmp?.name ?? ""}`} size="sm">
        {resetSuccess ? (
          <div className="space-y-4">
            <p className="text-sm text-brand-success">הסיסמה אופסה בהצלחה!</p>
            <div className="flex justify-end">
              <button
                onClick={() => setResetPasswordModal(false)}
                className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-gold/80"
              >
                סגור
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-dark">סיסמה חדשה</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={resetPasswordForm.newPassword}
                  onChange={(e) => setResetPasswordForm((p) => ({ ...p, newPassword: e.target.value }))}
                  className={inputClass}
                  placeholder="סיסמה חדשה"
                  required
                />
                <button
                  type="button"
                  onClick={() => setResetPasswordForm((p) => ({ ...p, newPassword: generatePassword() }))}
                  className="shrink-0 rounded-lg border border-brand-border px-3 py-2 text-sm font-medium text-brand-muted transition-colors duration-200 hover:bg-brand-bg"
                >
                  צור אקראית
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="resetSendEmail"
                checked={resetPasswordForm.sendEmail}
                onChange={(e) => setResetPasswordForm((p) => ({ ...p, sendEmail: e.target.checked }))}
                className="h-4 w-4 rounded border-brand-border text-brand-gold focus:ring-brand-gold"
              />
              <label htmlFor="resetSendEmail" className="text-sm font-medium text-brand-dark">שלח מייל עם הסיסמה החדשה</label>
            </div>
            {resetError && (
              <p className="text-sm text-brand-danger">{resetError}</p>
            )}
            <div className="flex justify-end gap-3 border-t border-brand-border pt-4">
              <button type="button" onClick={() => setResetPasswordModal(false)} className="rounded-lg border border-brand-border px-4 py-2 text-sm font-medium text-brand-muted transition-colors duration-200 hover:bg-brand-bg">
                ביטול
              </button>
              <button type="submit" className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-dark transition-colors duration-200 hover:bg-brand-gold/80">
                אפס סיסמה
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Save, Plus, MoreHorizontal, Pencil, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { UserForm } from "@/components/forms/user-form";
import { format } from "date-fns";

interface Settings {
  agencyName: string;
  currency: string;
  productiveHours: number;
  marginWarning: number;
  marginDanger: number;
  fiscalYearStart: number;
}

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  lastLoginAt: string | null;
  createdAt: string;
  totpEnabled: boolean;
}

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    agencyName: "Swan Studio",
    currency: "AUD",
    productiveHours: 6.5,
    marginWarning: 20,
    marginDanger: 10,
    fiscalYearStart: 7,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // User management state
  const [users, setUsers] = useState<User[]>([]);
  const [userFormOpen, setUserFormOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Data reset state
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<{ success: boolean; message: string } | null>(null);

  const loadUsers = useCallback(async () => {
    const res = await fetch("/api/users");
    if (res.ok) {
      setUsers(await res.json());
    }
  }, []);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data) setSettings(data);
      });
    loadUsers();
  }, [loadUsers]);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Failed to save");
      setMessage({ type: "success", text: "Settings saved successfully" });
    } catch {
      setMessage({ type: "error", text: "Failed to save settings" });
    } finally {
      setSaving(false);
    }
  }

  function handleEditUser(user: User) {
    setEditUser(user);
    setUserFormOpen(true);
  }

  function handleAddUser() {
    setEditUser(null);
    setUserFormOpen(true);
  }

  async function handleResetData() {
    setResetting(true);
    setResetResult(null);
    try {
      const res = await fetch("/api/data/reset", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        setResetResult({ success: true, message: data.message });
      } else {
        setResetResult({ success: false, message: data.error || "Reset failed" });
      }
    } catch (err) {
      setResetResult({ success: false, message: err instanceof Error ? err.message : "Reset failed" });
    } finally {
      setResetting(false);
      setShowResetConfirm(false);
    }
  }

  async function handleDeleteUser() {
    if (!deleteUser) return;
    setDeleting(true);
    const res = await fetch(`/api/users/${deleteUser.id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json();
      setMessage({ type: "error", text: err.error || "Failed to delete user" });
    }
    setDeleteUser(null);
    setDeleting(false);
    loadUsers();
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure agency-wide settings and manage users.
        </p>
      </div>

      {message && (
        <Alert variant={message.type === "error" ? "destructive" : "default"}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Agency Details</CardTitle>
            <CardDescription>Basic agency configuration</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agencyName">Agency Name</Label>
              <Input
                id="agencyName"
                value={settings.agencyName}
                onChange={(e) =>
                  setSettings({ ...settings, agencyName: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select
                value={settings.currency}
                onValueChange={(v) =>
                  setSettings({ ...settings, currency: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AUD">AUD - Australian Dollar</SelectItem>
                  <SelectItem value="USD">USD - US Dollar</SelectItem>
                  <SelectItem value="GBP">GBP - British Pound</SelectItem>
                  <SelectItem value="EUR">EUR - Euro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fiscalYear">Fiscal Year Start</Label>
              <Select
                value={String(settings.fiscalYearStart)}
                onValueChange={(v) =>
                  setSettings({ ...settings, fiscalYearStart: parseInt(v) })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((month, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Productivity & Margins</CardTitle>
            <CardDescription>
              Thresholds for efficiency calculations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="productiveHours">
                Productive Hours per Day
              </Label>
              <Input
                id="productiveHours"
                type="number"
                step="0.5"
                min="1"
                max="12"
                value={settings.productiveHours}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    productiveHours: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="marginWarning">Margin Warning (%)</Label>
                <Input
                  id="marginWarning"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={settings.marginWarning}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      marginWarning: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="marginDanger">Margin Danger (%)</Label>
                <Input
                  id="marginDanger"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={settings.marginDanger}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      marginDanger: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </div>

      <Separator />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>User Management</CardTitle>
            <CardDescription>
              Manage user accounts and permissions
            </CardDescription>
          </div>
          <Button onClick={handleAddUser}>
            <Plus className="h-4 w-4 mr-2" />
            Add User
          </Button>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No users found.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>2FA</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.totpEnabled ? "default" : "outline"}>
                        {user.totpEnabled ? "Enabled" : "Off"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.lastLoginAt
                        ? format(new Date(user.lastLoginAt), "dd MMM yyyy")
                        : "\u2014"}
                    </TableCell>
                    <TableCell>
                      {format(new Date(user.createdAt), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEditUser(user)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleteUser(user)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <UserForm
        key={editUser?.id ?? "new"}
        open={userFormOpen}
        onOpenChange={setUserFormOpen}
        defaultValues={
          editUser
            ? {
                id: editUser.id,
                name: editUser.name,
                email: editUser.email,
                role: editUser.role as "admin" | "viewer",
              }
            : undefined
        }
        onSuccess={loadUsers}
      />

      <Separator />

      {/* Data Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Data Management
          </CardTitle>
          <CardDescription>
            Reset business data before importing real data from integrations.
            This preserves your user accounts, integration configs, and app settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {resetResult && (
            <Alert variant={resetResult.success ? "default" : "destructive"}>
              <AlertDescription>{resetResult.message}</AlertDescription>
            </Alert>
          )}
          <div className="flex items-center justify-between rounded-md border p-4">
            <div>
              <p className="text-sm font-medium">Clear All Business Data</p>
              <p className="text-xs text-muted-foreground">
                Removes all clients, team members, financials, time entries, deliverables,
                chat history, and sync logs. User accounts and integration configs are preserved.
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={() => setShowResetConfirm(true)}
              disabled={resetting}
            >
              {resetting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Resetting...
                </>
              ) : (
                "Clear Data"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Reset confirmation dialog */}
      <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear All Business Data?</DialogTitle>
            <DialogDescription>
              This will permanently delete all clients, team members, financial records,
              time entries, deliverables, and chat history. This cannot be undone.
              Your user accounts and integration configurations will be preserved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleResetData} disabled={resetting}>
              {resetting ? "Clearing..." : "Yes, Clear Everything"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteUser} onOpenChange={() => setDeleteUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteUser?.name}&quot;? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteUser(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteUser} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

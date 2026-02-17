"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Save } from "lucide-react";

interface Settings {
  agencyName: string;
  currency: string;
  productiveHours: number;
  marginWarning: number;
  marginDanger: number;
  fiscalYearStart: number;
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

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data) setSettings(data);
      });
  }, []);

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

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure agency-wide settings.
        </p>
      </div>

      {message && (
        <Alert variant={message.type === "error" ? "destructive" : "default"}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

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

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
          <CardDescription>
            Password and two-factor authentication settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            User management features coming in Phase 2.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}

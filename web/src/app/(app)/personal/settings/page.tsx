'use client';

import TaxConfig from '../../../components/TaxConfig';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Users, Copy, Check, Terminal, Bell } from 'lucide-react';
import { useAuth } from '../../../context/AuthWithAdminContext';
import { useNotifications } from '../../../context/NotificationContext';
import { Button } from '@/components/ui/button';
import AuthModal from '../../../components/AuthModal';
import { useState } from 'react';
import { auth } from '@/lib/firebase';

function NotificationPreferencesCard() {
  const { preferences, updatePreferences } = useNotifications();

  const togglePref = (key: string, value: boolean) => {
    updatePreferences({ [key]: value });
  };

  const prefs = [
    { key: 'budgetAlerts', label: 'Budget Alerts', desc: 'Get notified when spending approaches budget limits', value: preferences?.budgetAlerts ?? true },
    { key: 'goalMilestones', label: 'Goal Milestones', desc: 'Celebrate when you hit savings milestones', value: preferences?.goalMilestones ?? true },
    { key: 'billReminders', label: 'Bill Reminders', desc: 'Reminders before recurring bills are due', value: preferences?.billReminders ?? true },
    { key: 'unusualSpending', label: 'Unusual Spending', desc: 'Alerts for spending that deviates from your patterns', value: preferences?.unusualSpending ?? true },
    { key: 'subscriptionAlerts', label: 'Subscription Alerts', desc: 'Updates about your subscription status', value: preferences?.subscriptionAlerts ?? true },
    { key: 'weeklyDigest', label: 'Weekly Digest', desc: 'A weekly summary of your financial activity', value: preferences?.weeklyDigest ?? false },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Notification Preferences
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {prefs.map(({ key, label, desc, value }) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor={key} className="text-sm font-medium">{label}</Label>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
            <Switch
              id={key}
              checked={value}
              onCheckedChange={(checked) => togglePref(key, checked)}
            />
          </div>
        ))}

        <div className="pt-2 border-t">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="billReminderDays" className="text-sm font-medium">Bill Reminder Days</Label>
              <p className="text-xs text-muted-foreground">How many days before a bill to send a reminder</p>
            </div>
            <Input
              id="billReminderDays"
              type="number"
              min={1}
              max={30}
              className="w-20"
              value={preferences?.billReminderDays ?? 3}
              onChange={(e) => updatePreferences({ billReminderDays: parseInt(e.target.value) || 3 })}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DevToolsCard({ userId }: { userId: string }) {
  const [copiedUid, setCopiedUid] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [loadingToken, setLoadingToken] = useState(false);

  const copyToClipboard = async (text: string, setCopied: (v: boolean) => void) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getToken = async () => {
    setLoadingToken(true);
    try {
      if (!auth) {
        setToken(null);
        setLoadingToken(false);
        return;
      }
      const currentUser = auth.currentUser;
      if (currentUser) {
        const idToken = await currentUser.getIdToken();
        setToken(idToken);
      }
    } catch (error) {
      console.error('Failed to get token:', error);
    }
    setLoadingToken(false);
  };

  return (
    <Card className="border-dashed border-muted-foreground/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-muted-foreground">
          <Terminal className="w-5 h-5" />
          Developer Tools
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Use these values to seed test data via the CLI.
        </p>
        
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">User ID</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-muted rounded text-xs font-mono break-all">
                {userId}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(userId, setCopiedUid)}
              >
                {copiedUid ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Auth Token</label>
            {!token ? (
              <Button
                variant="outline"
                size="sm"
                onClick={getToken}
                disabled={loadingToken}
                className="w-full"
              >
                {loadingToken ? 'Loading...' : 'Generate Token'}
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-muted rounded text-xs font-mono truncate">
                  {token.substring(0, 50)}...
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(token, setCopiedToken)}
                >
                  {copiedToken ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground mb-2">Seed command:</p>
          <code className="block px-3 py-2 bg-muted rounded text-xs font-mono break-all">
            make seed-data-auth AUTH_TOKEN=&lt;token&gt; USER_ID={userId}
          </code>
        </div>
      </CardContent>
    </Card>
  );
}

export default function PersonalSettingsPage() {
  const { user } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Configure your personal finance preferences
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TaxConfig />
        
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Tax Configuration Help</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Configure your tax settings to get more accurate financial calculations.
              </p>
              <ul className="space-y-2 list-disc pl-5 text-sm text-muted-foreground">
                <li>Set your country to use the appropriate tax system</li>
                <li>Toggle tax calculation on/off as needed</li>
                <li>Configure deductions and tax-specific settings</li>
                <li>View your effective tax rate in the finance summary</li>
              </ul>
            </CardContent>
          </Card>

          {!user && (
            <Card className="border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Enable Multi-User Features
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  Sign in to unlock collaborative features:
                </p>
                <ul className="space-y-2 list-disc pl-5 text-sm text-muted-foreground">
                  <li>Create shared finance groups</li>
                  <li>Split expenses with friends and family</li>
                  <li>Track group balances and settlements</li>
                  <li>Sync data across all your devices</li>
                </ul>
                <Button onClick={() => setShowAuthModal(true)} className="w-full">
                  Sign In to Enable
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Notification Preferences - only show when signed in */}
      {user && <NotificationPreferencesCard />}

      {/* Developer Tools - only show when signed in */}
      {user && (
        <DevToolsCard userId={user.uid} />
      )}

      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
      />
    </div>
  );
}
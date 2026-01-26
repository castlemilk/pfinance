'use client';

import TaxConfig from '../../components/TaxConfig';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Copy, Check, Terminal } from 'lucide-react';
import { useAuth } from '../../context/AuthWithAdminContext';
import { Button } from '@/components/ui/button';
import AuthModal from '../../components/AuthModal';
import { useState } from 'react';
import { auth } from '@/lib/firebase';

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
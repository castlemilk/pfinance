'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  updatePassword,
  updateProfile,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import { useAuth } from '../../../context/AuthWithAdminContext';
import { useSubscription } from '../../../hooks/useSubscription';
import { financeClient } from '@/lib/financeService';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  UserCog,
  Save,
  Lock,
  Download,
  Trash2,
  AlertTriangle,
  Crown,
  Loader2,
  CheckCircle,
  XCircle,
} from 'lucide-react';

export default function AccountPage() {
  const { user, logout, loading } = useAuth();
  const { isPro, loading: subscriptionLoading } = useSubscription();
  const router = useRouter();

  // Profile state
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Export state
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Delete state
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // --- Profile Handlers ---
  const handleSaveProfile = async () => {
    if (!user) return;
    setProfileSaving(true);
    setProfileMessage(null);

    try {
      // Update Firebase profile
      await updateProfile(user, { displayName });

      // Update backend
      await financeClient.updateUser({
        userId: user.uid,
        displayName,
        photoUrl: user.photoURL || '',
        email: user.email || '',
      });

      setProfileMessage({ type: 'success', text: 'Profile updated successfully.' });
    } catch (err) {
      console.error('Failed to update profile:', err);
      setProfileMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update profile.',
      });
    } finally {
      setProfileSaving(false);
    }
  };

  // --- Password Handlers ---
  const handleChangePassword = async () => {
    if (!user || !user.email) return;
    setPasswordSaving(true);
    setPasswordMessage(null);

    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New passwords do not match.' });
      setPasswordSaving(false);
      return;
    }

    if (newPassword.length < 6) {
      setPasswordMessage({
        type: 'error',
        text: 'New password must be at least 6 characters.',
      });
      setPasswordSaving(false);
      return;
    }

    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage({ type: 'success', text: 'Password changed successfully.' });
    } catch (err) {
      console.error('Failed to change password:', err);
      const firebaseError = err as { code?: string };
      let message = 'Failed to change password.';
      if (firebaseError.code === 'auth/wrong-password') {
        message = 'Current password is incorrect.';
      } else if (firebaseError.code === 'auth/weak-password') {
        message = 'New password is too weak. Use at least 6 characters.';
      } else if (firebaseError.code === 'auth/requires-recent-login') {
        message = 'Please sign out and sign back in, then try again.';
      }
      setPasswordMessage({ type: 'error', text: message });
    } finally {
      setPasswordSaving(false);
    }
  };

  // --- Export Handler ---
  const handleExportData = async () => {
    if (!user) return;
    setExporting(true);
    setExportMessage(null);

    try {
      const response = await financeClient.exportUserData({
        userId: user.uid,
        format: 'json',
      });

      // Create a blob and download
      const blob = new Blob([response.data as BlobPart], {
        type: response.contentType || 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = response.filename || 'pfinance-export.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportMessage({ type: 'success', text: 'Data exported successfully.' });
    } catch (err) {
      console.error('Failed to export data:', err);
      setExportMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to export data.',
      });
    } finally {
      setExporting(false);
    }
  };

  // --- Delete Handler ---
  const handleDeleteAccount = async () => {
    if (!user || deleteConfirmEmail !== user.email) return;
    setDeleting(true);

    try {
      await financeClient.deleteUser({
        userId: user.uid,
        confirm: true,
      });

      // Sign out after deletion
      await logout();
      router.push('/');
    } catch (err) {
      console.error('Failed to delete account:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete account.');
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
      setDeleteConfirmEmail('');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Account</h1>
          <p className="text-muted-foreground">Loading account settings...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Account</h1>
          <p className="text-muted-foreground">
            Sign in to manage your account settings.
          </p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              You need to be signed in to access account settings.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isEmailProvider = user.providerData?.some(
    (p) => p.providerId === 'password'
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Account</h1>
        <p className="text-muted-foreground">
          Manage your profile, security, and account data.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCog className="w-5 h-5" />
              Profile
            </CardTitle>
            <CardDescription>
              Update your display name and profile information.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <Avatar className="w-16 h-16">
                {user.photoURL && (
                  <AvatarImage
                    src={user.photoURL}
                    alt={user.displayName || 'User'}
                  />
                )}
                <AvatarFallback className="text-lg">
                  {getInitials(user.displayName || user.email || 'U')}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-medium truncate">
                  {user.displayName || 'No name set'}
                </p>
                <p className="text-sm text-muted-foreground truncate">
                  {user.email}
                </p>
                {!subscriptionLoading && (
                  <div className="mt-1">
                    {isPro ? (
                      <Badge
                        variant="default"
                        className="bg-amber-500/90 hover:bg-amber-500"
                      >
                        <Crown className="w-3 h-3 mr-1" />
                        Pro
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Free</Badge>
                    )}
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Display Name */}
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your display name"
              />
            </div>

            {/* Email (read-only) */}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                value={user.email || ''}
                disabled
                className="opacity-60"
              />
              <p className="text-xs text-muted-foreground">
                Email cannot be changed from this page.
              </p>
            </div>

            {/* Save Button */}
            <Button
              onClick={handleSaveProfile}
              disabled={profileSaving || displayName === user.displayName}
              className="w-full"
            >
              {profileSaving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Profile
            </Button>

            {/* Profile Message */}
            {profileMessage && (
              <div
                className={`flex items-center gap-2 text-sm p-3 rounded-md ${
                  profileMessage.type === 'success'
                    ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                    : 'bg-red-500/10 text-red-600 dark:text-red-400'
                }`}
              >
                {profileMessage.type === 'success' ? (
                  <CheckCircle className="w-4 h-4 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 shrink-0" />
                )}
                {profileMessage.text}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Password Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5" />
              Password
            </CardTitle>
            <CardDescription>
              {isEmailProvider
                ? 'Change your account password.'
                : 'Password management is not available for social login accounts.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isEmailProvider ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                  />
                </div>

                <Button
                  onClick={handleChangePassword}
                  disabled={
                    passwordSaving ||
                    !currentPassword ||
                    !newPassword ||
                    !confirmPassword
                  }
                  className="w-full"
                >
                  {passwordSaving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Lock className="w-4 h-4 mr-2" />
                  )}
                  Change Password
                </Button>

                {/* Password Message */}
                {passwordMessage && (
                  <div
                    className={`flex items-center gap-2 text-sm p-3 rounded-md ${
                      passwordMessage.type === 'success'
                        ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                        : 'bg-red-500/10 text-red-600 dark:text-red-400'
                    }`}
                  >
                    {passwordMessage.type === 'success' ? (
                      <CheckCircle className="w-4 h-4 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 shrink-0" />
                    )}
                    {passwordMessage.text}
                  </div>
                )}
              </>
            ) : (
              <div className="py-8 text-center">
                <Lock className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">
                  You signed in with a social provider (Google). Password
                  management is handled by your provider.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Data Export Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Data Export
          </CardTitle>
          <CardDescription>
            Download a copy of all your financial data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Export all your expenses, income, budgets, and goals as a JSON file.
            This data can be used for backup or migration purposes.
          </p>
          <div className="flex items-center gap-4">
            <Button
              onClick={handleExportData}
              disabled={exporting}
              variant="outline"
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Export as JSON
            </Button>
          </div>

          {/* Export Message */}
          {exportMessage && (
            <div
              className={`flex items-center gap-2 text-sm p-3 rounded-md ${
                exportMessage.type === 'success'
                  ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                  : 'bg-red-500/10 text-red-600 dark:text-red-400'
              }`}
            >
              {exportMessage.type === 'success' ? (
                <CheckCircle className="w-4 h-4 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 shrink-0" />
              )}
              {exportMessage.text}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-500/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertTriangle className="w-5 h-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>
            Irreversible actions that permanently affect your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border border-red-500/30 rounded-lg bg-red-500/5">
            <div>
              <p className="font-medium text-sm">Delete Account</p>
              <p className="text-sm text-muted-foreground">
                Permanently delete your account and all associated data. This
                action cannot be undone.
              </p>
            </div>
            <AlertDialog
              open={deleteDialogOpen}
              onOpenChange={setDeleteDialogOpen}
            >
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete
                    your account and remove all your data from our servers,
                    including expenses, income, budgets, goals, and all other
                    financial records.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-2 py-2">
                  <Label htmlFor="deleteConfirmEmail">
                    Type <span className="font-mono font-bold">{user.email}</span>{' '}
                    to confirm:
                  </Label>
                  <Input
                    id="deleteConfirmEmail"
                    value={deleteConfirmEmail}
                    onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                    placeholder="Enter your email to confirm"
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel
                    onClick={() => setDeleteConfirmEmail('')}
                  >
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteAccount}
                    disabled={
                      deleting || deleteConfirmEmail !== user.email
                    }
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {deleting ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-2" />
                    )}
                    Delete Account
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
import { uploadAvatar, deleteAvatar } from '../../../utils/avatarUpload';
import type { ApiToken } from '@/gen/pfinance/v1/types_pb';
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
import { GenerativeAvatar } from '../../../components/GenerativeAvatar';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  Key,
  Plus,
  Copy,
  Ban,
  Eraser,
  Camera,
  Upload,
  Eye,
  X,
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

  // Clear data state
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearConfirmEmail, setClearConfirmEmail] = useState('');
  const [clearing, setClearing] = useState(false);
  const [clearMessage, setClearMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Delete state
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // API Token state
  const [apiTokens, setApiTokens] = useState<ApiToken[]>([]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [tokenName, setTokenName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newTokenRaw, setNewTokenRaw] = useState<string | null>(null);
  const [tokenRevealOpen, setTokenRevealOpen] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [revokeTokenId, setRevokeTokenId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [tokenMessage, setTokenMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Avatar state
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [showGenerativePreview, setShowGenerativePreview] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // --- Avatar Handlers ---
  const handleAvatarFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Reset file input so same file can be re-selected
    e.target.value = '';

    // Validate type
    if (!file.type.startsWith('image/')) {
      setAvatarMessage({ type: 'error', text: 'Please select an image file.' });
      return;
    }

    // Validate size (5MB max before compression)
    if (file.size > 5 * 1024 * 1024) {
      setAvatarMessage({ type: 'error', text: 'Image must be under 5MB.' });
      return;
    }

    setAvatarUploading(true);
    setAvatarMessage(null);
    setShowGenerativePreview(false);

    try {
      const downloadURL = await uploadAvatar(file, user.uid);
      await updateProfile(user, { photoURL: downloadURL });
      await user.reload();

      // Sync to backend
      await financeClient.updateUser({
        userId: user.uid,
        displayName: user.displayName || '',
        photoUrl: downloadURL,
        email: user.email || '',
      });

      setAvatarMessage({ type: 'success', text: 'Avatar updated.' });
    } catch (err) {
      console.error('Failed to upload avatar:', err);
      setAvatarMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to upload avatar.',
      });
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user) return;
    setAvatarUploading(true);
    setAvatarMessage(null);
    setShowGenerativePreview(false);

    try {
      await deleteAvatar(user.uid);
      await updateProfile(user, { photoURL: '' });
      await user.reload();

      // Sync to backend
      await financeClient.updateUser({
        userId: user.uid,
        displayName: user.displayName || '',
        photoUrl: '',
        email: user.email || '',
      });

      setAvatarMessage({ type: 'success', text: 'Avatar removed. Using generative avatar.' });
    } catch (err) {
      console.error('Failed to remove avatar:', err);
      setAvatarMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to remove avatar.',
      });
    } finally {
      setAvatarUploading(false);
    }
  };

  // --- Load API tokens ---
  const loadApiTokens = useCallback(async () => {
    if (!isPro) return;
    setTokensLoading(true);
    try {
      const resp = await financeClient.listApiTokens({});
      setApiTokens(resp.tokens);
    } catch (err) {
      console.error('Failed to load API tokens:', err);
    } finally {
      setTokensLoading(false);
    }
  }, [isPro]);

  useEffect(() => {
    if (isPro && !subscriptionLoading) {
      loadApiTokens();
    }
  }, [isPro, subscriptionLoading, loadApiTokens]);

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

  // --- Clear Data Handler ---
  const handleClearData = async () => {
    if (!user || clearConfirmEmail !== user.email) return;
    setClearing(true);
    setClearMessage(null);

    try {
      await financeClient.clearUserData({
        userId: user.uid,
        confirm: true,
      });

      setClearMessage({
        type: 'success',
        text: 'All financial data has been cleared. Your account and subscription remain active.',
      });
    } catch (err) {
      console.error('Failed to clear data:', err);
      setClearMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to clear account data.',
      });
    } finally {
      setClearing(false);
      setClearDialogOpen(false);
      setClearConfirmEmail('');
    }
  };

  // --- API Token Handlers ---
  const handleCreateToken = async () => {
    if (!tokenName.trim()) return;
    setCreating(true);
    setTokenMessage(null);

    try {
      const resp = await financeClient.createApiToken({ name: tokenName.trim() });
      setNewTokenRaw(resp.token);
      setTokenRevealOpen(true);
      setTokenName('');
      await loadApiTokens();
    } catch (err) {
      console.error('Failed to create API token:', err);
      setTokenMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to create token.',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeToken = async () => {
    if (!revokeTokenId) return;
    setRevoking(true);

    try {
      await financeClient.revokeApiToken({ tokenId: revokeTokenId });
      setTokenMessage({ type: 'success', text: 'Token revoked successfully.' });
      await loadApiTokens();
    } catch (err) {
      console.error('Failed to revoke token:', err);
      setTokenMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to revoke token.',
      });
    } finally {
      setRevoking(false);
      setRevokeDialogOpen(false);
      setRevokeTokenId(null);
    }
  };

  const handleCopyToken = async () => {
    if (!newTokenRaw) return;
    await navigator.clipboard.writeText(newTokenRaw);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (ts: { seconds: bigint } | undefined) => {
    if (!ts) return 'Never';
    const ms = Number(ts.seconds) * 1000;
    if (ms === 0) return 'Never';
    return new Date(ms).toLocaleDateString();
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

  const activeTokens = apiTokens.filter((t) => !t.isRevoked);

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
            {/* Avatar Management */}
            <div className="flex flex-col items-center gap-3">
              {/* Avatar display with hover overlay */}
              <div
                className="relative group cursor-pointer"
                onClick={() => !avatarUploading && fileInputRef.current?.click()}
              >
                <Avatar className="w-24 h-24">
                  {user.photoURL && !showGenerativePreview ? (
                    <AvatarImage
                      src={user.photoURL}
                      alt={user.displayName || 'User'}
                    />
                  ) : null}
                  <AvatarFallback className="p-0 bg-transparent">
                    <GenerativeAvatar name={user.displayName || user.email || 'User'} size={96} />
                  </AvatarFallback>
                </Avatar>
                {/* Hover overlay */}
                {!avatarUploading && (
                  <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Camera className="w-6 h-6 text-white" />
                  </div>
                )}
                {/* Loading overlay */}
                {avatarUploading && (
                  <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                  </div>
                )}
              </div>

              {/* Label */}
              <p className="text-xs text-muted-foreground">
                {showGenerativePreview
                  ? 'Previewing generative avatar'
                  : user.photoURL
                    ? 'Custom photo'
                    : 'Generative avatar'}
              </p>

              {/* Action buttons */}
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={avatarUploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-3.5 h-3.5 mr-1.5" />
                  Upload Photo
                </Button>
                {user.photoURL && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={avatarUploading}
                    onClick={() => setShowGenerativePreview((p) => !p)}
                  >
                    {showGenerativePreview ? (
                      <>
                        <X className="w-3.5 h-3.5 mr-1.5" />
                        Back to Photo
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5 mr-1.5" />
                        Preview Generative
                      </>
                    )}
                  </Button>
                )}
                {user.photoURL && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={avatarUploading}
                    onClick={handleRemoveAvatar}
                    className="text-red-600 hover:text-red-700 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    Remove
                  </Button>
                )}
              </div>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarFileSelect}
              />

              {/* Avatar message */}
              {avatarMessage && (
                <div
                  className={`flex items-center gap-2 text-xs p-2 rounded-md w-full ${
                    avatarMessage.type === 'success'
                      ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                      : 'bg-red-500/10 text-red-600 dark:text-red-400'
                  }`}
                >
                  {avatarMessage.type === 'success' ? (
                    <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 shrink-0" />
                  )}
                  {avatarMessage.text}
                </div>
              )}

              {/* Subscription badge */}
              {!subscriptionLoading && (
                <div>
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

      {/* API Tokens Section */}
      {!subscriptionLoading && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              API Access
            </CardTitle>
            <CardDescription>
              Generate personal API tokens for programmatic access to your data.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isPro ? (
              <>
                {/* Create token */}
                <div className="flex items-end gap-3">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="tokenName">Token Name</Label>
                    <Input
                      id="tokenName"
                      value={tokenName}
                      onChange={(e) => setTokenName(e.target.value)}
                      placeholder='e.g., "Claude Code", "Analysis Script"'
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && tokenName.trim()) {
                          handleCreateToken();
                        }
                      }}
                    />
                  </div>
                  <Button
                    onClick={handleCreateToken}
                    disabled={creating || !tokenName.trim()}
                  >
                    {creating ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4 mr-2" />
                    )}
                    Generate Token
                  </Button>
                </div>

                {/* Token message */}
                {tokenMessage && (
                  <div
                    className={`flex items-center gap-2 text-sm p-3 rounded-md ${
                      tokenMessage.type === 'success'
                        ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                        : 'bg-red-500/10 text-red-600 dark:text-red-400'
                    }`}
                  >
                    {tokenMessage.type === 'success' ? (
                      <CheckCircle className="w-4 h-4 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 shrink-0" />
                    )}
                    {tokenMessage.text}
                  </div>
                )}

                {/* Token list */}
                {tokensLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : activeTokens.length === 0 ? (
                  <div className="py-8 text-center">
                    <Key className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-sm text-muted-foreground">
                      No API tokens yet. Create one to get started with programmatic access.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Prefix</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Last Used</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activeTokens.map((token) => (
                          <TableRow key={token.id}>
                            <TableCell className="font-medium">
                              {token.name}
                            </TableCell>
                            <TableCell>
                              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                {token.tokenPrefix}...
                              </code>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatDate(token.createdAt)}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {formatDate(token.lastUsedAt)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700 hover:bg-red-500/10"
                                onClick={() => {
                                  setRevokeTokenId(token.id);
                                  setRevokeDialogOpen(true);
                                }}
                              >
                                <Ban className="w-4 h-4 mr-1" />
                                Revoke
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Use your token with the <code className="bg-muted px-1 py-0.5 rounded">X-API-Key</code> header
                  for programmatic access. Max {5} active tokens.
                </p>
              </>
            ) : (
              <div className="py-8 text-center">
                <Key className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground mb-3">
                  API access is available on the Pro plan. Upgrade to generate tokens
                  for programmatic access to your financial data.
                </p>
                <Button
                  variant="outline"
                  onClick={() => router.push('/personal/billing')}
                >
                  <Crown className="w-4 h-4 mr-2" />
                  Upgrade to Pro
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Token Reveal Dialog */}
      <Dialog
        open={tokenRevealOpen}
        onOpenChange={(open) => {
          if (!open) {
            setNewTokenRaw(null);
            setCopied(false);
          }
          setTokenRevealOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API Token Created</DialogTitle>
            <DialogDescription>
              Copy your token now. It will not be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <pre className="bg-muted p-3 rounded-md text-xs break-all whitespace-pre-wrap font-mono">
                {newTokenRaw}
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2"
                onClick={handleCopyToken}
              >
                {copied ? (
                  <CheckCircle className="w-4 h-4 mr-1 text-green-500" />
                ) : (
                  <Copy className="w-4 h-4 mr-1" />
                )}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <div className="flex items-start gap-2 text-sm p-3 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Store this token securely. You will not be able to see it again after closing this dialog.
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Revoke Confirmation Dialog */}
      <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API Token</AlertDialogTitle>
            <AlertDialogDescription>
              This token will immediately stop working. Any scripts or tools
              using it will lose access. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRevokeTokenId(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevokeToken}
              disabled={revoking}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {revoking ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Ban className="w-4 h-4 mr-2" />
              )}
              Revoke Token
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
          {/* Clear Data Message */}
          {clearMessage && (
            <div
              className={`flex items-center gap-2 text-sm p-3 rounded-md ${
                clearMessage.type === 'success'
                  ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                  : 'bg-red-500/10 text-red-600 dark:text-red-400'
              }`}
            >
              {clearMessage.type === 'success' ? (
                <CheckCircle className="w-4 h-4 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 shrink-0" />
              )}
              {clearMessage.text}
            </div>
          )}

          {/* Clear Account Data */}
          <div className="flex items-center justify-between p-4 border border-amber-500/30 rounded-lg bg-amber-500/5">
            <div>
              <p className="font-medium text-sm">Clear Account Data</p>
              <p className="text-sm text-muted-foreground">
                Delete all expenses, income, budgets, goals, and other financial
                data. Your account, subscription, and API tokens remain.
              </p>
            </div>
            <AlertDialog
              open={clearDialogOpen}
              onOpenChange={setClearDialogOpen}
            >
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-amber-500/50 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
                >
                  <Eraser className="w-4 h-4 mr-2" />
                  Clear Data
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all account data?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all your financial data including
                    expenses, income, budgets, goals, recurring transactions, and
                    notifications. Your account, subscription, and API tokens will
                    remain intact.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-2 py-2">
                  <Label htmlFor="clearConfirmEmail">
                    Type <span className="font-mono font-bold">{user.email}</span>{' '}
                    to confirm:
                  </Label>
                  <Input
                    id="clearConfirmEmail"
                    value={clearConfirmEmail}
                    onChange={(e) => setClearConfirmEmail(e.target.value)}
                    placeholder="Enter your email to confirm"
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel
                    onClick={() => setClearConfirmEmail('')}
                  >
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleClearData}
                    disabled={
                      clearing || clearConfirmEmail !== user.email
                    }
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    {clearing ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Eraser className="w-4 h-4 mr-2" />
                    )}
                    Clear All Data
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {/* Delete Account */}
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

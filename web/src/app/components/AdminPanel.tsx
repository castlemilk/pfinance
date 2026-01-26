'use client';

import { useState } from 'react';
import { useAdmin } from '../context/AdminContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  Shield, 
  Users, 
  UserCheck, 
  LogOut,
  AlertTriangle,
  KeyRound
} from 'lucide-react';

export function AdminPanel() {
  const { 
    isAdminMode, 
    setIsAdminMode, 
    impersonatedUser, 
    availableTestUsers, 
    switchToUser, 
    exitImpersonation 
  } = useAdmin();
  const [showAdminDialog, setShowAdminDialog] = useState(false);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleToggleAdminMode = (checked: boolean) => {
    setIsAdminMode(checked);
    if (!checked) {
      exitImpersonation();
    }
  };

  return (
    <>
      {/* Admin Mode Indicator - Always visible when admin mode is on */}
      {isAdminMode && (
        <div className="fixed bottom-4 left-4 z-50">
          <Card className="bg-amber-500/10 border-amber-500/50 dark:bg-amber-500/20">
            <CardContent className="p-3 flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                Admin Mode Active
              </span>
              {impersonatedUser && (
                <Badge variant="secondary" className="ml-2">
                  {impersonatedUser.displayName}
                </Badge>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Admin Panel Dialog */}
      <TooltipProvider>
        <Tooltip>
          <Dialog open={showAdminDialog} onOpenChange={setShowAdminDialog}>
            <TooltipTrigger asChild>
              <DialogTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="relative"
                >
                  <Shield className={`w-4 h-4 ${isAdminMode ? 'text-amber-500' : ''}`} />
                  {isAdminMode && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                  )}
                </Button>
              </DialogTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p>Admin Panel</p>
              <p className="text-xs text-muted-foreground">⌘⇧A to toggle</p>
            </TooltipContent>
            <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Admin Panel
            </DialogTitle>
            <DialogDescription>
              Test multi-user features by impersonating different users
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 mt-6">
            {/* Admin Mode Toggle */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div className="space-y-0.5">
                <Label htmlFor="admin-mode" className="text-base font-medium">
                  Admin Mode
                </Label>
                <p className="text-sm text-muted-foreground">
                  Enable user impersonation for testing
                </p>
              </div>
              <Switch
                id="admin-mode"
                checked={isAdminMode}
                onCheckedChange={handleToggleAdminMode}
              />
            </div>

            {/* Warning */}
            {isAdminMode && (
              <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/50 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                    Test Mode Active
                  </p>
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    Data created in admin mode uses test user IDs. This is for testing multi-user features only.
                  </p>
                </div>
              </div>
            )}

            {/* Current User Status */}
            {isAdminMode && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <UserCheck className="w-4 h-4" />
                  Current Status
                </h3>
                <div className="p-4 border rounded-lg bg-muted/50">
                  {impersonatedUser ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar className="w-10 h-10">
                          <AvatarFallback>
                            {getInitials(impersonatedUser.displayName || 'U')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{impersonatedUser.displayName}</p>
                          <p className="text-sm text-muted-foreground">{impersonatedUser.email}</p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={exitImpersonation}
                      >
                        <LogOut className="w-4 h-4 mr-2" />
                        Exit
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      No user selected. Choose a test user below.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Test Users */}
            {isAdminMode && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Test Users
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {availableTestUsers.map((testUser) => {
                    const isActive = impersonatedUser?.uid === testUser.uid;
                    return (
                      <button
                        key={testUser.uid}
                        onClick={() => switchToUser(testUser.uid)}
                        className={`
                          p-4 border rounded-lg text-left transition-all
                          ${isActive 
                            ? 'border-primary bg-primary/5 shadow-sm' 
                            : 'hover:border-primary/50 hover:bg-muted/50'
                          }
                        `}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="w-8 h-8">
                            <AvatarFallback className="text-xs">
                              {getInitials(testUser.displayName || 'U')}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">
                              {testUser.displayName}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {testUser.email}
                            </p>
                          </div>
                          {isActive && (
                            <UserCheck className="w-4 h-4 text-primary flex-shrink-0" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick Actions */}
            {isAdminMode && impersonatedUser && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <KeyRound className="w-4 h-4" />
                  Quick Actions
                </h3>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>• Switch between users to test group interactions</p>
                  <p>• Create groups and invite other test users</p>
                  <p>• Add expenses as different users to test splitting</p>
                  <p>• Test role-based permissions (owner, admin, member)</p>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
          </Dialog>
        </Tooltip>
      </TooltipProvider>
    </>
  );
}
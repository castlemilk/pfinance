package service

import (
	"context"
	"fmt"
	"log"

	"connectrpc.com/connect"
	"firebase.google.com/go/v4/messaging"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/auth"
)

// SetFCMClient sets the Firebase Cloud Messaging client for push notifications.
func (s *FinanceService) SetFCMClient(client *messaging.Client) {
	s.fcmClient = client
}

// RegisterPushToken registers an FCM token for push notifications.
func (s *FinanceService) RegisterPushToken(ctx context.Context, req *connect.Request[pfinancev1.RegisterPushTokenRequest]) (*connect.Response[pfinancev1.RegisterPushTokenResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	token := req.Msg.FcmToken
	if token == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("fcm_token is required"))
	}

	// Get or create notification preferences
	prefs, err := s.store.GetNotificationPreferences(ctx, claims.UID)
	if err != nil {
		// Create default preferences if none exist
		prefs = &pfinancev1.NotificationPreferences{
			UserId:       claims.UID,
			BudgetAlerts: true,
		}
	}

	prefs.PushEnabled = true
	prefs.FcmToken = token

	if err := s.store.UpdateNotificationPreferences(ctx, prefs); err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("update notification preferences: %w", err))
	}

	log.Printf("[Push] Registered FCM token for user %s", claims.UID)

	return connect.NewResponse(&pfinancev1.RegisterPushTokenResponse{}), nil
}

// UnregisterPushToken removes the FCM token and disables push notifications.
func (s *FinanceService) UnregisterPushToken(ctx context.Context, req *connect.Request[pfinancev1.UnregisterPushTokenRequest]) (*connect.Response[pfinancev1.UnregisterPushTokenResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	prefs, err := s.store.GetNotificationPreferences(ctx, claims.UID)
	if err != nil {
		return connect.NewResponse(&pfinancev1.UnregisterPushTokenResponse{}), nil
	}

	prefs.PushEnabled = false
	prefs.FcmToken = ""

	if err := s.store.UpdateNotificationPreferences(ctx, prefs); err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("update notification preferences: %w", err))
	}

	log.Printf("[Push] Unregistered FCM token for user %s", claims.UID)

	return connect.NewResponse(&pfinancev1.UnregisterPushTokenResponse{}), nil
}

// SendPushNotification sends a push notification via FCM if the user has push enabled.
// This is fire-and-forget — errors are logged but never returned.
func (s *FinanceService) SendPushNotification(ctx context.Context, userID string, title, body, actionURL string) {
	if s.fcmClient == nil {
		return
	}

	prefs, err := s.store.GetNotificationPreferences(ctx, userID)
	if err != nil || !prefs.PushEnabled || prefs.FcmToken == "" {
		return
	}

	message := &messaging.Message{
		Token: prefs.FcmToken,
		Notification: &messaging.Notification{
			Title: title,
			Body:  body,
		},
		Webpush: &messaging.WebpushConfig{
			FCMOptions: &messaging.WebpushFCMOptions{
				Link: actionURL,
			},
		},
	}

	if _, err := s.fcmClient.Send(ctx, message); err != nil {
		log.Printf("[Push] Failed to send push to user %s: %v", userID, err)
	}
}

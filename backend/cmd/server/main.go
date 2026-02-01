package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"

	"cloud.google.com/go/firestore"
	"connectrpc.com/connect"
	"github.com/castlemilk/pfinance/backend/gen/pfinance/v1/pfinancev1connect"
	"github.com/castlemilk/pfinance/backend/internal/auth"
	"github.com/castlemilk/pfinance/backend/internal/service"
	"github.com/castlemilk/pfinance/backend/internal/store"
	"github.com/rs/cors"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"
)

func main() {
	// Get port from environment or use default
	// NOTE: Default is 8111 to avoid conflicts with other projects (not 8080)
	port := os.Getenv("PORT")
	if port == "" {
		port = "8111"
	}

	// Initialize context
	ctx := context.Background()

	// Determine if we're running locally
	useMemoryStore := os.Getenv("USE_MEMORY_STORE") == "true" || os.Getenv("ENV") == "local"
	skipAuth := os.Getenv("SKIP_AUTH") == "true"

	var storeImpl store.Store
	var firebaseAuth *auth.FirebaseAuth

	if useMemoryStore {
		log.Println("Using in-memory store for local development")
		storeImpl = store.NewMemoryStore()

		// For local development with memory store, always use mock authentication
		// This makes the dev experience seamless - no need to set up Firebase auth locally
		log.Println("✅ Using mock authentication for local development")
		firebaseAuth = nil
	} else {
		// Production mode - use Firestore
		projectID := os.Getenv("GOOGLE_CLOUD_PROJECT")
		if projectID == "" {
			projectID = "pfinance-app-1748773335"
		}

		firestoreClient, err := firestore.NewClient(ctx, projectID)
		if err != nil {
			log.Fatalf("Failed to create Firestore client: %v", err)
		}
		defer firestoreClient.Close()

		// Initialize Firebase Auth (unless SKIP_AUTH is set for seeding/testing)
		if skipAuth {
			log.Println("⚠️  SKIP_AUTH enabled - using mock authentication with Firestore (for seeding/testing only)")
			firebaseAuth = nil
		} else {
			firebaseAuth, err = auth.NewFirebaseAuth(ctx)
			if err != nil {
				log.Fatalf("Failed to initialize Firebase Auth: %v", err)
			}
		}

		storeImpl = store.NewFirestoreStore(firestoreClient)
	}

	// Create the finance service
	financeService := service.NewFinanceService(storeImpl)

	// Create Connect handler with conditional auth interceptor
	var interceptors []connect.Interceptor

	// Add debug interceptor first (for impersonation support in dev mode)
	// skipAuth is already defined at the top from env var
	interceptors = append(interceptors, auth.DebugAuthInterceptor(skipAuth))

	if firebaseAuth != nil {
		interceptors = append(interceptors, auth.AuthInterceptor(firebaseAuth))
	} else {
		// For local development without auth, add a mock user context
		interceptors = append(interceptors, auth.LocalDevInterceptor())
	}

	path, handler := pfinancev1connect.NewFinanceServiceHandler(
		financeService,
		connect.WithInterceptors(interceptors...),
	)

	// Create mux and register handler
	mux := http.NewServeMux()
	mux.Handle(path, handler)

	// Add health check endpoint
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	// Set up CORS
	// NOTE: Frontend runs on port 1234, not 3000
	c := cors.New(cors.Options{
		AllowedOrigins: []string{
			"http://localhost:1234",    // Local frontend
			"http://127.0.0.1:1234",    // Alternative local
			"https://pfinance.dev",     // Production custom domain
			"https://www.pfinance.dev", // Production www subdomain
			"https://pfinance-app-1748773335.web.app",
			"https://pfinance-app-1748773335.firebaseapp.com",
			"https://*.vercel.app", // Vercel preview deployments
		},
		AllowedMethods: []string{
			http.MethodGet,
			http.MethodPost,
			http.MethodPut,
			http.MethodDelete,
			http.MethodOptions,
		},
		AllowedHeaders: []string{
			"Accept",
			"Authorization",
			"Connect-Protocol-Version",
			"Connect-Timeout-Ms",
			"Content-Type",
			"Grpc-Timeout",
			"User-Agent",
			"X-Grpc-Web",
			"X-User-Agent",
			"X-Debug-User-ID",
			"X-Debug-User-Email",
			"X-Debug-User-Name",
			"X-Debug-Impersonate-User",
		},
		ExposedHeaders: []string{
			"Grpc-Status",
			"Grpc-Message",
			"Grpc-Status-Details-Bin",
		},
		AllowCredentials: true,
	})

	// Wrap handler with CORS
	handler = c.Handler(mux)

	// Create HTTP/2 server
	srv := &http.Server{
		Addr:    fmt.Sprintf(":%s", port),
		Handler: h2c.NewHandler(handler, &http2.Server{}),
	}

	log.Printf("Starting server on port %s", port)
	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

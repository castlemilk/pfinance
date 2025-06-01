package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"

	"cloud.google.com/go/firestore"
	"github.com/bufbuild/connect-go"
	"github.com/castlemilk/pfinance/backend/gen/pfinance/v1/pfinancev1connect"
	"github.com/castlemilk/pfinance/backend/internal/service"
	"github.com/castlemilk/pfinance/backend/internal/store"
	"github.com/rs/cors"
	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"
)

func main() {
	// Get port from environment or use default
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Initialize Firestore client
	ctx := context.Background()
	projectID := os.Getenv("GOOGLE_CLOUD_PROJECT")
	if projectID == "" {
		projectID = "pfinance-app-1748773335"
	}

	firestoreClient, err := firestore.NewClient(ctx, projectID)
	if err != nil {
		log.Fatalf("Failed to create Firestore client: %v", err)
	}
	defer firestoreClient.Close()

	// Create the store and finance service
	firestoreStore := store.NewFirestoreStore(firestoreClient)
	financeService := service.NewFinanceService(firestoreStore)

	// Create Connect handler
	path, handler := pfinancev1connect.NewFinanceServiceHandler(
		financeService,
		connect.WithInterceptors(
			// Add any interceptors here (auth, logging, etc.)
		),
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
	c := cors.New(cors.Options{
		AllowedOrigins: []string{
			"http://localhost:3000",
			"https://pfinance-app-1748773335.web.app",
			"https://pfinance-app-1748773335.firebaseapp.com",
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
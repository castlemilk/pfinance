package extraction

import (
	"fmt"
	"sync"
	"time"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// JobPublisher is an optional sink that receives every Create/Update so an
// external store (e.g. Firestore) can mirror job state for real-time clients.
// Errors are logged but never block the in-memory store update — the RPC path
// (GetJob) continues to work even if the publisher is broken or absent.
type JobPublisher func(job *pfinancev1.ExtractionJob)

// JobStore manages in-memory async extraction jobs.
type JobStore struct {
	mu      sync.RWMutex
	jobs    map[string]*pfinancev1.ExtractionJob
	ttl     time.Duration
	done    chan struct{}
	publish JobPublisher // optional; called after every Create/Update
}

// NewJobStore creates a new job store with background cleanup.
func NewJobStore(ttl time.Duration) *JobStore {
	js := &JobStore{
		jobs: make(map[string]*pfinancev1.ExtractionJob),
		ttl:  ttl,
		done: make(chan struct{}),
	}
	go js.cleanup()
	return js
}

// SetPublisher installs a publisher that receives every Create/Update. Replaces
// any previous publisher. Pass nil to disable. Safe to call before clients
// start hitting the store; for live wiring, prefer constructor-time injection.
func (js *JobStore) SetPublisher(p JobPublisher) {
	js.mu.Lock()
	defer js.mu.Unlock()
	js.publish = p
}

// Create stores a new extraction job.
func (js *JobStore) Create(job *pfinancev1.ExtractionJob) error {
	if job.Id == "" {
		return fmt.Errorf("job ID is required")
	}
	js.mu.Lock()
	js.jobs[job.Id] = job
	publish := js.publish
	js.mu.Unlock()
	if publish != nil {
		publish(job)
	}
	return nil
}

// Get retrieves a job by ID.
func (js *JobStore) Get(id string) (*pfinancev1.ExtractionJob, error) {
	js.mu.RLock()
	defer js.mu.RUnlock()
	job, ok := js.jobs[id]
	if !ok {
		return nil, fmt.Errorf("job not found: %s", id)
	}
	return job, nil
}

// Update modifies an existing job.
func (js *JobStore) Update(job *pfinancev1.ExtractionJob) error {
	js.mu.Lock()
	if _, ok := js.jobs[job.Id]; !ok {
		js.mu.Unlock()
		return fmt.Errorf("job not found: %s", job.Id)
	}
	js.jobs[job.Id] = job
	publish := js.publish
	js.mu.Unlock()
	if publish != nil {
		publish(job)
	}
	return nil
}

// Stop signals the background cleanup goroutine to exit.
func (js *JobStore) Stop() {
	close(js.done)
}

func (js *JobStore) cleanup() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-js.done:
			return
		case <-ticker.C:
			js.mu.Lock()
			now := time.Now()
			for id, job := range js.jobs {
				if job.CreatedAt != nil && now.Sub(job.CreatedAt.AsTime()) > js.ttl {
					delete(js.jobs, id)
				}
			}
			js.mu.Unlock()
		}
	}
}

// NewExtractionJob creates a new extraction job proto.
func NewExtractionJobProto(id, userID string, docType pfinancev1.DocumentType, filename string, method pfinancev1.ExtractionMethod) *pfinancev1.ExtractionJob {
	return &pfinancev1.ExtractionJob{
		Id:               id,
		UserId:           userID,
		Status:           pfinancev1.ExtractionStatus_EXTRACTION_STATUS_PENDING,
		DocumentType:     docType,
		OriginalFilename: filename,
		CreatedAt:        timestamppb.Now(),
		Method:           method,
	}
}

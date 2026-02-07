package extraction

import (
	"fmt"
	"sync"
	"time"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// JobStore manages in-memory async extraction jobs.
type JobStore struct {
	mu   sync.RWMutex
	jobs map[string]*pfinancev1.ExtractionJob
	ttl  time.Duration
	done chan struct{}
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

// Create stores a new extraction job.
func (js *JobStore) Create(job *pfinancev1.ExtractionJob) error {
	if job.Id == "" {
		return fmt.Errorf("job ID is required")
	}
	js.mu.Lock()
	defer js.mu.Unlock()
	js.jobs[job.Id] = job
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
	defer js.mu.Unlock()
	if _, ok := js.jobs[job.Id]; !ok {
		return fmt.Errorf("job not found: %s", job.Id)
	}
	js.jobs[job.Id] = job
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

package service

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/auth"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// maxSalaryCalcStateBytes caps payload size to keep Firestore docs cheap and
// to make malicious or accidental bloat fail loudly. Typical state for a
// fully-configured calculator is 10–20 KB; 100 KB leaves plenty of headroom.
const maxSalaryCalcStateBytes = 100 * 1024

// GetSalaryCalculatorState returns the authenticated user's saved calculator
// state, or empty when none has been saved yet.
func (s *FinanceService) GetSalaryCalculatorState(
	ctx context.Context,
	_ *connect.Request[pfinancev1.GetSalaryCalculatorStateRequest],
) (*connect.Response[pfinancev1.GetSalaryCalculatorStateResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	stateJSON, updatedAt, err := s.store.GetSalaryCalculatorState(ctx, claims.UID)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("load salary calculator state: %w", err))
	}

	resp := &pfinancev1.GetSalaryCalculatorStateResponse{
		StateJson: stateJSON,
	}
	if !updatedAt.IsZero() {
		resp.UpdatedAt = timestamppb.New(updatedAt)
	}
	return connect.NewResponse(resp), nil
}

// SaveSalaryCalculatorState persists the authenticated user's calculator
// state. The payload must be a JSON object (we don't enforce a schema —
// the calculator UI evolves frequently and validation belongs client-side).
func (s *FinanceService) SaveSalaryCalculatorState(
	ctx context.Context,
	req *connect.Request[pfinancev1.SaveSalaryCalculatorStateRequest],
) (*connect.Response[pfinancev1.SaveSalaryCalculatorStateResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	stateJSON := req.Msg.StateJson
	if stateJSON == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("state_json is required (use empty {} to reset)"))
	}
	if len(stateJSON) > maxSalaryCalcStateBytes {
		return nil, connect.NewError(connect.CodeInvalidArgument,
			fmt.Errorf("state_json exceeds %d bytes (got %d) — calculator state should not grow this large; please report this", maxSalaryCalcStateBytes, len(stateJSON)))
	}

	// Cheap structural sanity check — must be a JSON object, not arbitrary
	// text. Fails fast on garbage payloads before they hit Firestore.
	var probe map[string]interface{}
	if err := json.Unmarshal([]byte(stateJSON), &probe); err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("state_json must be a JSON object: %w", err))
	}

	now := time.Now().UTC()
	if err := s.store.SaveSalaryCalculatorState(ctx, claims.UID, stateJSON, now); err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("save salary calculator state: %w", err))
	}
	return connect.NewResponse(&pfinancev1.SaveSalaryCalculatorStateResponse{
		UpdatedAt: timestamppb.New(now),
	}), nil
}

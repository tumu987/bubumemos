package store

import (
	"context"
	"database/sql"

	"google.golang.org/protobuf/encoding/protojson"
)

// txContextKey is used to pass a database transaction through context.
type txContextKey struct{}

// WithTxContext embeds a sql.Tx in the context so driver methods can use it.
func WithTxContext(ctx context.Context, tx *sql.Tx) context.Context {
	return context.WithValue(ctx, txContextKey{}, tx)
}

// TxFromContext extracts a sql.Tx from the context, or nil.
func TxFromContext(ctx context.Context) *sql.Tx {
	tx, _ := ctx.Value(txContextKey{}).(*sql.Tx)
	return tx
}

var (
	protojsonUnmarshaler = protojson.UnmarshalOptions{
		AllowPartial:   true,
		DiscardUnknown: true,
	}
)

// RowStatus is the status for a row.
type RowStatus string

const (
	// Normal is the status for a normal row.
	Normal RowStatus = "NORMAL"
	// Archived is the status for an archived row.
	Archived RowStatus = "ARCHIVED"
)

func (r RowStatus) String() string {
	return string(r)
}

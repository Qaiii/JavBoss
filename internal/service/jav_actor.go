package service

import (
	"context"
	"errors"
	"strings"

	"javboss/internal/common/logging"
	"javboss/internal/db"
	"javboss/internal/jav"
)

var lookupMaleActorsByCode = jav.LookupMaleActorsByCode

// EnrichJavMaleActors looks up AVDanyuWiki male performers for a library JAV
// and stores them when the row has none yet.
func EnrichJavMaleActors(ctx context.Context, javID int64, code string) {
	if javID <= 0 {
		return
	}
	code = strings.TrimSpace(code)
	if code == "" {
		return
	}
	names, err := lookupMaleActorsByCode(code)
	if err != nil {
		if !errors.Is(err, jav.ResourceNotFonud) {
			logging.Error("lookup male actors failed id=%d code=%s err=%v", javID, code, err)
		}
		return
	}
	if len(names) == 0 {
		return
	}
	updated, err := db.AppendJavActorsIfMissing(ctx, javID, names)
	if err != nil {
		logging.Error("save male actors failed id=%d code=%s err=%v", javID, code, err)
		return
	}
	if updated {
		logging.Info("jav male actors updated id=%d code=%s count=%d", javID, code, len(names))
	}
}

// EnqueueMaleActorLookup scrapes male performers after a JAV row is saved.
func EnqueueMaleActorLookup(ctx context.Context, javID int64, code string) {
	if javID <= 0 || strings.TrimSpace(code) == "" {
		return
	}
	go EnrichJavMaleActors(context.WithoutCancel(ctx), javID, code)
}

func scanMissingJavMaleActors(ctx context.Context) error {
	items, err := db.ListJavsMissingActors(ctx)
	if err != nil {
		return err
	}
	for _, item := range items {
		if err := ctx.Err(); err != nil {
			return err
		}
		EnrichJavMaleActors(ctx, item.ID, item.Code)
	}
	return nil
}

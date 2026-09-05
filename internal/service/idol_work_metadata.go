package service

import (
	"context"
	"errors"
	"strings"
	"sync"
	"time"

	"javboss/internal/common/logging"
	dbpkg "javboss/internal/db"
	"javboss/internal/jav"
)

const (
	idolWorkMetadataQueueSize = 5000
)

var idolWorkMetadataDelay = 1500 * time.Millisecond

var (
	idolWorkMetadataOnce sync.Once
	idolWorkMetadataMgr  *idolWorkMetadataManager

	lookupJavForIdolWorkMetadata = jav.LookupJavByCode
	lookupMissAVChineseTitle     = jav.LookupMissAVChineseTitle
)

type idolWorkMetadataManager struct {
	tasks     chan string
	mu        sync.Mutex
	scheduled map[string]struct{}
}

func idolWorkMetadataProviders() []jav.Provider {
	return []jav.Provider{
		jav.ProviderJavBus,
		jav.ProviderJavDB,
		jav.ProviderAvmoo,
		jav.ProviderJavDatabase,
	}
}

// InitIdolWorkMetadataEnricher creates the background queue that fills
// studio/series/tags on unimported idol-work cards from movie detail pages
// and Chinese titles from MissAV.
func InitIdolWorkMetadataEnricher() {
	idolWorkMetadataOnce.Do(func() {
		idolWorkMetadataMgr = &idolWorkMetadataManager{
			tasks:     make(chan string, idolWorkMetadataQueueSize),
			scheduled: make(map[string]struct{}),
		}
	})
}

// StartIdolWorkMetadataEnricher launches a single worker and queues every
// stored work that still lacks card metadata or a Chinese title.
func StartIdolWorkMetadataEnricher(ctx context.Context) {
	InitIdolWorkMetadataEnricher()
	if idolWorkMetadataMgr == nil {
		return
	}
	go idolWorkMetadataMgr.worker(ctx)
	codes, err := dbpkg.ListIdolWorkCodesNeedingMetadata(ctx)
	if err != nil {
		logging.Error("list idol works needing metadata: %v", err)
	} else {
		EnqueueIdolWorkMetadata(codes...)
		if len(codes) > 0 {
			logging.Info("queued %d idol works for studio/series/tag lookup", len(codes))
		}
	}
	titleCodes, err := dbpkg.ListCodesMissingTitleZH(ctx)
	if err != nil {
		logging.Error("list codes missing title_zh: %v", err)
		return
	}
	EnqueueIdolWorkMetadata(titleCodes...)
	if len(titleCodes) > 0 {
		logging.Info("queued %d codes for MissAV Chinese title lookup", len(titleCodes))
	}
}

// EnqueueIdolWorkMetadata schedules movie-detail lookups for the given codes.
func EnqueueIdolWorkMetadata(codes ...string) {
	if idolWorkMetadataMgr == nil {
		return
	}
	for _, code := range codes {
		idolWorkMetadataMgr.enqueue(code)
	}
}

// TryEnqueueIdolWorkMetadata schedules one unimported-work metadata lookup
// without blocking when the queue is full.
func TryEnqueueIdolWorkMetadata(code string) bool {
	InitIdolWorkMetadataEnricher()
	if idolWorkMetadataMgr == nil {
		return false
	}
	return idolWorkMetadataMgr.tryEnqueue(code)
}

// IdolWorkMetadataPendingCount returns how many unimported metadata jobs are queued or in flight.
func IdolWorkMetadataPendingCount() int {
	if idolWorkMetadataMgr == nil {
		return 0
	}
	return idolWorkMetadataMgr.pendingCount()
}

func (m *idolWorkMetadataManager) enqueue(code string) {
	_ = m.tryEnqueue(code)
}

func (m *idolWorkMetadataManager) tryEnqueue(code string) bool {
	if m == nil || m.tasks == nil {
		return false
	}
	code = strings.ToUpper(strings.TrimSpace(code))
	if code == "" {
		return false
	}
	m.mu.Lock()
	if _, ok := m.scheduled[code]; ok {
		m.mu.Unlock()
		return true
	}
	m.scheduled[code] = struct{}{}
	m.mu.Unlock()
	select {
	case m.tasks <- code:
		return true
	default:
		m.mu.Lock()
		delete(m.scheduled, code)
		m.mu.Unlock()
		logging.Error("idol work metadata queue full, dropped %s", code)
		return false
	}
}

func (m *idolWorkMetadataManager) pendingCount() int {
	if m == nil {
		return 0
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.scheduled)
}

func (m *idolWorkMetadataManager) clearScheduled(code string) {
	m.mu.Lock()
	delete(m.scheduled, code)
	m.mu.Unlock()
}

func idolWorkMetadataResetForTest(mgr *idolWorkMetadataManager) {
	idolWorkMetadataOnce = sync.Once{}
	idolWorkMetadataMgr = mgr
	if mgr != nil {
		idolWorkMetadataOnce.Do(func() {})
	}
}

func (m *idolWorkMetadataManager) worker(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case code := <-m.tasks:
			func() {
				defer m.clearScheduled(code)
				if err := enrichIdolWorkMetadata(ctx, code); err != nil {
					logging.Error("enrich idol work metadata code=%s: %v", code, err)
				}
			}()
		}
	}
}

func enrichIdolWorkMetadata(ctx context.Context, code string) error {
	code = strings.TrimSpace(code)
	if code == "" {
		return errors.New("empty code")
	}
	if err := ctx.Err(); err != nil {
		return err
	}

	needsCard, err := dbpkg.CodeNeedsIdolWorkCardMetadata(ctx, code)
	if err != nil {
		return err
	}
	needsScrape, err := dbpkg.CodeNeedsUnimportedScrapeRepair(ctx, code)
	if err != nil {
		return err
	}
	needsTitleZH, err := dbpkg.CodeNeedsTitleZH(ctx, code)
	if err != nil {
		return err
	}

	var lastErr error
	didHTTP := false
	if needsCard || needsScrape {
		if info := jav.CachedJavInfo(code); idolWorkInfoHasCardMetadata(info) {
			if err := dbpkg.ApplyJavInfoToIdolWorks(ctx, info); err != nil {
				return err
			}
		} else {
			var found bool
			for _, provider := range idolWorkMetadataProviders() {
				if err := ctx.Err(); err != nil {
					return err
				}
				info, lookupErr := lookupJavForIdolWorkMetadata(code, provider)
				didHTTP = true
				if lookupErr != nil {
					lastErr = lookupErr
					if !errors.Is(lookupErr, jav.ResourceNotFonud) {
						logging.Error("idol work metadata lookup provider=%s code=%s: %v", provider.String(), code, lookupErr)
					}
					continue
				}
				if !idolWorkInfoHasCardMetadata(info) {
					continue
				}
				if err := dbpkg.ApplyJavInfoToIdolWorks(ctx, info); err != nil {
					return err
				}
				found = true
				break
			}
			if !found && lastErr == nil {
				lastErr = jav.ResourceNotFonud
			}
		}
	}

	if needsTitleZH {
		if err := ctx.Err(); err != nil {
			return err
		}
		titleZH, titleErr := lookupMissAVChineseTitle(code)
		didHTTP = true
		if titleErr != nil {
			if lastErr == nil {
				lastErr = titleErr
			}
			if !errors.Is(titleErr, jav.ResourceNotFonud) {
				logging.Error("missav chinese title code=%s: %v", code, titleErr)
			}
		} else if err := dbpkg.ApplyTitleZH(ctx, code, titleZH); err != nil {
			return err
		}
	}

	if didHTTP && !sleepWithJitter(ctx, idolWorkMetadataDelay, 0) {
		return ctx.Err()
	}
	return lastErr
}

func idolWorkInfoHasCardMetadata(info *jav.JavInfo) bool {
	if info == nil {
		return false
	}
	return strings.TrimSpace(info.Studio) != "" || strings.TrimSpace(info.Series) != "" || len(info.Tags) > 0
}

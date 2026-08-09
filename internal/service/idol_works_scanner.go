package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"javboss/internal/common/logging"
	dbpkg "javboss/internal/db"
	"javboss/internal/jav"
	"javboss/internal/models"
)

// IdolWorksManager owns the background queue that scrapes the full JavDB works
// list for tracked idols. It runs a single worker so requests stay serialized
// and rate-limited (JavDB itself throttles to one request per 500ms, and an
// extra per-page delay keeps bursts low).
type IdolWorksManager struct {
	tasks     chan int64
	mu        sync.Mutex
	scheduled map[int64]struct{}
	pageDelay time.Duration
}

const (
	idolWorksQueueSize = 5000
	// idolWorksPageDelay is the extra pause between consecutive pages of one
	// idol's works listing, on top of the provider rate limiter.
	idolWorksPageDelay = 2 * time.Second
	// maxProfileCodes caps how many library codes are tried when resolving the
	// idol's JavDB profile URL.
	maxProfileCodes = 6
)

var (
	idolWorksManagerOnce sync.Once
	idolWorksMgr         *IdolWorksManager

	// Injectable for tests.
	lookupActressURLByCodeAndName = jav.LookupActressURLByCodeAndName
	listJavWorksByActressURL      = jav.ListJavWorksByActressURL
)

// OverrideLookupActressURL replaces the JavDB profile-URL resolver (tests only).
func OverrideLookupActressURL(fn func(code, name string, provider jav.Provider) (string, error)) {
	if fn != nil {
		lookupActressURLByCodeAndName = fn
	}
}

// OverrideListJavWorks replaces the JavDB works-list fetcher (tests only).
func OverrideListJavWorks(fn func(ctx context.Context, profileURL string, page int) ([]*jav.JavInfo, bool, error)) {
	if fn != nil {
		listJavWorksByActressURL = fn
	}
}

// InitIdolWorksManager creates the process-wide works manager.
func InitIdolWorksManager() *IdolWorksManager {
	idolWorksManagerOnce.Do(func() {
		idolWorksMgr = &IdolWorksManager{
			tasks:     make(chan int64, idolWorksQueueSize),
			scheduled: make(map[int64]struct{}),
			pageDelay: idolWorksPageDelay,
		}
	})
	return idolWorksMgr
}

// StartIdolWorksScanner launches the single background worker.
func StartIdolWorksScanner(ctx context.Context) {
	if idolWorksMgr == nil {
		InitIdolWorksManager()
	}
	go idolWorksMgr.worker(ctx)
}

// EnqueueIdolWorks schedules an idol for a full JavDB works scrape. Idempotent:
// idols already queued (or currently being processed) are skipped.
func EnqueueIdolWorks(idolID int64) {
	if idolWorksMgr == nil || idolID <= 0 {
		return
	}
	idolWorksMgr.enqueue(idolID)
}

func (m *IdolWorksManager) enqueue(idolID int64) {
	if m == nil || m.tasks == nil || idolID <= 0 {
		return
	}
	m.mu.Lock()
	if _, ok := m.scheduled[idolID]; ok {
		m.mu.Unlock()
		return
	}
	m.scheduled[idolID] = struct{}{}
	m.mu.Unlock()
	m.tasks <- idolID
}

func (m *IdolWorksManager) clearScheduled(idolID int64) {
	m.mu.Lock()
	delete(m.scheduled, idolID)
	m.mu.Unlock()
}

func (m *IdolWorksManager) worker(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case idolID := <-m.tasks:
			if err := ScrapeIdolWorks(ctx, idolID); err != nil {
				logging.Error("scrape idol works idol_id=%d: %v", idolID, err)
			}
			m.clearScheduled(idolID)
		}
	}
}

// EnqueueIdolWorksForActors looks up the library idols matching the given
// actor names and queues each one for a works scrape. Call it after a JAV
// record has been persisted (the idol rows already exist by then). Idols that
// were scraped within the configured refresh interval are skipped, so ordinary
// re-imports do not re-scrape the same idol repeatedly.
func EnqueueIdolWorksForActors(ctx context.Context, actorNames []string) {
	if idolWorksMgr == nil || len(actorNames) == 0 {
		return
	}
	ids, err := dbpkg.FindJavIdolsByNames(ctx, actorNames)
	if err != nil {
		logging.Error("find idols by names for works scrape: %v", err)
		return
	}
	days := dbpkg.JavIdolRefreshDays(ctx)
	dueSince := time.Now().Add(-time.Duration(days) * 24 * time.Hour)
	for _, id := range ids {
		track, err := dbpkg.GetJavIdolTrack(ctx, id)
		if err != nil {
			logging.Error("check idol track id=%d: %v", id, err)
			continue
		}
		if track.Tracked && track.LastScrapedAt != nil && track.LastScrapedAt.After(dueSince) {
			continue
		}
		idolWorksMgr.enqueue(id)
	}
}

// ScrapeIdolWorks resolves the idol's JavDB profile URL (when needed) and
// fetches every page of her works list, persisting the result. Failures update
// the track row's last_error so the next scheduled refresh retries.
func ScrapeIdolWorks(ctx context.Context, idolID int64) error {
	item, err := dbpkg.GetJavIdolBasic(ctx, idolID)
	if err != nil {
		return fmt.Errorf("load idol: %w", err)
	}

	track, err := dbpkg.GetJavIdolTrack(ctx, idolID)
	if err != nil {
		return err
	}

	profileURL := strings.TrimSpace(track.JavdbURL)
	if profileURL == "" {
		profileURL, err = lookupJavDBProfileURL(ctx, item)
		if err != nil {
			_ = dbpkg.MarkJavIdolTrackError(ctx, idolID, err)
			return fmt.Errorf("resolve javdb profile url: %w", err)
		}
	}

	works := make([]models.JavIdolWork, 0, 96)
	page := 1
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		items, hasNext, err := listJavWorksByActressURL(ctx, profileURL, page)
		if err != nil {
			_ = dbpkg.MarkJavIdolTrackError(ctx, idolID, err)
			return fmt.Errorf("list javdb works page %d: %w", page, err)
		}
		for _, w := range items {
			if w == nil || strings.TrimSpace(w.Code) == "" {
				continue
			}
			sourceURL := ""
			if len(w.SampleImages) > 0 && w.SampleImages[0].DetailURL != "" {
				sourceURL = w.SampleImages[0].DetailURL
			}
			works = append(works, models.JavIdolWork{
				JavIdolID:   idolID,
				Code:        strings.TrimSpace(w.Code),
				Title:       strings.TrimSpace(w.Title),
				CoverURL:    w.CoverURL,
				ReleaseUnix: w.ReleaseUnix,
				DurationMin: w.DurationMin,
				SourceURL:   sourceURL,
			})
		}
		if !hasNext {
			break
		}
		page++
		pageDelay := idolWorksPageDelay
		if idolWorksMgr != nil && idolWorksMgr.pageDelay > 0 {
			pageDelay = idolWorksMgr.pageDelay
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(pageDelay):
		}
	}

	if err := dbpkg.ReplaceJavIdolWorks(ctx, idolID, works); err != nil {
		return err
	}
	return dbpkg.MarkJavIdolTrackScraped(ctx, idolID, profileURL, len(works), time.Now())
}

// StartIdolWorksRefreshScheduler periodically enqueues every tracked idol
// whose last scrape is older than the configured refresh interval.
func StartIdolWorksRefreshScheduler(ctx context.Context, checkInterval time.Duration) {
	go func() {
		ticker := time.NewTicker(checkInterval)
		defer ticker.Stop()
		for {
			refreshDueIdolWorks(ctx)
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
}

func refreshDueIdolWorks(ctx context.Context) {
	days := dbpkg.JavIdolRefreshDays(ctx)
	since := time.Now().Add(-time.Duration(days) * 24 * time.Hour)
	ids, err := dbpkg.ListIdolsNeedingWorksScrape(ctx, since)
	if err != nil {
		logging.Error("list idol works refreshes: %v", err)
		return
	}
	if len(ids) == 0 {
		return
	}
	logging.Info("queued %d idols for works scrape/refresh (interval %dd)", len(ids), days)
	for _, id := range ids {
		if idolWorksMgr == nil {
			return
		}
		idolWorksMgr.enqueue(id)
	}
}

// lookupJavDBProfileURL resolves the idol's JavDB profile URL using one of her
// in-library codes and a candidate name, trying each code/name combination
// until one resolves. Solo codes are preferred, mirroring cover selection.
func lookupJavDBProfileURL(ctx context.Context, item *models.JavIdol) (string, error) {
	codes, err := dbpkg.ListIdolCoverCodes(ctx, item.ID, nil)
	if err != nil {
		return "", err
	}
	if len(codes) == 0 {
		return "", jav.ResourceNotFonud
	}
	if len(codes) > maxProfileCodes {
		codes = codes[:maxProfileCodes]
	}

	names := make([]string, 0, 4)
	for _, name := range []string{item.JapaneseName, item.Name, item.ChineseName, item.RomanName} {
		name = strings.TrimSpace(name)
		if name != "" {
			names = append(names, name)
		}
	}

	for _, code := range codes {
		for _, name := range names {
			profileURL, err := lookupActressURLByCodeAndName(code, name, jav.ProviderJavDB)
			if err == nil {
				return profileURL, nil
			}
			if !errors.Is(err, jav.ResourceNotFonud) {
				// Fail fast on network/HTTP errors: retrying every code/name
				// pair would only multiply the same failing requests.
				return "", err
			}
		}
	}
	return "", jav.ResourceNotFonud
}

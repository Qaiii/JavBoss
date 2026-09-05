package service

import (
	"context"
	"errors"
	"fmt"
	"math/rand"
	"strings"
	"sync"
	"time"

	"javboss/internal/common/logging"
	dbpkg "javboss/internal/db"
	"javboss/internal/jav"
	"javboss/internal/models"
)

// IdolWorksManager owns the background queue that scrapes the full works list
// for tracked idols. It runs a single worker so requests stay serialized and
// rate-limited, and the chosen provider changes between runs (and falls back
// to another provider on failure) so no single site is hammered.
type IdolWorksManager struct {
	tasks              chan int64
	mu                 sync.Mutex
	scheduled          map[int64]struct{}
	pageDelay          time.Duration
	pageDelayJitter    time.Duration
	sourceSwitchDelay  time.Duration
	sourceSwitchJitter time.Duration
}

const (
	idolWorksQueueSize = 5000
	// idolWorksPageDelayBase is the base pause between consecutive pages of one
	// idol's works listing. A random jitter of up to idolWorksPageDelayJitter is
	// added so request timing does not look like a fixed-interval crawler.
	idolWorksPageDelayBase   = 3 * time.Second
	idolWorksPageDelayJitter = 4 * time.Second
	// sourceSwitchDelayBase / Jitter pause before retrying on another provider
	// after one fails, again with a random jitter.
	sourceSwitchDelayBase   = 4 * time.Second
	sourceSwitchDelayJitter = 6 * time.Second
	// maxProfileCodes caps how many library codes are tried when resolving the
	// idol's profile URL on any provider.
	maxProfileCodes = 6
)

var (
	idolWorksManagerOnce sync.Once
	idolWorksMgr         *IdolWorksManager

	// Injectable for tests.
	lookupActressURLByCodeAndName = jav.LookupActressURLByCodeAndName
	listJavWorksByActressURL      = jav.ListJavWorksByActressURL
	// resolveJavDatabaseProfileURL resolves a JavDatabase profile URL for an
	// idol from one of her in-library codes (its lookup is code-driven rather
	// than code+name driven). Injectable for tests.
	resolveJavDatabaseProfileURL = lookupJavDatabaseProfileURL
	// listJavDatabaseWorksByActressURL lists one page of an idol's works from
	// her JavDatabase profile page. Injectable for tests.
	listJavDatabaseWorksByActressURL = jav.ListJavDatabaseWorksByActressURL
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

// OverrideJavDatabaseProfileResolver replaces the JavDatabase profile-URL
// resolver (tests only).
func OverrideJavDatabaseProfileResolver(fn func(ctx context.Context, item *models.JavIdol) (string, error)) {
	if fn != nil {
		resolveJavDatabaseProfileURL = fn
	}
}

// OverrideJavDatabaseWorksList replaces the JavDatabase works-list fetcher
// (tests only).
func OverrideJavDatabaseWorksList(fn func(ctx context.Context, profileURL string, page int) ([]*jav.JavInfo, bool, error)) {
	if fn != nil {
		listJavDatabaseWorksByActressURL = fn
	}
}

// InitIdolWorksManager creates the process-wide works manager.
func InitIdolWorksManager() *IdolWorksManager {
	idolWorksManagerOnce.Do(func() {
		idolWorksMgr = &IdolWorksManager{
			tasks:              make(chan int64, idolWorksQueueSize),
			scheduled:          make(map[int64]struct{}),
			pageDelay:          idolWorksPageDelayBase,
			pageDelayJitter:    idolWorksPageDelayJitter,
			sourceSwitchDelay:  sourceSwitchDelayBase,
			sourceSwitchJitter: sourceSwitchDelayJitter,
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
	retryDelay := time.Duration(dbpkg.JavIdolRetryMinutes(ctx)) * time.Minute
	for _, id := range ids {
		track, err := dbpkg.GetJavIdolTrack(ctx, id)
		if err != nil {
			logging.Error("check idol track id=%d: %v", id, err)
			continue
		}
		if track.Tracked {
			if track.LastScrapedAt != nil && track.LastScrapedAt.After(dueSince) {
				continue // recently scraped successfully, no need to re-scrape
			}
			if track.LastAttemptAt != nil && track.LastAttemptAt.After(time.Now().Add(-retryDelay)) {
				continue // last attempt (e.g. a failure) was recent; avoid hammering
			}
		}
		idolWorksMgr.enqueue(id)
	}
}

// idolWorksSource describes one provider that can scrape an idol's full works
// list. resolveProfile turns a library idol into that provider's profile page
// URL; listWorks fetches one page of the works listing (the bool reports
// whether a later page exists). A single scrape pins one source so a whole run
// is self-consistent; the next refresh may pick another source.
type idolWorksSource struct {
	provider       jav.Provider
	resolveProfile func(ctx context.Context, item *models.JavIdol) (string, error)
	listWorks      func(ctx context.Context, profileURL string, page int) ([]*jav.JavInfo, bool, error)
}

// idolWorksSources lists the providers the works scraper may use, in fallback
// order. JavDB is the richest source and is always tried first; JavDatabase is
// a code-driven fallback that stays useful when JavDB is blocked. A successful
// JavDatabase fallback does not overwrite a stored JavDB actor URL.
//
// The listWorks/resolveProfile closures dereference the package-level test
// hooks on every call so tests can swap the underlying fetchers at runtime.
var idolWorksSources = []idolWorksSource{
	{
		provider: jav.ProviderJavDB,
		resolveProfile: func(ctx context.Context, item *models.JavIdol) (string, error) {
			return lookupJavDBProfileURL(ctx, item)
		},
		listWorks: func(ctx context.Context, profileURL string, page int) ([]*jav.JavInfo, bool, error) {
			return listJavWorksByActressURL(ctx, profileURL, page)
		},
	},
	{
		provider: jav.ProviderJavDatabase,
		resolveProfile: func(ctx context.Context, item *models.JavIdol) (string, error) {
			return resolveJavDatabaseProfileURL(ctx, item)
		},
		listWorks: func(ctx context.Context, profileURL string, page int) ([]*jav.JavInfo, bool, error) {
			return listJavDatabaseWorksByActressURL(ctx, profileURL, page)
		},
	},
}

// ScrapeIdolWorks resolves the idol's profile URL on a works provider and
// fetches every page of her works list, persisting the result. JavDB is always
// tried first (Japanese listing titles); a stored profile URL is reused when it
// belongs to the provider being tried. When one provider fails the next is
// tried after a short randomized pause. Failures update the track row's
// last_error so the next scheduled refresh retries.
func ScrapeIdolWorks(ctx context.Context, idolID int64) error {
	item, err := dbpkg.GetJavIdolBasic(ctx, idolID)
	if err != nil {
		return fmt.Errorf("load idol: %w", err)
	}

	track, err := dbpkg.GetJavIdolTrack(ctx, idolID)
	if err != nil {
		return err
	}

	knownProfile := strings.TrimSpace(track.JavdbURL)

	// Always try JavDB first: its actress listing includes Japanese
	// origin-title. A previous JavDatabase fallback must not pin later
	// refreshes to English-only listing titles.
	sources := shuffledWorksSources(jav.ProviderJavDB)
	var lastErr error
	for _, src := range sources {
		profileURL := knownProfile
		if knownProfile == "" || sourceForProfileURL(profileURL) != src.provider {
			profileURL, err = src.resolveProfile(ctx, item)
			if err != nil {
				lastErr = err
				logging.Error("resolve %s profile url idol_id=%d: %v", src.provider.String(), idolID, err)
				if !sleepBeforeSourceSwitch(ctx, len(sources) > 1) {
					return ctx.Err()
				}
				continue
			}
		}
		profileURL = strings.TrimSpace(profileURL)
		if profileURL == "" {
			lastErr = jav.ResourceNotFonud
			if !sleepBeforeSourceSwitch(ctx, len(sources) > 1) {
				return ctx.Err()
			}
			continue
		}

		works, err := scrapeAllWorksPages(ctx, idolID, src.provider, profileURL)
		if err != nil {
			lastErr = err
			logging.Error("scrape %s works idol_id=%d: %v", src.provider.String(), idolID, err)
			if !sleepBeforeSourceSwitch(ctx, len(sources) > 1) {
				return ctx.Err()
			}
			continue
		}

		if err := dbpkg.ReplaceJavIdolWorks(ctx, idolID, works); err != nil {
			return err
		}
		codes := make([]string, 0, len(works))
		for _, work := range works {
			codes = append(codes, work.Code)
		}
		EnqueueIdolWorkMetadata(codes...)
		persistURL := persistIdolWorksProfileURL(knownProfile, profileURL, src.provider)
		return dbpkg.MarkJavIdolTrackScraped(ctx, idolID, persistURL, len(works), time.Now())
	}

	if lastErr == nil {
		lastErr = jav.ResourceNotFonud
	}
	_ = dbpkg.MarkJavIdolTrackError(ctx, idolID, lastErr)
	return fmt.Errorf("scrape idol works: %w", lastErr)
}

// scrapeAllWorksPages fetches every page of one provider's works listing for an
// idol, returning the flattened JavIdolWork rows tagged with the provider.
func scrapeAllWorksPages(ctx context.Context, idolID int64, provider jav.Provider, profileURL string) ([]models.JavIdolWork, error) {
	works := make([]models.JavIdolWork, 0, 96)
	page := 1
	for {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		items, hasNext, err := listWorksForSource(provider, ctx, profileURL, page)
		if err != nil {
			return nil, fmt.Errorf("list works page %d: %w", page, err)
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
				Source:      int(provider),
				SourceURL:   sourceURL,
				StudioName:  strings.TrimSpace(w.Studio),
				SeriesName:  strings.TrimSpace(w.Series),
				Tags:        models.JavStringList(dedupeWorkTags(w.Tags)),
			})
		}
		if !hasNext {
			break
		}
		page++
		if !sleepBetweenWorksPages(ctx) {
			return nil, ctx.Err()
		}
	}
	return works, nil
}

func dedupeWorkTags(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		key := strings.ToLower(value)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, value)
	}
	return out
}

func listWorksForSource(provider jav.Provider, ctx context.Context, profileURL string, page int) ([]*jav.JavInfo, bool, error) {
	for _, src := range idolWorksSources {
		if src.provider == provider {
			return src.listWorks(ctx, profileURL, page)
		}
	}
	return nil, false, fmt.Errorf("no works source for provider %s", provider.String())
}

// persistIdolWorksProfileURL chooses the profile URL to store after a successful
// scrape. A stored JavDB actor URL is kept when the scrape fell back to another
// provider, so the next refresh still prefers JavDB (Japanese listing titles)
// instead of being pinned to the fallback.
func persistIdolWorksProfileURL(stored, scraped string, scrapedProvider jav.Provider) string {
	stored = strings.TrimSpace(stored)
	scraped = strings.TrimSpace(scraped)
	if sourceForProfileURL(stored) == jav.ProviderJavDB && scrapedProvider != jav.ProviderJavDB {
		return stored
	}
	if scraped != "" {
		return scraped
	}
	return stored
}

// sourceForProfileURL returns the provider whose profile URL form matches the
// given stored URL, or ProviderUnknown. Stored profile URLs are reused only
// when they belong to a provider we still know how to scrape.
func sourceForProfileURL(profileURL string) jav.Provider {
	if strings.Contains(strings.ToLower(profileURL), "/actors/") {
		return jav.ProviderJavDB
	}
	if strings.Contains(strings.ToLower(profileURL), "/idols/") {
		return jav.ProviderJavDatabase
	}
	return jav.ProviderUnknown
}

// shuffledWorksSources returns the sources to try for one scrape, most
// preferred first. Callers pass ProviderJavDB so Japanese listing titles are
// tried before English JavDatabase fallbacks; remaining sources are shuffled
// so a scrape that must move past the leader does not always fall to the
// same second site.
func shuffledWorksSources(preferred jav.Provider) []idolWorksSource {
	if preferred != jav.ProviderUnknown {
		lead := []idolWorksSource{}
		rest := make([]idolWorksSource, 0, len(idolWorksSources))
		for _, src := range idolWorksSources {
			if src.provider == preferred {
				lead = append(lead, src)
			} else {
				rest = append(rest, src)
			}
		}
		rand.Shuffle(len(rest), func(i, j int) { rest[i], rest[j] = rest[j], rest[i] })
		return append(lead, rest...)
	}

	// No stored profile: JavDB keeps the primary slot (data richest and the
	// historical default); the fallback order after it is randomized.
	lead := []idolWorksSource{}
	rest := make([]idolWorksSource, 0, len(idolWorksSources))
	for _, src := range idolWorksSources {
		if src.provider == jav.ProviderJavDB {
			lead = append(lead, src)
		} else {
			rest = append(rest, src)
		}
	}
	rand.Shuffle(len(rest), func(i, j int) { rest[i], rest[j] = rest[j], rest[i] })
	return append(lead, rest...)
}

// sleepBetweenWorksPages pauses between consecutive pages of one idol's works
// listing, using the manager's configured base delay plus a random jitter.
func sleepBetweenWorksPages(ctx context.Context) bool {
	base := idolWorksPageDelayBase
	jitter := idolWorksPageDelayJitter
	if idolWorksMgr != nil {
		if idolWorksMgr.pageDelay > 0 {
			base = idolWorksMgr.pageDelay
		}
		if idolWorksMgr.pageDelayJitter > 0 {
			jitter = idolWorksMgr.pageDelayJitter
		}
	}
	return sleepWithJitter(ctx, base, jitter)
}

// sleepBeforeSourceSwitch pauses before retrying on another provider after one
// failed. It is skipped when there is only one provider in the pool (the
// previous behaviour, no delay on failure).
func sleepBeforeSourceSwitch(ctx context.Context, multipleSources bool) bool {
	if !multipleSources {
		return true
	}
	base := sourceSwitchDelayBase
	jitter := sourceSwitchDelayJitter
	if idolWorksMgr != nil {
		if idolWorksMgr.sourceSwitchDelay > 0 {
			base = idolWorksMgr.sourceSwitchDelay
		}
		if idolWorksMgr.sourceSwitchJitter > 0 {
			jitter = idolWorksMgr.sourceSwitchJitter
		}
	}
	return sleepWithJitter(ctx, base, jitter)
}

// sleepWithJitter waits a random duration in [base, base+jitter), aborting if
// the context is cancelled. It reports whether the full pause elapsed.
func sleepWithJitter(ctx context.Context, base, jitter time.Duration) bool {
	delay := base
	if jitter > 0 {
		delay += time.Duration(rand.Int63n(int64(jitter)))
	}
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
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
	retrySince := time.Now().Add(-time.Duration(dbpkg.JavIdolRetryMinutes(ctx)) * time.Minute)
	ids, err := dbpkg.ListIdolsNeedingWorksScrape(ctx, retrySince, since)
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

// lookupJavDatabaseProfileURL resolves the idol's JavDatabase profile URL by
// trying each in-library code. JavDatabase's actress lookup is code-driven: it
// reads a movie page, finds the idol link and follows it, returning the profile
// URL on ActressInfo. The first code that resolves wins. This resolver is only
// consulted as a fallback when JavDB is unavailable, so its extra per-code
// requests are acceptable.
func lookupJavDatabaseProfileURL(ctx context.Context, item *models.JavIdol) (string, error) {
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

	for _, code := range codes {
		actress, err := jav.LookupActressByCode(code, jav.ProviderJavDatabase)
		if err != nil {
			if errors.Is(err, jav.ResourceNotFonud) {
				continue
			}
			// Network/HTTP errors: fail fast rather than multiplying requests
			// against an unhealthy provider.
			return "", err
		}
		if actress == nil {
			continue
		}
		profileURL := strings.TrimSpace(actress.ProfileURL)
		if profileURL == "" {
			continue
		}
		return profileURL, nil
	}
	return "", jav.ResourceNotFonud
}

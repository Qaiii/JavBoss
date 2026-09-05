package service

import (
	"context"
	"errors"
	"strings"
	"sync"
	"time"

	"javboss/internal/common"
	"javboss/internal/common/logging"
	"javboss/internal/db"
	"javboss/internal/jav"
	"javboss/internal/manager"
)

const (
	javScrapeRepairQueueSize   = 5000
	javScrapeRepairWorkerCount = 2

	JavScrapeFieldCoverLandscape = "cover_landscape"
	JavScrapeFieldTitle          = "title"
	JavScrapeFieldTags           = "tags"
	JavScrapeFieldSeries         = "series"
	JavScrapeFieldStudio         = "studio"
	JavScrapeFieldSource         = "source"
	JavScrapeFieldIdols          = "idols"
	JavScrapeFieldRelease        = "release"
	JavScrapeFieldDuration       = "duration"
	JavScrapeFieldUncensored     = "uncensored"
)

// JavScrapeCheckReport summarizes scrape completeness and what was queued for repair.
type JavScrapeCheckReport struct {
	Total           int            `json:"total"`
	Incomplete      int            `json:"incomplete"`
	Queued          int            `json:"queued"`
	QueuedCovers    int            `json:"queued_covers"`
	QueuedMetadata  int            `json:"queued_metadata"`
	LibraryTotal    int            `json:"library_total"`
	UnimportedTotal int            `json:"unimported_total"`
	CoverPending    int            `json:"cover_pending"`
	MetadataPending int            `json:"metadata_pending"`
	CheckedAt       *time.Time     `json:"checked_at,omitempty"`
	Fields          map[string]int `json:"fields"`
}

type javScrapeRepairManager struct {
	tasks     chan string
	mu        sync.Mutex
	scheduled map[string]struct{}
	last      *JavScrapeCheckReport
}

var (
	javScrapeRepairOnce sync.Once
	javScrapeRepairMgr  *javScrapeRepairManager

	lookupJavForScrapeRepair = jav.LookupJavByCode
)

// InitJavScrapeRepairManager creates the background metadata repair queue.
func InitJavScrapeRepairManager() {
	javScrapeRepairOnce.Do(func() {
		javScrapeRepairMgr = newJavScrapeRepairManager()
	})
}

func newJavScrapeRepairManager() *javScrapeRepairManager {
	return &javScrapeRepairManager{
		tasks:     make(chan string, javScrapeRepairQueueSize),
		scheduled: make(map[string]struct{}),
	}
}

// StartJavScrapeRepairManager launches workers that re-scrape incomplete JAV metadata.
func StartJavScrapeRepairManager(ctx context.Context) {
	InitJavScrapeRepairManager()
	if javScrapeRepairMgr == nil {
		return
	}
	for i := 0; i < javScrapeRepairWorkerCount; i++ {
		go javScrapeRepairMgr.worker(ctx)
	}
}

func (m *javScrapeRepairManager) tryEnqueue(code string) bool {
	if m == nil {
		return false
	}
	code = strings.TrimSpace(code)
	key := strings.ToLower(code)
	if key == "" || m.tasks == nil {
		return false
	}

	m.mu.Lock()
	if m.scheduled == nil {
		m.scheduled = make(map[string]struct{})
	}
	if _, ok := m.scheduled[key]; ok {
		m.mu.Unlock()
		return true
	}
	m.scheduled[key] = struct{}{}
	m.mu.Unlock()

	select {
	case m.tasks <- code:
		return true
	default:
		m.clearScheduled(key)
		return false
	}
}

func (m *javScrapeRepairManager) pendingCount() int {
	if m == nil {
		return 0
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.scheduled)
}

func (m *javScrapeRepairManager) clearScheduled(code string) {
	if m == nil {
		return
	}
	key := strings.ToLower(strings.TrimSpace(code))
	if key == "" {
		return
	}
	m.mu.Lock()
	delete(m.scheduled, key)
	m.mu.Unlock()
}

func (m *javScrapeRepairManager) storeReport(report JavScrapeCheckReport) JavScrapeCheckReport {
	if m == nil {
		return report
	}
	copied := cloneJavScrapeCheckReport(report)
	m.mu.Lock()
	m.last = &copied
	m.mu.Unlock()
	return copied
}

func (m *javScrapeRepairManager) lastReport() *JavScrapeCheckReport {
	if m == nil {
		return nil
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.last == nil {
		return nil
	}
	copied := cloneJavScrapeCheckReport(*m.last)
	return &copied
}

func (m *javScrapeRepairManager) worker(ctx context.Context) {
	if m == nil {
		return
	}
	for {
		select {
		case <-ctx.Done():
			return
		case code := <-m.tasks:
			func() {
				defer m.clearScheduled(code)
				if err := repairJavScrape(ctx, code); err != nil {
					logging.Error("jav scrape repair: code=%s err=%v", code, err)
				}
			}()
		}
	}
}

func repairJavScrape(ctx context.Context, code string) error {
	code = strings.TrimSpace(code)
	if code == "" {
		return errors.New("empty code")
	}
	if err := ctx.Err(); err != nil {
		return err
	}

	item, err := db.GetJavByCode(ctx, code)
	if err != nil {
		return err
	}
	providers := []jav.Provider{jav.ProviderJavBus}
	if item != nil && item.IsUncensored != nil && *item.IsUncensored {
		providers = []jav.Provider{jav.ProviderAvsox, jav.ProviderJavBus}
	}

	for _, provider := range providers {
		info, lookupErr := lookupJavForScrapeRepair(code, provider)
		if lookupErr != nil {
			if !errors.Is(lookupErr, jav.ResourceNotFonud) {
				logging.Error("jav scrape repair lookup failed provider=%s code=%s err=%v", provider.String(), code, lookupErr)
			}
			continue
		}
		if info == nil || strings.TrimSpace(info.Title) == "" {
			continue
		}
		if _, saveErr := db.SaveJavInfo(ctx, info); saveErr != nil {
			logging.Error("jav scrape repair save failed provider=%s code=%s err=%v", provider.String(), code, saveErr)
			continue
		}
		logging.Info("jav scrape repair updated provider=%s code=%s title=%s", provider.String(), code, strings.TrimSpace(info.Title))
		if len(info.Actors) > 0 {
			EnqueueIdolWorksForActors(ctx, info.Actors)
		}
		break
	}

	if mgr := common.CoverManager; mgr != nil {
		if !mgr.Exists(code) {
			mgr.TryEnqueue(code)
		}
	}
	return nil
}

// CheckAndRepairJavScrape audits library JAV scrape completeness and queues incomplete rows.
func CheckAndRepairJavScrape(ctx context.Context) (JavScrapeCheckReport, error) {
	InitJavScrapeRepairManager()
	if common.DB == nil {
		return JavScrapeCheckReport{}, errors.New("nil db")
	}

	items, err := db.ListJavScrapeHealthItems(ctx)
	if err != nil {
		return JavScrapeCheckReport{}, err
	}
	unimported, err := db.ListUnimportedJavScrapeHealthItems(ctx)
	if err != nil {
		return JavScrapeCheckReport{}, err
	}

	report := JavScrapeCheckReport{
		Total:           len(items) + len(unimported),
		LibraryTotal:    len(items),
		UnimportedTotal: len(unimported),
		CheckedAt:       timePtr(time.Now().UTC()),
		Fields:          map[string]int{},
	}
	coverMgr := common.CoverManager
	queuedCodes := make(map[string]struct{})

	for _, item := range items {
		fields := javScrapeMissingFields(item, coverMgr)
		if len(fields) == 0 {
			continue
		}
		report.Incomplete++
		for _, field := range fields {
			report.Fields[field]++
		}

		code := strings.TrimSpace(item.Code)
		needsCover := containsJavScrapeField(fields, JavScrapeFieldCoverLandscape)
		needsMetadata := javScrapeNeedsMetadataRepair(fields)

		queued := false
		if needsCover && coverMgr != nil {
			if coverMgr.TryEnqueue(code) {
				report.QueuedCovers++
				queued = true
			}
		}
		if needsMetadata && javScrapeRepairMgr != nil {
			if javScrapeRepairMgr.tryEnqueue(code) {
				report.QueuedMetadata++
				queued = true
			}
		}
		if queued {
			queuedCodes[strings.ToLower(code)] = struct{}{}
		}
	}

	for _, item := range unimported {
		fields := unimportedJavScrapeMissingFields(item)
		if len(fields) == 0 {
			continue
		}
		report.Incomplete++
		for _, field := range fields {
			report.Fields[field]++
		}
		if TryEnqueueIdolWorkMetadata(item.Code) {
			report.QueuedMetadata++
			queuedCodes[strings.ToLower(strings.TrimSpace(item.Code))] = struct{}{}
		}
	}

	report.Queued = len(queuedCodes)
	report.CoverPending = coverMgr.PendingCount()
	metadataPending := 0
	if javScrapeRepairMgr != nil {
		metadataPending = javScrapeRepairMgr.pendingCount()
	}
	report.MetadataPending = metadataPending + IdolWorkMetadataPendingCount()
	if javScrapeRepairMgr != nil {
		report = javScrapeRepairMgr.storeReport(report)
	}
	logging.Info(
		"jav scrape check total=%d incomplete=%d queued=%d covers=%d metadata=%d",
		report.Total,
		report.Incomplete,
		report.Queued,
		report.QueuedCovers,
		report.QueuedMetadata,
	)
	return report, nil
}

// JavScrapeCheckStatus returns the latest check report plus live queue depths.
func JavScrapeCheckStatus() JavScrapeCheckReport {
	InitJavScrapeRepairManager()
	report := JavScrapeCheckReport{Fields: map[string]int{}}
	if javScrapeRepairMgr != nil {
		if last := javScrapeRepairMgr.lastReport(); last != nil {
			report = *last
		}
	}
	if report.Fields == nil {
		report.Fields = map[string]int{}
	}
	report.CoverPending = common.CoverManager.PendingCount()
	metadataPending := 0
	if javScrapeRepairMgr != nil {
		metadataPending = javScrapeRepairMgr.pendingCount()
	}
	report.MetadataPending = metadataPending + IdolWorkMetadataPendingCount()
	return report
}

func javScrapeMissingFields(item db.JavScrapeHealthItem, coverMgr *manager.CoverManager) []string {
	var fields []string
	if coverMgr != nil {
		code := strings.TrimSpace(item.Code)
		if !coverMgr.Exists(code) {
			fields = append(fields, JavScrapeFieldCoverLandscape)
		}
	}
	if strings.TrimSpace(item.Title) == "" {
		fields = append(fields, JavScrapeFieldTitle)
	}
	if !item.HasTags {
		fields = append(fields, JavScrapeFieldTags)
	}
	if item.SeriesID == nil {
		fields = append(fields, JavScrapeFieldSeries)
	}
	if item.StudioID == nil {
		fields = append(fields, JavScrapeFieldStudio)
	}
	if !item.HasScrapedTags {
		fields = append(fields, JavScrapeFieldSource)
	}
	if !item.HasIdols {
		fields = append(fields, JavScrapeFieldIdols)
	}
	if item.ReleaseUnix <= 0 {
		fields = append(fields, JavScrapeFieldRelease)
	}
	if item.DurationMin <= 0 {
		fields = append(fields, JavScrapeFieldDuration)
	}
	if item.IsUncensored == nil {
		fields = append(fields, JavScrapeFieldUncensored)
	}
	return fields
}

func unimportedJavScrapeMissingFields(item db.UnimportedJavScrapeHealthItem) []string {
	var fields []string
	if strings.TrimSpace(item.CoverURL) == "" {
		fields = append(fields, JavScrapeFieldCoverLandscape)
	}
	if strings.TrimSpace(item.Title) == "" {
		fields = append(fields, JavScrapeFieldTitle)
	}
	if !item.HasTags {
		fields = append(fields, JavScrapeFieldTags)
	}
	if strings.TrimSpace(item.SeriesName) == "" {
		fields = append(fields, JavScrapeFieldSeries)
	}
	if strings.TrimSpace(item.StudioName) == "" {
		fields = append(fields, JavScrapeFieldStudio)
	}
	if strings.TrimSpace(item.SourceURL) == "" && item.Source == 0 {
		fields = append(fields, JavScrapeFieldSource)
	}
	if item.ReleaseUnix <= 0 {
		fields = append(fields, JavScrapeFieldRelease)
	}
	if item.DurationMin <= 0 {
		fields = append(fields, JavScrapeFieldDuration)
	}
	return fields
}

func javScrapeNeedsMetadataRepair(fields []string) bool {
	for _, field := range fields {
		switch field {
		case JavScrapeFieldCoverLandscape:
			continue
		default:
			return true
		}
	}
	return false
}

func containsJavScrapeField(fields []string, want string) bool {
	for _, field := range fields {
		if field == want {
			return true
		}
	}
	return false
}

func cloneJavScrapeCheckReport(report JavScrapeCheckReport) JavScrapeCheckReport {
	copied := report
	if report.CheckedAt != nil {
		checkedAt := *report.CheckedAt
		copied.CheckedAt = &checkedAt
	}
	copied.Fields = make(map[string]int, len(report.Fields))
	for key, value := range report.Fields {
		copied.Fields[key] = value
	}
	return copied
}

func timePtr(value time.Time) *time.Time {
	return &value
}

func javScrapeRepairResetForTest(mgr *javScrapeRepairManager) {
	javScrapeRepairOnce = sync.Once{}
	javScrapeRepairMgr = mgr
	if mgr != nil {
		javScrapeRepairOnce.Do(func() {})
	}
}

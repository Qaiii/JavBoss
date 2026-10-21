package jav

import (
	"context"
	"time"

	"javboss/internal/jav/scrape"
)

type Provider = scrape.Provider
type JavInfo = scrape.JavInfo
type ActressInfo = scrape.ActressInfo

const (
	ProviderUnknown     = scrape.ProviderUnknown
	ProviderJavBus      = scrape.ProviderJavBus
	ProviderJavDatabase = scrape.ProviderJavDatabase
	ProviderJavDB       = scrape.ProviderJavDB
	ProviderAvmoo       = scrape.ProviderAvmoo
	ProviderAvsox       = scrape.ProviderAvsox
)

var (
	ErrNotFound             = scrape.ErrNotFound
	ErrUnsupportedOperation = scrape.ErrUnsupportedOperation
	ResourceNotFonud        = scrape.ResourceNotFonud
)

func LookupJavByCode(ctx context.Context, code string, provider Provider) (*JavInfo, error) {
	return scrape.LookupJavByCode(ctx, code, provider)
}

func LookupActressByCode(ctx context.Context, code string, provider Provider) (*ActressInfo, error) {
	return scrape.LookupActressByCode(ctx, code, provider)
}

func LookupActressURLByCodeAndName(ctx context.Context, code, name string, provider Provider) (string, error) {
	return scrape.LookupActressURLByCodeAndName(ctx, code, name, provider)
}

func LookupMaleActorsByCode(code string) ([]string, error) {
	return scrape.LookupMaleActorsByCode(code)
}

func CachedJavInfo(code string) *JavInfo {
	return scrape.CachedJavInfo(code)
}

func ListJavWorksByActressURL(ctx context.Context, profileURL string, page int) ([]*JavInfo, bool, error) {
	return scrape.ListJavWorksByActressURL(ctx, profileURL, page)
}

func ListJavDatabaseWorksByActressURL(ctx context.Context, profileURL string, page int) ([]*JavInfo, bool, error) {
	return scrape.ListJavDatabaseWorksByActressURL(ctx, profileURL, page)
}

func SetCache(store scrape.LookupCache) { scrape.SetCache(store) }

func CountExpiredLookupCache(now time.Time) (int, error) {
	return scrape.CountExpiredLookupCache(now)
}

func DeleteExpiredLookupCache(now time.Time) (int, error) {
	return scrape.DeleteExpiredLookupCache(now)
}

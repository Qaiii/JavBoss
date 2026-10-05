package jav

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"javboss/internal/jav/javdatabase"
	"javboss/internal/jav/javdb"
)

type javDBWorksPage struct {
	Items   []*JavInfo
	HasNext bool
}

type javDatabaseWorksPage struct {
	Items   []*JavInfo
	HasNext bool
}

const maxCachedActressWorksPages = 80

// ListJavWorksByActressURL fetches one page of an actress's works from her
// JavDB profile page. The returned bool reports whether more pages exist.
func ListJavWorksByActressURL(ctx context.Context, profileURL string, page int) ([]*JavInfo, bool, error) {
	profileURL = strings.TrimSpace(profileURL)
	if profileURL == "" || !strings.Contains(strings.ToLower(profileURL), "/actors/") {
		return nil, false, ErrNotFound
	}
	if page < 1 {
		page = 1
	}

	cacheKey := lookupCacheKey(ProviderJavDB, "list_actress_works", fmt.Sprintf("%s|%d", profileURL, page))
	if cached, ok, err := lookupCacheGet[javDBWorksPage](defaultMetadataClient, cacheKey); ok {
		if err != nil {
			return nil, false, err
		}
		if cached == nil {
			return nil, false, nil
		}
		return cached.Items, cached.HasNext, nil
	}

	client, err := javDBListingClient()
	if err != nil {
		return nil, false, err
	}
	items, hasNext, err := client.ListActressWorksPage(ctx, profileURL, page)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			cacheableLookupResult(defaultMetadataClient, cacheKey, nil, ErrNotFound)
		}
		return nil, false, err
	}
	result := javDBWorksPage{Items: items, HasNext: hasNext}
	cacheableLookupResult(defaultMetadataClient, cacheKey, result, nil)
	return result.Items, result.HasNext, nil
}

// LoadCachedActressWorks returns previously cached JavDB actress listing items
// for profileURL. Current cache-key versions are tried first, then older ones.
func LoadCachedActressWorks(profileURL string) []*JavInfo {
	profileURL = strings.TrimSpace(profileURL)
	if profileURL == "" || !strings.Contains(strings.ToLower(profileURL), "/actors/") {
		return nil
	}

	current := lookupCacheKeyVersion(ProviderJavDB, "list_actress_works")
	versions := []string{current}
	for _, old := range []string{"v4", "v3", "v2", "v1"} {
		if old == current {
			continue
		}
		versions = append(versions, old)
	}
	for _, version := range versions {
		items := loadCachedActressWorksVersion(profileURL, version)
		if len(items) > 0 {
			return items
		}
	}
	return nil
}

func loadCachedActressWorksVersion(profileURL, version string) []*JavInfo {
	seen := make(map[string]struct{})
	items := make([]*JavInfo, 0, 96)
	for page := 1; page <= maxCachedActressWorksPages; page++ {
		key := strings.Join([]string{
			version,
			"jav",
			ProviderJavDB.String(),
			"list_actress_works",
			fmt.Sprintf("%s|%d", profileURL, page),
		}, ":")
		cached, ok, err := lookupCacheGet[javDBWorksPage](defaultMetadataClient, key)
		if !ok || err != nil || cached == nil {
			break
		}
		for _, item := range cached.Items {
			if item == nil || strings.TrimSpace(item.Code) == "" {
				continue
			}
			codeKey := normalizeCachedWorkCode(item.Code)
			if _, exists := seen[codeKey]; exists {
				continue
			}
			seen[codeKey] = struct{}{}
			items = append(items, item)
		}
		if !cached.HasNext {
			break
		}
	}
	return items
}

func normalizeCachedWorkCode(code string) string {
	code = strings.ToUpper(strings.TrimSpace(code))
	var b strings.Builder
	for _, r := range code {
		if (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func javDBListingClient() (*javdb.JavDBClient, error) {
	implementation, err := defaultMetadataClient.providerFor(ProviderJavDB)
	if err != nil {
		return nil, err
	}
	client, ok := implementation.(*javdb.JavDBClient)
	if !ok || client == nil {
		return nil, fmt.Errorf("%s: %w", ProviderJavDB, ErrUnsupportedOperation)
	}
	return client, nil
}

// ListJavDatabaseWorksByActressURL fetches one page of an idol's works from her
// JavDatabase profile page. Page 1 is the bare profile URL; later pages append
// the ?ipage=N query used by the site's listing.
func ListJavDatabaseWorksByActressURL(ctx context.Context, profileURL string, page int) ([]*JavInfo, bool, error) {
	profileURL = strings.TrimSpace(profileURL)
	if profileURL == "" || !strings.Contains(strings.ToLower(profileURL), "/idols/") {
		return nil, false, ErrNotFound
	}
	if page < 1 {
		page = 1
	}

	cacheKey := lookupCacheKey(ProviderJavDatabase, "list_idol_works", fmt.Sprintf("%s|%d", profileURL, page))
	if cached, ok, err := lookupCacheGet[javDatabaseWorksPage](defaultMetadataClient, cacheKey); ok {
		if err != nil {
			return nil, false, err
		}
		if cached == nil {
			return nil, false, nil
		}
		return cached.Items, cached.HasNext, nil
	}

	client, err := javDatabaseListingClient()
	if err != nil {
		return nil, false, err
	}
	items, hasNext, err := client.ListIdolWorksPage(ctx, profileURL, page)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			cacheableLookupResult(defaultMetadataClient, cacheKey, nil, ErrNotFound)
		}
		return nil, false, err
	}
	result := javDatabaseWorksPage{Items: items, HasNext: hasNext}
	cacheableLookupResult(defaultMetadataClient, cacheKey, result, nil)
	return result.Items, result.HasNext, nil
}

func javDatabaseListingClient() (*javdatabase.JavDatabaseClient, error) {
	implementation, err := defaultMetadataClient.providerFor(ProviderJavDatabase)
	if err != nil {
		return nil, err
	}
	client, ok := implementation.(*javdatabase.JavDatabaseClient)
	if !ok || client == nil {
		return nil, fmt.Errorf("%s: %w", ProviderJavDatabase, ErrUnsupportedOperation)
	}
	return client, nil
}

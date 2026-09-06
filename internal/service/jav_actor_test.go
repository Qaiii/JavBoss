package service

import (
	"context"
	"errors"
	"testing"

	"javboss/internal/db"
	"javboss/internal/jav"
)

func TestEnrichJavMaleActorsStoresLookupResult(t *testing.T) {
	openServiceTestDB(t)
	ctx := context.Background()
	created, err := db.SaveJavInfo(ctx, &jav.JavInfo{Code: "SSIS-001", Title: "Title", Provider: jav.ProviderJavBus})
	if err != nil {
		t.Fatalf("save jav: %v", err)
	}

	prev := lookupMaleActorsByCode
	t.Cleanup(func() { lookupMaleActorsByCode = prev })
	lookupMaleActorsByCode = func(code string) ([]string, error) {
		if code != "SSIS-001" {
			t.Fatalf("lookup code = %q", code)
		}
		return []string{"藍井優太", "ダイ"}, nil
	}

	EnrichJavMaleActors(ctx, created.ID, created.Code)

	item, err := db.GetJav(ctx, created.ID, nil)
	if err != nil {
		t.Fatalf("get jav: %v", err)
	}
	if len(item.Actors) != 2 {
		t.Fatalf("actors = %#v, want 2", item.Actors)
	}
}

func TestEnrichJavMaleActorsIgnoresNotFound(t *testing.T) {
	openServiceTestDB(t)
	ctx := context.Background()
	created, err := db.SaveJavInfo(ctx, &jav.JavInfo{Code: "ABP-999", Title: "Title", Provider: jav.ProviderJavBus})
	if err != nil {
		t.Fatalf("save jav: %v", err)
	}
	prev := lookupMaleActorsByCode
	t.Cleanup(func() { lookupMaleActorsByCode = prev })
	lookupMaleActorsByCode = func(string) ([]string, error) {
		return nil, jav.ResourceNotFonud
	}
	EnrichJavMaleActors(ctx, created.ID, created.Code)
	item, err := db.GetJav(ctx, created.ID, nil)
	if err != nil {
		t.Fatalf("get jav: %v", err)
	}
	if len(item.Actors) != 0 {
		t.Fatalf("actors = %#v, want none", item.Actors)
	}
}

func TestEnrichJavMaleActorsIgnoresTemporaryErrors(t *testing.T) {
	openServiceTestDB(t)
	ctx := context.Background()
	created, err := db.SaveJavInfo(ctx, &jav.JavInfo{Code: "SSIS-002", Title: "Title", Provider: jav.ProviderJavBus})
	if err != nil {
		t.Fatalf("save jav: %v", err)
	}
	prev := lookupMaleActorsByCode
	t.Cleanup(func() { lookupMaleActorsByCode = prev })
	lookupMaleActorsByCode = func(string) ([]string, error) {
		return nil, errors.New("temporary")
	}
	EnrichJavMaleActors(ctx, created.ID, created.Code)
	item, err := db.GetJav(ctx, created.ID, nil)
	if err != nil {
		t.Fatalf("get jav: %v", err)
	}
	if len(item.Actors) != 0 {
		t.Fatalf("actors = %#v, want none", item.Actors)
	}
}

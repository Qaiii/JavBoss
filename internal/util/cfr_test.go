package util

import (
	"encoding/binary"
	"os"
	"path/filepath"
	"testing"
)

// buildMinimalMP4 writes a minimal ISO-BMFF file with one video track whose
// stts table is given by deltas (each entry has count 1). This is enough for
// probeConstantFrameRate to inspect; no media data is required.
func buildMinimalMP4(t *testing.T, deltas []uint32) string {
	t.Helper()

	box := func(typ string, payload []byte) []byte {
		out := make([]byte, 8+len(payload))
		binary.BigEndian.PutUint32(out[:4], uint32(8+len(payload)))
		copy(out[4:8], typ)
		copy(out[8:], payload)
		return out
	}

	// stts: version/flags(4) + entry_count(4) + (count,delta)*
	sttsPayload := make([]byte, 8+len(deltas)*8)
	binary.BigEndian.PutUint32(sttsPayload[4:8], uint32(len(deltas)))
	for i, d := range deltas {
		binary.BigEndian.PutUint32(sttsPayload[8+i*8:12+i*8], 1) // count
		binary.BigEndian.PutUint32(sttsPayload[12+i*8:16+i*8], d)
	}
	stts := box("stts", sttsPayload)

	// stbl with just stts
	stbl := box("stbl", stts)

	// hdlr for video: version/flags(4) + pre_defined(4) + handler_type(4)
	hdlrPayload := make([]byte, 16)
	copy(hdlrPayload[8:12], "vide")
	hdlr := box("hdlr", hdlrPayload)

	mdia := box("mdia", append(append(box("mdhd", make([]byte, 4)), hdlr...), stbl...))
	trak := box("trak", mdia)
	moov := box("moov", trak)
	ftyp := box("ftyp", []byte("isom\x00\x00\x00\x00isom"))

	content := append(ftyp, moov...)
	path := filepath.Join(t.TempDir(), "sample.mp4")
	if err := os.WriteFile(path, content, 0o600); err != nil {
		t.Fatalf("write MP4 fixture: %v", err)
	}
	return path
}

func TestProbeConstantFrameRateSingleDeltaIsCFR(t *testing.T) {
	path := buildMinimalMP4(t, []uint32{1001})
	if !probeConstantFrameRate(path) {
		t.Fatal("a single stts delta should be constant frame rate")
	}
}

func TestProbeConstantFrameRateRepeatedSameDeltaIsCFR(t *testing.T) {
	path := buildMinimalMP4(t, []uint32{1001, 1001, 1001, 1001})
	if !probeConstantFrameRate(path) {
		t.Fatal("multiple identical stts deltas should be constant frame rate")
	}
}

func TestProbeConstantFrameRateAlternatingDeltasIsVFR(t *testing.T) {
	// The exact pattern observed in the stuttering S1 re-encodes:
	// alternating 40040/40041 tick deltas at a 1/1200000 timebase.
	path := buildMinimalMP4(t, []uint32{40040, 40041, 40040, 40041, 40040, 40041})
	if probeConstantFrameRate(path) {
		t.Fatal("alternating stts deltas must be flagged as variable frame rate")
	}
}

func TestProbeConstantFrameRateNonMP4ReturnsFalse(t *testing.T) {
	path := filepath.Join(t.TempDir(), "not-an-mp4.bin")
	if err := os.WriteFile(path, []byte("not an mp4"), 0o600); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	// A non-MP4 file should fail closed (non-CFR) rather than crash.
	if probeConstantFrameRate(path) {
		t.Fatal("garbage file should not be considered constant frame rate")
	}
}

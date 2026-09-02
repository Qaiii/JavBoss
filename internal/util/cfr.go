package util

import (
	"encoding/binary"
	"os"
)

// probeConstantFrameRate inspects the MP4/MOV container's video track sample
// table (stts) and reports whether every video frame has the same duration.
// Browsers render video at a constant frame interval, so source files whose
// frame durations vary (slightly VFR content re-encoded with a rounded-up
// timebase, screen captures, etc.) cause the browser to periodically drop
// frames. Only the moov atom is read — media data is never touched, so this is
// cheap even for multi-GB files.
func probeConstantFrameRate(path string) bool {
	f, err := os.Open(path)
	if err != nil {
		// 打不开时保守降级：视为非 CFR，让调用方走转码通道而不是直放掉帧。
		return false
	}
	defer f.Close()

	// 顶层 box：只遍历 moov 所在的头部区域即可找到 moov（即使 moov 在文件
	// 末尾，顺序遍历会走到它）。为避免把 mdat 大块读进内存，按 box 头定位。
	moov, ok := findTopLevelBox(f, "moov")
	if !ok {
		return false
	}

	// moov -> trak(video) -> mdia -> minf -> stbl -> stts
	videoSTTS, err := findVideoTrackSTTS(f, moov)
	if err != nil || videoSTTS == nil {
		return false
	}
	return sttsHasSingleDelta(f, videoSTTS)
}

type boxRef struct {
	start int64
	end   int64
}

const maxBoxScanBytes = 64 << 20 // 64MB —— moov 元数据一般远小于此

func findTopLevelBox(f *os.File, want string) (boxRef, bool) {
	var offset int64
	fileSize := mustFileSize(f)
	for offset < fileSize {
		ref, size, err := readBoxHeader(f, offset, fileSize)
		if err != nil {
			return boxRef{}, false
		}
		name := boxName(f, offset)
		if name == want {
			return ref, true
		}
		// 只扫头部区域：若 moov 在文件中间，遇到 mdat 后继续逐 box 前进；
		// 每轮前进 size，不会因 mdat 巨大而失控。
		offset += size
		if size <= 0 {
			return boxRef{}, false
		}
	}
	return boxRef{}, false
}

func mustFileSize(f *os.File) int64 {
	info, err := f.Stat()
	if err != nil {
		return 0
	}
	return info.Size()
}

// readBoxHeader reads a box header at offset, returning the box extent and its
// total size (handling the 64-bit extended size form).
func readBoxHeader(f *os.File, offset, fileSize int64) (boxRef, int64, error) {
	var hdr [16]byte
	n, err := f.ReadAt(hdr[:8], offset)
	if err != nil || n < 8 {
		return boxRef{}, 0, err
	}
	size := int64(binary.BigEndian.Uint32(hdr[:4]))
	if size == 1 {
		// 64-bit size in the next 8 bytes
		if _, err := f.ReadAt(hdr[8:16], offset+8); err != nil {
			return boxRef{}, 0, err
		}
		size = int64(binary.BigEndian.Uint64(hdr[8:16]))
	} else if size == 0 {
		// box extends to end of file
		size = fileSize - offset
	}
	return boxRef{start: offset, end: offset + size}, size, nil
}

func boxName(f *os.File, offset int64) string {
	var b [4]byte
	if _, err := f.ReadAt(b[:], offset+4); err != nil {
		return ""
	}
	return string(b[:])
}

// findVideoTrackSTTS locates the stts box of the first video track. It walks
// moov/trak/mdia/minf/stbl and checks each trak's hdlr handler type.
func findVideoTrackSTTS(f *os.File, moov boxRef) (*boxRef, error) {
	// children of moov
	children, err := listChildren(f, moov)
	if err != nil {
		return nil, err
	}
	for _, trak := range children {
		if boxName(f, trak.start) != "trak" {
			continue
		}
		if !isVideoTrack(f, trak) {
			continue
		}
		stbl := findChildRecursive(f, trak, "stbl", 3)
		if stbl == nil {
			continue
		}
		stts := findChild(f, *stbl, "stts")
		if stts != nil {
			return stts, nil
		}
	}
	return nil, nil
}

func isVideoTrack(f *os.File, trak boxRef) bool {
	mdia := findChildRecursive(f, trak, "mdia", 1)
	if mdia == nil {
		return false
	}
	hdlr := findChild(f, *mdia, "hdlr")
	if hdlr == nil {
		return false
	}
	// hdlr payload: version/flags(4) + pre_defined(4) + handler_type(4)
	var b [4]byte
	if _, err := f.ReadAt(b[:], hdlr.start+8+8); err != nil {
		return false
	}
	return string(b[:]) == "vide"
}

func findChild(f *os.File, parent boxRef, want string) *boxRef {
	children, err := listChildren(f, parent)
	if err != nil {
		return nil
	}
	for _, c := range children {
		if boxName(f, c.start) == want {
			cp := c
			return &cp
		}
	}
	return nil
}

func findChildRecursive(f *os.File, parent boxRef, want string, depth int) *boxRef {
	if depth < 0 {
		return nil
	}
	children, err := listChildren(f, parent)
	if err != nil {
		return nil
	}
	for _, c := range children {
		name := boxName(f, c.start)
		if name == want {
			cp := c
			return &cp
		}
		if depth > 0 {
			if found := findChildRecursive(f, c, want, depth-1); found != nil {
				return found
			}
		}
	}
	return nil
}

func listChildren(f *os.File, parent boxRef) ([]boxRef, error) {
	var out []boxRef
	offset := parent.start + 8 // children start after header
	// handle extended-size header
	if parent.end-parent.start >= 16 && boxSizeFieldIsExtended(f, parent.start) {
		offset = parent.start + 16
	}
	for offset+8 <= parent.end {
		child, size, err := readBoxHeader(f, offset, parent.end)
		if err != nil {
			break
		}
		out = append(out, child)
		offset += size
		if size <= 0 {
			break
		}
	}
	return out, nil
}

func boxSizeFieldIsExtended(f *os.File, offset int64) bool {
	var b [4]byte
	if _, err := f.ReadAt(b[:], offset); err != nil {
		return false
	}
	return binary.BigEndian.Uint32(b[:]) == 1
}

// sttsHasSingleDelta parses the stts box and returns true if every sample uses
// the same duration delta (i.e. true CFR). A single entry covering all samples,
// or multiple entries sharing one delta, both count as constant.
func sttsHasSingleDelta(f *os.File, stts *boxRef) bool {
	payloadLen := stts.end - (stts.start + 8)
	if stts.end-stts.start >= 16 && boxSizeFieldIsExtended(f, stts.start) {
		payloadLen = stts.end - (stts.start + 16)
	}
	if payloadLen < 8 {
		return false
	}
	// payload: version/flags(4) + entry_count(4) + entries (count,delta)*
	head := make([]byte, 8)
	if _, err := f.ReadAt(head, stts.start+8); err != nil {
		return false
	}
	entryCount := binary.BigEndian.Uint32(head[4:8])
	if entryCount == 0 {
		return false
	}
	// Cap the number of entries we inspect so pathological files can't stall
	// the probe; even a handful of distinct deltas flags VFR reliably.
	const maxEntries = 1 << 16
	if entryCount > maxEntries {
		entryCount = maxEntries
	}
	buf := make([]byte, int64(entryCount)*8)
	// stts 负载 = version/flags(4) + entry_count(4) + 条目；起始位置取决于
	// box 头是 8 字节还是扩展的 16 字节。
	dataStart := stts.start + 8 + 8
	if stts.end-stts.start >= 16 && boxSizeFieldIsExtended(f, stts.start) {
		dataStart = stts.start + 16 + 8
	}
	if _, err := f.ReadAt(buf, dataStart); err != nil {
		return false
	}
	var first int64
	var haveFirst bool
	for i := int64(0); i < int64(entryCount); i++ {
		delta := int64(binary.BigEndian.Uint32(buf[i*8+4 : i*8+8]))
		if delta == 0 {
			continue
		}
		if !haveFirst {
			first = delta
			haveFirst = true
			continue
		}
		if delta != first {
			return false
		}
	}
	return haveFirst
}

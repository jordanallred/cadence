package main

// Kept videos on disk. A clip's video is saved as videos/<clip id>.<ext>
// next to the fit history, so it survives cleared browser data and a
// change of browser just like the fits do.

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

const maxVideoBytes = 4 << 30

// videoTypes maps an accepted upload type to the file extension used on
// disk. Anything else is stored as .video and served as octet-stream.
var videoTypes = map[string]string{
	"video/mp4":        ".mp4",
	"video/webm":       ".webm",
	"video/quicktime":  ".mov",
	"video/x-matroska": ".mkv",
	"video/x-msvideo":  ".avi",
	"video/3gpp":       ".3gp",
}

func extType(ext string) string {
	for t, e := range videoTypes {
		if e == ext {
			return t
		}
	}
	return "application/octet-stream"
}

type videoEntry struct {
	ID   string `json:"id"`
	Size int64  `json:"size"`
}

// findVideo returns the stored file for a clip id, or "" if none.
func (s *store) findVideo(id string) string {
	matches, _ := filepath.Glob(filepath.Join(s.dir, "videos", id+".*"))
	for _, m := range matches {
		if !strings.HasPrefix(filepath.Base(m), ".") {
			return m
		}
	}
	return ""
}

func (s *store) listVideos() ([]videoEntry, error) {
	out := []videoEntry{}
	entries, err := os.ReadDir(filepath.Join(s.dir, "videos"))
	if err != nil {
		return out, err
	}
	for _, e := range entries {
		name := e.Name()
		if strings.HasPrefix(name, ".") || e.IsDir() {
			continue
		}
		id := strings.TrimSuffix(name, filepath.Ext(name))
		info, err := e.Info()
		if err != nil || !sessionID.MatchString(id) {
			continue
		}
		out = append(out, videoEntry{ID: id, Size: info.Size()})
	}
	return out, nil
}

// putVideo streams the body to a temporary file, then renames it into
// place, so a cancelled upload never leaves a partial video behind.
func (s *store) putVideo(id, ctype string, body io.Reader) (int64, error) {
	ext, ok := videoTypes[ctype]
	if !ok {
		ext = ".video"
	}
	dir := filepath.Join(s.dir, "videos")
	tmp, err := os.CreateTemp(dir, ".tmp-*")
	if err != nil {
		return 0, err
	}
	n, err := io.Copy(tmp, body)
	if err == nil {
		err = tmp.Sync()
	}
	if cerr := tmp.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		os.Remove(tmp.Name())
		return 0, err
	}
	s.vmu.Lock()
	defer s.vmu.Unlock()
	if old := s.findVideo(id); old != "" && filepath.Ext(old) != ext {
		os.Remove(old)
	}
	if err := os.Rename(tmp.Name(), filepath.Join(dir, id+ext)); err != nil {
		os.Remove(tmp.Name())
		return 0, err
	}
	return n, nil
}

// handleVideo serves /api/store/videos and /api/store/videos/{clip id}.
// Uploads must carry a video or octet-stream content type, which a
// cross-site form cannot send without a preflight this server refuses.
func (s *store) handleVideo(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/api/store/videos" {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		list, err := s.listVideos()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"videos": list,
			"folder": filepath.Join(s.dir, "videos"),
		})
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/api/store/videos/")
	if !sessionID.MatchString(id) {
		http.NotFound(w, r)
		return
	}
	switch r.Method {
	case http.MethodGet, http.MethodHead:
		name := s.findVideo(id)
		if name == "" {
			http.NotFound(w, r)
			return
		}
		f, err := os.Open(name)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		defer f.Close()
		info, err := f.Stat()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", extType(filepath.Ext(name)))
		// ServeContent handles range requests, so the video can seek.
		http.ServeContent(w, r, "", info.ModTime(), f)
	case http.MethodPut:
		ctype := strings.TrimSpace(strings.Split(r.Header.Get("Content-Type"), ";")[0])
		if !strings.HasPrefix(ctype, "video/") && ctype != "application/octet-stream" {
			http.Error(w, "Expected a video.", http.StatusUnsupportedMediaType)
			return
		}
		n, err := s.putVideo(id, ctype, http.MaxBytesReader(w, r.Body, maxVideoBytes))
		if err != nil {
			var tooBig *http.MaxBytesError
			if errors.As(err, &tooBig) {
				http.Error(w, "Video is too large (4 GB limit).", http.StatusRequestEntityTooLarge)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(videoEntry{ID: id, Size: n})
	case http.MethodDelete:
		s.vmu.Lock()
		defer s.vmu.Unlock()
		if name := s.findVideo(id); name != "" {
			if err := os.Remove(name); err != nil && !os.IsNotExist(err) {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

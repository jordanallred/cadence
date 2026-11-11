package main

// Fit history on disk. The browser keeps sessions in IndexedDB, which is
// tied to the exact address (port) and browser. The launcher mirrors every
// session to a JSON file in the user's config folder so history survives a
// port change, a different browser, or cleared site data.

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

// One fit can hold 40 clips of up to 30 s of pose frames at 30 Hz, a
// second copy of the frames once tracking is corrected, and report stills:
// about 150 MB, or 210 MB with the full-precision landmarks older versions
// saved. The cap must cover that or the disk copy silently stops
// updating (#8). Keep in step with MAX_FIT_BYTES in src/storage/portable.ts.
const maxSessionBytes = 256 << 20

var sessionID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,80}$`)

type store struct {
	mu  sync.Mutex
	vmu sync.Mutex // guards renames and deletes in videos/
	dir string     // sessions/<id>.json, deleted/<id>, videos/<clip id>.<ext>
	err string
}

func openStore() *store {
	base, err := os.UserConfigDir()
	if err != nil {
		return &store{err: err.Error()}
	}
	dir := filepath.Join(base, "Cadence")
	for _, d := range []string{"sessions", "deleted", "videos"} {
		if err := os.MkdirAll(filepath.Join(dir, d), 0o700); err != nil {
			return &store{err: err.Error()}
		}
	}
	return &store{dir: dir}
}

type storeList struct {
	Sessions []json.RawMessage `json:"sessions"`
	Deleted  []string          `json:"deleted"`
	Folder   string            `json:"folder"`
}

func (s *store) list() (storeList, error) {
	out := storeList{Sessions: []json.RawMessage{}, Deleted: []string{}, Folder: filepath.Join(s.dir, "sessions")}
	entries, err := os.ReadDir(filepath.Join(s.dir, "sessions"))
	if err != nil {
		return out, err
	}
	for _, e := range entries {
		name := e.Name()
		if !strings.HasSuffix(name, ".json") {
			continue
		}
		b, err := os.ReadFile(filepath.Join(s.dir, "sessions", name))
		if err != nil || !json.Valid(b) {
			continue
		}
		out.Sessions = append(out.Sessions, b)
	}
	gone, _ := os.ReadDir(filepath.Join(s.dir, "deleted"))
	for _, e := range gone {
		out.Deleted = append(out.Deleted, e.Name())
	}
	return out, nil
}

// put writes atomically: a crash mid-write never leaves a half file.
func (s *store) put(id string, body []byte) error {
	final := filepath.Join(s.dir, "sessions", id+".json")
	tmp, err := os.CreateTemp(filepath.Join(s.dir, "sessions"), ".tmp-*")
	if err != nil {
		return err
	}
	if _, err = tmp.Write(body); err == nil {
		err = tmp.Sync()
	}
	if cerr := tmp.Close(); err == nil {
		err = cerr
	}
	if err != nil {
		os.Remove(tmp.Name())
		return err
	}
	if err := os.Rename(tmp.Name(), final); err != nil {
		os.Remove(tmp.Name())
		return err
	}
	os.Remove(filepath.Join(s.dir, "deleted", id))
	return nil
}

func (s *store) remove(id string) error {
	if err := os.WriteFile(filepath.Join(s.dir, "deleted", id), []byte(time.Now().UTC().Format(time.RFC3339)), 0o600); err != nil {
		return err
	}
	err := os.Remove(filepath.Join(s.dir, "sessions", id+".json"))
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

// handle serves /api/store/*. Writes need a JSON content type, so a
// cross-site form or simple request cannot reach them without a CORS
// preflight, which this server never approves.
func (s *store) handle(w http.ResponseWriter, r *http.Request) bool {
	if !strings.HasPrefix(r.URL.Path, "/api/store/") {
		return false
	}
	w.Header().Set("Cache-Control", "no-store")
	if s.dir == "" {
		http.Error(w, "Fit history folder unavailable: "+s.err, http.StatusServiceUnavailable)
		return true
	}
	if strings.HasPrefix(r.URL.Path, "/api/store/videos") {
		s.handleVideo(w, r)
		return true
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if r.URL.Path == "/api/store/sessions" && r.Method == http.MethodGet {
		list, err := s.list()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return true
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(list)
		return true
	}
	id := strings.TrimPrefix(r.URL.Path, "/api/store/sessions/")
	if id == r.URL.Path || !sessionID.MatchString(id) {
		http.NotFound(w, r)
		return true
	}
	switch r.Method {
	case http.MethodPut:
		if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
			http.Error(w, "Expected JSON.", http.StatusUnsupportedMediaType)
			return true
		}
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxSessionBytes))
		if err != nil {
			http.Error(w, "Session is too large.", http.StatusRequestEntityTooLarge)
			return true
		}
		var head struct {
			ID string `json:"id"`
		}
		if json.Unmarshal(body, &head) != nil || head.ID != id {
			http.Error(w, "Session id does not match.", http.StatusBadRequest)
			return true
		}
		if err := s.put(id, body); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return true
		}
		w.WriteHeader(http.StatusNoContent)
	case http.MethodDelete:
		if err := s.remove(id); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return true
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
	return true
}

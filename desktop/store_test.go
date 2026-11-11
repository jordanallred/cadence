package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func storeReq(s *store, method, path, ctype, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	if ctype != "" {
		r.Header.Set("Content-Type", ctype)
	}
	w := httptest.NewRecorder()
	s.handle(w, r)
	return w
}

func TestStoreRoundTrip(t *testing.T) {
	s := &store{dir: t.TempDir()}
	s2 := openStoreAt(t, s.dir)
	if w := storeReq(s2, http.MethodPut, "/api/store/sessions/abc", "application/json", `{"id":"abc","n":1}`); w.Code != 204 {
		t.Fatalf("put: %d %s", w.Code, w.Body)
	}
	if w := storeReq(s2, http.MethodPut, "/api/store/sessions/abc", "text/plain", `{"id":"abc"}`); w.Code != 415 {
		t.Fatalf("text/plain put should be refused, got %d", w.Code)
	}
	if w := storeReq(s2, http.MethodPut, "/api/store/sessions/abc", "application/json", `{"id":"xyz"}`); w.Code != 400 {
		t.Fatalf("mismatched id should be refused, got %d", w.Code)
	}
	if w := storeReq(s2, http.MethodPut, "/api/store/sessions/..%2fx", "application/json", `{}`); w.Code != 404 {
		t.Fatalf("bad id should 404, got %d", w.Code)
	}
	var list storeList
	_ = json.Unmarshal(storeReq(s2, http.MethodGet, "/api/store/sessions", "", "").Body.Bytes(), &list)
	if len(list.Sessions) != 1 || len(list.Deleted) != 0 {
		t.Fatalf("list: %+v", list)
	}
	storeReq(s2, http.MethodDelete, "/api/store/sessions/abc", "", "")
	list = storeList{}
	_ = json.Unmarshal(storeReq(s2, http.MethodGet, "/api/store/sessions", "", "").Body.Bytes(), &list)
	if len(list.Sessions) != 0 || len(list.Deleted) != 1 || list.Deleted[0] != "abc" {
		t.Fatalf("after delete: %+v", list)
	}
}

func openStoreAt(t *testing.T, dir string) *store {
	t.Setenv("XDG_CONFIG_HOME", dir)
	t.Setenv("HOME", dir)
	s := openStore()
	if s.dir == "" {
		t.Fatal(s.err)
	}
	return s
}

func TestVideoRoundTrip(t *testing.T) {
	s := openStoreAt(t, t.TempDir())
	if w := storeReq(s, http.MethodPut, "/api/store/videos/clip1", "text/plain", "x"); w.Code != 415 {
		t.Fatalf("text/plain upload should be refused, got %d", w.Code)
	}
	if w := storeReq(s, http.MethodPut, "/api/store/videos/..%2fx", "video/mp4", "x"); w.Code != 404 {
		t.Fatalf("bad id should 404, got %d", w.Code)
	}
	if w := storeReq(s, http.MethodPut, "/api/store/videos/clip1", "video/webm", "first"); w.Code != 200 {
		t.Fatalf("put: %d %s", w.Code, w.Body)
	}
	// Replacing with another type leaves one file, not two.
	if w := storeReq(s, http.MethodPut, "/api/store/videos/clip1", "video/mp4", "0123456789"); w.Code != 200 {
		t.Fatalf("replace: %d %s", w.Code, w.Body)
	}
	var list struct{ Videos []videoEntry }
	_ = json.Unmarshal(storeReq(s, http.MethodGet, "/api/store/videos", "", "").Body.Bytes(), &list)
	if len(list.Videos) != 1 || list.Videos[0].Size != 10 {
		t.Fatalf("list: %+v", list)
	}
	w := storeReq(s, http.MethodGet, "/api/store/videos/clip1", "", "")
	if w.Code != 200 || w.Body.String() != "0123456789" || w.Header().Get("Content-Type") != "video/mp4" {
		t.Fatalf("get: %d %q %s", w.Code, w.Body, w.Header().Get("Content-Type"))
	}
	r := httptest.NewRequest(http.MethodGet, "/api/store/videos/clip1", nil)
	r.Header.Set("Range", "bytes=2-4")
	rec := httptest.NewRecorder()
	s.handle(rec, r)
	if rec.Code != 206 || rec.Body.String() != "234" {
		t.Fatalf("range: %d %q", rec.Code, rec.Body)
	}
	storeReq(s, http.MethodDelete, "/api/store/videos/clip1", "", "")
	if w := storeReq(s, http.MethodGet, "/api/store/videos/clip1", "", ""); w.Code != 404 {
		t.Fatalf("after delete: %d", w.Code)
	}
}

// A fit with many clips is far over the old 30 MB cap (#8).
func TestStoreLargeFit(t *testing.T) {
	s := openStoreAt(t, t.TempDir())
	body := `{"id":"big","pad":"` + strings.Repeat("x", 120<<20) + `"}`
	if w := storeReq(s, http.MethodPut, "/api/store/sessions/big", "application/json", body); w.Code != 204 {
		t.Fatalf("120 MB fit should save, got %d %s", w.Code, w.Body)
	}
}

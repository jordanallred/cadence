package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"
)

func TestHealthReportsVersion(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("cadence v9.9.9"))
	}))
	defer srv.Close()
	if v, ok := runningVersion(srv.URL + "/"); !ok || v != "v9.9.9" {
		t.Fatalf("got %q %v", v, ok)
	}
	old := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("cadence"))
	}))
	defer old.Close()
	if v, ok := runningVersion(old.URL + "/"); !ok || v != "" {
		t.Fatalf("old: got %q %v", v, ok)
	}
	other := httptest.NewServer(http.NotFoundHandler())
	defer other.Close()
	if _, ok := runningVersion(other.URL + "/"); ok {
		t.Fatal("another program was taken for Cadence")
	}
}

func TestQuitNeedsHeader(t *testing.T) {
	h := handler(fstest.MapFS{"index.html": {Data: []byte("x")}}, "", &phoneLink{}, &store{}, 5180)
	for _, r := range []*http.Request{
		httptest.NewRequest(http.MethodGet, "http://127.0.0.1:5180"+quitPath, nil),
		httptest.NewRequest(http.MethodPost, "http://127.0.0.1:5180"+quitPath, nil),
	} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != http.StatusForbidden {
			t.Fatalf("%s without header: %d", r.Method, w.Code)
		}
	}
	r := httptest.NewRequest(http.MethodPost, "http://evil.example"+quitPath, nil)
	r.Header.Set("X-Cadence", "quit")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != http.StatusForbidden {
		t.Fatalf("foreign host: %d", w.Code)
	}
}

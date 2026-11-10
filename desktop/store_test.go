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

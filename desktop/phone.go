package main

// Phone link: send a video from a phone to Cadence over the local network.
//
// The launcher listens on this computer's Wi-Fi/LAN address (a separate
// port from the app itself) and serves only a small upload page at a
// secret, per-launch URL. The desktop app shows that URL as a QR code.
// Uploaded videos are kept in a temporary folder until the desktop app
// imports or discards them. Nothing goes through the internet.

import (
	"crypto/rand"
	"embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"rsc.io/qr"
)

//go:embed phone.html
var phoneFiles embed.FS

const (
	maxUpload    = 4 << 30 // 4 GB
	maxInbox     = 20
	inboxTimeout = 2 * time.Hour
)

var views = map[string]bool{"left": true, "right": true, "front": true, "rear": true}

type inboxItem struct {
	ID       string    `json:"id"`
	Name     string    `json:"name"`
	View     string    `json:"view"`
	Size     int64     `json:"size"`
	Type     string    `json:"type"`
	Received time.Time `json:"received"`
	path     string
}

type phoneLink struct {
	mu    sync.Mutex
	token string
	url   string
	dir   string
	items map[string]*inboxItem
	err   string
}

func randomHex(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

// lanAddress finds the address this computer uses on its local network.
// Dialing UDP sends no packets; it only asks the OS which interface routes
// outward.
func lanAddress() (net.IP, error) {
	conn, err := net.Dial("udp4", "192.168.0.1:9")
	if err == nil {
		defer conn.Close()
		ip := conn.LocalAddr().(*net.UDPAddr).IP
		if ip.IsPrivate() {
			return ip, nil
		}
	}
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return nil, err
	}
	for _, a := range addrs {
		if n, ok := a.(*net.IPNet); ok && n.IP.To4() != nil && n.IP.IsPrivate() {
			return n.IP, nil
		}
	}
	return nil, fmt.Errorf("no Wi-Fi or local network address found")
}

// startPhoneLink starts the LAN listener. Failure is not fatal: the app
// still works with imported files.
func startPhoneLink(port int, override string) *phoneLink {
	p := &phoneLink{token: randomHex(16), items: map[string]*inboxItem{}}
	dir, err := os.MkdirTemp("", "cadence-inbox-")
	if err != nil {
		p.err = err.Error()
		return p
	}
	p.dir = dir
	var ip net.IP
	if override != "" {
		ip = net.ParseIP(override)
		if ip == nil {
			err = fmt.Errorf("--lan-ip %q is not an IP address", override)
		}
	} else {
		ip, err = lanAddress()
	}
	if err != nil {
		p.err = err.Error()
		return p
	}
	ln, err := net.Listen("tcp4", fmt.Sprintf("%s:%d", ip, port))
	if err != nil {
		p.err = fmt.Sprintf("could not listen on %s:%d (%v)", ip, port, err)
		return p
	}
	p.url = fmt.Sprintf("http://%s:%d/phone/%s", ip, port, p.token)
	srv := &http.Server{
		Handler:           p.lanHandler(),
		ReadHeaderTimeout: 10 * time.Second,
	}
	go func() { _ = srv.Serve(ln) }()
	go p.expire()
	return p
}

func (p *phoneLink) expire() {
	for range time.Tick(5 * time.Minute) {
		p.mu.Lock()
		for id, it := range p.items {
			if time.Since(it.Received) > inboxTimeout {
				os.Remove(it.path)
				delete(p.items, id)
			}
		}
		p.mu.Unlock()
	}
}

func (p *phoneLink) cleanup() {
	if p.dir != "" {
		os.RemoveAll(p.dir)
	}
}

// lanHandler is everything reachable from the network: the phone page and
// its upload endpoint, both behind the secret token.
func (p *phoneLink) lanHandler() http.Handler {
	page, _ := phoneFiles.ReadFile("phone.html")
	base := "/phone/" + p.token
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Cache-Control", "no-store")
		switch {
		case r.URL.Path == base && r.Method == http.MethodGet:
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Header().Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src data:")
			_, _ = w.Write(page)
		case r.URL.Path == base+"/upload" && r.Method == http.MethodPost:
			p.upload(w, r)
		default:
			http.NotFound(w, r)
		}
	})
}

func cleanName(s string) string {
	s = filepath.Base(strings.ReplaceAll(s, "\\", "/"))
	var b strings.Builder
	for _, r := range s {
		if r == '.' || r == '-' || r == '_' || r == ' ' || (r >= '0' && r <= '9') || (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') {
			b.WriteRune(r)
		}
	}
	out := strings.TrimSpace(b.String())
	if out == "" || out == "." || out == ".." {
		out = "phone-video.mp4"
	}
	if len(out) > 120 {
		out = out[len(out)-120:]
	}
	return out
}

func (p *phoneLink) upload(w http.ResponseWriter, r *http.Request) {
	view := r.URL.Query().Get("view")
	if !views[view] {
		http.Error(w, "Choose a view first.", http.StatusBadRequest)
		return
	}
	ctype := r.Header.Get("Content-Type")
	if !strings.HasPrefix(ctype, "video/") && ctype != "application/octet-stream" {
		http.Error(w, "Only video files can be sent.", http.StatusUnsupportedMediaType)
		return
	}
	if r.ContentLength > maxUpload {
		http.Error(w, "Video is larger than 4 GB. Trim it on your phone first.", http.StatusRequestEntityTooLarge)
		return
	}
	p.mu.Lock()
	full := len(p.items) >= maxInbox
	p.mu.Unlock()
	if full {
		http.Error(w, "Cadence already has 20 videos waiting. Import or discard some on your computer first.", http.StatusTooManyRequests)
		return
	}
	id := randomHex(8)
	path := filepath.Join(p.dir, id)
	f, err := os.Create(path)
	if err != nil {
		http.Error(w, "Could not save the video.", http.StatusInternalServerError)
		return
	}
	n, err := io.Copy(f, http.MaxBytesReader(w, r.Body, maxUpload))
	f.Close()
	if err != nil || n == 0 {
		os.Remove(path)
		http.Error(w, "The upload was interrupted. Try again on the same Wi-Fi.", http.StatusBadRequest)
		return
	}
	if ctype == "application/octet-stream" {
		ctype = "video/mp4"
	}
	it := &inboxItem{
		ID:       id,
		Name:     cleanName(r.URL.Query().Get("name")),
		View:     view,
		Size:     n,
		Type:     ctype,
		Received: time.Now(),
		path:     path,
	}
	p.mu.Lock()
	p.items[id] = it
	p.mu.Unlock()
	fmt.Printf("Received %s (%s view, %.1f MB) from your phone.\n", it.Name, view, float64(n)/1e6)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(it)
}

// localHandler serves the phone-link API to the desktop app. It is only
// mounted on the 127.0.0.1 listener.
func (p *phoneLink) localHandler(w http.ResponseWriter, r *http.Request) bool {
	if !strings.HasPrefix(r.URL.Path, "/api/phone") {
		return false
	}
	w.Header().Set("Cache-Control", "no-store")
	switch {
	case r.URL.Path == "/api/phone/link":
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"url": p.url, "error": p.err})
	case r.URL.Path == "/api/phone/qr.png":
		if p.url == "" {
			http.NotFound(w, r)
			return true
		}
		code, err := qr.Encode(p.url, qr.M)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return true
		}
		code.Scale = 8
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(code.PNG())
	case r.URL.Path == "/api/phone/inbox" && r.Method == http.MethodGet:
		p.mu.Lock()
		list := make([]*inboxItem, 0, len(p.items))
		for _, it := range p.items {
			list = append(list, it)
		}
		p.mu.Unlock()
		sort.Slice(list, func(i, j int) bool { return list[i].Received.Before(list[j].Received) })
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(list)
	case strings.HasPrefix(r.URL.Path, "/api/phone/inbox/"):
		id := strings.TrimPrefix(r.URL.Path, "/api/phone/inbox/")
		p.mu.Lock()
		it := p.items[id]
		if it != nil && r.Method == http.MethodDelete {
			delete(p.items, id)
		}
		p.mu.Unlock()
		if it == nil {
			http.NotFound(w, r)
			return true
		}
		if r.Method == http.MethodDelete {
			os.Remove(it.path)
			w.WriteHeader(http.StatusNoContent)
			return true
		}
		w.Header().Set("Content-Type", it.Type)
		http.ServeFile(w, r, it.path)
	default:
		http.NotFound(w, r)
	}
	return true
}

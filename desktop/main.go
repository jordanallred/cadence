// Cadence desktop launcher.
//
// A single executable that serves the built Cadence web app on this
// computer only (127.0.0.1) and opens it in the default browser. Video
// analysis still runs inside the browser; nothing is uploaded.
//
// The pose model is not bundled. On first run it is downloaded once from
// Google's official MediaPipe storage, checked against a known SHA-256 and
// kept in the user's config folder, so later runs work offline.
package main

import (
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"
)

//go:embed all:web
var webFiles embed.FS

// Set at build time with -ldflags "-X main.version=v1.2.3".
var version = "dev"

const (
	modelURL    = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task"
	modelSHA256 = "5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1"
	// A fixed port keeps the same browser origin, and so the same saved
	// sessions, every time the app starts.
	defaultPort = 5180
	healthPath  = "/__cadence"
	quitPath    = "/__cadence/quit"
)

func main() {
	port := flag.Int("port", defaultPort, "local port to serve on")
	noBrowser := flag.Bool("no-browser", false, "do not open a browser window")
	noPhone := flag.Bool("no-phone", false, "turn off sending videos from a phone on your Wi-Fi")
	lanIP := flag.String("lan-ip", "", "network address for the phone link, if the automatic choice is wrong (e.g. with a VPN)")
	showVersion := flag.Bool("version", false, "print the version and exit")
	flag.Parse()
	if *showVersion {
		fmt.Println("Cadence", version)
		return
	}
	if err := run(*port, !*noBrowser, !*noPhone, *lanIP); err != nil {
		fmt.Fprintln(os.Stderr, "Cadence could not start:", err)
		pause()
		os.Exit(1)
	}
}

func run(port int, openBrowser, phone bool, lanIP string) error {
	fmt.Printf("Cadence %s — free, private bike fitting\n\n", version)
	modelPath, err := ensureModel()
	if err != nil {
		return err
	}
	site, err := fs.Sub(webFiles, "web")
	if err != nil {
		return err
	}
	addr := fmt.Sprintf("127.0.0.1:%d", port)
	url := "http://" + addr + "/"
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		running, ok := runningVersion(url)
		if !ok {
			return fmt.Errorf("port %d is in use by another program; try --port %d (fit history is kept either way)", port, port+1)
		}
		if running == version {
			fmt.Println("Cadence is already running. Opening it in your browser.")
			if openBrowser {
				return browse(url)
			}
			return nil
		}
		// A different version holds the port. Opening it would show the
		// old app, so replace it.
		if ln, err = replaceRunning(url, addr, running); err != nil {
			return err
		}
	}
	link := &phoneLink{err: "Phone link is turned off (--no-phone)."}
	if phone {
		link = startPhoneLink(port+1, lanIP)
		if link.url != "" {
			fmt.Println("Phone link ready on your Wi-Fi. Scan the QR code on the Recordings page.")
		} else {
			fmt.Println("Phone link unavailable:", link.err)
		}
	}
	defer link.cleanup()
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-stop
		link.cleanup()
		os.Exit(0)
	}()
	fmt.Println("Open", url, "if your browser does not open automatically.")
	fmt.Println("Keep this window open while you use Cadence. Close it or press Ctrl+C to stop.")
	if openBrowser {
		go func() {
			time.Sleep(300 * time.Millisecond)
			_ = browse(url)
		}()
	}
	st := openStore()
	if st.dir != "" {
		fmt.Println("Fit history is saved in", filepath.Join(st.dir, "sessions"))
	}
	return http.Serve(ln, handler(site, modelPath, link, st, port))
}

func handler(site fs.FS, modelPath string, link *phoneLink, st *store, port int) http.Handler {
	allowedHosts := map[string]bool{
		fmt.Sprintf("127.0.0.1:%d", port): true,
		fmt.Sprintf("localhost:%d", port): true,
	}
	_ = mime.AddExtensionType(".wasm", "application/wasm")
	_ = mime.AddExtensionType(".webmanifest", "application/manifest+json")
	_ = mime.AddExtensionType(".task", "application/octet-stream")
	files := http.FileServer(http.FS(site))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		// Reject other host names so a web page cannot reach this server
		// through DNS rebinding.
		if !allowedHosts[r.Host] {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		if link.localHandler(w, r) || st.handle(w, r) {
			return
		}
		switch r.URL.Path {
		case healthPath:
			fmt.Fprint(w, "cadence "+version)
			return
		case quitPath:
			// A custom header means a web page cannot send this without a
			// CORS preflight, which this server never approves.
			if r.Method != http.MethodPost || r.Header.Get("X-Cadence") != "quit" {
				http.Error(w, "Forbidden", http.StatusForbidden)
				return
			}
			w.WriteHeader(http.StatusNoContent)
			fmt.Println("A newer Cadence was started. Closing this one.")
			go func() {
				time.Sleep(200 * time.Millisecond)
				link.cleanup()
				os.Exit(0)
			}()
			return
		case "/models/pose.task":
			w.Header().Set("Cache-Control", "no-cache")
			http.ServeFile(w, r, modelPath)
			return
		}
		name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if name == "" {
			name = "index.html"
		}
		if _, err := fs.Stat(site, name); err != nil {
			// Unknown paths fall back to the app shell.
			r.URL.Path = "/"
		}
		if strings.HasPrefix(name, "assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			w.Header().Set("Cache-Control", "no-cache")
		}
		files.ServeHTTP(w, r)
	})
}

// ensureModel returns the path of a verified pose model, downloading it
// on first run.
func ensureModel() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		dir = "."
	}
	dir = filepath.Join(dir, "Cadence", "models")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	target := filepath.Join(dir, "pose_landmarker_full.task")
	if ok, _ := verify(target); ok {
		return target, nil
	}
	fmt.Println("First run: downloading the pose model (about 9 MB) from Google's MediaPipe storage…")
	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Get(modelURL)
	if err != nil {
		return "", fmt.Errorf("model download failed (%v). Connect to the internet for the first run", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("model download failed: HTTP %d", resp.StatusCode)
	}
	tmp, err := os.CreateTemp(dir, "pose-*.part")
	if err != nil {
		return "", err
	}
	hash := sha256.New()
	_, err = io.Copy(io.MultiWriter(tmp, hash), resp.Body)
	tmp.Close()
	if err != nil {
		os.Remove(tmp.Name())
		return "", fmt.Errorf("model download interrupted: %v", err)
	}
	if got := hex.EncodeToString(hash.Sum(nil)); got != modelSHA256 {
		os.Remove(tmp.Name())
		return "", errors.New("downloaded model did not match the expected checksum; nothing was saved")
	}
	if err := os.Rename(tmp.Name(), target); err != nil {
		return "", err
	}
	fmt.Println("Model saved to", target)
	return target, nil
}

func verify(file string) (bool, error) {
	f, err := os.Open(file)
	if err != nil {
		return false, err
	}
	defer f.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, f); err != nil {
		return false, err
	}
	return hex.EncodeToString(hash.Sum(nil)) == modelSHA256, nil
}

// runningVersion reports whether Cadence answers at url, and which version.
// Versions before 0.6.0 answer only "cadence", so their version is "".
func runningVersion(url string) (string, bool) {
	client := &http.Client{Timeout: time.Second}
	resp, err := client.Get(url + strings.TrimPrefix(healthPath, "/"))
	if err != nil {
		return "", false
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 64))
	name, ver, _ := strings.Cut(string(body), " ")
	if name != "cadence" {
		return "", false
	}
	return ver, true
}

// replaceRunning asks another running Cadence to close, then takes over its
// address. Versions before 0.6.0 cannot be asked, so the rider is told to
// close that window and this one waits for the address to free up.
func replaceRunning(url, addr, running string) (net.Listener, error) {
	if running == "" {
		fmt.Printf("An older Cadence is still running. Replacing it with %s.\n", version)
	} else {
		fmt.Printf("Cadence %s is still running. Replacing it with %s.\n", running, version)
	}
	req, _ := http.NewRequest(http.MethodPost, url+strings.TrimPrefix(quitPath, "/"), nil)
	req.Header.Set("X-Cadence", "quit")
	asked := false
	if resp, err := (&http.Client{Timeout: 2 * time.Second}).Do(req); err == nil {
		resp.Body.Close()
		asked = resp.StatusCode == http.StatusNoContent
	}
	warned := false
	for start := time.Now(); ; time.Sleep(300 * time.Millisecond) {
		if ln, err := net.Listen("tcp", addr); err == nil {
			if warned {
				fmt.Println("The older Cadence has closed. Starting.")
			}
			return ln, nil
		}
		if !warned && (!asked || time.Since(start) > 5*time.Second) {
			fmt.Println()
			fmt.Println("Close the window of the older Cadence (or press Ctrl+C in it).")
			fmt.Println("This one starts as soon as you do.")
			warned = true
		}
	}
}

func browse(url string) error {
	switch runtime.GOOS {
	case "windows":
		return exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
	case "darwin":
		return exec.Command("open", url).Start()
	default:
		return exec.Command("xdg-open", url).Start()
	}
}

// pause keeps a double-clicked console window open long enough to read an
// error.
func pause() {
	if runtime.GOOS == "windows" {
		fmt.Println("\nPress Enter to close.")
		_, _ = fmt.Scanln()
	}
}

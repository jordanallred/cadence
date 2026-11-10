# Running Cadence from a download

1. Download the file for your computer from the project's Releases page and unzip it.
   - Windows: `cadence-…-windows-amd64.zip` (most PCs) or `-arm64` (Snapdragon laptops)
   - macOS: `cadence-…-macos-arm64.tar.gz` (Apple silicon) or `-amd64` (Intel)
   - Linux: `cadence-…-linux-amd64.tar.gz` or `-arm64`
2. Run `cadence`. It opens Cadence in your browser at http://127.0.0.1:5180.
   Keep its window open while you use the app; close it to stop.
3. The first run downloads the pose model (about 9 MB) from Google's
   MediaPipe storage and checks its fingerprint. After that, Cadence works
   offline.

Everything stays on your computer. Videos are analyzed in your browser and
nothing is uploaded. Sessions are saved in that browser, so use the same
browser each time and export backups.

**First-run warnings.** The downloads are not code-signed yet.
- Windows SmartScreen: choose **More info → Run anyway**.
- macOS: right-click the file, choose **Open**, then **Open** again. If macOS
  still blocks it, run `xattr -d com.apple.quarantine cadence-*` in Terminal.
- Linux: `chmod +x cadence-*` if needed.

Check a download against `SHA256SUMS.txt` on the release page if you want
to verify it. Options: `--port 5181` (sessions are tied to the port),
`--no-browser`, `--version`.

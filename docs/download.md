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

## Sending videos from your phone

On the **Recordings** page, Cadence shows a QR code under "From your phone".
Scan it with your phone's camera, pick the view, then **Record video** or
**Choose from your phone**. The video travels over your Wi-Fi straight to
Cadence on your computer, where it appears with a **Use this video** button.

- Phone and computer must be on the same Wi-Fi or network.
- The first time, Windows may ask whether Cadence can use the network: allow
  it on **private** networks.
- The link contains a secret that changes every time Cadence starts, so only
  someone who can see your screen can send videos. Videos are kept in a
  temporary folder until you use or discard them, and deleted when Cadence
  closes.
- On a VPN or with several network adapters, start Cadence with
  `--lan-ip 192.168.x.y` (your computer's Wi-Fi address). `--no-phone` turns
  the feature off.

Everything stays on your computer. Videos are analyzed in your browser and
nothing is uploaded. Fit history is saved as JSON files on your computer
(Windows: `%AppData%\Cadence\sessions`, macOS: `~/Library/Application
Support/Cadence/sessions`, Linux: `~/.config/Cadence/sessions`), and videos
you choose to keep are saved next to it in `Cadence/videos`, so both are
still there if you switch browsers or ports. Videos kept by an earlier
version in the browser move to that folder the next time you open Cadence.
At the bottom of any page, **Back up all fits** saves every fit to one JSON
file, and **Back up fits and videos** saves every fit plus each kept video
to one .zip. **Import backup** restores either.

**Updating.** Start the new version. If an older Cadence is still open, the new one replaces it; versions before 0.6.0 cannot be closed automatically, so close that window when asked.

**First-run warnings.** The downloads are not code-signed yet.
- Windows SmartScreen: choose **More info → Run anyway**.
- macOS: right-click the file, choose **Open**, then **Open** again. If macOS
  still blocks it, run `xattr -d com.apple.quarantine cadence-*` in Terminal.
- Linux: `chmod +x cadence-*` if needed.

Check a download against `SHA256SUMS.txt` on the release page if you want
to verify it. Options: `--port 5190`,
`--no-browser`, `--version`.

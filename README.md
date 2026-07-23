# 🎓 Udemy Course Downloader

**Created by Kadiri Emmanuel**

A professional, zero-setup Bash script for downloading purchased Udemy courses directly from your terminal.

---

## ✨ Features

- 🔐 **Auto-reads browser session** — No manual cookie export needed (supports Chrome, Firefox, Brave, Edge, and more)
- 🛡️ **Cloudflare bypass** — Uses `curl_cffi` TLS impersonation to avoid HTTP 403 errors
- ✅ **Pre-flight session check** — Validates your login before starting a long download
- 🎬 **Best quality download** — Selectable: Best, 1080p, 720p, or 480p
- 💬 **Flexible subtitles** — Embedded in MP4, separate `.vtt`, both, or none
- ⚡ **Concurrent fragments** — Fast multi-threaded HLS downloads
- ♻️ **Resumable** — Skips already-downloaded lectures on re-run
- 📁 **Organized folders** — `CourseName / Section / Lecture.mp4`

---

## 🚀 Quick Start

```bash
# Download the script
curl -O https://raw.githubusercontent.com/Looch111/Udemy_Course_Downloader/main/udemy-downloader.sh

# Make it executable
chmod +x udemy-downloader.sh

# Run it
./udemy-downloader.sh
```

---

## 📋 Requirements

- Linux (Ubuntu, Debian, Fedora, etc.)
- `bash` 4.0+
- `python3` + `pip` (for yt-dlp and curl_cffi)
- `ffmpeg` (auto-installed if missing)
- A Udemy account with the course purchased/enrolled

> **yt-dlp** and **curl_cffi** are automatically installed on first run.

---

## 🔧 How It Works

1. **Select your browser** — The script reads your Udemy login session directly from your browser's cookie database.
2. **Paste the course URL** — Any Udemy course URL format works (e.g. `https://www.udemy.com/course/course-name/`).
3. **Choose options** — Quality, subtitles preference, output folder.
4. **Session is verified** — A quick pre-flight check confirms your Cloudflare clearance is valid.
5. **Download starts** — Clean progress display with lecture counter, speed, and ETA.

---

## 💬 Subtitle Options

| Option | Description |
|--------|-------------|
| `[1] Both` | Embedded in MP4 **and** separate `.vtt` file (VLC auto-loads) |
| `[2] Embedded only` | Subtitles inside `.mp4` — no extra files |
| `[3] External only` | Separate `.vtt` files only |
| `[4] None` | No subtitles |

---

## ⚠️ Troubleshooting: HTTP 403 Forbidden

If you get a 403 error:
1. Open your browser and go to **udemy.com**
2. Click on any lecture in the course to refresh Cloudflare tokens
3. Re-run the script — the pre-flight check will pass

---

## 📁 Output Structure

```
~/Udemy-Courses/
└── Course Name/
    ├── 01 - Introduction/
    │   ├── 001 - Welcome.mp4
    │   └── 001 - Welcome.en.vtt
    ├── 02 - Section Two/
    │   └── 002 - Topic.mp4
    └── ...
```

---

## 📄 License

MIT — Free to use and modify.

# 🎓 Udemy Course Downloader

> **Author:** Kadiri Emmanuel  
> **Version:** v2.0.0  
> **Date:** August 30, 2026  
> **Description:** Professional Node.js CLI for downloading your purchased Udemy courses to local storage.  
> Powered by **yt-dlp**, the **Udemy API**, and a clean, modular architecture.

---

## ✨ Features

| Feature | Details |
|---|---|
| 🔐 **Multiple Auth Methods** | Bearer token, raw cookie string, or Netscape `cookies.txt` |
| 📚 **Full Curriculum Parsing** | Fetches all sections, lectures, and assets via the Udemy API |
| 🎬 **Quality Selection** | 360 / 480 / 720 / **1080** (default) / 1440 / 2160 / best |
| ⚡ **Concurrent Downloads** | Configurable parallel downloads (default: 3) |
| ↩️  **Resume Support** | Skips already-downloaded files automatically |
| 📄 **Subtitle Download** | Downloads `.vtt` and auto-converts to `.srt` |
| 📎 **Supplementary Assets** | PDFs, slides, zip archives, workbooks |
| 🔁 **Retry on Failure** | Exponential backoff with configurable attempts |
| 📊 **Rich Progress Bars** | Per-lecture + overall course progress display |
| 🗂️  **Numbered Output** | `01-Section-Name/001-Lecture-Title.mp4` |
| 📝 **Course Manifest** | JSON file with full course structure on completion |
| 📋 **Structured Logging** | Colored console + rotating log files |

---

## 🚀 Installation

### Prerequisites

```bash
# Node.js >= 18
node --version

# yt-dlp
pip install yt-dlp
# OR
sudo apt install yt-dlp

# ffmpeg (for merging video+audio)
sudo apt install ffmpeg
```

### Install dependencies

```bash
cd Udemy_Course_Downloader
npm install
```

### Make CLI executable

```bash
chmod +x src/cli/index.js
```

---

## 🔧 Configuration

### Option 1: `.env` file (recommended)

```bash
cp .env.example .env
# Edit .env and add your credentials
```

```env
ACCESS_TOKEN=your_udemy_bearer_token_here
# OR
COOKIE_STRING=your_browser_cookie_string_here

OUTPUT_DIR=./downloads
LOG_LEVEL=info
```

### Option 2: CLI flags (see below)

### How to get your credentials

**Method A — Bearer Token** (most stable):
1. Open Udemy in your browser → DevTools → Network tab
2. Filter for any `api-2.0` request
3. Copy the `Authorization: Bearer <token>` value

**Method B — Cookie String**:
1. Open Udemy → DevTools → Application → Cookies
2. Copy all `udemy.com` cookies as `name=value; name2=value2`

**Method C — cookies.txt** (Netscape format):
1. Install the "Get cookies.txt LOCALLY" browser extension
2. Export cookies for `udemy.com` → save as `cookies.txt`
3. Use `--cookie-file cookies.txt`

---

## 📖 Usage

```bash
node src/cli/index.js [options]
```

### Basic example

```bash
node src/cli/index.js \
  --url "https://www.udemy.com/course/complete-web-development-bootcamp/" \
  --token "your_bearer_token"
```

### With cookie file

```bash
node src/cli/index.js \
  --url "https://www.udemy.com/course/my-course/" \
  --cookie-file ./udemy.cookies.txt \
  --quality 1080 \
  --output ~/Videos/Udemy
```

### All options

```
Options:
  -u, --url <url>              Udemy course URL (required)
  -t, --token <token>          Bearer access token
  -c, --cookies <string>       Raw browser cookie string
      --cookie-file <path>     Path to Netscape cookies.txt
  -q, --quality <quality>      Video quality: 360|480|720|1080|1440|2160|best|worst (default: 1080)
  -o, --output <dir>           Output directory (default: ./downloads)
  -n, --concurrency <number>   Simultaneous downloads 1–10 (default: 3)
      --no-subtitles           Skip subtitle downloads
      --subtitle-lang <lang>   Subtitle language code (default: en)
      --no-assets              Skip supplementary assets
      --no-skip                Re-download existing files
      --yt-dlp-path <path>     Custom yt-dlp binary path
      --ffmpeg-path <path>     Custom ffmpeg binary path
  -l, --log-level <level>      error|warn|info|debug (default: info)
  -v, --version                Show version
  -h, --help                   Show help
```

---

## 📁 Output Structure

```
downloads/
└── Complete-Web-Development-Bootcamp/
    ├── course-manifest.json
    ├── 01-Introduction/
    │   ├── 001-Welcome-to-the-Course.mp4
    │   ├── 001-Welcome-to-the-Course.en.srt
    │   └── 002-Course-Resources.mp4
    ├── 02-HTML-Fundamentals/
    │   ├── 001-What-is-HTML.mp4
    │   ├── 001-What-is-HTML.en.srt
    │   ├── 002-HTML-Boilerplate.mp4
    │   └── 002-HTML-Boilerplate_assets/
    │       └── html-cheatsheet.pdf
    └── ...
```

---

## 🏗️ Project Structure

```
src/
├── cli/
│   └── index.js            ← CLI entry point
├── core/
│   ├── Downloader.js       ← Main orchestrator
│   ├── CourseParser.js     ← Udemy API curriculum fetcher
│   ├── AuthManager.js      ← Credential resolver
│   └── QueueManager.js     ← Concurrency queue
├── downloaders/
│   ├── VideoDownloader.js  ← yt-dlp wrapper
│   ├── AssetDownloader.js  ← PDF/archive downloader
│   └── SubtitleHandler.js  ← VTT → SRT converter
├── api/
│   ├── UdemyClient.js      ← Axios HTTP client
│   └── endpoints.js        ← API endpoint constants
└── utils/
    ├── logger.js           ← Winston logger
    ├── config.js           ← Config loader
    ├── fileSystem.js       ← FS helpers
    ├── sanitize.js         ← Filename sanitizer
    ├── progressBar.js      ← Multi-bar progress
    └── retry.js            ← Exponential backoff
```

---

## ⚖️ Legal

This tool is intended **only** for downloading courses you have legally purchased on Udemy, for personal, offline use. Redistribution of downloaded content is strictly prohibited by Udemy's Terms of Service.

---

## 📄 License

MIT © Kadiri Emmanuel

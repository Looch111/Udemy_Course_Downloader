#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════╗
# ║          🎓  UDEMY COURSE DOWNLOADER  v4.0                   ║
# ║             Created by Kadiri Emmanuel                       ║
# ╚══════════════════════════════════════════════════════════════╝

set -uo pipefail

# ── Colors ───────────────────────────────────────────────────────
C='\033[0;36m'   # Cyan
G='\033[0;32m'   # Green
Y='\033[1;33m'   # Yellow
R='\033[0;31m'   # Red
M='\033[0;35m'   # Magenta
W='\033[1;37m'   # Bold White
D='\033[2m'      # Dim
B='\033[1m'      # Bold
N='\033[0m'      # Reset

# ── Helpers ──────────────────────────────────────────────────────
banner() {
  clear
  echo -e "${C}"
  echo "  ╔══════════════════════════════════════════════════════╗"
  echo "  ║   🎓  U D E M Y   C O U R S E   D O W N L O A D E R  ║"
  echo "  ║          v4.0  •  Created by Kadiri Emmanuel         ║"
  echo "  ╚══════════════════════════════════════════════════════╝"
  echo -e "${N}"
}

sec()  { echo -e "\n${M}${B}━━  $1  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${N}"; }
ok()   { echo -e "  ${G}✔${N}  $*"; }
info() { echo -e "  ${C}➤${N}  $*"; }
warn() { echo -e "  ${Y}⚠${N}  $*"; }
err()  { echo -e "  ${R}✘${N}  $*" >&2; }
die()  { err "$*"; exit 1; }
line() { echo -e "${D}  ─────────────────────────────────────────────────${N}"; }
br()   { echo ""; }

ask() {
  local _var="$1" _msg="$2" _def="${3:-}"
  local _hint=""
  [[ -n "$_def" ]] && _hint=" ${D}[${_def}]${N}"
  echo -en "  ${Y}→${N}  ${W}${_msg}${N}${_hint}: "
  local _val
  read -r _val
  [[ -z "$_val" && -n "$_def" ]] && _val="$_def"
  printf -v "$_var" '%s' "$_val"
}

ask_secret() {
  local _var="$1" _msg="$2"
  echo -en "  ${Y}→${N}  ${W}${_msg}${N}: "
  local _val
  read -rs _val; echo
  printf -v "$_var" '%s' "$_val"
}

# ════════════════════════════════════════════════════════════════
#  STEP 1 — ENSURE LOCAL BIN EXISTS IN PATH
# ════════════════════════════════════════════════════════════════
LOCAL_BIN="$HOME/.local/bin"
mkdir -p "$LOCAL_BIN"
export PATH="$LOCAL_BIN:$PATH"

# ════════════════════════════════════════════════════════════════
#  STEP 2 — AUTO INSTALL DEPENDENCIES
# ════════════════════════════════════════════════════════════════
install_deps() {
  sec "Checking Tools"

  # ── yt-dlp ─────────────────────────────────────────────────
  if command -v yt-dlp &>/dev/null; then
    ok "yt-dlp $(yt-dlp --version) — already installed. Updating..."
    yt-dlp --update-to stable &>/dev/null || true
  else
    info "Installing yt-dlp..."
    if curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" \
        -o "$LOCAL_BIN/yt-dlp" && chmod +x "$LOCAL_BIN/yt-dlp"; then
      ok "yt-dlp installed successfully."
    else
      die "Could not download yt-dlp. Check your internet connection."
    fi
  fi

  # ── ffmpeg (BtbN build — no segfaults) ─────────────────────
  if command -v ffmpeg &>/dev/null; then
    ok "ffmpeg is available."
  else
    info "ffmpeg not found. Downloading stable static build..."
    local arch url dir
    arch=$(uname -m)
    if [[ "$arch" == "x86_64" ]]; then
      url="https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz"
      dir="ffmpeg-master-latest-linux64-gpl"
    elif [[ "$arch" == "aarch64" || "$arch" == "arm64" ]]; then
      url="https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linuxarm64-gpl.tar.xz"
      dir="ffmpeg-master-latest-linuxarm64-gpl"
    else
      warn "Unsupported CPU arch ($arch). ffmpeg skipped — videos may not merge."
      return
    fi

    info "Downloading from GitHub BtbN builds (~120 MB)..."
    if curl -fsSL "$url" -o /tmp/ffmpeg.tar.xz; then
      tar -xf /tmp/ffmpeg.tar.xz -C /tmp
      cp "/tmp/${dir}/bin/ffmpeg"  "$LOCAL_BIN/ffmpeg"
      cp "/tmp/${dir}/bin/ffprobe" "$LOCAL_BIN/ffprobe"
      chmod +x "$LOCAL_BIN/ffmpeg" "$LOCAL_BIN/ffprobe"
      rm -rf "/tmp/${dir}" /tmp/ffmpeg.tar.xz
      ok "ffmpeg installed successfully."
    else
      warn "ffmpeg download failed. Videos will still download but won't be merged."
    fi
  fi
}

# ════════════════════════════════════════════════════════════════
#  STEP 3 — SELECT BROWSER
# ════════════════════════════════════════════════════════════════
BROWSER=""
COOKIES_FILE=""

select_browser() {
  sec "Browser Login Session"
  echo -e "  ${D}Pick the browser where you are logged into Udemy.${N}"
  echo -e "  ${D}The script reads your login session directly from it.${N}"
  br

  local names=()
  local keys=()

  [[ -d "$HOME/.config/google-chrome" ]] && names+=("Google Chrome")   && keys+=("chrome")
  [[ -d "$HOME/.mozilla/firefox" ]]       && names+=("Mozilla Firefox") && keys+=("firefox")
  [[ -d "$HOME/.config/BraveSoftware" ]]  && names+=("Brave Browser")  && keys+=("brave")
  [[ -d "$HOME/.config/chromium" ]]       && names+=("Chromium")        && keys+=("chromium")
  [[ -d "$HOME/.config/microsoft-edge" ]] && names+=("Microsoft Edge")  && keys+=("edge")
  [[ -d "$HOME/.config/opera" ]]          && names+=("Opera")           && keys+=("opera")
  [[ -d "$HOME/.config/vivaldi" ]]        && names+=("Vivaldi")         && keys+=("vivaldi")

  # Always add manual option
  names+=("Use a cookies.txt file instead")
  keys+=("custom")

  local i=1
  for name in "${names[@]}"; do
    echo -e "    ${C}[$i]${N}  $name"
    ((i++))
  done
  line; br

  local choice
  while true; do
    echo -en "  ${Y}→${N}  Choose [1-$((i-1))]: "
    read -r choice
    if [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice < i )); then
      local idx=$(( choice - 1 ))
      BROWSER="${keys[$idx]}"
      break
    fi
    err "Invalid option. Pick a number from the list."
  done

  if [[ "$BROWSER" == "custom" ]]; then
    br
    echo -e "  ${D}How to get cookies.txt:${N}"
    echo -e "  ${D}  1. Install 'Get cookies.txt LOCALLY' extension in Chrome/Firefox${N}"
    echo -e "  ${D}  2. Log into udemy.com${N}"
    echo -e "  ${D}  3. Click the extension → Export cookies for udemy.com${N}"
    br
    while true; do
      ask COOKIES_FILE "Path to cookies.txt file"
      COOKIES_FILE="${COOKIES_FILE/#\~/$HOME}"
      [[ -f "$COOKIES_FILE" ]] && { ok "Cookies file: $COOKIES_FILE"; break; }
      err "File not found. Try again."
    done
  else
    ok "Browser selected: ${names[$((choice-1))]}"
  fi
}

# ════════════════════════════════════════════════════════════════
#  STEP 4 — PASTE COURSE URL
# ════════════════════════════════════════════════════════════════
COURSE_URL=""

get_url() {
  sec "Course URL"
  echo -e "  ${D}1. Open Udemy in your browser and go to any lecture in the course.${N}"
  echo -e "  ${D}2. Copy the URL from the address bar.${N}"
  echo -e "  ${D}3. Paste it below (any Udemy course URL format works).${N}"
  br

  while true; do
    ask COURSE_URL "Paste course URL"

    if [[ "$COURSE_URL" == *"udemy.com/course/"* ]]; then
      # Extract just the base course slug and append /learn/ (required for yt-dlp)
      if [[ "$COURSE_URL" =~ (https?://(www\.)?udemy\.com/course/[^/?#]+) ]]; then
        COURSE_URL="${BASH_REMATCH[1]}/learn/"
      fi
      ok "Course URL: $COURSE_URL"
      break
    else
      err "That doesn't look like a Udemy course URL. It must contain 'udemy.com/course/'"
    fi
  done
}

# ════════════════════════════════════════════════════════════════
#  STEP 5 — CHOOSE OPTIONS
# ════════════════════════════════════════════════════════════════
OUTPUT_DIR="$HOME/Udemy-Courses"
QUALITY="best"
SUBTITLE_MODE="both"

get_options() {
  sec "Download Options"
  br

  ask OUTPUT_DIR "Save downloads to" "$OUTPUT_DIR"
  OUTPUT_DIR="${OUTPUT_DIR/#\~/$HOME}"
  mkdir -p "$OUTPUT_DIR" || die "Cannot create directory: $OUTPUT_DIR"
  ok "Output: $OUTPUT_DIR"
  br

  echo -e "  ${W}Video quality:${N}"
  echo -e "    ${C}[1]${N}  Best available (recommended)"
  echo -e "    ${C}[2]${N}  1080p"
  echo -e "    ${C}[3]${N}  720p  (smaller files)"
  echo -e "    ${C}[4]${N}  480p  (much smaller)"
  line
  local q
  echo -en "  ${Y}→${N}  Choose [1-4]: "
  read -r q
  case "$q" in
    2) QUALITY="1080p" ;;
    3) QUALITY="720p"  ;;
    4) QUALITY="480p"  ;;
    *) QUALITY="best"  ;;
  esac
  ok "Quality: $QUALITY"
  br

  echo -e "  ${W}Subtitles preference:${N}"
  echo -e "    ${C}[1]${N}  Both embedded in MP4 AND saved as separate .vtt file (recommended)"
  echo -e "    ${C}[2]${N}  Embedded in MP4 only (no extra files)"
  echo -e "    ${C}[3]${N}  Separate .vtt file only"
  echo -e "    ${C}[4]${N}  No subtitles"
  line
  local s
  echo -en "  ${Y}→${N}  Choose [1-4]: "
  read -r s
  case "$s" in
    2) SUBTITLE_MODE="embed" ;;
    3) SUBTITLE_MODE="external" ;;
    4) SUBTITLE_MODE="none" ;;
    *) SUBTITLE_MODE="both" ;;
  esac
  ok "Subtitles: $SUBTITLE_MODE"
}

# ════════════════════════════════════════════════════════════════
#  STEP 6 — SESSION VERIFICATION & DOWNLOAD
# ════════════════════════════════════════════════════════════════
verify_session() {
  sec "Session Verification"
  info "Validating login session & Cloudflare clearance..."

  local TEST_ARGS=()
  if [[ "$BROWSER" == "custom" ]]; then
    TEST_ARGS+=(--cookies "$COOKIES_FILE")
  else
    TEST_ARGS+=(--cookies-from-browser "$BROWSER")
  fi

  TEST_ARGS+=(
    --impersonate "Chrome-124"
    --user-agent "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    --add-header "Accept-Language: en-US,en;q=0.9"
    --add-header "Referer: https://www.udemy.com/"
    --dump-json
    --playlist-items 1
  )

  local TEST_LOG="/tmp/udemy-check-$$.log"
  if yt-dlp "${TEST_ARGS[@]}" "$COURSE_URL" > /dev/null 2>"$TEST_LOG"; then
    ok "Session verified! Access to Udemy granted."
    rm -f "$TEST_LOG"
    return 0
  else
    br
    err "Session validation failed!"
    if grep -qi "403: Forbidden" "$TEST_LOG"; then
      warn "Udemy returned HTTP Error 403: Forbidden (Cloudflare bot check)."
      br
      echo -e "  ${Y}Why this happens:${N}"
      echo -e "  ${D}  • Your browser's Cloudflare security clearance cookie (__cf_bm / cf_clearance) expired.${N}"
      echo -e "  ${D}  • Or the browser database was locked while open.${N}"
      br
      echo -e "  ${Y}Quick Fix (takes 10 seconds):${N}"
      echo -e "  ${W}  1. Open your browser ($BROWSER) and visit https://www.udemy.com${N}"
      echo -e "  ${W}  2. Click on any lecture in the course to refresh Cloudflare tokens.${N}"
      echo -e "  ${W}  3. Return here and choose [1] to retry.${N}"
      br
    elif grep -qi "not free\|pay for it" "$TEST_LOG"; then
      err "This course is not enrolled or purchased on this Udemy account."
    else
      err "Error details: $(tail -n 2 "$TEST_LOG")"
    fi
    rm -f "$TEST_LOG"

    echo -e "  ${W}What would you like to do?${N}"
    echo -e "    ${C}[1]${N}  Retry session check (after refreshing browser)"
    echo -e "    ${C}[2]${N}  Switch browser / cookies.txt"
    echo -e "    ${C}[3]${N}  Exit"
    line
    local choice
    echo -en "  ${Y}→${N}  Choose [1-3]: "
    read -r choice
    case "$choice" in
      2) select_browser; verify_session ;;
      3) info "Exiting."; exit 1 ;;
      *) verify_session ;;
    esac
  fi
}

run_download() {
  sec "Summary"
  br
  echo -e "  ${W}Course URL  :${N}  $COURSE_URL"
  if [[ "$BROWSER" == "custom" ]]; then
    echo -e "  ${W}Auth        :${N}  cookies.txt → $COOKIES_FILE"
  else
    echo -e "  ${W}Auth        :${N}  Browser → $BROWSER"
  fi
  echo -e "  ${W}Quality     :${N}  $QUALITY"
  echo -e "  ${W}Subtitles   :${N}  $SUBTITLE_MODE"
  echo -e "  ${W}Save to     :${N}  $OUTPUT_DIR"
  br; line; br

  echo -en "  ${Y}→${N}  ${W}Start download? [Y/n]:${N} "
  local confirm; read -r confirm
  [[ "${confirm,,}" == "n" ]] && { info "Cancelled."; exit 0; }

  # ── Build quality format string ───────────────────────────
  local fmt
  case "$QUALITY" in
    1080p) fmt="bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]" ;;
    720p)  fmt="bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]" ;;
    480p)  fmt="bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480]" ;;
    *)     fmt="bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" ;;
  esac

  # ── Build yt-dlp argument array ───────────────────────────
  local ARGS=()

  # Auth
  if [[ "$BROWSER" == "custom" ]]; then
    ARGS+=(--cookies "$COOKIES_FILE")
  else
    ARGS+=(--cookies-from-browser "$BROWSER")
  fi

  # TLS impersonation & browser headers matching real Chrome
  ARGS+=(
    --impersonate "Chrome-124"
    --user-agent "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    --add-header "Accept-Language: en-US,en;q=0.9"
    --add-header "Referer: https://www.udemy.com/"
  )

  # Output path: CourseName/Section/Lecture.mp4
  ARGS+=(
    --output "${OUTPUT_DIR}/%(playlist)s/%(chapter_number)02d - %(chapter)s/%(playlist_index)03d - %(title)s.%(ext)s"
    --merge-output-format mp4
    -f "$fmt"
  )

  # Subtitles
  case "$SUBTITLE_MODE" in
    both)
      ARGS+=(
        --write-subs
        --write-auto-subs
        --sub-langs "en"
        --embed-subs
      )
      ;;
    embed)
      ARGS+=(
        --sub-langs "en"
        --embed-subs
      )
      ;;
    external)
      ARGS+=(
        --write-subs
        --write-auto-subs
        --sub-langs "en"
      )
      ;;
    none)
      ;;
  esac

  # Metadata & chapters
  ARGS+=(
    --add-metadata
    --add-chapters
  )

  # Reliability settings
  ARGS+=(
    --concurrent-fragments 8
    --retries 20
    --fragment-retries 20
    --retry-sleep linear=2::3
    --extractor-retries 10
    --socket-timeout 15
    --continue          # resume partial downloads
    --no-overwrites     # skip already downloaded files
    --ignore-errors     # skip non-video items (quizzes, articles)
  )

  # Progress display — single animated line
  ARGS+=(
    --progress-template "PROG:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s"
    --newline
  )

  # The URL
  ARGS+=("$COURSE_URL")

  # ── Run with auto-retry on SSL/network errors ─────────────
  sec "Downloading"
  local LOG="/tmp/udemy-dl-$$.log"
  local max_tries=3
  local try=1
  local exit_code=0

  info "Logs saved to: $LOG"
  br

  # Graceful Ctrl+C
  trap 'br; warn "Download paused. Run script again to resume — already downloaded files are kept."; exit 130' INT

  while (( try <= max_tries )); do
    exit_code=0
    : > "$LOG"

    local lect_num="?" lect_total="?" lect_name="Initializing..."

    # Stream yt-dlp output through a clean parser
    while IFS= read -r line; do
      echo "$line" >> "$LOG"

      # Progress bar line
      if [[ "$line" =~ PROG:[[:space:]]*([0-9.]+)%\|([^|]*)\|([^|]*) ]]; then
        local pct="${BASH_REMATCH[1]%.*}"
        local spd="${BASH_REMATCH[2]//[[:space:]]/}"
        local eta="${BASH_REMATCH[3]//[[:space:]]/}"
        [[ -z "$pct" || "$pct" == " " ]] && pct=0
        local fill=$(( pct / 10 )) empty=$(( 10 - pct / 10 ))
        local bar=""
        for (( i=0; i<fill;  i++ )); do bar+="█"; done
        for (( i=0; i<empty; i++ )); do bar+="░"; done
        # Neat, compact layout fitting in ~75 chars max
        printf "\r\033[K  ${C}[%s/%s]${N} %3d%% [${G}%s${N}] %-9s │ ETA %-5s │ %.22s" \
          "$lect_num" "$lect_total" "$pct" "$bar" "$spd" "$eta" "$lect_name"

      # Lecture counter
      elif [[ "$line" =~ \[download\]\ Downloading\ item\ ([0-9]+)\ of\ ([0-9]+) ]]; then
        lect_num="${BASH_REMATCH[1]}"
        lect_total="${BASH_REMATCH[2]}"
        lect_name="Fetching..."
        printf "\r\033[K  ${Y}↓  Lecture %s/%s...${N}" "$lect_num" "$lect_total"

      # Capture lecture name from Destination line
      elif [[ "$line" =~ \[download\]\ Destination:\ .*/([^/]+)\.mp4$ ]]; then
        lect_name="${BASH_REMATCH[1]}"

      # Merger status
      elif [[ "$line" =~ \[Merger\]|\[ffmpeg\] ]]; then
        printf "\r\033[K  ${M}⚙  Processing: %.30s${N}" "$lect_name"

      # Catch fatal errors (not per-lecture skips)
      elif [[ "$line" =~ ^ERROR:.*unable\ to\ download\ webpage|^ERROR:.*HTTP\ Error\ 4 ]]; then
        printf "\n  ${R}✘  Fatal: %s${N}\n" "${line:7:80}"
        exit_code=1
      fi

    done < <(yt-dlp "${ARGS[@]}" 2>&1); local pipe_exit="${PIPESTATUS[0]:-0}"
    [[ "$pipe_exit" -ne 0 ]] && exit_code="$pipe_exit"

    # Check if we should retry (SSL / network drop)
    if [[ "$exit_code" -ne 0 ]]; then
      if grep -qiE 'ssl|eof|connection reset|network|timed? ?out|HTTP Error 5' "$LOG" 2>/dev/null; then
        br
        warn "Network/SSL error detected on attempt $try/$max_tries."
        if (( try < max_tries )); then
          warn "Retrying in 8 seconds..."
          sleep 8
          (( try++ ))
          continue
        fi
      fi
    fi

    break  # success or non-retriable error
  done

  br; br
  if [[ "$exit_code" -eq 0 ]]; then
    echo -e "${G}"
    echo "  ╔══════════════════════════════════════════════════════╗"
    echo "  ║   🎉  All done! Course downloaded successfully.      ║"
    echo "  ╚══════════════════════════════════════════════════════╝"
    echo -e "${N}"
    ok "Files saved to: ${W}${OUTPUT_DIR}${N}"
    br
  else
    err "Download finished with errors (exit $exit_code)."
    err "Log file: $LOG"
    br
    echo -e "  ${Y}Common fixes:${N}"
    echo -e "  ${D}  1. Open Udemy in your browser ($BROWSER) and click any lecture to refresh session.${N}"
    echo -e "  ${D}  2. Confirm you are enrolled/purchased this course.${N}"
    echo -e "  ${D}  3. Try running: yt-dlp --update${N}"
    br
    exit 1
  fi
}

# ════════════════════════════════════════════════════════════════
#  MAIN
# ════════════════════════════════════════════════════════════════
banner
install_deps
select_browser
get_url
get_options
verify_session
run_download


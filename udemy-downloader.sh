#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════╗
# ║          🎓  UDEMY COURSE DOWNLOADER  v4.0                   ║
# ║             Created by Kadiri Emmanuel                       ║
# ╚══════════════════════════════════════════════════════════════╝

set -uo pipefail

# ── Color System (TrueColor with fallback) ───────────────────────
if [[ "${COLORTERM:-}" == "truecolor" || "${COLORTERM:-}" == "24bit" || "${TERM:-}" == *"256"* || "${TERM:-}" == "xterm-kitty" || "${TERM:-}" == "alacritty" ]]; then
  C1="\033[38;2;0;210;255m"      # Electric Cyan
  C2="\033[38;2;168;85;247m"    # Purple Accent
  G="\033[38;2;34;197;94m"       # Emerald Green
  Y="\033[38;2;245;158;11m"     # Amber Gold
  R="\033[38;2;239;68;68m"       # Rose Red
  W="\033[1;37m"                 # Bold White
  D="\033[38;2;148;163;184m"     # Slate Dim
  B="\033[1m"                    # Bold
  N="\033[0m"                    # Reset
else
  C1="\033[1;36m"
  C2="\033[1;35m"
  G="\033[1;32m"
  Y="\033[1;33m"
  R="\033[1;31m"
  W="\033[1;37m"
  D="\033[2m"
  B="\033[1m"
  N="\033[0m"
fi

# ── Sleek Accent-Card UI Helpers ─────────────────────────────────
banner() {
  clear
  echo -e ""
  echo -e "${C1}╭──────────────────────────────────────────────────────────╮${N}"
  echo -e "${C1}│   ${W}🎓  U D E M Y   C O U R S E   D O W N L O A D E R${N}      ${C1}│${N}"
  echo -e "${C1}│       ${C2}v4.0  •  Created by Kadiri Emmanuel${N}                ${C1}│${N}"
  echo -e "${C1}╰──────────────────────────────────────────────────────────╯${N}"
}

sec() {
  local title="$1"
  local step="${2:-}"
  echo -e ""
  if [[ -n "$step" ]]; then
    local plain="[ STEP ${step} ] ── ${title}"
    local len=${#plain}
    local pad_len=$(( 53 - len ))
    (( pad_len < 2 )) && pad_len=2
    local fill=""
    for (( i=0; i<pad_len; i++ )); do fill+="─"; done
    echo -e "${C1}╭─ ${C2}[ STEP ${step} ]${C1} ── ${W}${title}${C1} ${fill}╮${N}"
  else
    local len=${#title}
    local pad_len=$(( 53 - len ))
    (( pad_len < 2 )) && pad_len=2
    local fill=""
    for (( i=0; i<pad_len; i++ )); do fill+="─"; done
    echo -e "${C1}╭── ${W}${title}${C1} ${fill}╮${N}"
  fi
  echo -e "${C1}│${N}"
}

card_end() {
  echo -e "${C1}│${N}"
  echo -e "${C1}╰──────────────────────────────────────────────────────────╯${N}"
  echo -e ""
}

ok()   { echo -e "${C1}│${N}  ${G}✔${N}  ${W}$*${N}"; }
info() { echo -e "${C1}│${N}  ${C1}➤${N}  ${D}$*${N}"; }
warn() { echo -e "${C1}│${N}  ${Y}⚠${N}  ${Y}$*${N}"; }
err()  { echo -e "${C1}│${N}  ${R}✘${N}  ${R}$*${N}" >&2; }
die()  { err "$*"; card_end; exit 1; }
line() { echo -e "${C1}│${N}  ${D}─────────────────────────────────────────────────────────${N}"; }
br()   { echo -e "${C1}│${N}"; }

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
  banner
  sec "Checking Tools & Environment" "1/5"

  # ── yt-dlp ─────────────────────────────────────────────────
  if command -v yt-dlp &>/dev/null; then
    ok "yt-dlp ${D}($(yt-dlp --version))${N} — installed & ready."
    yt-dlp --update-to stable &>/dev/null || true
  else
    info "Installing yt-dlp CLI tool..."
    if curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" \
        -o "$LOCAL_BIN/yt-dlp" && chmod +x "$LOCAL_BIN/yt-dlp"; then
      ok "yt-dlp installed successfully."
    else
      die "Could not download yt-dlp. Check your internet connection."
    fi
  fi

  # ── ffmpeg ─────────────────────────────────────────────────
  if command -v ffmpeg &>/dev/null; then
    ok "ffmpeg multimedia engine — available."
  else
    info "Downloading static ffmpeg engine..."
    local arch url dir
    arch=$(uname -m)
    if [[ "$arch" == "x86_64" ]]; then
      url="https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz"
      dir="ffmpeg-master-latest-linux64-gpl"
    elif [[ "$arch" == "aarch64" || "$arch" == "arm64" ]]; then
      url="https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linuxarm64-gpl.tar.xz"
      dir="ffmpeg-master-latest-linuxarm64-gpl"
    else
      warn "Unsupported CPU arch ($arch). ffmpeg skipped."
      card_end
      return
    fi

    if curl -fsSL "$url" -o /tmp/ffmpeg.tar.xz; then
      tar -xf /tmp/ffmpeg.tar.xz -C /tmp
      cp "/tmp/${dir}/bin/ffmpeg"  "$LOCAL_BIN/ffmpeg"
      cp "/tmp/${dir}/bin/ffprobe" "$LOCAL_BIN/ffprobe"
      chmod +x "$LOCAL_BIN/ffmpeg" "$LOCAL_BIN/ffprobe"
      rm -rf "/tmp/${dir}" /tmp/ffmpeg.tar.xz
      ok "ffmpeg engine installed successfully."
    else
      warn "ffmpeg download failed. Videos won't be merged."
    fi
  fi
  card_end
}

# ════════════════════════════════════════════════════════════════
#  STEP 3 — SELECT BROWSER
# ════════════════════════════════════════════════════════════════
BROWSER=""
COOKIES_FILE=""

select_browser() {
  banner
  sec "Browser Authentication" "2/5"
  info "Select the browser where you are logged into Udemy."
  info "Your login session will be extracted automatically."
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

  # Manual option
  names+=("Use a cookies.txt file instead")
  keys+=("custom")

  local i=1
  for name in "${names[@]}"; do
    echo -e "${C1}│${N}    ${C1}[$i]${N}  $name"
    ((i++))
  done
  card_end

  local choice
  while true; do
    ask choice "Choose option [1-$((i-1))]"
    if [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice < i )); then
      local idx=$(( choice - 1 ))
      BROWSER="${keys[$idx]}"
      break
    fi
    echo -e "  ${R}✘  Invalid option. Pick a number from the list.${N}"
  done

  if [[ "$BROWSER" == "custom" ]]; then
    banner
    sec "Custom Cookies File" "2/5"
    info "1. Install 'Get cookies.txt LOCALLY' extension in Chrome/Firefox"
    info "2. Log into udemy.com"
    info "3. Export cookies for udemy.com to cookies.txt"
    card_end
    while true; do
      ask COOKIES_FILE "Path to cookies.txt file"
      COOKIES_FILE="${COOKIES_FILE/#\~/$HOME}"
      [[ -f "$COOKIES_FILE" ]] && break
      echo -e "  ${R}✘  File not found. Try again.${N}"
    done
  fi
}

# ════════════════════════════════════════════════════════════════
#  STEP 4 — PASTE COURSE URL
# ════════════════════════════════════════════════════════════════
COURSE_URL=""

get_url() {
  banner
  sec "Course Target URL" "3/5"
  info "1. Open Udemy in your browser and open your course."
  info "2. Copy the URL from address bar and paste below."
  card_end

  while true; do
    ask COURSE_URL "Paste Udemy Course URL"

    if [[ "$COURSE_URL" == *"udemy.com/course/"* ]]; then
      if [[ "$COURSE_URL" =~ (https?://(www\.)?udemy\.com/course/[^/?#]+) ]]; then
        COURSE_URL="${BASH_REMATCH[1]}/learn/"
      fi
      break
    else
      echo -e "  ${R}✘  Invalid URL. Must contain 'udemy.com/course/'${N}"
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
  banner
  sec "Download Preferences" "4/5"

  echo -e "${C1}│${N}  ${W}Video quality options:${N}"
  echo -e "${C1}│${N}    ${C1}[1]${N}  Best available (Recommended)"
  echo -e "${C1}│${N}    ${C1}[2]${N}  1080p Full HD"
  echo -e "${C1}│${N}    ${C1}[3]${N}  720p HD (Smaller file size)"
  echo -e "${C1}│${N}    ${C1}[4]${N}  480p SD (Low bandwidth)"
  line
  echo -e "${C1}│${N}  ${W}Subtitles preference:${N}"
  echo -e "${C1}│${N}    ${C1}[1]${N}  Both embedded in MP4 AND external .vtt"
  echo -e "${C1}│${N}    ${C1}[2]${N}  Embedded in MP4 only"
  echo -e "${C1}│${N}    ${C1}[3]${N}  Separate .vtt file only"
  echo -e "${C1}│${N}    ${C1}[4]${N}  No subtitles"
  card_end

  ask OUTPUT_DIR "Save folder" "$OUTPUT_DIR"
  OUTPUT_DIR="${OUTPUT_DIR/#\~/$HOME}"
  mkdir -p "$OUTPUT_DIR" || die "Cannot create directory: $OUTPUT_DIR"

  local q
  ask q "Video quality [1-4]" "1"
  case "$q" in
    2) QUALITY="1080p" ;;
    3) QUALITY="720p"  ;;
    4) QUALITY="480p"  ;;
    *) QUALITY="best"  ;;
  esac

  local s
  ask s "Subtitle mode [1-4]" "1"
  case "$s" in
    2) SUBTITLE_MODE="embed" ;;
    3) SUBTITLE_MODE="external" ;;
    4) SUBTITLE_MODE="none" ;;
    *) SUBTITLE_MODE="both" ;;
  esac
}

# ════════════════════════════════════════════════════════════════
#  STEP 6 — SESSION VERIFICATION & DOWNLOAD
# ════════════════════════════════════════════════════════════════
verify_session() {
  banner
  sec "Session & Cloudflare Validation" "5/5"
  info "Validating login session & Cloudflare tokens..."

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
    ok "Session verified! Access granted."
    rm -f "$TEST_LOG"
    card_end
    sleep 1
    return 0
  else
    br
    err "Session validation failed!"
    if grep -qi "403: Forbidden" "$TEST_LOG"; then
      warn "Cloudflare clearance expired (HTTP 403)."
      info "Quick Fix: Open $BROWSER, visit udemy.com & play 1 sec of any video."
    fi
    rm -f "$TEST_LOG"
    card_end

    local choice
    ask choice "Option [1] Retry  [2] Switch Auth  [3] Exit" "1"
    case "$choice" in
      2) select_browser; verify_session ;;
      3) exit 1 ;;
      *) verify_session ;;
    esac
  fi
}

run_download() {
  banner
  sec "Configuration Summary"
  echo -e "${C1}│${N}  ${C1}•${N} ${W}Course URL  :${N} ${D}$COURSE_URL${N}"
  echo -e "${C1}│${N}  ${C1}•${N} ${W}Auth Source :${N} ${D}${BROWSER}${N}"
  echo -e "${C1}│${N}  ${C1}•${N} ${W}Quality     :${N} ${D}${QUALITY}${N}"
  echo -e "${C1}│${N}  ${C1}•${N} ${W}Subtitles   :${N} ${D}${SUBTITLE_MODE}${N}"
  echo -e "${C1}│${N}  ${C1}•${N} ${W}Save Folder :${N} ${D}${OUTPUT_DIR}${N}"
  card_end

  local confirm
  ask confirm "Start download now? [Y/n]" "y"
  [[ "${confirm,,}" == "n" ]] && { echo -e "  Download cancelled."; exit 0; }

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
  if [[ "$BROWSER" == "custom" ]]; then
    ARGS+=(--cookies "$COOKIES_FILE")
  else
    ARGS+=(--cookies-from-browser "$BROWSER")
  fi

  ARGS+=(
    --impersonate "Chrome-124"
    --user-agent "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    --add-header "Accept-Language: en-US,en;q=0.9"
    --add-header "Referer: https://www.udemy.com/"
    --output "${OUTPUT_DIR}/%(playlist)s/%(chapter_number)02d - %(chapter)s/%(playlist_index)03d - %(title)s.%(ext)s"
    --merge-output-format mp4
    -f "$fmt"
  )

  case "$SUBTITLE_MODE" in
    both)     ARGS+=(--write-subs --write-auto-subs --sub-langs "en" --embed-subs) ;;
    embed)    ARGS+=(--sub-langs "en" --embed-subs) ;;
    external) ARGS+=(--write-subs --write-auto-subs --sub-langs "en") ;;
    none)     ;;
  esac

  ARGS+=(
    --add-metadata --add-chapters
    --concurrent-fragments 8 --retries 20 --fragment-retries 20
    --retry-sleep linear=2::3 --extractor-retries 10 --socket-timeout 15
    --continue --no-overwrites --ignore-errors
    --progress-template "PROG:%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s"
    --newline
    "$COURSE_URL"
  )

  banner
  sec "Live Download Progress Dashboard"
  local LOG="/tmp/udemy-dl-$$.log"
  local max_tries=3
  local try=1
  local exit_code=0

  trap 'card_end; echo -e "  ${Y}⚠  Download paused. Run script again to resume.${N}"; exit 130' INT

  while (( try <= max_tries )); do
    exit_code=0
    : > "$LOG"
    local lect_num="?" lect_total="?" lect_name="Initializing..."

    while IFS= read -r line; do
      echo "$line" >> "$LOG"

      if [[ "$line" =~ PROG:[[:space:]]*([0-9.]+)%\|([^|]*)\|([^|]*) ]]; then
        local pct="${BASH_REMATCH[1]%.*}"
        local spd="${BASH_REMATCH[2]//[[:space:]]/}"
        local eta="${BASH_REMATCH[3]//[[:space:]]/}"
        [[ -z "$pct" || "$pct" == " " ]] && pct=0
        local fill=$(( pct / 5 )) empty=$(( 20 - fill ))
        local bar=""
        for (( i=0; i<fill;  i++ )); do bar+="█"; done
        for (( i=0; i<empty; i++ )); do bar+="░"; done

        printf "\r\033[K${C1}│${N}  ${C1}[%s/%s]${N} %3d%% [${G}%s${N}] ${C2}%-8s${N} │ ${Y}%-5s${N}" \
          "$lect_num" "$lect_total" "$pct" "$bar" "$spd" "$eta"

      elif [[ "$line" =~ \[download\]\ Downloading\ item\ ([0-9]+)\ of\ ([0-9]+) ]]; then
        lect_num="${BASH_REMATCH[1]}"
        lect_total="${BASH_REMATCH[2]}"
        lect_name="Fetching..."
        printf "\r\033[K${C1}│${N}  ${Y}↓  Lecture %s/%s...${N}" "$lect_num" "$lect_total"

      elif [[ "$line" =~ \[download\]\ Destination:\ .*/([^/]+)\.mp4$ ]]; then
        lect_name="${BASH_REMATCH[1]}"

      elif [[ "$line" =~ ^ERROR:.*unable\ to\ download\ webpage|^ERROR:.*HTTP\ Error\ 4 ]]; then
        exit_code=1
      fi
    done < <(yt-dlp "${ARGS[@]}" 2>&1); local pipe_exit="${PIPESTATUS[0]:-0}"

    if [[ "$pipe_exit" -ne 0 && "$exit_code" -eq 0 ]]; then
      if grep -qiE 'ERROR:.*unable to download webpage|ERROR:.*HTTP Error 403|ERROR:.*Forbidden' "$LOG"; then
        exit_code=1
      else
        exit_code=0
      fi
    fi

    if [[ "$exit_code" -ne 0 ]]; then
      if grep -qiE 'ssl|eof|connection reset|network|timed? ?out|HTTP Error 5' "$LOG" 2>/dev/null; then
        if (( try < max_tries )); then
          sleep 8
          (( try++ ))
          continue
        fi
      fi
    fi

    break
  done

  echo ""
  card_end

  if [[ "$exit_code" -eq 0 ]]; then
    banner
    sec "Download Complete"
    ok "ALL LECTURES DOWNLOADED & MERGED SUCCESSFULLY!"
    info "Saved to  : $OUTPUT_DIR"
    info "Author    : Kadiri Emmanuel"
    info "Status    : Verified & Offline Ready"
    card_end
  else
    echo -e "  ${R}✘  Download completed with errors. See log: $LOG${N}\n"
    exit 1
  fi
}

# ════════════════════════════════════════════════════════════════
#  MAIN EXECUTION
# ════════════════════════════════════════════════════════════════
install_deps
select_browser
get_url
get_options
verify_session
run_download

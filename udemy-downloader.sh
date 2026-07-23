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

# ── Pixel-Perfect Closed Box Helpers ─────────────────────────────
box_line() {
  local text="${1:-}"
  local plain
  plain=$(printf "%b" "$text" | sed "s/\x1B\[[0-9;]*[a-zA-Z]//g")
  local len=${#plain}
  local pad=$(( 54 - len ))
  (( pad < 0 )) && pad=0
  local fill=""
  for (( i=0; i<pad; i++ )); do fill+=" "; done
  printf "${C1}│${N} %b%s ${C1}│${N}\n" "$text" "$fill"
}

banner() {
  clear
  echo -e ""
  echo -e "${C1}╭──────────────────────────────────────────────────────────╮${N}"
  box_line "  ${W}🎓  U D E M Y   C O U R S E   D O W N L O A D E R${N}      "
  box_line "      ${C2}v4.0  •  Created by Kadiri Emmanuel${N}                "
  echo -e "${C1}├──────────────────────────────────────────────────────────┤${N}"
}

sec() {
  local title="$1"
  local step="${2:-}"
  box_line ""
  if [[ -n "$step" ]]; then
    box_line "${C2}[ STEP ${step} ]${N}  ${W}${title}${N}"
  else
    box_line "${W}${title}${N}"
  fi
  box_line ""
}

card_end() {
  echo -e "${C1}╰──────────────────────────────────────────────────────────╯${N}"
  echo -e ""
}

ok()   { box_line "  ${G}✔${N}  ${W}$*${N}"; }
info() { box_line "  ${C1}➤${N}  ${D}$*${N}"; }
warn() { box_line "  ${Y}⚠${N}  ${Y}$*${N}"; }
err()  { box_line "  ${R}✘${N}  ${R}$*${N}"; }
die()  { err "$*"; card_end; exit 1; }
line() { echo -e "${C1}├──────────────────────────────────────────────────────────┤${N}"; }
br()   { box_line ""; }

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
      warn "Unsupported CPU arch ($arch). ffmpeg skipped — videos may not merge."
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
      warn "ffmpeg download failed. Videos will still download but won't be merged."
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
    box_line "    ${C1}[$i]${N}  $name"
    ((i++))
  done
  line; br
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
    br
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
  info "1. Open Udemy in your browser and go to your course."
  info "2. Copy the URL from your address bar and paste it below."
  br
  card_end

  while true; do
    ask COURSE_URL "Paste Udemy Course URL"

    if [[ "$COURSE_URL" == *"udemy.com/course/"* ]]; then
      if [[ "$COURSE_URL" =~ (https?://(www\.)?udemy\.com/course/[^/?#]+) ]]; then
        COURSE_URL="${BASH_REMATCH[1]}/learn/"
      fi
      break
    else
      echo -e "  ${R}✘  Invalid Udemy course URL. Must contain 'udemy.com/course/'${N}"
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

  box_line "  ${W}Video quality options:${N}"
  box_line "    ${C1}[1]${N}  Best available (Recommended)"
  box_line "    ${C1}[2]${N}  1080p Full HD"
  box_line "    ${C1}[3]${N}  720p HD (Smaller file size)"
  box_line "    ${C1}[4]${N}  480p SD (Low bandwidth)"
  line
  box_line "  ${W}Subtitles preference:${N}"
  box_line "    ${C1}[1]${N}  Both embedded in MP4 AND external .vtt"
  box_line "    ${C1}[2]${N}  Embedded in MP4 only"
  box_line "    ${C1}[3]${N}  Separate .vtt file only"
  box_line "    ${C1}[4]${N}  No subtitles"
  card_end

  ask OUTPUT_DIR "Save downloads to" "$OUTPUT_DIR"
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
  info "Validating login session & Cloudflare clearance tokens..."

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
    card_end
    return 0
  else
    br
    err "Session validation failed!"
    if grep -qi "403: Forbidden" "$TEST_LOG"; then
      warn "Udemy returned HTTP Error 403: Forbidden (Cloudflare bot check)."
      br
      info "Quick Fix (takes 10 seconds):"
      info "  1. Open your browser ($BROWSER) and visit https://www.udemy.com"
      info "  2. Click on any lecture in the course to refresh Cloudflare tokens."
      info "  3. Return here and press [1] to retry."
      br
    elif grep -qi "not free\|pay for it" "$TEST_LOG"; then
      err "This course is not enrolled or purchased on this Udemy account."
    else
      err "Error details: $(tail -n 1 "$TEST_LOG")"
    fi
    rm -f "$TEST_LOG"
    card_end

    local choice
    ask choice "Choose [1] Retry  [2] Switch Auth  [3] Exit" "1"
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
  box_line "  ${C1}•${N} ${W}Course URL  :${N} ${D}${COURSE_URL:0:36}...${N}"
  if [[ "$BROWSER" == "custom" ]]; then
    box_line "  ${C1}•${N} ${W}Auth Source :${N} ${D}cookies.txt → $COOKIES_FILE${N}"
  else
    box_line "  ${C1}•${N} ${W}Auth Source :${N} ${D}Browser → $BROWSER${N}"
  fi
  box_line "  ${C1}•${N} ${W}Video Quality:${N} ${D}$QUALITY${N}"
  box_line "  ${C1}•${N} ${W}Subtitles   :${N} ${D}$SUBTITLE_MODE${N}"
  box_line "  ${C1}•${N} ${W}Save Folder :${N} ${D}${OUTPUT_DIR:0:36}${N}"
  card_end

  local confirm
  ask confirm "Start course download now? [Y/n]" "y"
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
  banner
  sec "Live Download Progress Dashboard"
  local LOG="/tmp/udemy-dl-$$.log"
  local max_tries=3
  local try=1
  local exit_code=0

  info "Log audit file: $LOG"
  br

  # Graceful Ctrl+C
  trap 'br; warn "Download paused. Re-run script to resume — downloaded files are saved."; card_end; exit 130' INT

  while (( try <= max_tries )); do
    exit_code=0
    : > "$LOG"

    local lect_num="?" lect_total="?" lect_name="Initializing..."

    # Stream yt-dlp output through progress parser
    while IFS= read -r line; do
      echo "$line" >> "$LOG"

      # Progress bar line
      if [[ "$line" =~ PROG:[[:space:]]*([0-9.]+)%\|([^|]*)\|([^|]*) ]]; then
        local pct="${BASH_REMATCH[1]%.*}"
        local spd="${BASH_REMATCH[2]//[[:space:]]/}"
        local eta="${BASH_REMATCH[3]//[[:space:]]/}"
        [[ -z "$pct" || "$pct" == " " ]] && pct=0
        local fill=$(( pct / 5 )) empty=$(( 20 - fill ))
        local bar=""
        for (( i=0; i<fill;  i++ )); do bar+="█"; done
        for (( i=0; i<empty; i++ )); do bar+="░"; done

        printf "\r\033[K${C1}│${N}  ${C1}[%s/%s]${N} %3d%% [${G}%s${N}] ${C2}%-9s${N} │ ETA ${Y}%-5s${N} │ ${D}%.22s${N}" \
          "$lect_num" "$lect_total" "$pct" "$bar" "$spd" "$eta" "$lect_name"

      # Lecture counter
      elif [[ "$line" =~ \[download\]\ Downloading\ item\ ([0-9]+)\ of\ ([0-9]+) ]]; then
        lect_num="${BASH_REMATCH[1]}"
        lect_total="${BASH_REMATCH[2]}"
        lect_name="Fetching details..."
        printf "\r\033[K${C1}│${N}  ${Y}↓  Lecture %s/%s...${N}" "$lect_num" "$lect_total"

      # Capture lecture name from Destination line
      elif [[ "$line" =~ \[download\]\ Destination:\ .*/([^/]+)\.mp4$ ]]; then
        lect_name="${BASH_REMATCH[1]}"

      # Merger status
      elif [[ "$line" =~ \[Merger\]|\[ffmpeg\] ]]; then
        printf "\r\033[K${C1}│${N}  ${C2}⚙  Merging & Embedding: %.30s${N}" "$lect_name"

      # Catch fatal errors (not per-lecture skips)
      elif [[ "$line" =~ ^ERROR:.*unable\ to\ download\ webpage|^ERROR:.*HTTP\ Error\ 4 ]]; then
        printf "\n${C1}│${N}  ${R}✘  Fatal Error: %s${N}\n" "${line:7:80}"
        exit_code=1
      fi

    done < <(yt-dlp "${ARGS[@]}" 2>&1); local pipe_exit="${PIPESTATUS[0]:-0}"

    # If yt-dlp returned non-zero due to skipped non-video items (quizzes/articles),
    # but no true fatal errors occurred, treat the download as successful.
    if [[ "$pipe_exit" -ne 0 && "$exit_code" -eq 0 ]]; then
      if grep -qiE 'ERROR:.*unable to download webpage|ERROR:.*HTTP Error 403|ERROR:.*Forbidden' "$LOG"; then
        exit_code=1
      else
        exit_code=0
      fi
    fi

    # Check if we should retry (SSL / network drop)
    if [[ "$exit_code" -ne 0 ]]; then
      if grep -qiE 'ssl|eof|connection reset|network|timed? ?out|HTTP Error 5' "$LOG" 2>/dev/null; then
        br
        warn "Network drop detected on attempt $try/$max_tries."
        if (( try < max_tries )); then
          warn "Retrying download connection in 8 seconds..."
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
    banner
    box_line "  ${G}🎉  ALL LECTURES DOWNLOADED & MERGED SUCCESSFULLY!${N}"
    box_line ""
    box_line "  ${W}📁 Saved to  :${N} ${D}${OUTPUT_DIR:0:36}${N}"
    box_line "  ${W}👤 Author    :${N} ${C2}Kadiri Emmanuel${N}"
    box_line "  ${W}⚡ Status    :${N} ${G}Verified & Ready for Offline Playback${N}"
    card_end
  else
    banner
    err "Download process encountered errors."
    info "Log audit file saved in: $LOG"
    card_end
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


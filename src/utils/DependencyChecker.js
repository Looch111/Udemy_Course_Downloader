'use strict';

/**
 * DependencyChecker.js
 * Automatically checks system dependencies (python3, yt-dlp, ffmpeg).
 * Downloads missing standalone binaries to ./bin/ without requiring sudo or admin rights.
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { execSync, execFileSync } = require('child_process');
const axios = require('axios');
const chalk = require('chalk');
const logger = require('./logger');

class DependencyChecker {
  constructor() {
    this.binDir = path.join(process.cwd(), 'bin');
    this.isWindows = process.platform === 'win32';
    this.isMac = process.platform === 'darwin';
    this.isLinux = process.platform === 'linux';
  }

  /**
   * Run full dependency verification and auto-install missing tools.
   * @returns {Promise<{ytDlpPath: string, ffmpegPath: string, pythonPath: string}>}
   */
  async ensureDependencies() {
    await fs.ensureDir(this.binDir);

    console.log(chalk.bold.cyan('🩺 Checking system dependencies...'));

    const pythonPath = await this._ensurePython();
    const ytDlpPath  = await this._ensureYtDlp();
    const ffmpegPath = await this._ensureFfmpeg(pythonPath);

    console.log(chalk.green('✔  All core dependencies verified and ready!\n'));

    return { pythonPath, ytDlpPath, ffmpegPath };
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Check if a binary command exists in system PATH or local ./bin/
   */
  _commandExists(cmd) {
    // Check local ./bin/ first
    const localPath = path.join(this.binDir, this.isWindows ? `${cmd}.exe` : cmd);
    if (fs.existsSync(localPath)) {
      return localPath;
    }

    try {
      if (this.isWindows) {
        execSync(`where ${cmd}`, { stdio: 'ignore' });
      } else {
        execSync(`command -v ${cmd}`, { stdio: 'ignore' });
      }
      return cmd;
    } catch {
      return null;
    }
  }

  /**
   * Ensure Python 3 is installed.
   */
  async _ensurePython() {
    const pythonCmd = this._commandExists('python3') || this._commandExists('python');
    if (pythonCmd) {
      console.log(chalk.dim(`  ✔ Python 3     : Found (${pythonCmd})`));
      
      // Attempt auto-install of curl_cffi for Cloudflare TLS bypass on cloud servers
      try {
        execSync(`${pythonCmd} -c "import curl_cffi"`, { stdio: 'ignore' });
      } catch {
        try {
          console.log(chalk.yellow('  ⬇ Installing Cloudflare bypass helper (curl_cffi)...'));
          execSync(`${pythonCmd} -m pip install --break-system-packages -q curl_cffi`, { stdio: 'ignore' });
          console.log(chalk.green('  ✔ Cloudflare bypass helper installed!'));
        } catch { /* ignore if pip unavailable */ }
      }

      return pythonCmd;
    }

    logger.warn('Python 3 was not found on your system.');
    console.log(chalk.yellow('  ⚠ Python 3 is required by Udemy API Cloudflare fallback.'));
    console.log(chalk.yellow('    Please install Python 3 using your system package manager (e.g. sudo apt install python3).\n'));
    return 'python3';
  }

  /**
   * Ensure yt-dlp binary is installed.
   */
  async _ensureYtDlp() {
    const found = this._commandExists('yt-dlp');
    if (found) {
      console.log(chalk.dim(`  ✔ yt-dlp       : Found (${found})`));
      return found;
    }

    const localPath = path.join(this.binDir, this.isWindows ? 'yt-dlp.exe' : 'yt-dlp');
    console.log(chalk.yellow('  ⬇ yt-dlp is missing. Auto-downloading standalone binary to ./bin/yt-dlp...'));

    let downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
    if (this.isWindows) {
      downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
    } else if (this.isMac) {
      downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos';
    }

    await this._downloadFile(downloadUrl, localPath);

    if (!this.isWindows) {
      await fs.chmod(localPath, 0o755);
    }

    console.log(chalk.green(`  ✔ yt-dlp downloaded and installed to ${localPath}`));
    return localPath;
  }

  /**
   * Ensure ffmpeg binary is installed.
   */
  async _ensureFfmpeg(pythonCmd = 'python3') {
    const found = this._commandExists('ffmpeg');
    if (found) {
      console.log(chalk.dim(`  ✔ ffmpeg       : Found (${found})`));
      return found;
    }

    const localPath = path.join(this.binDir, this.isWindows ? 'ffmpeg.exe' : 'ffmpeg');
    console.log(chalk.yellow('  ⬇ ffmpeg is missing. Auto-downloading standalone binary to ./bin/ffmpeg...'));

    let zipUrl = 'https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v4.4.1/ffmpeg-4.4.1-linux-64.zip';
    if (this.isWindows) {
      zipUrl = 'https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v4.4.1/ffmpeg-4.4.1-win-64.zip';
    } else if (this.isMac) {
      zipUrl = 'https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v4.4.1/ffmpeg-4.4.1-osx-64.zip';
    }

    const zipPath = path.join(os.tmpdir(), `ffmpeg-download-${Date.now()}.zip`);

    try {
      await this._downloadFile(zipUrl, zipPath);

      // Extract zip using python built-in zipfile or unzip command
      try {
        execSync(`${pythonCmd} -m zipfile -e "${zipPath}" "${this.binDir}"`, { stdio: 'ignore' });
      } catch {
        if (this.isWindows) {
          execSync(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${this.binDir}' -Force"`, { stdio: 'ignore' });
        } else {
          execSync(`unzip -o "${zipPath}" -d "${this.binDir}"`, { stdio: 'ignore' });
        }
      }

      if (!this.isWindows && fs.existsSync(localPath)) {
        await fs.chmod(localPath, 0o755);
      }

      console.log(chalk.green(`  ✔ ffmpeg downloaded and installed to ${localPath}`));
      return localPath;
    } catch (err) {
      logger.warn(`Failed to auto-download ffmpeg: ${err.message}`);
      console.log(chalk.yellow('  ⚠ Subtitle embedding requires ffmpeg. You can install it via: sudo apt install ffmpeg'));
      return 'ffmpeg';
    } finally {
      await fs.remove(zipPath).catch(() => {});
    }
  }

  /**
   * Helper to download file with progress stream.
   */
  async _downloadFile(url, destPath) {
    const response = await axios({
      method: 'GET',
      url,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64)',
      },
    });

    const writer = fs.createWriteStream(destPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  }
}

module.exports = DependencyChecker;

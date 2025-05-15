'use strict';

/* Required Dependencies */
const fs = require('fs-extra');
const unzipper = require('unzipper');
const archiver = require('archiver');
const path = require('path');
const { Events } = require('./../util/Constants');
const BaseAuthStrategy = require('./BaseAuthStrategy');

class RemoteAuth extends BaseAuthStrategy {
     constructor({ clientId, dataPath, store, backupSyncIntervalMs = 300000, rmMaxRetries } = {}) {
        if (!store) throw new Error('Remote database store is required.');

        super();

        const idRegex = /^[-_\w]+$/i;
        if (clientId && !idRegex.test(clientId)) {
            throw new Error('Invalid clientId. Only alphanumeric characters, underscores and hyphens are allowed.');
        }

        this.store = store;
        this.clientId = clientId;
        this.backupSyncIntervalMs = backupSyncIntervalMs;
        this.dataPath = path.resolve(dataPath || './.wwebjs_auth/');
        this.tempDir = `${this.dataPath}/wwebjs_temp_session_${this.clientId}`;
        
        // Only the absolute essential files
        this.criticalFiles = [{
            src: 'Default/Cookies',
            dest: 'Default/Cookies'
        }, {
            src: 'Default/IndexedDB/https_web.whatsapp.com_0.indexeddb.leveldb/CURRENT',
            dest: 'Default/whatsapp_db/CURRENT'
        }, {
            src: 'Default/IndexedDB/https_web.whatsapp.com_0.indexeddb.leveldb/MANIFEST-000001',
            dest: 'Default/whatsapp_db/MANIFEST-000001'
        }];
        
        // Find and include only the most recent .ldb file containing the authentication token
        this.ldbFilePattern = /[0-9]{6}\.ldb$/;
        
        this.rmMaxRetries = rmMaxRetries ?? 4;
        
        // Set compression to maximum and use store level optimization (no compression for already compressed data)
        this.compressionOptions = {
            zlib: { level: 9 }, // Maximum compression
            store: true // Don't re-compress already compressed files
        };
    }

    async beforeBrowserInitialized() {
        const puppeteerOpts = this.client.options.puppeteer;
        const sessionDirName = this.clientId ? `${this.clientId}` : 'Micro';
        const dirPath = path.join(this.dataPath, sessionDirName);

        if (puppeteerOpts.userDataDir && puppeteerOpts.userDataDir !== dirPath) {
            throw new Error('MicroAuth is not compatible with a user-supplied userDataDir.');
        }
        
        this.userDataDir = dirPath;
        this.sessionName = sessionDirName;
        
        await this.extractMinimalSession();
        
        this.client.options.puppeteer = {
            ...puppeteerOpts,
            userDataDir: dirPath
        };
    }
    
    async logout() {
        await this.disconnect();
    }
    
    async destroy() {
        clearInterval(this.backupSync);
    }

    async disconnect() {
        await this.deleteRemoteSession();
        const pathExists = await this.isValidPath(this.userDataDir);
        if (pathExists) {
            await fs.promises.rm(this.userDataDir, {
                recursive: true,
                force: true,
                maxRetries: this.rmMaxRetries,
            }).catch(() => {});
        }
        clearInterval(this.backupSync);
    }
    
    async afterAuthReady() {
        const sessionExists = await this.store.sessionExists({ session: this.sessionName });
        if (!sessionExists) {
            // Minimal delay before first backup
            await this.delay(15000);
            await this.storeMicroSession({ emit: true });
        }
        this.backupSync = setInterval(async () => {
            await this.storeMicroSession();
        }, this.backupSyncIntervalMs);
    }
    
    async storeMicroSession(options) {
        const pathExists = await this.isValidPath(this.userDataDir);
        if (pathExists) {
            await this.compressMicroSessionData();
            await this.store.save({ session: this.sessionName });
            await fs.promises.unlink(`${this.sessionName}.zip`).catch(() => {});
            await fs.promises.rm(`${this.tempDir}`, {
                recursive: true,
                force: true,
                maxRetries: this.rmMaxRetries,
            }).catch(() => {});
            if (options && options.emit) this.client.emit(Events.REMOTE_SESSION_SAVED);
        }
    }

    async extractMinimalSession() {
        const pathExists = await this.isValidPath(this.userDataDir);
        const compressedSessionPath = `${this.sessionName}.zip`;
        const sessionExists = await this.store.sessionExists({ session: this.sessionName });
        
        if (pathExists) {
            await fs.promises.rm(this.userDataDir, {
                recursive: true,
                force: true,
                maxRetries: this.rmMaxRetries,
            }).catch(() => {});
        }
        
        if (sessionExists) {
            await this.store.extract({ session: this.sessionName, path: compressedSessionPath });
            await this.unCompressSession(compressedSessionPath);
        } else {
            fs.mkdirSync(this.userDataDir, { recursive: true });
        }
    }

    async deleteRemoteSession() {
        const sessionExists = await this.store.sessionExists({ session: this.sessionName });
        if (sessionExists) await this.store.delete({ session: this.sessionName });
    }

    async findLatestLdbFile() {
        const indexedDBPath = path.join(this.userDataDir, 'Default/IndexedDB/https_web.whatsapp.com_0.indexeddb.leveldb');
        if (!await this.isValidPath(indexedDBPath)) return null;
        
        try {
            const files = await fs.promises.readdir(indexedDBPath);
            
            // Get all .ldb files and sort them by modified time (newest first)
            const ldbFiles = files.filter(file => this.ldbFilePattern.test(file));
            
            if (ldbFiles.length === 0) return null;
            
            const fileStats = await Promise.all(
                ldbFiles.map(async file => {
                    const filePath = path.join(indexedDBPath, file);
                    const stats = await fs.promises.stat(filePath);
                    return { file, mtime: stats.mtime };
                })
            );
            
            // Sort by modified time (newest first)
            fileStats.sort((a, b) => b.mtime - a.mtime);
            
            // Return the newest file
            return {
                src: `Default/IndexedDB/https_web.whatsapp.com_0.indexeddb.leveldb/${fileStats[0].file}`,
                dest: `Default/whatsapp_db/${fileStats[0].file}`
            };
        } catch (err) {
            return null;
        }
    }

    async compressMicroSessionData() {
        const archive = archiver('zip', this.compressionOptions);
        const stream = fs.createWriteStream(`${this.sessionName}.zip`);
        
        // Clean temp directory
        if (await this.isValidPath(this.tempDir)) {
            await fs.promises.rm(this.tempDir, {
                recursive: true,
                force: true,
                maxRetries: this.rmMaxRetries,
            }).catch(() => {});
        }
        
        // Create minimal structure
        await fs.promises.mkdir(path.join(this.tempDir, 'Default'), { recursive: true });
        await fs.promises.mkdir(path.join(this.tempDir, 'Default/whatsapp_db'), { recursive: true });

        // Find the latest .ldb file that likely contains the session token
        const latestLdbFile = await this.findLatestLdbFile();
        
        // Copy only critical files
        const filesToCopy = [...this.criticalFiles];
        if (latestLdbFile) {
            filesToCopy.push(latestLdbFile);
        }
        
        for (const file of filesToCopy) {
            const sourcePath = path.join(this.userDataDir, file.src);
            const destPath = path.join(this.tempDir, file.dest);
            
            if (await this.isValidPath(sourcePath)) {
                // Ensure the destination directory exists
                await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
                await fs.copy(sourcePath, destPath).catch(() => {});
            }
        }
        
        return new Promise((resolve, reject) => {
            archive
                .directory(this.tempDir, false)
                .on('error', err => reject(err))
                .pipe(stream);

            stream.on('close', () => resolve());
            archive.finalize();
        });
    }

    async unCompressSession(compressedSessionPath) {
        const stream = fs.createReadStream(compressedSessionPath);
        await new Promise((resolve, reject) => {
            stream.pipe(unzipper.Extract({ path: this.userDataDir }))
                .on('error', err => reject(err))
                .on('finish', () => resolve());
        });
        await fs.promises.unlink(compressedSessionPath).catch(() => {});
        
        // Ensure the WhatsApp IndexedDB directory structure exists
        const indexedDBPath = path.join(this.userDataDir, 'Default/IndexedDB/https_web.whatsapp.com_0.indexeddb.leveldb');
        await fs.promises.mkdir(indexedDBPath, { recursive: true });
        
        // Move files from our custom structure back to the expected locations
        const whatsappDbPath = path.join(this.userDataDir, 'Default/whatsapp_db');
        if (await this.isValidPath(whatsappDbPath)) {
            try {
                const files = await fs.promises.readdir(whatsappDbPath);
                for (const file of files) {
                    const srcPath = path.join(whatsappDbPath, file);
                    const destPath = path.join(indexedDBPath, file);
                    await fs.copy(srcPath, destPath).catch(() => {});
                }
            } catch (err) {
                // Ignore errors
            }
        }
    }

    async isValidPath(p) {
        try {
            await fs.promises.access(p);
            return true;
        } catch {
            return false;
        }
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}


module.exports = RemoteAuth;
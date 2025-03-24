import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import chalk from 'chalk';
import fetch from 'node-fetch';  // Ensure node-fetch is installed

class RootRepo {
    constructor(repoPath = process.cwd()) {
        this.repoPath = path.join(repoPath, '.root');
        this.objectsPath = path.join(this.repoPath, 'objects');
        this.headPath = path.join(this.repoPath, 'HEAD');
        this.indexPath = path.join(this.repoPath, 'index');
        this.branchesPath = path.join(this.repoPath, 'branches');
        this.configPath = path.join(this.repoPath, 'config');
        this.ready = this.init();
    }

    async init() {
        await fs.mkdir(this.objectsPath, { recursive: true });
        await fs.mkdir(this.branchesPath, { recursive: true });

        try {
            await fs.writeFile(this.headPath, 'main', { flag: 'wx' });
            await fs.writeFile(path.join(this.branchesPath, 'main'), '', { flag: 'wx' });
            await fs.writeFile(this.indexPath, JSON.stringify([]), { flag: 'wx' });
            await fs.writeFile(this.configPath, JSON.stringify({ remote: null }), { flag: 'wx' });
            console.log(chalk.green("Initialized .root repository"));
        } catch {
            console.log(chalk.yellow("Repository already initialized"));
        }
    }

    async ensureRepoExists() {
        try {
            await fs.access(this.repoPath);
        } catch {
            console.log(chalk.red("Not a RootRepo repository. Run 'rootrepo init' first."));
            process.exit(1);
        }
    }

    hashObject(content) {
        return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
    }

    async add(fileToBeAdded) {
        await this.ensureRepoExists();
        try {
            const fileData = await fs.readFile(fileToBeAdded, 'utf-8');
            const fileHash = this.hashObject(fileData);
            const objectDir = path.join(this.objectsPath, fileHash.substring(0, 2));
            const objectFilePath = path.join(objectDir, fileHash.substring(2));

            await fs.mkdir(objectDir, { recursive: true });
            await fs.writeFile(objectFilePath, fileData);
            await this.updateStagingArea(fileToBeAdded, fileHash);
            console.log(chalk.green(`Added ${fileToBeAdded}`));
        } catch {
            console.log(chalk.red(`Error adding file: ${fileToBeAdded}`));
        }
    }

    async updateStagingArea(filePath, fileHash) {
        const index = JSON.parse(await fs.readFile(this.indexPath, 'utf-8'));
        index.push({ path: filePath, hash: fileHash });
        await fs.writeFile(this.indexPath, JSON.stringify(index));
    }

    async commit(message) {
        await this.ensureRepoExists();
        const index = JSON.parse(await fs.readFile(this.indexPath, 'utf-8'));
        if (index.length === 0) {
            console.log(chalk.yellow("Nothing to commit"));
            return;
        }

        const parentCommit = await this.getCurrentHead();
        const commitData = {
            timeStamp: new Date().toISOString(),
            message,
            files: index,
            parent: parentCommit,
        };
        const commitHash = this.hashObject(JSON.stringify(commitData));
        const commitDir = path.join(this.objectsPath, commitHash.substring(0, 2));
        const commitPath = path.join(commitDir, commitHash.substring(2));

        await fs.mkdir(commitDir, { recursive: true });
        await fs.writeFile(commitPath, JSON.stringify(commitData));
        await fs.writeFile(this.headPath, commitHash);
        await fs.writeFile(this.indexPath, JSON.stringify([]));

        console.log(chalk.green(`Committed with hash: ${commitHash}`));
    }

    async getCurrentHead() {
        try {
            return (await fs.readFile(this.headPath, 'utf-8')).trim();
        } catch {
            return null;
        }
    }

    async log() {
        await this.ensureRepoExists();
        let currentCommitHash = await this.getCurrentHead();
        while (currentCommitHash) {
            const commitData = await this.getCommitData(currentCommitHash);
            if (!commitData) break;
            console.log(chalk.blue(`\nCommit: ${currentCommitHash}\nDate: ${commitData.timeStamp}\nMessage: ${commitData.message}`));
            currentCommitHash = commitData.parent;
        }
    }

    async status() {
        await this.ensureRepoExists();
        const index = JSON.parse(await fs.readFile(this.indexPath, 'utf-8'));
        if (index.length === 0) {
            console.log(chalk.yellow("No changes staged for commit."));
        } else {
            console.log(chalk.green("Staged files:"));
            index.forEach(file => console.log(`  ${file.path}`));
        }
    }

    async reset(fileToBeRemoved) {
        await this.ensureRepoExists();
        let index = JSON.parse(await fs.readFile(this.indexPath, 'utf-8'));
        const filteredIndex = index.filter(file => file.path !== fileToBeRemoved);
        if (index.length === filteredIndex.length) {
            console.log(chalk.yellow(`${fileToBeRemoved} is not staged.`));
        } else {
            await fs.writeFile(this.indexPath, JSON.stringify(filteredIndex));
            console.log(chalk.green(`Unstaged ${fileToBeRemoved}`));
        }
    }

    async setRemote(url) {
        await this.ensureRepoExists();
        await fs.writeFile(this.configPath, JSON.stringify({ remote: url }));
        console.log(chalk.green(`Remote repository set to ${url}`));
    }

    async push() {
        await this.ensureRepoExists();

        let remoteUrl;
        try {
            const config = JSON.parse(await fs.readFile(this.configPath, 'utf-8'));
            remoteUrl = config.remote;
        } catch {
            console.log(chalk.red("No remote repository set. Use 'rootrepo set-remote <url>' first."));
            return;
        }

        if (!remoteUrl) {
            console.log(chalk.red("Remote repository not configured. Use 'rootrepo set-remote <url>' first."));
            return;
        }

        const latestCommit = await this.getCurrentHead();
        if (!latestCommit) {
            console.log(chalk.yellow("Nothing to push."));
            return;
        }

        const commitData = await this.getCommitData(latestCommit);
        if (!commitData) {
            console.log(chalk.red("Failed to retrieve commit data."));
            return;
        }

        try {
            const response = await fetch(`${remoteUrl}/push`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ commitHash: latestCommit, commitData })
            });

            if (response.ok) {
                console.log(chalk.green("Push successful!"));
            } else {
                console.log(chalk.red("Push failed."));
            }
        } catch (error) {
            console.log(chalk.red(`Error pushing to remote: ${error.message}`));
        }
    }

    async getCommitData(commitHash) {
        const commitPath = path.join(this.objectsPath, commitHash.substring(0, 2), commitHash.substring(2));
        try {
            const commitContent = await fs.readFile(commitPath, 'utf-8');
            return JSON.parse(commitContent);
        } catch {
            console.log(chalk.red(`Commit ${commitHash} not found or invalid.`));
            return null;
        }
    }
}

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const rootRepo = new RootRepo();
    await rootRepo.ready;

    switch (command) {
        case 'init': break;
        case 'add': await rootRepo.add(args[1]); break;
        case 'commit': await rootRepo.commit(args.slice(1).join(" ")); break;
        case 'log': await rootRepo.log(); break;
        case 'status': await rootRepo.status(); break;
        case 'reset': await rootRepo.reset(args[1]); break;
        case 'set-remote': await rootRepo.setRemote(args[1]); break;
        case 'push': await rootRepo.push(); break;
        default: console.log(chalk.red("Unknown command. Run 'rootrepo help'.")); break;
    }
}

main();

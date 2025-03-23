import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

class RootRepo {

    constructor(repoPath = '.') {
        // Define the main .root directory where repository metadata will be stored
        this.repoPath = path.join(repoPath, '.root');

        // Path to store all versioned objects (blobs, commits, trees, etc.)
        this.objectsPath = path.join(this.repoPath, 'objects'); // .root/objects

        // Path to the HEAD file, which points to the current branch or commit
        this.headPath = path.join(this.repoPath, 'HEAD'); // .root/HEAD

        // Path to the index (staging area), which tracks changes before committing
        this.indexPath = path.join(this.repoPath, 'index'); // .root/index

        // Initialize the repository (create necessary directories and files)
        this.init().then(() => {
            console.log("RootRepo initialized");
        }).catch((error) => {
            console.error("Failed to initialize RootRepo:", error.message);
        });
    }

    async init() {
        // Ensure the objects directory exists
        await fs.mkdir(this.objectsPath, { recursive: true });

        try {
            // Create an empty HEAD file if it does not exist
            await fs.writeFile(this.headPath, '', { flag: 'wx' }); // wx: open for writing, error if file exists

            // Create an empty index file if it does not exist
            await fs.writeFile(this.indexPath, JSON.stringify([]), { flag: 'wx' });

            console.log("Initialized the .root folder");
        } catch (error) {
            console.log("Already initialized the .root folder");
        }

        // Ensure the index file exists (create an empty one if missing)
        try {
            await fs.access(this.indexPath); // Check if index exists
        } catch (error) {
            await fs.writeFile(this.indexPath, JSON.stringify([])); // Create if missing
        }
    }

    hashObject(content) {
        // Generate a SHA-256 hash for the given content
        return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
    }

    async add(fileToBeAdded) {
        try {
            // Ensure the file exists before proceeding
            await fs.access(fileToBeAdded);

            // Read file content
            const fileData = await fs.readFile(fileToBeAdded, { encoding: 'utf-8' });

            // Generate hash for the file content
            const fileHash = this.hashObject(fileData);

            console.log(`Hash for ${fileToBeAdded}: ${fileHash}`);

            // Create a directory based on the first two characters of the hash
            const objectDir = path.join(this.objectsPath, fileHash.substring(0, 2));
            const objectFilePath = path.join(objectDir, fileHash.substring(2));

            // Ensure the directory exists
            await fs.mkdir(objectDir, { recursive: true });

            // Write the file content only if it is not already stored
            try {
                await fs.writeFile(objectFilePath, fileData, { flag: 'wx' });
            } catch (error) {
                if (error.code !== 'EEXIST') throw error; // Ignore if file already exists
            }

            // Update staging area (index) with file information
            await this.updateStagingArea(fileToBeAdded, fileHash);
            console.log(`Added ${fileToBeAdded}`);
        } catch (error) {
            console.error(`Error adding ${fileToBeAdded}: ${error.message}`);
        }
    }

    async updateStagingArea(filePath, fileHash) {
        // Read the current index (staging area) from the index file
        const index = JSON.parse(await fs.readFile(this.indexPath, { encoding: 'utf-8' }));

        // Check if file still exists, otherwise remove it from the index
        try {
            await fs.access(filePath);
            index.push({ path: filePath, hash: fileHash });
        } catch {
            console.log(`File ${filePath} deleted, removing from staging.`);
        }

        // Write updated index back to the index file
        await fs.writeFile(this.indexPath, JSON.stringify(index, null, 2));
    }

    async commit(message) {
        if (!message || !message.trim()) {
            console.log("Commit message cannot be empty.");
            return;
        }

        // Read the current index (staging area)
        const index = JSON.parse(await fs.readFile(this.indexPath, { encoding: 'utf-8' }));

        // If nothing is staged, do not proceed with commit
        if (index.length === 0) {
            console.log("Nothing to commit.");
            return;
        }

        // Get the hash of the latest commit
        const parentCommit = await this.getCurrentHead();

        // If the new commit has the same contents as the last commit, skip it
        if (parentCommit) {
            const parentCommitData = JSON.parse(
                await fs.readFile(path.join(this.objectsPath, parentCommit.substring(0, 2), parentCommit.substring(2)), { encoding: 'utf-8' })
            );

            if (JSON.stringify(parentCommitData.files) === JSON.stringify(index)) {
                console.log("No changes since last commit. Skipping commit.");
                return;
            }
        }

        // Create a commit object containing metadata and file changes
        const commitData = {
            timeStamp: new Date().toISOString(),
            message,
            files: index,
            parent: parentCommit
        };

        // Generate a hash for the commit
        const commitHash = this.hashObject(JSON.stringify(commitData));

        // Create a directory based on the first two characters of the commit hash
        const commitDir = path.join(this.objectsPath, commitHash.substring(0, 2));
        const commitPath = path.join(commitDir, commitHash.substring(2));

        // Store the commit data in the object storage
        await fs.mkdir(commitDir, { recursive: true });
        await fs.writeFile(commitPath, JSON.stringify(commitData, null, 2));

        // Update HEAD with the new commit hash
        await fs.writeFile(this.headPath, commitHash);

        // Clear the staging area after committing
        await fs.writeFile(this.indexPath, JSON.stringify([]));

        console.log(`Committed with hash: ${commitHash}`);
    }

    async getCurrentHead() {
        try {
            // Read the HEAD file to get the latest commit hash
            const headContent = await fs.readFile(this.headPath, { encoding: 'utf-8' });
            return headContent.trim() || null; // Return null if HEAD is empty
        } catch (error) {
            return null; // Return null if HEAD file does not exist
        }
    }
}

// Run the script to initialize the repository and perform operations
(async () => {
    const rootRepo = new RootRepo(); // Initialize repository

    await rootRepo.add('sample.txt'); // Add a file to staging area

    await rootRepo.commit('Initial commit'); // Commit changes
})();
